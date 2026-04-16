-- Stores raw ATS import metadata from CSV-based imports.
-- Run once in Supabase SQL editor before running importAtsFromCsv.ts

CREATE TABLE IF NOT EXISTS public.ats_import_audit (
    company_id INTEGER PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    source_file TEXT NOT NULL,
    source_company_name TEXT,
    sync_provider TEXT,
    provider_raw TEXT,
    board_token_raw TEXT,
    careers_url_raw TEXT,
    verification TEXT,
    status TEXT,
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ats_import_audit
    ADD COLUMN IF NOT EXISTS sync_provider TEXT;

CREATE INDEX IF NOT EXISTS idx_ats_import_audit_status ON public.ats_import_audit(status);
CREATE INDEX IF NOT EXISTS idx_ats_import_audit_provider_raw ON public.ats_import_audit(provider_raw);
