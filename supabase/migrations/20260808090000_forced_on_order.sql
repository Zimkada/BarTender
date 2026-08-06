-- ===================================================================
-- MIGRATION: forced_on_order — préparer CETTE assiette à la commande
-- DATE: 2026-08-08
-- AUTHOR: AI Assistant
-- PHASE: 3C.1 du module restauration (§16.9)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- ⛔ RÉPARE UNE PROMESSE NON TENUE. Le refus de `accept_kitchen_item` dit
--   « Produisez un lot, ou préparez ce plat à la commande » — mais RIEN ne
--   permettait de faire la seconde chose. C'était le seul endroit du module
--   où l'interface promettait une action inexistante.

-- ⭐⭐ LA BASCULE PORTE SUR LA LIGNE, PAS SUR LE PLAT — arbitrage 07/08/2026.
--
--   L'option « basculer `dishes.production_mode` en `on_order` » a été
--   ÉCARTÉE, et pas par prudence : elle est techniquement instable.
--   `derive_dish_production_mode` recalcule le régime depuis les composants ;
--   la bascule aurait donc été SILENCIEUSEMENT ANNULÉE à la première
--   modification de recette ou de composition. Un état qui se défait sans
--   que personne ne le voie est pire qu'un état absent.
--
--   ⭐ Trois conséquences favorables du choix retenu :
--     · le plat n'est pas modifié — rien ne peut annuler la décision ;
--     · le coût reste EXACT (recette entière), pas une estimation ;
--     · c'est TRAÇABLE ligne par ligne — on saura combien de fois la cuisine
--       a dû compenser un lot manquant, et sur quels plats.

-- ⚠️ CE N'EST PAS UNE DETTE. La dette de lot a été retirée le 07/08 : un lot
--   manquant a une ALTERNATIVE (cuisiner à la commande), contrairement à un
--   ingrédient manquant. Cette colonne EST cette alternative — elle la rend
--   exécutable au lieu de la suggérer.

-- ⭐ QUI DÉCIDE : `canUpdateKitchenOrderStatus` — cuisinier, gérant,
--   promoteur. PAS le serveur : il ne connaît ni le stock d'ingrédients bruts
--   ni la charge de travail en cuisine. Le §16.9 est explicite — « la même
--   raison qui interdit de bloquer sur le stock interdit de décider à la
--   place du cuisinier ».

-- BREAKING_CHANGE: NO
--   Colonne AJOUTÉE avec DEFAULT FALSE. Toutes les lignes existantes gardent
--   exactement le comportement actuel : `mark_kitchen_item_ready` ne change
--   de branche que si le drapeau est explicitement posé.

-- ROLLBACK_STRATEGY:
--   ALTER TABLE public.kitchen_order_items DROP COLUMN IF EXISTS forced_on_order;
--   + réappliquer mark_kitchen_item_ready depuis 20260807180000.
--   ⚠️ Les lignes déjà servies gardent leur `computed_cost` — il est figé.

-- TABLES_MODIFIED: kitchen_order_items (1 colonne)
-- FUNCTIONS_CREATED: force_item_on_order
-- FUNCTIONS_MODIFIED: mark_kitchen_item_ready, accept_kitchen_item
-- RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor Supabase          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la colonne ne doit PAS préexister :
--
--    SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='kitchen_order_items'
--      AND column_name='forced_on_order';
--    -- ATTENDU : 0
--
-- 2) ⛔ BLOQUANT — les deux RPC de 3B sont en place (on les remplace) :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND p.proname IN ('mark_kitchen_item_ready','accept_kitchen_item')
--    ORDER BY p.proname;
--    -- ATTENDU : 2 lignes
--
-- 3) ⛔ PHOTO DES RÉGIMES — le post-vol la compare :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- NOTER LE RÉSULTAT.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_kitchen_item_ready'
  ) THEN
    RAISE EXCEPTION 'mark_kitchen_item_ready absente — appliquer d''abord 20260807180000';
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. LA COLONNE                                                    │
-- └─────────────────────────────────────────────────────────────────┘

ALTER TABLE public.kitchen_order_items
  ADD COLUMN IF NOT EXISTS forced_on_order BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.kitchen_order_items.forced_on_order IS
  '§16.9 — cette assiette est cuisinée ENTIÈREMENT à la commande, quel que soit le régime du '
  'plat. Posée quand un lot manque : le plat garde son régime, seule CETTE ligne change. '
  '⭐ Une bascule sur dishes.production_mode aurait été annulée par '
  'derive_dish_production_mode à la première modification de recette. '
  '⚠️ Le coût reste EXACT : la recette entière est consommée, aucune estimation.';

