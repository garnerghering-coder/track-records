-- Create v2_lap_times table for per-lap timing data
CREATE TABLE public.v2_lap_times (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  car_number text NOT NULL,
  lap_number integer NOT NULL,
  elapsed numeric NOT NULL, -- cumulative elapsed seconds at lap completion
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for efficient querying by session
CREATE INDEX idx_v2_lap_times_session ON public.v2_lap_times(session_id);

-- Composite index for per-car queries within a session
CREATE INDEX idx_v2_lap_times_session_car ON public.v2_lap_times(session_id, car_number, lap_number);

-- Enable RLS
ALTER TABLE public.v2_lap_times ENABLE ROW LEVEL SECURITY;

-- Public read access (same pattern as other v2 tables)
CREATE POLICY "Public read v2_lap_times"
  ON public.v2_lap_times FOR SELECT
  USING (true);

-- Admin write access
CREATE POLICY "Admin insert v2_lap_times"
  ON public.v2_lap_times FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update v2_lap_times"
  ON public.v2_lap_times FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete v2_lap_times"
  ON public.v2_lap_times FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
