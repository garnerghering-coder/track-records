
-- Add coordinates to v2_circuits
ALTER TABLE public.v2_circuits ADD COLUMN IF NOT EXISTS latitude numeric DEFAULT NULL;
ALTER TABLE public.v2_circuits ADD COLUMN IF NOT EXISTS longitude numeric DEFAULT NULL;

-- Add start_time and end_time to v2_sessions (stored as HH:MM in track local time)
ALTER TABLE public.v2_sessions ADD COLUMN IF NOT EXISTS start_time text DEFAULT NULL;
ALTER TABLE public.v2_sessions ADD COLUMN IF NOT EXISTS end_time text DEFAULT NULL;

-- Create v2_session_weather table
CREATE TABLE public.v2_session_weather (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  condition_summary text,
  condition_emoji text,
  air_temp_min numeric,
  air_temp_max numeric,
  track_temp_min numeric,
  track_temp_max numeric,
  rain_mm numeric,
  rain_detail text,
  wind_summary text,
  wind_speed_min numeric,
  wind_speed_max numeric,
  wind_direction text,
  hourly_data jsonb DEFAULT '[]'::jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);

-- Enable RLS
ALTER TABLE public.v2_session_weather ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read v2_session_weather" ON public.v2_session_weather FOR SELECT USING (true);
CREATE POLICY "Admin insert v2_session_weather" ON public.v2_session_weather FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_session_weather" ON public.v2_session_weather FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete v2_session_weather" ON public.v2_session_weather FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
