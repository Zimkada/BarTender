-- ===================================================================
-- MIGRATION: machine d'état cuisine — 4 RPC de transition
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§6, §13.7, §16.4)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Les tables cuisine existent mais rien ne les fait vivre. `authenticated`
--   n'a que SELECT : aucune commande ne peut naître, aucun plat passer de
--   `pending` à `ready`.

-- ⭐⭐ POURQUOI DES RPC ET NON DES UPDATE DIRECTS
--   Chaque transition porte des EFFETS DE BORD indissociables :
--     `ready`  → décrément FEFO + coût figé + horodatage d'idempotence
--     `served` → création d'une VENTE + mise à jour du ticket
--   Un UPDATE direct changerait le statut SANS ces effets : la matière ne
--   serait jamais décomptée, ou une vente n'existerait pas alors que le plat
--   est parti. C'est pourquoi les tables restent en LECTURE SEULE.

-- ⭐ LES TRANSITIONS INTERDITES (§6.1) — refusées ICI, pas seulement dans l'UI
--     pending → served      (on ne sert pas un plat non produit)
--     served → cancelled    (utiliser cancel_sale ; la matière n'est jamais restituée)
--     ready → preparing     (toute transition rétrograde)
--     cancel par le CUISINIER après ready (décision sanitaire = gérant)

-- ⭐⭐ LA MATIÈRE N'EST JAMAIS RESTITUÉE (§6.1)
--   Annuler un plat déjà `ready` laisse `consumed_at` et `computed_cost`
--   renseignés, et `sale_id` à NULL. Cette combinaison EST la définition
--   d'une perte (§8, 4e métrique). La « corriger » en effaçant le coût
--   effacerait la perte elle-même.

-- BREAKING_CHANGE: NO — 4 fonctions NEUVES, aucune existante remplacée.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.accept_kitchen_item(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.mark_kitchen_item_ready(UUID, UUID, DATE);
--   DROP FUNCTION IF EXISTS public.serve_kitchen_item(UUID, UUID, TEXT, TEXT, DATE);
--   DROP FUNCTION IF EXISTS public.cancel_kitchen_item(UUID, UUID, TEXT, TEXT);
--   ⚠️ Après usage, les lignes déjà consommées restent : la matière est partie.

-- FUNCTIONS_CREATED: create_kitchen_order, accept_kitchen_item,
--                    mark_kitchen_item_ready, serve_kitchen_item, cancel_kitchen_item
-- TABLES_MODIFIED: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔ BLOQUANT — aucune de ces fonctions ne doit exister :
--
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN (
--      'create_kitchen_order','accept_kitchen_item','mark_kitchen_item_ready',
--      'serve_kitchen_item','cancel_kitchen_item');
--    -- ATTENDU : 0 ligne.
--
-- 2) Les dépendances existent :
--
--    SELECT to_regclass('public.kitchen_order_items')  AS t_items,
--           to_regclass('public.dishes')               AS t_dishes,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo') AS fn_consume,
--           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname='create_sale_idempotent') AS fn_sale;
--    -- ATTENDU : non NULL | non NULL | 1 | 1
--
-- 3) ⭐ `create_sale_idempotent` accepte-t-elle les plats ?
--
--    SELECT pg_get_functiondef(p.oid) LIKE '%FROM public.dishes%' AS accepte_plats
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--    -- ATTENDU : true.
--    -- ⛔ false : appliquer d'abord 20260804100000, sinon `serve` échouerait
--    --    sur PRICE_ERROR à chaque plat servi.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'create_kitchen_order','accept_kitchen_item','mark_kitchen_item_ready',
      'serve_kitchen_item','cancel_kitchen_item')
  ) THEN
    RAISE EXCEPTION 'Une fonction de la machine d''état existe déjà — CREATE OR REPLACE perdrait les GRANTS.';
  END IF;

  IF to_regclass('public.kitchen_order_items') IS NULL THEN
    RAISE EXCEPTION 'Tables cuisine absentes — appliquer d''abord 20260804120000';
  END IF;

  -- ⚠️ `mark_ready` délègue le décrément à cette fonction. Sans elle, la
  -- matière ne serait jamais décomptée.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='consume_ingredients_fefo'
  ) THEN
    RAISE EXCEPTION 'consume_ingredients_fefo absente — appliquer d''abord 20260802160000';
  END IF;

  -- ⚠️ `serve` délègue la création de vente. Elle DOIT accepter les plats.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_sale_idempotent'
      AND pg_get_functiondef(p.oid) LIKE '%FROM public.dishes%'
  ) THEN
    RAISE EXCEPTION
      'create_sale_idempotent n''accepte pas les plats — appliquer d''abord 20260804100000';
  END IF;