-- ⭐ Index PARTIEL : le cas est rare par nature (un lot manquant est une
-- anomalie). Indexer toutes les lignes serait du volume mort.
CREATE INDEX IF NOT EXISTS idx_koi_forced_on_order
  ON public.kitchen_order_items (bar_id, created_at)
  WHERE forced_on_order = TRUE;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. force_item_on_order — poser le drapeau                        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.force_item_on_order(
  p_bar_id  UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  RECORD;
  v_mode  TEXT;
  v_name  TEXT;
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

  /**
   * ⛔⛔ APRÈS `ready`, C'EST TROP TARD. La matière est SORTIE et le coût est
   * FIGÉ dans `computed_cost` : basculer maintenant ne changerait pas ce qui
   * a été consommé, mais ferait mentir la ligne sur son propre mode de
   * production.
   * ⚠️ Liste BLANCHE, comme les autres transitions du module : un statut
   * ajouté plus tard est refusé par défaut.
   */
  IF v_item.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Impossible depuis le statut « %s » : la préparation a déjà commencé.',
        v_item.status
      )
    );
  END IF;

  -- ⭐ IDEMPOTENCE — un double-clic ne doit pas produire d'erreur. On retourne
  -- l'état déjà atteint, ce qui est le résultat demandé.
  IF v_item.forced_on_order THEN
    RETURN jsonb_build_object(
      'success', true,
      'item_id', p_item_id,
      'forced_on_order', true,
      'already_forced', true
    );
  END IF;

  SELECT production_mode, name INTO v_mode, v_name
  FROM public.dishes
  WHERE id = v_item.dish_id AND bar_id = p_bar_id;

  /**
   * ⚠️ REFUSÉ sur un plat qui ne prélève AUCUN lot. Pour lui, « préparer à la
   * commande » est déjà ce qui se passe — accepter donnerait un drapeau sans
   * effet, et une trace trompeuse dans l'historique (« on a dû compenser un
   * lot manquant » alors qu'aucun lot n'était en jeu).
   */
  IF COALESCE(v_mode, 'on_order') <> 'batch_finish' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        '« %s » est déjà préparé à la commande — il ne prélève aucun lot.',
        COALESCE(v_name, 'Ce plat')
      )
    );
  END IF;

  UPDATE public.kitchen_order_items
  SET forced_on_order = TRUE
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'dish_name', v_name,
    'forced_on_order', true,
    'already_forced', false
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ⚠️ `canUpdateKitchenOrderStatus` n'est pas exprimable en SQL : le RPC
-- accorde à `authenticated`, et c'est le CLIENT qui filtre par permission —
-- même modèle que les autres transitions du module (§6.1).
-- ⭐ Le garde SQL qui compte est ailleurs : `is_bar_member` (isolation) et la
-- liste blanche de statuts. Un serveur qui appellerait ce RPC directement
-- basculerait une ligne de SON bar, sans effet de bord sur le coût — le
-- risque est nul comparé à l'accessibilité en service.
REVOKE ALL ON FUNCTION public.force_item_on_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_item_on_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_item_on_order(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.force_item_on_order(UUID, UUID) IS
  '§16.9 — bascule CETTE ligne en préparation à la commande quand un lot manque. '
  '⭐ Le plat n''est PAS modifié : une bascule sur production_mode serait annulée par '
  'derive_dish_production_mode à la première modification de recette. '
  '⚠️ Refusée après `preparing` : la matière est sortie, le coût est figé. '
  '⚠️ Refusée sur un plat non batch_finish : le drapeau serait sans effet et laisserait une '
  'trace trompeuse dans l''historique.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. accept_kitchen_item — laisser passer une ligne basculée        │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ SEULE la condition du bloc de vérification change : une ligne
-- `forced_on_order` ne prélève aucun lot, donc le contrôle de disponibilité
-- n'a pas lieu d'être. Tout le reste est repris à l'identique de
-- 20260807200000.

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

  SELECT * INTO v_item
  FROM public.kitchen_order_items
  WHERE id = p_item_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable dans ce bar');
  END IF;

  IF v_item.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transition impossible depuis le statut « %s »', v_item.status)
    );
  END IF;

  SELECT production_mode INTO v_mode
  FROM public.dishes
  WHERE id = v_item.dish_id AND bar_id = p_bar_id;

  /**
   * ⭐ `NOT v_item.forced_on_order` AJOUTÉ — 3C.1.
   * Une ligne basculée cuisine sa recette entière et ne touche à aucun lot :
   * vérifier leur disponibilité la bloquerait pour une raison qui ne la
   * concerne plus. C'est précisément la sortie que la bascule doit offrir.
   *
   * ⛔ Le reste du garde est INCHANGÉ : le contrôle ne s'applique qu'aux
   * plats `batch_finish`. Appliqué à tous, il bloquerait les `on_order`, qui
   * n'ont aucun lot par définition — plus aucune préparation ne démarrerait.
   */
  IF NOT v_item.forced_on_order
     AND COALESCE(v_mode, 'on_order') = 'batch_finish' THEN
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

