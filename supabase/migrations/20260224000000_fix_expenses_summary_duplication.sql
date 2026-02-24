-- Migration: RESTORED & FIXED duplication in expenses_summary_mat
-- Description: Excludes 'supply' category from expenses table and populates supply_expenses from supplies table.
-- Author: Antigravity
-- Date: 2026-02-24

DROP MATERIALIZED VIEW IF EXISTS expenses_summary_mat CASCADE;

CREATE MATERIALIZED VIEW expenses_summary_mat AS
WITH combined_data AS (
  -- Expenses (EXCLUDE category 'supply' to avoid duplication with supplies table)
  SELECT 
    e.bar_id,
    DATE(e.expense_date) AS expense_date,
    DATE_TRUNC('week', e.expense_date) AS expense_week,
    DATE_TRUNC('month', e.expense_date) AS expense_month,
    e.amount,
    e.category,
    e.custom_category_id,
    e.related_supply_id,
    0::NUMERIC AS supply_cost,
    e.expense_date AS original_date,
    e.id
  FROM expenses e
  -- Fenêtre all-time restaurée selon recommandation expert
  WHERE NOT (e.category = 'supply' AND e.related_supply_id IS NOT NULL) -- 🛡️ FIX : exclure uniquement les dépenses supply déjà liées
  
  UNION ALL
  
  -- Supplies
  SELECT
    s.bar_id,
    DATE(COALESCE(s.supplied_at, s.created_at)) AS expense_date,
    DATE_TRUNC('week', COALESCE(s.supplied_at, s.created_at)) AS expense_week,
    DATE_TRUNC('month', COALESCE(s.supplied_at, s.created_at)) AS expense_month,
    0::NUMERIC AS amount,
    'supply'::TEXT AS category, -- ✨ Restore category for filtering in select
    NULL AS custom_category_id,
    NULL::UUID AS related_supply_id, -- 🛡️ FIX : Cast as UUID to match expenses.related_supply_id type
    s.total_cost AS supply_cost,
    COALESCE(s.supplied_at, s.created_at) AS original_date,
    s.id
  FROM supplies s
)
SELECT
  bar_id,
  expense_date,
  expense_week,
  expense_month,
  
  -- Total des dépenses (expenses + supplies)
  COALESCE(SUM(amount), 0) + COALESCE(SUM(supply_cost), 0) AS total_expenses,
  
  -- Dépenses opérationnelles (tout sauf investissements)
  COALESCE(SUM(amount) FILTER (WHERE category != 'investment'), 0) + COALESCE(SUM(supply_cost), 0) AS operating_expenses,
  
  -- Investissements
  COALESCE(SUM(amount) FILTER (WHERE category = 'investment'), 0) AS investments,
  
  -- Détail par catégorie (✨ supply_expenses maintenant branché sur supply_cost)
  COALESCE(SUM(amount) FILTER (WHERE category = 'water'), 0) AS water_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'electricity'), 0) AS electricity_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'maintenance'), 0) AS maintenance_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'supply'), 0)
    + COALESCE(SUM(supply_cost), 0) AS supply_expenses, -- inclut dépenses supply manuelles + supplies
  
  -- Coût des réapprovisionnements (Alias direct pour plus de clarté dans les vues récentes)
  COALESCE(SUM(supply_cost), 0) AS supplies_cost,
  
  -- Dépenses personnalisées
  COALESCE(SUM(amount) FILTER (WHERE custom_category_id IS NOT NULL), 0) AS custom_expenses,
  
  -- Compteurs
  COUNT(id) FILTER (WHERE amount > 0) AS expense_count,
  COUNT(id) FILTER (WHERE category = 'investment') AS investment_count,
  COUNT(id) FILTER (WHERE supply_cost > 0) AS supply_count,
  
  -- Timestamps
  MIN(original_date) AS first_expense_time,
  MAX(original_date) AS last_expense_time,
  NOW() AS updated_at

FROM combined_data
GROUP BY 
  bar_id, 
  expense_date,
  expense_week,
  expense_month;

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_summary_mat_pk ON expenses_summary_mat(bar_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_week ON expenses_summary_mat(bar_id, expense_week);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_month ON expenses_summary_mat(bar_id, expense_month);

-- View
CREATE OR REPLACE VIEW expenses_summary AS
SELECT *
FROM expenses_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Refresh Function
CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('expenses_summary', 'trigger');
END;
$$;

-- 🛡️ FIX : Appel direct sans passer par le logger (évite la contrainte check sur materialized_view_refresh_log)
REFRESH MATERIALIZED VIEW expenses_summary_mat;
