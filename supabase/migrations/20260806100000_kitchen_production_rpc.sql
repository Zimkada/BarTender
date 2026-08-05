-- ===================================================================
-- MIGRATION: get_kitchen_production — l'activité du cuisinier, SANS montants
-- DATE: 2026-08-06
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   `getQueue` ne charge que 'pending','accepted','preparing','ready'. Dès
--   qu'un plat passe à `served` ou `cancelled`, il DISPARAÎT de l'écran du
--   cuisinier. En fin de service son écran est vide : il n'a aucune trace de
--   ce qu'il a produit, ni de ce qui a été perdu.
--
--   ⭐⭐ LE POINT DUR N'EST PAS LE CONFORT, C'EST LA PERTE.
--   Une perte, c'est de la matière sortie sans vente. Aujourd'hui la seule
--   personne qui la voit est le gérant, dans « Rentabilité cuisine ». Or
--   c'est le CUISINIER qui peut agir dessus (portion mal calibrée,
--   sur-production, plat lancé trop tôt). La personne capable de corriger le
--   problème est la seule à ne jamais le voir.

-- ⛔⛔ POURQUOI UNE RPC NEUVE ET NON UN ASSOUPLISSEMENT DE `get_kitchen_metrics`
--   `get_kitchen_metrics` est ouverte à tout membre du bar (is_bar_member) :
--   techniquement le cuisinier PEUT déjà l'appeler. Ce qui l'en empêche est
--   une garde CÔTÉ CLIENT (`canViewKitchenCosts` dans useKitchenMetrics).
--   ⛔ Relâcher cette garde enverrait les MONTANTS au cuisinier — revenue,
--   cost, margin, loss_cost voyagent dans la même réponse. Le §8 est
--   explicite : « il voit les QUANTITÉS, pas les MONTANTS ».
--   ⭐ La seule façon sûre est une fonction qui NE CALCULE PAS les montants :
--   ce qui n'est pas sélectionné ne peut pas fuir. Une garde applicative se
--   contourne en lisant la réponse réseau ; une colonne absente, non.

-- ⚠️ CE QUE CETTE FONCTION NE RENVOIE PAS, ET POURQUOI
--   Aucun `revenue`, `cost`, `margin`, `margin_rate`, `loss_cost`,
--   `unit_price`, `computed_cost`. Volontaire et non négociable : ce sont
--   précisément les colonnes que le rôle cuisinier n'a pas le droit de voir.
--   Toute évolution de cette fonction doit préserver cette propriété.

-- BREAKING_CHANGE: NO
--   Fonction NEUVE. Aucune table, vue ou RPC existante touchée.
--   `get_kitchen_metrics` reste strictement inchangée pour le gérant.
--   Un bar pur ne l'appelle jamais (`enabled: hasRestaurant` côté client).

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_kitchen_production(UUID, DATE, DATE);
--   (aucun index créé : réutilise idx_koi_metrics_by_bar_date de la
--    migration 20260805090000, même prédicat bar_id + created_at)

