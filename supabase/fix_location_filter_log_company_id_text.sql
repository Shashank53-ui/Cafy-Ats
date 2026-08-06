-- Fix location_filter_log FK: production companies.id is TEXT, not INTEGER.
-- Run this instead of (or after failing) the INTEGER FK version.

CREATE TABLE IF NOT EXISTS public.location_filter_log (
    id BIGSERIAL PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    job_url TEXT,
    raw_location TEXT,
    source TEXT,
    decision TEXT NOT NULL,
    reason TEXT,
    title TEXT,
    market TEXT,
    sync_run_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If you already created the table with INTEGER company_id and it has no rows:
-- DROP TABLE IF EXISTS public.location_filter_log;
-- then re-run the CREATE above.

CREATE INDEX IF NOT EXISTS idx_location_filter_log_created_at
    ON public.location_filter_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_company_created
    ON public.location_filter_log(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_sync_run
    ON public.location_filter_log(sync_run_id);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_decision
    ON public.location_filter_log(decision);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_reason
    ON public.location_filter_log(reason);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_market
    ON public.location_filter_log(market);

-- Cleanup Canada Workday site-code leaks that matched a false "Eircode" (J01 BLDG)
DELETE FROM public."jobs_IR"
WHERE location ILIKE '%LONGUEUIL%'
   OR location ILIKE '%Marie-Victorin%'
   OR location ILIKE 'CA-QC-%'
   OR location ILIKE 'CA-ON-%'
   OR location ILIKE 'CA-AB-%'
   OR location ILIKE 'CA-BC-%';
