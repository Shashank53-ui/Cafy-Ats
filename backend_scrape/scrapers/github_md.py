from __future__ import annotations

import re

import httpx

from ..models import ATSRecord

AWESOME_ATS_URL = "https://raw.githubusercontent.com/bormaxi8080/awesome-ats/main/README.md"


def _parse_markdown_links(markdown_text: str) -> list[ATSRecord]:
    pattern = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
    records: list[ATSRecord] = []

    for name, url in pattern.findall(markdown_text):
        cleaned_name = name.strip()
        if not cleaned_name:
            continue
        records.append(
            ATSRecord(
                name=cleaned_name,
                website=url.strip(),
                source=["github"],
            )
        )

    return records


async def scrape(verbose: bool = False) -> list[ATSRecord]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(AWESOME_ATS_URL)
        response.raise_for_status()

    records = _parse_markdown_links(response.text)
    if verbose:
        print(f"[github] parsed {len(records)} links")
    return records
