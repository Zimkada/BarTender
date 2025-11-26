-- 043_create_daily_sales_summary_view.sql
-- V2: Avec Business Day (-4h) et Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_sales_summary_mat AS
SELECT
  s.bar_id,
  -- Business Day: On décale de 4h (clôture à 04:00)
  DATE(s.created_at - INTERVAL '4 hours') AS sale_date,
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours') AS sale_week,
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours') AS sale_month,

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

  -- Par méthode de paiement (colonnes non disponibles - à implémenter plus tard)
  0 AS cash_revenue,
  0 AS mobile_revenue,
  0 AS card_revenue,

  -- Serveurs actifs (utilise created_by au lieu de sold_by)
  COUNT(DISTINCT s.created_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW() AS updated_at

FROM sales s
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY 
  s.bar_id, 
  DATE(s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours');

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_daily_sales_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Logging inspiré de migration 036
  RAISE NOTICE '[refresh_daily_sales_summary] Starting refresh...';
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE '[refresh_daily_sales_summary] ✓ Refreshed % days', v_row_count;
END;
$$;

-- Trigger après vente (réutilise le trigger function si possible, mais ici on en crée un spécifique ou on ajoute à l'existant)
-- Pour simplifier, on crée un trigger dédié qui appelle la fonction de refresh
CREATE OR REPLACE FUNCTION trigger_refresh_daily_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('refresh_stats', 'daily_sales_summary_mat');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_sale_refresh_daily_summary ON sales;

CREATE TRIGGER after_sale_refresh_daily_summary
AFTER INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_daily_summary();

-- Permissions
GRANT SELECT ON daily_sales_summary TO authenticated;
