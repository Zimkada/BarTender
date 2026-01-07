-- =====================================================
-- Migration: Simplify product_sales_stats to use display_name
-- Description: Replace COALESCE(bp.local_name, gp.name) with bp.display_name
-- Author: AI Assistant
-- Date: 2025-11-26
-- =====================================================

-- Drop existing view and materialized view
DROP VIEW IF EXISTS product_sales_stats;
DROP MATERIALIZED VIEW IF EXISTS product_sales_stats_mat;

-- Recreate materialized view with display_name
CREATE MATERIALIZED VIEW product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  bp.bar_id,
  bp.display_name AS product_name, -- ✨ SIMPLIFIED: Use display_name column
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

  -- Coût moyen d'achat (pour calcul coût commande)
  COALESCE(AVG(sup.unit_cost), 0) AS avg_purchase_cost,

  -- Dernière mise à jour
  NOW() AS updated_at

FROM bar_products bp
LEFT JOIN global_products gp ON bp.global_product_id = gp.id
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  AND s.created_at >= NOW() - INTERVAL '30 days'
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text
LEFT JOIN supplies sup ON sup.product_id = bp.id
  AND sup.supplied_at >= NOW() - INTERVAL '90 days'

WHERE bp.is_active = true

GROUP BY
  bp.id, bp.bar_id, bp.display_name, gp.volume, bp.stock, -- ✨ SIMPLIFIED: Use display_name in GROUP BY
  bp.alert_threshold, bp.price, bp.created_at;

-- Recreate indexes
CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);

-- Recreate public view with RLS
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Refresh the view with new data
REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;

-- ✅ PERMISSIONS: Grant access to authenticated users
GRANT SELECT ON product_sales_stats TO authenticated;

COMMENT ON MATERIALIZED VIEW product_sales_stats_mat IS 
  'Product sales statistics using display_name column (optimized in migration 057)';

