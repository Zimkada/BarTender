-- =====================================================
-- MIGRATION: Harden RLS Policies for Data Isolation
-- DATE: 2026-02-10
--
-- PURPOSE: 
--   1. Restrict SELECT on sensitive transactional tables.
--   2. Servers should only see records they created or are assigned to.
--   3. Managers, Promoteurs, and Super Admins retain global view.
--
-- TARGET TABLES: sales, returns, tickets, consignments
-- =====================================================

BEGIN;

-- =====================================================
-- 1. HARDEN SALES RLS
-- =====================================================
DROP POLICY IF EXISTS "Bar members can view sales" ON public.sales;

CREATE POLICY "sales_isolation_policy"
  ON public.sales FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR 
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    sold_by = auth.uid() OR
    server_id = auth.uid()
  );

-- =====================================================
-- 2. HARDEN RETURNS RLS
-- =====================================================
DROP POLICY IF EXISTS "Bar members can view returns" ON public.returns;

CREATE POLICY "returns_isolation_policy"
  ON public.returns FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR 
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    returned_by = auth.uid() OR
    server_id = auth.uid()
  );

-- =====================================================
-- 3. HARDEN TICKETS RLS
-- =====================================================
DROP POLICY IF EXISTS "tickets_bar_members_select" ON public.tickets;

CREATE POLICY "tickets_isolation_policy"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR 
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    created_by = auth.uid() OR
    server_id = auth.uid()
  );

-- =====================================================
-- 4. HARDEN CONSIGNMENTS RLS
-- =====================================================
DROP POLICY IF EXISTS "Bar members can view consignments" ON public.consignments;

CREATE POLICY "consignments_isolation_policy"
  ON public.consignments FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR 
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    created_by = auth.uid() OR
    server_id = auth.uid() OR
    original_seller = auth.uid()
  );

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
