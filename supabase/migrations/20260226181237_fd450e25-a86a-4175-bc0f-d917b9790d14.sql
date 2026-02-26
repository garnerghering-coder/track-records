
-- Flag state segments per session for the Strategy Timeline
CREATE TABLE public.v2_flag_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  flag_state text NOT NULL DEFAULT 'GREEN',
  start_elapsed numeric NOT NULL DEFAULT 0,
  end_elapsed numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookup by session
CREATE INDEX idx_v2_flag_segments_session ON public.v2_flag_segments(session_id);

-- Enable RLS
ALTER TABLE public.v2_flag_segments ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read v2_flag_segments"
  ON public.v2_flag_segments FOR SELECT
  USING (true);

-- Admin write
CREATE POLICY "Admin insert v2_flag_segments"
  ON public.v2_flag_segments FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update v2_flag_segments"
  ON public.v2_flag_segments FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete v2_flag_segments"
  ON public.v2_flag_segments FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
