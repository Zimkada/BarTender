-- =====================================================
-- MIGRATION 024: Fix All Permissions & Security Definer
-- Date: 21 Novembre 2025
-- =====================================================

-- 1. Fix Helper Functions to be SECURITY DEFINER
-- This ensures they run with owner privileges, bypassing RLS on bar_members
-- preventing recursion and permission issues.

CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = auth.uid()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 2. Fix Global Categories RLS (Force Open for Auth Users)
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view global categories" ON global_categories;
CREATE POLICY "Authenticated users can view global categories" 
ON global_categories FOR SELECT 
TO authenticated 
USING (true);

-- 3. Fix Bar Categories RLS
ALTER TABLE bar_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bar members can view bar categories" ON bar_categories;
CREATE POLICY "Bar members can view bar categories" 
ON bar_categories FOR SELECT 
USING (is_bar_member(bar_id) OR is_super_admin());

-- 4. Fix Bar Products RLS
ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bar members can view bar products" ON bar_products;
CREATE POLICY "Bar members can view bar products" 
ON bar_products FOR SELECT 
USING (is_bar_member(bar_id) OR is_super_admin());

-- 5. Grant permissions to authenticated role (Crucial if missing)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';