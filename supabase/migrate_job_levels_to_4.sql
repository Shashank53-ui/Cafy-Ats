-- Collapse jobs.level / jobs_IR.level to 4 seniority buckets.
-- Apply in Supabase BEFORE deploying sync that writes the new allowlist.
-- Keep IN lists in sync with src/lib/constants.ts (ALLOWED_JOB_LEVELS).
--
-- IMPORTANT: drop the old CHECK first. Updating Mid-level → Mid Level while the
-- old 11-value CHECK is still active fails with 23514.

-- 0) Drop old allowlists so remaps can write the new labels
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_level_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_level_allowed;

-- 1) Remap existing values (old 11 → new 4)
UPDATE public.jobs
SET level = CASE level
  WHEN 'Internship' THEN 'Entry Level'
  WHEN 'Graduate' THEN 'Entry Level'
  WHEN 'Junior' THEN 'Junior'
  WHEN 'Mid-level' THEN 'Mid Level'
  WHEN 'Mid Level' THEN 'Mid Level'
  WHEN 'Entry Level' THEN 'Entry Level'
  WHEN 'Senior' THEN 'Senior'
  WHEN 'Staff' THEN 'Senior'
  WHEN 'Lead' THEN 'Senior'
  WHEN 'Principal' THEN 'Senior'
  WHEN 'Director' THEN 'Senior'
  WHEN 'VP' THEN 'Senior'
  WHEN 'Executive' THEN 'Senior'
  ELSE level
END
WHERE level IS NOT NULL
  AND level NOT IN ('Entry Level', 'Junior', 'Mid Level', 'Senior');

UPDATE public."jobs_IR"
SET level = CASE level
  WHEN 'Internship' THEN 'Entry Level'
  WHEN 'Graduate' THEN 'Entry Level'
  WHEN 'Junior' THEN 'Junior'
  WHEN 'Mid-level' THEN 'Mid Level'
  WHEN 'Mid Level' THEN 'Mid Level'
  WHEN 'Entry Level' THEN 'Entry Level'
  WHEN 'Senior' THEN 'Senior'
  WHEN 'Staff' THEN 'Senior'
  WHEN 'Lead' THEN 'Senior'
  WHEN 'Principal' THEN 'Senior'
  WHEN 'Director' THEN 'Senior'
  WHEN 'VP' THEN 'Senior'
  WHEN 'Executive' THEN 'Senior'
  ELSE level
END
WHERE level IS NOT NULL
  AND level NOT IN ('Entry Level', 'Junior', 'Mid Level', 'Senior');

-- Null any leftover non-allowlisted values (unknown legacy junk)
UPDATE public.jobs
SET level = NULL
WHERE level IS NOT NULL
  AND level NOT IN ('Entry Level', 'Junior', 'Mid Level', 'Senior');

UPDATE public."jobs_IR"
SET level = NULL
WHERE level IS NOT NULL
  AND level NOT IN ('Entry Level', 'Junior', 'Mid Level', 'Senior');

-- 2) Install 4-level CHECK constraints
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_level_allowed CHECK (
    level IS NULL OR level IN (
      'Entry Level',
      'Junior',
      'Mid Level',
      'Senior'
    )
  );

ALTER TABLE public."jobs_IR"
  ADD CONSTRAINT jobs_ir_level_allowed CHECK (
    level IS NULL OR level IN (
      'Entry Level',
      'Junior',
      'Mid Level',
      'Senior'
    )
  );

NOTIFY pgrst, 'reload schema';
