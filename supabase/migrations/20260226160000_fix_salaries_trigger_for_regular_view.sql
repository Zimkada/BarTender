-- Migration: Fix salaries_summary trigger for regular view (not materialized)
-- Context:
--   Migration 20260226130000 updated trigger_refresh_salaries_summary() to call
--   refresh_salaries_summary() directly (not pg_notify).
--
--   BUT: salaries_summary_mat is a regular VIEW (relkind='v'), not a MATERIALIZED VIEW.
--   refresh_salaries_summary() calls refresh_materialized_view_with_logging(), which
--   attempts REFRESH MATERIALIZED VIEW CONCURRENTLY salaries_summary_mat.
--
--   This fails with: ERROR: "salaries_summary_mat" is not a materialized view
--
--   Since the trigger runs inside the INSERT/UPDATE/DELETE transaction on salaries,
--   the error causes the entire transaction to rollback → data loss.
--
-- Fix:
--   Make refresh_salaries_summary() a no-op. Since salaries_summary_mat is a regular
--   view (not materialized), it's always fresh and needs no refresh.

CREATE OR REPLACE FUNCTION refresh_salaries_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 🛡️ NO-OP: salaries_summary_mat is a regular VIEW (relkind='v'), not materialized.
  -- Regular views are always in-sync with their source tables (salaries).
  -- No refresh needed. Calling REFRESH MATERIALIZED VIEW would fail.
  RAISE DEBUG '[refresh_salaries_summary] No-op: salaries_summary_mat is a regular view, not materialized';
END;
$$;

COMMENT ON FUNCTION refresh_salaries_summary IS
  'No-op: salaries_summary_mat is a regular VIEW, not a materialized view. '
  'Regular views are always fresh. This function exists for API compatibility.';
