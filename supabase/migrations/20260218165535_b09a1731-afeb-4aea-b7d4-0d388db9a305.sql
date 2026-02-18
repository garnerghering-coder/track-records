
-- Create import_sources table for scheduled imports
CREATE TABLE public.import_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  series_hint TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_status TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import sources"
ON public.import_sources
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create community_submissions table
CREATE TABLE public.community_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by UUID NOT NULL,
  event_name TEXT NOT NULL,
  series_name TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  event_date DATE,
  category public.racing_category DEFAULT 'other',
  location TEXT,
  raw_data TEXT NOT NULL,
  parsed_entries JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.community_submissions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own submissions
CREATE POLICY "Users can submit results"
ON public.community_submissions
FOR INSERT
WITH CHECK (auth.uid() = submitted_by);

-- Users can view their own submissions
CREATE POLICY "Users can view own submissions"
ON public.community_submissions
FOR SELECT
USING (auth.uid() = submitted_by);

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.community_submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update submissions (approve/reject)
CREATE POLICY "Admins can update submissions"
ON public.community_submissions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete submissions
CREATE POLICY "Admins can delete submissions"
ON public.community_submissions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable pg_cron and pg_net extensions for scheduled imports
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
