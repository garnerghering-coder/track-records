
-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('driver', 'team_sponsor', 'admin');

-- Enum for racing categories
CREATE TYPE public.racing_category AS ENUM (
  'karting', 'single_seater', 'gt', 'touring_car', 'sports_car',
  'rally', 'endurance', 'formula', 'stock_car', 'other'
);

-- Enum for result verification status
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');

-- Enum for claim request status
CREATE TYPE public.claim_status AS ENUM ('pending', 'approved', 'rejected');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles: users can read their own roles, admins can read all
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Driver profiles
CREATE TABLE public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  photo_url TEXT,
  bio TEXT,
  primary_category racing_category DEFAULT 'other',
  license_type TEXT,
  license_grade TEXT,
  license_issuing_body TEXT,
  social_website TEXT,
  social_instagram TEXT,
  social_twitter TEXT,
  social_linkedin TEXT,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view driver profiles (public)
CREATE POLICY "Public can view driver profiles"
  ON public.driver_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Drivers can update their own claimed profile
CREATE POLICY "Drivers can update own profile"
  ON public.driver_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can insert profiles (for creating unclaimed profiles)
CREATE POLICY "Admins can insert profiles"
  ON public.driver_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON public.driver_profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON public.driver_profiles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Race results
CREATE TABLE public.race_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID REFERENCES public.driver_profiles(id) ON DELETE CASCADE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  series_name TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  event_name TEXT,
  category racing_category DEFAULT 'other',
  finishing_position INTEGER,
  championship_position INTEGER,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.race_results ENABLE ROW LEVEL SECURITY;

-- Anyone can view race results
CREATE POLICY "Public can view race results"
  ON public.race_results FOR SELECT
  TO anon, authenticated
  USING (true);

-- Drivers can insert results for their own profile
CREATE POLICY "Drivers can insert own results"
  ON public.race_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.driver_profiles
      WHERE id = driver_profile_id AND user_id = auth.uid()
    )
  );

-- Admins can insert results for any profile
CREATE POLICY "Admins can insert any results"
  ON public.race_results FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update results (for verification)
CREATE POLICY "Admins can update results"
  ON public.race_results FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete results
CREATE POLICY "Admins can delete results"
  ON public.race_results FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Profile claim requests
CREATE TABLE public.profile_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID REFERENCES public.driver_profiles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT,
  status claim_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_claim_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "Users can view own claims"
  ON public.profile_claim_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all claims
CREATE POLICY "Admins can view all claims"
  ON public.profile_claim_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can submit claims
CREATE POLICY "Users can submit claims"
  ON public.profile_claim_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can update claims (approve/reject)
CREATE POLICY "Admins can update claims"
  ON public.profile_claim_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Team/sponsor organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'team',
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Users can view their own org
CREATE POLICY "Users can view own org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own org
CREATE POLICY "Users can insert own org"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own org
CREATE POLICY "Users can update own org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all orgs
CREATE POLICY "Admins can view all orgs"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Attach triggers
CREATE TRIGGER update_driver_profiles_updated_at
  BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_race_results_updated_at
  BEFORE UPDATE ON public.race_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-assign role on signup (called via trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::app_role,
    'driver'
  );
  
  -- Don't allow self-assigning admin
  IF _role = 'admin' THEN
    _role := 'driver';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX idx_driver_profiles_user_id ON public.driver_profiles(user_id);
CREATE INDEX idx_driver_profiles_nationality ON public.driver_profiles(nationality);
CREATE INDEX idx_driver_profiles_category ON public.driver_profiles(primary_category);
CREATE INDEX idx_driver_profiles_claimed ON public.driver_profiles(is_claimed);
CREATE INDEX idx_race_results_driver ON public.race_results(driver_profile_id);
CREATE INDEX idx_race_results_status ON public.race_results(verification_status);
CREATE INDEX idx_profile_claims_status ON public.profile_claim_requests(status);
