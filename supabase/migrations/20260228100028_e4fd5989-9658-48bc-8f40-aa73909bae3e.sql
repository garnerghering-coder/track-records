
-- Add spec series flag to v2_seasons
ALTER TABLE public.v2_seasons ADD COLUMN is_spec_series boolean NOT NULL DEFAULT false;

-- Add spec_car_id to reference the car model used across the whole season
ALTER TABLE public.v2_seasons ADD COLUMN spec_car_id uuid REFERENCES public.v2_cars(id);
