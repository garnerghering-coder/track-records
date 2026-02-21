
ALTER TABLE public.v2_circuit_layouts
  DROP COLUMN IF EXISTS significant_straights,
  ADD COLUMN total_straight_length_km numeric;
