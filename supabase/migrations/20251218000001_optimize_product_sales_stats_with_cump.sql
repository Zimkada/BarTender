-- Migration: Optimize product_sales_stats to use current_average_cost
-- Description: Replace AVG(sup.unit_cost) calculation with direct current_average_cost column
-- Author: Technical Team
-- Date: 2025-12-18

-- =====================================================
-- Drop existing materialized view and view
-- =====================================================

DROP VIEW IF EXISTS product_sales_stats;
DROP MATERIALIZED VIEW IF EXISTS product_sales_stats_mat;

-- =====================================================
-- Recreate materialized view using current_average_cost
-- =====================================================

CREATE MATERIALIZED VIEW product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  bp.bar_id,
  bp.display_name AS product_name,
  COALESCE(gp.volume, '') AS product_volume,
  bp.stock AS current_stock,
  bp.alert_threshold,
  bp.price AS selling_price,
  bp.created_at AS product_created_at,

  -- Statistiques des 30 derniers jours
  COUNT(DISTINCT DATE(s.created_at)) AS days_with_sales,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'validated') AS total_transactions,
  COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0) AS total_sold_30d,

  -- Moyenne journalière RÉELLE (basée sur jours avec ventes)
  CASE
    WHEN COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0)::float /
         COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS daily_average,

  -- Jours depuis création du produit
  EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400 AS days_since_creation,

  -- Dernière vente
  MAX(s.created_at) FILTER (WHERE s.status = 'validated') AS last_sale_date,

  -- Jours sans vente (détection rupture)
  CASE
    WHEN MAX(s.created_at) FILTER (WHERE s.status = 'validated') IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - MAX(s.created_at) FILTER (WHERE s.status = 'validated'))) / 86400
    ELSE NULL
  END AS days_without_sale,

  -- ✨ OPTIMIZED: Use current_average_cost instead of recalculating AVG(sup.unit_cost)
  bp.current_average_cost AS avg_purchase_cost,

  -- Dernière mise à jour
  NOW() AS updated_at

FROM bar_products bp
LEFT JOIN global_products gp ON bp.global_product_id = gp.id
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  AND s.created_at >= NOW() - INTERVAL '30 days'
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text

WHERE bp.is_active = true

GROUP BY
  bp.id, bp.bar_id, bp.display_name, gp.volume, bp.stock,
  bp.alert_threshold, bp.price, bp.created_at, bp.current_average_cost;

-- =====================================================
-- Recreate indexes
-- =====================================================

CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);

-- =====================================================
-- Recreate public view with RLS
-- =====================================================

CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- =====================================================
-- Refresh the view with new data
-- =====================================================

REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT SELECT ON product_sales_stats TO authenticated;

-- =====================================================
-- Documentation
-- =====================================================

COMMENT ON MATERIALIZED VIEW product_sales_stats_mat IS
  'Product sales statistics using current_average_cost from bar_products (optimized in migration 20251218000001)';

COMMENT ON COLUMN product_sales_stats_mat.avg_purchase_cost IS
  'CUMP (Coût Unitaire Moyen Pondéré) - Now sourced from bar_products.current_average_cost for performance and accuracy';
