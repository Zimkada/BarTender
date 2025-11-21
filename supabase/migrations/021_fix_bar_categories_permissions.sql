-- =====================================================
-- MIGRATION 021: Fix Permissions for Bar Categories
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Managers can manage bar categories" ON bar_categories;
DROP POLICY IF EXISTS "Bar members can view bar categories" ON bar_categories;

-- 2. Re-create policies with correct permissions
-- Allow VIEW for all bar members
CREATE POLICY "Bar members can view bar categories" 
ON bar_categories FOR SELECT 
USING (is_bar_member(bar_id) OR is_super_admin());

-- Allow INSERT for Managers (Promoteur/Gerant)
CREATE POLICY "Managers can insert bar categories" 
ON bar_categories FOR INSERT 
WITH CHECK (
  (get_user_role(bar_id) IN ('promoteur', 'gerant')) OR is_super_admin()
);

-- Allow UPDATE for Managers
CREATE POLICY "Managers can update bar categories" 
ON bar_categories FOR UPDATE 
USING (
  (get_user_role(bar_id) IN ('promoteur', 'gerant')) OR is_super_admin()
);

-- Allow DELETE for Managers
CREATE POLICY "Managers can delete bar categories" 
ON bar_categories FOR DELETE 
USING (
  (get_user_role(bar_id) IN ('promoteur', 'gerant')) OR is_super_admin()
);

-- 3. Ensure authenticated users have table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bar_categories TO authenticated;

-- 4. Force schema reload again to be safe
NOTIFY pgrst, 'reload schema';
