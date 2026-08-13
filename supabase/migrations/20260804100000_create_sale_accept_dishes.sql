-- ===================================================================
-- MIGRATION: create_sale_idempotent — accepter les plats sans casser le bar
-- DATE: 2026-08-04
-- AUTHOR: AI Assistant
-- PHASE: 3A du module restauration (§4.2, §6, §15.5)
-- ===================================================================

-- BLOQUANT — LA MIGRATION LA PLUS RISQUEE DU CHANTIER.
--   `create_sale_idempotent` traite CHAQUE VENTE DE CHAQUE BAR. Une erreur ici
--   n'affecte pas « les bars-restos » : elle affecte le parc entier.
--   -> A appliquer HORS SERVICE. Creneau retenu : mardi 04/08 tot le matin,
--     aucun bar en activite.

-- PROBLEM:
--   Quatre boucles de cette fonction iterent sur `p_items` en supposant que
--   CHAQUE item est un `bar_products`. Deux d'entre elles levent une EXCEPTION
--   si l'id est introuvable :
--       PRICE_ERROR:Produit % introuvable dans ce bar
--       STOCK_ERROR:Produit % introuvable dans ce bar
--   Un plat vendu ferait donc ECHOUER LA VENTE ENTIERE.

-- FORMAT RETENU — champ SEPARE, divergence assumee avec le §4.2
--   Le plan proposait de renommer product_id -> item_id. ECARTE : 62 points de
--   modification cote client et 19 281 ventes a reprendre.
--     boisson : { "product_id": "<uuid>", ... }                     INCHANGE
--     plat    : { "item_type": "dish", "dish_id": "<uuid>", ... }
--   Un plat n'a PAS de `product_id` : la confusion est structurellement
--   impossible. Un filtre oublie donne NULL — jamais LE MAUVAIS PRODUIT par
--   collision d'UUID.

-- LES QUATRE BOUCLES — traitement DIFFERENCIE, pas uniforme
--   1. Price guard     -> BRANCHE : prix lu dans `dishes` au lieu de bar_products
--   2. Stock check     -> CONTINUE : un plat n'a pas de stock (§6)
--   3. Calcul du total -> AUCUN FILTRE : le plat compte dans le montant paye
--   4. Decrement+promo -> CONTINUE : rien a decrementer, promo non tracee
--
--   ATTENTION La boucle 3 est le piege de cette migration. La filtrer produirait
--   une vente dont le montant serait INFERIEUR a l'addition reelle. Meme
--   raisonnement que `compute_sale_items_count` : tout lecteur d'items n'est
--   PAS a filtrer.

-- PRICE GUARD ETENDU AUX PLATS — §15.5 « obligatoire, pas optionnel »
--   Deux branches EXPLICITES, jamais un guard « unifie » parametre : le §15.5
--   impose de DUPLIQUER plutot que de generaliser, « sinon quelqu'un
--   factorisera et touchera au guard des boissons ».
--   Le chemin BOISSON est INCHANGE, ligne pour ligne. Les trois controles
--   arithmetiques (prix <= catalogue, remise <= 100 %, coherence du total) sont
--   COMMUNS — seule la SOURCE du prix differe.

-- BREAKING_CHANGE: NO
--   Aucun item ne porte `item_type` aujourd'hui : COALESCE(..., 'product')
--   fait suivre a toutes les ventes existantes et futures le chemin boisson,
--   a l'identique.

-- METHODE — transformation, pas reecriture
--   La definition de depart a ete EXTRAITE de la production
--   (pg_get_functiondef) et transformee par substitutions ciblees.
--   Certification automatique : 16/16 elements critiques survivent (liste
--   blanche des roles, mode simplifie, idempotence, 3 controles de prix,
--   FOR UPDATE, business_date 6h, timeouts, promotion_applications,
--   decrement, INSERT sales, source_return_id, SECURITY DEFINER,
--   search_path a DEUX schemas).

