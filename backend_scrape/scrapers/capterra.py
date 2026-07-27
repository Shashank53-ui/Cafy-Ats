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

BASE_URL = "https://www.capterra.com/applicant-tracking-software/"


def _extract_max_page(html: str) -> int:
    pages = [int(x) for x in re.findall(r"[?&]page=(\d+)", html)]
    return max(pages) if pages else 1


def _walk(node: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        found.append(node)
        for value in node.values():
            found.extend(_walk(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(_walk(item))
    return found


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_json(soup: BeautifulSoup) -> list[ATSRecord]:
    records: list[ATSRecord] = []
    for script in soup.select("script"):
        content = script.get_text(strip=True)
        if not content:
            continue

        if script.get("type") == "application/ld+json":
            payloads = [content]
        else:
            payloads = []
            if "__NEXT_DATA__" in content or "software" in content.lower():
                brace_start = content.find("{")
                brace_end = content.rfind("}")
                if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
                    payloads.append(content[brace_start : brace_end + 1])

        for raw in payloads:
            try:
                data = json.loads(raw)
            except Exception:  # noqa: BLE001
                continue

            for node in _walk(data):
                name = node.get("name") if isinstance(node, dict) else None
                url = node.get("url") if isinstance(node, dict) else None
                vendor = None
                if not isinstance(name, str):
                    continue
                name = name.strip()
                if not name or len(name) > 120:
                    continue

                if isinstance(node, dict):
                    for key in ("vendor", "company", "brand", "publisher", "organization"):
                        value = node.get(key)
                        if isinstance(value, str) and value.strip():
                            vendor = value.strip()
                            break
                        if isinstance(value, dict):
                            nested_name = value.get("name")
                            if isinstance(nested_name, str) and nested_name.strip():
                                vendor = nested_name.strip()
                                break

                rating = None
                aggregate = node.get("aggregateRating") if isinstance(node, dict) else None
                if isinstance(aggregate, dict):
                    rating = _to_float(aggregate.get("ratingValue"))

                if isinstance(url, str) and url.startswith("/"):
                    url = urljoin("https://www.capterra.com", url)

                records.append(
                    ATSRecord(
                        name=name,
                        vendor=vendor,
                        website=url if isinstance(url, str) else None,
                        source=["capterra"],
                        capterra_rating=rating,
                    )
                )

    return records


def _parse_cards(soup: BeautifulSoup) -> list[ATSRecord]:
    records: list[ATSRecord] = []
    links = soup.select("a[href*='/p/'], a[href*='capterra.com/p/']")

    for link in links:
        name = link.get_text(" ", strip=True)
        if not name or len(name) > 120:
            continue

        href = link.get("href")
        if not isinstance(href, str):
            continue

        website = urljoin("https://www.capterra.com", href)
        card_text = link.parent.get_text(" ", strip=True) if link.parent else name

        rating_match = re.search(r"\b([0-5](?:\.\d)?)\b", card_text)
        vendor = None
        vendor_match = re.search(r"by\s+([A-Za-z0-9&.,'\- ]{2,80})", card_text, flags=re.IGNORECASE)
        if vendor_match:
            vendor = vendor_match.group(1).strip(" .,-")

        records.append(
            ATSRecord(
                name=name,
                vendor=vendor,
                website=website,
                source=["capterra"],
                capterra_rating=_to_float(rating_match.group(1)) if rating_match else None,
            )
        )

    return records


def _parse_page(html: str) -> list[ATSRecord]:
    soup = BeautifulSoup(html, "html.parser")
    candidates = [*_parse_json(soup), *_parse_cards(soup)]

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
        first_html = await fetch_html(client, BASE_URL, verbose=verbose)
        if not first_html:
            return []

        all_records = _parse_page(first_html)
        max_page = _extract_max_page(first_html)

        async def fetch_page(page_num: int) -> list[ATSRecord]:
            separator = "&" if "?" in BASE_URL else "?"
            html = await fetch_html(client, f"{BASE_URL}{separator}page={page_num}", verbose=verbose)
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
        print(f"[capterra] fetched {len(merged)} records")

    return list(merged.values())
