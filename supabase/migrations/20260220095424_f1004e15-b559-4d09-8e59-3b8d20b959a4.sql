
-- Custom annotation sections per session (like incidents but customizable)
CREATE TABLE public.v2_annotation_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Annotations',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_annotation_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin insert v2_annotation_sections" ON public.v2_annotation_sections FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_annotation_sections" ON public.v2_annotation_sections FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete v2_annotation_sections" ON public.v2_annotation_sections FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public read v2_annotation_sections" ON public.v2_annotation_sections FOR SELECT USING (true);

-- Individual annotation items within sections
CREATE TABLE public.v2_annotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.v2_annotation_sections(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#ef4444',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_annotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin insert v2_annotation_items" ON public.v2_annotation_items FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_annotation_items" ON public.v2_annotation_items FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete v2_annotation_items" ON public.v2_annotation_items FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public read v2_annotation_items" ON public.v2_annotation_items FOR SELECT USING (true);

-- Team season display names (aliases per season)
CREATE TABLE public.v2_team_season_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.v2_teams(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.v2_seasons(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, season_id)
);

ALTER TABLE public.v2_team_season_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin insert v2_team_season_names" ON public.v2_team_season_names FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_team_season_names" ON public.v2_team_season_names FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete v2_team_season_names" ON public.v2_team_season_names FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public read v2_team_season_names" ON public.v2_team_season_names FOR SELECT USING (true);
