-- 049_fix_top_products_refresh.sql
-- Fixes missing refresh function and unique index for top_products_by_period_mat (P0 Correction)

-- 1. Créer index UNIQUE pour permettre le REFRESH CONCURRENTLY
-- On supprime l'ancien index simple s'il existe pour le remplacer par un UNIQUE
DROP INDEX IF EXISTS idx_top_products_mat_bar_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_products_mat_pk
ON top_products_by_period_mat(bar_id, sale_date, product_id);

-- Recréer l'index de performance (non unique)
CREATE INDEX IF NOT EXISTS idx_top_products_mat_quantity
ON top_products_by_period_mat(bar_id, total_quantity DESC);

-- 2. Créer la fonction de refresh manquante
CREATE OR REPLACE FUNCTION refresh_top_products_by_period()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_materialized_view_with_logging('top_products_by_period', 'trigger');
END;
$$;

COMMENT ON FUNCTION refresh_top_products_by_period IS 'Rafraîchit la vue top_products_by_period_mat de manière concurrente';
