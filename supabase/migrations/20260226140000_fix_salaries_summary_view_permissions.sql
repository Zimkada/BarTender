-- Migration: Fix permission denied on salaries_summary
-- Description:
--   salaries_summary_mat is a regular VIEW (relkind = 'v'), not a materialized
--   view (relkind = 'm'). Migration 20260226120000 guarded with relkind = 'm'
--   and correctly skipped this object — but the permission issue remained.
--
-- Root cause:
--   salaries_summary (public view) has security_invoker = true by default.
--   It queries salaries_summary_mat (also a regular view) with the caller's
--   permissions. Since authenticated users have no GRANT on salaries_summary_mat
--   → PostgreSQL error 42501: "permission denied for view salaries_summary_mat".
--
-- Fix:
--   Recreate salaries_summary with security_invoker = false so it executes as
--   the view owner (postgres) who has full access to salaries_summary_mat.
--   No REVOKE needed on salaries_summary_mat (regular view, not a mat view).

CREATE OR REPLACE VIEW public.salaries_summary
WITH (security_invoker = false, security_barrier = true) AS
SELECT d.*
FROM public.salaries_summary_mat d
WHERE EXISTS (
  SELECT 1
  FROM public.bar_members bm
  WHERE bm.bar_id = d.bar_id
    AND bm.user_id = auth.uid()
    AND COALESCE(bm.is_active, true) = true
);

GRANT SELECT ON public.salaries_summary TO authenticated;
