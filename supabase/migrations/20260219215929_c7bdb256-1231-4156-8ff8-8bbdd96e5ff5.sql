
-- Add car_number to all three result tables
ALTER TABLE public.v2_race_results ADD COLUMN car_number text;
ALTER TABLE public.v2_qualifying_results ADD COLUMN car_number text;
ALTER TABLE public.v2_practice_results ADD COLUMN car_number text;

-- Add source_document_url to sessions
ALTER TABLE public.v2_sessions ADD COLUMN source_document_url text;

-- Create session-documents storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('session-documents', 'session-documents', false);

-- Admin-only upload policy
CREATE POLICY "Admins can upload session documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'session-documents' AND public.has_role(auth.uid(), 'admin'));

-- Admin-only read policy
CREATE POLICY "Admins can read session documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-documents' AND public.has_role(auth.uid(), 'admin'));

-- Admin-only delete policy
CREATE POLICY "Admins can delete session documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'session-documents' AND public.has_role(auth.uid(), 'admin'));