END $$;

-- =====================================================
-- 1. create_kitchen_order — prise de commande
-- =====================================================

CREATE FUNCTION public.create_kitchen_order(
  p_bar_id       UUID,
  p_ticket_id    UUID,
  p_items        JSONB,   -- [{dish_id, quantity, modifiers?}]
  p_service_mode TEXT DEFAULT 'dine_in',
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id  UUID;
  v_item      JSONB;
  v_dish      RECORD;
  v_dish_id   UUID;
  v_qty       INTEGER;
  v_count     INTEGER := 0;
  v_actor     UUID := auth.uid();
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aucun plat dans la commande');
  END IF;

  IF p_service_mode NOT IN ('dine_in', 'takeaway') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Mode de service inconnu : %s', p_service_mode));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tickets WHERE id = p_ticket_id AND bar_id = p_bar_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket introuvable dans ce bar');
  END IF;

  -- ⭐ PASSE 1 — VALIDER AVANT D'ÉCRIRE.
  -- Sans cette séparation, une commande de 5 plats dont le 4e est invalide
  -- laisserait 3 lignes en base et une commande à moitié créée. Le ROLLBACK
  -- protège la base, mais le serveur ne saurait pas ce qui a été pris.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_dish_id := NULLIF(v_item->>'dish_id','')::UUID;
    v_qty     := (v_item->>'quantity')::INTEGER;

    IF v_dish_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ligne de commande sans plat');
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'La quantité doit être strictement positive');
    END IF;

    -- ⭐ ISOLATION par bar + le plat doit être ACTIF et DISPONIBLE.
    -- ⚠️ `is_available` compte ici alors que le price guard l'ignore : couper
    -- un plat sert précisément à empêcher de nouvelles commandes. Le guard,
    -- lui, valide un prix sur une commande déjà prise.
    SELECT id, name, price, is_available INTO v_dish
    FROM public.dishes
    WHERE id = v_dish_id AND bar_id = p_bar_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable dans ce bar');
    END IF;

    IF NOT v_dish.is_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('« %s » n''est plus disponible', v_dish.name)
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ⭐ PASSE 2 — écriture atomique.
  -- ⚠️ Un seul kitchen_order par ticket (index unique) : si le ticket en a
  -- déjà un, on ajoute les lignes au lieu d'en créer un second.
  SELECT id INTO v_order_id
  FROM public.kitchen_orders WHERE ticket_id = p_ticket_id;

  IF NOT FOUND THEN
    INSERT INTO public.kitchen_orders (bar_id, ticket_id, service_mode, notes, created_by)
    VALUES (p_bar_id, p_ticket_id, p_service_mode, p_notes, v_actor)
    RETURNING id INTO v_order_id;
  END IF;

  INSERT INTO public.kitchen_order_items
    (bar_id, kitchen_order_id, dish_id, quantity, unit_price, modifiers)
  SELECT
    p_bar_id,
    v_order_id,
    (l->>'dish_id')::UUID,
    (l->>'quantity')::INTEGER,
    -- ⭐ Prix FIGÉ à la commande : le plat peut être re-tarifé ensuite, la
    -- commande garde le prix annoncé au client.
    d.price,
    CASE WHEN l ? 'modifiers' THEN l->'modifiers' ELSE NULL END
  FROM jsonb_array_elements(p_items) AS l
  -- ⚠️ `d.bar_id = p_bar_id` INDISPENSABLE, même si la passe 1 l'a déjà
  -- vérifié — défaut trouvé à la code review.
  -- Sans lui, les deux passes ne voient PAS la même chose : si un jour la
  -- validation passait d'un RETURN à un CONTINUE, cet INSERT insérerait quand
  -- même le plat d'un AUTRE bar. Fuite inter-bar silencieuse.
  -- ⭐ Le coût de la garde est nul, celui de son absence est une fuite.
  JOIN public.dishes d
    ON d.id = (l->>'dish_id')::UUID
   AND d.bar_id = p_bar_id;

  -- ⭐ §13.7 — `fulfillment_status` piloté par RPC, jamais par le client.
  -- Le ticket a désormais des lignes cuisine : il n'est plus clôturable tant
  -- qu'elles ne sont pas servies.
  UPDATE public.tickets
  SET fulfillment_status = 'pending'
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'success', true,
    'kitchen_order_id', v_order_id,
    'items_created', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) IS
  'Prise de commande cuisine. Valide TOUT avant d''écrire (§13.12) : une commande de 5 plats '
  'dont le 4e est invalide ne doit pas en laisser 3 en base. '
  '⭐ Un seul kitchen_order par ticket : si le ticket en a déjà un, les lignes s''y ajoutent. '
  '⭐ Passe le ticket en fulfillment_status=''pending'' (§13.7) — il n''est plus clôturable.';

