-- 042_create_product_sales_stats_view.sql
-- V2: Avec Sécurité RLS
-- Prérequis: Migration 036 (Auth Schema) doit être appliquée

-- 1. Vue Matérialisée (Interne - Données brutes)
CREATE MATERIALIZED VIEW IF NOT EXISTS product_sales_stats_mat AS
SELECT
  bp.id AS product_id,
  bp.bar_id,
  COALESCE(bp.local_name, gp.name) AS product_name,
  COALESCE(gp.volume, '') AS product_volume,
  bp.stock AS current_stock,
  bp.alert_threshold,
  bp.price AS selling_price,
  bp.created_at AS product_created_at,

  -- Statistiques des 30 derniers jours
  COUNT(DISTINCT DATE(s.created_at)) AS days_with_sales,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'validated') AS total_transactions,
  COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0) AS total_sold_30d,

  -- Moyenne journalière RÉELLE (basée sur jours avec ventes)
  CASE
    WHEN COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated') > 0
    THEN COALESCE(SUM((si->>'quantity')::integer) FILTER (WHERE s.status = 'validated'), 0)::float /
         COUNT(DISTINCT DATE(s.created_at)) FILTER (WHERE s.status = 'validated')
    ELSE 0
  END AS daily_average,

  -- Jours depuis création du produit
  EXTRACT(EPOCH FROM (NOW() - bp.created_at)) / 86400 AS days_since_creation,

  -- Dernière vente
  MAX(s.created_at) FILTER (WHERE s.status = 'validated') AS last_sale_date,

  -- Jours sans vente (détection rupture)
  CASE
    WHEN MAX(s.created_at) FILTER (WHERE s.status = 'validated') IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - MAX(s.created_at) FILTER (WHERE s.status = 'validated'))) / 86400
    ELSE NULL
  END AS days_without_sale,

  -- Coût moyen d'achat (pour calcul coût commande)
  COALESCE(AVG(sup.unit_cost), 0) AS avg_purchase_cost,

  -- Dernière mise à jour
  NOW() AS updated_at

FROM bar_products bp
LEFT JOIN global_products gp ON bp.global_product_id = gp.id
LEFT JOIN sales s ON s.bar_id = bp.bar_id
  AND s.created_at >= NOW() - INTERVAL '30 days'
LEFT JOIN LATERAL jsonb_array_elements(s.items) AS si ON (si->>'product_id') = bp.id::text
LEFT JOIN supplies sup ON sup.product_id = bp.id
  AND sup.supplied_at >= NOW() - INTERVAL '90 days'

WHERE bp.is_active = true

GROUP BY
  bp.id, bp.bar_id, bp.local_name, gp.name, gp.volume, bp.stock,
  bp.alert_threshold, bp.price, bp.created_at;

-- Index pour performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_sales_stats_mat_pk ON product_sales_stats_mat(product_id);
CREATE INDEX IF NOT EXISTS idx_product_sales_stats_mat_bar ON product_sales_stats_mat(bar_id);

-- 2. Vue Sécurisée (Publique - Filtrée par RLS)
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT *
FROM product_sales_stats_mat
WHERE bar_id IN (
  SELECT bar_id FROM bar_members WHERE user_id = auth.uid()
);

-- Fonction de rafraîchissement
CREATE OR REPLACE FUNCTION refresh_product_sales_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Logging inspiré de migration 036
  RAISE NOTICE '[refresh_product_sales_stats] Starting refresh...';
  
  REFRESH MATERIALIZED VIEW CONCURRENTLY product_sales_stats_mat;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RAISE NOTICE '[refresh_product_sales_stats] ✓ Refreshed % products', v_row_count;
END;
$$;

-- Rafraîchissement automatique après vente validée
CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Rafraîchir de manière asynchrone (ne bloque pas la vente)
  -- Note: pg_notify envoie juste un signal, il faut un listener externe ou un cron pour exécuter le refresh
  -- Pour l'instant, on peut appeler refresh directement si la charge n'est pas trop forte,
  -- ou mieux, le client appellera refresh après une vente.
  -- Ici on laisse pg_notify pour une future implémentation worker.
  PERFORM pg_notify('refresh_stats', 'product_sales_stats_mat');
  
  -- OPTIONNEL: Refresh synchrone pour l'instant pour garantir la fraîcheur
  -- Attention: peut ralentir la validation de vente. À surveiller.
  -- PERFORM refresh_product_sales_stats();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_sale_validated_refresh_stats ON sales;

CREATE TRIGGER after_sale_validated_refresh_stats
AFTER INSERT OR UPDATE OF status ON sales
FOR EACH ROW
WHEN (NEW.status = 'validated')
EXECUTE FUNCTION trigger_refresh_product_stats();

-- Permissions (Uniquement sur la vue sécurisée)
GRANT SELECT ON product_sales_stats TO authenticated;
-- PAS de permission sur product_sales_stats_mat pour authenticated
