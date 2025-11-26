-- 055_add_supplies_to_expenses_summary.sql
-- Ajoute les coûts de réapprovisionnement (supplies) aux dépenses opérationnelles
-- Les supplies sont des dépenses réelles qui doivent apparaître dans la comptabilité

-- 1. Recréer la vue matérialisée avec les supplies inclus
DROP MATERIALIZED VIEW IF EXISTS expenses_summary_mat CASCADE;

CREATE MATERIALIZED VIEW expenses_summary_mat AS
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
  
  -- Supplies (utilise supplied_at au lieu de date)
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
  
  -- Total des dépenses (expenses + supplies)
  COALESCE(SUM(amount), 0) + COALESCE(SUM(supply_cost), 0) AS total_expenses,
  
  -- Dépenses opérationnelles (tout sauf investissements) + supplies
  COALESCE(SUM(amount) FILTER (WHERE category != 'investment'), 0) + COALESCE(SUM(supply_cost), 0) AS operating_expenses,
  
  -- Investissements (uniquement depuis expenses)
  COALESCE(SUM(amount) FILTER (WHERE category = 'investment'), 0) AS investments,
  
  -- Détail par catégorie standard
  COALESCE(SUM(amount) FILTER (WHERE category = 'water'), 0) AS water_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'electricity'), 0) AS electricity_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'maintenance'), 0) AS maintenance_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'supply'), 0) AS supply_expenses,
  
  -- ✨ NOUVEAU: Coût des réapprovisionnements
  COALESCE(SUM(supply_cost), 0) AS supplies_cost,
  
  -- Dépenses personnalisées (custom_category_id)
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

-- Recréer les index
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_summary_mat_pk ON expenses_summary_mat(bar_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_week ON expenses_summary_mat(bar_id, expense_week);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_month ON expenses_summary_mat(bar_id, expense_month);

-- 2. Recréer la vue sécurisée (publique)
CREATE OR REPLACE VIEW expenses_summary AS
SELECT *
FROM expenses_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- 3. Recréer la fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('expenses_summary', 'trigger');
END;
$$;

-- 4. Recréer les triggers
CREATE OR REPLACE FUNCTION trigger_refresh_expenses_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('refresh_stats', 'expenses_summary_mat');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_expense_refresh_summary ON expenses;
DROP TRIGGER IF EXISTS after_supply_refresh_expenses_summary ON supplies;

CREATE TRIGGER after_expense_refresh_summary
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_expenses_summary();

-- ✨ NOUVEAU: Trigger sur supplies
CREATE TRIGGER after_supply_refresh_expenses_summary
AFTER INSERT OR UPDATE OR DELETE ON supplies
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_expenses_summary();

-- 5. Permissions
GRANT SELECT ON expenses_summary TO authenticated;

-- 6. Initial refresh
SELECT refresh_expenses_summary();

COMMENT ON MATERIALIZED VIEW expenses_summary_mat IS 'Résumé quotidien des dépenses (opérationnelles + investissements + réapprovisionnements)';
COMMENT ON COLUMN expenses_summary_mat.operating_expenses IS 'Dépenses opérationnelles + coût des réapprovisionnements';
COMMENT ON COLUMN expenses_summary_mat.supplies_cost IS 'Coût total des réapprovisionnements (supplies)';
