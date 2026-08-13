# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

GetlandedJOBS is a Next.js 15 job board focused on UK visa sponsorship. It aggregates jobs from 2,500+ companies that can sponsor UK work visas, filters them to UK-only postings, and serves them through a personalised feed.

## Commands

```bash
# Dev
npm run dev            # Start Next.js dev server
npm run build          # Production build
npm run build:clean    # Clean .next cache then build
npm run lint           # ESLint

# Job sync (runs via tsx)
npm run sync           # Master sync: fetch jobs from all ATS providers → Supabase
npm run ingest         # Ingest new companies

# ATS tooling
npm run validate:ats           # Check all ATS tokens are valid
npm run repair:ats             # Fix broken ATS tokens
npm run baseline:ats           # Export current ATS config snapshot
npm run detect:ats             # Auto-detect ATS from company careers pages
npm run detect:ats:test        # Same but limited to 20 companies
npm run detect:ats:single      # Run for a single company by ID
npm run import:ats:csv         # Import ATS config from CSV
npm run seed:companies         # Seed companies from CSV
npm run import:full            # Full company import from CSV

# Tests
npx tsx src/lib/ukFilter.test.ts    # Run UK filter unit tests
```

Scripts use `tsx` (not ts-node) and load env from `.env.local` then `.env`.

## Architecture

### Next.js App Router layout

- `src/app/` — pages and API routes
  - `actions/` — Server Actions (`jobActions.ts`, `companyActions.ts`, `subscriptionActions.ts`, `reportActions.ts`)
  - `api/stripe/` — Stripe checkout, portal, and webhook handlers
  - `api/cron/sync-jobs/` — HTTP endpoint that triggers `syncAll()` (called by cron scheduler with `CRON_SECRET`)
  - `api/cron/detect-ats/` — HTTP endpoint that triggers ATS detection
  - `account/` — Profile, preferences, subscription pages
  - `jobs/`, `companies/`, `applied/` — Main user-facing pages
- `src/components/` — Shared UI components (JobFeed, CompanyFeed, Navbar, JobFilters, etc.)
- `src/lib/` — Core business logic
- `src/scripts/` — Standalone data pipeline scripts (run via `tsx`, not part of the web app)
- `src/utils/supabase/` — Supabase client factories
- `supabase/` — SQL migration files (applied manually)

### Supabase database

Key tables:
- `companies` — sponsor companies with `ats_provider`, `ats_board_token`, `careers_url`, `licensed_sponsor`
- `jobs` — job postings with `company_id`, `title`, `url` (unique), `location`, `level`, `last_seen_at`
- `ats_import_audit` — override table: per-company ATS config overrides that take precedence over `companies` columns
- `user_preferences` — saved sector/location/job-type preferences
- `user_applied_jobs` — applied job tracking
- `subscriptions` / `customers` — Stripe subscription state
- `graduate_roles` — separate table for graduate scheme listings
- ~~`location_filter_log`~~ — removed (filled Free-tier disk; sync logging off unless `--enable-filter-log`)
- `reported_jobs` — user-reported job flags

Two Supabase clients:
- `src/utils/supabase/server.ts` — anon key, uses cookies (Server Components / Route Handlers)
- `src/utils/supabase/admin.ts` — service role key, bypasses RLS (sync scripts / webhook handlers — **never expose to client**)

### Job sync pipeline (`src/scripts/syncAll.ts`)

`syncAll()` is the master entry point. It:
1. Loads all companies from Supabase (or falls back to `data/excel/Testing_jobs_data.xlsx` if that file exists)
2. Loads ATS overrides from `ats_import_audit` (overrides take precedence over `companies` table values)
3. Resolves each company to a provider + token via alias map and custom token routes (`CUSTOM_TOKEN_ROUTES`)
4. Calls the matching fetcher from `FETCHERS` (one per ATS provider)
5. Filters jobs through `isLikelyUKJob()` — location-first, with URL and title as secondary signals
6. Upserts to `jobs` table; updates `last_seen_at` for stale job detection
7. Writes a `rejection_log.json` for debugging dropped jobs

Supported ATS providers: `greenhouse`, `ashby`, `lever`, `workable`, `teamtailor`, `bamboohr`, `smartrecruiters`, `pinpoint`, `breezy`, `recruitee`, `workday`, `personio`, `jobvite`, `avature`, `icims`. Custom scrapers for Amazon, Goldman Sachs, Google, JPMC run as separate scripts.

When a company's primary ATS fetch returns 0 jobs, the pipeline tries: (1) infer ATS from `careers_url`, (2) generic HTML scraper, (3) Serper.dev search discovery.

### UK filter (`src/lib/ukFilter.ts`)

`isUKJob(input: JobLocationInput): boolean` — the canonical filter used by `syncAll`. Priority pipeline:
1. `isTrustedSource` → always true (e.g., Workday UK facet results, NHS)
2. `isRemote` flag → true
3. Multi-location text like "3 locations" → true
4. Any location segment matches UK geography (cities/nations/postcodes) → true
5. Hard-block terms (non-UK countries/cities) with no UK term → false
6. EMEA/Global signals → true (potentially UK)
7. Default → false

`syncAll.ts` also contains its own inline `isLikelyUKJob()` that adds URL-hint and title-based checks layered on top.

### Job level inference (`src/lib/inferJobLevel.ts`)

`inferJobLevel(title)` — keyword regex to map job titles to levels: Executive, VP, Director, Principal, Lead, Senior, Staff, Internship, Graduate, Junior, Mid-level.

### Authentication

Supabase Auth with SSR cookie session management (`src/middleware.ts` calls `updateSession` on every request). Protected routes are enforced in `middleware.ts`.

### Subscriptions

Stripe integration: checkout (`/api/stripe/checkout`), customer portal (`/api/stripe/portal`), webhook (`/api/stripe/webhook`). The webhook syncs subscription state to `subscriptions` table via `createAdminClient()`. `getSubscriptionStatus()` in `subscriptionActions.ts` is currently hardcoded to return `isPro: true` for all users.

### Preferences / constants

`src/lib/constants.ts` exports `ALLOWED_JOB_TYPES`, `ALLOWED_LOCATIONS`, and `ALLOWED_SECTORS` — these allowlists are shared between the PreferencesForm UI and the server-side validation in `preferences/actions.ts`.

## Environment variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # Needed for sync scripts and webhook
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CRON_SECRET                      # Bearer token checked by /api/cron/* endpoints
GEMINI_API_KEY                   # Used by ATS detection
SERPER_API_KEY                   # Optional: Serper.dev for job URL discovery
```

## Key patterns

- All Server Actions are in `src/app/actions/` and are `'use server'` files.
- `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS — only use in server contexts.
- Scripts import env with `dotenv.config({ path: '.env.local' })` at the top, before any Supabase client is created.
- `jobs.url` has a `UNIQUE` constraint — upsert uses `url` as the conflict key.
- Company diversity in the job feed: `getJobs()` fetches 50 jobs then de-duplicates to max 1 per company per page.
- SQL migrations live in `supabase/` and are applied manually (no Supabase CLI migrations folder).
