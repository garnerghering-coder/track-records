
-- Create discovery_jobs table for background series import jobs
CREATE TABLE public.discovery_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_name TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  events_found INTEGER,
  events_imported INTEGER NOT NULL DEFAULT 0,
  events_skipped INTEGER NOT NULL DEFAULT 0,
  events_failed INTEGER NOT NULL DEFAULT 0,
  events_no_url INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with discovery jobs
CREATE POLICY "Admins can manage discovery jobs"
  ON public.discovery_jobs
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_discovery_jobs_updated_at
  BEFORE UPDATE ON public.discovery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
