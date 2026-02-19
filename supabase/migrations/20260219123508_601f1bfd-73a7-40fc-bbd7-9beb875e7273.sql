
-- Table for dismissed circuit duplicates
CREATE TABLE public.dismissed_circuit_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  circuit_id_1 UUID NOT NULL,
  circuit_id_2 UUID NOT NULL,
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dismissed_circuit_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed circuit duplicates"
  ON public.dismissed_circuit_duplicates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
