-- 045_create_bar_stats_multi_period_view.sql
-- V2: Avec Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) + Migration 043 (daily_sales_summary) doivent être appliquées

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW IF NOT EXISTS bar_stats_multi_period_mat AS
SELECT
  bar_id,

  -- Aujourd'hui
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE) AS revenue_today,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE) AS sales_today,

  -- Hier
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE - 1) AS revenue_yesterday,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = CURRENT_DATE - 1) AS sales_yesterday,

  -- 7 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 7 AND sale_date < CURRENT_DATE) AS revenue_7d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 7 AND sale_date < CURRENT_DATE) AS sales_7d,

  -- 30 derniers jours
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 30 AND sale_date < CURRENT_DATE) AS revenue_30d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= CURRENT_DATE - 30 AND sale_date < CURRENT_DATE) AS sales_30d,

  NOW() AS updated_at

FROM (SELECT DISTINCT bar_id FROM sales) s;

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_stats_multi_period_mat_pk ON bar_stats_multi_period_mat(bar_id);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Permissions
GRANT SELECT ON bar_stats_multi_period TO authenticated;
