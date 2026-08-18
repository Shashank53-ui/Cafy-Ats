-- Reject junk department, sector, and location values on jobs / jobs_IR.
-- Safe to re-run.
--
-- Department + sector: must be one of the 25 ALLOWED_SECTORS terms
-- (keep in sync with src/lib/constants.ts).
--
-- Location: not a fixed list (cities vary). This CHECK rejects the junk
-- patterns sanitizeJobLocation() already strips:
--   country codes, requisition IDs, N/A, over-long dumps, "+N more",
--   and mixed UK/Ireland + foreign office lists.
-- App code sanitizes before write; this is the database backstop.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_sector_allowed;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_department_allowed;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_location_sane;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_sector_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_department_allowed;
ALTER TABLE public."jobs_IR" DROP CONSTRAINT IF EXISTS jobs_ir_location_sane;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_sector_allowed CHECK (
    sector IS NULL OR sector IN (
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

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_department_allowed CHECK (
    department IS NULL OR department IN (
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

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_location_sane CHECK (
    location IS NULL OR (
      char_length(btrim(location)) BETWEEN 1 AND 80
      AND location !~* '^(gbr|gb|irl|ie)$'
      AND location !~* '^r[0-9]{5,}$'
      AND location !~* '\bn/?a\b'
      AND location !~* '\+\s*[0-9]+\s+more'
      AND location !~ E'[\n\r]'
      AND NOT (
        location ~* '(united states|\yusa\y|canada|australia|singapore|germany|france|spain|sweden|netherlands|portugal|czechia|finland|india|belgium|new york|san francisco|amsterdam|berlin|paris|toronto|stockholm|maryland|california)'
        AND location ~* '(london|manchester|birmingham|bristol|edinburgh|glasgow|united kingdom|\yuk\y|ireland|dublin|cork|galway)'
      )
    )
  );

ALTER TABLE public."jobs_IR"
  ADD CONSTRAINT jobs_ir_sector_allowed CHECK (
    sector IS NULL OR sector IN (
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
  ADD CONSTRAINT jobs_ir_department_allowed CHECK (
    department IS NULL OR department IN (
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
  ADD CONSTRAINT jobs_ir_location_sane CHECK (
    location IS NULL OR (
      char_length(btrim(location)) BETWEEN 1 AND 80
      AND location !~* '^(gbr|gb|irl|ie)$'
      AND location !~* '^r[0-9]{5,}$'
      AND location !~* '\bn/?a\b'
      AND location !~* '\+\s*[0-9]+\s+more'
      AND location !~ E'[\n\r]'
      AND NOT (
        location ~* '(united states|\yusa\y|canada|australia|singapore|germany|france|spain|sweden|netherlands|portugal|czechia|finland|india|belgium|new york|san francisco|amsterdam|berlin|paris|toronto|stockholm|maryland|california)'
        AND location ~* '(london|manchester|birmingham|bristol|edinburgh|glasgow|united kingdom|\yuk\y|ireland|dublin|cork|galway)'
      )
    )
  );
