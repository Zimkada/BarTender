-- ===================================================================
-- MIGRATION: get_kitchen_metrics — CA sur la journée de la VENTE
-- DATE: 2026-08-06
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `get_kitchen_metrics` borne TOUT sur `created_at` — même défaut que
--   `get_kitchen_production`, corrigé le 06/08/2026 par la migration
--   20260806140000. Ici l'enjeu est plus lourd : ce ne sont pas des
--   quantités mais le CA CUISINE et les MARGES du gérant.

-- ⭐⭐ LA CORRECTION LA PLUS IMPORTANTE N'EST PAS CELLE QU'ON CROIT
--   Deux décalages se cumulaient. Ils n'ont PAS le même poids réel, et il
--   faut le dire :
--
--   1. Commande un jour, service le lendemain → RARE. Confirmé par
--      l'exploitant : « généralement un repas ne peut pas être commandé un
--      jour et servi le lendemain ». Le cas relevé en base (04→05) était un
--      artefact de test, une ligne laissée ouverte.
--
--   2. ⭐ FERMETURE APRÈS MINUIT → CHAQUE NUIT. Un bar qui ferme à 6h, un
--      plat servi à 1h du matin : commande et service tombent le même jour
--      CIVIL, mais ce jour n'est pas la JOURNÉE COMMERCIALE. C'est CE
--      décalage-là qui fausse les chiffres en exploitation normale.
--
--   ⚠️ La correction vaut donc surtout pour (2). Ne pas la survendre.

-- ⭐⭐ LE CA CUISINE SUIT `sales.business_date`, IL NE LA RECALCULE PAS
--   `kitchen_order_items` porte `sale_id`, et `sales.business_date` est
--   calculée par le trigger de référence (migration 067). On la REPREND.
--
--   ⛔ Recalculer la journée depuis `served_at` aurait été une faute : le CA
--   global de l'écran vient de `sales`, le CA cuisine de cette RPC. Deux
--   méthodes de calcul, même à écart nul aujourd'hui, finissent par diverger
--   — et le gérant se retrouverait avec deux chiffres contradictoires sur le
--   même écran sans savoir lequel croire. UNE SEULE SOURCE PAR JOURNÉE.
--
--   ⚠️ Vérifié sur données réelles avant écriture (PRESTIGE BAR 2, 3 lignes
--   servies) : `DATE(served_at AT TIME ZONE ... - closing_hour)` et
--   `s.business_date` coïncidaient sur toutes. On garde la seconde, qui est
--   la source de vérité du projet.

-- ⭐ LES PERTES, ELLES, N'ONT PAS DE VENTE
--   Une perte est par définition `sale_id IS NULL` : impossible d'emprunter
--   la journée d'une vente qui n'existe pas. On applique donc la formule du
--   trigger 067 sur `consumed_at`, l'instant où la matière sort du stock.
--   ⚠️ Fuseau FIGÉ explicitement (le serveur est en UTC) — ne pas dépendre
--   d'un réglage invisible.

-- RÈGLE RETENUE, compteur par compteur :
--   · served/revenue/cost/margin → `sales.business_date` (la vente)
--   · loss_count / loss_cost     → `consumed_at`  + journée commerciale
--   · avg_prep_min               → `ready_at`     + journée commerciale
--   · pending_count / _cost      → AUCUNE borne (état instantané)

-- BREAKING_CHANGE: NO (comportement CORRIGÉ, signature identique)
--   Même nom, mêmes paramètres, même forme de retour. Aucun appelant à
--   modifier. Les chiffres CHANGENT — c'est l'objet de la migration.

-- ROLLBACK_STRATEGY:
--   Réappliquer le corps de 20260805090000_kitchen_metrics_rpc.sql.
--   ⚠️ Restaure un comptage FAUX : uniquement en cas d'erreur de CETTE
--   migration, jamais comme état cible.

