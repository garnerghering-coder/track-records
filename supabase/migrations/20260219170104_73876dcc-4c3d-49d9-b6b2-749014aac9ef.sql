
-- Enable pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Car models table
CREATE TABLE public.car_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  description TEXT,
  image_url TEXT,
  category public.racing_category,
  website TEXT,
  year_introduced INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.car_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view car models" ON public.car_models FOR SELECT USING (true);
CREATE POLICY "Admins can insert car models" ON public.car_models FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update car models" ON public.car_models FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete car models" ON public.car_models FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_car_models_updated_at
  BEFORE UPDATE ON public.car_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add car_model_id to race_entries
ALTER TABLE public.race_entries ADD COLUMN car_model_id UUID REFERENCES public.car_models(id);

-- Add lap record fields to circuits
ALTER TABLE public.circuits
  ADD COLUMN lap_record_time TEXT,
  ADD COLUMN lap_record_driver_id UUID REFERENCES public.driver_profiles(id),
  ADD COLUMN lap_record_car_model_id UUID REFERENCES public.car_models(id),
  ADD COLUMN lap_record_year INTEGER;

-- Search aliases table
CREATE TABLE public.search_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alias TEXT NOT NULL,
  canonical TEXT NOT NULL,
  entity_type TEXT NOT NULL
);

ALTER TABLE public.search_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view search aliases" ON public.search_aliases FOR SELECT USING (true);
CREATE POLICY "Admins can manage search aliases" ON public.search_aliases FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Seed common aliases
INSERT INTO public.search_aliases (alias, canonical, entity_type) VALUES
  ('F1', 'Formula 1', 'series'),
  ('F2', 'Formula 2', 'series'),
  ('F3', 'Formula 3', 'series'),
  ('F4', 'Formula 4', 'series'),
  ('WEC', 'World Endurance Championship', 'series'),
  ('IMSA', 'IMSA SportsCar Championship', 'series'),
  ('NASCAR', 'NASCAR Cup Series', 'series'),
  ('IndyCar', 'IndyCar Series', 'series'),
  ('GT3', 'GT World Challenge', 'series'),
  ('DTM', 'Deutsche Tourenwagen Masters', 'series'),
  ('Le Mans', '24 Hours of Le Mans', 'event'),
  ('Daytona', 'Rolex 24 At Daytona', 'event'),
  ('Spa', 'Circuit de Spa-Francorchamps', 'circuit'),
  ('Monza', 'Autodromo Nazionale Monza', 'circuit'),
  ('Silverstone', 'Silverstone Circuit', 'circuit'),
  ('Nurburgring', 'Nürburgring', 'circuit'),
  ('Indy 500', 'Indianapolis 500', 'event'),
  ('Bathurst', 'Mount Panorama Circuit', 'circuit'),
  ('LMDh', 'LMDh', 'car'),
  ('LMH', 'Le Mans Hypercar', 'car'),
  ('GT4', 'GT4', 'car');

-- Trigram indexes for fuzzy search
CREATE INDEX idx_driver_profiles_name_trgm ON public.driver_profiles USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX idx_team_profiles_name_trgm ON public.team_profiles USING gin (name gin_trgm_ops);
CREATE INDEX idx_series_name_trgm ON public.series USING gin (name gin_trgm_ops);
CREATE INDEX idx_circuits_name_trgm ON public.circuits USING gin (name gin_trgm_ops);
CREATE INDEX idx_race_events_name_trgm ON public.race_events USING gin (event_name gin_trgm_ops);
CREATE INDEX idx_car_models_name_trgm ON public.car_models USING gin (name gin_trgm_ops);
CREATE INDEX idx_search_aliases_alias_trgm ON public.search_aliases USING gin (alias gin_trgm_ops);
