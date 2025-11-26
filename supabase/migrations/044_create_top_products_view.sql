-- 044_create_top_products_view.sql
-- V2: Avec Business Day (-4h) et Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW IF NOT EXISTS top_products_by_period_mat AS
SELECT
  s.bar_id,
  DATE(s.created_at - INTERVAL '4 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours') AS sale_month,

  -- Produit
  (item->>'product_id')::uuid AS product_id,
  item->>'product_name' AS product_name,
  item->>'product_volume' AS product_volume,

  -- Agrégations
  COUNT(DISTINCT s.id) AS transaction_count,
  SUM((item->>'quantity')::integer) AS total_quantity,
  SUM((item->>'total_price')::numeric) AS total_revenue,
  AVG((item->>'unit_price')::numeric) AS avg_unit_price,

  -- Métadonnées
  NOW() AS updated_at

FROM sales s
CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
WHERE
  s.status = 'validated'
  AND s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  DATE(s.created_at - INTERVAL '4 hours'),
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours'),
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours'),
  (item->>'product_id')::uuid,
  item->>'product_name',
  item->>'product_volume';

-- Index
CREATE INDEX IF NOT EXISTS idx_top_products_mat_bar_date ON top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_top_products_mat_quantity ON top_products_by_period_mat(bar_id, total_quantity DESC);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW top_products_by_period AS
SELECT *
FROM top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Permissions
GRANT SELECT ON top_products_by_period TO authenticated;
