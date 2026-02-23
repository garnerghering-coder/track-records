
-- Table to store computed Driver Fingerprint scores
CREATE TABLE public.v2_driver_fingerprints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.v2_drivers(id) ON DELETE CASCADE,
  dps numeric,
  dps_band text,
  dcs numeric,
  dcs_band text,
  das numeric,
  das_band text,
  dws numeric,
  dws_band text,
  events_included integer NOT NULL DEFAULT 0,
  wet_sessions integer NOT NULL DEFAULT 0,
  dry_sessions integer NOT NULL DEFAULT 0,
  calculation_details jsonb DEFAULT '{}'::jsonb,
  last_calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT v2_driver_fingerprints_driver_unique UNIQUE (driver_id)
);

-- Enable RLS
ALTER TABLE public.v2_driver_fingerprints ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read v2_driver_fingerprints"
  ON public.v2_driver_fingerprints FOR SELECT USING (true);

-- Admin write
CREATE POLICY "Admin insert v2_driver_fingerprints"
  ON public.v2_driver_fingerprints FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update v2_driver_fingerprints"
  ON public.v2_driver_fingerprints FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete v2_driver_fingerprints"
  ON public.v2_driver_fingerprints FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role needs to write via edge function, so also allow unauthenticated insert/update
-- (edge functions use service_role key which bypasses RLS anyway)

-- Index for quick lookups
CREATE INDEX idx_v2_driver_fingerprints_driver ON public.v2_driver_fingerprints(driver_id);

-- Timestamp trigger
CREATE TRIGGER update_v2_driver_fingerprints_updated_at
  BEFORE UPDATE ON public.v2_driver_fingerprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
