
-- Add CDM and multiclass flag to v2_seasons
ALTER TABLE public.v2_seasons
  ADD COLUMN cdm numeric DEFAULT NULL,
  ADD COLUMN is_multiclass boolean NOT NULL DEFAULT false;

-- Create table for multiclass season classes
CREATE TABLE public.v2_season_classes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.v2_seasons(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  cdm numeric DEFAULT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.v2_season_classes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin delete v2_season_classes" ON public.v2_season_classes FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin insert v2_season_classes" ON public.v2_season_classes FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_season_classes" ON public.v2_season_classes FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public read v2_season_classes" ON public.v2_season_classes FOR SELECT USING (true);

-- Index for lookups
CREATE INDEX idx_v2_season_classes_season_id ON public.v2_season_classes(season_id);
