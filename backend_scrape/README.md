# ATS Scraper CLI

Asynchronous Python CLI for scraping ATS platform data from G2, Capterra, GitHub awesome-ats, and a seed list, then deduplicating and exporting a clean dataset.

## Output

The tool generates:
- `ats_database.csv`
- `ats_database.json`

Schema fields per ATS record:
- name
- vendor
- website
- careers_url_pattern
- tier
- source (list)
- g2_rating
- g2_reviews
- capterra_rating

## Project Structure

```text
backend_scrape/
├── main.py
├── models.py
├── dedup.py
├── url_patterns.py
├── requirements.txt
└── scrapers/
    ├── common.py
    ├── g2.py
    ├── capterra.py
    ├── github_md.py
    └── seed.py
```

## Install

```bash
cd backend_scrape
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
playwright install chromium
```

## Run

```bash
python -m backend_scrape.main run
```

### CLI Options

```bash
python -m backend_scrape.main run \
  --sources g2,capterra,github,seed \
  --output ./ats_database \
  --format csv,json \
  --verbose \
  --supabase \
  --dry-run
```

Options:
- `--sources`: comma-separated source list (default: all)
- `--output`: output path prefix without extension
- `--format`: `csv,json`, `csv`, or `json`
- `--verbose`: print source-level diagnostics
- `--supabase`: sync deduplicated records to Supabase
- `--dry-run`: skip all writes (files and Supabase)

## Supabase Integration

Create table first:

```sql
create table ats_platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  website text,
  careers_url_pattern text,
  tier text check (tier in ('enterprise', 'mid-market', 'smb', 'unknown')),
  sources text[],
  g2_rating numeric(3,1),
  g2_reviews integer,
  capterra_rating numeric(3,1),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(name)
);
```

Add environment variables in `.env`:

```env
SUPABASE_URL=your_project_url
SUPABASE_KEY=your_service_role_key
```

When `--supabase` is passed, the CLI upserts in batches of 50 with `on_conflict="name"`.

## Notes

- The scraper uses `httpx` first and falls back to Playwright rendering if pages return empty content.
- The user-agent rotates on each request and requests include a 1-2 second delay for rate-limit friendliness.
- Deduplication uses normalized names plus rapidfuzz fuzzy matching for near-duplicates.
