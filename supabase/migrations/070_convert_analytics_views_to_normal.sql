-- Migration 070: Convert 3 MATERIALIZED VIEWs to normal VIEWs for real-time data
-- Reason: MATERIALIZED VIEWs are stale (last refresh: Dec 28, 2025 / Feb 13, 2026)
--         New expenses, salaries, sales are invisible until manual REFRESH.
--         Solution: Convert to normal VIEWs for real-time data + acceptable perf for dashboard.
--
-- Affected views:
-- 1. daily_sales_summary_mat (last refresh: Feb 13, 2026)
-- 2. expenses_summary_mat (last refresh: Dec 28, 2025)
-- 3. salaries_summary_mat (not checked, but same pattern)

-- ==============================================================================
-- PART 1: DAILY SALES SUMMARY
-- ==============================================================================

DROP VIEW IF EXISTS bar_stats_multi_period;
DROP VIEW IF EXISTS bar_stats_multi_period_mat;
DROP VIEW IF EXISTS daily_sales_summary;
DROP VIEW IF EXISTS daily_sales_summary_mat;

CREATE OR REPLACE VIEW daily_sales_summary_mat AS
SELECT
  s.bar_id,
  s.business_date AS sale_date,
  DATE_TRUNC('week', s.business_date) AS sale_week,
  DATE_TRUNC('month', s.business_date) AS sale_month,

  COUNT(*) FILTER (WHERE s.status = 'pending')   AS pending_count,
  COUNT(*) FILTER (WHERE s.status = 'validated') AS validated_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected')  AS rejected_count,

  COALESCE(SUM(s.total)           FILTER (WHERE s.status = 'validated'), 0) AS gross_revenue,
  COALESCE(SUM(s.subtotal)        FILTER (WHERE s.status = 'validated'), 0) AS gross_subtotal,
  COALESCE(SUM(s.discount_total)  FILTER (WHERE s.status = 'validated'), 0) AS total_discounts,

  COALESCE(SUM(
    (SELECT SUM((item->>'quantity')::integer)
     FROM jsonb_array_elements(s.items) AS item)
  ) FILTER (WHERE s.status = 'validated'), 0) AS total_items_sold,

  CASE
    WHEN COUNT(*) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated'), 0) /
         COUNT(*) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS avg_basket_value,

  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'cash'), 0) AS cash_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'mobile_money'), 0) AS mobile_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method = 'card'), 0) AS card_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'validated' AND s.payment_method NOT IN ('cash', 'mobile_money', 'card')), 0) AS other_revenue,

  COUNT(DISTINCT s.sold_by) FILTER (WHERE s.status = 'validated') AS active_servers,

  MIN(s.created_at) AS first_sale_time,
  MAX(s.created_at) AS last_sale_time,
  NOW()             AS updated_at

FROM sales s
WHERE s.created_at >= NOW() - INTERVAL '365 days'
GROUP BY
  s.bar_id,
  s.business_date,
  DATE_TRUNC('week',  s.business_date),
  DATE_TRUNC('month', s.business_date);

CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT *
FROM daily_sales_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON daily_sales_summary TO authenticated;

-- Recreate bar_stats_multi_period as VIEW too (depends on daily_sales_summary_mat)
CREATE OR REPLACE VIEW bar_stats_multi_period_mat AS
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
  dss.active_servers,
  dss.first_sale_time,
  dss.last_sale_time,
  NOW() AS updated_at
FROM daily_sales_summary_mat dss;

CREATE OR REPLACE VIEW bar_stats_multi_period AS
SELECT *
FROM bar_stats_multi_period_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON bar_stats_multi_period TO authenticated;

-- ==============================================================================
-- PART 2: EXPENSES SUMMARY
-- ==============================================================================

DROP VIEW IF EXISTS expenses_summary CASCADE;
DROP VIEW IF EXISTS expenses_summary_mat CASCADE;

