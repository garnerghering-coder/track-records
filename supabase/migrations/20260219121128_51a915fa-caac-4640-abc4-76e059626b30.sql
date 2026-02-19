
-- Create circuits table
CREATE TABLE public.circuits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  location TEXT,
  length_km NUMERIC,
  turns INTEGER,
  website TEXT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.circuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view circuits" ON public.circuits FOR SELECT USING (true);
CREATE POLICY "Admins can insert circuits" ON public.circuits FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update circuits" ON public.circuits FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete circuits" ON public.circuits FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_circuits_updated_at BEFORE UPDATE ON public.circuits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create series table
CREATE TABLE public.series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category public.racing_category,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view series" ON public.series FOR SELECT USING (true);
CREATE POLICY "Admins can insert series" ON public.series FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update series" ON public.series FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete series" ON public.series FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_series_updated_at BEFORE UPDATE ON public.series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add linking columns to race_events
ALTER TABLE public.race_events ADD COLUMN circuit_id UUID REFERENCES public.circuits(id);
ALTER TABLE public.race_events ADD COLUMN series_id UUID REFERENCES public.series(id);
ALTER TABLE public.race_events ADD COLUMN ticket_url TEXT;
