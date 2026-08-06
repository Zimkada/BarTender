-- ===================================================================
-- MIGRATION: mark_kitchen_item_ready — prélèvement de lot (batch_finish)
-- DATE: 2026-08-07
-- AUTHOR: AI Assistant
-- PHASE: 3B.2 du module restauration (§16.8, §12.4.d)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- Dernière pièce du régime `batch_finish` : au passage à `ready`, un plat
-- composé doit PRÉLEVER dans le lot de son plat-base, en plus de consommer
-- ses ingrédients de finition.
--
--   spaghetti-poulet à `ready` ⟹  1 portion du lot « spaghetti cuits »
--                              +  huile, sauce, oignon (`'finish'`)

-- ⛔⛔⛔ LE RISQUE PRINCIPAL DE CETTE MIGRATION
--   Cette RPC est EN SERVICE et DÉPLACE DU STOCK RÉEL. Le piège identifié au
--   cadrage du 06/08/2026 :
--
--     `consumed_at_stage` a pour DÉFAUT `'batch'` (migration 20260803100000).
--     Tous les plats existants ont donc leurs ingrédients en `'batch'`.
--     ⟹ Un filtre `WHERE consumed_at_stage = 'finish'` appliqué SANS
--        CONDITION ferait cesser la consommation de stock sur TOUS les plats
--        en production. Sans erreur. Sans test rouge. Invisible jusqu'à
--        l'inventaire.
--
--   ⭐ LA RÈGLE EST DONC CONDITIONNÉE AU RÉGIME DU PLAT :
--     · `on_order` / `batch` → TOUS les ingrédients — INCHANGÉ, à l'identique
--     · `batch_finish`       → les `'finish'` seulement + prélèvement du lot
--
--   ⚠️ Et `batch_finish` n'est atteignable que si le plat a des composants
--   (`dish_recipe_components`), table créée le 07/08 et VIDE en production.
--   Aucun plat existant ne peut donc emprunter la nouvelle branche.

-- ⭐ PRÉLÈVEMENT MULTI-LOTS, dans l'ordre de production (FIFO)
--   Commander 5 spaghetti quand le lot courant n'en a que 2 en prend 2 dans
--   celui-ci et 3 dans le suivant. Le coût de la ligne est la SOMME des
--   prélèvements, chacun au coût de SON lot.
--   ⚠️ FIFO sur `produced_at` et non FEFO : un lot de production n'a pas
--   toujours de date de péremption, et le plus ancien doit partir en premier.

-- ⭐ LOT INSUFFISANT ⟹ DETTE, jamais refus (§4.4, comme les ingrédients)
--   Refuser bloquerait le service pour une saisie de production oubliée. On
--   sert, on trace l'écart en `remaining_qty` non couvert, et le coût est
--   estimé au dernier `unit_cost` connu.
--   ⚠️ La DÉCISION en amont (produire / passer en on_order / indisponible)
--   est un choix HUMAIN pris quand le lot atteint zéro — pas ici, où le plat
--   est déjà cuisiné.

-- BREAKING_CHANGE: NO pour les plats existants (voir ci-dessus).

-- ROLLBACK_STRATEGY:
--   Réappliquer le corps de mark_kitchen_item_ready depuis 20260804130000.
--   ⚠️ Les prélèvements déjà enregistrés RESTENT : la matière est sortie.

-- FUNCTIONS_MODIFIED: mark_kitchen_item_ready
-- TABLES_MODIFIED: production_batches (UPDATE remaining_qty),
--   kitchen_item_batch_consumptions (INSERT)
-- RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la fonction existe (on la remplace) :
--
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--    -- ATTENDU : 1
--
-- 2) ⛔ BLOQUANT — dépendances de 3B :
--
--    SELECT to_regclass('public.production_batches') AS t_batches,
--           to_regclass('public.kitchen_item_batch_consumptions') AS t_kibc,
--           to_regclass('public.dish_recipe_components') AS t_drc;
--    -- ATTENDU : les 3 non NULL
--
-- 3) ⛔⛔ BLOQUANT — AUCUN PLAT EN PRODUCTION NE DOIT ÊTRE `batch_finish`.
--    C'est ce qui garantit que la nouvelle branche ne change rien pour
--    l'existant :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- NOTER LE RÉSULTAT — le post-vol le compare.
--    -- ⚠️ Si des plats sont DÉJÀ en `batch_finish`, leur consommation
--    --    CHANGERA : vérifier qu'ils ont bien des composants et un lot.

