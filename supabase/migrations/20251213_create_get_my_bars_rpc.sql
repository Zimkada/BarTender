-- =====================================================
-- RPC: Get current user's bars
-- =====================================================

DROP FUNCTION IF EXISTS get_my_bars();

CREATE OR REPLACE FUNCTION get_my_bars()
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
  WHERE bm.user_id = auth.uid()
  AND bm.is_active = true
  AND b.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_my_bars() TO authenticated;

COMMENT ON FUNCTION get_my_bars() IS 'Get all bars the currently authenticated user is a member of.';