REVOKE ALL ON FUNCTION public.accept_kitchen_item(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO service_role;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. mark_kitchen_item_ready — cuisiner la recette entière          │
-- └─────────────────────────────────────────────────────────────────┘
-- ⚠️ DEUX conditions changent, tout le reste est repris à l'identique de
-- 20260807180000 : le filtre de stage, et le déclenchement du prélèvement.

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
  -- Le double-clic d'un cuisinier pressé est le cas NOMINAL, pas l'exception.
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

  SELECT production_mode INTO v_mode
  FROM public.dishes
  WHERE id = v_item.dish_id AND bar_id = p_bar_id;

  v_mode := COALESCE(v_mode, 'on_order');

  /**
   * ⛔⛔ LE FILTRE EST CONDITIONNÉ, JAMAIS GLOBAL.
   *
   * `consumed_at_stage` a pour DÉFAUT `'batch'` : tous les plats existants ont
   * leurs ingrédients à cette valeur. Un `WHERE consumed_at_stage = 'finish'`
   * appliqué sans condition ferait cesser la consommation de stock sur TOUS
   * les plats en production — sans erreur, sans test rouge, invisible jusqu'à
   * l'inventaire.
   *
   * ⭐ `forced_on_order` AJOUTÉ — 3C.1 : une ligne basculée consomme la
   * recette ENTIÈRE, exactement comme un plat `on_order`. C'est ce qui rend
   * son coût EXACT plutôt qu'estimé.
   */
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ingredient_id', di.ingredient_id,
           'qty', ROUND((di.quantity / di.yield_factor) * v_item.quantity, 3)
         )), '[]'::JSONB)
  INTO v_ing_items
  FROM public.dish_ingredients di
  WHERE di.dish_id = v_item.dish_id
    AND di.bar_id = p_bar_id
    AND (v_item.forced_on_order
         OR v_mode <> 'batch_finish'
         OR di.consumed_at_stage = 'finish');

  IF jsonb_array_length(v_ing_items) > 0 THEN
    v_consume := public.consume_ingredients_fefo(
      p_bar_id,
      v_ing_items,
      p_item_id::TEXT,
      'kitchen_order_item',
      v_bdate
    );

    /**
     * ⛔⛔ ANNULATION EXPLICITE. `consume_ingredients_fefo` attrape ses
     * propres erreurs et retourne `success: false` SANS LEVER — un simple
     * `RETURN` validerait ce qui précède. Il n'y a pas de ROLLBACK dans une
     * fonction PL/pgSQL : RAISE + EXCEPTION est le seul moyen d'annuler.
     */
    IF NOT COALESCE((v_consume->>'success')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'FEFO_FAILED:%:%',
        COALESCE(v_consume->>'invariant_violation', 'false'),
        COALESCE(v_consume->>'error', 'Échec de la consommation des ingrédients')
        USING ERRCODE = 'raise_exception';
    END IF;

    v_cost := COALESCE((v_consume->>'total_cost')::NUMERIC, 0);
  ELSE
    -- ⭐ Plat SANS recette : coût 0, et c'est correct (§13.12).
    v_cost := 0;
  END IF;

  /**
   * ⭐ PRÉLÈVEMENT DES LOTS — `batch_finish` NON BASCULÉ uniquement.
   * ⚠️ `NOT forced_on_order` AJOUTÉ : une ligne basculée a déjà consommé sa
   * recette entière ci-dessus. Y prélever en plus double-compterait la
   * matière — le plat coûterait deux fois ce qu'il a réellement coûté.
   */
  IF NOT v_item.forced_on_order AND v_mode = 'batch_finish' THEN
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

        -- ⭐ `depleted` posé AUTOMATIQUEMENT à 0 : le seul statut qui constate
        -- un fait plutôt qu'un jugement (§13.3).
        UPDATE public.production_batches
        SET remaining_qty = remaining_qty - v_take,
            status = CASE WHEN remaining_qty - v_take <= 0 THEN 'depleted' ELSE status END
        WHERE id = v_lot.id;

        v_batch_cost := v_batch_cost + (v_take * v_lot.unit_cost);
        v_needed := v_needed - v_take;
      END LOOP;

      /**
       * ⛔⛔ LOT INSUFFISANT ⟹ REFUS, PAS de dette.
       * Un lot manquant a une ALTERNATIVE réelle — cuisiner à la commande,
       * ce que `forced_on_order` permet désormais d'exécuter. Une dette n'a
       * de sens que sans alternative.
       * ⚠️ DERNIER FILET : `accept_kitchen_item` a déjà vérifié au démarrage.
       * Arriver ici signifie qu'une commande concurrente a vidé le lot.
       */
      IF v_needed > 0 THEN
        RAISE EXCEPTION 'BATCH_EMPTY:%:%',
          v_needed,
          COALESCE((SELECT name FROM public.dishes WHERE id = v_component.base_dish_id),
                   'plat de base')
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    v_cost := v_cost + v_batch_cost;
  END IF;

  UPDATE public.kitchen_order_items
  SET status        = 'ready',
      ready_by      = v_actor,
      ready_at      = NOW(),
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
    'idempotent_replay', false
  );

