# Sync All Guide

This document explains how the master sync script works and how it fits into the project.

- Script: `src/scripts/syncAll.ts`
- Purpose: fetch jobs from many ATS providers, keep UK-relevant jobs, and sync them into Supabase.

## 1) What Sync All Does

`syncAll.ts` is the main ingestion pipeline for company jobs.

For each company record in `companies`:
1. Reads provider configuration (`ats_provider`, `ats_board_token`). 
2. Calls the matching fetcher for that provider.
3. Filters fetched jobs into UK rows and Ireland rows.
4. Upserts UK jobs into `jobs` and Ireland jobs into `jobs_IR`, both using `url` as the conflict key.
5. Deletes stale jobs that are no longer present in the latest provider payload for each table.
6. Recomputes and updates `companies.active_jobs_count` from the UK table.

It also prints a final run summary (counts, errors, top companies by saved jobs).

## 2) Where Data Comes From

Sync source of truth is the `companies` table fields, plus audit overrides from `ats_import_audit`:
- `id`
- `trading_name`
- `ats_provider`
- `ats_board_token`

When present, `ats_import_audit` overrides are merged in before fetch time:
- `sync_provider`
- `board_token_raw`
- `careers_url_raw`

The script dynamically loads all configured companies from Supabase, so adding a company to DB is usually enough to include it in future runs.

## 3) Database Tables Used

From `supabase/schema.sql`:

### `companies`
Used for:
- reading provider config (`ats_provider`, `ats_board_token`)
- writing `active_jobs_count`

### `ats_import_audit`
Used for:
- overriding the sync provider/token with imported CSV data
- retrying failed token fetches from `careers_url_raw`
- preserving the raw CSV source fields for troubleshooting

### `jobs`
Used for:
- upsert of current jobs
- deletion of stale jobs

Important constraints:
- `jobs.url` is unique and used in `upsert(..., { onConflict: 'url' })`

### `jobs_IR`
Used for:
- upsert of Republic of Ireland jobs
- deletion of stale Ireland rows

Important constraints:
- `jobs_IR.url` is unique and used in `upsert(..., { onConflict: 'url' })`

## 4) Runtime and Environment

