
-- Allow authenticated users to upload to driver-photos if they own the profile
CREATE POLICY "Drivers can upload own photo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-photos'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.driver_profiles
    WHERE id::text = (storage.foldername(name))[1]
    AND user_id = auth.uid()
  )
);

-- Allow drivers to update their own photo
CREATE POLICY "Drivers can update own photo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'driver-photos'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.driver_profiles
    WHERE id::text = (storage.foldername(name))[1]
    AND user_id = auth.uid()
  )
);
