-- ⚠ Do NOT recreate on Free/Nano without a retention purge.
-- This table previously grew to ~3.2M rows (~GB) from daily sync and filled the disk.
-- syncAll only writes here when run with --enable-filter-log.

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
