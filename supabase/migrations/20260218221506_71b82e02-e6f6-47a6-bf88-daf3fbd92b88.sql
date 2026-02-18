
-- Create dismissed_team_duplicates table
CREATE TABLE public.dismissed_team_duplicates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id_1 UUID NOT NULL,
  team_id_2 UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dismissed_by UUID
);

ALTER TABLE public.dismissed_team_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed team duplicates"
ON public.dismissed_team_duplicates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
