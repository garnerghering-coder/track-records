
-- Create a lookup table for series short names / aliases
CREATE TABLE public.v2_series_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES public.v2_series(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: no duplicate alias per series
CREATE UNIQUE INDEX idx_v2_series_aliases_unique ON public.v2_series_aliases (series_id, alias);

-- Index for quick alias lookups
CREATE INDEX idx_v2_series_aliases_alias ON public.v2_series_aliases (lower(alias));

-- Enable RLS
ALTER TABLE public.v2_series_aliases ENABLE ROW LEVEL SECURITY;

-- Public can read aliases
CREATE POLICY "Public read v2_series_aliases"
  ON public.v2_series_aliases
  FOR SELECT
  USING (true);

-- Admins can manage aliases
CREATE POLICY "Admin insert v2_series_aliases"
  ON public.v2_series_aliases
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update v2_series_aliases"
  ON public.v2_series_aliases
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete v2_series_aliases"
  ON public.v2_series_aliases
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
