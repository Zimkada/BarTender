-- ===================================================================
-- MIGRATION: get_kitchen_metrics — les 4 métriques du §8
-- DATE: 2026-08-05
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Le module coûte de la SAISIE au promoteur (ingrédients, recettes, appros)
--   et ne lui rend, à ce stade, que de l'organisation. Les métriques du §8
--   transforment cette saisie en information qu'il n'avait pas — c'est ce qui
--   justifie le coût d'entrée.
--   Constaté en test terrain le 04/08/2026 : le Poulet braisé affichait 20 %
--   de marge. Cette information ne se voit NULLE PART ailleurs, et elle change
--   une décision de prix.

-- ⭐⭐ POURQUOI UNE RPC ET NON UNE VUE MATÉRIALISÉE
--   Le projet rafraîchit ses vues par cron (`refresh_all_materialized_views`,
--   migration 046). Une métrique de service rafraîchie toutes les 30 min
--   serait inexploitable : le gérant regarde ces chiffres PENDANT le coup de
--   feu, pas le lendemain.
--   ⚠️ Le coût est assumé : agrégat calculé à la demande, sur une fenêtre
--   bornée. Les volumes cuisine (dizaines de lignes/jour) n'ont rien de
--   commun avec les ventes (centaines).

-- ⭐⭐ LA 4e MÉTRIQUE EST CELLE QUE PERSONNE D'AUTRE NE CALCULE
--       consumed_at IS NOT NULL AND sale_id IS NULL AND status = 'cancelled'
--         ⟹  PERTE DÉFINITIVE
--   Un plat cuisiné puis jamais servi a coûté sa matière sans produire un
--   franc. Ni un tableur, ni un POS classique ne capture cela : il faut avoir
--   DISSOCIÉ le moment de la consommation (`ready`) de celui de la vente
--   (`served`) — ce que fait la machine d'état du §6.
--   C'est l'argument le plus fort du module.
--
--   ⛔ `status = 'cancelled'` EST INDISPENSABLE — défaut corrigé à la
--   certification, avant application. Sans lui, les plats `ready` QUI
--   ATTENDENT LEUR SERVEUR (cas normal en plein service) auraient été
--   comptés comme pertes : le gérant aurait vu des PERTES FANTÔMES,
--   disparaissant au fil des services, exactement au moment où il consulte
--   le plus cette métrique.
--   → Ils sont exposés SÉPARÉMENT (`pending_count`/`pending_cost`) : matière
--     déjà sortie, mais plats ENCORE SERVABLES. C'est un signal d'action
--     (« sortez ces assiettes »), pas un constat comptable.

-- BREAKING_CHANGE: NO
--   Une fonction NEUVE. Aucune table, aucune vue, aucune RPC existante
--   touchée. Un bar pur ne l'appelle jamais (`enabled: hasRestaurant`).

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_kitchen_metrics(UUID, DATE, DATE);
--   DROP INDEX IF EXISTS public.idx_koi_metrics_by_bar_date;

-- FUNCTIONS_CREATED: get_kitchen_metrics
-- INDEXES_CREATED: idx_koi_metrics_by_bar_date
-- TABLES_MODIFIED: aucune (index seul) · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_metrics';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — dépendances :
--
--    SELECT to_regclass('public.kitchen_order_items') AS t_items,
--           to_regclass('public.dishes')              AS t_dishes,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 2
--
-- 3) ⭐ Photographier les données AVANT (le post-vol doit les retrouver) :
--
--    SELECT count(*) AS lignes,
--           count(*) FILTER (WHERE status = 'served')    AS servis,
--           count(*) FILTER (WHERE status = 'cancelled') AS annules,
--           count(*) FILTER (WHERE consumed_at IS NOT NULL AND sale_id IS NULL
--                              AND status = 'cancelled') AS pertes
--    FROM public.kitchen_order_items;

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_kitchen_metrics'
  ) THEN
    RAISE EXCEPTION 'get_kitchen_metrics existe déjà — diagnostiquer avant de rejouer.';
  END IF;

  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'Table kitchen_order_items absente — appliquer d''abord 20260804120000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — filtrage d''accès impossible';
  END IF;
