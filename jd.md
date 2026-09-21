# Custom Companies: JD Fetching Implementation Radar

After analyzing the codebase (`src/scripts/customScrapers.ts` and dedicated scraper files), we confirmed that **none** of the custom scrapers currently map the job description (`JD`) payload to the database's `description` field. They only fetch metadata (title, location, url, department).

To implement production-grade, un-hallucinated JD fetching for all custom companies, we have categorized them based on their data source mechanics. This dictates our implementation approach: whether the JD is natively available in the initial fetch (Inline) or requires separate network requests per job (Detail Page Crawl).

---

## 1. Group A: Inline APIs (High Priority - Easy Implementation)
These companies use documented REST APIs or predictable JSON structures that **already return the Job Description** in the list payload. We only need to map the JSON property (e.g., `j.content` or `j.description`) directly to the `Job` object.

**Greenhouse API (Add `?content=true`)**
*Currently hits `boards-api.greenhouse.io` without content flag or drops it.*
- ~~**Mind Foundry**~~ **[IMPLEMENTED]**
- ~~**Clue**~~ **[IMPLEMENTED]**
- ~~**Prosek** *(Already uses ?content=true, just missing mapping)*~~ **[IMPLEMENTED]**
- ~~**Trustpilot**~~ **[IMPLEMENTED]**
- ~~**Public.io**~~ **[IMPLEMENTED]**
- ~~**Zwift**~~ **[IMPLEMENTED]**
- ~~**Fastly**~~ **[IMPLEMENTED]**
- ~~**Salsify**~~ **[IMPLEMENTED]**
- ~~**Samsara**~~ **[IMPLEMENTED]**
- ~~**Nothing**~~ **[IMPLEMENTED]**

**JSON APIs (Pinpoint, TeamTailor, Hibob, Custom REST)**
*Hits `/jobs.json`, `/postings.json`, or generic REST endpoints.*
- ~~**Ampa** *(Pinpoint `postings.json` - `j.description`)*~~ **[IMPLEMENTED]**
- ~~**Cynergy Bank** *(TeamTailor `jobs.json`)*~~ **[IMPLEMENTED]**
- ~~**Aize** *(TeamTailor `jobs.json`)*~~ **[IMPLEMENTED]** -> Expired
- ~~**Infobric** *(TeamTailor `jobs.json`)*~~ **[IMPLEMENTED]**
- ~~**Otrium** *(Hibob API)*~~ **[IMPLEMENTED]**
- **Logically** *(BambooHR XML/JSON)* -> Expired
- ~~**Capgemini** *(Azure Jobstream API - rich JSON object)*~~ **[IMPLEMENTED]**
- ~~**Amazon** *(Dedicated Scraper: `search.json`)*~~ **[IMPLEMENTED]**

**Jibe & Eightfold APIs**
- ~~**AXA** *(Jibe)*~~ **[IMPLEMENTED]**
- ~~**Aon** *(Jibe)*~~ **[IMPLEMENTED]**
- ~~**Qualcomm** *(Eightfold)*~~ **[IMPLEMENTED]**

---

## 2. Group B: Phenom APIs (Requires Detail-Fetch or Setup Modification)
Phenom platforms typically return only a `descriptionTeaser` in UI search queries, requiring us to extract standard job IDs and fire individual API calls per job, or modify the initial search payload to request the full `description`.
- Serco
- Apple
- Hewlett Packard Enterprise (HPE)
- Jaguar Land Rover (JLR)
- Fitch Group
- Tesco
- Babcock
- Rathbones
- Hikma
- NetJets
- Eli Lilly

---

## 3. Group C: DOM/HTML Scrapes (Requires Detail Page Crawling)
These companies load job listings via raw HTML, sitemaps, or iframe scraping. Getting the JD means using `p-limit` concurrency arrays to `cheerio.load()` or `Playwright goto` into *each individual job URL* after extracting the list.
- **BBC** *(Sitemap.xml list -> fetch HTML per URL)*
- **Stripe** *(DOM pagination -> fetch HTML per URL)*
- **KPMG** *(DOM scraping)*
- **Vodafone** *(Puppeteer/DOM)*
- **Elastic** *(DOM)*
- **Depop** *(HTML)*
- **Nottingham / Reading University** *(Academic HTML sites)*
- **Google** *(Dedicated Scraper: Playwright UI paginator)*
- **Goldman Sachs & JPMC** *(Dedicated Scrapers)*
- **LinkedIn Ireland** *(Dedicated Scraper)*
- *Plus the remaining companies residing in `customScrapers.ts` relying on raw `cheerio` HTML traversal.*

---

## Technical Validation Guardrails
For all JD mappings implemented, the system must conform to industrial-grade guardrails before saving:
1. **Length Validation:** JD must be > 300 characters. If fewer, reject (likely UI stub or error).
2. **Tag Stripping (If Text Needed):** Convert raw HTML to clean text or preserve core `<p><ul>` and strip `<script><style>`.
3. **No Hallucination:** Exact payload mapping. No LLM interpolation.
4. **Resiliency:** Group C (DOM) fetching must use `fetchWithTimeout()` with strict limits and auto-retries to prevent hanging the master sync.
