-- ===================================================================
-- MIGRATION: bar_ancillary_stats_mat — exclure les plats du top produits
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§4.2, §13.9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `bar_ancillary_stats_mat` extrait `product_id` de CHAQUE item de vente,
--   sans jointure ni filtre :
--       ((item_data.value ->> 'product_id')::uuid) AS product_id
--       FROM sales s, LATERAL jsonb_array_elements(s.items) item_data(value)
--   Un plat vendu n'ayant PAS de `product_id` (cf. format retenu ci-dessous),
--   il produirait une ligne « product_id = NULL » agrégeant TOUT le chiffre
--   d'affaires des plats — laquelle remonterait dans le TOP 3 PRODUITS du bar.

-- ⭐ FORMAT RETENU — décision du 04/08/2026, DIVERGENCE ASSUMÉE avec le §4.2
--   Le plan proposait de renommer `product_id` → `item_id` et
--   `product_name` → `display_name`. ÉCARTÉ : 62 points de modification côté
--   client, 19 occurrences dans le seul price guard, et surtout 19 281 ventes
--   existantes à reprendre. Risque disproportionné en production.
--
--   Format adopté — un CHAMP SÉPARÉ plutôt qu'un champ réutilisé :
--     boisson : { "product_id": "<uuid>", "product_name": "…", … }   INCHANGÉ
--     plat    : { "item_type": "dish", "dish_id": "<uuid>", "product_name": "…", … }
--
--   ⭐⭐ POURQUOI C'EST PLUS SÛR QUE DE RÉUTILISER `product_id` :
--   deux gardes SQL du chemin de vente lèvent une EXCEPTION si le product_id
--   est introuvable dans `bar_products` :
--       PRICE_ERROR:Produit % introuvable dans ce bar   (price guard)
--       STOCK_ERROR:Produit % introuvable dans ce bar   (garde de survente)
--   Un `dishes.id` placé dans `product_id` ferait donc ÉCHOUER la vente
--   entière. Le champ séparé rend la confusion STRUCTURELLEMENT impossible :
--   `product_id` vaut NULL pour un plat, jamais l'id d'un autre objet.
--   Et si un filtre est oublié quelque part, une jointure sur NULL ne trouve
--   RIEN — au lieu de trouver LE MAUVAIS PRODUIT par collision d'UUID.

-- ⭐ COMPATIBILITÉ — aucune reprise de données
--   `COALESCE(item->>'item_type', 'product')` traite les items sans
--   discriminant comme des produits. Vérifié sur les 3 formes possibles :
--     19 281 ventes existantes (pas de item_type) → GARDÉES
--     boisson future (item_type='product')        → GARDÉE
--     plat future    (item_type='dish')           → EXCLUE

-- ⚠️ DEUX AUTRES VUES ONT ÉTÉ RELEVÉES PUIS ÉCARTÉES — vérifié sur définition :
--   `product_sales_stats_mat` joint sur `(si.value->>'product_id') = bp.id::text`.
--     Un plat n'ayant pas ce champ, la jointure ne matche JAMAIS. Sûre par
--     construction — c'est le choix du champ séparé qui la protège.
--   `daily_sales_summary_mat` ne lit `items` que pour SUM(quantity), un
--     comptage d'ARTICLES VENDUS. Un plat EST un article vendu : la filtrer
--     ferait afficher « 2 articles » sur un ticket qui en contient 3.
--   → UNE SEULE vue à corriger, pas trois.

-- BREAKING_CHANGE: NO
--   Sur les données actuelles, la vue produit un résultat RIGOUREUSEMENT
--   IDENTIQUE : aucun item ne porte `item_type` aujourd'hui.

-- ROLLBACK_STRATEGY:
--   Réappliquer 20251215170000_fixup_and_finalize_stats_objects.sql (section
--   bar_ancillary_stats_mat), PUIS recréer l'index unique ET la vue
--   `bar_ancillary_stats` avec security_invoker=true et son GRANT.
--   ⚠️ Rollback DÉCONSEILLÉ : il réintroduirait les plats dans le top produits.

-- VIEWS_AFFECTED: bar_ancillary_stats_mat (recréée), bar_ancillary_stats (recréée)
-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⭐ Photographier le CONTENU avant/après — la vue doit être IDENTIQUE :
--
--    SELECT count(*) AS nb_bars,
--           count(*) FILTER (WHERE top_products_json IS NOT NULL) AS avec_top,
--           sum(total_members) AS total_membres
--    FROM public.bar_ancillary_stats_mat;
--    -- ⚠️ NOTER CES TROIS NOMBRES : le post-vol doit les retrouver À
--    --    L'IDENTIQUE. Aucun item ne portant `item_type` aujourd'hui, le
--    --    filtre ne doit RIEN changer. Un écart = le filtre exclut à tort.
--
-- 2) L'index unique existe (indispensable au REFRESH CONCURRENTLY) :
--
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'bar_ancillary_stats_mat';
--    -- ATTENDU : bar_ancillary_stats_mat_bar_id_idx
--
-- 3) La vue dépendante et ses privilèges :
--
--    SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname='bar_ancillary_stats';
--    -- ATTENDU : {security_invoker=true}
--
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='bar_ancillary_stats'
--      AND grantee = 'authenticated';
--    -- ATTENDU : SELECT

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.bar_ancillary_stats_mat') IS NULL THEN
    RAISE EXCEPTION 'Vue bar_ancillary_stats_mat absente — rien à corriger, diagnostiquer';
  END IF;

  -- ⚠️ `get_user_bars()` porte l'isolation multi-tenant de la vue dépendante.
  -- Sans elle, la recréation échouerait APRÈS le DROP — donc au pire moment.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_bars'
  ) THEN
    RAISE EXCEPTION 'Fonction get_user_bars() absente — l''isolation de bar_ancillary_stats serait impossible';
  END IF;