-- FUNCTIONS_CREATED: get_kitchen_production
-- INDEXES_CREATED: aucun · TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — rien ne doit préexister sous ce nom :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — dépendances présentes :
--
--    SELECT to_regclass('public.kitchen_order_items') AS t_items,
--           to_regclass('public.dishes')              AS t_dishes,
--           (SELECT count(DISTINCT p.proname) FROM pg_proc p
--            JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public'
--              AND p.proname IN ('is_bar_member','is_super_admin')) AS helpers;
--    -- ATTENDU : non NULL | non NULL | 2
--
-- 3) ⚠️ INFORMATIF — l'index de la migration 20260805090000 est réutilisé :
--
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND indexname='idx_koi_metrics_by_bar_date';
--    -- ATTENDU : 1 ligne. Si ABSENTE, la fonction marche quand même mais
--    -- balaye la table : créer l'index avant sur un bar à gros volume.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_bar_member'
  ) THEN
    RAISE EXCEPTION 'Helper is_bar_member absent — filtrage d''accès impossible';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ FONCTION                                                         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_kitchen_production(
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
  -- lirait la production de TOUS les bars.
  -- ⚠️ `is_bar_member` et non un test de rôle : le gérant et le promoteur
  -- doivent pouvoir lire cette vue aussi (elle est simplement plus pauvre que
  -- `get_kitchen_metrics`). Restreindre au seul cuisinier créerait une
  -- fonction que son propre chef ne pourrait pas consulter.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⚠️ Fenêtre par défaut : 30 jours, alignée sur `get_kitchen_metrics` et
  -- sur la fenêtre la plus large offerte par l'UI (`last_30days`).
  -- ⭐ En pratique l'UI envoie TOUJOURS des bornes explicites, calculées par
  -- `useDateRangeFilter` — qui tient compte de la JOURNÉE COMMERCIALE du bar.
  -- Ce défaut ne sert donc qu'aux appels directs ; il reste borné, car un
  -- agrégat non borné grossirait indéfiniment avec l'historique du bar.
  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  -- ⚠️ `- 30` (entier) et non `- INTERVAL '30 days'` : la seconde forme rend
  -- un TIMESTAMP que l'affectation à `v_start DATE` tronquerait silencieusement.
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AGRÉGATS GLOBAUX — QUANTITÉS ET DURÉES UNIQUEMENT
  -- ═══════════════════════════════════════════════════════════════
  SELECT
    -- ⛔ SUM(quantity) et NON count(*) — même règle que get_kitchen_metrics.
    -- Une ligne « 3 x Poulet braisé » est UNE ligne mais TROIS assiettes. Le
    -- cuisinier a préparé trois assiettes : lui en afficher une seule
    -- sous-estimerait son propre travail.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'served'), 0) AS served_count,

    -- ⭐⭐ LA PERTE — la raison d'être de cet écran.
    -- ⛔ `status = 'cancelled'` INDISPENSABLE : sans lui, les plats `ready`
    -- qui attendent leur serveur (cas NORMAL en plein service) seraient
    -- comptés comme perdus. Le cuisinier verrait des pertes fantômes
    -- disparaître au fil du service et cesserait de croire le chiffre.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.consumed_at IS NOT NULL
                       AND koi.sale_id IS NULL
                       AND koi.status = 'cancelled'), 0)                AS loss_count,

    -- ⭐ EN ATTENTE — JAMAIS additionné aux pertes. Ces plats ont coûté leur
    -- matière mais restent SERVABLES : signal d'action (« ces assiettes
    -- refroidissent »), pas constat comptable.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0)  AS pending_count,

    -- ⚠️ EN COURS — ce qui l'attend encore. Absent de get_kitchen_metrics
    -- (le gérant regarde le bilan) mais essentiel ici : c'est la moitié
    -- « ce qui m'attend » de la question posée.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status IN
                       ('pending','accepted','preparing')), 0)          AS todo_count,

    -- ⭐ TEMPS DE PRÉPARATION : de la commande à `ready`, jamais au service.
    -- ⚠️ `served_at` dépend de la disponibilité du SERVEUR : l'inclure
    -- mesurerait la salle et non la cuisine. Le cuisinier serait jugé sur un
    -- délai qu'il ne maîtrise pas.
    ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
          FILTER (WHERE koi.ready_at IS NOT NULL)::NUMERIC, 1)          AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  WHERE koi.bar_id = p_bar_id
    -- ⚠️ Borne sur `created_at` : ces lignes n'ont pas de `business_date`.
    -- Décalage assumé et documenté (cf. 20260805090000) — un plat commandé à
    -- 23h et servi à 1h tombe dans la veille ici.
    AND koi.created_at >= v_start::TIMESTAMPTZ
    AND koi.created_at < (v_end + 1)::TIMESTAMPTZ;

  -- ═══════════════════════════════════════════════════════════════
  -- DÉTAIL PAR PLAT
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⭐ TRI PAR PERTES D'ABORD, puis par volume produit.
   *
   * ⚠️ DIFFÉRENT de get_kitchen_metrics, qui trie par marge : le gérant
   * cherche « quel plat mettre en avant », le cuisinier « qu'est-ce qui
   * cloche ». Un plat régulièrement perdu est SON information — il désigne
   * une portion mal calibrée ou un lancement trop précoce.
   */
  SELECT COALESCE(
           jsonb_agg(row_to_json(t)::JSONB
                     ORDER BY t.loss_count DESC, t.served_count DESC),
           '[]'::JSONB)
  INTO v_dishes
  FROM (
    SELECT
      d.id                                                  AS dish_id,
      d.name                                                AS dish_name,
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.status = 'served'), 0)      AS served_count,
      COALESCE(SUM(koi.quantity)
               FILTER (WHERE koi.consumed_at IS NOT NULL
                         AND koi.sale_id IS NULL
                         AND koi.status = 'cancelled'), 0)   AS loss_count,
      -- ⚠️ CAST OBLIGATOIRE : EXTRACT(EPOCH ...) rend `double precision`, et
      -- `ROUND(double precision, integer)` N'EXISTE PAS en PostgreSQL — la
      -- fonction ne se créerait même pas.
      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
            FILTER (WHERE koi.ready_at IS NOT NULL)::NUMERIC, 1) AS avg_prep_min
    FROM public.kitchen_order_items koi
    JOIN public.dishes d ON d.id = koi.dish_id
    WHERE koi.bar_id = p_bar_id
      AND koi.created_at >= v_start::TIMESTAMPTZ
      AND koi.created_at < (v_end + 1)::TIMESTAMPTZ
    GROUP BY d.id, d.name
  ) t;

  RETURN jsonb_build_object(
    'success',       true,
    'start_date',    v_start,
    'end_date',      v_end,
    'served_count',  COALESCE(v_totals.served_count, 0),
    'loss_count',    COALESCE(v_totals.loss_count, 0),
    'pending_count', COALESCE(v_totals.pending_count, 0),
    'todo_count',    COALESCE(v_totals.todo_count, 0),
    -- ⚠️ PAS de COALESCE ici : `null` signifie « aucun plat n'a atteint
    -- ready sur la période ». L'UI doit afficher « — » et JAMAIS « 0 min »,
    -- qui se lirait comme une préparation instantanée.
    'avg_prep_min',  v_totals.avg_prep_min,
    'dishes',        COALESCE(v_dishes, '[]'::JSONB)
  );
