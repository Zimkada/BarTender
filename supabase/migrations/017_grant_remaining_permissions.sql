-- =====================================================
-- MIGRATION 017: Grant permissions on remaining tables
-- Date: 21 Novembre 2025
-- =====================================================

-- Grant permissions to authenticated role for all remaining tables

-- Catalog & Products
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.global_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.global_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bar_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bar_products TO authenticated;

-- Inventory & Supplies
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplies TO authenticated;

-- Sales & Promotions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promotions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_promotions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consignments TO authenticated;

-- Accounting
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expense_categories_custom TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.salaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.initial_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capital_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_transactions TO authenticated;

-- Admin & Audit
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO authenticated;

-- AI
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_insights TO authenticated;

-- Materialized Views
GRANT SELECT ON TABLE public.bar_weekly_stats TO authenticated;

-- Grant usage on sequences (important for auto-increment if used, though we use UUIDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Permissions granted on all remaining tables for authenticated role';
END $$;
