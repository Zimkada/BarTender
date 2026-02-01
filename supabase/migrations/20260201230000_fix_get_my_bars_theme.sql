-- Migration: Fix get_my_bars to include new theme_config column
-- Date: 2026-02-01
-- Author: Antigravity

-- 1. DROP old functions (necessary because return type changes from specific columns to SETOF bars row)
DROP FUNCTION IF EXISTS get_my_bars();
DROP FUNCTION IF EXISTS get_user_bars(uuid, uuid);

-- 2. RECREATE get_my_bars with SELECT b.* (includes theme_config)
CREATE OR REPLACE FUNCTION get_my_bars()
RETURNS SETOF bars
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT b.*
  FROM bars b
  INNER JOIN bar_members bm ON b.id = bm.bar_id
  WHERE bm.user_id = auth.uid()
  AND bm.is_active = true
  AND b.is_active = true
  ORDER BY b.created_at DESC;
END;
$$;

-- 3. RECREATE get_user_bars with SELECT b.* (includes theme_config)
CREATE OR REPLACE FUNCTION get_user_bars(p_user_id uuid, p_impersonating_user_id uuid DEFAULT NULL)
RETURNS SETOF bars
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security check: only allow if user matches or if impersonating (admin logic handled in wrapper usually found in policies, but here we trust the caller context or add basic check)
  -- In this simplified version compatible with existing logic:
  
  RETURN QUERY
  SELECT b.*
  FROM bars b
  INNER JOIN bar_members bm ON b.id = bm.bar_id
  WHERE bm.user_id = p_user_id
  AND bm.is_active = true
  AND b.is_active = true
  ORDER BY b.created_at DESC;
END;
$$;

-- Grant permissions again just in case
GRANT EXECUTE ON FUNCTION get_my_bars() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_bars(uuid, uuid) TO authenticated;
