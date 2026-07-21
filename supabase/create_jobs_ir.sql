-- Create the Ireland jobs table used by the sync pipeline.
-- Run this in the Supabase SQL editor after the base schema exists.

CREATE TABLE IF NOT EXISTS public."jobs_IR" (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    location TEXT,
    department TEXT,
    description TEXT,
    salary TEXT,
    level TEXT,
    sector TEXT DEFAULT NULL,
    source TEXT NOT NULL DEFAULT 'ats',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_ir_company_id ON public."jobs_IR"(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_location ON public."jobs_IR"(location);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_last_seen_at ON public."jobs_IR"(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_company_last_seen ON public."jobs_IR"(company_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_source ON public."jobs_IR"(source);
CREATE INDEX IF NOT EXISTS idx_jobs_ir_company_source ON public."jobs_IR"(company_id, source);

ALTER TABLE public."jobs_IR" DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
