-- 051_add_returns_to_daily_sales_summary.sql
-- ⚠️ OBSOLÈTE: Cette migration utilise INTERVAL '4 hours'
-- ⚠️ Remplacée par migration 058_standardize_business_day_to_6h.sql
-- ⚠️ Conservée pour historique uniquement
-- Ajoute les retours remboursés à daily_sales_summary (Principe DRY)
-- Cette modification permet à tous les composants d'utiliser la même source pour les retours

-- 1. Recréer la vue matérialisée avec les retours
DROP MATERIALIZED VIEW IF EXISTS daily_sales_summary_mat CASCADE;

CREATE MATERIALIZED VIEW daily_sales_summary_mat AS
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

  -- ✨ NOUVEAU: Retours remboursés (agrégés par jour)
  COALESCE(SUM(r.refund_amount) FILTER (
    WHERE r.status IN ('approved', 'restocked') 
    AND r.is_refunded = true
  ), 0) AS refunds_total,

  -- ✨ NOUVEAU: CA NET = Ventes brutes - Retours remboursés
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) - 
  COALESCE(SUM(r.refund_amount) FILTER (
    WHERE r.status IN ('approved', 'restocked') 
    AND r.is_refunded = true
  ), 0) AS net_revenue,

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

  -- Serveurs actifs
  COUNT(DISTINCT s.created_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  -- Timestamps
  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW() AS updated_at

FROM sales s
LEFT JOIN returns r ON r.sale_id = s.id
  AND r.bar_id = s.bar_id
  AND DATE(r.returned_at - INTERVAL '4 hours') = DATE(s.created_at - INTERVAL '4 hours')
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY 
  s.bar_id, 
  DATE(s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('week', s.created_at - INTERVAL '4 hours'), 
  DATE_TRUNC('month', s.created_at - INTERVAL '4 hours');

-- Recréer les index
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_pk ON daily_sales_summary_mat(bar_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_week ON daily_sales_summary_mat(bar_id, sale_week);
CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_mat_month ON daily_sales_summary_mat(bar_id, sale_month);

-- 2. Recréer la vue sécurisée (publique)
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- 3. Recréer la fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_daily_sales_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  RAISE NOTICE '[refresh_daily_sales_summary] Starting refresh...';
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary_mat;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE '[refresh_daily_sales_summary] ✓ Refreshed % days', v_row_count;
END;
$$;

-- 4. Recréer le trigger
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

-- 5. Ajouter trigger sur returns pour rafraîchir aussi quand un retour est créé/modifié
DROP TRIGGER IF EXISTS after_return_refresh_daily_summary ON returns;

CREATE TRIGGER after_return_refresh_daily_summary
AFTER INSERT OR UPDATE ON returns
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_daily_summary();

-- 6. Permissions
GRANT SELECT ON daily_sales_summary TO authenticated;

-- 7. Initial refresh
SELECT refresh_daily_sales_summary();

COMMENT ON MATERIALIZED VIEW daily_sales_summary_mat IS 'Résumé quotidien des ventes avec retours remboursés (Business Day -4h)';
COMMENT ON COLUMN daily_sales_summary_mat.refunds_total IS 'Total des retours remboursés pour ce jour (DRY: source unique pour tous les composants)';
COMMENT ON COLUMN daily_sales_summary_mat.net_revenue IS 'CA NET = Ventes brutes - Retours remboursés';
