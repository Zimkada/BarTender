-- =====================================================
-- HOTFIX: Relax RLS Policies for Performance & Visibility
-- DATE: 2026-02-14
-- DESCRIPTION:
--   1. Reverts strict "Isolation" for SELECT queries on transaction tables.
--   2. Restores "Bar Member" visibility (Servers can see global bar data).
--   3. Fixes "Available Stock" calculation (Consignments visibility).
--   4. Fixes "Timeout" on large datasets (Simpler policy check).
-- =====================================================

BEGIN;

-- 0. PERFORMANCE CRITIQUE: Index de sécurité pour RLS
-- Indispensable pour éviter le scan séquentiel sur bar_members à chaque requête
-- (Hypothèse confirmée: le refactoring précédent nécessitait cet index pour supporter le RLS strict/hybride)
CREATE INDEX IF NOT EXISTS idx_bar_members_rls_perf 
ON public.bar_members (bar_id, user_id, role);

-- 1. SALES: Allow all bar members to VIEW
DROP POLICY IF EXISTS "sales_isolation_policy" ON public.sales;
DROP POLICY IF EXISTS "Bar members can view sales" ON public.sales; -- Cleanup old

CREATE POLICY "Bar members can view sales"
  ON public.sales FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

-- 2. RETURNS: Allow all bar members to VIEW
DROP POLICY IF EXISTS "returns_isolation_policy" ON public.returns;
DROP POLICY IF EXISTS "Bar members can view returns" ON public.returns;

CREATE POLICY "Bar members can view returns"
  ON public.returns FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

-- 3. TICKETS: Allow all bar members to VIEW
DROP POLICY IF EXISTS "tickets_isolation_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_bar_members_select" ON public.tickets;

CREATE POLICY "tickets_bar_members_select"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

-- 4. CONSIGNMENTS: Allow all bar members to VIEW (Critical for Stock Math)
DROP POLICY IF EXISTS "consignments_isolation_policy" ON public.consignments;
DROP POLICY IF EXISTS "Bar members can view consignments" ON public.consignments;

CREATE POLICY "Bar members can view consignments"
  ON public.consignments FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

COMMIT;

-- Force schema reload to ensure policies happen immediately
NOTIFY pgrst, 'reload schema';
