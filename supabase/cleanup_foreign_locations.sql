-- Cleanup foreign / ambiguous location pollution from jobs + jobs_IR
-- Safe to re-run. Prefer running after deploying the tightened ukFilter / irelandFilter.

-- ─── UK table: Canada namesakes & Workday site codes ─────────────────────────
DELETE FROM public.jobs
WHERE location ILIKE '%Canada%'
   OR location ILIKE '%British Columbia%'
   OR location ILIKE '%, Bc, Canada%'
   OR location ILIKE '%, BC, Canada%'
   OR location ILIKE '%Ontario, Canada%'
   OR location ILIKE '%New Brunswick, Canada%'
   OR location ILIKE '%Quebec%'
   OR location ILIKE '%Québec%'
   OR location ILIKE '%CA-ON-%'
   OR location ILIKE '%CA-QC-%'
   OR location ILIKE '%CA-AB-%'
   OR location ILIKE '%CA-BC-%'
   OR location ILIKE '%Ca-On-%'
   OR location ILIKE '%Ca-Qc-%'
   OR location ILIKE '%LONGUEUIL%';

-- Bare Remote with no UK signal (Phase 2 rejects these going forward)
DELETE FROM public.jobs
WHERE lower(trim(location)) IN ('remote', '(remote)');

-- ─── Ireland table: Canada Workday leftovers (if any remain) ─────────────────
DELETE FROM public."jobs_IR"
WHERE location ILIKE '%LONGUEUIL%'
   OR location ILIKE '%Marie-Victorin%'
   OR location ILIKE '%CA-QC-%'
   OR location ILIKE '%CA-ON-%'
   OR location ILIKE '%CA-AB-%'
   OR location ILIKE '%CA-BC-%'
   OR location ILIKE '%Ca-On-%'
   OR location ILIKE '%Ca-Qc-%';
