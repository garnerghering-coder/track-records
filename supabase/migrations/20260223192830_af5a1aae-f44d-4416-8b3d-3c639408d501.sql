
ALTER TABLE public.v2_driver_fingerprints
  ADD COLUMN IF NOT EXISTS adps numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adps_band text DEFAULT NULL;
