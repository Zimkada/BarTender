-- ═══════════════════════════════════════════════════════════════════════
-- FORMATS DE PRIX PAR PLAT — §19.5
-- 10/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- LE BESOIN, remonté du terrain.
--
-- Un carton de poisson acheté en gros contient des poissons de TAILLES
-- DIFFÉRENTES. Le même plat se vend donc 2 000 F avec un gros poisson et
-- 1 000 F avec un petit. Ce n'est pas une exception à corriger : c'est la
-- nature de l'approvisionnement, et elle se reproduit à chaque carton.
--
-- ⭐ LE CHOIX SE FAIT PAR PLAT, PAS PAR BAR. Dans le MÊME restaurant, le
-- poisson braisé a des formats et le riz gras un prix ferme. Un plat sans
-- aucune option garde exactement le comportement actuel (`dishes.price`) —
-- c'est ce qui permet aux deux pratiques de coexister sans réglage global.
--
-- ⚠️ CE N'EST PAS UNE PORTION. Un poisson entier reste un poisson entier :
-- la recette et le décompte d'ingrédients ne changent pas. Seul le PRIX
-- varie. Le coût matière suit le CUMP du carton — juste EN MOYENNE, ce qui
-- est précisément la garantie du CUMP.
--
-- ⛔⛔ LE SERVEUR NE SAISIT JAMAIS UN MONTANT. Il choisit une option
-- PRÉCONFIGURÉE par le gérant. C'est la différence entre un prix libre —
-- le levier de fraude le plus direct d'un POS, ici quotidien — et une
-- sélection dans une liste fermée. Le garde-fou EST le mécanisme.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, et à lire                            │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. Les deux tables cibles existent
--   SELECT to_regclass('public.dishes')              AS t_dishes,
--          to_regclass('public.kitchen_order_items') AS t_koi;
--   -- ATTENDU : les 2 non NULL
--
--   -- 2. La RPC cible n'a pas dérivé
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--
--   -- 3. Aucune table homonyme (cette migration est-elle déjà passée ?)
--   SELECT to_regclass('public.dish_price_options') AS deja_la;
--   -- ATTENDU : NULL

BEGIN;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. LA TABLE DES FORMATS                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ PAS DE RÉFÉRENTIEL PARTAGÉ entre plats, et c'est délibéré. « Grand »
-- pour un poisson et « Grand » pour un poulet ne désignent ni la même
-- taille ni le même prix : les lier créerait un couplage qui ne sert
-- personne, et renommer l'un toucherait l'autre. Les trois libellés par
-- défaut (Grand / Moyen / Petit) sont une SUGGESTION À LA SAISIE côté UI,
-- jamais une entité partagée.

CREATE TABLE public.dish_price_options (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ⚠️ `bar_id` DÉNORMALISÉ depuis `dishes`, comme partout dans le module :
  -- il rend la politique RLS directe et évite une jointure sur chaque
  -- lecture. La cohérence avec `dishes.bar_id` est vérifiée par la RPC.
  bar_id   UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- ⚠️ CASCADE : un format n'a aucun sens sans son plat. Contrairement aux
  -- lots de production (RESTRICT), il ne porte ni stock ni valeur — il n'y
  -- a pas d'historique à protéger ici, celui-ci vit sur les LIGNES DE
  -- COMMANDE, qui gardent leur prix figé (cf. §3).
  dish_id  UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,

  -- « Grand », « Demi », « 50cl » — ce que le serveur annonce au client.
  label    TEXT NOT NULL CHECK (length(trim(label)) > 0),

  price    NUMERIC(12, 2) NOT NULL CHECK (price >= 0),

  -- Ordre d'affichage, pour que « Grand » précède « Petit » si le gérant
  -- le souhaite. À défaut, l'UI trie par prix décroissant.
  sort_order INTEGER NOT NULL DEFAULT 0,

  /**
   * ⭐ RETRAIT RÉVERSIBLE, aligné sur `dishes` et `ingredients` (09/08/2026).
   *
   * Un gérant qui cesse de vendre le « Petit » ne doit pas perdre l'historique
   * : « combien de Petits ai-je vendus en juillet ? » doit continuer de
   * répondre. Une suppression franche laisserait des lignes de commande
   * pointant vers un format sans nom.
   *
   * ⚠️ C'est aussi pour cela que `kitchen_order_items.price_option_id` est
   * ON DELETE SET NULL et non CASCADE (cf. §2) : même en cas de suppression
   * physique, la commande survit avec son `unit_price` figé.
   */
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ⛔ Deux formats homonymes sur le même plat rendraient le choix du serveur
  -- ambigu au moment le moins propice — en plein service, face au client.
  CONSTRAINT dpo_label_unique_per_dish UNIQUE (dish_id, label)
);

-- La requête de l'écran de commande : les formats actifs d'un plat.
CREATE INDEX idx_dpo_dish_active
  ON public.dish_price_options (dish_id, sort_order)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.dish_price_options IS
  '§19.5 — formats de prix d''un plat (Grand / Moyen / Petit…). Répond au carton de poisson NON '
  'TRIÉ : mêmes ingrédients, même recette, prix différent selon la taille servie. '
  '⭐ Un plat SANS option garde `dishes.price` et le comportement d''origine — les deux pratiques '
  'coexistent dans le même bar, plat par plat. '
  '⛔ Le serveur CHOISIT une option, il ne saisit jamais un montant : le prix reste relu en base '
  'par `create_kitchen_order`, jamais accepté depuis le client.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. LE LIEN SUR LA LIGNE DE COMMANDE                              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⭐⭐ POURQUOI UNE COLONNE ET PAS SEULEMENT `unit_price`.
