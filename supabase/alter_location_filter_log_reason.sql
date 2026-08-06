-- Enrich location_filter_log for Phase 2 DQ ownership (reason / title / market).
-- Base table must use TEXT company_id (see create_location_filter_log.sql /
-- fix_location_filter_log_company_id_text.sql) because companies.id is TEXT.

ALTER TABLE public.location_filter_log
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS market TEXT;

CREATE INDEX IF NOT EXISTS idx_location_filter_log_reason
    ON public.location_filter_log(reason);

CREATE INDEX IF NOT EXISTS idx_location_filter_log_market
    ON public.location_filter_log(market);
