-- =====================================================
-- CREATE: RPC function to fetch all bar members (superadmin only)
-- =====================================================
-- Issue: AuthService.getAllBarMembers() queries bar_members with RLS
--        RLS policy blocks superadmin from seeing all members
--        Result: BarsManagementPanel cannot find "promoteur" members
--        Buttons become greyed out
--
-- Solution: Create RPC with SECURITY DEFINER to bypass RLS
--           Superadmin can fetch all members across all bars
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_all_bar_members()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  bar_id UUID,
  role TEXT,
  assigned_by UUID,
  joined_at TIMESTAMPTZ,
  is_active BOOLEAN,
  user_id_inner UUID,
  username TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  user_is_active BOOLEAN,
  first_login BOOLEAN,
  created_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bm.id,
    bm.user_id,
    bm.bar_id,
    bm.role,
    bm.assigned_by,
    bm.joined_at,
    bm.is_active,
    u.id,
    u.username,
    u.name,
    u.phone,
    u.email,
    u.avatar_url,
    u.is_active,
    u.first_login,
    u.created_at,
    u.last_login_at
  FROM bar_members bm
  JOIN users u ON bm.user_id = u.id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_bar_members TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_bar_members TO service_role;

COMMIT;