-- FUNCTIONS_MODIFIED: get_kitchen_metrics
-- INDEXES_CREATED: aucun (idx_koi_served_at / idx_koi_consumed_at existent
--   déjà depuis 20260806140000 ; idx_koi_metrics_by_bar_date sert encore au
--   garde-fou et aux états instantanés)
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction doit EXISTER (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_metrics';
--    -- ATTENDU : 1
--
-- 2) ⛔ BLOQUANT — `sales.business_date` existe et est peuplée (c'est la
--    source de vérité qu'on va reprendre) :
--
--    SELECT count(*) FILTER (WHERE business_date IS NULL) AS sans_business_date,
--           count(*)                                       AS total
--    FROM public.sales
--    WHERE created_at > CURRENT_DATE - 30;
--    -- ATTENDU : 0 | n. ⛔ Si `sans_business_date` > 0, NE PAS APPLIQUER :
--    -- le CA cuisine de ces ventes disparaîtrait des compteurs.
--
-- 3) ⚠️ INFORMATIF — mesurer l'écart AVANT/APRÈS sur votre bar :
--
--    SELECT count(*) AS lignes_qui_changent_de_journee
--    FROM public.kitchen_order_items koi
--    JOIN public.sales s ON s.id = koi.sale_id
--    WHERE koi.status = 'served'
--      AND DATE(koi.created_at AT TIME ZONE 'Africa/Porto-Novo') <> s.business_date;
--    -- Plus ce nombre est élevé, plus la correction change les chiffres
--    -- affichés au gérant.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_kitchen_metrics'
  ) THEN
    RAISE EXCEPTION 'get_kitchen_metrics absente — appliquer d''abord 20260805090000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ FONCTION                                                         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_kitchen_metrics(
  p_bar_id     UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start   DATE;
  v_end     DATE;
  v_close   INTEGER;
  v_totals  RECORD;
  v_dishes  JSONB;
