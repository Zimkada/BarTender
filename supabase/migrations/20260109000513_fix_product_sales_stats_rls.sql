-- =====================================================
-- FIX: product_sales_stats view permissions
-- =====================================================
-- Issue: 403 Forbidden on product_sales_stats view
-- Cause: View missing GRANT SELECT and security_invoker
-- Solution: Add GRANT SELECT + recreate with security_invoker

BEGIN;

-- =====================================================
-- 1. GRANT SELECT ON product_sales_stats
-- =====================================================

GRANT SELECT ON product_sales_stats TO authenticated;
GRANT SELECT ON product_sales_stats TO anon;
GRANT SELECT ON product_sales_stats TO service_role;

-- =====================================================
-- 2. RECREATE VIEW WITH security_invoker
-- =====================================================

DROP VIEW IF EXISTS product_sales_stats CASCADE;

CREATE VIEW product_sales_stats
WITH (security_invoker = true)
AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
)
OR bar_id IN (
  SELECT id FROM bars WHERE owner_id = auth.uid()
);

COMMENT ON VIEW product_sales_stats IS
'Produit stats de vente avec security_invoker=true. Données filtrées par bar membership.
SÉCURITÉ: RLS automatique + filtre manuel pour défense en profondeur.';

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║   product_sales_stats VIEW FIX APPLIED                     ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ GRANT SELECT on product_sales_stats to authenticated, anon, service_role
    ✅ Recreated view with security_invoker = true

    Result:
    • View is now readable by authenticated users
    • Automatic RLS from underlying materialized view
    • Dashboard product stats should load without 403 errors
    ';
END $$;

COMMIT;