-- ROLLBACK_STRATEGY:
--   Reappliquer 20260731120000_whitelist_create_sale_roles.sql, PUIS rejouer
--   les GRANT (CREATE OR REPLACE les perd).
--   Un rollback rendrait tout plat INVENDABLE — sans consequence tant que
--   l'ecran de vente plat n'existe pas (phase 3B).

-- FUNCTIONS_MODIFIED: create_sale_idempotent
-- TABLES_MODIFIED: aucune

-- +---------------------------------------------------------------+
-- | PRE-VOL                                                        |
-- +---------------------------------------------------------------+
--
-- 1) CRITIQUE — photographier les privileges AVANT.
--    CREATE OR REPLACE LES PERD. Sans rejeu, TOUTES LES VENTES CASSENT.
--
--    SELECT p.prosecdef AS security_definer, p.proconfig AS config,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--    -- ATTENDU : true | {search_path=public, extensions} | true | false | true
--
-- 2) La table `dishes` existe (le price guard plat la lit) :
--
--    SELECT to_regclass('public.dishes') AS t_dishes;
--    -- ATTENDU : non NULL
--
-- 3) Photographier le volume de ventes (comparaison post-vol) :
--
--    SELECT count(*) AS nb_ventes FROM public.sales;
--    -- La migration ne touche AUCUNE donnee : ce nombre doit etre inchange.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_sale_idempotent'
  ) THEN
    RAISE EXCEPTION 'create_sale_idempotent absente - diagnostiquer avant de continuer';
  END IF;

  -- Le price guard plat lit `dishes`. Sans elle, la fonction se creerait
  -- et echouerait a la premiere vente de plat.
  IF to_regclass('public.dishes') IS NULL THEN
    RAISE EXCEPTION 'Table dishes absente - appliquer d''abord 20260803100000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_sale_idempotent(
    p_bar_id uuid,
    p_items jsonb,
    p_payment_method text,
    p_sold_by uuid,
    p_idempotency_key text,
    p_server_id uuid DEFAULT NULL::uuid,
    p_status text DEFAULT 'validated'::text,
    p_customer_name text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_business_date date DEFAULT NULL::date,
    p_ticket_id uuid DEFAULT NULL::uuid,
    p_source_return_id uuid DEFAULT NULL::uuid
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_existing_sale     sales;
    v_sale              sales;
    v_item              JSONB;
    v_product_id        UUID;
    v_quantity          INT;
    v_unit_price        NUMERIC;
    v_total_price       NUMERIC;
    v_total_amount      NUMERIC := 0;
    v_business_date     DATE;
    v_promotion_id      UUID;
    v_discount_amount   NUMERIC;
    v_original_unit_price NUMERIC;
    v_applied_promotions JSONB := '[]'::JSONB;
    v_caller_role       TEXT;
    v_operating_mode    TEXT;
    v_current_stock     INT;
    v_product_name      TEXT;
    -- ✨ F6 garde-fou
    v_catalog_price     NUMERIC;
    v_expected_total    NUMERIC;
    -- ⭐ Module restauration (04/08/2026)
    v_item_type         TEXT;
    v_dish_id           UUID;
