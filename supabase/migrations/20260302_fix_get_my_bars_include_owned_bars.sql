-- Migration: Fix get_my_bars and get_user_bars to include owned bars
-- Date: 2026-03-02
-- Issue: Managers and servers couldn't see multiple bars they were assigned to
--        because get_my_bars() and get_user_bars() only checked bar_members, not bars.owner_id
--
-- Solution: Use UNION to include:
-- 1. Bars where user has active bar_members entry (gerant, serveur)
-- 2. Bars where user is the owner (promoteur)

CREATE OR REPLACE FUNCTION get_my_bars()
RETURNS SETOF bars
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Bars where user is a member (gerant, serveur)
  SELECT b.*
  FROM bars b
  INNER JOIN bar_members bm ON b.id = bm.bar_id
  WHERE bm.user_id = auth.uid()
  AND bm.is_active = true
  AND b.is_active = true

  UNION

  -- Bars where user is the owner (promoteur)
  SELECT b.*
  FROM bars b
  WHERE b.owner_id = auth.uid()
  AND b.is_active = true

  ORDER BY created_at DESC;
END;
$$;

-- Also fix get_user_bars for consistency (used by impersonation logic)
CREATE OR REPLACE FUNCTION get_user_bars(p_user_id uuid, p_impersonating_user_id uuid DEFAULT NULL)
RETURNS SETOF bars
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Bars where user is a member (gerant, serveur)
  SELECT b.*
  FROM bars b
  INNER JOIN bar_members bm ON b.id = bm.bar_id
  WHERE bm.user_id = p_user_id
  AND bm.is_active = true
  AND b.is_active = true

  UNION

  -- Bars where user is the owner (promoteur)
  SELECT b.*
  FROM bars b
  WHERE b.owner_id = p_user_id
  AND b.is_active = true

  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_bars() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_bars(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION get_my_bars() IS
  'Return all bars accessible to the authenticated user: '
  '1. Bars where user is an active member (gerant, serveur) '
  '2. Bars where user is the owner (promoteur) '
  'Fixed 2026-03-02: Added owner check to support multi-bar for all roles';

COMMENT ON FUNCTION get_user_bars(uuid, uuid) IS
  'Return all bars accessible to a specific user (for impersonation/admin): '
  '1. Bars where user is an active member (gerant, serveur) '
  '2. Bars where user is the owner (promoteur) '
  'Fixed 2026-03-02: Added owner check for consistency with get_my_bars';