--
-- Le montant seul ne suffit PAS à répondre à « quel format se vend le
-- mieux ? » : deux formats peuvent partager un prix, et un format re-tarifé
-- deviendrait indistinguable de l'autre dans l'historique. Le décompte par
-- format exige une référence à l'entité, pas à sa valeur.

ALTER TABLE public.kitchen_order_items
  ADD COLUMN IF NOT EXISTS price_option_id UUID
    REFERENCES public.dish_price_options(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.kitchen_order_items.price_option_id IS
  '§19.5 — format choisi par le serveur, NULL pour un plat à prix ferme. '
  '⭐ Permet le décompte par format (« quel format se vend le mieux »), qu''un simple montant ne '
  'permettrait pas : deux formats peuvent partager un prix. '
  '⚠️ ON DELETE SET NULL : `unit_price` reste figé sur la ligne, la commande survit à la '
  'suppression du format. Le retrait normal est RÉVERSIBLE (`is_active`), pas un DELETE.';

-- ⚠️ Index PARTIEL : la très grande majorité des lignes n'auront pas de
-- format. Un index plein serait du volume mort.
CREATE INDEX idx_koi_price_option
  ON public.kitchen_order_items (price_option_id)
  WHERE price_option_id IS NOT NULL;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. LA PRISE DE COMMANDE                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔⛔⛔ LA GARANTIE QUE CETTE MIGRATION NE DOIT PAS AFFAIBLIR.
--
-- `create_kitchen_order` insère `d.price` — JAMAIS un prix envoyé par le
-- client. C'est écrit noir sur blanc dans `useKitchenCart` : « le prix
-- FAISANT FOI est `dishes.price` LU PAR LE SERVEUR ». Accepter un montant
-- depuis le client ouvrirait le levier de fraude le plus direct d'un POS.
--
-- ⭐ LE CLIENT ENVOIE UN IDENTIFIANT, LE SERVEUR RELIT LE PRIX. Un serveur
-- ne peut donc pas fabriquer un prix : il ne peut que DÉSIGNER une option
-- que le gérant a créée. La garantie est intégralement préservée.

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
  SET fulfillment_status = 'pending'
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

COMMENT ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) IS
  'Envoie les plats d''un ticket en cuisine. Deux passes : validation complète, puis écriture — '
  'une commande à moitié envoyée est pire qu''une commande refusée. '
  '⛔ Le PRIX est TOUJOURS relu en base (`dish_price_options.price` ou `dishes.price`), jamais '
  'accepté depuis le client : le serveur ne peut que DÉSIGNER une option, pas en fabriquer une. '
  '⭐ §19.5 — un plat qui a des formats actifs EXIGE un `price_option_id` ; le format doit '
  'appartenir à ce plat ET à ce bar, sans quoi un identifiant substitué ferait payer un autre prix.';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. RLS ET PRIVILÈGES                                             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ Aligné sur `dishes` : lecture pour les membres du bar, écriture par
-- `service_role` uniquement (donc via RPC). Un serveur LIT les formats pour
-- les afficher, il n'en crée jamais.

ALTER TABLE public.dish_price_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dish_price_options_bar_members_select"
  ON public.dish_price_options FOR SELECT
  TO authenticated
  USING (is_bar_member(bar_id) OR is_super_admin());

GRANT SELECT ON public.dish_price_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dish_price_options TO service_role;

-- ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS — leçon des vagues 1-4.
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. La table et la colonne existent
--   SELECT to_regclass('public.dish_price_options') AS t_options;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'kitchen_order_items' AND column_name = 'price_option_id';
--
--   -- 2. ⚠ CRITIQUE — RLS ACTIVE
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname = 'dish_price_options';
--   -- ATTENDU : true
--
--   -- 3. ⛔ LE PLUS IMPORTANT — `anon` ne peut PAS commander
--   SELECT
--     has_function_privilege('anon',
--       'public.create_kitchen_order(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS anon_peut,
--     has_function_privilege('authenticated',
--       'public.create_kitchen_order(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS auth_peut;
--   -- ATTENDU : false / true
--
--   -- 4. Les gardes anti-fraude sont dans le CORPS, pas dans un commentaire
--   SELECT
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%o.dish_id = d.id%'
--       AS format_lie_au_plat,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%COALESCE(o.price, d.price)%'
--       AS prix_relu_en_base,
--     regexp_replace(pg_get_functiondef(oid), '--[^\n]*', '', 'g') LIKE '%price_option_required%'
--       AS format_obligatoire
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true / true
--   -- ⚠️ `pg_get_functiondef` CONSERVE les commentaires : sans le
--   --    regexp_replace, ces motifs matcheraient leur propre documentation.
--
--   -- 5. ⚠ NON-RÉGRESSION — aucune ligne existante n'a de format
--   SELECT count(*) FROM public.kitchen_order_items WHERE price_option_id IS NOT NULL;
--   -- ATTENDU : 0
--
-- ⚠️⚠️ CE QUE LE POST-VOL NE PROUVE PAS. PL/pgSQL ne résout ses requêtes
-- qu'À L'EXÉCUTION. Ces contrôles peuvent passer au vert sur une fonction
-- qui échouerait au premier appel — et ici l'enjeu est maximal : c'est le
-- point d'entrée de TOUTE commande cuisine. Un smoke-test par l'UI est
-- OBLIGATOIRE avant le service, en commandant d'abord un plat SANS format
-- (non-régression) puis un plat AVEC.
