-- ===================================================================
-- MIGRATION: get_kitchen_production — chaque compteur sur SA date d'événement
-- DATE: 2026-08-06
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM (relevé en test terrain le 06/08/2026, quelques heures après la
-- mise en service de 20260806100000) :
--   L'écran « Mon activité » affichait 0 partout alors qu'un plat venait
--   d'être servi. Relevé SQL à l'appui :
--
--     created_at = 2026-08-04 19:40  |  served_at = 2026-08-05 09:14
--
--   Le plat a été COMMANDÉ le 4 et SERVI le 5. La v1 bornait TOUS les
--   compteurs sur `created_at` : ce plat comptait donc dans les « servis du
--   4 » — un jour où cette assiette n'a rien servi — et manquait au 5, où
--   elle a pourtant bel et bien été servie. LES DEUX JOURNÉES ÉTAIENT FAUSSES
--   EN MÊME TEMPS.

-- ⛔⛔ POURQUOI L'ARGUMENT DE LA v1 NE TENAIT PAS
--   La v1 documentait ce décalage comme une dette mineure : « quelques
--   heures, négligeable sur des fenêtres de 7 à 90 jours ». Deux erreurs :
--     · la fenêtre PAR DÉFAUT de cet écran est « Aujourd'hui » — quelques
--       heures y suffisent à faire basculer une ligne d'un jour à l'autre ;
--     · sur une journée à un seul plat, l'erreur est de 100 %.
--   ⭐ Et surtout, c'est incohérent EN SOI : borner un compteur de plats
--   SERVIS sur la date de COMMANDE mesure autre chose que ce qu'il annonce.

-- ⭐⭐ LA RÈGLE : CHAQUE ÉVÉNEMENT COMPTE LE JOUR OÙ IL A LIEU
--   · Servis      → `served_at`   (un service rendu)
--   · Perdus      → `consumed_at` (la matière sort du stock à cet instant)
--   · À préparer  → `created_at`  (une charge de travail reçue) — INCHANGÉ
--   · Préparation → `ready_at`    (une durée de production achevée)
--   Le compteur « à préparer » est le SEUL que la date de commande décrive
--   correctement : c'est bien à la commande que le travail arrive.

-- ⭐ SECONDE CORRECTION, INDÉPENDANTE : LA JOURNÉE COMMERCIALE
--   Un bar qui ferme à 6h veut que les plats servis à 2h du matin comptent
--   dans la soirée de la VEILLE. `kitchen_order_items` n'a pas de colonne
--   `business_date` ; on applique donc la même formule que le trigger de
--   référence (migration 067) : DATE(evenement - closing_hour heures).
--   ⚠️ Ce n'est PAS le même sujet que le choix de colonne ci-dessus : l'un
--   dit QUELLE date lire, l'autre COMMENT découper la journée dessus.

-- ⚠️ FUSEAU FIGÉ EXPLICITEMENT — `DATE(timestamptz)` s'évalue dans le
--   `TimeZone` de la SESSION. Le trigger 067 s'en remet au réglage serveur ;
--   ici on force `Africa/Porto-Novo` (UTC+1, sans heure d'été) pour que le
--   résultat ne dépende pas d'un réglage invisible et ne change pas si la
--   configuration du serveur évolue.

-- BREAKING_CHANGE: NO (comportement CORRIGÉ, signature identique)
--   Même nom, mêmes paramètres, même forme de retour. Aucun appelant à
--   modifier. Les chiffres CHANGENT — c'est l'objet de la migration.

-- ROLLBACK_STRATEGY:
--   Réappliquer le corps de 20260806100000_kitchen_production_rpc.sql.
--   ⚠️ Le rollback restaure un comptage FAUX : ne l'utiliser qu'en cas
--   d'erreur de cette migration elle-même, jamais comme état cible.

-- FUNCTIONS_MODIFIED: get_kitchen_production
-- INDEXES_CREATED: idx_koi_served_at, idx_koi_consumed_at
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction v1 doit EXISTER (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : 1
--
-- 2) ⛔ BLOQUANT — les colonnes d'événement existent :
--
--    SELECT count(*) FILTER (WHERE column_name='served_at')   AS served_at,
--           count(*) FILTER (WHERE column_name='consumed_at') AS consumed_at,
--           count(*) FILTER (WHERE column_name='ready_at')    AS ready_at
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='kitchen_order_items';
--    -- ATTENDU : 1 | 1 | 1
--
-- 3) ⚠️ INFORMATIF — mesurer l'écart AVANT/APRÈS sur votre bar. Cette
--    requête montre les lignes dont la journée de commande diffère de la
--    journée de service : ce sont exactement celles que la v1 comptait mal.
--
--    SELECT count(*) AS lignes_mal_comptees
--    FROM public.kitchen_order_items
--    WHERE served_at IS NOT NULL
--      AND DATE(created_at AT TIME ZONE 'Africa/Porto-Novo')
--       <> DATE(served_at  AT TIME ZONE 'Africa/Porto-Novo');
--    -- Attendu sur PRESTIGE BAR 2 : au moins 1 (le plat du 04→05).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_kitchen_production'
  ) THEN
    RAISE EXCEPTION 'get_kitchen_production absente — appliquer d''abord 20260806100000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INDEX — les nouvelles bornes portent sur d'autres colonnes        │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ `idx_koi_metrics_by_bar_date` (migration 20260805090000) indexe