EXCEPTION
  WHEN raise_exception THEN
    /**
     * ⭐ LOT ÉPUISÉ — message qui NOMME l'alternative.
     * Format : BATCH_EMPTY:<portions manquantes>:<nom du plat-base>
     */
    IF SQLERRM LIKE 'BATCH_EMPTY:%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Lot de %s épuisé (%s portion(s) manquante(s)). Produisez un lot, ou passez ce plat en préparation à la commande.',
          substring(SQLERRM FROM position(':' IN substring(SQLERRM FROM 13)) + 13),
          split_part(SQLERRM, ':', 2)
        ),
        'batch_empty', true
      );
    END IF;

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

-- ⚠️ CREATE OR REPLACE PERD LES GRANTS : sans eux, la cuisine s'arrête.
REVOKE ALL ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor Supabase         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — la colonne existe, avec le bon défaut :
--
--    SELECT column_name, data_type, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='kitchen_order_items'
--      AND column_name='forced_on_order';
--    -- ATTENDU : boolean | false | NO
--    -- ⛔ Un défaut à `true` basculerait TOUTES les lignes.
--
-- 2) ⛔⛔ BLOQUANT — GRANTS re-posés sur les DEUX RPC en service :
--
--    SELECT has_function_privilege('authenticated',
--             'public.mark_kitchen_item_ready(UUID,UUID,DATE)','EXECUTE') AS ready_ok,
--           has_function_privilege('authenticated',
--             'public.accept_kitchen_item(UUID,UUID)','EXECUTE')          AS accept_ok,
--           has_function_privilege('authenticated',
--             'public.force_item_on_order(UUID,UUID)','EXECUTE')          AS force_ok,
--           has_function_privilege('anon',
--             'public.force_item_on_order(UUID,UUID)','EXECUTE')          AS anon_ko;
--    -- ATTENDU : true | true | true | false
--
-- 3) ⛔⛔⛔ BLOQUANT — LE FILTRE DE STAGE RESTE CONDITIONNÉ. Appliqué
--    globalement, tous les plats on_order cesseraient de décrémenter :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'v_mode <> ''batch_finish''' AS filtre_conditionne
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--    -- ATTENDU : true
--
-- 4) ⛔⛔ BLOQUANT — PAS DE DOUBLE COMPTAGE. Une ligne basculée consomme sa
--    recette entière ; y prélever un lot EN PLUS ferait coûter le plat deux
--    fois :
--
--    SELECT pg_get_functiondef(p.oid) ~ 'NOT v_item\.forced_on_order AND v_mode'
--             AS pas_de_double_comptage
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--    -- ATTENDU : true
--
-- 5) ⛔ BLOQUANT — les régimes n'ont pas bougé (comparer au pré-vol n°3) :
--
--    SELECT production_mode, count(*)
--    FROM public.dishes WHERE is_active
--    GROUP BY production_mode ORDER BY production_mode;
--    -- ATTENDU : IDENTIQUE au pré-vol.
--
-- 6) ⚠️ FONCTIONNEL — via l'application :
--    -- a) ⭐ NON-RÉGRESSION D'ABORD : un plat `on_order` démarre et passe en
--    --    prêt en consommant TOUS ses ingrédients ;
--    -- b) plat `batch_finish` AVEC lot → prélève normalement ;
--    -- c) plat `batch_finish` SANS lot → refus, puis bascule → passe, et
--    --    consomme la recette ENTIÈRE (les 'batch' baissent aussi) ;
--    -- d) le lot n'a PAS bougé sur une ligne basculée ;
--    -- e) basculer une ligne déjà `preparing` → refusée.
