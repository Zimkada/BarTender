-- Fix permissions for bar_stats_multi_period view
-- Includes creation of bar_stats_multi_period_mat if it doesn't exist (Fixes 42P01 error)

-- 1. Ensure Materialized View Exists (Dependency)
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

-- Index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_stats_multi_period_mat_pk ON bar_stats_multi_period_mat(bar_id);


-- 2. Create/Replace the View with Correct Permissions
CREATE OR REPLACE VIEW public.bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE
  -- Condition 1: User is a member of the bar (standard access)
  bar_id IN (
    SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid()
  )
  OR
  -- Condition 2: User is a Super Admin (global access)
  EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );

GRANT SELECT ON public.bar_stats_multi_period TO authenticated;