END $$;

/**
 * ⭐⭐ INDEX INDISPENSABLE — défaut de performance trouvé à la review du
 * 05/08/2026.
 *
 * Les deux index existants sur cette table sont PARTIELS :
 *   idx_koi_active_by_bar → WHERE status IN (pending…ready)  — l'écran Service
 *   idx_koi_losses        → WHERE sale_id IS NULL AND consumed_at IS NOT NULL
 *
 * ⛔ Cette RPC lit surtout les lignes `served`, EXCLUES des deux. Sans index
 * dédié, chaque consultation des métriques déclencherait un SCAN SÉQUENTIEL
 * de toute la table. Négligeable sur 20 lignes de test ; coûteux après six
 * mois de service, sur l'écran qu'un promoteur consulte quotidiennement.
 *
 * ⚠️ NON partiel, volontairement : la RPC agrège served ET cancelled ET ready
 * dans la même passe. Un index partiel obligerait le planificateur à
 * retomber sur le scan pour les autres statuts.
 */
CREATE INDEX IF NOT EXISTS idx_koi_metrics_by_bar_date
  ON public.kitchen_order_items (bar_id, created_at);

CREATE FUNCTION public.get_kitchen_metrics(
  p_bar_id     UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public   -- ⚠️ sans lui, un search_path manipulé ferait
                           --    résoudre `dishes` vers une table pirate
AS $$
DECLARE
  v_start   DATE;
  v_end     DATE;
  v_totals  RECORD;
  v_dishes  JSONB;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS des tables lues
  -- NE S'APPLIQUE PAS. Sans ce garde, n'importe quel utilisateur authentifié
  -- lirait les marges et les pertes de TOUS les bars.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⚠️ Fenêtre par défaut : 30 jours. Bornée dans TOUS les cas — un agrégat
  -- non borné grossirait indéfiniment avec l'historique du bar.
  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  -- ⚠️ `- 30` (entier) et non `- INTERVAL '30 days'` : la seconde forme
  -- produit un TIMESTAMP que l'affectation à `v_start DATE` tronquerait
  -- silencieusement. Le résultat serait identique ici, mais un lecteur ne
  -- pourrait pas le savoir sans vérifier — l'arithmétique DATE - INTEGER
  -- reste dans le type attendu.
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AGRÉGATS GLOBAUX
  -- ═══════════════════════════════════════════════════════════════
  SELECT
    -- ⛔ SUM(quantity) et NON count(*) — defaut trouve a la code review du
    -- 05/08/2026. Une ligne « 3 x Poulet braise » compte pour UNE ligne mais
    -- TROIS assiettes. Le gerant lit « nombre de plats servis » : lui afficher
    -- un nombre de LIGNES sous-estimerait son service, et le classement du
    -- plat le plus vendu aurait ete faux des qu un client commande en double.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'served'), 0) AS served_count,
    -- ⚠️ ASYMÉTRIE VOULUE, vérifiée à la review du 05/08/2026 :
    --   `unit_price`    est UNITAIRE   → × quantity
    --   `computed_cost` couvre LA LIGNE → JAMAIS × quantity
    -- `mark_kitchen_item_ready` multiplie déjà par `v_item.quantity` en
    -- calculant les quantités brutes d'ingrédients (l.383 de 20260804130000).
    -- ⛔ Multiplier ici gonflerait le coût par un facteur `quantity` et
    -- afficherait des marges NÉGATIVES sur toute commande multiple.
    COALESCE(SUM(koi.unit_price * koi.quantity)
             FILTER (WHERE koi.status = 'served'), 0)              AS revenue,
    COALESCE(SUM(koi.computed_cost)
             FILTER (WHERE koi.status = 'served'), 0)              AS cost,

    -- ⭐⭐ LA PERTE (§8, 4e métrique) : matière SORTIE, vente JAMAIS née.
    --
    -- ⛔ DEFAUT CORRIGE A LA CERTIFICATION DU 05/08/2026, avant application.
    -- `consumed_at IS NOT NULL AND sale_id IS NULL` seul comptait aussi les
    -- plats `ready` QUI ATTENDENT LEUR SERVEUR — cas parfaitement normal en
    -- plein service. Le gerant aurait vu des PERTES FANTOMES, disparaissant
    -- au fil des services : la metrique serait devenue inutilisable au moment
    -- precis ou on la consulte le plus.
    --
    -- ⭐ `status = 'cancelled'` REND LA PERTE DEFINITIVE : la ligne ne
    -- reviendra jamais. Une ligne `ready` est un plat EN ATTENTE, pas perdu.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.consumed_at IS NOT NULL
                       AND koi.sale_id IS NULL
                       AND koi.status = 'cancelled'), 0)           AS loss_count,
    COALESCE(SUM(koi.computed_cost)
             FILTER (WHERE koi.consumed_at IS NOT NULL
                       AND koi.sale_id IS NULL
                       AND koi.status = 'cancelled'), 0)           AS loss_cost,

    -- ⭐ EN ATTENTE — distinct de la perte, et affiché separement : ces plats
    -- ont deja coute leur matiere mais peuvent ENCORE etre servis. C est un
    -- signal d ACTION (« sortez ces assiettes »), pas un constat comptable.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0) AS pending_count,
    COALESCE(SUM(koi.computed_cost)
             FILTER (WHERE koi.status = 'ready'), 0)               AS pending_cost,

    -- ⭐ TEMPS DE PRÉPARATION : de la commande à `ready`, pas au service.
    -- ⚠️ `served_at` dépend de la disponibilité du SERVEUR, pas de la
    -- cuisine : l'inclure mesurerait le service, pas la production.
    AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
      FILTER (WHERE koi.ready_at IS NOT NULL)                      AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  WHERE koi.bar_id = p_bar_id
    -- ⚠️ Borne sur `created_at` et non sur une date métier : ces lignes n'ont
    -- pas de `business_date`. Le décalage en fin de journée comptable est
    -- assumé — la fenêtre par défaut de 30 j le rend négligeable.
    AND koi.created_at >= v_start::TIMESTAMPTZ
    AND koi.created_at < (v_end + 1)::TIMESTAMPTZ;

  -- ═══════════════════════════════════════════════════════════════
  -- CLASSEMENT PAR PLAT
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⚠️ TRI EN DEUX TEMPS — signalé à la review du 05/08/2026.
   *
   * `ORDER BY margin DESC` seul plaçait les plats SANS AUCUNE VENTE (marge à
   * 0 — commandés puis tous annulés) AU MILIEU du classement, entre les
   * rentables et les déficitaires. Le promoteur cherche « quel plat mettre en
   * avant » : un plat jamais vendu n'a pas sa place parmi les rentables.
   *
   * ⭐ `sold_count > 0` d'abord, marge ensuite. Les plats sans vente
   * descendent en bas, où ils restent VISIBLES — ils portent une information
   * (pertes, temps de préparation) qu'il ne faut pas masquer.
   */
  SELECT COALESCE(
           jsonb_agg(row_to_json(t)::JSONB
                     ORDER BY (t.sold_count > 0) DESC, t.margin DESC),
           '[]'::JSONB)
  INTO v_dishes
  FROM (
    SELECT
      d.id                                                  AS dish_id,
      d.name                                                AS dish_name,
      -- ⛔ Assiettes, pas lignes (cf. served_count global).
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.status = 'served'), 0)      AS sold_count,
      COALESCE(SUM(koi.unit_price * koi.quantity)
               FILTER (WHERE koi.status = 'served'), 0)      AS revenue,
      COALESCE(SUM(koi.computed_cost)
               FILTER (WHERE koi.status = 'served'), 0)      AS cost,
      COALESCE(SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0))
               FILTER (WHERE koi.status = 'served'), 0)      AS margin,

      -- ⚠️ Taux NULL si aucun CA : un taux sur zéro n'a pas de sens
      -- mathématique. L'UI doit afficher « — », JAMAIS 0 % — même règle que
      -- `calculate_dish_cost` pour un plat offert.
      CASE
        WHEN COALESCE(SUM(koi.unit_price * koi.quantity)
                      FILTER (WHERE koi.status = 'served'), 0) > 0
        THEN ROUND(
          (SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0))
             FILTER (WHERE koi.status = 'served'))
          / SUM(koi.unit_price * koi.quantity)
             FILTER (WHERE koi.status = 'served') * 100, 1)
        ELSE NULL
      END                                                    AS margin_rate,

      -- ⭐ La perte, PAR PLAT : c'est ce qui la rend actionnable. « 12 000 F
      -- de pertes » ne dit rien ; « 12 000 F sur le poisson braisé » désigne
      -- une portion mal calibrée ou une prévision trop optimiste.
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.consumed_at IS NOT NULL
                         AND koi.sale_id IS NULL
                         AND koi.status = 'cancelled'), 0)   AS loss_count,
      COALESCE(SUM(koi.computed_cost)
               FILTER (WHERE koi.consumed_at IS NOT NULL
                         AND koi.sale_id IS NULL
                         AND koi.status = 'cancelled'), 0)   AS loss_cost,

      -- ⚠️ CAST OBLIGATOIRE : EXTRACT(EPOCH ...) retourne `double precision`,
      -- et `ROUND(double precision, integer)` N EXISTE PAS en PostgreSQL —
      -- la fonction ne se creerait meme pas. Defaut attrape a la
      -- certification du 05/08/2026, avant application.
      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
            FILTER (WHERE koi.ready_at IS NOT NULL)::NUMERIC, 1) AS avg_prep_min
    FROM public.kitchen_order_items koi
    JOIN public.dishes d
      ON d.id = koi.dish_id
     -- ⚠️ `d.bar_id = p_bar_id` INDISPENSABLE en plus du filtre sur koi :
     -- garde de défense en profondeur, cohérente avec les autres RPC du
     -- module (défaut d'isolation trouvé en review le 04/08/2026).
     AND d.bar_id = p_bar_id
    WHERE koi.bar_id = p_bar_id
      AND koi.created_at >= v_start::TIMESTAMPTZ
      AND koi.created_at < (v_end + 1)::TIMESTAMPTZ
    GROUP BY d.id, d.name
    -- ⚠️ Les plats SANS aucun mouvement sont exclus par le JOIN : un
    -- classement de rentabilité n'a rien à dire d'un plat jamais vendu.
  ) t;

  RETURN jsonb_build_object(
    'success',        true,
    'start_date',     v_start,
    'end_date',       v_end,
    'served_count',   COALESCE(v_totals.served_count, 0),
    'revenue',        ROUND(COALESCE(v_totals.revenue, 0), 2),
    'cost',           ROUND(COALESCE(v_totals.cost, 0), 2),
    'margin',         ROUND(COALESCE(v_totals.revenue, 0) - COALESCE(v_totals.cost, 0), 2),
    -- ⚠️ NULL si aucun CA sur la période — l'UI affiche « — », pas 0 %.
    'margin_rate',    CASE
                        WHEN COALESCE(v_totals.revenue, 0) > 0
                        THEN ROUND((COALESCE(v_totals.revenue, 0) - COALESCE(v_totals.cost, 0))
                                   / v_totals.revenue * 100, 1)
                        ELSE NULL
                      END,
    'loss_count',     COALESCE(v_totals.loss_count, 0),
    'loss_cost',      ROUND(COALESCE(v_totals.loss_cost, 0), 2),
    -- ⚠️ DISTINCT de la perte : plats prets, matiere deja sortie, encore
    -- servables. L UI ne doit JAMAIS les additionner aux pertes.
    'pending_count',  COALESCE(v_totals.pending_count, 0),
    'pending_cost',   ROUND(COALESCE(v_totals.pending_cost, 0), 2),
    -- ⚠️ NULL si aucun plat n'a atteint `ready` : une moyenne sur zéro
    -- mesure serait trompeuse.
    -- ⚠️ Meme cast que ci-dessus : v_totals.avg_prep_min est un
    -- `double precision` herite de l AVG(EXTRACT(...)).
    'avg_prep_min',   ROUND(v_totals.avg_prep_min::NUMERIC, 1),
    'dishes',         v_dishes
  );