BEGIN
    -- Configuration timeouts
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';

    -- Validation de base
    IF p_bar_id IS NULL OR p_items IS NULL OR p_sold_by IS NULL THEN
        RAISE EXCEPTION 'bar_id, items, and sold_by are required';
    END IF;

    -- 🛡️ SECURITY CHECK — membership + contrôle rôle/mode
    IF auth.role() <> 'service_role' THEN
        SELECT bm.role INTO v_caller_role
        FROM public.bar_members bm
        WHERE bm.user_id = auth.uid()
          AND bm.bar_id = p_bar_id
          AND bm.is_active = true;

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Access denied: not an active member of this bar';
        END IF;

        -- ⭐ GUARD RÔLE — LISTE BLANCHE (Pré-0 restauration, 2026-07-31)
        --    Seuls ces rôles peuvent créer une vente. Tout rôle absent de cette
        --    liste — y compris un rôle AJOUTÉ PLUS TARD, comme 'cuisinier' — est
        --    refusé par défaut. Ne JAMAIS transformer ce test en liste noire :
        --    c'est précisément le défaut que cette migration corrige.
        IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'serveur') THEN
            RAISE EXCEPTION 'Access denied: role % is not allowed to create sales', v_caller_role;
        END IF;

        SELECT b.settings->>'operatingMode' INTO v_operating_mode
        FROM public.bars b
        WHERE b.id = p_bar_id;

        IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN
            RAISE EXCEPTION 'Access denied: serveur role cannot create sales in simplified mode';
        END IF;
    END IF;

    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'idempotency_key is required';
    END IF;

    -- ⭐ CHECK IDEMPOTENCY (inchangé)
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing_sale;
    END IF;

    -- ✨ F6 GARDE-FOU PRIX — s'applique à TOUS les statuts (pending/validated).
    -- Vérifie la cohérence arithmétique des montants client contre le prix
    -- catalogue réel (bar_products.price), sans réimplémenter le moteur promo.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- ⭐ COALESCE : les 19 281 ventes existantes n'ont pas `item_type`.
        v_item_type           := COALESCE(v_item->>'item_type', 'product');

        -- ⭐⭐ LISTE BLANCHE — défaut trouvé à la code review.
        --
        -- Sans ce contrôle, une valeur inattendue ('DISH', 'plat', '') créait
        -- une INCOHÉRENCE ENTRE LES BOUCLES : le price guard teste
        -- `= 'dish'` et lisait donc `bar_products`, tandis que les boucles 2 et
        -- 4 testent `<> 'product'` et SAUTAIENT l'item. Résultat : la vente
        -- passait le guard mais le stock n'était JAMAIS décrémenté — du stock
        -- vendu sans être déduit, silencieusement.
        --
        -- Deux logiques opposées (liste blanche ici, liste noire là) ne
        -- coïncident que sur les valeurs connues. On refuse donc tout ce qui
        -- n'est pas explicitement prévu — même motif que le garde de rôle
        -- ci-dessus, et pour la même raison.
        IF v_item_type NOT IN ('product', 'dish') THEN
            RAISE EXCEPTION 'PRICE_ERROR:Type d''article inconnu : %', v_item_type;
        END IF;
        v_product_id          := (v_item->>'product_id')::UUID;
        v_dish_id             := (v_item->>'dish_id')::UUID;
        v_quantity            := (v_item->>'quantity')::INT;
        v_unit_price          := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
        v_total_price         := COALESCE((v_item->>'total_price')::NUMERIC, 0);
        v_discount_amount     := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, v_unit_price);

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'PRICE_ERROR:Quantité invalide pour le produit %',
                COALESCE(v_product_id, v_dish_id);
        END IF;

        -- ⭐⭐ Prix catalogue réel (seul chiffre non falsifiable côté serveur).
        -- Deux branches EXPLICITES, jamais un guard « unifié » paramétré : le
        -- §15.5 impose de DUPLIQUER plutôt que de généraliser, « sinon
        -- quelqu'un factorisera et touchera au guard des boissons ».
        -- ⚠️ Le chemin BOISSON ci-dessous est INCHANGÉ, ligne pour ligne.
        IF v_item_type = 'dish' THEN
            -- ⚠️ Un item déclaré `dish` DOIT porter un `dish_id`. Sans ce
            -- contrôle, le SELECT ci-dessous chercherait `id = NULL`, ne
            -- trouverait rien, et lèverait « Plat <NULL> introuvable » — un
            -- message dont on ne peut RIEN déduire.
            -- ⭐ Le chemin boisson a le même trou, mais il est PRÉEXISTANT :
            -- le corriger sortirait du périmètre de cette migration, qui doit
            -- laisser le chemin boisson strictement inchangé.
            IF v_dish_id IS NULL THEN
                RAISE EXCEPTION 'PRICE_ERROR:Item de type plat sans dish_id';
            END IF;

            -- ⚠️ `name` et non `display_name` : `dishes` n'a pas de catalogue
            -- global, donc pas de nom local à surcharger.
            SELECT price, name INTO v_catalog_price, v_product_name
            FROM public.dishes
            WHERE id = v_dish_id AND bar_id = p_bar_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'PRICE_ERROR:Plat % introuvable dans ce bar', v_dish_id;
            END IF;
        ELSE
            SELECT price, display_name INTO v_catalog_price, v_product_name
            FROM public.bar_products
            WHERE id = v_product_id AND bar_id = p_bar_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'PRICE_ERROR:Produit % introuvable dans ce bar', v_product_id;
            END IF;
        END IF;

        -- (a) Le prix annoncé ne peut pas DÉPASSER le prix catalogue.
        --     ⚠️ On tolère original_unit_price <= v_catalog_price (et non ==) :
        --     le prix catalogue peut avoir CHANGÉ entre la capture du panier
        --     et l'enregistrement (mode offline : SyncManager rejoue une vente
        --     figée à l'ancien prix ; ou baisse de prix par le gérant). Rejeter
        --     sur <> casserait ces ventes offline LÉGITIMES (régression terrain).
        --     Le vecteur de fraude visé est le prix GONFLÉ (au-dessus du
        --     catalogue) — un prix inférieur/égal est toujours acceptable.
        --     Tolérance 1 CFA pour absorber les arrondis.
        IF v_original_unit_price > (v_catalog_price + 1) THEN
            RAISE EXCEPTION 'PRICE_ERROR:Prix supérieur au catalogue pour "%" (catalogue: %, reçu: %)',
                COALESCE(v_product_name, v_product_id::TEXT, v_dish_id::TEXT), v_catalog_price, v_original_unit_price;
        END IF;

        -- (b) et (c) : invariants INTERNES à l'item (indépendants du prix
        --     catalogue ACTUEL — basés sur original_unit_price réellement
        --     pratiqué, qui peut être un ancien prix légitime en offline).
        --     Ces deux vérifs sont donc insensibles aux changements de prix.

        -- (b) ⭐ RESTAURÉ STRICT 2026-07-04 : la remise (totale de ligne) ne
        --     peut dépasser 100% du prix ligne NI être négative. La tolérance
        --     négative (majoration) a été retirée avec la fonctionnalité
        --     'majoration_produit' — une majoration de prix sera une feature
        --     dédiée séparée qui n'utilisera pas ce chemin.
        IF v_discount_amount < 0 OR v_discount_amount > (v_original_unit_price * v_quantity) THEN
            RAISE EXCEPTION 'PRICE_ERROR:Remise invalide pour "%" (remise: %, max: %)',
                COALESCE(v_product_name, v_product_id::TEXT, v_dish_id::TEXT), v_discount_amount, (v_original_unit_price * v_quantity);
        END IF;

        -- (c) Cohérence du total : total_price ≈ (prix_pratiqué*qté) - remise,
        --     tolérance 1 CFA/ligne pour absorber les ROUND() des promos %.
        v_expected_total := (v_original_unit_price * v_quantity) - v_discount_amount;
        IF ABS(v_total_price - v_expected_total) > 1 THEN
            RAISE EXCEPTION 'PRICE_ERROR:Total incohérent pour "%" (attendu: %, reçu: %)',
                COALESCE(v_product_name, v_product_id::TEXT, v_dish_id::TEXT), v_expected_total, v_total_price;
        END IF;
    END LOOP;

    -- 🛡️ STOCK CHECK : Verrouiller et vérifier la disponibilité (inchangé)
    IF p_status = 'validated' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            -- ⭐ Un PLAT n'a pas de stock : sa matière est décrémentée en
            -- ingrédients au passage à `ready` (§6), jamais ici.
            -- ⚠️ Sans ce CONTINUE, le SELECT ci-dessous ne trouverait rien et
            -- lèverait STOCK_ERROR — la vente entière échouerait.
            CONTINUE WHEN COALESCE(v_item->>'item_type', 'product') <> 'product';

            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INT;

            SELECT stock, display_name INTO v_current_stock, v_product_name
            FROM public.bar_products
            WHERE id = v_product_id AND bar_id = p_bar_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'STOCK_ERROR:Produit % introuvable dans ce bar', v_product_id;
            END IF;

            IF v_current_stock < v_quantity THEN
                RAISE EXCEPTION 'STOCK_ERROR:Stock insuffisant pour "%" (disponible: %, demandé: %)',
                    COALESCE(v_product_name, v_product_id::TEXT), v_current_stock, v_quantity;
            END IF;
        END LOOP;
    END IF;

    -- Calculer business_date (inchangé)
    v_business_date := COALESCE(
        p_business_date,
        (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
    );

    -- Calculer le total (inchangé — utilise total_price client, désormais
    -- garanti cohérent par le garde-fou ci-dessus)
    -- ⭐⭐ AUCUN FILTRE ICI — et c'est VOLONTAIRE.
    -- Le total de la vente inclut le prix des PLATS : c'est ce que le client
    -- paie. Filtrer produirait une vente dont le montant serait inférieur à
    -- l'addition réelle.
    -- ⚠️ Même raisonnement que compute_sale_items_count : tout lecteur d'items
    -- n'est PAS à filtrer. La question n'est pas « lit-il les items ? » mais
    -- « produit-il une donnée PRODUIT ? ».
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total_amount := v_total_amount + COALESCE((v_item->>'total_price')::NUMERIC, 0);
    END LOOP;

    -- Insérer la vente (inchangé)
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at,
        idempotency_key, ticket_id, source_return_id
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP,
        p_idempotency_key, p_ticket_id, p_source_return_id
    )
    RETURNING * INTO v_sale;

    -- ✨ Si c'est un échange, on lie aussi le retour à cette vente (inchangé)
    IF p_source_return_id IS NOT NULL THEN
        UPDATE public.returns
        SET linked_sale_id = v_sale.id
        WHERE id = p_source_return_id;
    END IF;

    -- Décrémenter stock et gérer promos
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- ⭐ Un PLAT ne décrémente aucun stock de boisson, et son éventuelle
        -- promotion n'est PAS tracée ici : `promotion_applications.product_id`
        -- n'a pas de FK, y écrire un dish_id créerait une ligne d'analytics
        -- pointant vers un produit inexistant (§15.2).
        -- ⚠️ Sans ce CONTINUE, l'UPDATE sur bar_products ne matcherait rien —
        -- silencieusement. Le bon comportement par accident n'est pas un
        -- comportement : il doit être EXPLICITE.
        CONTINUE WHEN COALESCE(v_item->>'item_type', 'product') <> 'product';

        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_promotion_id := (v_item->>'promotion_id')::UUID;
        v_discount_amount := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        -- ⭐ RESTAURÉ STRICT 2026-07-04 : ne tracer que les remises (discount
        --    > 0). Plus de majoration à tracer (fonctionnalité retirée).
        IF v_promotion_id IS NOT NULL AND v_discount_amount > 0 THEN
            INSERT INTO public.promotion_applications (
                bar_id, promotion_id, sale_id, product_id,
                quantity_sold, original_price, discounted_price, discount_amount,
                applied_at, applied_by, business_date
            ) VALUES (
                p_bar_id, v_promotion_id, v_sale.id, v_product_id,
                v_quantity, v_original_unit_price, v_unit_price, v_discount_amount,
                CURRENT_TIMESTAMP, p_sold_by, v_business_date
            );
        END IF;

        IF p_status = 'validated' THEN
            UPDATE public.bar_products
            SET stock = stock - v_quantity
            WHERE id = v_product_id AND bar_id = p_bar_id;
        END IF;
    END LOOP;

    RETURN v_sale;
