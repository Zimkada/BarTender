-- 052_create_expenses_summary_view.sql
-- Vue matérialisée pour les dépenses agrégées par jour
-- Sépare les dépenses opérationnelles des investissements

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW IF NOT EXISTS expenses_summary_mat AS
SELECT
  e.bar_id,
  DATE(e.date) AS expense_date,
  DATE_TRUNC('week', e.date) AS expense_week,
  DATE_TRUNC('month', e.date) AS expense_month,
  
  -- Total des dépenses
  COALESCE(SUM(e.amount), 0) AS total_expenses,
  
  -- Dépenses opérationnelles (tout sauf investissements)
  COALESCE(SUM(e.amount) FILTER (WHERE e.category != 'investment'), 0) AS operating_expenses,
  
  -- Investissements
  COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'investment'), 0) AS investments,
  
  -- Détail par catégorie standard
  COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'water'), 0) AS water_expenses,
  COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'electricity'), 0) AS electricity_expenses,
  COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'maintenance'), 0) AS maintenance_expenses,
  COALESCE(SUM(e.amount) FILTER (WHERE e.category = 'supply'), 0) AS supply_expenses,
  
  -- Dépenses personnalisées (custom_category_id)
  COALESCE(SUM(e.amount) FILTER (WHERE e.custom_category_id IS NOT NULL), 0) AS custom_expenses,
  
  -- Compteurs
  COUNT(*) AS expense_count,
  COUNT(*) FILTER (WHERE e.category = 'investment') AS investment_count,
  
  -- Timestamps
  MIN(e.date) AS first_expense_time,
  MAX(e.date) AS last_expense_time,
  NOW() AS updated_at

FROM expenses e
WHERE e.date >= NOW() - INTERVAL '365 days'
GROUP BY 
  e.bar_id, 
  DATE(e.date),
  DATE_TRUNC('week', e.date),
  DATE_TRUNC('month', e.date);

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_summary_mat_pk ON expenses_summary_mat(bar_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_week ON expenses_summary_mat(bar_id, expense_week);
CREATE INDEX IF NOT EXISTS idx_expenses_summary_mat_month ON expenses_summary_mat(bar_id, expense_month);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW expenses_summary AS
SELECT *
FROM expenses_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- 3. Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('expenses_summary', 'trigger');
END;
$$;

-- 4. Trigger après création/modification de dépense
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

CREATE TRIGGER after_expense_refresh_summary
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_expenses_summary();

-- 5. Permissions
GRANT SELECT ON expenses_summary TO authenticated;

-- 6. Initial refresh
SELECT refresh_expenses_summary();

COMMENT ON MATERIALIZED VIEW expenses_summary_mat IS 'Résumé quotidien des dépenses (opérationnelles + investissements)';
COMMENT ON COLUMN expenses_summary_mat.operating_expenses IS 'Dépenses opérationnelles (hors investissements)';
COMMENT ON COLUMN expenses_summary_mat.investments IS 'Investissements uniquement';
