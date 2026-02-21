
-- Drop the existing overly broad ALL policy on ai_api_keys
DROP POLICY IF EXISTS "Admins can manage ai_api_keys" ON public.ai_api_keys;

-- Create separate policies: admins can write but NOT read keys from client
-- Edge functions use service_role which bypasses RLS, so they still work fine

CREATE POLICY "Admins can insert ai_api_keys"
ON public.ai_api_keys
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ai_api_keys"
ON public.ai_api_keys
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ai_api_keys"
ON public.ai_api_keys
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- No SELECT policy = no client-side reads of api_key column
-- Service role in edge functions bypasses RLS and can still read keys
