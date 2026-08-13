-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: un plat `batch` prélève dans SON lot, jamais dans ses ingrédients
-- ═══════════════════════════════════════════════════════════════════
--
-- ⛔⛔ DOUBLE-COMPTAGE DE LA MATIÈRE - défaut structurel trouvé le 08/08/2026.
--
-- Le §16.8 est explicite : « décrémenter les ingrédients à chaque portion
-- servie DOUBLE-COMPTERAIT la matière déjà consommée le matin. Le service ne
-- touche QUE `remaining_qty`. »
--
-- Or `mark_kitchen_item_ready` ne prélevait dans un lot QUE pour `batch_finish`.
-- Un plat `batch` (riz gras, akassa produit) décomptait donc ses INGRÉDIENTS
-- BRUTS à chaque assiette, alors que le riz cru et le maïs étaient déjà sortis
-- à la production. La même matière était comptée DEUX FOIS.
--
-- ⛔ Pour un lot `purchased` (§19.3) c'est pire encore : on décomptait du maïs
--    JAMAIS UTILISÉ, puisqu'un lot acheté ne consomme aucun ingrédient.
--
-- ⭐⭐ CE QUI DISTINGUE `batch` DE `batch_finish` : OÙ EST LE LOT
--   · `batch_finish` - le plat prélève dans les lots d'AUTRES plats
--     (`dish_recipe_components` : akassa-poisson prend 1 poisson braisé) ;
--   · `batch` - le plat EST son propre lot. Aucun composant : la base est
--     LUI-MÊME, à raison d'une portion par assiette.
-- D'où le `UNION ALL` : une seule boucle, deux origines de base.
--
-- ⭐ LE CIRCUIT NE CHANGE PAS. Un plat `batch` passe par la file cuisine comme
--    les autres - correction du §16.8 validée sur le terrain le 08/08/2026 :
--    la portion est dans le bac EN CUISINE, le serveur ne peut pas se servir, et
--    le cuisinier n'a aucune autre interface. Seul le DÉCOMPTE diffère.
--    ⚠️ C'est aussi la règle de responsabilité : « le cuisinier est le seul qui
--    répond des stocks ingrédients » - un service qui le contournerait lui
--    retirerait la main sur une sortie de matière dont il répond.
--
-- ⭐ LOT VIDE => REFUS AVEC ALTERNATIVE, aligné sur `batch_finish` (§16.9,
--    arbitrage du 07/08). Le repli sur les ingrédients bruts est ÉCARTÉ : il
--    supposerait de recuisiner un bac entier pour une assiette. Un riz gras
--    épuisé est épuisé - le serveur doit pouvoir dire « c'est terminé ».
--    ⚠️ Le contrôle est à `accept` (démarrage), pas à `ready` : le choix humain
--    se prend AVANT de cuisiner, jamais quand l'assiette est déjà prête.
--
-- ⚠️ `forced_on_order` reste la SORTIE : une ligne basculée cuisine sa recette
--    entière et ne touche à aucun lot - vrai pour `batch` comme pour
--    `batch_finish`. Les deux gardes le préservent.
--
-- BREAKING_CHANGE: NO - mêmes signatures, même enveloppe de retour.
--   ⚠️ CHANGEMENT DE COMPORTEMENT pour les plats `batch` UNIQUEMENT :
--     avant -> consommait les ingrédients, ne touchait aucun lot ;
--     après -> prélève le lot, ne touche AUCUN ingrédient.
--   Les plats `on_order` et `batch_finish` sont INCHANGÉS à l'identique.
--
-- ⛔⛔ À APPLIQUER RESTAU FERMÉ. Ces RPC portent la sortie de matière et le CA :
--    une commande en vol pendant le REPLACE verrait un comportement mixte.
--
-- ROLLBACK_STRATEGY:
--   Réappliquer 20260808090000_forced_on_order.sql tel quel : il contient les
--   TROIS fonctions dans leur version précédente.
--
-- FUNCTIONS_CREATED: (aucune - CREATE OR REPLACE de TROIS existantes)
-- TABLES_CREATED: (aucune)
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL - à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les TROIS fonctions à remplacer existent, en UN exemplaire chacune :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('accept_kitchen_item','mark_kitchen_item_ready',
--                      'force_item_on_order');
--   -> 3 lignes exactement :
--     accept_kitchen_item     -> 'p_bar_id uuid, p_item_id uuid'
--     force_item_on_order     -> 'p_bar_id uuid, p_item_id uuid'
--     mark_kitchen_item_ready -> 'p_bar_id uuid, p_item_id uuid, p_business_date date'
--   ⛔ Plus de 3 lignes = surcharge existante : ARRÊTER.
--
-- 2) Tables nécessaires :
-- SELECT to_regclass('public.production_batches')              AS t_batches,
--        to_regclass('public.kitchen_item_batch_consumptions') AS t_kibc,
--        to_regclass('public.dish_recipe_components')          AS t_drc;
--   -> les 3 NON NULL.
--
-- 3) ⚠️ COMBIEN DE PLATS SONT CONCERNÉS ? Ce sont les seuls dont le
--    comportement change :
-- SELECT d.name, d.production_mode,
--        (SELECT COALESCE(SUM(pb.remaining_qty),0)
--           FROM public.production_batches pb
--          WHERE pb.dish_id = d.id AND pb.status='active') AS portions_en_stock
--   FROM public.dishes d
--  WHERE d.bar_id = '<BAR_ID>'::uuid AND d.production_mode = 'batch';
--   -> Noter cette liste : après migration, ces plats décompteront leur LOT.
--   ⚠️ Un plat `batch` avec 0 portion en stock sera REFUSÉ au démarrage tant
--     qu'aucun lot n'est produit. C'est le comportement VOULU - mais il faut le
--     savoir avant d'ouvrir le service.
--
-- 4) ⛔ AUCUNE LIGNE EN VOL (restau fermé) :
-- SELECT status, count(*) FROM public.kitchen_order_items
--  WHERE bar_id = '<BAR_ID>'::uuid
--    AND status IN ('pending','accepted','preparing')
--  GROUP BY status;
--   -> 0 ligne attendue. Sinon : terminer le service avant d'appliquer.

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
     AND COALESCE(v_mode, 'on_order') IN ('batch_finish', 'batch') THEN
    FOR v_component IN
      /**
       * ⭐⭐ DEUX SOURCES DE LOT SELON LE RÉGIME (§16.8, corrigé le 08/08/2026)
       *
       * · `batch_finish` — le plat PRÉLÈVE dans les lots d'AUTRES plats, listés
       *   dans `dish_recipe_components` (akassa-poisson prend 1 poisson braisé) ;
       * · `batch` — le plat EST son propre lot. Il n'a aucun composant : la
       *   base est LUI-MÊME, en `v_item.quantity` portions.
       *
       * ⛔ Sans la seconde branche, un plat `batch` ne vérifiait AUCUN lot et
       *   décomptait ses ingrédients bruts à `ready` — double-comptage de la
       *   matière déjà sortie à la production.
       */
      SELECT drc.base_dish_id, drc.quantity,
             COALESCE((SELECT name FROM public.dishes WHERE id = drc.base_dish_id),
                      'plat de base') AS base_name
      FROM public.dish_recipe_components drc
      WHERE drc.dish_id = v_item.dish_id AND drc.bar_id = p_bar_id
        AND v_mode = 'batch_finish'

      UNION ALL

      /**
       * ⚠️ Le nom est celui du PLAT LUI-MÊME : pour un `batch`, le message de
       * refus doit dire « Aucun lot de Riz gras », pas « de ce plat ». Le repli
       * ne sert que si la ligne a disparu entre-temps - impossible en pratique
       * (`ON DELETE RESTRICT` sur `dish_id`), mais `format()` afficherait
       * « Aucun lot de <NULL> » sans lui.
       */
      SELECT v_item.dish_id, 1::NUMERIC,
             COALESCE((SELECT name FROM public.dishes WHERE id = v_item.dish_id),
                      'ce plat') AS base_name
      WHERE v_mode = 'batch'
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
         OR (v_mode <> 'batch_finish' AND v_mode <> 'batch')
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
  IF NOT v_item.forced_on_order AND v_mode IN ('batch_finish', 'batch') THEN
    FOR v_component IN
      -- ⭐ MÊME UNION que dans `accept_kitchen_item` : `batch_finish` prélève
      -- dans les lots d'AUTRES plats, `batch` dans SON PROPRE lot.
      SELECT drc.base_dish_id, drc.quantity
      FROM public.dish_recipe_components drc
      WHERE drc.dish_id = v_item.dish_id AND drc.bar_id = p_bar_id
        AND v_mode = 'batch_finish'

      UNION ALL

      SELECT v_item.dish_id, 1::NUMERIC
      WHERE v_mode = 'batch'
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
   *
   * ⭐ `batch` AJOUTÉ le 08/08/2026. La condition ne testait que `batch_finish`
   * parce qu'à l'époque lui seul prélevait un lot. Depuis la correction du
   * double-comptage, un plat `batch` prélève AUSSI dans son propre lot : la
   * bascule y a donc un sens réel - cuisiner l'assiette depuis les ingrédients
   * bruts quand le bac est vide.
   *
   * ⛔ SANS CET AJOUT, le refus d'`accept_kitchen_item` proposerait « préparez
   * ce plat à la commande » et cette action ÉCHOUERAIT - une alternative
   * annoncée puis refusée est pire que pas d'alternative du tout.
   */
  IF COALESCE(v_mode, 'on_order') NOT IN ('batch_finish', 'batch') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        '« %s » est déjà préparé à la commande - il ne prélève aucun lot.',
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

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRIVILÈGES                                                       │
-- └─────────────────────────────────────────────────────────────────┘
-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS - leçon des vagues 1-4 du
--    durcissement RPC. Toujours re-REVOKE puis re-GRANT.
REVOKE ALL ON FUNCTION public.accept_kitchen_item(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_kitchen_item(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.force_item_on_order(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_item_on_order(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.force_item_on_order(UUID, UUID) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL - à exécuter APRÈS                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Toujours 2 fonctions, aucune surcharge créée :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('accept_kitchen_item','mark_kitchen_item_ready',
--                      'force_item_on_order');
--   -> 3 lignes, prosecdef = true pour les trois.
--
-- 2) ⛔ LES GRANTS ONT SURVÉCU (le contrôle le plus important) :
-- SELECT has_function_privilege('anon',
--          'public.accept_kitchen_item(uuid,uuid)','EXECUTE') AS anon_accept,
--        has_function_privilege('authenticated',
--          'public.accept_kitchen_item(uuid,uuid)','EXECUTE') AS auth_accept,
--        has_function_privilege('anon',
--          'public.mark_kitchen_item_ready(uuid,uuid,date)','EXECUTE') AS anon_ready,
--        has_function_privilege('authenticated',
--          'public.mark_kitchen_item_ready(uuid,uuid,date)','EXECUTE') AS auth_ready,
--        has_function_privilege('anon',
--          'public.force_item_on_order(uuid,uuid)','EXECUTE') AS anon_force,
--        has_function_privilege('authenticated',
--          'public.force_item_on_order(uuid,uuid)','EXECUTE') AS auth_force;
--   -> anon_* = false, auth_* = true. Sinon rejouer le bloc REVOKE/GRANT.
--
-- 3) ⚠️ LA NOUVELLE RÈGLE EST BIEN EN PLACE (commentaires retirés avant de
--    chercher, sinon faux positif - leçon du post-vol `loss_cost`) :
-- SELECT p.proname,
--        regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'batch_finish.{0,4}, .{0,2}batch' AS gere_batch
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('accept_kitchen_item','mark_kitchen_item_ready');
--   -> gere_batch = true pour les DEUX. Sinon l'ancienne version est en place.
--
-- 4) ⛔⛔ LE FILTRE D'INGRÉDIENTS EXCLUT BIEN `batch` - c'est LA correction du
--    double-comptage. Sans elle, le plat prélèverait le lot ET les ingrédients :
-- SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
--          ~ 'v_mode <> .{0,15}AND v_mode <> ' AS exclut_batch
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='mark_kitchen_item_ready';
--   -> exclut_batch = true. Si false : ARRÊTER, le double-comptage persiste.
--
-- 5) SMOKE TEST - le refus est le résultat ATTENDU (auth.uid() vaut NULL dans
--    le SQL Editor, donc la garde is_bar_member refuse) :
-- SELECT public.accept_kitchen_item(
--   (SELECT id FROM public.bars WHERE name ILIKE '%prestige bar 2%' LIMIT 1),
--   gen_random_uuid());
--   -> {"success": false, "error": "Accès refusé à ce bar"} = garde OK.
--
-- 6) TEST RÉEL DEPUIS L'UI, en trois temps :
--    a. Plat `batch` AVEC lot -> commander, démarrer, marquer Prêt.
--       -> `production_batches.remaining_qty` baisse
--       -> `ingredients.current_stock` NE BOUGE PAS  <- la correction
--       -> une ligne apparaît dans `kitchen_item_batch_consumptions`
--    b. Plat `batch` SANS lot -> le démarrage doit être REFUSÉ, avec le message
--       proposant de préparer à la commande.
--    c. Plat `on_order` -> comportement INCHANGÉ (témoin de non-régression).
