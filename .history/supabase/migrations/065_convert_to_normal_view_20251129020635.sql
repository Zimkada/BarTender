-- =====================================================
-- Migration 065: Convertir daily_sales_summary_mat en vue normale
-- Description: Passer de MATERIALIZED VIEW à VIEW normale pour mise à jour temps réel
-- Raison: Les vues matérialisées ne se rafraîchissent pas automatiquement,
--         causant des différences de CA entre Dashboard, Comptabilité après vente
-- Author: AI Assistant
-- Date: 2025-11-29
-- =====================================================

-- Supprimer l'ancienne vue (matérialisée ou normale)
DROP VIEW IF EXISTS daily_sales_summary_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat CASCADE;

-- Créer une vue normale (auto-refresh en temps réel)
CREATE OR REPLACE VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  -- Business Day: On décale de 6h (clôture à 06:00)
  -- Utiliser validated_at pour les ventes validées (date de validation = date du CA)
  DATE(COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours') AS sale_date,
  DATE_TRUNC('week', COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours') AS sale_week,
  DATE_TRUNC('month', COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours') AS sale_month,

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
  AND DATE(r.returned_at - INTERVAL '6 hours') = DATE(COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours')
WHERE COALESCE(s.validated_at, s.created_at) >= NOW() - INTERVAL '365 days'
GROUP BY
  s.bar_id,
  DATE(COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours'),
  DATE_TRUNC('week', COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours'),
  DATE_TRUNC('month', COALESCE(s.validated_at, s.created_at) - INTERVAL '6 hours');

-- Note: Pas d'index sur une vue normale (seulement sur les tables sous-jacentes)
-- Les index sur sales et returns suffisent

-- Recréer la vue publique avec RLS
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Permissions
GRANT SELECT ON daily_sales_summary TO authenticated;

-- Supprimer les triggers qui dépendent de la fonction
DROP TRIGGER IF EXISTS after_sale_refresh_daily_summary ON sales;
DROP TRIGGER IF EXISTS after_return_refresh_daily_summary ON returns;

-- Supprimer les fonctions de rafraîchissement obsolètes
DROP FUNCTION IF EXISTS refresh_daily_sales_summary();
DROP FUNCTION IF EXISTS trigger_refresh_daily_summary();

COMMENT ON VIEW daily_sales_summary_mat IS
  'Statistiques journalières en temps réel (Business Day à 6h). Migration 065: Convertie de MATERIALIZED VIEW vers VIEW normale pour auto-refresh.';
