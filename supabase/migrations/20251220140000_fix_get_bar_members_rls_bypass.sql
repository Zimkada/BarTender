-- =====================================================
-- FIX: get_bar_members RPC - Bypass RLS on users table
-- Date: 2025-12-20
-- Description: Le RPC get_bar_members était SECURITY DEFINER mais
--              les RLS sur la table 'users' s'appliquaient quand même,
--              retournant NULL pour les colonnes user.name, user.email, user.phone.
--              Solution: Ajouter "SET LOCAL row_security = off;" dans le RPC.
-- =====================================================

DROP FUNCTION IF EXISTS get_bar_members(UUID);

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  user_id UUID,
  role TEXT,
  is_active BOOLEAN,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT,
  -- Nouvelles colonnes pour correspondre au mapping frontend
  username TEXT,
  created_at TIMESTAMPTZ,
  member_is_active BOOLEAN,
  first_login BOOLEAN,
  last_login_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if user is impersonating OR is bar member
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id AND bm_check.is_active = true)) THEN

    -- ✅ CRITICAL FIX: Disable RLS for this function execution
    -- This allows SECURITY DEFINER to actually bypass RLS on the users table
    SET LOCAL row_security = off;

    RETURN QUERY
    SELECT
      bm.id,
      bm.bar_id,
      bm.user_id,
      bm.role,
      bm.is_active,
      bm.assigned_by,
      bm.assigned_at,
      u.name AS user_name,
      u.email AS user_email,
      u.phone AS user_phone,
      u.username,
      u.created_at,
      bm.is_active AS member_is_active,
      u.first_login,
      u.last_login_at,
      bm.assigned_at AS joined_at
    FROM bar_members bm
    LEFT JOIN users u ON bm.user_id = u.id
    WHERE bm.bar_id = p_bar_id
    AND bm.is_active = true
    ORDER BY u.name ASC NULLS LAST;
  ELSE
    RAISE EXCEPTION 'Unauthorized: User is not a member of this bar';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID) TO authenticated;

COMMENT ON FUNCTION get_bar_members(UUID) IS 'Get bar members with user details, properly bypassing RLS on users table. Fixed to return user names correctly.';

-- Log the fix
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed get_bar_members RPC to properly bypass RLS on users table';
  RAISE NOTICE '   - Added SET LOCAL row_security = off;';
  RAISE NOTICE '   - Extended return columns to match frontend mapping';
  RAISE NOTICE '   This should fix the "Inconnu" (Unknown) server name issue';
END $$;
