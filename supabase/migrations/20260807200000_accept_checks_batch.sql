-- ===================================================================
-- MIGRATION: accept_kitchen_item — vérifier le lot AVANT de préparer
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.2 du module restauration (§16.8)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐⭐ LE BON MOMENT POUR DÉCIDER, C'EST `preparing` — PAS `ready`.
--   Arbitrage de l'exploitant, 07/08/2026 : « au moment de démarrer la
--   préparation, le cuisinier ou le gérant doit faire un choix, pas au
--   moment de ready ».
--
--   C'est exact, et c'est structurel :
--     · à `preparing` → RIEN n'est engagé. Le cuisinier peut produire un lot,
--       préparer le plat à la commande, ou le déclarer indisponible.
--     · à `ready`     → la matière est DÉJÀ sortie. Refuser à cet instant,
--       c'est refuser après coup — le plat est cuisiné, le mal est fait.
--
--   ⚠️ Le contrôle dans `mark_kitchen_item_ready` reste, mais comme DERNIER
--   FILET : il n'attrape que le cas où le lot s'est vidé entre le démarrage
--   et la fin de la préparation (commande concurrente). C'est ICI que la
--   décision se prend.

-- ⛔ POURQUOI PAS UNE DETTE (correction d'une première version)
--   La v1 de `mark_kitchen_item_ready` créait une dette de portions « comme
--   les ingrédients (§4.4) ». L'analogie était FAUSSE :
--     · un INGRÉDIENT manquant n'a AUCUNE alternative — la matière est déjà
--       dans l'assiette, refuser bloquerait un plat cuisiné ;
--     · un LOT manquant en a une, RÉELLE — cuisiner à la commande. Les
--       ingrédients bruts sont là.
--   Une dette n'a de sens que sans alternative. Et celle-ci donnait un coût
--   ESTIMÉ, sans trace dans `kitchen_item_batch_consumptions` : la somme des
--   prélèvements ne réconciliait pas avec `computed_cost`.

-- ⭐ ON REFUSE EN NOMMANT L'ALTERNATIVE. Un refus sans issue est un
--   cul-de-sac : le message dit quoi faire, pas seulement ce qui bloque.

-- BREAKING_CHANGE: NO pour les plats existants.
--   Le contrôle ne s'applique QU'AUX plats `batch_finish`. Un plat
--   `on_order` ou `batch` accepte exactement comme avant — le corps est
--   repris à l'identique, seul un bloc conditionnel est ajouté.

-- ROLLBACK_STRATEGY:
--   Réappliquer le corps de accept_kitchen_item depuis 20260804130000.
--   ⚠️ Restaure l'acceptation d'un plat dont le lot est vide, qui échouerait
--   ensuite à `ready`.

-- FUNCTIONS_MODIFIED: accept_kitchen_item
-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction existe (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='accept_kitchen_item';
--    -- ATTENDU : 1
--
-- 2) ⛔ BLOQUANT — dépendances de 3B :
--
--    SELECT to_regclass('public.production_batches')     AS t_batches,
--           to_regclass('public.dish_recipe_components') AS t_drc;
--    -- ATTENDU : les 2 non NULL
--
-- 3) ⛔⛔ BLOQUANT — aucun plat en `batch_finish` ne doit exister, sinon son
--    acceptation CHANGE de comportement :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- NOTER LE RÉSULTAT — le post-vol le compare.

