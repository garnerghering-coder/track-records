-- Enhance v2_pit_stops for strategy analysis
ALTER TABLE public.v2_pit_stops 
ADD COLUMN IF NOT EXISTS car_number text,
ADD COLUMN IF NOT EXISTS pit_in_elapsed numeric,
ADD COLUMN IF NOT EXISTS pit_out_elapsed numeric,
ADD COLUMN IF NOT EXISTS flag_status text;

-- Create v2_stints table for strategy visualization
CREATE TABLE IF NOT EXISTS public.v2_stints (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
    car_number text NOT NULL,
    driver_id UUID REFERENCES public.v2_drivers(id),
    start_elapsed numeric, -- seconds from session start
    end_elapsed numeric,   -- seconds from session start
    start_lap integer,
    end_lap integer,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for v2_stints
ALTER TABLE public.v2_stints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read v2_stints" 
ON public.v2_stints FOR SELECT 
USING (true);

CREATE POLICY "Admin all v2_stints" 
ON public.v2_stints FOR ALL 
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Update v2_pit_stops RLS to ensure new columns are accessible (covered by existing policies usually, but good to check)
-- Existing policies are: Admin delete/insert/update, Public read. They should cover new columns automatically.
