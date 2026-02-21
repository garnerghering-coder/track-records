
-- Create circuit layouts table
CREATE TABLE public.v2_circuit_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id UUID NOT NULL REFERENCES public.v2_circuits(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Full Circuit',
  length_km NUMERIC NULL,
  layout_image_url TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.v2_circuit_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read v2_circuit_layouts" ON public.v2_circuit_layouts FOR SELECT USING (true);
CREATE POLICY "Admin insert v2_circuit_layouts" ON public.v2_circuit_layouts FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update v2_circuit_layouts" ON public.v2_circuit_layouts FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete v2_circuit_layouts" ON public.v2_circuit_layouts FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Add layout_id to sessions
ALTER TABLE public.v2_sessions ADD COLUMN layout_id UUID NULL REFERENCES public.v2_circuit_layouts(id) ON DELETE SET NULL;
