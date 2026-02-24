
-- Add points column to v2_qualifying_results
ALTER TABLE public.v2_qualifying_results ADD COLUMN IF NOT EXISTS points numeric DEFAULT NULL;

-- Add points column to v2_practice_results
ALTER TABLE public.v2_practice_results ADD COLUMN IF NOT EXISTS points numeric DEFAULT NULL;
