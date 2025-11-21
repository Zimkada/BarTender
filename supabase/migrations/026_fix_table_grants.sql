-- =====================================================
-- MIGRATION 026: Fix Table Grants for Authenticated Users
-- Date: 21 Novembre 2025
-- Description: Explicitly grant permissions to 'authenticated' role.
-- RLS policies control access, but base permissions are required first.
-- =====================================================

-- 1. Grant ALL on tables that users need to write to
-- (RLS will still restrict actual access based on policies)

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bar_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sale_promotions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supplies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE consignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expense_categories_custom TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE salaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE initial_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE capital_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounting_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bar_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE promotions TO authenticated;

-- 2. Grant SELECT only on global tables (unless super admin, but role-based grants are complex here, 
-- usually 'authenticated' gets all and RLS restricts)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE global_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE global_categories TO authenticated;

-- 3. Admin & AI tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_insights TO authenticated;

-- 4. Sequences (Important for auto-increment if used, though we use UUIDs mostly)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 5. Force schema reload
NOTIFY pgrst, 'reload schema';