-- Migration: 20260324000000_restore_net_revenue_to_daily_summary
-- Description: Restaurer net_revenue et refunds_total dans daily_sales_summary_mat
--
-- Problème constaté:
--   La migration 20260213 a recréé daily_sales_summary_mat SANS join returns,
--   supprimant net_revenue. Résultat: la Comptabilité (AccountingOverview) affiche
--   gross_revenue au lieu de net_revenue, tandis que l'Historique calcule le CA NET
--   côté frontend. Les deux pages montrent des montants différents pour le même jour.
--
-- Fix: Utiliser une CTE pour pré-agréger les retours par (bar_id, sale_id) AVANT
--   la jointure, éliminant tout risque de double-comptage des ventes.
-- Aligné avec isConfirmedReturn() côté frontend:
--   status IN ('approved', 'restocked') AND (is_refunded = true OR reason = 'exchange')

-- ==============================================================================
-- 1. DROP cascade (dependencies first)
-- En production, ces objets peuvent être VIEW ou MATERIALIZED VIEW selon
-- l'historique des migrations. On drop les deux types pour être safe.
-- ==============================================================================

DROP VIEW IF EXISTS bar_stats_multi_period CASCADE;
DROP VIEW IF EXISTS bar_stats_multi_period_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS bar_stats_multi_period_mat CASCADE;

DROP VIEW IF EXISTS daily_sales_summary CASCADE;
DROP VIEW IF EXISTS daily_sales_summary_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat CASCADE;


-- ==============================================================================
-- 2. Recreate daily_sales_summary_mat avec CTE retours pré-agrégés
-- ==============================================================================

CREATE MATERIALIZED VIEW daily_sales_summary_mat AS

-- CTE: Pré-agréger les retours confirmés par vente (1 ligne par sale_id)
-- Élimine le risque de multiplication des lignes dans la jointure principale
WITH confirmed_returns AS (
  SELECT
    r.sale_id,
    r.bar_id,
    SUM(r.refund_amount) AS total_refund
  FROM returns r
  WHERE r.status IN ('approved', 'restocked')
    AND r.refund_amount IS NOT NULL
    AND (r.is_refunded = true OR r.reason = 'exchange')
  GROUP BY r.sale_id, r.bar_id
)

SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week',  s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  -- Compteurs (jointure 1:0..1 grâce à la CTE → pas de double-comptage)
  COUNT(*) FILTER (WHERE s.status = 'pending')   AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected')  AS rejected_count,

  -- Revenus bruts
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,
  COALESCE(SUM(s.subtotal)       FILTER (WHERE s.status = 'validated'), 0) AS gross_subtotal,
  COALESCE(SUM(s.discount_total) FILTER (WHERE s.status = 'validated'), 0) AS total_discounts,

  -- Items vendus
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

  -- Par méthode de paiement
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'cash'), 0)         AS cash_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'mobile_money'), 0) AS mobile_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'card'), 0)         AS card_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method NOT IN ('cash', 'mobile_money', 'card')), 0) AS other_revenue,

  -- Retours confirmés (pré-agrégés via CTE, pas de multiplication)
  COALESCE(SUM(cr.total_refund), 0) AS refunds_total,

  -- Revenu net = brut - retours confirmés
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) -
  COALESCE(SUM(cr.total_refund), 0) AS net_revenue,

  -- Serveurs actifs
  COUNT(DISTINCT s.sold_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW()             AS updated_at

FROM sales s
LEFT JOIN confirmed_returns cr
  ON cr.sale_id = s.id
  AND cr.bar_id = s.bar_id

WHERE s.created_at >= NOW() - INTERVAL '365 days'

GROUP BY
  s.bar_id,
  s.business_date,
  DATE_TRUNC('week',  s.business_date),
  DATE_TRUNC('month', s.business_date);


-- Index (identiques à migration 20260213)
CREATE UNIQUE INDEX idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);


-- ==============================================================================
-- 3. Vue publique avec security settings (identique à migration 20260225)
-- ==============================================================================

REVOKE ALL ON public.daily_sales_summary_mat FROM authenticated;

CREATE OR REPLACE VIEW public.daily_sales_summary
WITH (security_invoker = false, security_barrier = true) AS
SELECT d.*
FROM public.daily_sales_summary_mat d
WHERE EXISTS (
  SELECT 1
  FROM public.bar_members bm
  WHERE bm.bar_id = d.bar_id
    AND bm.user_id = auth.uid()
    AND COALESCE(bm.is_active, true) = true
);

GRANT SELECT ON public.daily_sales_summary TO authenticated;


-- ==============================================================================
-- 4. Recréer bar_stats_multi_period (dépend de daily_sales_summary_mat)
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
  dss.other_revenue,
  dss.refunds_total,
  dss.net_revenue,
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


-- ==============================================================================
-- 5. Refresh initial
-- ==============================================================================

REFRESH MATERIALIZED VIEW daily_sales_summary_mat;
REFRESH MATERIALIZED VIEW bar_stats_multi_period_mat;


COMMENT ON MATERIALIZED VIEW daily_sales_summary_mat IS
  'CA journalier avec retours. Migration 20260324: net_revenue via CTE pré-agrégée (pas de double-comptage). Aligné avec isConfirmedReturn() frontend.';