END;
$$;

-- ⚠️ CREATE perd les grants par défaut sur ce projet : REVOKE/GRANT explicites.
-- ⛔ Ne JAMAIS accorder à `anon` — la fonction lit des données de bar.
REVOKE ALL ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO service_role;

COMMENT ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) IS
  'Activité de production cuisine (quantités et durées) sur une fenêtre bornée, '
  '30 jours par défaut. Destinée au rôle cuisinier : ne renvoie AUCUN montant. '
  'Le pendant avec montants est get_kitchen_metrics, réservé à canViewKitchenCosts.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction existe, en SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔ BLOQUANT — privilèges : `anon` ne doit PAS pouvoir l'exécuter :
--
--    SELECT has_function_privilege('anon',
--             'public.get_kitchen_production(UUID,DATE,DATE)','EXECUTE')  AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.get_kitchen_production(UUID,DATE,DATE)','EXECUTE')  AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — AUCUN MONTANT dans la sortie. C'est LA propriété qui
--    justifie l'existence de cette fonction :
--
--    SELECT pg_get_functiondef(p.oid) ~* '(unit_price|computed_cost|revenue|margin|loss_cost)'
--             AS contient_des_montants
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : false
--    -- ⛔ Si `true` : NE PAS DÉPLOYER l'écran cuisinier. Un montant a été
--    --    réintroduit et fuirait vers un rôle qui n'y a pas droit.
--
-- 4) ⚠️ FONCTIONNEL — sur un bar réel avec de la restauration (auth.uid() vaut
--    NULL dans le SQL Editor, donc is_bar_member() est false : ce contrôle se
--    fait par l'UI, comme pour les autres RPC du projet) :
--
--    -- Attendu via l'application, connecté en cuisinier :
--    --   served_count / loss_count / pending_count / todo_count cohérents
--    --   avec la file du jour, et AUCUNE clé de montant dans la réponse.
--
-- 5) ⚠️ COHÉRENCE avec get_kitchen_metrics sur la MÊME fenêtre — les deux
--    fonctions doivent compter les mêmes assiettes :
--
--    -- Comparer served_count et loss_count des deux RPC sur les mêmes dates.
--    -- Un écart signalerait une divergence de filtre entre les deux.
