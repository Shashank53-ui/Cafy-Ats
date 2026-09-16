-- Optional: trace which cascade rule set jobs.level
-- Safe to re-run. Sync strips this column automatically if missing.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS level_source TEXT;

ALTER TABLE public."jobs_IR"
  ADD COLUMN IF NOT EXISTS level_source TEXT;

COMMENT ON COLUMN public.jobs.level_source IS
  'Cascade provenance: title:*, jd:label:*, manual_review, …';
COMMENT ON COLUMN public."jobs_IR".level_source IS
  'Cascade provenance: title:*, jd:label:*, manual_review, …';

NOTIFY pgrst, 'reload schema';
