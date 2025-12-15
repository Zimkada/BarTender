-- ========================================================================
-- FIX: Bar Stats Multi Period Accuracy - Use Business Date
-- ========================================================================
-- Problem: The 'bar_stats_multi_period_mat' materialized view uses CURRENT_DATE
--          for date calculations, which is a calendar date, not a business date.
--          This leads to inaccurate statistics when the application operates
--          on a business day concept (e.g., 6 AM cutoff).
-- Solution:
--   1. Create a STABLE SQL function 'get_current_business_date()'
--      that returns the current business date (DATE type) based on a 6 AM cutoff.
--   2. Modify the 'bar_stats_multi_period_mat' materialized view to use
--      'get_current_business_date()' in its subqueries for all period calculations.
-- ========================================================================

-- 1. Create the STABLE function to get the current business date
CREATE OR REPLACE FUNCTION get_current_business_date()
RETURNS DATE AS $$
DECLARE
  v_closing_hour INT := 6;
BEGIN
  RETURN DATE(NOW() AT TIME ZONE 'UTC' - (v_closing_hour || ' hours')::INTERVAL);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_current_business_date() IS 'Returns the current business date (DATE), considering a 6 AM cutoff time.';

-- 2. Drop and recreate the materialized view to use the business date function
DROP MATERIALIZED VIEW IF EXISTS bar_stats_multi_period_mat CASCADE;

CREATE MATERIALIZED VIEW bar_stats_multi_period_mat AS
SELECT
  bar_id,

  -- Aujourd'hui (business day)
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = get_current_business_date()) AS revenue_today,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = get_current_business_date()) AS sales_today,

  -- Hier (business day)
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = get_current_business_date() - 1) AS revenue_yesterday,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date = get_current_business_date() - 1) AS sales_yesterday,

  -- 7 derniers jours (business days, excluding current business day)
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= get_current_business_date() - 7 AND sale_date < get_current_business_date()) AS revenue_7d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= get_current_business_date() - 7 AND sale_date < get_current_business_date()) AS sales_7d,

  -- 30 derniers jours (business days, excluding current business day)
  (SELECT COALESCE(SUM(gross_revenue), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= get_current_business_date() - 30 AND sale_date < get_current_business_date()) AS revenue_30d,
  (SELECT COALESCE(SUM(validated_count), 0)
   FROM daily_sales_summary_mat
   WHERE bar_id = s.bar_id AND sale_date >= get_current_business_date() - 30 AND sale_date < get_current_business_date()) AS sales_30d,

  NOW() AS updated_at

FROM (SELECT DISTINCT bar_id FROM sales) s;

-- Create unique index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_stats_multi_period_mat_pk ON bar_stats_multi_period_mat(bar_id);

-- Ensure the public view is also recreated to use the updated materialized view
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

-- Refresh the materialized view after creation
REFRESH MATERIALIZED VIEW CONCURRENTLY bar_stats_multi_period_mat;