END;
$function$;

COMMENT ON FUNCTION public.create_sale_idempotent IS
  'Cree une vente de maniere idempotente. Support Magic Swap via p_source_return_id. '
  'Accepte les PLATS depuis le 04/08/2026 : item_type=''dish'' + dish_id, product_id absent. '
  'Price guard ETENDU (§15.5) - deux branches explicites, le chemin boisson inchange. '
  'Stock et promotions sautes pour un plat ; le TOTAL, lui, inclut son prix.';

-- CREATE OR REPLACE PERD LES GRANTS. Sans ces trois lignes, `authenticated`
-- perdrait le droit d'execution et TOUTES LES VENTES DU PARC casseraient
-- - lecon des vagues de durcissement RPC.
REVOKE ALL ON FUNCTION public.create_sale_idempotent(uuid,jsonb,text,uuid,text,uuid,text,text,text,text,date,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(uuid,jsonb,text,uuid,text,uuid,text,text,text,text,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(uuid,jsonb,text,uuid,text,uuid,text,text,text,text,date,uuid,uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- +---------------------------------------------------------------+
-- | POST-VOL                                                       |
-- +---------------------------------------------------------------+
--
-- 1) CRITIQUE — les privileges sont RESTAURES (comparer au pre-vol 1) :
--
--    SELECT p.prosecdef AS security_definer, p.proconfig AS config,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--    -- ATTENDU : true | {search_path=public, extensions} | true | FALSE | true
--    -- STOP auth_exec = false : TOUTES LES VENTES SONT CASSEES. Rejouer le GRANT.
--    -- STOP anon_exec = true  : breche - un SECURITY DEFINER expose sans auth.
--    -- STOP config sans 'extensions' : le search_path a perdu un schema.
--
-- 2) Les 4 boucles, les 2 CONTINUE et la branche plat sont en place :
--
--    SELECT
--      (length(pg_get_functiondef(p.oid))
--       - length(replace(pg_get_functiondef(p.oid), 'jsonb_array_elements(p_items)', ''))) / 29 AS nb_boucles,
--      (length(pg_get_functiondef(p.oid))
--       - length(replace(pg_get_functiondef(p.oid), 'CONTINUE WHEN', ''))) / 13 AS nb_continue,
--      pg_get_functiondef(p.oid) LIKE '%FROM public.dishes%' AS price_guard_plat
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--    -- ATTENDU : 4 | 2 | true
--
-- 3) Aucune donnee touchee (comparer au pre-vol 3) :
--
--    SELECT count(*) AS nb_ventes FROM public.sales;
--    -- ATTENDU : identique au pre-vol.
--
-- TESTS FONCTIONNELS — depuis l'APPLICATION, AVANT reouverture du service.
--    Le SQL Editor a auth.uid() = NULL : la fonction y refuserait tout.
--
-- [ ] 4a. LE PLUS IMPORTANT — enregistrer une VENTE DE BOISSON normale.
--         C'est la non-regression du parc entier. Si elle echoue, ROLLBACK
--         IMMEDIAT (reappliquer 20260731120000 + les GRANT).
-- [ ] 4b. Une vente avec PROMOTION -> promotion_applications alimentee.
-- [ ] 4c. Une vente en statut `pending` -> pas de decrement de stock.
-- [ ] 4d. Un produit au prix GONFLE -> PRICE_ERROR (le guard boisson vit).
-- [ ] 4e. Rejouer la MEME idempotency_key -> la vente existante est retournee.
--
-- +---------------------------------------------------------------+
-- | INVARIANCE DES BARS PURS — §3                                  |
-- +---------------------------------------------------------------+
--
-- Garantie par le COALESCE, pas par une condition sur le bar.
--    Un bar pur ne vend que des produits : COALESCE(item_type, 'product')
--    vaut toujours 'product', les CONTINUE ne se declenchent JAMAIS, et le
--    price guard emprunte la branche boisson - inchangee ligne pour ligne.
--    Cout ajoute : une comparaison de chaine par item, sur une valeur deja en
--    memoire. Aucune requete, aucun cout mesurable.
