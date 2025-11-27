-- =====================================================
-- Migration: Standardiser Business Day à 6h (au lieu de 4h)
-- Description: Passer de INTERVAL '4 hours' à INTERVAL '6 hours'
--              pour mieux correspondre aux horaires réels des bars
-- Raison: 4h est trop tôt, 6h couvre mieux les cas d'usage
-- Author: AI Assistant
-- Date: 2025-11-27
-- =====================================================

-- =====================================================
-- PARTIE 1: daily_sales_summary_mat
-- =====================================================

-- Supprimer l'ancienne vue matérialisée
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat CASCADE;

-- Recréer avec INTERVAL '6 hours' (au lieu de 4)
CREATE MATERIALIZED VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  -- Business Day: On décale de 6h (clôture à 06:00) - CHANGÉ DE 4h
  DATE(s.created_at - INTERVAL '6 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours') AS sale_month,

  -- Compteurs
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected_count,

  -- Revenus bruts (avant retours)
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,

  -- Items vendus
  COALESCE(
    SUM(
      (SELECT SUM((item->>'quantity')::integer)
       FROM jsonb_array_elements(s.items) AS item)
    ) FILTER (WHERE s.status = 'validated'),
    0
  ) AS total_items_sold,

  -- Retours (ajusté pour le même business day)
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'approved') AS returns_approved_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'pending') AS returns_pending_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'rejected') AS returns_rejected_count,

  COALESCE(
    SUM(r.refund_amount) FILTER (WHERE r.status = 'approved' AND r.refund_amount IS NOT NULL),
    0
  ) AS total_refunded,

  -- Revenu net (après retours approuvés)
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) -
  COALESCE(
    SUM(r.refund_amount) FILTER (WHERE r.status = 'approved' AND r.refund_amount IS NOT NULL),
    0
  ) AS net_revenue,

  -- Métadonnées
  NOW() AS updated_at

FROM sales s
LEFT JOIN returns r ON r.sale_id = s.id
  AND r.bar_id = s.bar_id
  AND DATE(r.returned_at - INTERVAL '6 hours') = DATE(s.created_at - INTERVAL '6 hours')  -- CHANGÉ DE 4h
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY
  s.bar_id,
  DATE(s.created_at - INTERVAL '6 hours'),  -- CHANGÉ DE 4h
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours'),  -- CHANGÉ DE 4h
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours');  -- CHANGÉ DE 4h

-- Recréer les index
CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- Recréer la vue publique avec RLS
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Rafraîchir avec les nouvelles données
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;

-- Permissions
GRANT SELECT ON daily_sales_summary TO authenticated;

COMMENT ON MATERIALIZED VIEW daily_sales_summary_mat IS
  'Statistiques journalières avec Business Day à 6h (migration 058)';

-- =====================================================
-- PARTIE 2: top_products_by_period_mat
-- =====================================================

-- Supprimer l'ancienne vue matérialisée
DROP MATERIALIZED VIEW IF EXISTS top_products_by_period_mat CASCADE;

-- Recréer avec INTERVAL '6 hours' (au lieu de 4)
CREATE MATERIALIZED VIEW top_products_by_period_mat AS
SELECT
  s.bar_id,
  DATE(s.created_at - INTERVAL '6 hours') AS sale_date,  -- CHANGÉ DE 4h
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours') AS sale_week,  -- CHANGÉ DE 4h
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours') AS sale_month,  -- CHANGÉ DE 4h

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
  DATE(s.created_at - INTERVAL '6 hours'),  -- CHANGÉ DE 4h
  DATE_TRUNC('week', s.created_at - INTERVAL '6 hours'),  -- CHANGÉ DE 4h
  DATE_TRUNC('month', s.created_at - INTERVAL '6 hours'),  -- CHANGÉ DE 4h
  (item->>'product_id')::uuid,
  item->>'product_name',
  item->>'product_volume';

-- Index UNIQUE requis pour REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_top_products_mat_pk ON top_products_by_period_mat(bar_id, sale_date, product_id);
CREATE INDEX idx_top_products_mat_bar_date ON top_products_by_period_mat(bar_id, sale_date);
CREATE INDEX idx_top_products_mat_quantity ON top_products_by_period_mat(bar_id, total_quantity DESC);

-- Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW top_products_by_period AS
SELECT *
FROM top_products_by_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Rafraîchir avec les nouvelles données
REFRESH MATERIALIZED VIEW CONCURRENTLY top_products_by_period_mat;

-- Permissions
GRANT SELECT ON top_products_by_period TO authenticated;

COMMENT ON MATERIALIZED VIEW top_products_by_period_mat IS
  'Top produits avec Business Day à 6h (migration 058)';

-- =====================================================
-- RÉSUMÉ DES CHANGEMENTS
-- =====================================================
-- ✅ daily_sales_summary_mat: 4h → 6h
-- ✅ top_products_by_period_mat: 4h → 6h
-- ✅ Index recréés
-- ✅ Vues RLS recréées
-- ✅ Data refresh effectué
--
-- IMPACT: Les ventes faites entre 4h et 6h du matin seront maintenant
--         comptabilisées dans la journée ACTUELLE au lieu de la journée
--         PRÉCÉDENTE. Cela correspond mieux aux horaires réels des bars.