END $$;

-- ⚠️ ORDRE OBLIGATOIRE : la vue classique d'abord, sinon le DROP de la
-- matérialisée échoue (dépendance). Un DROP ... CASCADE la détruirait sans
-- qu'on maîtrise sa reconstruction — c'est précisément ce qu'on évite ici en
-- la recréant explicitement plus bas.
DROP VIEW IF EXISTS public.bar_ancillary_stats;
DROP MATERIALIZED VIEW IF EXISTS public.bar_ancillary_stats_mat;

CREATE MATERIALIZED VIEW public.bar_ancillary_stats_mat AS
WITH daily_product_sales AS (
  SELECT
    s.bar_id,
    ((item_data.value ->> 'product_id')::uuid) AS product_id,
    (item_data.value ->> 'product_name')       AS product_name,
    s.business_date,
    sum(((item_data.value ->> 'total_price')::numeric)) AS daily_revenue,
    sum(((item_data.value ->> 'quantity')::integer))    AS daily_quantity
  FROM sales s,
       LATERAL jsonb_array_elements(s.items) item_data(value)
  WHERE s.status = 'validated'
    -- ⭐⭐ SEULE LIGNE AJOUTÉE PAR CETTE MIGRATION.
    -- COALESCE : les 19 281 ventes existantes n'ont pas `item_type` et sont
    -- traitées comme des produits — aucune reprise de données (§4.2).
    -- ⚠️ Sans ce filtre, un plat produirait une ligne product_id = NULL
    -- agrégeant tout le CA des plats, qui remonterait dans le TOP 3.
    AND COALESCE(item_data.value ->> 'item_type', 'product') = 'product'
  GROUP BY s.bar_id,
           ((item_data.value ->> 'product_id')::uuid),
           (item_data.value ->> 'product_name'),
           s.business_date
), total_ranked_products AS (
  SELECT
    dps.bar_id,
    dps.product_id,
    dps.product_name,
    sum(dps.daily_revenue)  AS total_revenue,
    sum(dps.daily_quantity) AS total_quantity,
    row_number() OVER (PARTITION BY dps.bar_id ORDER BY sum(dps.daily_revenue) DESC, dps.product_id) AS rank
  FROM daily_product_sales dps
  GROUP BY dps.bar_id, dps.product_id, dps.product_name
), top_products_agg AS (
  SELECT
    total_ranked_products.bar_id,
    jsonb_agg(jsonb_build_object(
      'product_id', total_ranked_products.product_id,
      'name',       total_ranked_products.product_name,
      'rank',       total_ranked_products.rank,
      'revenue',    total_ranked_products.total_revenue,
      'quantity',   total_ranked_products.total_quantity
    ) ORDER BY total_ranked_products.rank) AS top_products_json
  FROM total_ranked_products
  WHERE total_ranked_products.rank <= 3
  GROUP BY total_ranked_products.bar_id
), bar_member_counts AS (
  SELECT bar_members.bar_id,
         count(DISTINCT bar_members.user_id) AS total_members
  FROM bar_members
  GROUP BY bar_members.bar_id
)
SELECT
  b.id AS bar_id,
  COALESCE(bmc.total_members, (0)::bigint) AS total_members,
  tpa.top_products_json
FROM bars b
LEFT JOIN bar_member_counts bmc ON b.id = bmc.bar_id
LEFT JOIN top_products_agg  tpa ON b.id = tpa.bar_id;

COMMENT ON MATERIALIZED VIEW public.bar_ancillary_stats_mat IS
  'Top 3 produits et nombre de membres par bar. '
  '⭐ Filtre COALESCE(item_type, ''product'') = ''product'' depuis le 04/08/2026 : sans lui, '
  'un plat vendu produirait une ligne product_id = NULL agrégeant tout le CA des plats, qui '
  'remonterait dans le top 3. '
  '⚠️ AUCUN GRANT sur cette vue — elle contient les données de TOUS les bars. L''accès passe '
  'par la vue `bar_ancillary_stats`, qui porte l''isolation via get_user_bars().';

