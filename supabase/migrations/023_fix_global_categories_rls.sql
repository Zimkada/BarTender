-- =====================================================
-- MIGRATION 023: Fix Global Categories RLS
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Enable RLS on global_categories (if not already)
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;

-- 2. Allow ALL authenticated users to VIEW global categories
-- This is a catalog, so it should be readable by any logged-in user
DROP POLICY IF EXISTS "Authenticated users can view global categories" ON global_categories;

CREATE POLICY "Authenticated users can view global categories" 
ON global_categories FOR SELECT 
TO authenticated 
USING (true);

-- 3. Verify bar_categories SELECT policy (Reinforce)
-- Ensure that we don't have conflicting policies
DROP POLICY IF EXISTS "Bar members can view bar categories" ON bar_categories;

CREATE POLICY "Bar members can view bar categories" 
ON bar_categories FOR SELECT 
USING (
  -- User is a member of the bar
  is_bar_member(bar_id) 
  OR 
  -- OR User is a super admin
  is_super_admin()
);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
