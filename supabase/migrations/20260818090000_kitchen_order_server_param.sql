-- ═══════════════════════════════════════════════════════════════════════
-- LE BON ADOPTE LE SERVEUR CHOISI, ET NON L'APPELANT — §20, lot 2 bis
-- 18/08/2026 — RÉÉCRITURE INTÉGRALE
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ CETTE MIGRATION REMPLACE SA PROPRE PREMIÈRE VERSION, QUI A CASSÉ LA
-- PRODUCTION LE 18/08. Le fichier a été réécrit sur place.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUI S'EST PASSÉ, ET LA RÈGLE QUI EN SORT                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- La première version ajoutait `p_server_id` par SUBSTITUTION DE TEXTE sur la
-- signature, en ciblant le motif du FICHIER SOURCE :
--     'p_notes        TEXT DEFAULT NULL' || chr(10) || ')'
--
-- ⚠️ `pg_get_functiondef` NORMALISE la déclaration des paramètres — il
-- restitue `p_notes text DEFAULT NULL::text)`. Le motif ne matchait donc RIEN.
-- Cascade : `replace()` sans effet → `EXECUTE` recrée la fonction À
-- L'IDENTIQUE (5 args) → le `DROP` de la signature à 5 args la supprime →
-- ZÉRO version en base, envoi en cuisine cassé.
--
-- ⭐⭐ LA RÈGLE, à appliquer à toute migration future :
--
--   · Le CORPS est restitué VERBATIM par `pg_get_functiondef`.
--     → substituer dessus est SÛR. C'est pourquoi les substitutions du 11/08
--       (13 RPC) et du 17/08 (serve_kitchen_item) ont fonctionné.
--
--   · La SIGNATURE est NORMALISÉE (casse des types, `NULL::text`, espaces).
--     → NE JAMAIS y substituer par motif. Modifier une signature exige
--       d'écrire un `CREATE OR REPLACE` INTÉGRAL.
--
-- ⛔ POURQUOI LE GARDE-FOU N'AVAIT PAS PROTÉGÉ : il vérifiait le motif du
-- COMBLEMENT (présent dans le corps), jamais celui de la SIGNATURE. Un
-- garde-fou qui ne contrôle pas ce que la substitution MODIFIE ne protège rien.
--
-- ⭐ Ce fichier applique la règle : la fonction est écrite EN ENTIER, recopiée
-- de `20260818110000` (rétablissement), avec les trois modifications posées à
-- la main. AUCUNE transformation de texte.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ LE DÉFAUT MÉTIER CORRIGÉ                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Le comblement du 17/08 utilisait `auth.uid()`. En MODE SIMPLIFIÉ c'est le
-- GÉRANT, pas le serveur choisi au panier. Sur un bon EXISTANT à
-- `server_id = NULL`, la boisson partait sur Paul et le plat sur le gérant :
-- une commande, deux imputations, et « Mon équipe » réclamait au mauvais.
--
-- ⚠️ Le comblement n'AGGRAVAIT PAS l'imputation (sans lui, `serve_kitchen_item`
-- imputait déjà au gérant via `v_actor`), mais il FIGEAIT le bon : `CartDrawer`
-- filtre les bons par serveur, donc le bon quittait la liste de Paul et ses
-- boissons suivantes devenaient impossibles à lui rattacher.
--
-- ⭐ ON ÉCRIT LE SERVEUR DANS LE BON plutôt que d'imputer le seul plat : sinon
-- le bon resterait à NULL et chaque boisson suivante serait attribuée par un
-- chemin distinct — deux sources sur un même bon, ce que le §16.7 interdit.
--
-- ⛔ `COALESCE` n'écrase JAMAIS un serveur déjà posé. `p_server_id` NULL ⟹ le
-- bon reste à NULL, visible de tous — moins nuisible qu'un bon figé à tort.
--
-- ⭐ `serve_kitchen_item` N'EST PAS TOUCHÉE : elle continue de lire le bon,
-- sans paramètre client. C'est la partie du 17/08 qui tenait.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ LE RÉTABLISSEMENT (20260818110000) EST PASSÉ.
--   SELECT count(*) AS versions,
--          max(pg_get_function_identity_arguments(oid)) AS signature
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : versions = 1, signature à 5 arguments (SANS p_server_id)
--   -- ⛔ Si versions = 0, appliquer 20260818110000 D'ABORD.
--   -- ⚠️ Si la signature contient déjà p_server_id, cette migration a déjà
--   --    tourné : la rejouer est sans risque (CREATE OR REPLACE + DROP IF EXISTS).
--
--   -- 2. Combien de bons ouverts SANS serveur (population concernée) ?
--   SELECT count(*) FILTER (WHERE server_id IS NULL) AS sans_serveur,
--          count(*)                                  AS total
--   FROM public.tickets WHERE status <> 'paid';
--   -- INFORMATIF : ces bons adopteront leur serveur au prochain plat envoyé.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_kitchen_order(
  p_bar_id       UUID,
  p_ticket_id    UUID,
  -- ⚠️ CONTRAT ÉTENDU : `price_option_id` s'ajoute, il n'est pas obligatoire.
  -- Un client qui l'ignore commande exactement comme avant (§19.5).
  p_items        JSONB,   -- [{dish_id, quantity, modifiers?, price_option_id?}]
  p_service_mode TEXT DEFAULT 'dine_in',
  p_notes        TEXT DEFAULT NULL,
  -- ⭐ §20 — le serveur CHOISI au panier, pour un bon qui n'en a pas encore.
  --    Optionnel et EN FIN de liste : tout appelant existant est inchangé.
  p_server_id    UUID DEFAULT NULL
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

  /**
   * ⛔⛔ `p_server_id` VIENT DU CLIENT : il doit être membre ACTIF de CE bar.
   *
   * Cette fonction ne porte que `is_bar_member` — ni garde de rôle, ni
   * `can_write_kitchen` (vérifié le 18/08). Sans ce contrôle, n'importe quel
   * membre pourrait rattacher un bon à un identifiant arbitraire, y compris
   * hors de son bar : le CA d'un serveur deviendrait falsifiable depuis la
   * console du navigateur.
   *
   * ⭐ REFUS et non repli silencieux sur l'appelant : une attribution demandée
   * puis ignorée produirait un chiffre faux que personne ne verrait.
   */
  IF p_server_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = p_server_id
      AND bar_id  = p_bar_id
      AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serveur inconnu dans ce bar');
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
      server_id = COALESCE(server_id, p_server_id)
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
 * ⛔⛔ L'ANCIENNE SIGNATURE À 5 ARGUMENTS DOIT DISPARAÎTRE.
 *
 * `CREATE OR REPLACE` avec un paramètre EN PLUS ne remplace pas : il CRÉE une
 * seconde fonction. Les deux coexisteraient, et PostgreSQL lèverait
 * `function is not unique` sur un appel à 5 arguments.
 *
 * ⚠️⚠️ L'ORDRE EST LE CORRECTIF CENTRAL : le DROP vient APRÈS le CREATE, dans
 * la MÊME transaction. Dans la version qui a cassé la production, le CREATE
 * échouait en silence (substitution sans effet) et le DROP s'exécutait quand
 * même. Ici, si le CREATE échoue, le BEGIN/COMMIT annule TOUT et la fonction à
 * 5 arguments survit intacte — le service ne peut pas tomber.
 */
DROP FUNCTION IF EXISTS public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT);