-- =====================================================
-- 2. accept_kitchen_item — pending → accepted / preparing
-- =====================================================

CREATE FUNCTION public.accept_kitchen_item(
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
  v_actor UUID := auth.uid();
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
  -- ajouté plus tard. Même motif que le garde de rôle de create_sale.
  IF v_item.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transition impossible depuis le statut « %s »', v_item.status)
    );
  END IF;

  UPDATE public.kitchen_order_items
  SET status      = 'preparing',
      accepted_by = COALESCE(accepted_by, v_actor),
      accepted_at = COALESCE(accepted_at, NOW())
  WHERE id = p_item_id;

  RETURN jsonb_build_object('success', true, 'item_id', p_item_id, 'status', 'preparing');
END;
$$;

COMMENT ON FUNCTION public.accept_kitchen_item(UUID, UUID) IS
  'pending/accepted → preparing. ⭐ Le cuisinier commence le plat. COALESCE sur accepted_at : '
  'un second appel ne réécrit pas l''horodatage — le temps d''attente mesuré resterait juste.';

-- =====================================================
-- 3. mark_kitchen_item_ready — LE moment de la consommation
-- =====================================================

CREATE FUNCTION public.mark_kitchen_item_ready(
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
  v_item      RECORD;
  v_actor     UUID := auth.uid();
  v_ing_items JSONB := '[]'::JSONB;
  v_consume   JSONB;
  v_cost      NUMERIC(14, 2);
  v_bdate     DATE;
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
  -- double-clic d'un cuisinier presséest le cas nominal, pas l'exception.
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

  -- ⭐ QUANTITÉ BRUTE — quantity / yield_factor, DIVISION.
  -- yield_factor 0.8 = 20 % de perte : servir 100 g nets exige de SORTIR
  -- 125 g. Multiplier sous-estimerait la consommation de façon systématique.
  -- ⚠️ × la quantité commandée : 3 poulets braisés consomment 3 fois la recette.
  -- ⚠️ Les ingrédients OPTIONNELS sont INCLUS ici, contrairement au coût
  -- théorique : s'ils sont dans l'assiette, ils sont sortis du stock. Le coût
  -- de référence les exclut pour ne pas surestimer le prix nominal du plat ;
  -- la consommation RÉELLE, elle, doit tout compter.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ingredient_id', di.ingredient_id,
           'qty', ROUND((di.quantity / di.yield_factor) * v_item.quantity, 3)
         )), '[]'::JSONB)
  INTO v_ing_items
  FROM public.dish_ingredients di
  WHERE di.dish_id = v_item.dish_id AND di.bar_id = p_bar_id;

  -- ⭐ DÉLÉGATION à consume_ingredients_fefo — jamais de décrément écrit ici.
  -- Cette fonction porte le FEFO, les dettes (§13.2) et sa propre idempotence.
  -- La réimplémenter ferait diverger deux logiques de consommation.
  -- ⚠️ `reference_key` = l'id de la ligne : c'est ce qui rend le décrément
  -- idempotent CÔTÉ CONSOMMATION, en plus du garde `consumed_at` ci-dessus.
  IF jsonb_array_length(v_ing_items) > 0 THEN
    v_consume := public.consume_ingredients_fefo(
      p_bar_id,
      v_ing_items,
      p_item_id::TEXT,
      'kitchen_order_item',
      v_bdate
    );

    IF NOT COALESCE((v_consume->>'success')::BOOLEAN, FALSE) THEN
      -- ⚠️ Remonter l'erreur telle quelle : elle porte le motif métier
      -- (ingrédient inconnu, invariant cassé). La reformuler la rendrait
      -- indiagnostiquable.
      RETURN jsonb_build_object(
        'success', false,
        'error', COALESCE(v_consume->>'error', 'Échec de la consommation des ingrédients')
      );
    END IF;

    v_cost := COALESCE((v_consume->>'total_cost')::NUMERIC, 0);
  ELSE
    -- ⭐ Plat SANS recette : coût 0, et c'est correct. Le §13.12 admet qu'un
    -- plat existe avant sa recette — refuser ici bloquerait le service pour
    -- une saisie incomplète, ce qui serait pire.
    v_cost := 0;
  END IF;

  UPDATE public.kitchen_order_items
  SET status        = 'ready',
      ready_by      = v_actor,
      ready_at      = NOW(),
      -- ⭐ Snapshot du coût RÉEL, figé ici et jamais recalculé (§6).
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
END;
$$;

