-- Migration: Corriger Top Produits pour inclure les retours (Net Stats)
-- Description: Soustraire les retours des quantités et revenus pour avoir des stats nettes
-- Author: AI Assistant
-- Date: 2025-11-28

-- =====================================================
-- top_products_by_period_mat
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS top_products_by_period_mat CASCADE;

CREATE MATERIALIZED VIEW top_products_by_period_mat AS
SELECT
  s.bar_id,
  DATE(s.created_at - INTERVAL '6 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours') AS sale_month,

  -- Produit
  (item->>'product_id')::uuid AS product_id,
  item->>'product_name' AS product_name,
  item->>'product_volume' AS product_volume,

  -- Agrégations Brutes
  COUNT(DISTINCT s.id) AS transaction_count,
  SUM((item->>'quantity')::integer) AS total_quantity_gross,
  SUM((item->>'total_price')::numeric) AS total_revenue_gross,

  -- Retours (Liés à ces ventes)
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) AS total_quantity_returned,
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) AS total_refunded,

  -- Agrégations Nettes (Ventes - Retours)
  SUM((item->>'quantity')::integer) - 
  COALESCE(SUM(r.quantity_returned) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) 
  AS total_quantity, -- On garde le nom 'total_quantity' pour compatibilité, mais c'est le NET

  SUM((item->>'total_price')::numeric) - 
  COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status IN ('approved', 'restocked') AND r.is_refunded = true), 0) 
  AS total_revenue, -- On garde le nom 'total_revenue' pour compatibilité, mais c'est le NET

  -- Prix moyen (sur le brut pour éviter division par zéro bizarre)
  AVG((item->>'unit_price')::numeric) AS avg_unit_price,

  -- Métadonnées
  NOW() AS updated_at

FROM sales s
CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
-- Jointure pour trouver les retours spécifiques à ce produit dans cette vente
LEFT JOIN returns r ON r.sale_id = s.id 
  AND r.product_id = (item->>'product_id')::uuid

WHERE
  s.status = 'validated'
  AND s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  DATE(s.created_at - INTERVAL '6 hours'),
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours'),
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours'),
  (item->>'product_id')::uuid,
  item->>'product_name',
  item->>'product_volume';

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

-- Permissions
GRANT SELECT ON top_products_by_period TO authenticated;

-- Refresh initial
REFRESH MATERIALIZED VIEW CONCURRENTLY top_products_by_period_mat;

COMMENT ON MATERIALIZED VIEW top_products_by_period_mat IS
  'Top produits (Net des retours) avec Business Day à 6h';
