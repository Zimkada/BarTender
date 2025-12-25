-- MIGRATION: Re-enable RLS on server_name_mappings with proper policies
-- DATE: 2025-12-24
-- PURPOSE: Re-enable Row Level Security now that permissions are in place
--
-- Background: RLS was temporarily disabled for debugging (migration 20251224160000)
-- Now that authenticated users have proper permissions (migration 20251224170000),
-- we can re-enable RLS with the correct policies
--

BEGIN;

-- =====================================================
-- STEP 1: Enable RLS on the table
-- =====================================================
ALTER TABLE public.server_name_mappings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 2: Drop any existing policies
-- =====================================================
DROP POLICY IF EXISTS "server_mappings_select" ON public.server_name_mappings;
DROP POLICY IF EXISTS "server_mappings_insert" ON public.server_name_mappings;
DROP POLICY IF EXISTS "server_mappings_update" ON public.server_name_mappings;
DROP POLICY IF EXISTS "server_mappings_delete" ON public.server_name_mappings;

-- =====================================================
-- STEP 3: Create RLS policies for bar members
-- =====================================================

-- SELECT: Bar members can READ all mappings for their bar
CREATE POLICY "server_mappings_select"
ON public.server_name_mappings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_members.bar_id = server_name_mappings.bar_id
    AND bar_members.user_id = auth.uid()
    AND bar_members.is_active = true
  )
);

-- INSERT: Bar members can INSERT mappings for their bar
CREATE POLICY "server_mappings_insert"
ON public.server_name_mappings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_members.bar_id = server_name_mappings.bar_id
    AND bar_members.user_id = auth.uid()
    AND bar_members.is_active = true
  )
);

-- UPDATE: Bar members can UPDATE mappings for their bar
CREATE POLICY "server_mappings_update"
ON public.server_name_mappings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_members.bar_id = server_name_mappings.bar_id
    AND bar_members.user_id = auth.uid()
    AND bar_members.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_members.bar_id = server_name_mappings.bar_id
    AND bar_members.user_id = auth.uid()
    AND bar_members.is_active = true
  )
);

-- DELETE: Bar members can DELETE mappings for their bar
CREATE POLICY "server_mappings_delete"
ON public.server_name_mappings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE bar_members.bar_id = server_name_mappings.bar_id
    AND bar_members.user_id = auth.uid()
    AND bar_members.is_active = true
  )
);

COMMIT;