DO $$
BEGIN
  IF to_regclass('public.kitchen_item_batch_consumptions') IS NULL THEN
    RAISE EXCEPTION 'kitchen_item_batch_consumptions absente — appliquer d''abord 20260807170000';
  END IF;
  IF to_regclass('public.production_batches') IS NULL THEN
    RAISE EXCEPTION 'production_batches absente — appliquer d''abord 20260807140000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_kitchen_item_ready(
  p_bar_id        UUID,
  p_item_id       UUID,
  p_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        RECORD;
  v_actor       UUID := auth.uid();
  v_ing_items   JSONB := '[]'::JSONB;
  v_consume     JSONB;
  v_cost        NUMERIC(14, 2);
  v_bdate       DATE;
  v_mode        TEXT;
  v_batch_cost  NUMERIC(14, 2) := 0;
  v_component   RECORD;
  v_lot         RECORD;
  v_needed      NUMERIC(10,3);
  v_take        NUMERIC(10,3);
  v_last_cost   NUMERIC(12,4);
  v_debt_qty    NUMERIC(10,3);
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT * INTO v_item
  FROM public.kitchen_order_items
  WHERE id = p_item_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable dans ce bar');
  END IF;

  -- ⭐⭐ IDEMPOTENCE — le garde le plus important de cette fonction.
  -- Un second appel ne doit PAS consommer la matière deux fois. Le
  -- double-clic d'un cuisinier pressé est le cas NOMINAL, pas l'exception.
  IF v_item.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'item_id', p_item_id,
      'status', v_item.status,
      'computed_cost', v_item.computed_cost,
      'idempotent_replay', true
    );
  END IF;

  IF v_item.status NOT IN ('pending', 'accepted', 'preparing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transition impossible depuis le statut « %s »', v_item.status)
    );
  END IF;

  v_bdate := COALESCE(
    p_business_date,
    (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
  );

  -- ⭐ Régime du plat — c'est LUI qui décide de la règle de consommation.
  SELECT production_mode INTO v_mode
  FROM public.dishes
  WHERE id = v_item.dish_id AND bar_id = p_bar_id;

  v_mode := COALESCE(v_mode, 'on_order');

  -- ═══════════════════════════════════════════════════════════════
  -- 1. INGRÉDIENTS — la règle dépend du RÉGIME
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⛔⛔ LE FILTRE EST CONDITIONNÉ, JAMAIS GLOBAL.
   *
   * `consumed_at_stage` a pour DÉFAUT `'batch'` : tous les plats existants
   * ont leurs ingrédients à cette valeur. Un `WHERE consumed_at_stage =
   * 'finish'` appliqué sans condition ferait cesser la consommation de stock
   * sur TOUS les plats en production — sans erreur, sans test rouge,
   * invisible jusqu'à l'inventaire.
   *
   * ⭐ `on_order` et `batch` prennent TOUT, exactement comme avant cette
   * migration. Seul `batch_finish` filtre.
   *
   * ⭐ QUANTITÉ BRUTE — quantity / yield_factor, DIVISION.
   * yield_factor 0.8 = 20 % de perte : servir 100 g nets exige de SORTIR
   * 125 g. Multiplier sous-estimerait la consommation.
   * ⚠️ Les ingrédients OPTIONNELS sont INCLUS : s'ils sont dans l'assiette,
   * ils sont sortis du stock. Le coût théorique les exclut pour ne pas
   * surestimer le prix nominal ; la consommation RÉELLE doit tout compter.
   */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ingredient_id', di.ingredient_id,
           'qty', ROUND((di.quantity / di.yield_factor) * v_item.quantity, 3)
         )), '[]'::JSONB)
  INTO v_ing_items
  FROM public.dish_ingredients di
  WHERE di.dish_id = v_item.dish_id
    AND di.bar_id = p_bar_id
    AND (v_mode <> 'batch_finish' OR di.consumed_at_stage = 'finish');

  IF jsonb_array_length(v_ing_items) > 0 THEN
    v_consume := public.consume_ingredients_fefo(
      p_bar_id,
      v_ing_items,
      p_item_id::TEXT,
      'kitchen_order_item',
      v_bdate
    );

    /**
     * ⛔⛔ ANNULATION EXPLICITE — même défaut que celui corrigé sur
     * `produce_batch` à la revue du 07/08/2026, présent ici depuis l'origine.
     *
     * `consume_ingredients_fefo` attrape ses propres erreurs et retourne
     * `success: false` SANS LEVER. Un simple `RETURN` sortirait NORMALEMENT
     * de la fonction et validerait ce qui précède — or à partir de 3B.2, des
     * prélèvements de lot peuvent avoir eu lieu AVANT dans cette même
     * transaction si l'ordre change un jour.
     * ⚠️ Il n'y a pas de ROLLBACK dans une fonction PL/pgSQL : RAISE +
     * EXCEPTION est le seul moyen d'annuler réellement.
     */
    IF NOT COALESCE((v_consume->>'success')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'FEFO_FAILED:%:%',
        COALESCE(v_consume->>'invariant_violation', 'false'),
        COALESCE(v_consume->>'error', 'Échec de la consommation des ingrédients')
        USING ERRCODE = 'raise_exception';
    END IF;

    v_cost := COALESCE((v_consume->>'total_cost')::NUMERIC, 0);
  ELSE
    -- ⭐ Plat SANS recette : coût 0, et c'est correct. Le §13.12 admet qu'un
    -- plat existe avant sa recette — refuser ici bloquerait le service pour
    -- une saisie incomplète, ce qui serait pire.
    v_cost := 0;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. PRÉLÈVEMENT DES LOTS — `batch_finish` UNIQUEMENT
  -- ═══════════════════════════════════════════════════════════════
  /**
   * ⭐ Boucle sur les COMPOSANTS du plat (`dish_recipe_components`), puis sur
   * les lots ACTIFS du plat-base, du plus ancien au plus récent.
   *
   * ⚠️ FIFO sur `produced_at` et non FEFO : un lot de production n'a pas
   * toujours de `expires_at`, et le plus ancien doit partir en premier de
   * toute façon.
   *
   * ⛔ `FOR UPDATE` sur les lots : deux commandes simultanées du même plat
   * prélèveraient sinon les mêmes portions, et `remaining_qty` deviendrait
   * faux. Le verrou les sérialise.
   */
  IF v_mode = 'batch_finish' THEN
    FOR v_component IN
      SELECT drc.base_dish_id, drc.quantity
      FROM public.dish_recipe_components drc
      WHERE drc.dish_id = v_item.dish_id AND drc.bar_id = p_bar_id
    LOOP
      v_needed := ROUND(v_component.quantity * v_item.quantity, 3);

      FOR v_lot IN
        SELECT id, remaining_qty, unit_cost
        FROM public.production_batches
        WHERE bar_id = p_bar_id
          AND dish_id = v_component.base_dish_id
          AND status = 'active'
          AND remaining_qty > 0
        ORDER BY produced_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_needed <= 0;

        v_take := LEAST(v_needed, v_lot.remaining_qty);

        INSERT INTO public.kitchen_item_batch_consumptions (
          bar_id, kitchen_order_item_id, production_batch_id, quantity, unit_cost
        ) VALUES (
          p_bar_id, p_item_id, v_lot.id, v_take, v_lot.unit_cost
        );

        -- ⭐ `depleted` posé AUTOMATIQUEMENT quand le lot atteint 0 : c'est le
        -- seul statut qui ne demande pas de décision humaine (§13.3), il
        -- constate un fait. Les autres (jeté, périmé) sont des jugements.
        UPDATE public.production_batches
        SET remaining_qty = remaining_qty - v_take,
            status = CASE WHEN remaining_qty - v_take <= 0 THEN 'depleted' ELSE status END
        WHERE id = v_lot.id;

        v_batch_cost := v_batch_cost + (v_take * v_lot.unit_cost);
        v_needed := v_needed - v_take;
      END LOOP;

      /**
       * ⭐ LOT INSUFFISANT ⟹ DETTE, jamais refus (§4.4).
       * Refuser ici bloquerait le service pour une production oubliée — et
       * le plat est DÉJÀ cuisiné, il est trop tard pour dire non.
       *
       * ⚠️ Coût ESTIMÉ au dernier `unit_cost` connu de ce plat-base, tous
       * lots confondus. Approximatif et assumé : mieux vaut un coût proche
       * qu'un coût NUL, qui afficherait une marge de 100 %.
       * ⚠️ Si AUCUN lot n'a jamais existé, l'estimation vaut 0 — on ne peut
       * rien inventer. Le compteur de dette, lui, reste juste.
       */
      IF v_needed > 0 THEN
        SELECT unit_cost INTO v_last_cost
        FROM public.production_batches
        WHERE bar_id = p_bar_id AND dish_id = v_component.base_dish_id
        ORDER BY produced_at DESC
        LIMIT 1;

        v_debt_qty := COALESCE(v_debt_qty, 0) + v_needed;
        v_batch_cost := v_batch_cost + (v_needed * COALESCE(v_last_cost, 0));
      END IF;
    END LOOP;

    v_cost := v_cost + v_batch_cost;
  END IF;

  UPDATE public.kitchen_order_items
  SET status        = 'ready',
      ready_by      = v_actor,
      ready_at      = NOW(),
      -- ⭐ Snapshot du coût RÉEL (ingrédients + lots), figé ici et jamais
      -- recalculé (§6).
      computed_cost = v_cost,
      consumed_at   = NOW(),
      accepted_by   = COALESCE(accepted_by, v_actor),
      accepted_at   = COALESCE(accepted_at, NOW())
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'status', 'ready',
    'computed_cost', v_cost,
    -- ⭐ Exposé pour que l'UI puisse prévenir : « servi, mais le lot était
    -- vide » est une information que le cuisinier doit voir.
    'batch_debt_qty', COALESCE(v_debt_qty, 0),
    'idempotent_replay', false
  );

