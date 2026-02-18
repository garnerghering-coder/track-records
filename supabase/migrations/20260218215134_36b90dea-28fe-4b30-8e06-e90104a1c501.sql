
-- =============================================
-- TEAM PROFILES TABLE
-- =============================================
CREATE TABLE public.team_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  website text,
  bio text,
  nationality text,
  primary_category public.racing_category,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view team profiles"
  ON public.team_profiles FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert team profiles"
  ON public.team_profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update team profiles"
  ON public.team_profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete team profiles"
  ON public.team_profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_team_profiles_updated_at
  BEFORE UPDATE ON public.team_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ADD team_profile_id TO race_entries
-- =============================================
ALTER TABLE public.race_entries
  ADD COLUMN team_profile_id uuid REFERENCES public.team_profiles(id) ON DELETE SET NULL;

-- =============================================
-- EDIT QUEUE TABLE
-- =============================================
CREATE TABLE public.edit_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL,
  edit_type text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  proposed_data jsonb NOT NULL,
  previous_data jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.edit_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own edits"
  ON public.edit_queue FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users can view own edits"
  ON public.edit_queue FOR SELECT
  USING (auth.uid() = submitted_by);

CREATE POLICY "Admins can view all edits"
  ON public.edit_queue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update edits"
  ON public.edit_queue FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete edits"
  ON public.edit_queue FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
