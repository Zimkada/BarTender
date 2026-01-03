-- Migration: 068_update_views_business_date.sql
-- Description: Mise à jour des vues matérialisées pour utiliser la colonne business_date

-- ==============================================================================
-- 1. TOP PRODUCTS
-- ==============================================================================

DROP VIEW IF EXISTS top_products_by_period;
DROP MATERIALIZED VIEW IF EXISTS top_products_by_period_mat;

CREATE MATERIALIZED VIEW top_products_by_period_mat AS
SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  -- Produit (ID unique pour le groupement)
 (item->>'product_id')::uuid AS product_id,

  -- On prend la première valeur non-nulle pour le nom et le volume
  MIN(item->>'product_name') AS product_name,
  MIN(item->>'product_volume') AS product_volume,

  -- Agrégations Brutes
  COUNT(DISTINCT s.id) AS transaction_count,
  SUM((item->>'quantity')::integer) AS total_quantity_gross,
  SUM((item->>'total_price')::numeric) AS total_revenue_gross,

  -- Retours
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) 
    AS total_quantity_returned,
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)
    AS total_refunded,

  -- Agrégations Nettes
  SUM((item->>'quantity')::integer) -
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)
    AS total_quantity,

 SUM((item->>'total_price')::numeric) -
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0)
    AS total_revenue,

  AVG((item->>'unit_price')::numeric) AS avg_unit_price,

 NOW() AS updated_at

FROM sales s
CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
LEFT JOIN returns r ON r.sale_id = s.id
  AND r.product_id = (item->>'product_id')::uuid

WHERE
  s.status = 'validated'
  AND s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  s.business_date,
  DATE_TRUNC('week', s.business_date),
  DATE_TRUNC('month', s.business_date),
  (item->>'product_id')::uuid;

 -- Index
CREATE UNIQUE INDEX idx_top_products_mat_pk ON top_products_by_period_mat(bar_id, sale_date, product_id);
CREATE INDEX idx_top_products_mat_bar_date ON top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX idx_top_products_mat_quantity ON top_products_by_period_mat(bar_id, total_quantity DESC);

-- Vue Publique
CREATE OR REPLACE VIEW top_products_by_period AS
SELECT *
FROM top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON top_products_by_period TO authenticated;


-- ==============================================================================
-- 2. DAILY SALES SUMMARY
-- ==============================================================================

-- Drop dependent views first (cascade order matters)
DROP VIEW IF EXISTS bar_stats_multi_period;
DROP MATERIALIZED VIEW IF EXISTS bar_stats_multi_period_mat;

-- Then drop the main view
DROP VIEW IF EXISTS daily_sales_summary;
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat;

CREATE MATERIALIZED VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  -- Utilisation directe de business_date
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  -- Compteurs
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected_count,

  -- Revenus bruts
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,
  COALESCE(SUM(s.subtotal) FILTER (WHERE s.status = 'validated'), 0) AS gross_subtotal,
  COALESCE(SUM(s.discount_total) FILTER (WHERE s.status = 'validated'), 0) AS total_discounts,

  -- Nombre d'items vendus
  COALESCE(SUM(
    (SELECT SUM((item->>'quantity')::integer)
     FROM jsonb_array_elements(s.items) AS item)
  ) FILTER (WHERE s.status = 'validated'), 0) AS total_items_sold,

  -- Panier moyen
  CASE
    WHEN COUNT(*) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) /
         COUNT(*) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS avg_basket_value,

  -- Par méthode de paiement (placeholders)
  0 AS cash_revenue,
  0 AS mobile_revenue,
  0 AS card_revenue,

  -- Serveurs actifs
  COUNT(DISTINCT s.sold_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW() AS updated_at

FROM sales s
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY 
  s.bar_id, 
  s.business_date, 
  DATE_TRUNC('week', s.business_date), 
  DATE_TRUNC('month', s.business_date);

-- Index
CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- Vue Publique
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON daily_sales_summary TO authenticated;

-- ==============================================================================
-- 3. BAR STATS MULTI PERIOD (recreate dependent view)
-- ==============================================================================

CREATE MATERIALIZED VIEW bar_stats_multi_period_mat AS
SELECT
  dss.bar_id,
  dss.sale_date,
  dss.sale_week,
  dss.sale_month,
  dss.pending_count,
  dss.validated_count,
  dss.rejected_count,
  dss.gross_revenue,
  dss.gross_subtotal,
  dss.total_discounts,
  dss.total_items_sold,
  dss.avg_basket_value,
  dss.cash_revenue,
  dss.mobile_revenue,
  dss.card_revenue,
  dss.active_servers,
  dss.first_sale_time,
  dss.last_sale_time,
  NOW() AS updated_at
FROM daily_sales_summary_mat dss;

CREATE UNIQUE INDEX idx_bar_stats_mat_pk ON bar_stats_multi_period_mat(bar_id, sale_date);

CREATE OR REPLACE VIEW bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON bar_stats_multi_period TO authenticated;

-- Refresh initial (in correct order: dependencies first)
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;
REFRESH MATERIALIZED VIEW CONCURRENTLY bar_stats_multi_period_mat;
REFRESH MATERIALIZED VIEW CONCURRENTLY top_products_by_period_mat;
