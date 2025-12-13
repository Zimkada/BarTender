-- =====================================================
-- ENSURE: Add assigned_at column to bar_members if missing
-- =====================================================

-- Check if column exists, if not add it
ALTER TABLE bar_members
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

-- Now recreate the RPC with the correct column
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
  user_phone TEXT
) AS $$
BEGIN
  IF (auth.jwt()->'user_metadata'->>'impersonation' = 'true' OR
      EXISTS (SELECT 1 FROM bar_members bm_check WHERE bm_check.user_id = auth.uid() AND bm_check.bar_id = p_bar_id AND bm_check.is_active = true)) THEN
    RETURN QUERY
    SELECT
      bm.id,
      bm.bar_id,
      bm.user_id,
      bm.role,
      bm.is_active,
      bm.assigned_by,
      bm.assigned_at,
      u.name,
      u.email,
      u.phone
    FROM bar_members bm
    LEFT JOIN users u ON bm.user_id = u.id
    WHERE bm.bar_id = p_bar_id
    AND bm.is_active = true
    ORDER BY u.name ASC;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_bar_members(UUID) TO authenticated;
