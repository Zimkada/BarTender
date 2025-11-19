-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES - V1.0
-- Multi-tenant isolation & role-based access control
-- Date: 19 Janvier 2025
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories_custom ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE initial_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get current user's ID from auth
CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE SQL STABLE;

-- Check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth_user_id()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Check if user is member of a bar
CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth_user_id()
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Get user's role in a bar
CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = auth_user_id()
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Check if user is promoteur or super_admin
CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth_user_id()
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- USERS POLICIES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth_user_id() OR is_super_admin());

-- Super admins can view all users
CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  USING (is_super_admin());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth_user_id());

-- Super admins and promoteurs can create users
CREATE POLICY "Admins can create users"
  ON users FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

-- =====================================================
-- BARS POLICIES
-- =====================================================

-- Bar members can view their bars
CREATE POLICY "Bar members can view their bars"
  ON bars FOR SELECT
  USING (is_bar_member(id) OR is_super_admin());

-- Promoteurs and super_admins can create bars
CREATE POLICY "Promoteurs can create bars"
  ON bars FOR INSERT
  WITH CHECK (is_promoteur_or_admin());

-- Bar owners and promoteurs can update their bars
CREATE POLICY "Bar owners can update bars"
  ON bars FOR UPDATE
  USING (
    is_super_admin() OR
    owner_id = auth_user_id() OR
    get_user_role(id) IN ('promoteur', 'gerant')
  );

-- =====================================================
-- BAR MEMBERS POLICIES
-- =====================================================

-- Members can view other members of their bars
CREATE POLICY "Members can view bar members"
  ON bar_members FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Gerants and promoteurs can add members
CREATE POLICY "Managers can add members"
  ON bar_members FOR INSERT
  WITH CHECK (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant')
  );

-- Managers can update member status
CREATE POLICY "Managers can update members"
  ON bar_members FOR UPDATE
  USING (
    is_super_admin() OR
    get_user_role(bar_id) IN ('promoteur', 'gerant')
  );

-- =====================================================
-- CATALOGUE GLOBAL POLICIES
-- =====================================================

-- Everyone can view global categories
CREATE POLICY "Everyone can view global categories"
  ON global_categories FOR SELECT
  USING (true);

-- Only super admins can manage global categories
CREATE POLICY "Super admins can manage global categories"
  ON global_categories FOR ALL
  USING (is_super_admin());

-- Everyone can view global products
CREATE POLICY "Everyone can view global products"
  ON global_products FOR SELECT
  USING (true);

-- Only super admins can create global products
CREATE POLICY "Super admins can create global products"
  ON global_products FOR INSERT
  WITH CHECK (is_super_admin());

-- Only super admins can update global products
CREATE POLICY "Super admins can update global products"
  ON global_products FOR UPDATE
  USING (is_super_admin());

-- Only super admins can delete global products
CREATE POLICY "Super admins can delete global products"
  ON global_products FOR DELETE
  USING (is_super_admin());

-- =====================================================
-- BAR CATEGORIES POLICIES
-- =====================================================

-- Bar members can view categories of their bar
CREATE POLICY "Bar members can view bar categories"
  ON bar_categories FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Managers can create categories
CREATE POLICY "Managers can create bar categories"
  ON bar_categories FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can update categories
CREATE POLICY "Managers can update bar categories"
  ON bar_categories FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can delete categories
CREATE POLICY "Managers can delete bar categories"
  ON bar_categories FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- BAR PRODUCTS POLICIES
-- =====================================================

-- All bar members can view products
CREATE POLICY "Bar members can view bar products"
  ON bar_products FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Gerants and promoteurs can create products
CREATE POLICY "Managers can create bar products"
  ON bar_products FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can update products
CREATE POLICY "Managers can update bar products"
  ON bar_products FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can delete products
CREATE POLICY "Managers can delete bar products"
  ON bar_products FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- SUPPLIES POLICIES
-- =====================================================

-- Bar members can view supplies
CREATE POLICY "Bar members can view supplies"
  ON supplies FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Managers can create supplies
CREATE POLICY "Managers can create supplies"
  ON supplies FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can update supplies
CREATE POLICY "Managers can update supplies"
  ON supplies FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- PROMOTIONS POLICIES
-- =====================================================

-- Bar members can view promotions
CREATE POLICY "Bar members can view promotions"
  ON promotions FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- Managers can create promotions
CREATE POLICY "Managers can create promotions"
  ON promotions FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can update promotions
CREATE POLICY "Managers can update promotions"
  ON promotions FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can delete promotions
CREATE POLICY "Managers can delete promotions"
  ON promotions FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- SALES POLICIES
-- =====================================================

-- All bar members can view sales of their bar
CREATE POLICY "Bar members can view sales"
  ON sales FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

-- All bar members can create sales
CREATE POLICY "Bar members can create sales"
  ON sales FOR INSERT
  WITH CHECK (is_bar_member(bar_id));

