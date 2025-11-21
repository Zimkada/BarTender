-- Fix infinite recursion by making helper functions SECURITY DEFINER
-- This allows them to bypass RLS when querying bar_members, preventing the loop

-- 1. auth_user_id (Helper wrapper)
CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 2. is_super_admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid() -- Use auth.uid() directly for safety
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 3. is_bar_member
CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 4. get_user_role
CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = auth.uid()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 5. is_promoteur_or_admin
CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auth_user_id TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION is_bar_member TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_promoteur_or_admin TO authenticated;

COMMENT ON FUNCTION is_bar_member IS 'Check if user is member of bar (SECURITY DEFINER to avoid recursion)';
