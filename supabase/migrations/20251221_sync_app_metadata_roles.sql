-- Migration: Synchronize app_metadata.role from bar_members table
-- Purpose: Ensure all users have their role in app_metadata for consistency
-- This fixes users created before the app_metadata.role system was implemented

BEGIN;

-- 1. Find all users who are in bar_members but don't have role in app_metadata
-- 2. Update their app_metadata with the role from bar_members

-- For users with NULL or missing role in app_metadata, get the role from bar_members
UPDATE auth.users au
SET raw_app_meta_data =
  CASE
    WHEN raw_app_meta_data IS NULL THEN
      jsonb_build_object('role', bm.role)
    ELSE
      raw_app_meta_data || jsonb_build_object('role', bm.role)
  END,
  updated_at = NOW()
FROM (
  -- Get the primary role for each user (most recent bar_member record)
  SELECT DISTINCT ON (bm.user_id)
    bm.user_id,
    bm.role
  FROM bar_members bm
  WHERE bm.is_active = true
  ORDER BY bm.user_id, bm.joined_at DESC
) bm
WHERE au.id = bm.user_id
AND (
  au.raw_app_meta_data IS NULL
  OR au.raw_app_meta_data->>'role' IS NULL
);

-- Log the changes
DO $$
DECLARE
  updated_count INT;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM auth.users au
  WHERE au.raw_app_meta_data->>'role' IS NOT NULL;

  RAISE NOTICE 'Synchronized app_metadata.role for users. Total users with role: %', updated_count;
END $$;

COMMIT;
