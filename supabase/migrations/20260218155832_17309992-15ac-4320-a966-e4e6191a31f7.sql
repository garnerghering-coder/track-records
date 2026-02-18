CREATE TABLE public.dismissed_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id_1 uuid NOT NULL,
  driver_id_2 uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  dismissed_by uuid,
  UNIQUE (driver_id_1, driver_id_2)
);

ALTER TABLE public.dismissed_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed duplicates"
  ON public.dismissed_duplicates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));