COMMENT ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) IS
  '⭐⭐ LE moment de la CONSOMMATION de matière (§6). Décrémente les ingrédients en FEFO et FIGE '
  'le coût réel dans computed_cost — jamais recalculé ensuite. '
  '⚠️ IDEMPOTENT via consumed_at : un double-clic ne consomme pas deux fois. '
  '⭐ Quantité brute = quantity / yield_factor × qté commandée. Les ingrédients OPTIONNELS sont '
  'INCLUS : s''ils sont dans l''assiette, ils sont sortis du stock — contrairement au coût '
  'théorique qui les exclut pour ne pas surestimer le prix nominal.';

-- =====================================================
-- 4. serve_kitchen_item — LA naissance du CA
-- =====================================================

CREATE FUNCTION public.serve_kitchen_item(
  p_bar_id         UUID,
  p_item_id        UUID,
  p_payment_method TEXT DEFAULT 'cash',
  p_idempotency_key TEXT DEFAULT NULL,
  p_business_date  DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    RECORD;
  v_dish    RECORD;
  v_ticket  RECORD;
  v_actor   UUID := auth.uid();
  v_sale    public.sales;
  v_items   JSONB;
  v_key     TEXT;
  v_pending INTEGER;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  SELECT koi.*, ko.ticket_id INTO v_item
  FROM public.kitchen_order_items koi
  JOIN public.kitchen_orders ko ON ko.id = koi.kitchen_order_id
  WHERE koi.id = p_item_id AND koi.bar_id = p_bar_id
  FOR UPDATE OF koi;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable dans ce bar');
  END IF;

  -- ⭐ IDEMPOTENCE : déjà servi, on retourne la vente existante.
  IF v_item.status = 'served' THEN
    RETURN jsonb_build_object(
      'success', true, 'item_id', p_item_id, 'status', 'served',
      'sale_id', v_item.sale_id, 'idempotent_replay', true
    );
  END IF;

  -- ⛔ TRANSITION INTERDITE (§6.1) : on ne sert PAS un plat non produit.
  -- Servir depuis 'pending' créerait un CA sans que la matière ait été
  -- consommée — la marge du plat serait de 100 %.
  IF v_item.status <> 'ready' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Un plat doit être PRÊT avant d''être servi (statut actuel : « %s »)', v_item.status)
    );
  END IF;

  SELECT id, name, price INTO v_dish
  FROM public.dishes WHERE id = v_item.dish_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plat introuvable');
  END IF;

  -- ⭐ FORMAT `sales.items` du 04/08/2026 : un plat porte `item_type` et
  -- `dish_id`, JAMAIS `product_id`. Les gardes de create_sale_idempotent le
  -- reconnaissent et sautent stock et promotions.
  -- ⚠️ `unit_price` vient de la LIGNE (prix figé à la commande), pas de
  -- `dishes.price` qui a pu changer entre-temps.
  v_items := jsonb_build_array(jsonb_build_object(
    'item_type',    'dish',
    'dish_id',      v_item.dish_id,
    'product_name', v_dish.name,
    'quantity',     v_item.quantity,
    'unit_price',   v_item.unit_price,
    'total_price',  v_item.unit_price * v_item.quantity,
    -- ⭐ Coût matière RÉEL, figé à `ready`. Le transporter dans la vente rend
    -- la marge calculable a posteriori sans rejouer le FEFO.
    'computed_cost', v_item.computed_cost
  ));

  -- ⚠️ Clé d'idempotence DÉRIVÉE de l'id de ligne si non fournie : un
  -- double-clic sur « Servir » ne doit pas créer deux ventes. L'appelant peut
  -- fournir la sienne, mais l'absence ne doit pas laisser le champ libre.
  v_key := COALESCE(NULLIF(p_idempotency_key, ''), 'koi-' || p_item_id::TEXT);

  -- ⭐ DÉLÉGATION à create_sale_idempotent : price guard, business_date,
  -- idempotence et journalisation y vivent déjà. Réimplémenter ferait
  -- diverger deux chemins de création de vente.
  v_sale := public.create_sale_idempotent(
    p_bar_id, v_items, p_payment_method, v_actor, v_key,
    NULL, 'validated', NULL, NULL, NULL, p_business_date, v_item.ticket_id, NULL
  );

  UPDATE public.kitchen_order_items
  SET status    = 'served',
      served_by = v_actor,
      served_at = NOW(),
      sale_id   = v_sale.id
  WHERE id = p_item_id;

  -- ⭐ §13.7 — le ticket devient `fulfilled` quand PLUS AUCUNE ligne n'est en
  -- cours. Une ligne annulée compte comme réglée : elle ne reviendra pas.
  SELECT count(*) INTO v_pending
  FROM public.kitchen_order_items koi
  JOIN public.kitchen_orders ko ON ko.id = koi.kitchen_order_id
  WHERE ko.ticket_id = v_item.ticket_id
    AND koi.status NOT IN ('served', 'cancelled');

  IF v_pending = 0 THEN
    UPDATE public.tickets SET fulfillment_status = 'fulfilled'
    WHERE id = v_item.ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'item_id', p_item_id, 'status', 'served',
    'sale_id', v_sale.id, 'ticket_fulfilled', (v_pending = 0),
    'idempotent_replay', false
  );
