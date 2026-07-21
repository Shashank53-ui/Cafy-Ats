# Custom ATS Scraper Documentation

This document tracks the implementation of bespoke (custom) job scrapers for companies whose career pages cannot be parsed by standard ATS fetchers (e.g., Greenhouse, Lever) or generic HTML scrapers.

## Architecture Overview

All custom scraper logic is encapsulated in `src/scripts/customScrapers.ts` to maintain a clean codebase and prevent bloating the master orchestration script (`syncAll.ts`).

### Routing Pattern
- Custom companies are identified in the Supabase database with `ats_provider: 'custom'`.
- The `careers_url` is used as the primary identifier instead of an ATS token.
- Inside `syncAll.ts`, the `resolveProviderAndToken()` function passes the `careers_url` to `fetchCustom(url, companyRow)`.
- `fetchCustom` acts as a router, dispatching the URL to the appropriate dedicated fetcher (e.g., `fetchBBC`, `fetchKPMG`) based on domain matching.

---

## Implemented Companies

### 1. BBC (ID: 1006)
- **Domain:** `careers.bbc.co.uk`
- **Underlying Technology:** SAP SuccessFactors RMK
- **Challenge:** Standard HTML fetching failed because the jobs are injected dynamically via heavily protected JavaScript.
- **Solution:** Bypassed the DOM entirely by fetching the `sitemap.xml` directly (`https://careers.bbc.co.uk/sitemap.xml`).
- **Data Extraction:** 
  - Extracted absolute URLs from the `<loc>` tags.
  - Job titles and locations are not explicitly provided in the sitemap, so they were reverse-engineered from the URL slugs (e.g., `/job/London-Senior-Software-Engineer...`).
  - **Crucial Nuance:** The extracted title is fed into *both* the `title` and `location` fields of the `Job` object. This ensures the master `ukFilter.ts` can successfully scan the slug text for UK cities (like London, Glasgow, Salford).

### 2. KPMG (ID: 1645)
- **Domain:** `www.kpmgcareers.co.uk`
- **Underlying Technology:** Server-Rendered HTML Search / SuccessFactors HCM
- **Challenge:** Jobs are paginated across multiple pages, rather than exposed via a single JSON API or sitemap.
- **Solution:** Implemented a standard paginated DOM scraper using `cheerio`.
- **Data Extraction:**
  - Iterates through `?page=N` until no more `.vacancy-result` elements are found (capped at 50 pages for safety).
  - Uses highly reliable CSS selectors:
    - Title: `h3`
    - Location: `.vacancy-location b`
    - Department/Service Line: `.vacancy-service-line b`
  - URL generation prepends the base URL to relative `href` paths.

---

## Shared Dependencies & Modifications

During the implementation of these custom scrapers, the following system-wide updates were made to support them:
1. **Types and Utils Exported:** `CompanyRow` and `fetchWithTimeout` were exported from `syncAll.ts` to be reused securely in `customScrapers.ts`.
2. **UK Filter Extension:** Added `"haverhill"` to the `UK_CITIES` allowlist inside `src/lib/ukFilter.ts` to ensure coverage for specific regional roles.

---

*This document should be updated by developers whenever a new custom scraper is added to `customScrapers.ts`.*
