-- ═══════════════════════════════════════════════════════════════════════
-- ⛔⛔ RÉTABLISSEMENT D'URGENCE — create_kitchen_order
-- 18/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ LA MIGRATION 20260818090000 A SUPPRIMÉ LA FONCTION SANS LA RECRÉER.
-- L'ENVOI EN CUISINE EST CASSÉ. Ce fichier la rétablit dans son état du
-- 17/08 (comblement `auth.uid()` compris), à l'identique.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CAUSE RACINE — `pg_get_functiondef` NORMALISE LA SIGNATURE       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 20260818090000 substituait sur le motif du FICHIER SOURCE :
--     'p_notes        TEXT DEFAULT NULL' || chr(10) || ')'
--
-- ⚠️ Or `pg_get_functiondef` RESTITUE la déclaration des paramètres sous
-- forme NORMALISÉE — typiquement `p_notes text DEFAULT NULL::text)`. Le motif
-- ne matchait donc RIEN.
--
-- Cascade :
--   1. `replace()` n'a rien remplacé → aucun `p_server_id` ajouté
--   2. `EXECUTE v_def` a recréé la fonction À L'IDENTIQUE (5 arguments)
--   3. Le `DROP FUNCTION ... (UUID,UUID,JSONB,TEXT,TEXT)` l'a supprimée
--   4. Résultat : ZÉRO version en base
--
-- ⛔ POURQUOI LE GARDE-FOU N'A PAS PROTÉGÉ : il vérifiait le motif du
-- COMBLEMENT (présent dans le corps), jamais celui de la SIGNATURE.
--
-- ⭐⭐ LA LEÇON, à retenir pour toute substitution future :
--   · Le CORPS d'une fonction est restitué VERBATIM par `pg_get_functiondef`
--     → substituer dessus est sûr (c'est pourquoi les 3 substitutions du
--       17/08 et celles du 11/08 ont fonctionné).
--   · La SIGNATURE est NORMALISÉE (casse des types, `NULL::text`, espaces)
--     → NE JAMAIS y substituer par motif. Pour ajouter un paramètre, écrire
--       un `CREATE OR REPLACE` COMPLET, jamais une transformation de texte.
--
-- ⚠️ Ce fichier utilise donc un `CREATE OR REPLACE` intégral, recopié du
-- source, sans aucune substitution.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_kitchen_order(
  p_bar_id       UUID,
  p_ticket_id    UUID,
  -- ⚠️ CONTRAT ÉTENDU : `price_option_id` s'ajoute, il n'est pas obligatoire.
  -- Un client qui l'ignore commande exactement comme avant (§19.5).
  p_items        JSONB,   -- [{dish_id, quantity, modifiers?, price_option_id?}]
  p_service_mode TEXT DEFAULT 'dine_in',
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_order_id   UUID;
  v_item       JSONB;
  v_dish       RECORD;
  v_dish_id    UUID;
  v_qty        INTEGER;
  v_opt_id     UUID;
  v_opt_count  INTEGER;
  v_count      INTEGER := 0;
BEGIN
  -- ⚠️ `OR is_super_admin()` PRÉSERVÉ de l'original : le super_admin opère
  -- sur tous les bars sans être membre d'aucun.
  IF NOT (is_bar_member(p_bar_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé à ce bar');
  END IF;

  -- ⚠️ `jsonb_typeof <> 'array'` PRÉSERVÉ : `jsonb_array_length` LÈVE une
  -- exception sur un objet ou un scalaire. Sans ce test, un client mal formé
  -- produirait une erreur SQL brute au lieu d'un refus lisible.
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

  -- ⭐ PASSE 1 — VALIDATION. Aucune écriture avant que TOUTES les lignes
  -- soient jugées valides : une commande à moitié envoyée en cuisine est
  -- pire qu'une commande refusée.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_dish_id := NULLIF(v_item->>'dish_id','')::UUID;
    v_qty     := (v_item->>'quantity')::INTEGER;
    v_opt_id  := NULLIF(v_item->>'price_option_id','')::UUID;

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

    -- ⚠️ MESSAGE DISTINCT ET NOMMÉ, préservé de l'original : « Poisson braisé
    -- n'est plus disponible » se corrige en salle ; « plat introuvable ou
    -- indisponible » laisse le serveur sans savoir lequel ni pourquoi.
    IF NOT v_dish.is_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('« %s » n''est plus disponible', v_dish.name)
      );
    END IF;

    /**
     * ⭐ §19.5 — LE FORMAT EST OBLIGATOIRE DÈS QUE LE PLAT EN A.
     *
     * Pas de repli sur `dishes.price` ni sur « le premier format » : un
     * serveur pressé validerait un « Grand » pour un petit poisson, et
     * l'écart ne se verrait qu'à l'inventaire. Le choix doit être EXPLICITE
     * ou la commande est refusée.
     */
    SELECT count(*) INTO v_opt_count
    FROM public.dish_price_options
    WHERE dish_id = v_dish_id AND bar_id = p_bar_id AND is_active = TRUE;

    IF v_opt_count > 0 AND v_opt_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Ce plat se vend en plusieurs formats : choisissez-en un.',
        'price_option_required', TRUE,
        'dish_id', v_dish_id
      );
    END IF;

    /**
     * ⛔⛔ LE FORMAT DOIT APPARTENIR À CE PLAT **ET** À CE BAR.
     *
     * Sans `dish_id = v_dish_id`, un serveur pourrait désigner le format
     * « Petit » d'un autre plat pour payer son poisson moins cher — une
     * fraude par simple substitution d'identifiant, invisible en base.
     * Sans `bar_id = p_bar_id`, la faille traverserait les tenants.
     * ⚠️ `is_active` AUSSI : un format retiré ne doit plus être commandable,
     * même si un client au cache périmé l'affiche encore.
     */
    IF v_opt_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.dish_price_options
        WHERE id = v_opt_id AND dish_id = v_dish_id
          AND bar_id = p_bar_id AND is_active = TRUE
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Format de prix inconnu pour ce plat'
        );
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ⭐ PASSE 2 — écriture atomique.
  SELECT id INTO v_order_id
  FROM public.kitchen_orders WHERE ticket_id = p_ticket_id;

  IF NOT FOUND THEN
    INSERT INTO public.kitchen_orders (bar_id, ticket_id, service_mode, notes, created_by)
    VALUES (p_bar_id, p_ticket_id, p_service_mode, p_notes, v_actor)
    RETURNING id INTO v_order_id;
  END IF;

  INSERT INTO public.kitchen_order_items
    (bar_id, kitchen_order_id, dish_id, quantity, unit_price, modifiers, price_option_id)
  SELECT
    p_bar_id,
    v_order_id,
    (l->>'dish_id')::UUID,
    (l->>'quantity')::INTEGER,
    /**
     * ⭐⭐ LE PRIX EST RELU EN BASE, JAMAIS ACCEPTÉ DU CLIENT.
     *
     * Avec format : le prix de l'OPTION, jointe ci-dessous sur son id.
     * Sans format : `d.price`, exactement comme avant cette migration.
     * Dans les deux cas le client n'a envoyé qu'un IDENTIFIANT — la
     * garantie anti-fraude d'origine est intégralement préservée.
     *
     * ⚠️ Prix FIGÉ à la commande : re-tarifer un format ensuite ne touche
     * pas les commandes déjà passées, comme pour `dishes.price`.
     */
    COALESCE(o.price, d.price),
    CASE WHEN l ? 'modifiers' THEN l->'modifiers' ELSE NULL END,
    o.id
  FROM jsonb_array_elements(p_items) AS l
  JOIN public.dishes d
    ON d.id = (l->>'dish_id')::UUID
   AND d.bar_id = p_bar_id
  /**
   * ⚠️ LEFT JOIN, et les DEUX conditions comptent : un plat sans format
   * donne `o.id IS NULL` et retombe sur `d.price`. `dish_id` et `bar_id`
   * sont RÉPÉTÉS ici bien que la passe 1 les ait validés — la passe 1
   * protège du refus propre, cette jointure protège de l'écriture fausse.
   */
  LEFT JOIN public.dish_price_options o
    ON o.id = NULLIF(l->>'price_option_id','')::UUID
   AND o.dish_id = d.id
   AND o.bar_id = p_bar_id
   AND o.is_active = TRUE;

  /**
   * ⛔⛔ RESTAURÉ APRÈS RELECTURE — je l'avais PERDU en réécrivant la
   * fonction, et c'était la régression la plus grave de cette migration.
   *
   * §13.7 — `fulfillment_status` est piloté par RPC, jamais par le client.
   * Le ticket a désormais des lignes en cuisine : il n'est plus clôturable
   * tant qu'elles ne sont pas servies. Sans cet UPDATE, un serveur
   * encaisserait et fermerait un ticket dont les plats sont encore au feu.
   */
  UPDATE public.tickets
  SET fulfillment_status = 'pending',
      server_id = COALESCE(server_id, auth.uid())
  WHERE id = p_ticket_id;

  -- ⚠️ `items_created` et non `items_count` : nom du CONTRAT existant, lu
  -- par le client. Le renommer aurait cassé l'appelant en silence.
  RETURN jsonb_build_object(
    'success', true,
    'kitchen_order_id', v_order_id,
    'items_created', v_count
  );
