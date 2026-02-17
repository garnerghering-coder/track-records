
-- Storage bucket for driver photos
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-photos', 'driver-photos', true);

-- Anyone can view driver photos (public bucket)
CREATE POLICY "Public can view driver photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-photos');

-- Admins can upload driver photos
CREATE POLICY "Admins can upload driver photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-photos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Admins can update driver photos
CREATE POLICY "Admins can update driver photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'driver-photos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Admins can delete driver photos
CREATE POLICY "Admins can delete driver photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'driver-photos'
  AND public.has_role(auth.uid(), 'admin')
);

-- Authenticated users can upload claim documents
CREATE POLICY "Users can upload claim documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'claims'
);

-- Storage bucket for claim verification documents (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('claim-documents', 'claim-documents', false);

-- Users can upload their own claim docs
CREATE POLICY "Users can upload claim docs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'claim-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own claim docs
CREATE POLICY "Users can view own claim docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'claim-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can view all claim docs
CREATE POLICY "Admins can view all claim docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'claim-documents'
  AND public.has_role(auth.uid(), 'admin')
);

-- Add document_url to profile_claim_requests
ALTER TABLE public.profile_claim_requests ADD COLUMN document_url TEXT;
