-- 053_create_salaries_summary_view.sql
-- Vue matérialisée pour les salaires agrégés par jour

-- 1. Vue Matérialisée (Interne)
CREATE MATERIALIZED VIEW IF NOT EXISTS salaries_summary_mat AS
SELECT
  sal.bar_id,
  DATE(sal.paid_at) AS payment_date,
  DATE_TRUNC('week', sal.paid_at) AS payment_week,
  DATE_TRUNC('month', sal.paid_at) AS payment_month,
  
  -- Total des salaires
  COALESCE(SUM(sal.amount), 0) AS total_salaries,
  
  -- Compteurs
  COUNT(*) AS payment_count,
  COUNT(DISTINCT sal.member_id) AS unique_members_paid,
  
  -- Statistiques
  AVG(sal.amount) AS avg_salary_amount,
  MIN(sal.amount) AS min_salary_amount,
  MAX(sal.amount) AS max_salary_amount,
  
  -- Timestamps
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

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_summary_mat_pk ON salaries_summary_mat(bar_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_salaries_summary_mat_week ON salaries_summary_mat(bar_id, payment_week);
CREATE INDEX IF NOT EXISTS idx_salaries_summary_mat_month ON salaries_summary_mat(bar_id, payment_month);

-- 2. Vue Sécurisée (Publique)
CREATE OR REPLACE VIEW salaries_summary AS
SELECT *
FROM salaries_summary_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- 3. Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_salaries_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('salaries_summary', 'trigger');
END;
$$;

-- 4. Trigger après paiement de salaire
CREATE OR REPLACE FUNCTION trigger_refresh_salaries_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('refresh_stats', 'salaries_summary_mat');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_salary_refresh_summary ON salaries;

CREATE TRIGGER after_salary_refresh_summary
AFTER INSERT OR UPDATE OR DELETE ON salaries
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_salaries_summary();

-- 5. Permissions
GRANT SELECT ON salaries_summary TO authenticated;

-- 6. Initial refresh
SELECT refresh_salaries_summary();

COMMENT ON MATERIALIZED VIEW salaries_summary_mat IS 'Résumé quotidien des salaires payés';
COMMENT ON COLUMN salaries_summary_mat.total_salaries IS 'Total des salaires payés ce jour';
COMMENT ON COLUMN salaries_summary_mat.unique_members_paid IS 'Nombre de membres différents payés ce jour';
