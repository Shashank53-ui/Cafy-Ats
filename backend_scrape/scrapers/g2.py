from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from ..dedup import normalize_name
from ..models import ATSRecord
from .common import fetch_html

BASE_URL = "https://www.g2.com/categories/applicant-tracking-system"


def _extract_max_page(html: str) -> int:
    pages = [int(x) for x in re.findall(r"[?&]page=(\d+)", html)]
    return max(pages) if pages else 1


def _collect_json_nodes(node: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        found.append(node)
        for value in node.values():
            found.extend(_collect_json_nodes(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(_collect_json_nodes(item))
    return found


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _parse_json_ld(soup: BeautifulSoup) -> list[ATSRecord]:
    records: list[ATSRecord] = []

    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.get_text(strip=True)
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue

        for node in _collect_json_nodes(payload):
            kind = str(node.get("@type", "")).lower()
            if kind not in {"product", "softwareapplication"}:
                continue
            name = str(node.get("name", "")).strip()
            if not name:
                continue

            brand = node.get("brand")
            vendor = None
            if isinstance(brand, dict):
                vendor = brand.get("name")
            elif isinstance(brand, str):
                vendor = brand

            rating_obj = node.get("aggregateRating", {})
            rating = _to_float(rating_obj.get("ratingValue") if isinstance(rating_obj, dict) else None)
            reviews = _to_int(rating_obj.get("ratingCount") if isinstance(rating_obj, dict) else None)

            url = node.get("url")
            if isinstance(url, str) and url.startswith("/"):
                url = urljoin("https://www.g2.com", url)

            records.append(
                ATSRecord(
                    name=name,
                    vendor=vendor,
                    website=url if isinstance(url, str) else None,
                    source=["g2"],
                    g2_rating=rating,
                    g2_reviews=reviews,
                )
            )

    return records


def _parse_cards(soup: BeautifulSoup) -> list[ATSRecord]:
    records: list[ATSRecord] = []
    for card in soup.select("article, div"):
        title_node = card.select_one("h2 a, h3 a, a[data-testid*='product'], a[href*='/products/']")
        if not title_node:
            continue
        name = title_node.get_text(" ", strip=True)
        if not name or len(name) > 120:
            continue

        href = title_node.get("href")
        website = None
        if isinstance(href, str):
            website = urljoin("https://www.g2.com", href)

        text_blob = card.get_text(" ", strip=True)
        rating_match = re.search(r"\b([0-5](?:\.\d)?)\b", text_blob)
        reviews_match = re.search(r"([\d,]+)\s+reviews", text_blob, flags=re.IGNORECASE)

        records.append(
            ATSRecord(
                name=name,
                website=website,
                source=["g2"],
                g2_rating=_to_float(rating_match.group(1)) if rating_match else None,
                g2_reviews=_to_int(reviews_match.group(1).replace(",", "")) if reviews_match else None,
            )
        )

    return records


def _parse_page(html: str) -> list[ATSRecord]:
    soup = BeautifulSoup(html, "html.parser")
    candidates = [*_parse_json_ld(soup), *_parse_cards(soup)]

    deduped: dict[str, ATSRecord] = {}
    for rec in candidates:
        key = normalize_name(rec.name)
        if not key:
            continue
        if key not in deduped:
            deduped[key] = rec
        else:
            deduped[key].merge_from(rec)

    return list(deduped.values())


async def scrape(verbose: bool = False) -> list[ATSRecord]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        first_url = f"{BASE_URL}?page=1"
        first_html = await fetch_html(client, first_url, verbose=verbose)
        if not first_html:
            return []

        all_records = _parse_page(first_html)
        max_page = _extract_max_page(first_html)

        async def fetch_page(page_num: int) -> list[ATSRecord]:
            html = await fetch_html(client, f"{BASE_URL}?page={page_num}", verbose=verbose)
            if not html:
                return []
            return _parse_page(html)

        if max_page > 1:
            semaphore = asyncio.Semaphore(4)

            async def guarded(page_num: int) -> list[ATSRecord]:
                async with semaphore:
                    return await fetch_page(page_num)

            tasks = [guarded(p) for p in range(2, max_page + 1)]
            for batch_start in range(0, len(tasks), 8):
                batch = tasks[batch_start : batch_start + 8]
                pages = await asyncio.gather(*batch)
                for items in pages:
                    all_records.extend(items)
        else:
            empty_streak = 0
            for page in range(2, 31):
                page_records = await fetch_page(page)
                if not page_records:
                    empty_streak += 1
                    if empty_streak >= 2:
                        break
                else:
                    empty_streak = 0
                    all_records.extend(page_records)

    merged: dict[str, ATSRecord] = {}
    for rec in all_records:
        key = normalize_name(rec.name)
        if not key:
            continue
        if key not in merged:
            merged[key] = rec
        else:
            merged[key].merge_from(rec)

    if verbose:
        print(f"[g2] fetched {len(merged)} records")

    return list(merged.values())