The script uses:
- `dotenv` (`.env.local`)
- `@supabase/supabase-js`
- `fetch` with timeout wrapper
- `cheerio` for HTML/XML parsing
- `playwright` for dynamic pages (Google and Goldman Sachs)
- `SERPER_API_KEY` fallback discovery for companies with missing/failed ATS config

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred)
- fallback if service key missing: `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Note: For server-side scripts and CLI tools that perform writes (migrations, bulk imports,
or the master sync), set `SUPABASE_SERVICE_ROLE_KEY` in your environment. This key bypasses
RLS and is required for admin-level DML; never expose it to browsers or client-side code.

Optional env vars:
- `SERPER_API_KEY` (enables careers URL discovery fallback in sync)

## 5) Command Usage

Package script:
- `npm run sync`

Direct run:
- `npx tsx src/scripts/syncAll.ts`

Run selected companies only:
- `npx tsx src/scripts/syncAll.ts --ids 12,45,90`

Import ATS config from CSV before syncing:
- Run one-time table creation SQL: `supabase/create_ats_import_audit.sql`
- Dry run import: `npm run import:ats:csv -- --file "ATS compnies - industry_grade_ats_database_fixed.csv" --dry-run`
- Apply import: `npm run import:ats:csv -- --file "ATS compnies - industry_grade_ats_database_fixed.csv"`

## 6) High-Level Pipeline

1. Initialize Supabase client.
2. Load all companies (or specific IDs via `--ids`) and merge in any audit overrides.
3. For each company:
   - Resolve fetcher from `FETCHERS` map.
   - Fetch provider jobs.
   - If the token path fails, infer a supported provider from `careers_url_raw` and retry.
   - If still empty and `SERPER_API_KEY` exists, discover careers URLs via Serper and retry with ATS inference.
   - If no ATS mapping is possible, try generic careers-page scraping from discovered URL(s).
   - Apply UK filtering.
   - Deduplicate by URL.
   - Upsert rows into `jobs`.
   - Delete stale rows for same `company_id` not in current URL set.
   - Recompute `active_jobs_count`.
4. Print summary.

## 7) UK and Ireland Routing Logic

- Multi-location posts can dual-write: UK match → `jobs`, Ireland match → `jobs_IR` (no longer UK-first exclusive).
- Companies with `sync_market = 'ireland'` write **only** to `jobs_IR` and keep `active_jobs_count = 0` (UK browse safe).
- `jobs_IR.source` is `ats` or `linkedin`. ATS stale deletes only remove `source=ats` rows so LinkedIn inventory survives daily UK sync.
- CLI: `--market ireland`, `--exclude-linkedin`.
- LinkedIn volume: `npm run sync:linkedin` (used by `fetch-jobs.yml`), then `npm run check:ireland`.

Apply schema: [supabase/add_ireland_source_and_market.sql](../supabase/add_ireland_source_and_market.sql)

Ireland routing uses `isIrelandJob` (explicit RoI locations). Northern Ireland stays in the UK table.

Supabase table creation steps:
1. Run [supabase/create_jobs_ir.sql](../supabase/create_jobs_ir.sql) in the Supabase SQL editor, or apply the same SQL through your migration workflow.
2. Run [supabase/add_ireland_source_and_market.sql](../supabase/add_ireland_source_and_market.sql) for `source` + `sync_market`.
3. Confirm the table exists as `public."jobs_IR"` with the same columns as `public.jobs` plus `source`.
4. Verify the unique `url` constraint and the company/location/last_seen indexes are present.
5. Refresh the PostgREST schema cache by running the `NOTIFY pgrst, 'reload schema';` statement from the script.
6. Keep RLS disabled on `jobs_IR` so the sync script can write to it the same way it writes to `jobs`.

## 8) Supported Providers and Fetchers

The dispatch map is `FETCHERS`.

Current providers in the map:
- `greenhouse`
- `ashby`
- `lever`
- `workable`
- `teamtailor`
- `bamboohr`
- `smartrecruiters`
- `pinpoint`
- `breezy`
- `breezyhr`
- `recruitee`
- `personio`
- `workday`
- `workday_enterprise`
- `oracle_cloud`
- `successfactors`
- `eightfold`
- `hibob`
- `wipro`
- `icims`
- `rippling`
- `amazon`
- `goldmansachs`
- `google`
- `jpmc`
- `custom_nhs`

If a company has an unsupported `ats_provider`, it is skipped.

## 9) Provider Token Patterns (Important)

Different fetchers expect different token formats. Examples:
- Greenhouse: `boardToken` or `boardToken?office_id=...`
- Workday: `slug/board`
- Oracle Cloud: `domain|site`
- Eightfold: `domain.com|United Kingdom` (country part optional)
- Recruitee: can be subdomain token or full domain token
- Teamtailor/Hibob: supports both token-only and full-domain style in some cases

If a company fetch returns empty unexpectedly, verify token format first.

## 10) Write Path Details

Rows written to `jobs` include:
- `company_id`
- `title`
- `location`
- `url`
- `department`
- `level`

Rows written to `jobs_IR` use the same shape.

`level` is derived by `inferJobLevel(title)` from `src/lib/inferJobLevel.ts`.

All strings are trimmed to max length via `safeStr` before writing.

## 11) Cleanup Behavior (Very Important)

After successful upsert for a company:
- script deletes rows in `jobs` for that `company_id` where URL is not in the current UK URL list
- script deletes rows in `jobs_IR` for that `company_id` where URL is not in the current Ireland URL list

If the UK job list is empty:
- script deletes all rows from `jobs` for that company

If the Ireland job list is empty:
- script deletes all rows from `jobs_IR` for that company

This means sync is designed as a snapshot sync, not append-only history.

## 12) Error Handling

- Most fetchers catch errors and return `[]`.
- Per-company processing continues after failures.
- Errors are stored in run results and shown in final summary.
- Timeouts are handled via `AbortController` in `fetchWithTimeout`.

## 13) Performance and Rate Control

- Short sleeps are used between API page calls and between companies.
- Pagination limits and safety caps prevent infinite loops.

## 14) How to Add a New ATS Provider

1. Add a new fetcher function in `syncAll.ts` with signature:
   - `async function fetchMyProvider(token: string): Promise<Job[]>`
2. Return normalized `Job[]` with at least:
   - `title`, `location`, `url`
3. Register provider key in `FETCHERS` map.
4. Insert or update company record with:
   - `ats_provider = 'my_provider'`
   - `ats_board_token = '...token format...'`
5. Run sync for that company only:
   - `npx tsx src/scripts/syncAll.ts --ids <company_id>`
6. Verify:
   - rows in `jobs`
   - `companies.active_jobs_count`

## 15) Common Debug Checklist

When a provider shows 0 saved jobs:
1. Check fetch count before UK filter.
2. Check token format in DB.
3. Check whether provider changed API/HTML structure.
4. Check location field quality and UK filter false negatives.
5. Run single company with `--ids` and inspect logs.

When jobs disappear unexpectedly:
1. Confirm fetcher did not fail silently and return `[]`.
2. Confirm stale cleanup did not remove expected URLs.
3. Confirm job URLs are stable and not changing every run.

## 16) Notes About Current Implementation

- `syncRunId` is generated but currently not persisted or used.
- Cleanup query builds URL list string for `.not('url', 'in', ...)`; this works but should be treated carefully if URLs contain unusual characters.
- Project `README.md` is still generic; this guide is the operational source for sync behavior.

## 17) Related Files

- `src/scripts/syncAll.ts` (main sync pipeline)
- `src/lib/inferJobLevel.ts` (title to level mapping)
- `supabase/schema.sql` (tables and constraints)
- `package.json` (`sync` script)

---

If needed, create a second document named `SYNC_ALL_RUNBOOK.md` for production ops (scheduled runs, retries, alerting, rollback strategy, and verification SQL queries).