END;
$$;

COMMENT ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) IS
  '§8 — les 4 métriques cuisine sur une période bornée (30 j par défaut). '
  '⭐ La 4e (`loss_count`/`loss_cost`) est la seule qu''aucun tableur ne calcule : '
  '`consumed_at IS NOT NULL AND sale_id IS NULL` = matière sortie, vente jamais née. '
  'Elle n''existe que parce que la machine d''état du §6 DISSOCIE `ready` de `served`. '
  '⚠️ RPC et non vue matérialisée : le gérant lit ces chiffres PENDANT le service, '
  'un rafraîchissement par cron (30 min) les rendrait inexploitables.';

-- ⚠️ CREATE perd les grants par défaut sur ce projet : REVOKE/GRANT explicites.
REVOKE ALL ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ Fonction créée, sécurisée, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'get_kitchen_metrics';
--    -- ATTENDU : 1 ligne · true · {search_path=public}
--
-- 2) ⛔ `anon` NE DOIT PAS pouvoir l'exécuter (marges et pertes = données de
--    gestion) :
--
--    SELECT has_function_privilege('anon',
--             'public.get_kitchen_metrics(uuid,date,date)', 'EXECUTE') AS anon,
--           has_function_privilege('authenticated',
--             'public.get_kitchen_metrics(uuid,date,date)', 'EXECUTE') AS auth;
--    -- ATTENDU : false | true
--
-- 3) ⭐ Cohérence des chiffres — remplacer <BAR_ID> :
--
--    SELECT public.get_kitchen_metrics('<BAR_ID>'::UUID);
--    -- VÉRIFIER : `margin` = `revenue` - `cost`
--    --            `served_count` = le compte relevé au pré-vol (étape 3)
--    --            `loss_cost` = 0 si aucune annulation après `ready`
--
-- 4) ⭐ INDEX cree :
--
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='kitchen_order_items'
--    ORDER BY indexname;
--    -- ATTENDU : idx_koi_metrics_by_bar_date parmi les 4
--
-- 5) ⚠️ ISOLATION — depuis un compte membre d un AUTRE bar :
--    SELECT public.get_kitchen_metrics('<BAR_ID>'::UUID);
--    -- ATTENDU : {"success": false, "error": "Accès refusé à ce bar"}

-- ✅ APPLIQUEE EN PRODUCTION LE 05/08/2026.
--    Post-vols 1 a 3 certifies : SECURITY DEFINER + search_path fige,
--    anon exclu (false/true), index cree (5 index sur la table).
--
-- ⚠️ POST-VOL 4 : la RPC retourne « Acces refuse a ce bar » depuis le SQL
--    Editor — auth.uid() y vaut NULL, donc is_bar_member() est false.
--    C EST LE COMPORTEMENT ATTENDU, et cela VALIDE la garde d isolation.
--    L arithmetique a donc ete verifiee par une requete equivalente sans
--    garde, sur les memes bornes :
--        served_count = 2 · revenue = 5 000 · cost = 4 000
--        loss_count   = 1 · pending_count = 1
--    ⭐  et NON 2 prouve la correction des pertes fantomes :
--       l assiette  en attente n est pas comptee comme perdue.
--    ⭐  (et non 8 000) confirme que computed_cost couvre deja
--       la ligne entiere — le multiplier aurait affiche une marge NEGATIVE.
