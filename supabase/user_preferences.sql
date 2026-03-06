-- Create User Preferences Table
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    job_types TEXT[] DEFAULT '{}',
    locations TEXT[] DEFAULT '{}',
    sponsorship_needed BOOLEAN DEFAULT false,
    sectors TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Users can view their own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- Ensure REST API can see it
NOTIFY pgrst, 'reload schema';