END;
$$;

/**
 * ⛔⛔ LE COMMENT AUSSI — défaut trouvé à la revue de ce rétablissement.
 *
 * `DROP FUNCTION` a détruit la fonction ET son COMMENT. Un `CREATE OR REPLACE`
 * ne le restitue pas : sans ces lignes, la documentation métier consultable EN
 * BASE disparaîtrait définitivement — celle qu'on lit en inspectant la
 * production sans avoir le dépôt sous la main.
 *
 * ⚠️ Recopié à l'identique de `20260810140000_dish_price_options.sql:363`.
 */
COMMENT ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) IS
  'Envoie les plats d''un ticket en cuisine. Deux passes : validation complète, puis écriture — '
  'une commande à moitié envoyée est pire qu''une commande refusée. '
  '⛔ Le PRIX est TOUJOURS relu en base (`dish_price_options.price` ou `dishes.price`), jamais '
  'accepté depuis le client : le serveur ne peut que DÉSIGNER une option, pas en fabriquer une. '
  '⭐ §19.5 — un plat qui a des formats actifs EXIGE un `price_option_id` ; le format doit '
  'appartenir à ce plat ET à ce bar, sans quoi un identifiant substitué ferait payer un autre prix.';

-- ⭐ Les GRANT d'origine, re-posés : `CREATE OR REPLACE` les perd.
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — À PASSER IMMÉDIATEMENT                                │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ LA FONCTION EXISTE À NOUVEAU
--   SELECT count(*) AS versions,
--          max(pg_get_function_identity_arguments(oid)) AS signature
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : versions = 1, signature à 5 arguments (SANS p_server_id)
--
--   -- 2. ⛔ LES GRANTS SONT EN PLACE
--   SELECT has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_peut,
--          has_function_privilege('service_role',  oid, 'EXECUTE') AS service_peut,
--          has_function_privilege('anon',          oid, 'EXECUTE') AS anon_peut
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true / false
--
--   -- 3. ⛔ LE COMMENT EST REVENU (le DROP l'avait détruit avec la fonction)
--   SELECT obj_description(oid, 'pg_proc') IS NOT NULL AS comment_present
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 4. ⚠ LE COMBLEMENT DU 17/08 EST BIEN LÀ — la future 20260818090000
--   --    corrigée l'exige comme motif de départ.
--   SELECT pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, auth.uid())%'
--            AS comblement_present
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
-- ⚠️⚠️ SMOKE-TEST IMMÉDIAT : envoyer un plat en cuisine depuis le panier.
-- C'est le geste que la suppression avait cassé.
