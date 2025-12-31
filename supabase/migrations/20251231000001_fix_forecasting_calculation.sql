-- Migration: Fix product_sales_stats_mat calculation logic
-- Description: Adjust daily_average to be based on total period (30 days) instead of only days with sales.
-- Author: Technical Team
-- Date: 2025-12-31

-- DROP existing views to recreate them
DROP VIEW IF EXISTS product_sales_stats;
DROP MATERIALIZED VIEW IF EXISTS product_sales_stats_mat;

-- CREATE optimized materialized view
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

  -- ✨ NEW LOGIC: Daily average smoothed over 30 days (or since creation)
  -- This prevents over-stocking recommendations for sporadic sales.
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400 < 1 THEN 0 -- Less than 1 day old
    ELSE 
      COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0)::float / 
      GREATEST(1, LEAST(30, EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400))
  END AS daily_average,

  -- Jours depuis création du produit
  EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400 AS days_since_creation,

  -- Dernière vente
  MAX(s.created_at) FILTER (WHERE s.status = 'validated') AS last_sale_date,

  -- Jours sans vente
  CASE
    WHEN MAX(s.created_at) FILTER (WHERE s.status = 'validated') IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - MAX(s.created_at) FILTER (WHERE s.status = 'validated'))) / 86400
    ELSE NULL
  END AS days_without_sale,

  -- CUMP
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

-- RECREATE indexes
CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);

-- RECREATE public view with RLS
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- GRANT permissions
GRANT SELECT ON product_sales_stats TO authenticated;

-- DOCUMENTATION
COMMENT ON MATERIALIZED VIEW product_sales_stats_mat IS
  'Product sales statistics with smoothed daily_average (audit correction 20251231)';
