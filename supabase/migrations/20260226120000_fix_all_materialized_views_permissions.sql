-- Migration: Fix permission denied on all materialized views
-- Description:
--   Fixes "permission denied for materialized view *_mat" (PostgreSQL error 42501)
--   for all views that were created without security_invoker = false.
--
-- Root cause:
--   Regular views were created without explicit security settings, which defaults
--   to security_invoker = true. Some environments may have had this set explicitly.
--   Either way, the view runs with the CALLER's permissions. Since authenticated
--   users have no direct grant on materialized views → "permission denied".
--
-- Fix per view:
--   1. REVOKE direct access to materialized views from authenticated + anon (hardening)
--   2. Recreate regular views with:
--        - security_invoker = false  → runs as view owner (postgres) who has full access
--        - security_barrier = true   → prevents predicate pushdown attacks
--   3. Filter with EXISTS on bar_members (same pattern as daily_sales_summary fix)
--   4. GRANT SELECT on the regular views to authenticated only
--
-- Idempotency:
--   Each view section is an independent DO block with an IF EXISTS guard on the
--   materialized view. If a mat view is missing in the target environment, that
--   section is skipped with a NOTICE. Other sections are unaffected.
--
-- Covers:
--   expenses_summary        → expenses_summary_mat
--   salaries_summary        → salaries_summary_mat
--   top_products_by_period  → top_products_by_period_mat
--   bar_stats_multi_period  → bar_stats_multi_period_mat
--   product_sales_stats     → product_sales_stats_mat
--
-- Previously fixed (20260225210000):
--   daily_sales_summary     → daily_sales_summary_mat

-- ============================================================================
-- 1. expenses_summary
-- ============================================================================
DO $expenses$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'expenses_summary_mat' AND c.relkind = 'm' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '[SKIP] expenses_summary_mat not found in this environment';
    RETURN;
  END IF;

  -- Hardening: revoke from both authenticated and anon
  REVOKE ALL ON public.expenses_summary_mat FROM authenticated;
  REVOKE ALL ON public.expenses_summary_mat FROM anon;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.expenses_summary
    WITH (security_invoker = false, security_barrier = true) AS
    SELECT d.*
    FROM public.expenses_summary_mat d
    WHERE EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = d.bar_id
        AND bm.user_id = auth.uid()
        AND COALESCE(bm.is_active, true) = true
    )
  $view$;

  GRANT SELECT ON public.expenses_summary TO authenticated;

  RAISE NOTICE '[OK] expenses_summary: permissions fixed';
END $expenses$;

-- ============================================================================
-- 2. salaries_summary
-- ============================================================================
DO $salaries$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'salaries_summary_mat' AND c.relkind = 'm' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '[SKIP] salaries_summary_mat not found in this environment';
    RETURN;
  END IF;

  REVOKE ALL ON public.salaries_summary_mat FROM authenticated;
  REVOKE ALL ON public.salaries_summary_mat FROM anon;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.salaries_summary
    WITH (security_invoker = false, security_barrier = true) AS
    SELECT d.*
    FROM public.salaries_summary_mat d
    WHERE EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = d.bar_id
        AND bm.user_id = auth.uid()
        AND COALESCE(bm.is_active, true) = true
    )
  $view$;

  GRANT SELECT ON public.salaries_summary TO authenticated;

  RAISE NOTICE '[OK] salaries_summary: permissions fixed';
END $salaries$;

-- ============================================================================
-- 3. top_products_by_period
-- ============================================================================
DO $top_products$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'top_products_by_period_mat' AND c.relkind = 'm' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '[SKIP] top_products_by_period_mat not found in this environment';
    RETURN;
  END IF;

  REVOKE ALL ON public.top_products_by_period_mat FROM authenticated;
  REVOKE ALL ON public.top_products_by_period_mat FROM anon;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.top_products_by_period
    WITH (security_invoker = false, security_barrier = true) AS
    SELECT d.*
    FROM public.top_products_by_period_mat d
    WHERE EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = d.bar_id
        AND bm.user_id = auth.uid()
        AND COALESCE(bm.is_active, true) = true
    )
  $view$;

  GRANT SELECT ON public.top_products_by_period TO authenticated;

  RAISE NOTICE '[OK] top_products_by_period: permissions fixed';
END $top_products$;

-- ============================================================================
-- 4. bar_stats_multi_period
-- ============================================================================
DO $bar_stats$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'bar_stats_multi_period_mat' AND c.relkind = 'm' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '[SKIP] bar_stats_multi_period_mat not found in this environment';
    RETURN;
  END IF;

  REVOKE ALL ON public.bar_stats_multi_period_mat FROM authenticated;
  REVOKE ALL ON public.bar_stats_multi_period_mat FROM anon;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.bar_stats_multi_period
    WITH (security_invoker = false, security_barrier = true) AS
    SELECT d.*
    FROM public.bar_stats_multi_period_mat d
    WHERE EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = d.bar_id
        AND bm.user_id = auth.uid()
        AND COALESCE(bm.is_active, true) = true
    )
  $view$;

  GRANT SELECT ON public.bar_stats_multi_period TO authenticated;

  RAISE NOTICE '[OK] bar_stats_multi_period: permissions fixed';
END $bar_stats$;

-- ============================================================================
-- 5. product_sales_stats
-- ============================================================================
DO $product_stats$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'product_sales_stats_mat' AND c.relkind = 'm' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE '[SKIP] product_sales_stats_mat not found in this environment';
    RETURN;
  END IF;

  REVOKE ALL ON public.product_sales_stats_mat FROM authenticated;
  REVOKE ALL ON public.product_sales_stats_mat FROM anon;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.product_sales_stats
    WITH (security_invoker = false, security_barrier = true) AS
    SELECT d.*
    FROM public.product_sales_stats_mat d
    WHERE EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.bar_id = d.bar_id
        AND bm.user_id = auth.uid()
        AND COALESCE(bm.is_active, true) = true
    )
  $view$;

  GRANT SELECT ON public.product_sales_stats TO authenticated;

  RAISE NOTICE '[OK] product_sales_stats: permissions fixed';
END $product_stats$;

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
-- security_invoker = false: view executes as owner (postgres/supabase_admin) who
--   has unrestricted access to the underlying materialized views.
-- security_barrier = true: prevents the query planner from pushing WHERE conditions
--   from the outer query into the view (predicate pushdown attack prevention).
-- auth.uid(): always returns the caller's JWT UUID regardless of security_invoker,
--   so the bar_members filter correctly isolates data per user.
-- anon is also revoked from _mat views as a hardening measure, even though the
--   current 403 errors only affect authenticated users.
