-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;

-- Supabase Schema for poli-clone

-- Create Companies Table
CREATE TABLE public.companies (
    id SERIAL PRIMARY KEY,
    trading_name TEXT NOT NULL,
    companies_house_name TEXT,
    url TEXT,
    url_linkedin TEXT,
    description TEXT,
    policy TEXT,
    open_to_sponsorship INTEGER,
    active_jobs_count INTEGER,
    url_favicon TEXT,
    licensed_sponsor BOOLEAN DEFAULT true,
    estimated_num_employees_label TEXT,
    ats_provider TEXT,
    ats_board_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Jobs Table
CREATE TABLE public.jobs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    location TEXT,
    department TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX idx_jobs_location ON public.jobs(location);

-- Force REST schema refresh so there are no cache issues right after recreating
NOTIFY pgrst, 'reload schema';