-- (bar_id, created_at) : il ne sert plus aux compteurs « servis » et
-- « perdus », qui filtrent désormais sur d'autres colonnes.
-- ⭐ Index PARTIELS : la majorité des lignes ont `served_at IS NULL` (plats
-- en cours) — les indexer serait du volume mort.

CREATE INDEX IF NOT EXISTS idx_koi_served_at
  ON public.kitchen_order_items (bar_id, served_at)
  WHERE served_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_koi_consumed_at
  ON public.kitchen_order_items (bar_id, consumed_at)
  WHERE consumed_at IS NOT NULL;

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
  -- lues NE S'APPLIQUE PAS.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⭐ Heure de clôture DU BAR — même source que le trigger de référence
  -- (migration 067). Défaut 6h si absente, comme partout dans le projet.
  SELECT COALESCE(closing_hour, 6) INTO v_close
  FROM public.bars WHERE id = p_bar_id;
  v_close := COALESCE(v_close, 6);

  v_end   := COALESCE(p_end_date, CURRENT_DATE);
  v_start := COALESCE(p_start_date, v_end - 30);

  IF v_start > v_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Période invalide : début après fin');
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AGRÉGATS GLOBAUX — chaque compteur sur SA date d'événement
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⭐⭐ LE FILTRE DE PÉRIODE EST DANS CHAQUE `FILTER`, PAS DANS LE `WHERE`.
   *
   * ⛔ C'est le changement structurel de cette migration. Un `WHERE` unique
   * ne peut border qu'UNE colonne — c'est ce qui rendait la v1 fausse. Ici
   * chaque agrégat porte sa propre borne, donc un plat commandé le 4 et
   * servi le 5 compte dans le « à préparer » du 4 ET dans les « servis » du
   * 5. Les deux sont vrais.
   *
   * ⚠️ Le WHERE ne garde qu'un garde-fou LARGE (créées dans une fenêtre
   * élargie) : sans lui, la requête balaierait toute l'historique du bar.
   */
  SELECT
    -- ⭐ SERVIS — sur `served_at` : un service rendu compte le jour du service.
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.status = 'served'
        AND koi.served_at IS NOT NULL
        AND DATE((koi.served_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS served_count,

    -- ⭐⭐ PERDUS — sur `consumed_at` : c'est l'instant où la matière sort
    -- du stock. `status='cancelled'` rend la perte DÉFINITIVE (une ligne
    -- `ready` est un plat EN ATTENTE, pas perdu — sans ce filtre le
    -- cuisinier verrait des pertes fantômes en plein service).
    COALESCE(SUM(koi.quantity) FILTER (
      WHERE koi.consumed_at IS NOT NULL
        AND koi.sale_id IS NULL
        AND koi.status = 'cancelled'
        AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    ), 0) AS loss_count,

    -- ⚠️ EN ATTENTE — état INSTANTANÉ, volontairement NON borné dans le
    -- temps : « des assiettes refroidissent en ce moment » n'a de sens qu'au
    -- présent. Les borner sur une période passée afficherait un signal
    -- d'action périmé, sur lequel personne ne peut plus agir.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status = 'ready'), 0) AS pending_count,

    -- ⚠️ À PRÉPARER — la SEULE que `created_at` décrive correctement : le
    -- travail arrive bien à la commande. État instantané également.
    COALESCE(SUM(koi.quantity) FILTER (WHERE koi.status IN
                       ('pending','accepted','preparing')), 0)          AS todo_count,

    -- ⭐ PRÉPARATION — sur `ready_at` : la durée est acquise quand le plat
    -- est prêt. ⚠️ Jamais `served_at`, qui dépend de la disponibilité du
    -- SERVEUR : l'inclure mesurerait la salle, pas la cuisine.
    ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
      WHERE koi.ready_at IS NOT NULL
        AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                 - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
    )::NUMERIC, 1) AS avg_prep_min
  INTO v_totals
  FROM public.kitchen_order_items koi
  WHERE koi.bar_id = p_bar_id
    -- ⚠️ GARDE-FOU, pas le filtre de période (qui est dans les FILTER).
    --
    -- ⛔ NE PAS remplacer par une marge en jours sur `created_at` seul (« -2
    -- jours »). Un plat resté ouvert plus longtemps que la marge choisie
    -- disparaîtrait SILENCIEUSEMENT des compteurs — un chiffre magique qui
    -- devient faux sans prévenir. Les écarts observés en terrain vont déjà
    -- jusqu'à 14 h (commandé le 4 à 19h40, servi le 5 à 9h14).
    --
    -- ⭐ On garde donc une ligne dès QU'UN de ses événements peut tomber dans
    -- la fenêtre. La condition reste sargable (comparaisons directes sur les
    -- colonnes indexées) et borne bien la lecture.
    AND (
         (koi.created_at  >= (v_start - 1)::TIMESTAMPTZ
      AND koi.created_at  <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.served_at   >= (v_start - 1)::TIMESTAMPTZ
      AND koi.served_at   <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
      AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
      OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
      AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      -- ⚠️ `ready` et les états en cours n'ont pas de borne : ce sont des
      -- états INSTANTANÉS (pending_count / todo_count), toujours comptés au
      -- présent quelle que soit leur ancienneté.
      OR koi.status IN ('pending','accepted','preparing','ready')
    );

  -- ═══════════════════════════════════════════════════════════════
  -- DÉTAIL PAR PLAT — mêmes bornes que les agrégats globaux
  -- ═══════════════════════════════════════════════════════════════
  SELECT COALESCE(
           jsonb_agg(row_to_json(t)::JSONB
                     ORDER BY t.loss_count DESC, t.served_count DESC),
           '[]'::JSONB)
  INTO v_dishes
  FROM (
    SELECT
      d.id                                                  AS dish_id,
      d.name                                                AS dish_name,
      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.status = 'served'
          AND koi.served_at IS NOT NULL
          AND DATE((koi.served_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                 AS served_count,
      COALESCE(SUM(koi.quantity) FILTER (
        WHERE koi.consumed_at IS NOT NULL
          AND koi.sale_id IS NULL
          AND koi.status = 'cancelled'
          AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      ), 0)                                                 AS loss_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60) FILTER (
        WHERE koi.ready_at IS NOT NULL
          AND DATE((koi.ready_at AT TIME ZONE 'Africa/Porto-Novo')
                   - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
      )::NUMERIC, 1)                                        AS avg_prep_min
    FROM public.kitchen_order_items koi
    JOIN public.dishes d ON d.id = koi.dish_id
    WHERE koi.bar_id = p_bar_id
      -- ⚠️ MÊME garde-fou que l'agrégat global : borner sur `created_at`
      -- seul exclurait un plat servi dans la fenêtre mais commandé avant.
      -- ⭐ Pas de clause sur les états en cours ici : le HAVING ci-dessous
      -- ne retient que les plats ayant servi ou perdu, donc un plat
      -- seulement « en cours » serait écarté de toute façon.
      AND (
           (koi.served_at   >= (v_start - 1)::TIMESTAMPTZ
        AND koi.served_at   <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.consumed_at >= (v_start - 1)::TIMESTAMPTZ
        AND koi.consumed_at <  (v_end + 2)::TIMESTAMPTZ)
        OR (koi.ready_at    >= (v_start - 1)::TIMESTAMPTZ
        AND koi.ready_at    <  (v_end + 2)::TIMESTAMPTZ)
      )
    GROUP BY d.id, d.name
    -- ⚠️ Les plats dont AUCUN événement ne tombe dans la période sont
    -- écartés : sinon la liste afficherait des plats à « 0 servi, 0 perdu »
    -- ramassés par le garde-fou large du WHERE.
    HAVING COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.status = 'served' AND koi.served_at IS NOT NULL
               AND DATE((koi.served_at AT TIME ZONE 'Africa/Porto-Novo')
                        - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
           ), 0) > 0
        OR COALESCE(SUM(koi.quantity) FILTER (
             WHERE koi.consumed_at IS NOT NULL AND koi.sale_id IS NULL
               AND koi.status = 'cancelled'
               AND DATE((koi.consumed_at AT TIME ZONE 'Africa/Porto-Novo')
                        - (v_close || ' hours')::INTERVAL) BETWEEN v_start AND v_end
           ), 0) > 0
  ) t;

  RETURN jsonb_build_object(
    'success',       true,
    'start_date',    v_start,
    'end_date',      v_end,
    'served_count',  COALESCE(v_totals.served_count, 0),
    'loss_count',    COALESCE(v_totals.loss_count, 0),
    'pending_count', COALESCE(v_totals.pending_count, 0),
    'todo_count',    COALESCE(v_totals.todo_count, 0),
    -- ⚠️ PAS de COALESCE : `null` signifie « aucun plat prêt sur la
    -- période ». L'UI affiche « — », JAMAIS « 0 min » qui se lirait comme
    -- une cuisson instantanée.
    'avg_prep_min',  v_totals.avg_prep_min,
    'dishes',        COALESCE(v_dishes, '[]'::JSONB)
  );
END;
$$;

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS sur ce projet : les re-poser est
-- OBLIGATOIRE, sinon l'écran tombe en « permission denied » pour tous.
REVOKE ALL ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) TO service_role;

