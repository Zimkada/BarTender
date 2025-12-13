-- =====================================================
-- MIGRATION: Enable RLS bypass for impersonation
-- Allows impersonated users to access data via JWT metadata flag
-- Date: 13 Décembre 2025
-- =====================================================

-- Helper function to check if user is impersonating
CREATE OR REPLACE FUNCTION is_impersonating() RETURNS BOOLEAN AS $$
  SELECT auth.jwt()->'user_metadata'->>'impersonation' = 'true';
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- UPDATE BARS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view their bars" ON bars;
CREATE POLICY "Bar members can view their bars"
  ON bars FOR SELECT
  USING (
    is_bar_member(id)
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE BAR_MEMBERS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Members can view bar members" ON bar_members;
CREATE POLICY "Members can view bar members"
  ON bar_members FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can add members" ON bar_members;
CREATE POLICY "Managers can add members"
  ON bar_members FOR INSERT
  WITH CHECK (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update members" ON bar_members;
CREATE POLICY "Managers can update members"
  ON bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_impersonating()
  );

-- =====================================================
-- UPDATE BAR_CATEGORIES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view bar categories" ON bar_categories;
CREATE POLICY "Bar members can view bar categories"
  ON bar_categories FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create bar categories" ON bar_categories;
CREATE POLICY "Managers can create bar categories"
  ON bar_categories FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update bar categories" ON bar_categories;
CREATE POLICY "Managers can update bar categories"
  ON bar_categories FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can delete bar categories" ON bar_categories;
CREATE POLICY "Managers can delete bar categories"
  ON bar_categories FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE BAR_PRODUCTS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view bar products" ON bar_products;
CREATE POLICY "Bar members can view bar products"
  ON bar_products FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create bar products" ON bar_products;
CREATE POLICY "Managers can create bar products"
  ON bar_products FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update bar products" ON bar_products;
CREATE POLICY "Managers can update bar products"
  ON bar_products FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can delete bar products" ON bar_products;
CREATE POLICY "Managers can delete bar products"
  ON bar_products FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE SUPPLIES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view supplies" ON supplies;
CREATE POLICY "Bar members can view supplies"
  ON supplies FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create supplies" ON supplies;
CREATE POLICY "Managers can create supplies"
  ON supplies FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update supplies" ON supplies;
CREATE POLICY "Managers can update supplies"
  ON supplies FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE PROMOTIONS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view promotions" ON promotions;
CREATE POLICY "Bar members can view promotions"
  ON promotions FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create promotions" ON promotions;
CREATE POLICY "Managers can create promotions"
  ON promotions FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update promotions" ON promotions;
CREATE POLICY "Managers can update promotions"
  ON promotions FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can delete promotions" ON promotions;
CREATE POLICY "Managers can delete promotions"
  ON promotions FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE SALES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view sales" ON sales;
CREATE POLICY "Bar members can view sales"
  ON sales FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Bar members can create sales" ON sales;
CREATE POLICY "Bar members can create sales"
  ON sales FOR INSERT
  WITH CHECK (
    is_bar_member(bar_id) OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update sales" ON sales;
CREATE POLICY "Managers can update sales"
  ON sales FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can delete sales" ON sales;
CREATE POLICY "Managers can delete sales"
  ON sales FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE SALE_PROMOTIONS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view sale promotions" ON sale_promotions;
CREATE POLICY "Bar members can view sale promotions"
  ON sale_promotions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_promotions.sale_id
      AND (is_bar_member(sales.bar_id) OR is_super_admin() OR is_impersonating())
    )
  );

DROP POLICY IF EXISTS "System can create sale promotions" ON sale_promotions;
CREATE POLICY "System can create sale promotions"
  ON sale_promotions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_promotions.sale_id
      AND (is_bar_member(sales.bar_id) OR is_impersonating())
    )
  );

-- =====================================================
-- UPDATE RETURNS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view returns" ON returns;
CREATE POLICY "Bar members can view returns"
  ON returns FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create returns" ON returns;
CREATE POLICY "Managers can create returns"
  ON returns FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update returns" ON returns;
CREATE POLICY "Managers can update returns"
  ON returns FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE CONSIGNMENTS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view consignments" ON consignments;
CREATE POLICY "Bar members can view consignments"
  ON consignments FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can create consignments" ON consignments;
CREATE POLICY "Managers can create consignments"
  ON consignments FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can update consignments" ON consignments;
CREATE POLICY "Managers can update consignments"
  ON consignments FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Managers can delete consignments" ON consignments;
CREATE POLICY "Managers can delete consignments"
  ON consignments FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant')
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE EXPENSE_CATEGORIES_CUSTOM POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Bar members can view expense categories" ON expense_categories_custom;
CREATE POLICY "Bar members can view expense categories"
  ON expense_categories_custom FOR SELECT
  USING (
    is_bar_member(bar_id)
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can manage expense categories" ON expense_categories_custom;
CREATE POLICY "Promoteurs can manage expense categories"
  ON expense_categories_custom FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE EXPENSES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Promoteurs can view expenses" ON expenses;
CREATE POLICY "Promoteurs can view expenses"
  ON expenses FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can create expenses" ON expenses;
CREATE POLICY "Promoteurs can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can update expenses" ON expenses;
CREATE POLICY "Promoteurs can update expenses"
  ON expenses FOR UPDATE
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can delete expenses" ON expenses;
CREATE POLICY "Promoteurs can delete expenses"
  ON expenses FOR DELETE
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE SALARIES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Promoteurs can view salaries" ON salaries;
CREATE POLICY "Promoteurs can view salaries"
  ON salaries FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can manage salaries" ON salaries;
CREATE POLICY "Promoteurs can manage salaries"
  ON salaries FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE ACCOUNTING_TRANSACTIONS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Promoteurs can view accounting" ON accounting_transactions;
CREATE POLICY "Promoteurs can view accounting"
  ON accounting_transactions FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "System can create accounting records" ON accounting_transactions;
CREATE POLICY "System can create accounting records"
  ON accounting_transactions FOR INSERT
  WITH CHECK (
    is_bar_member(bar_id) OR is_impersonating()
  );

-- =====================================================
-- UPDATE INITIAL_BALANCES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Promoteurs can view balances" ON initial_balances;
CREATE POLICY "Promoteurs can view balances"
  ON initial_balances FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can manage balances" ON initial_balances;
CREATE POLICY "Promoteurs can manage balances"
  ON initial_balances FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- UPDATE CAPITAL_CONTRIBUTIONS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Promoteurs can view capital" ON capital_contributions;
CREATE POLICY "Promoteurs can view capital"
  ON capital_contributions FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

DROP POLICY IF EXISTS "Promoteurs can manage capital" ON capital_contributions;
CREATE POLICY "Promoteurs can manage capital"
  ON capital_contributions FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur'
    OR is_super_admin()
    OR is_impersonating()
  );

-- =====================================================
-- Success message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies updated for impersonation bypass!';
  RAISE NOTICE 'Impersonated users can now access data via JWT metadata flag';
END $$;
