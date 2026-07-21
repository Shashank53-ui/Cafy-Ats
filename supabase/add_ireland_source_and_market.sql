-- Ireland daily pipeline: source-aware jobs_IR + sync_market on companies
-- Apply in Supabase SQL editor (or any postgres client) before deploying code.

ALTER TABLE public."jobs_IR"
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ats';

UPDATE public."jobs_IR"
SET source = 'linkedin'
WHERE source = 'ats'
  AND (url ILIKE '%linkedin.com%' OR url ILIKE '%lnkd.in%');

CREATE INDEX IF NOT EXISTS idx_jobs_ir_source ON public."jobs_IR"(source);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_company_source ON public."jobs_IR"(company_id, source);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sync_market TEXT NOT NULL DEFAULT 'uk';

-- Ireland-seeded ATS companies (id range used by ireland_companies.csv)
-- companies.id is text in this project — cast before numeric compare
UPDATE public.companies
SET sync_market = 'ireland'
WHERE id ~ '^[0-9]+$'
  AND id::bigint >= 900000
  AND sync_market = 'uk';

-- LinkedIn-only companies
UPDATE public.companies
SET sync_market = 'ireland'
WHERE lower(coalesce(ats_provider, '')) = 'linkedin'
  AND sync_market = 'uk';

NOTIFY pgrst, 'reload schema';
