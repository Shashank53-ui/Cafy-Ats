-- Add ATS health tracking metadata on companies

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS ats_status TEXT;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS ats_last_validated TIMESTAMPTZ;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS ats_failure_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_companies_ats_status ON public.companies(ats_status);
CREATE INDEX IF NOT EXISTS idx_companies_ats_last_validated ON public.companies(ats_last_validated DESC);

NOTIFY pgrst, 'reload schema';
