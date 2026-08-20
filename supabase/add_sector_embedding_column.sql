-- Add embedding-based sector column for A/B comparison.
-- Does NOT modify existing `sector` values.
-- Safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS sector_embedding text;

ALTER TABLE public."jobs_IR"
  ADD COLUMN IF NOT EXISTS sector_embedding text;

COMMENT ON COLUMN public.jobs.sector_embedding IS
  'Sector from MiniLM title↔prototype cosine; compare to sector. Null until backfill.';

COMMENT ON COLUMN public."jobs_IR".sector_embedding IS
  'Sector from MiniLM title↔prototype cosine; compare to sector. Null until backfill.';

-- Optional allowlist (same 25 as sector). Drop first so re-runs are idempotent.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_sector_embedding_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_sector_embedding_allowed;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_sector_embedding_allowed CHECK (
    sector_embedding IS NULL OR sector_embedding IN (
      'Business & Strategy',
      'Construction & Infrastructure',
      'Customer Success',
      'Data',
      'Design',
      'Engineering (Hardware)',
      'Engineering (Other)',
      'Engineering (Software)',
      'Finance',
      'Healthcare',
      'Healthcare & Social Care',
      'HR / People',
      'Legal',
      'Logistics & Transport',
      'Marketing & PR',
      'Media & Journalism',
      'Operations',
      'Other',
      'Pharmaceutical',
      'Product Management',
      'Project Management',
      'Research (Non-technical)',
      'Research (Technical)',
      'Retail & Hospitality',
      'Sales & Partnerships'
    )
  );

ALTER TABLE public."jobs_IR"
  ADD CONSTRAINT jobs_ir_sector_embedding_allowed CHECK (
    sector_embedding IS NULL OR sector_embedding IN (
      'Business & Strategy',
      'Construction & Infrastructure',
      'Customer Success',
      'Data',
      'Design',
      'Engineering (Hardware)',
      'Engineering (Other)',
      'Engineering (Software)',
      'Finance',
      'Healthcare',
      'Healthcare & Social Care',
      'HR / People',
      'Legal',
      'Logistics & Transport',
      'Marketing & PR',
      'Media & Journalism',
      'Operations',
      'Other',
      'Pharmaceutical',
      'Product Management',
      'Project Management',
      'Research (Non-technical)',
      'Research (Technical)',
      'Retail & Hospitality',
      'Sales & Partnerships'
    )
  );
