
-- Enums
CREATE TYPE public.session_type_enum AS ENUM ('practice','qualifying','sprint_qualifying','sprint_race','race','warmup','other');
CREATE TYPE public.event_status_enum AS ENUM ('draft','published');
CREATE TYPE public.result_status_enum AS ENUM ('finished','dnf','dns','dsq','classified');

-- Master tables
CREATE TABLE public.v2_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  short_name text,
  nationality text,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  short_name text,
  nationality text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  manufacturer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  country text,
  layout_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event tables
CREATE TABLE public.v2_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.v2_series(id) ON DELETE CASCADE,
  year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(series_id, year)
);

CREATE TABLE public.v2_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.v2_seasons(id) ON DELETE CASCADE,
  circuit_id uuid REFERENCES public.v2_circuits(id) ON DELETE SET NULL,
  name text NOT NULL,
  round_number int,
  start_date date,
  end_date date,
  description text,
  status event_status_enum NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  name text NOT NULL,
  session_type session_type_enum NOT NULL,
  date timestamptz,
  status event_status_enum NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Result tables
CREATE TABLE public.v2_race_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  position int,
  driver_id uuid REFERENCES public.v2_drivers(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.v2_teams(id) ON DELETE SET NULL,
  car_id uuid REFERENCES public.v2_cars(id) ON DELETE SET NULL,
  laps_completed int,
  total_time text,
  gap_to_leader text,
  fastest_lap_time text,
  average_lap_time text,
  pit_stops int,
  points numeric,
  status result_status_enum DEFAULT 'finished',
  dnf_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_qualifying_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  position int,
  driver_id uuid REFERENCES public.v2_drivers(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.v2_teams(id) ON DELETE SET NULL,
  car_id uuid REFERENCES public.v2_cars(id) ON DELETE SET NULL,
  q1_time text,
  q2_time text,
  q3_time text,
  best_time text,
  gap_to_pole text,
  laps_run int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_practice_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  position int,
  driver_id uuid REFERENCES public.v2_drivers(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.v2_teams(id) ON DELETE SET NULL,
  car_id uuid REFERENCES public.v2_cars(id) ON DELETE SET NULL,
  best_lap_time text,
  gap_to_p1 text,
  laps_run int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_pit_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.v2_drivers(id) ON DELETE SET NULL,
  lap_number int,
  stop_duration text,
  total_pit_time text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  lap_number int,
  description text,
  penalty_type text,
  outcome text,
  driver_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.v2_fastest_laps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.v2_drivers(id) ON DELETE SET NULL,
  lap_number int,
  lap_time text,
  position int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.v2_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_qualifying_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_practice_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_pit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_fastest_laps ENABLE ROW LEVEL SECURITY;

-- RLS: Public SELECT on all tables
CREATE POLICY "Public read v2_drivers" ON public.v2_drivers FOR SELECT USING (true);
CREATE POLICY "Public read v2_teams" ON public.v2_teams FOR SELECT USING (true);
CREATE POLICY "Public read v2_cars" ON public.v2_cars FOR SELECT USING (true);
CREATE POLICY "Public read v2_circuits" ON public.v2_circuits FOR SELECT USING (true);
CREATE POLICY "Public read v2_series" ON public.v2_series FOR SELECT USING (true);
CREATE POLICY "Public read v2_seasons" ON public.v2_seasons FOR SELECT USING (true);
CREATE POLICY "Public read v2_events" ON public.v2_events FOR SELECT USING (true);
CREATE POLICY "Public read v2_sessions" ON public.v2_sessions FOR SELECT USING (true);
CREATE POLICY "Public read v2_race_results" ON public.v2_race_results FOR SELECT USING (true);
CREATE POLICY "Public read v2_qualifying_results" ON public.v2_qualifying_results FOR SELECT USING (true);
CREATE POLICY "Public read v2_practice_results" ON public.v2_practice_results FOR SELECT USING (true);
CREATE POLICY "Public read v2_pit_stops" ON public.v2_pit_stops FOR SELECT USING (true);
CREATE POLICY "Public read v2_incidents" ON public.v2_incidents FOR SELECT USING (true);
CREATE POLICY "Public read v2_fastest_laps" ON public.v2_fastest_laps FOR SELECT USING (true);

-- RLS: Admin INSERT on all tables
CREATE POLICY "Admin insert v2_drivers" ON public.v2_drivers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_teams" ON public.v2_teams FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_cars" ON public.v2_cars FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_circuits" ON public.v2_circuits FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_series" ON public.v2_series FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_seasons" ON public.v2_seasons FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_events" ON public.v2_events FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_sessions" ON public.v2_sessions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_race_results" ON public.v2_race_results FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_qualifying_results" ON public.v2_qualifying_results FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_practice_results" ON public.v2_practice_results FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_pit_stops" ON public.v2_pit_stops FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_incidents" ON public.v2_incidents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert v2_fastest_laps" ON public.v2_fastest_laps FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: Admin UPDATE on all tables
CREATE POLICY "Admin update v2_drivers" ON public.v2_drivers FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_teams" ON public.v2_teams FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_cars" ON public.v2_cars FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_circuits" ON public.v2_circuits FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_series" ON public.v2_series FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_seasons" ON public.v2_seasons FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_events" ON public.v2_events FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_sessions" ON public.v2_sessions FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_race_results" ON public.v2_race_results FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_qualifying_results" ON public.v2_qualifying_results FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_practice_results" ON public.v2_practice_results FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_pit_stops" ON public.v2_pit_stops FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_incidents" ON public.v2_incidents FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update v2_fastest_laps" ON public.v2_fastest_laps FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Admin DELETE on all tables
CREATE POLICY "Admin delete v2_drivers" ON public.v2_drivers FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_teams" ON public.v2_teams FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_cars" ON public.v2_cars FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_circuits" ON public.v2_circuits FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_series" ON public.v2_series FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_seasons" ON public.v2_seasons FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_events" ON public.v2_events FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_sessions" ON public.v2_sessions FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_race_results" ON public.v2_race_results FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_qualifying_results" ON public.v2_qualifying_results FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_practice_results" ON public.v2_practice_results FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_pit_stops" ON public.v2_pit_stops FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_incidents" ON public.v2_incidents FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete v2_fastest_laps" ON public.v2_fastest_laps FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_v2_drivers_updated_at BEFORE UPDATE ON public.v2_drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_teams_updated_at BEFORE UPDATE ON public.v2_teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_cars_updated_at BEFORE UPDATE ON public.v2_cars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_circuits_updated_at BEFORE UPDATE ON public.v2_circuits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_series_updated_at BEFORE UPDATE ON public.v2_series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_events_updated_at BEFORE UPDATE ON public.v2_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_v2_sessions_updated_at BEFORE UPDATE ON public.v2_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
