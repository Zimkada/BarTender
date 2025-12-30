-- Migration : Extend get_bar_members to include inactive members and the owner
-- Description : 1. Supprime le filtre is_active = true pour voir tout le personnel.
--             2. Ajoute le propriétaire (owner_id) via un UNION pour garantir sa visibilité.

DROP FUNCTION IF EXISTS get_bar_members(UUID);
DROP FUNCTION IF EXISTS get_bar_members(UUID, UUID);

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID, p_impersonating_user_id UUID DEFAULT NULL)
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
  username TEXT,
  created_at TIMESTAMPTZ,
  member_is_active BOOLEAN,
  first_login BOOLEAN,
  last_login_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Security check (Impersonation or bar membership)
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id) OR
      EXISTS (SELECT 1 FROM bars b_check WHERE b_check.id = p_bar_id AND b_check.owner_id = auth.uid())) THEN

    -- Disable RLS for this function execution
    SET LOCAL row_security = off;

    RETURN QUERY
    WITH all_members AS (
      -- 1. Regular members (active and inactive)
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

      UNION

      -- 2. Owner as 'promoteur' (if not already in bar_members)
      SELECT
        b.id AS id, -- Use bar ID as placeholder for membership ID
        b.id AS bar_id,
        b.owner_id AS user_id,
        'promoteur'::TEXT AS role,
        TRUE AS is_active,
        NULL::UUID AS assigned_by,
        b.created_at AS assigned_at,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        u.username,
        u.created_at,
        TRUE AS member_is_active,
        u.first_login,
        u.last_login_at,
        b.created_at AS joined_at
      FROM bars b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = p_bar_id
      AND NOT EXISTS (SELECT 1 FROM bar_members bm WHERE bm.bar_id = p_bar_id AND bm.user_id = b.owner_id)
    )
    SELECT * FROM all_members
    ORDER BY user_name ASC NULLS LAST;
  ELSE
    RAISE EXCEPTION 'Unauthorized: User is not a member or owner of this bar';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION get_bar_members(UUID, UUID) IS 'Get all bar members (including inactive) and the owner. Bypasses RLS on users table.';
