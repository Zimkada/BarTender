-- Migration: Fix expenses_summary_mat pour les annulations d'approvisionnement
--
-- Problème : la vue inclut toutes les lignes supplies sans filtre.
-- La ligne reverse (total_cost = -X) est datée d'aujourd'hui, mais la ligne
-- originale est datée du jour de l'approvisionnement.
-- → Le SUM par expense_date ne s'annule pas : on voit +X sur l'ancienne date
--   et -X sur la date du reverse, au lieu d'une suppression nette.
--
-- Fix : exclure les lignes reverse (reversal_of_id IS NOT NULL) ET exclure
-- les lignes originales déjà annulées (reversed_at IS NOT NULL).
-- Résultat : seuls les approvisionnements actifs (non annulés) contribuent
-- aux dépenses. L'annulation disparaît complètement de la comptabilité.

DROP MATERIALIZED VIEW IF EXISTS expenses_summary_mat CASCADE;

CREATE MATERIALIZED VIEW expenses_summary_mat AS
WITH combined_data AS (
  -- Expenses (EXCLUDE category 'supply' liée à un supply pour éviter la duplication)
  SELECT
    e.bar_id,
    DATE(e.expense_date)                    AS expense_date,
    DATE_TRUNC('week',  e.expense_date)     AS expense_week,
    DATE_TRUNC('month', e.expense_date)     AS expense_month,
    e.amount,
    e.category,
    e.custom_category_id,
    e.related_supply_id,
    0::NUMERIC                              AS supply_cost,
    e.expense_date                          AS original_date,
    e.id
  FROM expenses e
  WHERE NOT (e.category = 'supply' AND e.related_supply_id IS NOT NULL)

  UNION ALL

  -- Supplies actifs uniquement :
  --   • reversal_of_id IS NULL  → pas une ligne miroir
  --   • reversed_at IS NULL     → pas encore annulé
  SELECT
    s.bar_id,
    DATE(COALESCE(s.supplied_at, s.created_at))                    AS expense_date,
    DATE_TRUNC('week',  COALESCE(s.supplied_at, s.created_at))     AS expense_week,
    DATE_TRUNC('month', COALESCE(s.supplied_at, s.created_at))     AS expense_month,
    0::NUMERIC                              AS amount,
    'supply'::TEXT                          AS category,
    NULL                                    AS custom_category_id,
    NULL::UUID                              AS related_supply_id,
    s.total_cost                            AS supply_cost,
    COALESCE(s.supplied_at, s.created_at)  AS original_date,
    s.id
  FROM supplies s
  WHERE s.reversal_of_id IS NULL   -- exclure les lignes miroir
    AND s.reversed_at  IS NULL     -- exclure les originaux déjà annulés
)
SELECT
  bar_id,
  expense_date,
  expense_week,
  expense_month,

  COALESCE(SUM(amount), 0) + COALESCE(SUM(supply_cost), 0)                                              AS total_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category != 'investment'), 0) + COALESCE(SUM(supply_cost), 0)      AS operating_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'investment'), 0)                                        AS investments,
  COALESCE(SUM(amount) FILTER (WHERE category = 'water'), 0)                                             AS water_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'electricity'), 0)                                       AS electricity_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'maintenance'), 0)                                       AS maintenance_expenses,
  COALESCE(SUM(amount) FILTER (WHERE category = 'supply'), 0) + COALESCE(SUM(supply_cost), 0)           AS supply_expenses,
  COALESCE(SUM(supply_cost), 0)                                                                          AS supplies_cost,
  COALESCE(SUM(amount) FILTER (WHERE custom_category_id IS NOT NULL), 0)                                 AS custom_expenses,
  COUNT(id) FILTER (WHERE amount > 0)                                                                    AS expense_count,
  COUNT(id) FILTER (WHERE category = 'investment')                                                       AS investment_count,
  COUNT(id) FILTER (WHERE supply_cost > 0)                                                               AS supply_count,
  MIN(original_date)                                                                                      AS first_expense_time,
  MAX(original_date)                                                                                      AS last_expense_time,
  NOW()                                                                                                   AS updated_at

FROM combined_data
GROUP BY bar_id, expense_date, expense_week, expense_month;

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_summary_mat_pk    ON expenses_summary_mat(bar_id, expense_date);
CREATE INDEX        IF NOT EXISTS idx_expenses_summary_mat_week  ON expenses_summary_mat(bar_id, expense_week);
CREATE INDEX        IF NOT EXISTS idx_expenses_summary_mat_month ON expenses_summary_mat(bar_id, expense_month);

-- Vue sécurisée (RLS)
CREATE OR REPLACE VIEW expenses_summary AS
SELECT * FROM expenses_summary_mat
WHERE bar_id IN (SELECT bar_id FROM bar_members WHERE user_id = auth.uid());

-- Fonction de refresh
DROP FUNCTION IF EXISTS refresh_expenses_summary();
CREATE OR REPLACE FUNCTION refresh_expenses_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('expenses_summary', 'trigger');
END;
$$;

-- Trigger notify sur supplies (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION trigger_refresh_expenses_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('refresh_stats', 'expenses_summary_mat');
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS after_expense_refresh_summary         ON expenses;
DROP TRIGGER IF EXISTS after_supply_refresh_expenses_summary ON supplies;

CREATE TRIGGER after_expense_refresh_summary
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION trigger_refresh_expenses_summary();

CREATE TRIGGER after_supply_refresh_expenses_summary
AFTER INSERT OR UPDATE OR DELETE ON supplies
FOR EACH ROW EXECUTE FUNCTION trigger_refresh_expenses_summary();

-- Permissions
GRANT SELECT ON expenses_summary_mat TO authenticated;
GRANT SELECT ON expenses_summary_mat TO service_role;
GRANT SELECT ON expenses_summary     TO authenticated;
GRANT SELECT ON expenses_summary     TO service_role;
GRANT SELECT ON bar_members          TO authenticated;

-- Refresh immédiat
REFRESH MATERIALIZED VIEW expenses_summary_mat;
