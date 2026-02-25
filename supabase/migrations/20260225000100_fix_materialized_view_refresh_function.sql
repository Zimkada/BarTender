-- Migration: Fix materialized view refresh function
-- Description: Use direct REFRESH instead of logging to avoid check constraint violation
-- Author: Antigravity
-- Date: 2026-02-25

-- Drop old function that uses problematic logger
DROP FUNCTION IF EXISTS refresh_expenses_summary() CASCADE;

-- Create new function with direct refresh (no logging)
CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY expenses_summary_mat;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_expenses_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_expenses_summary() TO service_role;

-- Test it
SELECT refresh_expenses_summary();