DO $$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_kitchen_item'
  ) THEN
    RAISE EXCEPTION 'accept_kitchen_item absente — appliquer d''abord 20260804130000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.accept_kitchen_item(
  p_bar_id  UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item      RECORD;
  v_actor     UUID := auth.uid();
  v_mode      TEXT;
  v_component RECORD;
  v_available NUMERIC(10,3);
  v_needed    NUMERIC(10,3);
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⚠️ FOR UPDATE : deux cuisiniers peuvent toucher la même ligne. Sans
  -- verrou, les deux liraient 'pending' et la seconde écriture écraserait la
  -- première.
  SELECT * INTO v_item
  FROM public.kitchen_order_items
  WHERE id = p_item_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable dans ce bar');
  END IF;

  -- ⭐ Transitions autorisées : pending → preparing.
  -- ⚠️ Liste BLANCHE : tout statut non prévu est refusé, y compris un statut
  -- ajouté plus tard.
  IF v_item.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transition impossible depuis le statut « %s »', v_item.status)
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- ⭐⭐ DISPONIBILITÉ DES LOTS — LE MOMENT DE LA DÉCISION
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⛔ CE BLOC NE S'APPLIQUE QU'AUX PLATS `batch_finish`.
   * Un plat `on_order` ou `batch` n'a pas de composant : la boucle ne tourne
   * pas, et son acceptation est exactement celle d'avant cette migration.
   *
   * ⭐ On VÉRIFIE sans rien consommer. Le prélèvement reste à `ready` (§6) —
   * ici on ne fait que constater qu'il sera possible.
   *
   * ⚠️ AUCUN `FOR UPDATE` sur les lots : ce n'est qu'une lecture
   * informative. Verrouiller ici bloquerait les prélèvements réels pendant
   * toute la préparation, qui dure des minutes.
   * ⚠️ Conséquence assumée : deux acceptations simultanées peuvent toutes
   * deux passer alors qu'un seul lot suffit. C'est pourquoi
   * `mark_kitchen_item_ready` garde son propre contrôle — dernier filet.
   */
  SELECT production_mode INTO v_mode
  FROM public.dishes
  WHERE id = v_item.dish_id AND bar_id = p_bar_id;

  IF COALESCE(v_mode, 'on_order') = 'batch_finish' THEN
    FOR v_component IN
      SELECT drc.base_dish_id, drc.quantity,
             COALESCE((SELECT name FROM public.dishes WHERE id = drc.base_dish_id),
                      'plat de base') AS base_name
      FROM public.dish_recipe_components drc
      WHERE drc.dish_id = v_item.dish_id AND drc.bar_id = p_bar_id
    LOOP
      v_needed := ROUND(v_component.quantity * v_item.quantity, 3);

      SELECT COALESCE(SUM(remaining_qty), 0) INTO v_available
      FROM public.production_batches
      WHERE bar_id = p_bar_id
        AND dish_id = v_component.base_dish_id
        AND status = 'active';

      IF v_available < v_needed THEN
        /**
         * ⭐ LE MESSAGE NOMME L'ALTERNATIVE. Un refus qui dit seulement
         * « impossible » laisse le cuisinier sans issue en plein service.
         * ⚠️ Il distingue « aucun lot » de « lot insuffisant » : les deux
         * appellent le même geste, mais pas la même urgence.
         */
        RETURN jsonb_build_object(
          'success', false,
          'error', CASE
            WHEN v_available = 0 THEN format(
              'Aucun lot de %s. Produisez un lot, ou préparez ce plat à la commande.',
              v_component.base_name
            )
            ELSE format(
              'Lot de %s insuffisant : %s portion(s) disponible(s), %s nécessaire(s). Produisez un lot, ou préparez ce plat à la commande.',
              v_component.base_name, v_available, v_needed
            )
          END,
          -- ⭐ Drapeau exploité par l'UI pour proposer les actions plutôt que
          -- d'afficher une erreur sèche.
          'batch_unavailable', true,
          'base_dish_id', v_component.base_dish_id,
          'base_dish_name', v_component.base_name,
          'available_qty', v_available,
          'needed_qty', v_needed
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.kitchen_order_items
  SET status      = 'preparing',
      accepted_by = COALESCE(accepted_by, v_actor),
      accepted_at = COALESCE(accepted_at, NOW())
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'status', 'preparing');
END;
$$;

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS : sans eux, la cuisine ne peut plus
-- démarrer aucune préparation — arrêt du service.
REVOKE ALL ON FUNCTION public.accept_kitchen_item(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.accept_kitchen_item(UUID, UUID) IS
  'pending → preparing. ⭐ 3B — vérifie la disponibilité des LOTS pour un plat batch_finish '
  'AVANT de démarrer : c''est le moment où rien n''est engagé et où le cuisinier peut encore '
  'choisir (produire un lot, préparer à la commande, déclarer indisponible). '
  '⛔ Refuse plutôt que de créer une dette : contrairement à un ingrédient manquant, un lot '
  'manquant a une ALTERNATIVE réelle. Le message la nomme. '
  '⚠️ Lecture seule sur les lots, sans FOR UPDATE : verrouiller ici bloquerait les '
  'prélèvements pendant toute la préparation. mark_kitchen_item_ready garde son contrôle.';

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — fonction remplacée, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='accept_kitchen_item';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔⛔ BLOQUANT — GRANTS re-posés. Sans eux, PLUS AUCUNE préparation ne
--    peut démarrer : la cuisine s'arrête.
--
--    SELECT has_function_privilege('anon',
--             'public.accept_kitchen_item(UUID,UUID)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.accept_kitchen_item(UUID,UUID)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔ BLOQUANT — LE CONTRÔLE EST CONDITIONNÉ AU RÉGIME. Appliqué à tous,
--    il bloquerait les plats on_order, qui n'ont aucun lot par définition :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'v_mode, ''on_order''\) = ''batch_finish'''
--             AS controle_conditionne
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='accept_kitchen_item';
--    -- ATTENDU : true
--    -- ⛔ Si false : AUCUN plat ne pourrait plus démarrer sa préparation.
--
-- 4) ⛔ BLOQUANT — les régimes n'ont pas bougé (comparer au pré-vol n°3) :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- ATTENDU : IDENTIQUE au pré-vol.
--
-- 5) ⚠️ FONCTIONNEL — via l'application :
--    -- a) ⭐ NON-RÉGRESSION D'ABORD : démarrer un plat `on_order` → passe
--    --    normalement en préparation. À vérifier AVANT toute nouveauté.
--    -- b) plat `batch_finish` SANS lot → refus, message nommant
--    --    l'alternative, `batch_unavailable: true` ;
--    -- c) produire un lot, réessayer → passe en préparation ;
--    -- d) lot insuffisant (2 dispo, 3 demandées) → refus chiffré.
