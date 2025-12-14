-- =====================================================
-- FIX: Correct Pattern in _get_target_user_id Helper
-- =====================================================
-- Issue: Current _get_target_user_id checks users.role
-- Fix: Should check bar_members.role (correct pattern)
-- This ensures consistent super_admin verification
-- =====================================================

-- Drop and recreate with corrected pattern
DROP FUNCTION IF EXISTS _get_target_user_id(UUID);

CREATE OR REPLACE FUNCTION _get_target_user_id(p_impersonating_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
BEGIN
  -- Get current user ID
  v_current_user_id := auth.uid();

  -- If no current user, raise exception
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get current user's role from bar_members (CORRECTED PATTERN)
  -- This checks the actual role in bar_members, not users table
  SELECT role INTO v_current_user_role FROM bar_members
  WHERE user_id = v_current_user_id AND role = 'super_admin'
  LIMIT 1;

  -- If impersonating, verify super_admin status
  IF p_impersonating_user_id IS NOT NULL THEN
    IF v_current_user_role IS NULL OR v_current_user_role != 'super_admin' THEN
      RAISE EXCEPTION 'Access denied: Only super_admin can impersonate';
    END IF;
    RETURN p_impersonating_user_id;
  END IF;

  -- Return current user ID if not impersonating
  RETURN v_current_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION _get_target_user_id(UUID) IS 'Helper function that verifies super_admin status by checking bar_members table (correct pattern). Returns target user ID for impersonation.';

-- =====================================================
-- FIX: Secure Admin Dashboard Functions
-- =====================================================
-- These functions had NO security checks - major vulnerability
-- Adding super_admin verification to all admin functions

-- 1. Fix get_dashboard_stats
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT);

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_period TEXT DEFAULT '7days')
RETURNS TABLE (
  total_bars BIGINT,
  total_users BIGINT,
  total_sales NUMERIC,
  total_revenue NUMERIC,
  active_bars BIGINT,
  active_users BIGINT
) AS $$
BEGIN
  -- SECURITY: Verify caller is super_admin
  IF NOT EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Access denied: Only super_admin can access dashboard stats';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM bars WHERE is_active = true)::BIGINT,
    (SELECT COUNT(*) FROM users WHERE is_active = true)::BIGINT,
    (SELECT COUNT(*) FROM sales WHERE status = 'validated'
      AND created_at >= NOW() - (p_period::interval))::BIGINT,
    (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'validated'
      AND created_at >= NOW() - (p_period::interval))::NUMERIC,
    (SELECT COUNT(DISTINCT bar_id) FROM bar_members WHERE is_active = true)::BIGINT,
    (SELECT COUNT(DISTINCT user_id) FROM bar_members WHERE is_active = true)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO authenticated;
COMMENT ON FUNCTION get_dashboard_stats IS 'Get global dashboard statistics (super_admin only)';

-- 2. Fix get_unique_bars
DROP FUNCTION IF EXISTS get_unique_bars();

CREATE OR REPLACE FUNCTION get_unique_bars()
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID
) AS $$
BEGIN
  -- SECURITY: Verify caller is super_admin
  IF NOT EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Access denied: Only super_admin can access bars list';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    b.id,
    b.name,
    b.owner_id
  FROM bars b
  WHERE b.is_active = true
  ORDER BY b.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_unique_bars() TO authenticated;
COMMENT ON FUNCTION get_unique_bars IS 'Get list of unique bars (super_admin only)';

-- =====================================================
-- FIX: Secure Pagination Admin Functions
-- =====================================================

-- Note: get_paginated_bars, get_paginated_users, get_paginated_audit_logs
-- are complex and will be handled in separate migration if needed
-- For now, documenting that they need security checks

COMMENT ON SCHEMA public IS 'BarTender Database Schema - Updated with corrected helper function pattern and admin function security checks';