BEGIN
  -- ⭐ Filtrage d'accès EXPLICITE : en SECURITY DEFINER la RLS des tables
  -- lues NE S'APPLIQUE PAS. Sans ce garde, n'importe quel utilisateur
  -- authentifié lirait les marges et les pertes de TOUS les bars.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⭐ Heure de clôture DU BAR — même source que le trigger 067.
  SELECT COALESCE(closing_hour, 6) INTO v_close
  FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AGRÉGATS GLOBAUX — chaque compteur sur SA journée
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⭐⭐ LE FILTRE DE PÉRIODE EST DANS CHAQUE `FILTER`, PAS DANS LE `WHERE`.
   * Un `WHERE` unique ne peut border qu'UNE colonne — c'est ce qui rendait
   * la version précédente fausse.
   *
   * ⭐ `LEFT JOIN sales` : les PERTES n'ont pas de vente (`sale_id IS NULL`).
   * Un JOIN simple les ferait toutes disparaître — la métrique la plus
   * précieuse du module, celle qu'aucun tableur ne calcule.
   */
  SELECT
    -- ⛔ SUM(quantity) et NON count(*) : une ligne « 3 x Poulet » est UNE
    -- ligne mais TROIS assiettes.
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS served_count,

    -- ⚠️ ASYMÉTRIE VOULUE, vérifiée en review le 05/08/2026 :
    --   `unit_price`    est UNITAIRE   → × quantity
    --   `computed_cost` couvre LA LIGNE → JAMAIS × quantity
    -- `mark_kitchen_item_ready` multiplie déjà par quantity en calculant les
    -- quantités brutes d'ingrédients. Multiplier ici gonflerait le coût d'un
    -- facteur `quantity` et afficherait des marges NÉGATIVES sur toute
    -- commande multiple.
    COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS revenue,
    COALESCE(SUM(koi.computed_cost) FILTER (
      WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
    ), 0) AS cost,

    -- ⭐⭐ LA PERTE (§8) : matière SORTIE, vente JAMAIS née.
    -- ⛔ `status = 'cancelled'` REND LA PERTE DÉFINITIVE. Sans lui, les plats
    -- `ready` qui attendent leur serveur — cas NORMAL en plein service —
    -- seraient comptés comme pertes : le gérant verrait des PERTES FANTÔMES
    -- disparaissant au fil du service, au moment précis où il consulte le
    -- plus cette métrique.
    -- ⚠️ Bornée sur `consumed_at` : une perte n'a pas de vente dont
    -- emprunter la journée.
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_count,
    COALESCE(SUM(koi.computed_cost) FILTER (
      WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_cost,

    -- ⚠️ EN ATTENTE — état INSTANTANÉ, volontairement NON borné : « des
    -- assiettes refroidissent en ce moment » n'a de sens qu'au présent. Les
    -- borner sur une période passée afficherait un signal d'action périmé.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0) AS pending_count,
    COALESCE(SUM(koi.computed_cost) FILTER (WHERE koi.status = 'ready'), 0) AS pending_cost,

    -- ⭐ TEMPS DE PRÉPARATION : de la commande à `ready`, jamais au service.
    -- ⚠️ `served_at` dépend de la disponibilité du SERVEUR : l'inclure
    -- mesurerait la salle, pas la cuisine.
    AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
      WHERE koi.ready_at IS NOT NULL
        AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ) AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  -- ⭐ LEFT et non INNER : sans quoi les pertes (sale_id NULL) disparaissent.
  LEFT JOIN public.sales s ON s.id = koi.sale_id
  WHERE koi.bar_id = p_bar_id
    -- ⚠️ GARDE-FOU, pas le filtre de période (qui est dans les FILTER).
    -- ⛔ Ne PAS remplacer par une marge en jours sur `created_at` seul : un
    -- plat resté ouvert plus longtemps que la marge disparaîtrait
    -- SILENCIEUSEMENT. On garde une ligne dès QU'UN de ses événements peut
    -- tomber dans la fenêtre.
    AND (
         (s.business_date BETWEEN (v_start - 1) AND (v_end + 1))
      OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
      AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
      AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.created_at  >= (v_start - 1)::TIMESTAMPTZ
      AND koi.created_at  <  (v_end + 2)::TIMESTAMPTZ)
      -- ⚠️ États en cours : jamais bornés (compteurs instantanés).
      OR koi.status IN ('pending','accepted','preparing','ready')
    );

  -- ═══════════════════════════════════════════════════════════════
  -- CLASSEMENT PAR PLAT — mêmes bornes que les agrégats globaux
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⚠️ TRI EN DEUX TEMPS. `ORDER BY margin DESC` seul plaçait les plats SANS
   * AUCUNE VENTE (marge à 0 — commandés puis tous annulés) AU MILIEU du
   * classement, entre les rentables et les déficitaires. Le promoteur
   * cherche « quel plat mettre en avant » : un plat jamais vendu n'a pas sa
   * place parmi les rentables.
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
      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS sold_count,
      COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS revenue,
      COALESCE(SUM(koi.computed_cost) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS cost,
      COALESCE(SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0)) FILTER (
        WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
      ), 0)                                                 AS margin,

      -- ⚠️ Taux NULL si aucun CA : un taux sur zéro n'a pas de sens
      -- mathématique. L'UI affiche « — », JAMAIS 0 % — même règle que
      -- `calculate_dish_cost` pour un plat offert.
      CASE
        WHEN COALESCE(SUM(koi.unit_price * koi.quantity) FILTER (
               WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
             ), 0) > 0
        THEN ROUND(
          (SUM(koi.unit_price * koi.quantity - COALESCE(koi.computed_cost, 0)) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end))
          / SUM(koi.unit_price * koi.quantity) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end) * 100, 1)
        ELSE NULL
      END                                                    AS margin_rate,

      -- ⭐ La perte, PAR PLAT : c'est ce qui la rend actionnable. « 12 000 F
      -- de pertes » ne dit rien ; « 12 000 F sur le poisson braisé » désigne
      -- une portion mal calibrée ou une prévision trop optimiste.
      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
          AND koi.status = 'cancelled'
          AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                  AS loss_count,
      COALESCE(SUM(koi.computed_cost) FILTER (
        WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
          AND koi.status = 'cancelled'
          AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                  AS loss_cost,

      -- ⚠️ CAST OBLIGATOIRE : EXTRACT(EPOCH ...) rend `double precision`, et
      -- `ROUND(double precision, integer)` N'EXISTE PAS en PostgreSQL — la
      -- fonction ne se créerait même pas.
      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
        WHERE koi.ready_at IS NOT NULL
          AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      )::NUMERIC, 1)                                         AS avg_prep_min
    FROM public.kitchen_order_items koi
    LEFT JOIN public.sales s ON s.id = koi.sale_id
    JOIN public.dishes d
      ON d.id = koi.dish_id
     -- ⚠️ `d.bar_id = p_bar_id` INDISPENSABLE en plus du filtre sur koi :
     -- défense en profondeur, cohérente avec les autres RPC du module
     -- (défaut d'isolation trouvé en review le 04/08/2026).
     AND d.bar_id = p_bar_id
    WHERE koi.bar_id = p_bar_id
      AND (
           (s.business_date BETWEEN (v_start - 1) AND (v_end + 1))
        OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
        AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
        AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      )
    GROUP BY d.id, d.name
    -- ⚠️ Les plats dont AUCUN événement ne tombe dans la période sont
    -- écartés : sinon le classement afficherait des plats à « 0 vendu,
    -- 0 perdu », ramassés par le garde-fou large du WHERE.
    HAVING COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.status = 'served' AND s.business_date BETWEEN v_start AND v_end
           ), 0) > 0
        OR COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
               AND koi.status = 'cancelled'
               AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                        - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
           ), 0) > 0
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
    -- ⚠️ DISTINCT de la perte : plats prêts, matière déjà sortie, encore
    -- servables. L'UI ne doit JAMAIS les additionner aux pertes.
    'pending_count',  COALESCE(v_totals.pending_count, 0),
    'pending_cost',   ROUND(COALESCE(v_totals.pending_cost, 0), 2),
    -- ⚠️ NULL si aucun plat n'a atteint `ready` : une moyenne sur zéro
    -- mesure serait trompeuse. Même cast que ci-dessus.
    'avg_prep_min',   ROUND(v_totals.avg_prep_min::NUMERIC, 1),
    'dishes',         v_dishes
  );
