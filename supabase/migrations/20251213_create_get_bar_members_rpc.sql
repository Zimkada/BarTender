-- =====================================================
-- RPC: Get bar members bypassing RLS
-- For impersonation: allows super_admin to get bar members
-- =====================================================

CREATE OR REPLACE FUNCTION get_bar_members(p_bar_id UUID)
RETURNS TABLE (
  id UUID,
  bar_id UUID,
  user_id UUID,
  role TEXT,
  is_active BOOLEAN,
  assigned_by UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT
) AS $$
BEGIN
  -- Check if user is impersonating OR is bar member
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND bar_id = p_bar_id AND is_active = true)) THEN

    RETURN QUERY
    SELECT
      bm.id,
      bm.bar_id,
      bm.user_id,
      bm.role,
      bm.is_active,
      bm.assigned_by,
      bm.created_at,
      u.name,
      u.email,
      u.phone
    FROM bar_members bm
    LEFT JOIN users u ON bm.user_id = u.id
    WHERE bm.bar_id = p_bar_id
    AND bm.is_active = true
    ORDER BY bm.created_at DESC;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID) TO authenticated;

COMMENT ON FUNCTION get_bar_members(UUID) IS 'Get bar members with user details, bypassing RLS. Used during impersonation.';
