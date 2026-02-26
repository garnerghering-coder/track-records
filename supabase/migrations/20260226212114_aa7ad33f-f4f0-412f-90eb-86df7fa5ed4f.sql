
-- Car livery images table: links a season + car number to a livery image
CREATE TABLE public.v2_car_liveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.v2_seasons(id) ON DELETE CASCADE,
  car_number text NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(season_id, car_number)
);

ALTER TABLE public.v2_car_liveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view car liveries" ON public.v2_car_liveries FOR SELECT USING (true);
CREATE POLICY "Admins can insert car liveries" ON public.v2_car_liveries FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update car liveries" ON public.v2_car_liveries FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete car liveries" ON public.v2_car_liveries FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for livery images
INSERT INTO storage.buckets (id, name, public) VALUES ('car-liveries', 'car-liveries', true);

CREATE POLICY "Public can view car liveries storage" ON storage.objects FOR SELECT USING (bucket_id = 'car-liveries');
CREATE POLICY "Admins can upload car liveries storage" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'car-liveries' AND (SELECT has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can update car liveries storage" ON storage.objects FOR UPDATE USING (bucket_id = 'car-liveries' AND (SELECT has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can delete car liveries storage" ON storage.objects FOR DELETE USING (bucket_id = 'car-liveries' AND (SELECT has_role(auth.uid(), 'admin'::app_role)));