EXCEPTION
  /**
   * ⭐ ÉCHEC DU FEFO — l'annulation a eu lieu, on restitue le message MÉTIER.
   * Format : FEFO_FAILED:<true|false>:<message, qui peut contenir des « : »>
   */
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'FEFO_FAILED:%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', substring(SQLERRM FROM position(':' IN substring(SQLERRM FROM 13)) + 13),
        'invariant_violation', split_part(SQLERRM, ':', 2) = 'true'
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);

  WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Incohérence de données détectée : %s', SQLERRM),
      'invariant_violation', true
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS sur ce projet : les re-poser est
-- OBLIGATOIRE, sinon la cuisine tombe en « permission denied » EN SERVICE.
REVOKE ALL ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) IS
  '⭐⭐ LE moment de la CONSOMMATION de matière (§6). Décrémente les ingrédients en FEFO et FIGE '
  'le coût réel dans computed_cost — jamais recalculé ensuite. '
  '⭐ 3B.2 — en régime batch_finish, PRÉLÈVE en plus dans les lots du plat-base (FIFO, '
  'multi-lots) et n''y consomme que les ingrédients ''finish''. '
  '⛔ Le filtre de stage est CONDITIONNÉ au régime : appliqué globalement, il ferait cesser la '
  'consommation de stock sur tous les plats on_order, dont les ingrédients sont ''batch'' par '
  'défaut. '
  '⚠️ IDEMPOTENT via consumed_at : un double-clic ne consomme pas deux fois.';

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — fonction remplacée, SECURITY DEFINER, search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--    -- ATTENDU : 1 ligne | true | {search_path=public}
--
-- 2) ⛔⛔ BLOQUANT — GRANTS re-posés. Cette RPC est EN SERVICE : sans le
--    grant, la cuisine s'arrête net.
--
--    SELECT has_function_privilege('anon',
--             'public.mark_kitchen_item_ready(UUID,UUID,DATE)','EXECUTE') AS anon_ko,
--           has_function_privilege('authenticated',
--             'public.mark_kitchen_item_ready(UUID,UUID,DATE)','EXECUTE') AS auth_ok;
--    -- ATTENDU : false | true
--
-- 3) ⛔⛔⛔ BLOQUANT — LE FILTRE DE STAGE EST CONDITIONNÉ AU RÉGIME.
--    LE contrôle de cette migration : appliqué globalement, il ferait cesser
--    la consommation de stock sur TOUS les plats existants.
--
--    SELECT pg_get_functiondef(p.oid) ~ 'v_mode <> ''batch_finish'' OR' AS filtre_conditionne
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--    -- ATTENDU : true
--    -- ⛔ Si false : NE PAS LAISSER EN PRODUCTION. Les plats on_order
--    --    cesseraient de décrémenter leur stock, sans aucune erreur visible.
--
-- 4) ⛔ BLOQUANT — les régimes n'ont pas bougé (comparer au pré-vol n°3) :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- ATTENDU : IDENTIQUE au pré-vol.
--
-- 5) ⚠️ FONCTIONNEL — via l'application (auth.uid() vaut NULL dans le SQL
--    Editor : la RPC répond « Accès refusé », comportement ATTENDU) :
--    -- a) ⭐ NON-RÉGRESSION D'ABORD : un plat `on_order` passé à `ready`
--    --    doit décrémenter TOUS ses ingrédients, comme avant. À vérifier
--    --    AVANT de tester quoi que ce soit de nouveau.
--    -- b) un plat `batch_finish` : le lot baisse, les ingrédients 'finish'
--    --    baissent, les 'batch' NE BOUGENT PAS.
--    -- c) commander plus que le lot ne contient : servi quand même,
--    --    `batch_debt_qty` > 0 dans la réponse.
--    -- d) double-clic : `idempotent_replay: true`, aucun second prélèvement.
