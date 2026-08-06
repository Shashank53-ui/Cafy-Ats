-- Persisted end-of-run sync metrics for data-quality ownership.
-- Apply manually in Supabase SQL editor (same as other migrations in this folder).

CREATE TABLE IF NOT EXISTS public.sync_run_summary (
    id BIGSERIAL PRIMARY KEY,
    sync_run_id TEXT NOT NULL UNIQUE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms INTEGER,
    companies_processed INTEGER NOT NULL DEFAULT 0,
    companies_with_jobs INTEGER NOT NULL DEFAULT 0,
    companies_errored INTEGER NOT NULL DEFAULT 0,
    jobs_saved INTEGER NOT NULL DEFAULT 0,
    jobs_rejected INTEGER NOT NULL DEFAULT 0,
    wipe_prevented INTEGER NOT NULL DEFAULT 0,
    stale_purged INTEGER NOT NULL DEFAULT 0,
    serper_calls INTEGER NOT NULL DEFAULT 0,
    serper_hits INTEGER NOT NULL DEFAULT 0,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    market_filter TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_run_summary_finished_at
    ON public.sync_run_summary(finished_at DESC);
