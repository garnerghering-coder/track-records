
CREATE TABLE public.v2_team_season_cars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.v2_teams(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.v2_seasons(id) ON DELETE CASCADE,
  car_id UUID NOT NULL REFERENCES public.v2_cars(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, season_id)
);

ALTER TABLE public.v2_team_season_cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read v2_team_season_cars"
ON public.v2_team_season_cars FOR SELECT USING (true);

CREATE POLICY "Admin insert v2_team_season_cars"
ON public.v2_team_season_cars FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update v2_team_season_cars"
ON public.v2_team_season_cars FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete v2_team_season_cars"
ON public.v2_team_season_cars FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
