-- Fix overly-permissive INSERT policy on public.reports (linter: RLS Policy Always True)
-- Keep anonymous reporting possible (reporter_id NULL) while preventing spoofing other users.

DROP POLICY IF EXISTS "Anyone can insert reports" ON public.reports;

CREATE POLICY "Anyone can insert reports"
ON public.reports
FOR INSERT
WITH CHECK (
  reporter_id IS NULL OR reporter_id = auth.uid()
);
