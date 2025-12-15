-- Migration: Finalise la création des objets de statistiques annexes de manière idempotente.
-- Ce script nettoie les versions partielles précédentes et installe la version finale et sécurisée.
-- v2: Ajout du nombre d'unités vendues aux top produits.

-- ========================================================================
-- ÉTAPE 1: Supprime l'existant proprement pour repartir de zéro
-- Le CASCADE est important pour supprimer aussi les vues qui en dépendent.
DROP VIEW IF EXISTS public.bar_ancillary_stats;
DROP MATERIALIZED VIEW IF EXISTS public.bar_ancillary_stats_mat CASCADE;

-- ========================================================================
-- ÉTAPE 2: Recrée la vue matérialisée (logique des données)
CREATE MATERIALIZED VIEW public.bar_ancillary_stats_mat AS
WITH
  daily_product_sales AS (
    SELECT
      s.bar_id,
      (item_data ->> 'product_id')::uuid as product_id,
      (item_data ->> 'product_name')::text as product_name,
      s.business_date,
      SUM((item_data ->> 'total_price')::numeric) as daily_revenue,
      SUM((item_data ->> 'quantity')::int) as daily_quantity
    FROM
      public.sales s,
      jsonb_array_elements(s.items) as item_data
    WHERE s.status = 'validated'
    GROUP BY s.bar_id, product_id, product_name, s.business_date
  ),
  total_ranked_products AS (
    SELECT
      dps.bar_id,
      dps.product_id,
      dps.product_name,
      SUM(dps.daily_revenue) as total_revenue,
      SUM(dps.daily_quantity) as total_quantity,
      ROW_NUMBER() OVER(PARTITION BY dps.bar_id ORDER BY SUM(dps.daily_revenue) DESC, dps.product_id) as rank
    FROM daily_product_sales dps
    GROUP BY dps.bar_id, dps.product_id, dps.product_name
  ),
  top_products_agg AS (
    SELECT
      bar_id,
      jsonb_agg(
        jsonb_build_object(
          'product_id', product_id, 
          'name', product_name, 
          'rank', rank, 
          'revenue', total_revenue,
          'quantity', total_quantity
        ) ORDER BY rank
      ) as top_products_json
    FROM total_ranked_products
    WHERE rank <= 3
    GROUP BY bar_id
  ),
  bar_member_counts AS (
    SELECT bar_id, COUNT(DISTINCT user_id) as total_members
    FROM public.bar_members
    GROUP BY bar_id
  )
SELECT
  b.id as bar_id,
  COALESCE(bmc.total_members, 0) as total_members,
  tpa.top_products_json
FROM
  public.bars b
  LEFT JOIN bar_member_counts bmc ON b.id = bmc.bar_id
  LEFT JOIN top_products_agg tpa ON b.id = tpa.bar_id;

CREATE UNIQUE INDEX ON public.bar_ancillary_stats_mat(bar_id);
COMMENT ON MATERIALIZED VIEW public.bar_ancillary_stats_mat IS 'Fournit des statistiques de bar annexes comme le nombre de membres et les produits les plus vendus (v2). Doit être rafraîchie périodiquement.';

-- ========================================================================
-- ÉTAPE 3: Recrée la vue de sécurité
CREATE OR REPLACE VIEW public.bar_ancillary_stats AS
SELECT *
FROM public.bar_ancillary_stats_mat
WHERE
  bar_id IN (SELECT bar_id FROM public.bar_members WHERE user_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.bar_members WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true);

GRANT SELECT ON public.bar_ancillary_stats TO authenticated;

-- ========================================================================
-- ÉTAPE 4: Recrée la fonction pour les alertes
CREATE OR REPLACE FUNCTION public.get_bar_live_alerts(p_bar_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM public.bar_products
  WHERE
    bar_id = p_bar_id
    AND stock <= alert_threshold
    AND alert_threshold IS NOT NULL AND alert_threshold > 0;
$$;

COMMENT ON FUNCTION public.get_bar_live_alerts(uuid) IS 'Retourne le nombre en temps réel de produits dont le stock est bas pour un bar spécifique.';
