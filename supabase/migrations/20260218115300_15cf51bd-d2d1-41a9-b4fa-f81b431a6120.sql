
-- 1. race_events table
CREATE TABLE public.race_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  series_name text NOT NULL,
  season_year integer NOT NULL,
  category public.racing_category,
  location text,
  event_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.race_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view race events" ON public.race_events FOR SELECT USING (true);
CREATE POLICY "Admins can insert race events" ON public.race_events FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update race events" ON public.race_events FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete race events" ON public.race_events FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_race_events_updated_at
  BEFORE UPDATE ON public.race_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. race_entries table
CREATE TABLE public.race_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_event_id uuid NOT NULL REFERENCES public.race_events(id) ON DELETE CASCADE,
  team_name text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  car_number text,
  race_class text,
  finishing_position integer,
  class_position integer,
  laps_completed integer,
  gap_to_leader text,
  gap_to_class_leader text,
  pit_stops integer,
  status text,
  notes text,
  verification_status public.verification_status NOT NULL DEFAULT 'verified',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.race_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view race entries" ON public.race_entries FOR SELECT USING (true);
CREATE POLICY "Admins can insert race entries" ON public.race_entries FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update race entries" ON public.race_entries FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete race entries" ON public.race_entries FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_race_entries_event ON public.race_entries(race_event_id);

-- 3. race_entry_drivers junction table
CREATE TABLE public.race_entry_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_entry_id uuid NOT NULL REFERENCES public.race_entries(id) ON DELETE CASCADE,
  driver_profile_id uuid NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(race_entry_id, driver_profile_id)
);

ALTER TABLE public.race_entry_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view race entry drivers" ON public.race_entry_drivers FOR SELECT USING (true);
CREATE POLICY "Admins can insert race entry drivers" ON public.race_entry_drivers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update race entry drivers" ON public.race_entry_drivers FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete race entry drivers" ON public.race_entry_drivers FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_race_entry_drivers_entry ON public.race_entry_drivers(race_entry_id);
CREATE INDEX idx_race_entry_drivers_driver ON public.race_entry_drivers(driver_profile_id);
