
ALTER TABLE public.v2_race_results ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';
ALTER TABLE public.v2_qualifying_results ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';
ALTER TABLE public.v2_practice_results ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';
