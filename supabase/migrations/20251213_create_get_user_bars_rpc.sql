-- =====================================================
-- RPC: Get user bars bypassing RLS
-- For impersonation: allows super_admin to get bars of impersonated user
-- =====================================================

DROP FUNCTION IF EXISTS get_user_bars(UUID);

CREATE OR REPLACE FUNCTION get_user_bars(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  phone TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN,
  closing_hour INT,
  settings JSONB,
  is_setup_complete BOOLEAN,
  setup_completed_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if user is impersonating OR is bar member
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.is_active = true)) THEN

    RETURN QUERY
    SELECT DISTINCT
      b.id,
      b.name,
      b.address,
      b.phone,
      b.owner_id,
      b.created_at,
      b.is_active,
      b.closing_hour,
      b.settings,
      b.is_setup_complete,
      b.setup_completed_at
    FROM bars b
    INNER JOIN bar_members bm ON b.id = bm.bar_id
    WHERE bm.user_id = p_user_id
    AND bm.is_active = true
    AND b.is_active = true;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_bars(UUID) TO authenticated;

COMMENT ON FUNCTION get_user_bars(UUID) IS 'Get bars for a user, bypassing RLS. Used during impersonation to load user bars without RLS blocking.';
