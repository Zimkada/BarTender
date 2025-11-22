-- =====================================================
-- MIGRATION 032: Fix Sales Permissions and RLS
-- Date: 22 Novembre 2025
-- =====================================================

-- 1. Enable RLS on sales table
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- 2. Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales TO authenticated;

-- 3. Drop existing policies to avoid conflicts (clean slate)
DROP POLICY IF EXISTS "Bar members can view sales" ON sales;
DROP POLICY IF EXISTS "Bar members can create sales" ON sales;
DROP POLICY IF EXISTS "Managers can update sales" ON sales;
DROP POLICY IF EXISTS "Managers can delete sales" ON sales;

-- 4. Create new policies

-- SELECT: All bar members can view sales (servers need to see their own, managers all)
-- Optimisation: Servers should ideally only see their own, but for now let's allow bar scope
CREATE POLICY "Bar members can view sales" ON sales
  FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- INSERT: All bar members can create sales (Servers, Managers, Promoters)
CREATE POLICY "Bar members can create sales" ON sales
  FOR INSERT
  WITH CHECK (is_bar_member(bar_id) OR is_super_admin());

-- UPDATE: Only Managers (Promoteur, Gerant) can update (validate/reject) sales
-- Exception: Maybe servers can update their own pending sales? For now, restrict to managers.
CREATE POLICY "Managers can update sales" ON sales
  FOR UPDATE
  USING (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());

-- DELETE: Only Managers can delete sales (e.g. pending errors)
CREATE POLICY "Managers can delete sales" ON sales
  FOR DELETE
  USING (get_user_role(bar_id) IN ('promoteur', 'gerant') OR is_super_admin());

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