-- Gerants can validate/reject sales
CREATE POLICY "Managers can update sales"
  ON sales FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- Managers can delete sales
CREATE POLICY "Managers can delete sales"
  ON sales FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- SALE PROMOTIONS POLICIES
-- =====================================================

-- Bar members can view sale promotions
CREATE POLICY "Bar members can view sale promotions"
  ON sale_promotions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_promotions.sale_id
      AND (is_bar_member(sales.bar_id) OR is_super_admin())
    )
  );

-- System can create sale promotions
CREATE POLICY "System can create sale promotions"
  ON sale_promotions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_promotions.sale_id
      AND is_bar_member(sales.bar_id)
    )
  );

-- =====================================================
-- RETURNS POLICIES
-- =====================================================

CREATE POLICY "Bar members can view returns"
  ON returns FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "Managers can create returns"
  ON returns FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

CREATE POLICY "Managers can update returns"
  ON returns FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- CONSIGNMENTS POLICIES
-- =====================================================

CREATE POLICY "Bar members can view consignments"
  ON consignments FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "Managers can create consignments"
  ON consignments FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

CREATE POLICY "Managers can update consignments"
  ON consignments FOR UPDATE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

CREATE POLICY "Managers can delete consignments"
  ON consignments FOR DELETE
  USING (
    get_user_role(bar_id) IN ('promoteur', 'gerant') OR
    is_super_admin()
  );

-- =====================================================
-- ACCOUNTING POLICIES
-- =====================================================

-- Expense Categories Custom
CREATE POLICY "Bar members can view expense categories"
  ON expense_categories_custom FOR SELECT
  USING (is_bar_member(bar_id) OR is_super_admin());

CREATE POLICY "Promoteurs can manage expense categories"
  ON expense_categories_custom FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

-- Expenses
CREATE POLICY "Promoteurs can view expenses"
  ON expenses FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can update expenses"
  ON expenses FOR UPDATE
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can delete expenses"
  ON expenses FOR DELETE
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

-- Salaries
CREATE POLICY "Promoteurs can view salaries"
  ON salaries FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can manage salaries"
  ON salaries FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

-- Accounting transactions
CREATE POLICY "Promoteurs can view accounting"
  ON accounting_transactions FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "System can create accounting records"
  ON accounting_transactions FOR INSERT
  WITH CHECK (is_bar_member(bar_id));

-- Initial balances
CREATE POLICY "Promoteurs can view balances"
  ON initial_balances FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can manage balances"
  ON initial_balances FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

-- Capital contributions
CREATE POLICY "Promoteurs can view capital"
  ON capital_contributions FOR SELECT
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

CREATE POLICY "Promoteurs can manage capital"
  ON capital_contributions FOR ALL
  USING (
    get_user_role(bar_id) = 'promoteur' OR
    is_super_admin()
  );

-- =====================================================
-- ADMIN POLICIES
-- =====================================================

-- Only super_admins can view admin notifications
CREATE POLICY "Super admins can view notifications"
  ON admin_notifications FOR ALL
  USING (is_super_admin());

-- Audit logs - read-only for super_admins
CREATE POLICY "Super admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (is_super_admin());

-- System can create audit logs
CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- AI POLICIES
-- =====================================================

-- Users can view their own AI conversations
CREATE POLICY "Users can view own AI conversations"
  ON ai_conversations FOR SELECT
  USING (
    user_id = auth_user_id() OR
    (bar_id IS NOT NULL AND is_bar_member(bar_id)) OR
    is_super_admin()
  );

-- Users can create AI conversations
CREATE POLICY "Users can create AI conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (
    user_id = auth_user_id() OR
    is_super_admin()
  );

-- Users can update their own conversations (feedback)
CREATE POLICY "Users can update own AI conversations"
  ON ai_conversations FOR UPDATE
  USING (
    user_id = auth_user_id() OR
    is_super_admin()
  );

-- Bar members can view AI insights for their bar
CREATE POLICY "Bar members can view AI insights"
  ON ai_insights FOR SELECT
  USING (
    is_bar_member(bar_id) OR
    is_super_admin()
  );

-- System can create AI insights
CREATE POLICY "System can create AI insights"
  ON ai_insights FOR INSERT
  WITH CHECK (true);

-- Bar members can update insights (mark as read/acted upon)
CREATE POLICY "Bar members can update AI insights"
  ON ai_insights FOR UPDATE
  USING (
    is_bar_member(bar_id) OR
    is_super_admin()
  );

-- =====================================================
-- FIN DES POLICIES
-- =====================================================

-- Afficher un message de succès
DO $$
BEGIN
  RAISE NOTICE '✅ Politiques RLS créées avec succès !';
  RAISE NOTICE 'Toutes les tables sont sécurisées avec Row Level Security';
END $$;