CREATE OR REPLACE VIEW expenses_summary_mat AS
WITH combined_data AS (
  -- Expenses
  SELECT
    e.bar_id,
    DATE(e.date) AS expense_date,
    DATE_TRUNC('week', e.date) AS expense_week,
    DATE_TRUNC('month', e.date) AS expense_month,
    e.amount,
    e.category,
    e.custom_category_id,
    0::NUMERIC AS supply_cost,
    e.date AS original_date,
    e.id
  FROM expenses e
  WHERE e.date >= NOW() - INTERVAL '365 days'

  UNION ALL

  -- Supplies (uses supplied_at instead of date)
  SELECT
    s.bar_id,
    DATE(s.supplied_at) AS expense_date,
    DATE_TRUNC('week', s.supplied_at) AS expense_week,
    DATE_TRUNC('month', s.supplied_at) AS expense_month,
    0::NUMERIC AS amount,
    NULL AS category,
    NULL AS custom_category_id,
    s.total_cost AS supply_cost,
    s.supplied_at AS original_date,
    s.id
  FROM supplies s
  WHERE s.supplied_at >= NOW() - INTERVAL '365 days'
)
SELECT
  bar_id,
  expense_date,
  expense_week,
  expense_month,

  COALESCE(SUM(amount), 0) + COALESCE(SUM(supply_cost), 0) AS total_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category != 'investment'), 0) + COALESCE(SUM(supply_cost), 0) AS operating_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'investment'), 0) AS investments,
  COALESCE(SUM(amount) FILTER (WHERE category = 'water'), 0) AS water_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'electricity'), 0) AS electricity_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'maintenance'), 0) AS maintenance_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'supply'), 0) AS supply_expenses,
  COALESCE(SUM(supply_cost), 0) AS supplies_cost,
  COALESCE(SUM(amount) FILTER (WHERE custom_category_id IS NOT NULL), 0) AS custom_expenses,

  COUNT(id) FILTER (WHERE amount > 0) AS expense_count,
  COUNT(id) FILTER (WHERE category = 'investment') AS investment_count,
  COUNT(id) FILTER (WHERE supply_cost > 0) AS supply_count,

  MIN(original_date) AS first_expense_time,
  MAX(original_date) AS last_expense_time,
  NOW() AS updated_at

FROM combined_data
GROUP BY
  bar_id,
  expense_date,
  expense_week,
  expense_month;

CREATE OR REPLACE VIEW expenses_summary AS
SELECT *
FROM expenses_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON expenses_summary TO authenticated;

-- ==============================================================================
-- PART 3: SALARIES SUMMARY
-- ==============================================================================

DROP VIEW IF EXISTS salaries_summary CASCADE;
DROP VIEW IF EXISTS salaries_summary_mat CASCADE;

CREATE OR REPLACE VIEW salaries_summary_mat AS
SELECT
  sal.bar_id,
  DATE(sal.paid_at) AS payment_date,
  DATE_TRUNC('week', sal.paid_at) AS payment_week,
  DATE_TRUNC('month', sal.paid_at) AS payment_month,

  COALESCE(SUM(sal.amount), 0) AS total_salaries,
  COUNT(*) AS payment_count,
  COUNT(DISTINCT sal.member_id) AS unique_members_paid,

  AVG(sal.amount) AS avg_salary_amount,
  MIN(sal.amount) AS min_salary_amount,
  MAX(sal.amount) AS max_salary_amount,

  MIN(sal.paid_at) AS first_payment_time,
  MAX(sal.paid_at) AS last_payment_time,
  NOW() AS updated_at

FROM salaries sal
WHERE sal.paid_at >= NOW() - INTERVAL '365 days'
GROUP BY
  sal.bar_id,
  DATE(sal.paid_at),
  DATE_TRUNC('week', sal.paid_at),
  DATE_TRUNC('month', sal.paid_at);

CREATE OR REPLACE VIEW salaries_summary AS
SELECT *
FROM salaries_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

GRANT SELECT ON salaries_summary TO authenticated;

-- ==============================================================================
-- Summary
-- ==============================================================================

COMMENT ON VIEW daily_sales_summary_mat IS
  'Real-time daily sales stats (uses business_date). Migration 070: Converted from MATERIALIZED VIEW to normal VIEW for auto-refresh.';

COMMENT ON VIEW expenses_summary_mat IS
  'Real-time daily expenses + supplies. Migration 070: Converted from MATERIALIZED VIEW to normal VIEW for auto-refresh.';

COMMENT ON VIEW salaries_summary_mat IS
  'Real-time daily salary payments. Migration 070: Converted from MATERIALIZED VIEW to normal VIEW for auto-refresh.';