/**
 * ⭐ COMMENT re-posé : `CREATE OR REPLACE` ne le restitue pas, et le `DROP`
 * ci-dessus détruit celui de l'ancienne signature.
 */
COMMENT ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT, UUID) IS
  'Envoie les plats d''un ticket en cuisine. Deux passes : validation complète, puis écriture — '
  'une commande à moitié envoyée est pire qu''une commande refusée. '
  '⛔ Le PRIX est TOUJOURS relu en base (`dish_price_options.price` ou `dishes.price`), jamais '
  'accepté depuis le client : le serveur ne peut que DÉSIGNER une option, pas en fabriquer une. '
  '⭐ §19.5 — un plat qui a des formats actifs EXIGE un `price_option_id` ; le format doit '
  'appartenir à ce plat ET à ce bar, sans quoi un identifiant substitué ferait payer un autre prix. '
  '⭐ §20 — `p_server_id` (optionnel) fait ADOPTER ce serveur au bon s''il n''en a pas : boissons '
  'et plats d''une même commande partent alors sur le même serveur. Validé contre `bar_members`.';

-- ⭐ GRANTS sur la NOUVELLE signature, `service_role` compris (leçon du 17/08).
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔⛔ UNE SEULE signature, à SIX arguments. LE CONTRÔLE CENTRAL :
--   --    c'est celui qui aurait détecté la casse de la première version.
--   SELECT count(*) AS versions,
--          max(pg_get_function_identity_arguments(oid)) AS signature
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : versions = 1, signature se terminant par « p_server_id uuid »
--   -- ⛔ versions = 0 → la fonction a disparu, appliquer 20260818110000.
--   -- ⛔ versions = 2 → le DROP n'a pas pris, les appels lèveront.
--
--   -- 2. ⛔ LE COMBLEMENT UTILISE LE PARAMÈTRE, PLUS `auth.uid()`
--   SELECT pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, p_server_id)%'
--            AS comble_avec_parametre,
--          pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, auth.uid())%'
--            AS ancien_comblement_restant
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / false
--
--   -- 3. ⛔ LA VALIDATION D'APPARTENANCE est présente
--   SELECT pg_get_functiondef(oid) LIKE '%Serveur inconnu dans ce bar%' AS valide_appartenance
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 4. ⛔ L'UPDATE tickets DU §13.7 EST TOUJOURS LÀ (régression du 10/08)
--   SELECT pg_get_functiondef(oid) LIKE '%fulfillment_status = ''pending''%' AS ticket_bloque
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 5. ⛔ GRANTS + COMMENT (OID en 2e argument, jamais une signature
--   --    reconstruite : `has_function_privilege` n'accepte que les types)
--   SELECT has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_peut,
--          has_function_privilege('service_role',  oid, 'EXECUTE') AS service_peut,
--          has_function_privilege('anon',          oid, 'EXECUTE') AS anon_peut,
--          obj_description(oid, 'pg_proc') IS NOT NULL              AS comment_present
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true / false / true
--
--   -- 6. ⚠ `serve_kitchen_item` N'A PAS BOUGÉ
--   SELECT pg_get_functiondef(oid) LIKE '%COALESCE(t.server_id, v_actor)%' AS lit_toujours_le_bon
--   FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
-- ⛔⛔ ORDRE DE DÉPLOIEMENT — MIGRATION D'ABORD, CLIENT ENSUITE.
--
-- SENS SÛR — migration appliquée, client pas déployé : le client envoie 5
--   clés, PostgREST résout par NOM, `p_server_id` prend son DEFAULT NULL. ✅
-- SENS QUI CASSE — client déployé, migration non appliquée : le client envoie
--   `p_server_id` à une fonction qui ne l'accepte pas → PGRST202, envoi en
--   cuisine cassé. ⛔
--
-- ⭐ Portée réelle : `p_server_id: serverId ?? undefined` et `JSON.stringify`
--   SUPPRIME les clés `undefined`. En mode complet la clé n'est jamais
--   envoyée. Le risque est circonscrit au MODE SIMPLIFIÉ — le mode que ce
--   chantier sert.
--
-- ⚠️⚠️ RÉGÉNÉRER LES TYPES APRÈS APPLICATION — relevé à la revue du 18/08.
--
-- `src/lib/database.types.ts` ne déclare PAS `p_server_id`, et pourtant `tsc`
-- passe : `kitchen.service.ts` n'importe aucun type d'override, donc rien ne
-- vérifie cet appel à la compilation. Un renommage de paramètre ne se verrait
-- qu'en production, par un `PGRST202`.
--
-- ⛔ Ce trou PRÉEXISTE à cette migration, mais elle s'appuie dessus : elle
-- ajoute un paramètre en comptant sur une chaîne de types qui ne vérifie rien.
--
--   npm run gen:types
--
-- ⚠️ JAMAIS une redirection `>` : sous PowerShell elle produit de l'UTF-16 et
-- casse ESLint (documenté dans le CLAUDE.md du projet). Le script filtre en
-- outre les messages parasites du CLI Supabase.
-- ⚠️ ORDRE : les types ne peuvent être régénérés qu'APRÈS que la migration
-- soit en base. Séquence complète : migration → gen:types → client.
--
-- ⚠️⚠️ SMOKE-TEST — le cas qui a motivé cette migration :
--   · MODE SIMPLIFIÉ, bon EXISTANT à `server_id = NULL`, serveur « Paul » :
--     1 boisson + 1 plat. Les DEUX ventes doivent porter Paul, et le bon doit
--     RESTER VISIBLE dans la liste de Paul.
--   · Vérifier dans « Mon équipe » — c'est l'écran qui porte le recouvrement.
