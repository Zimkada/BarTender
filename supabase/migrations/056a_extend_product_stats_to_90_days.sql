-- 056_extend_product_stats_to_90_days.sql
-- Extends product_sales_stats from 30 to 90 days for better forecasting accuracy
-- P1 Optimization: Recommended in PHASE1_REVIEW.md

-- 1. Drop existing view (CASCADE removes dependent objects)
DROP MATERIALIZED VIEW IF EXISTS product_sales_stats_mat CASCADE;

-- 2. Recreate with 90-day history
CREATE MATERIALIZED VIEW product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  bp.bar_id,
  bp.local_name AS product_name,
  bp.volume AS product_volume,
  bp.price AS current_price,
  bp.stock AS current_stock,
  bp.alert_threshold,
  bp.local_category_id AS category_id,

  -- Ventes agrégées sur 90 jours (au lieu de 30)
  COALESCE(COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'validated'), 0) AS validated_sales_count,
  COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0) AS total_quantity_sold,
  COALESCE(SUM((si->>'total_price')::numeric) FILTER (WHERE s.status = 'validated'), 0) AS total_revenue,

  -- Nombre de jours AVEC ventes (pour moyenne journalière précise)
  COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated' AND (si->>'quantity')::integer > 0) AS days_with_sales,

  -- Moyenne journalière RÉELLE (basée uniquement sur jours avec ventes)
  CASE
    WHEN COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated' AND (si->>'quantity')::integer > 0) > 0
    THEN COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0)::float /
         COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated' AND (si->>'quantity')::integer > 0)
    ELSE 0
  END AS daily_average,

  -- Dernière vente
  MAX(s.created_at) FILTER (WHERE s.status = 'validated') AS last_sale_date,

  -- Statistiques prix
  AVG((si->>'unit_price')::numeric) FILTER (WHERE s.status = 'validated') AS avg_unit_price,
  MIN((si->>'unit_price')::numeric) FILTER (WHERE s.status = 'validated') AS min_unit_price,
  MAX((si->>'unit_price')::numeric) FILTER (WHERE s.status = 'validated') AS max_unit_price,

  -- Métadonnées
  NOW() AS updated_at

FROM bar_products bp
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  -- ✨ CHANGEMENT CRITIQUE: 30 days → 90 days
  AND s.created_at >= NOW() - INTERVAL '90 days'
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text
WHERE bp.is_active = true
GROUP BY
  bp.id,
  bp.bar_id,
  bp.local_name,
  bp.volume,
  bp.price,
  bp.stock,
  bp.alert_threshold,
  bp.local_category_id;

-- 3. Recreate indexes
CREATE UNIQUE INDEX idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);
CREATE INDEX idx_product_sales_stats_mat_stock ON product_sales_stats_mat(bar_id, current_stock) WHERE current_stock <= alert_threshold;
CREATE INDEX idx_product_sales_stats_mat_daily_avg ON product_sales_stats_mat(bar_id, daily_average DESC);

-- 4. Recreate public view with RLS
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- 5. Recreate refresh function
CREATE OR REPLACE FUNCTION refresh_product_sales_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('product_sales_stats', 'trigger');
END;
$$;

-- 6. Recreate trigger
CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('refresh_stats', 'product_sales_stats_mat');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_sale_refresh_product_stats ON sales;

CREATE TRIGGER after_sale_refresh_product_stats
AFTER INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_product_stats();

-- 7. Permissions
GRANT SELECT ON product_sales_stats TO authenticated;

-- 8. Initial refresh with 90-day data
SELECT refresh_product_sales_stats();

-- 9. Comments
COMMENT ON MATERIALIZED VIEW product_sales_stats_mat IS 'Statistiques de ventes produits sur 90 jours (optimisé pour prévisions)';
COMMENT ON COLUMN product_sales_stats_mat.daily_average IS 'Moyenne journalière basée sur jours avec ventes (pas sur 90 jours calendaires)';
COMMENT ON COLUMN product_sales_stats_mat.days_with_sales IS 'Nombre de jours avec ventes effectives (pour calcul précis de daily_average)';
