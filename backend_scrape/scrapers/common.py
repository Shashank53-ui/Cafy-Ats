from __future__ import annotations

import asyncio
import random

import httpx

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
]


async def fetch_html(
    client: httpx.AsyncClient,
    url: str,
    *,
    use_playwright_fallback: bool = True,
    verbose: bool = False,
) -> str:
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    for attempt in range(1, 4):
        await asyncio.sleep(random.uniform(1.0, 2.0))
        try:
            response = await client.get(url, headers=headers)
            if response.status_code == 200 and response.text.strip():
                return response.text
            if verbose:
                print(f"[warn] non-200 or empty response ({response.status_code}) for {url}")
        except Exception as exc:  # noqa: BLE001
            if verbose:
                print(f"[warn] request failed for {url} (attempt {attempt}): {exc}")

    if use_playwright_fallback:
        return await fetch_with_playwright(url, verbose=verbose)

    return ""


async def fetch_with_playwright(url: str, *, verbose: bool = False) -> str:
    try:
        from playwright.async_api import async_playwright
    except Exception:  # noqa: BLE001
        if verbose:
            print("[warn] playwright not installed; skipping JS fallback")
        return ""

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                locale="en-US",
            )
            page = await context.new_page()
            await page.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                """
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(2000)
            content = await page.content()
            await browser.close()
            return content
    except Exception as exc:  # noqa: BLE001
        if verbose:
            print(f"[warn] playwright fallback failed for {url}: {exc}")
        return ""
