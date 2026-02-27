-- Migration: Document security_invoker correction (audit trail)
-- Context:
--   Migration 20260225000500_fix_security_advisor.sql set security_invoker = true
--   on 5 analytical views with the comment:
--     "Évite que les vues s'exécutent avec les droits du créateur (postgres)"
--
--   This logic is INCORRECT:
--     security_invoker = true  → view executes with CALLER's permissions (not owner)
--     security_invoker = false → view executes with OWNER's permissions (postgres)
--
--   The resulting strategy in 20260225000500 was:
--     - Views execute as authenticated user (security_invoker=true)
--     - WHERE auth.uid() filter protects data
--     - BUT: authenticated users have NO GRANT on underlying _mat views
--     - Result: "permission denied" (42501) on all vues matérialisées
--
--   Correction (migration 20260226120000):
--     - Revert to security_invoker = false (execute as postgres)
--     - Add security_barrier = true (prevent predicate pushdown attacks)
--     - Explicit RLS filter via EXISTS on bar_members
--     - REVOKE on _mat, GRANT only on public view
--
-- This is the correct pattern for accessing materialized views from RLS-controlled views.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security

COMMENT ON VIEW public.daily_sales_summary IS
  'security_invoker = false (corrected from 20260225000500). '
  'Executes as owner (postgres) to access underlying daily_sales_summary_mat. '
  'RLS filter: bar_members WHERE user_id = auth.uid() AND is_active = true.';

COMMENT ON VIEW public.expenses_summary IS
  'security_invoker = false (corrected from 20260225000500). '
  'Executes as owner (postgres) to access underlying expenses_summary_mat. '
  'RLS filter: bar_members WHERE user_id = auth.uid() AND is_active = true.';

COMMENT ON VIEW public.salaries_summary IS
  'security_invoker = false (corrected from 20260225000500). '
  'Note: salaries_summary_mat is a regular VIEW, not materialized. '
  'security_invoker=false chosen for consistency, though not strictly needed for regular views. '
  'RLS filter: bar_members WHERE user_id = auth.uid() AND is_active = true.';

COMMENT ON VIEW public.top_products_by_period IS
  'security_invoker = false (corrected from 20260225000500). '
  'Executes as owner (postgres) to access underlying top_products_by_period_mat. '
  'RLS filter: bar_members WHERE user_id = auth.uid() AND is_active = true.';

COMMENT ON VIEW public.bar_stats_multi_period IS
  'security_invoker = false (corrected from 20260225000500). '
  'Executes as owner (postgres) to access underlying bar_stats_multi_period_mat. '
  'RLS filter: bar_members WHERE user_id = auth.uid() AND is_active = true.';
