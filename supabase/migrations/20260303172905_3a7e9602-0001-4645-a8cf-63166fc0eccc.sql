
-- Change round_number from integer to text to support values like "1 & 2"
ALTER TABLE public.v2_events ALTER COLUMN round_number TYPE text USING round_number::text;

-- Create storage bucket for article images
INSERT INTO storage.buckets (id, name, public) VALUES ('article-images', 'article-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to article images
CREATE POLICY "Public read access for article images" ON storage.objects
  FOR SELECT USING (bucket_id = 'article-images');

-- Allow authenticated users to upload article images
CREATE POLICY "Authenticated users can upload article images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'article-images');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete article images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'article-images');
