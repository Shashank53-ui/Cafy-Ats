-- Job taxonomy columns + allowlists for sync.
-- Safe to re-run. Apply in Supabase before deploying sync that writes these fields.
-- Keep IN lists in sync with src/lib/constants.ts (ALLOWED_JOB_TYPES / ALLOWED_JOB_LEVELS).

-- ── Employment type (jobs.job_type) ──────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT NULL;

ALTER TABLE public."jobs_IR"
  ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT NULL;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_job_type_allowed;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_job_type_allowed CHECK (
    job_type IS NULL OR job_type IN (
      'Full-time',
      'Part-time',
      'Contract',
      'Internship',
      'Placement scheme'
    )
  );

ALTER TABLE public."jobs_IR"
  ADD CONSTRAINT jobs_ir_job_type_allowed CHECK (
    job_type IS NULL OR job_type IN (
      'Full-time',
      'Part-time',
      'Contract',
      'Internship',
      'Placement scheme'
    )
  );

-- ── Seniority level (jobs.level) — same values as preferences ────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT NULL;

ALTER TABLE public."jobs_IR"
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_level ON public.jobs(level);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_level ON public."jobs_IR"(level);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_level_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_level_allowed;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_level_allowed CHECK (
    level IS NULL OR level IN (
      'Internship',
      'Graduate',
      'Junior',
      'Mid-level',
      'Senior',
      'Staff',
      'Lead',
      'Principal',
      'Director',
      'VP',
      'Executive'
    )
  );

ALTER TABLE public."jobs_IR"
  ADD CONSTRAINT jobs_ir_level_allowed CHECK (
    level IS NULL OR level IN (
      'Internship',
      'Graduate',
      'Junior',
      'Mid-level',
      'Senior',
      'Staff',
      'Lead',
      'Principal',
      'Director',
      'VP',
      'Executive'
    )
  );

NOTIFY pgrst, 'reload schema';