COMMENT ON FUNCTION public.get_kitchen_production(UUID, DATE, DATE) IS
  'Activité de production cuisine (quantités et durées), 30 jours par défaut. '
  'Chaque compteur est borné sur SA date d''événement (servis→served_at, '
  'perdus→consumed_at, préparation→ready_at), en journée commerciale du bar. '
  'Destinée au rôle cuisinier : ne renvoie AUCUN montant.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — fonction remplacée, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔ BLOQUANT — GRANTS re-posés (CREATE OR REPLACE les perd) :
--
--    SELECT has_function_privilege('anon',
--             'public.get_kitchen_production(UUID,DATE,DATE)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.get_kitchen_production(UUID,DATE,DATE)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — TOUJOURS AUCUN MONTANT. Le contrôle qui justifie
--    l'existence de cette RPC, à revérifier après CHAQUE modification :
--
--    SELECT pg_get_functiondef(p.oid) ~* '(unit_price|computed_cost|revenue|margin|loss_cost)'
--             AS contient_des_montants
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='get_kitchen_production';
--    -- ATTENDU : false
--    -- ⛔ Si true : NE PAS DÉPLOYER — un montant fuirait vers le cuisinier.
--
-- 4) ⛔ BLOQUANT — LE DÉFAUT CORRIGÉ EST BIEN CORRIGÉ. Sur PRESTIGE BAR 2,
--    le plat servi le 05/08 doit compter le 5, et NON le 4 :
--
--    SELECT DATE((served_at AT TIME ZONE 'Africa/Porto-Novo')
--                - (COALESCE((SELECT closing_hour FROM bars WHERE id=bar_id),6)
--                   || ' hours')::INTERVAL) AS journee_de_service,
--           DATE((created_at AT TIME ZONE 'Africa/Porto-Novo')
--                - (COALESCE((SELECT closing_hour FROM bars WHERE id=bar_id),6)
--                   || ' hours')::INTERVAL) AS journee_de_commande,
--           quantity, status
--    FROM public.kitchen_order_items
--    WHERE bar_id = 'f85ebaf5-502c-4dc9-b4ba-7e511c42e2dc'
--      AND served_at IS NOT NULL
--    ORDER BY served_at DESC LIMIT 5;
--    -- ATTENDU : au moins une ligne où les deux journées DIFFÈRENT — c'est
--    -- exactement celle que la v1 rangeait dans le mauvais jour.
--
-- 5) ⚠️ FONCTIONNEL — via l'application, connecté en cuisinier (auth.uid()
--    vaut NULL dans le SQL Editor, donc is_bar_member() y est toujours faux
--    et la RPC répond « Accès refusé » : c'est le comportement ATTENDU).
--    -- Sur PRESTIGE BAR 2, fenêtre « Aujourd'hui » du 05/08 : « Servis »
--    -- doit valoir 1, et non 0 comme avant la correction.