-- ⚠️⚠️ INDEX UNIQUE — SA PERTE SERAIT SILENCIEUSE ET DIFFÉRÉE.
-- Le cron rafraîchit par `REFRESH MATERIALIZED VIEW CONCURRENTLY`, qui EXIGE
-- un index unique. Sans lui, TOUS les refresh échoueraient — 30 minutes après
-- la migration, avec alerte email et statistiques figées à leur dernière
-- valeur. Personne ne ferait le lien avec cette migration.
CREATE UNIQUE INDEX bar_ancillary_stats_mat_bar_id_idx
  ON public.bar_ancillary_stats_mat USING btree (bar_id);

-- ⚠️⚠️ `security_invoker = true` OBLIGATOIRE.
-- Sans cette option, la vue s'exécute avec les droits de son CRÉATEUR : le
-- filtre `get_user_bars()` serait contourné et CHAQUE BAR VERRAIT LE TOP 3
-- PRODUITS DE TOUS LES AUTRES. Fuite de données entre clients.
-- Convention établie par 20260107_convert_views_to_security_invoker.sql.
CREATE VIEW public.bar_ancillary_stats
WITH (security_invoker = true)
AS
SELECT bar_id, total_members, top_products_json
FROM public.bar_ancillary_stats_mat
WHERE bar_id IN (SELECT get_user_bars.bar_id FROM get_user_bars() get_user_bars(bar_id));

COMMENT ON VIEW public.bar_ancillary_stats IS
  'Vue d''accès à bar_ancillary_stats_mat, filtrée par get_user_bars(). '
  '⚠️ security_invoker = true OBLIGATOIRE : sans lui le filtre est contourné et chaque bar '
  'verrait les statistiques de tous les autres.';

-- ⚠️ DROP + CREATE PERD LES GRANTS — les rejouer n'est pas optionnel.
GRANT SELECT ON public.bar_ancillary_stats TO authenticated;

COMMIT;

-- ⚠️ HORS TRANSACTION : `REFRESH ... CONCURRENTLY` ne peut PAS s'exécuter dans
-- un bloc transactionnel (leçon de 20260226180000). Et une vue matérialisée
-- fraîchement créée est VIDE — sans ce refresh, les statistiques seraient à
-- zéro jusqu'au prochain passage du cron, dans 30 minutes au pire.
-- ⭐ Premier refresh NON concurrent : CONCURRENTLY exige que la vue ait déjà
-- été peuplée au moins une fois.
REFRESH MATERIALIZED VIEW public.bar_ancillary_stats_mat;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⚠️ CRITIQUE — le CONTENU est IDENTIQUE au pré-vol 1 :
--
--    SELECT count(*) AS nb_bars,
--           count(*) FILTER (WHERE top_products_json IS NOT NULL) AS avec_top,
--           sum(total_members) AS total_membres
--    FROM public.bar_ancillary_stats_mat;
--    -- ATTENDU : les TROIS nombres identiques au pré-vol.
--    -- ⛔ Tout écart = le filtre exclut des items qu'il ne devrait pas.
--    --    Aucun item ne portant `item_type` aujourd'hui, il ne doit RIEN changer.
--
-- 2) ⚠️ CRITIQUE — l'index unique existe (sinon les refresh casseront) :
--
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'bar_ancillary_stats_mat';
--    -- ATTENDU : bar_ancillary_stats_mat_bar_id_idx, UNIQUE sur (bar_id)
--    -- ⛔ Absent : le cron échouera dans 30 min, alerte email, stats figées.
--
-- 3) ⚠️ CRITIQUE — security_invoker sur la vue dépendante :
--
--    SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname='bar_ancillary_stats';
--    -- ATTENDU : {security_invoker=true}
--    -- ⛔ Absent = FUITE DE DONNÉES : chaque bar verrait le top 3 des autres.
--
-- 4) ⚠️ Les privilèges sont restaurés :
--
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='bar_ancillary_stats'
--      AND grantee='authenticated';
--    -- ATTENDU : SELECT
--
-- 5) ⭐ Le REFRESH CONCURRENTLY fonctionne — c'est ce que fera le cron :
--
--    REFRESH MATERIALIZED VIEW CONCURRENTLY public.bar_ancillary_stats_mat;
--    -- ATTENDU : succès. ⛔ Un échec ici = l'index unique manque (cf. 2).
--
-- 6) Aucune erreur de refresh enregistrée après la migration :
--
--    SELECT view_name, status, refresh_completed_at
--    FROM materialized_view_refresh_log
--    WHERE view_name = 'bar_ancillary_stats'
--    ORDER BY refresh_completed_at DESC LIMIT 3;
--    -- ATTENDU : status = 'success' sur la ligne la plus récente.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ GARANTIE PAR LE COALESCE, pas par une condition sur le bar.
--    Un bar pur ne vend que des produits : `COALESCE(item_type, 'product')`
--    retourne toujours 'product', le filtre est toujours vrai, et la vue
--    produit exactement le même résultat qu'avant — vérifié par le post-vol 1.
--
-- ⚠️ CETTE VUE EST DU CODE MORT (relevé du 04/08/2026) : `BarStatsPage`, seul
--    consommateur de `BarStatsModal`, n'est référencée dans AUCUNE route.
--    Elle est corrigée malgré tout — le cron la rafraîchit toutes les 30 min,
--    et une donnée fausse y serait figée si la page revenait en service.