END;
$$;

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS sur ce projet : les re-poser est
-- OBLIGATOIRE, sinon l'écran « Rentabilité cuisine » tombe en
-- « permission denied » pour tous.
REVOKE ALL ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) TO service_role;

COMMENT ON FUNCTION public.get_kitchen_metrics(UUID, DATE, DATE) IS
  'Métriques cuisine du §8 (avec montants), 30 jours par défaut. CA et marges '
  'bornés sur sales.business_date — MÊME source que le CA global, jamais '
  'recalculée. Pertes sur consumed_at et préparation sur ready_at, en journée '
  'commerciale du bar. Réservée à canViewKitchenCosts côté client ; le pendant '
  'sans montants pour le cuisinier est get_kitchen_production.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — fonction remplacée, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_metrics';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔ BLOQUANT — GRANTS re-posés (CREATE OR REPLACE les perd) :
--
--    SELECT has_function_privilege('anon',
--             'public.get_kitchen_metrics(UUID,DATE,DATE)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.get_kitchen_metrics(UUID,DATE,DATE)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — LES PERTES N'ONT PAS DISPARU. Le `LEFT JOIN sales` est
--    le point de rupture de cette migration : un INNER JOIN aurait effacé
--    TOUTES les pertes (sale_id IS NULL), sans aucune erreur visible.
--
--    SELECT pg_get_functiondef(p.oid) ~ 'LEFT JOIN public\.sales' AS left_join_present
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_metrics';
--    -- ATTENDU : true
--
-- 4) ⛔ BLOQUANT — cohérence CA cuisine ⟷ CA des ventes. Les deux doivent
--    tomber dans la MÊME journée, puisqu'ils partagent désormais
--    `business_date` :
--
--    SELECT s.business_date,
--           SUM(koi.unit_price * koi.quantity) AS ca_cuisine
--    FROM public.kitchen_order_items koi
--    JOIN public.sales s ON s.id = koi.sale_id
--    WHERE koi.bar_id = 'f85ebaf5-502c-4dc9-b4ba-7e511c42e2dc'
--      AND koi.status = 'served'
--    GROUP BY s.business_date
--    ORDER BY s.business_date DESC;
--    -- ATTENDU sur PRESTIGE BAR 2 : 2 500 le 2026-08-05, 5 000 le 2026-08-04.
--    -- Ces montants doivent correspondre à ce qu'affiche « Rentabilité
--    -- cuisine » sur les mêmes journées.
--
-- 5) ⚠️ FONCTIONNEL — via l'application, connecté en gérant (auth.uid() vaut
--    NULL dans le SQL Editor : la RPC y répond « Accès refusé », c'est le
--    comportement ATTENDU).
--    -- Historique → onglet Analytique → portée Restau → « Rentabilité
--    -- cuisine ». Vérifier que CA, marge et pertes s'affichent, et que le CA
--    -- cuisine ne dépasse jamais le CA total de la même période.
