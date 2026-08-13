-- Free disk: remove location_filter_log (filled Free tier ~3.2M sync filter rows).
-- Run in Supabase SQL Editor.

TRUNCATE TABLE public.location_filter_log;
DROP TABLE IF EXISTS public.location_filter_log CASCADE;

-- Reclaim space on disk (may take a minute)
VACUUM;

NOTIFY pgrst, 'reload schema';
