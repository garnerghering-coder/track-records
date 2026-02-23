-- Create dismissed_car_duplicates table for car duplicate dismissals
CREATE TABLE public.dismissed_car_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  car_id_1 UUID NOT NULL,
  car_id_2 UUID NOT NULL,
  dismissed_by UUID,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dismissed_car_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed car duplicates"
  ON public.dismissed_car_duplicates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Also clear status on hourly sub-session results (they shouldn't have status)
UPDATE v2_race_results
SET status = 'finished', dnf_reason = NULL
WHERE session_id IN (
  SELECT id FROM v2_sessions WHERE parent_session_id IS NOT NULL
)
AND status IS NOT NULL AND status != 'finished';