END;
$$;

COMMENT ON FUNCTION public.serve_kitchen_item(UUID, UUID, TEXT, TEXT, DATE) IS
  '⭐⭐ LA naissance du CA (§6) — crée une vente VALIDÉE au format item_type=''dish''. '
  '⛔ Refuse tout statut autre que `ready` : servir depuis `pending` créerait un CA sans que la '
  'matière ait été consommée, donc une marge de 100 %. '
  '⭐ Délègue à create_sale_idempotent (price guard, idempotence) plutôt que de réimplémenter. '
  '⭐ Passe le ticket en `fulfilled` quand plus aucune ligne n''est en cours (§13.7).';

-- =====================================================
-- 5. cancel_kitchen_item — avec motif structuré
-- =====================================================

CREATE FUNCTION public.cancel_kitchen_item(
  p_bar_id  UUID,
  p_item_id UUID,
  p_reason  TEXT,
  p_note    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item     RECORD;
  v_actor    UUID := auth.uid();
  v_role     TEXT;
  v_pending  INTEGER;
  v_was_ready BOOLEAN;
BEGIN
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⭐ §16.4 — motif STRUCTURÉ obligatoire. Sans énumération, impossible de
  -- distinguer une fuite de stock d'un problème d'organisation.
  IF p_reason NOT IN ('ingredient_shortage','kitchen_overloaded','dish_unavailable',
                      'server_input_error','customer_cancelled','substitution_offered') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Motif d''annulation inconnu : %s', p_reason));
  END IF;

  SELECT koi.*, ko.ticket_id INTO v_item
  FROM public.kitchen_order_items koi
  JOIN public.kitchen_orders ko ON ko.id = koi.kitchen_order_id
  WHERE koi.id = p_item_id AND koi.bar_id = p_bar_id
  FOR UPDATE OF koi;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable dans ce bar');
  END IF;

  -- ⛔ TRANSITION INTERDITE (§6.1) : `served → cancelled`.
  -- Une vente existe déjà : l'annuler passe par `cancel_sale`, qui annule le
  -- CA sans restituer la matière.
  IF v_item.status = 'served' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce plat est déjà servi — utilisez l''annulation de vente'
    );
  END IF;

  IF v_item.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true, 'item_id', p_item_id, 'status', 'cancelled',
      'idempotent_replay', true
    );
  END IF;

  v_was_ready := (v_item.status = 'ready');

  -- ⛔ §6.1 — après `ready`, seul le GÉRANT peut annuler : la matière est
  -- partie, la décision est sanitaire ou commerciale, pas opérationnelle.
  IF v_was_ready AND auth.role() <> 'service_role' THEN
    SELECT bm.role INTO v_role
    FROM public.bar_members bm
    WHERE bm.user_id = v_actor AND bm.bar_id = p_bar_id AND bm.is_active = TRUE;

    -- ⚠️ Liste BLANCHE : un rôle ajouté plus tard est refusé par défaut.
    IF v_role IS NULL OR v_role NOT IN ('super_admin','promoteur','gerant') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Un plat déjà prêt ne peut être annulé que par le gérant'
      );
    END IF;
  END IF;

  -- ⭐⭐ LA MATIÈRE N'EST JAMAIS RESTITUÉE (§6.1).
  -- `consumed_at` et `computed_cost` restent renseignés, `sale_id` reste NULL.
  -- Cette combinaison EST la définition d'une PERTE (§8, 4e métrique) —
  -- l'effacer effacerait la perte elle-même.
  UPDATE public.kitchen_order_items
  SET status        = 'cancelled',
      cancelled_by  = v_actor,
      cancelled_at  = NOW(),
      cancel_reason = p_reason,
      cancel_note   = NULLIF(TRIM(COALESCE(p_note, '')), '')
  WHERE id = p_item_id;

  -- ⭐ §13.7 — une ligne annulée est RÉGLÉE : elle ne reviendra pas. Si c'était
  -- la dernière en cours, le ticket devient `fulfilled`.
  SELECT count(*) INTO v_pending
  FROM public.kitchen_order_items koi
  JOIN public.kitchen_orders ko ON ko.id = koi.kitchen_order_id
  WHERE ko.ticket_id = v_item.ticket_id
    AND koi.status NOT IN ('served', 'cancelled');

  IF v_pending = 0 THEN
    UPDATE public.tickets SET fulfillment_status = 'fulfilled'
    WHERE id = v_item.ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'item_id', p_item_id, 'status', 'cancelled',
    -- ⭐ `was_loss` : l'appelant doit pouvoir dire au gérant que cette
    -- annulation a COÛTÉ quelque chose. Sans ce signal, la perte reste
    -- invisible au moment où elle se produit.
    'was_loss', v_was_ready,
    'lost_cost', CASE WHEN v_was_ready THEN v_item.computed_cost ELSE 0 END,
    'ticket_fulfilled', (v_pending = 0),
    'idempotent_replay', false
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_kitchen_item(UUID, UUID, TEXT, TEXT) IS
  'Annule une ligne avec un motif STRUCTURÉ (§16.4) — sans énumération, impossible de distinguer '
  'une fuite de stock d''un problème d''organisation. '
  '⛔ Refuse `served` (utiliser cancel_sale) et refuse l''annulation post-`ready` par un '
  'non-gérant (§6.1 : décision sanitaire, pas opérationnelle). '
  '⭐⭐ La matière n''est JAMAIS restituée : consumed_at et computed_cost restent, sale_id reste '
  'NULL — c''est la définition même d''une PERTE (§8). Retourne `was_loss` pour que l''UI le dise.';

