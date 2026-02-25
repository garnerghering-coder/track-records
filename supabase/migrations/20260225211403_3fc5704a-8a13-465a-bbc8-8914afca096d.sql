
-- Create storage bucket for circuit layout images
INSERT INTO storage.buckets (id, name, public) VALUES ('circuit-layouts', 'circuit-layouts', true);

-- Allow public read access
CREATE POLICY "Circuit layout images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'circuit-layouts');

-- Allow authenticated users to upload (admin check done in app)
CREATE POLICY "Authenticated users can upload circuit layouts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'circuit-layouts' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update circuit layouts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'circuit-layouts' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete circuit layouts"
ON storage.objects FOR DELETE
USING (bucket_id = 'circuit-layouts' AND auth.role() = 'authenticated');
