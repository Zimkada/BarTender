-- =====================================================
-- MIGRATION: Create Storage Bucket for Images
-- Description: Creates a public bucket 'product-images' and sets RLS policies.
-- =====================================================

-- 1. Create the bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on objects (Standard security practice)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES
-- =====================================================

-- READ: Everyone (public) can view images
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

-- WRITE (Insert): Authenticated users can upload
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'product-images' );

-- UPDATE: Authenticated users can update their own uploads (or all if needed)
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'product-images' );

-- DELETE: Authenticated users can delete
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'product-images' );

-- 4. Force schema reload
NOTIFY pgrst, 'reload schema';