-- =====================================================
-- Privilèges
-- =====================================================
-- ⚠️ REVOKE PUBLIC d'abord, et JAMAIS de privilège à `anon` : ces fonctions
-- sont SECURITY DEFINER, un accès anonyme contournerait toute la RLS.
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_kitchen_item(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serve_kitchen_item(UUID, UUID, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_kitchen_item(UUID, UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.serve_kitchen_item(UUID, UUID, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_kitchen_item(UUID, UUID, TEXT, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_kitchen_item(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_kitchen_item_ready(UUID, UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.serve_kitchen_item(UUID, UUID, TEXT, TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_kitchen_item(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Les 5 fonctions, toutes en SECURITY DEFINER avec search_path figé :
--
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS config
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN (
--      'create_kitchen_order','accept_kitchen_item','mark_kitchen_item_ready',
--      'serve_kitchen_item','cancel_kitchen_item')
--    ORDER BY p.proname;
--    -- ATTENDU : 5 lignes, security_definer=true, config={search_path=public}
--    -- ⛔ config NULL = FAILLE : search_path manipulable par l'appelant.
--
-- 2) ⚠️ CRITIQUE — `anon` ne doit exécuter AUCUNE :
--
--    SELECT p.proname,
--           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN (
--      'create_kitchen_order','accept_kitchen_item','mark_kitchen_item_ready',
--      'serve_kitchen_item','cancel_kitchen_item')
--    ORDER BY p.proname;
--    -- ATTENDU : anon=false et auth=true sur les 5.
--
-- 3) ⚠️ Les tables restent en LECTURE SEULE (non-régression) :
--
--    SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated'
--      AND table_name IN ('kitchen_orders','kitchen_order_items')
--    ORDER BY table_name, privilege_type;
--    -- ATTENDU : uniquement SELECT. Un UPDATE rendrait la machine
--    --   d'état contournable.
--
-- ⭐ TESTS FONCTIONNELS — depuis l'APPLICATION, sur un BAR DE TEST.
--    ⚠️ Le SQL Editor a auth.uid() = NULL : ces RPC y répondront « Accès refusé ».
--
-- ☐ 4a. ⭐ LE PARCOURS COMPLET : créer une commande → accepter → prêt → servir.
--        Vérifier qu'une VENTE existe, avec item_type='dish' dans sales.items.
-- ☐ 4b. ⭐ Le STOCK d'ingrédients a baissé après `ready`, PAS après `serve`.
--        C'est la dissociation du §6 — si le stock bouge au service, le modèle
--        est inversé.
-- ☐ 4c. ⛔ Servir depuis `pending` → REFUS explicite.
-- ☐ 4d. ⭐ Double-clic sur `ready` → `idempotent_replay: true`, et le stock
--        n'a baissé QU'UNE FOIS. C'est le garde le plus important.
-- ☐ 4e. ⭐ Annuler un plat `ready` → `was_loss: true` et `lost_cost` > 0.
--        Vérifier que consumed_at et computed_cost SONT CONSERVÉS : la perte
--        doit rester visible.
-- ☐ 4f. Annuler par un SERVEUR un plat `ready` → REFUS (gérant seul).
-- ☐ 4g. Le ticket passe `fulfilled` quand la dernière ligne est servie.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ INVARIANCE DES BARS PURS — §3                                   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐ 5 fonctions NEUVES, appelées uniquement depuis les écrans cuisine
--    (derrière `hasRestaurant`). Aucune fonction existante remplacée, aucune
--    table existante modifiée. Un bar pur ne les invoquera jamais.
