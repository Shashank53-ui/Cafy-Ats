# GetLanded ATS Sync Engine Architecture

This document explains the core logic, structure, and filtering rules for the CaFy ATS scraper engine.

## 1. Overview
The ATS sync engine (`syncAll.ts`) is a centralized, dynamic scraper designed to ingest jobs from multiple applicant tracking systems (ATS) into a Supabase database. 

It completely automates the process: when a new company is added to the Supabase `companies` table with a valid `ats_provider` and `ats_board_token`, this script automatically detects it, routes it to the correct scraper, parses the jobs, filters them for UK suitability, and saves them.

## 2. Core Architecture (`src/scripts/syncAll.ts`)

The `syncAll.ts` script acts as the master orchestrator. Its workflow is:
1. **Fetch Configured Companies:** Reads companies from Supabase (or an Excel file during local testing).
2. **Route to Fetchers:** Based on the `ats_provider` column, it calls a specific provider scraper (e.g., `fetchGreenhouse`, `fetchLever`, `fetchJazzHR`).
3. **Normalize Data:** The fetchers normalize the messy API or HTML responses into a clean `Job` object containing: `title`, `location`, `url`, and `department`.
4. **Filter:** Passes every single job through the massive `isLikelyUKJob` filter.
5. **Upsert:** Saves successfully filtered jobs back to Supabase.

### 2.1 Supported ATS Providers
The script natively handles over 30 ATS platforms using targeted API requests or lightweight Cheerio HTML parsing.

**Core ATS Integrations:**
Greenhouse, Lever, Ashby, Pinpoint, Workable, BambooHR, TeamTailor, Breezy, Recruitee, Jobvite, Avature, SmartRecruiters, Workday, SuccessFactors, Eightfold, iCIMS, Rippling.

**Newly Added Scrapers (Recent Integration):**
- **Join.com**: Specialized handling to unpack nested `workplaceType` and global `remoteType: "ANYWHERE"` variables.
- **JazzHR**: Direct DOM scraping to bypass dynamic content and extract clean location strings.
- **Oracle Taleo & Oracle Cloud**: Highly complex XML/JSON SOAP and REST endpoints.
- **Phenom People**: Specialized extraction to navigate their heavily paginated career portals.
- **Eploy**: Bespoke HTML scraping for the UK-centric Eploy ATS.
- **Cornerstone**: Navigates Cornerstone's legacy career portal architectures.
- **Recruiterbox / Trakstar**: Targeted API parsing for direct company job boards.
- **Gem**: Extracts jobs from Gem's ATS career portals.
- **Mercor**: Direct integration with Mercor's job boards.

*Note: Huge corporate sites like Amazon, Google, Apple, Meta, and JPMC are handled by separate Playwright scripts due to extreme anti-bot protection and pagination.*

---

## 3. The Master UK Filter (`isLikelyUKJob`)

The heart of the system is `isLikelyUKJob`. Because ATS boards are incredibly messy with location data, this filter uses a waterfall of strict, prioritized rules to determine if a job is eligible.

### Step 1: Strict Remote Location Rules (Highest Priority)
If a location explicitly signals remote work, it evaluates these rules *before* any other geographic checks:
- **Explicit UK Remote:** If the location contains "UK" and "Remote" (e.g. `UK Remote`), it is instantly **Approved**.
- **Purely Remote:** If the location field is *strictly* the word `"Remote"` or `"(Remote)"`, it is instantly **Approved**.
- **Remote + Foreign Location:** If the word "Remote" exists alongside any other word (e.g. `Remote India`, `Remote (Philippines)`), the job is instantly **Rejected** with the reason `strict_remote_rule_rejected`.

### Step 2: The Geographic Check (`isUKLocationInternal`)
If the job isn't strictly remote, it parses the location string:
1. **Lowercase and Strip:** Punctuation is stripped and the string is forced to lowercase.
2. **Full String Match:** Checks the location against multi-word UK locations (e.g., `"united kingdom"`, `"northern ireland"`, `"milton keynes"`).
3. **Token Match:** Splits the location by spaces and checks if any token matches the 100+ known UK cities, nations, and abbreviations in our arrays (`UK_COUNTRIES`, `UK_NATIONS`, `UK_CITIES`).

### Step 3: Hard Blocklists
If the job isn't explicitly UK, it runs through exhaustive blocklists to aggressively reject foreign jobs:
- **Title Block:** Rejects the job if the *title* explicitly names a foreign country (e.g. "Software Engineer - Poland"), even if the location field is blank.
- **Location Block:** Rejects the job if the location contains any phrase from the `NON_UK_LOCATION_PHRASES` array. This array contains nearly 100 foreign countries, regions, and major global cities (e.g., USA, Philippines, Dubai, Singapore).
- **US State Codes:** Aggressively rejects 2-letter US state codes (e.g., `NY`, `CA`, `TX`) to prevent them from slipping through.

### Step 4: URL and Department Fallbacks (Gaps)
If the location is ambiguous (e.g., `"Multiple Locations"`, `"EMEA"`):
- **URL Signals:** Approves the job if the URL contains `.co.uk`, `country=gb`, etc.
- **Department Signals:** Approves the job if the department is tagged as a UK division.
- **Ambiguous Marking:** If the location is completely blank or says "EMEA", the job is approved but flagged with `needs_review = true` so a human can double-check it.

---

## 4. How Fetchers Handle Complex Edge Cases

Many ATS providers obscure their data. The fetchers implement custom mapping logic to standardize it before the filter sees it.

**Join.com (Global Remote Bug)**
Join.com hides remote flags inside `workplaceType`. If `workplaceType` is `REMOTE`, the scraper artificially prepends the word "Remote" to the location. Furthermore, if the API specifies `remoteType: "ANYWHERE"`, the scraper aggressively discards the backend foreign country data and maps it purely to `"Remote"` so it successfully passes the UK filter.

**BambooHR (Hidden Flags)**
BambooHR does not provide a textual "Remote" string. Instead, the API returns a flag `locationType: "1"`. The scraper detects this integer and overrides the location string to `"Remote"`.

**JazzHR (Aggressive Regex)**
The JazzHR scraper originally used an aggressive regex that accidentally deleted single-word locations entirely. This caused foreign jobs to appear as having an `EMPTY` location, forcing the filter to flag them for manual review instead of rejecting them. The script now correctly extracts raw text from the DOM to ensure US cities are properly rejected.

## 5. Running the Engine

You can run the engine globally, or test specific companies:
- `npx tsx src/scripts/syncAll.ts`: Runs the entire database.
- `npx tsx src/scripts/syncAll.ts --ids 123,456`: Runs targeted testing on specific Supabase Company IDs.
- `npx tsx src/scripts/syncAll.ts --exclude-linkedin`: Bypasses LinkedIn scraping logic for speed.
