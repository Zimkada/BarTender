-- Migration: Fix daily_sales_summary_mat permissions
-- Description:
--   - Revoke direct access to daily_sales_summary_mat from authenticated users
--   - Recreate daily_sales_summary view with SECURITY DEFINER (security_invoker = false)
--   - Add security_barrier = true to prevent predicate pushdown attacks
--   - Add RLS filter on active bar members
--   This ensures users can only access summary data for bars they're members of

BEGIN;

-- 1. Revoke direct access to materialized view
-- Authenticated users can only access data through the filtered view
REVOKE ALL ON public.daily_sales_summary_mat FROM authenticated;

-- 2. Recreate the view with proper security settings
-- security_invoker = false : uses view owner's permissions (postgres/supabase_admin) to access mat view
-- security_barrier = true  : prevents query planner from optimizing out the WHERE clause
CREATE OR REPLACE VIEW public.daily_sales_summary
WITH (security_invoker = false, security_barrier = true) AS
SELECT d.*
FROM public.daily_sales_summary_mat d
WHERE EXISTS (
  SELECT 1
  FROM public.bar_members bm
  WHERE bm.bar_id = d.bar_id
    AND bm.user_id = auth.uid()
    AND COALESCE(bm.is_active, true) = true
);

-- 3. Grant SELECT on the filtered view (only)
-- Users now access data through this view with RLS applied
GRANT SELECT ON public.daily_sales_summary TO authenticated;

COMMIT;

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
-- Before: authenticated users could query daily_sales_summary_mat directly (403 due to missing grant, but conceptually exposed)
-- After:  authenticated users can ONLY query through daily_sales_summary view which filters by bar_members.bar_id + auth.uid()
--
-- View execution:
-- 1. View owner (postgres) executes the SELECT from daily_sales_summary_mat (has full access)
-- 2. WHERE clause filters to only rows matching auth.uid() and active bar_members
-- 3. Results returned to caller with RLS-like filtering applied
--
-- auth.uid() always returns the JWT token's user UUID, regardless of security_invoker setting,
-- so the filter works correctly for the calling authenticated user.
