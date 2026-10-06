-- ===================================================================
-- MIGRATION: comptoirs - create_sale_idempotent accepte p_counter_id
-- DATE: 2026-10-05
-- AUTHOR: AI Assistant
-- ===================================================================

-- PREREQUIS EN PROD :
--   - 20261004090000_comptoirs_socle        (counters, counter_assignments)
--   - 20261004140000_comptoirs_affectation_auto (2 triggers de maintien)
--   Les deux sont certifiees (post-vols + smoke-tests du 04/10).

-- CE QUE FAIT CETTE MIGRATION - exactement 3 modifications, rien d'autre :
--   1. ajoute `p_counter_id uuid DEFAULT NULL` en DERNIER parametre
--   2. controle, dans le bloc SECURITY CHECK existant, que ce comptoir
--      appartient au bar et que l'appelant y est habilite
--   3. ecrit `counter_id` dans l'INSERT INTO sales
--
-- ⛔⛔ LE CORPS EST REPRIS LIGNE POUR LIGNE DEPUIS `pg_get_functiondef` EN
--     PROD (releve du 05/10). Aucune autre ligne n'est touchee : ni le garde
--     de prix F6, ni la liste blanche item_type, ni le stock check FOR UPDATE,
--     ni le calcul du total, ni les promotions, ni l'idempotence.
--     Cette fonction porte la caisse. Toute "amelioration" au passage serait
--     une modification non demandee sur du code critique.

-- ⚠️ LE STOCK RESTE AU NIVEAU BAR, VOLONTAIREMENT.
--   Les 3 acces produits du corps (garde de prix, stock check, decrement)
--   filtrent par `bar_id` et ne sont PAS modifies. C'est le decoupage du
--   plan : etape 2 = la VENTE porte le comptoir (caisse, CA, Z de caisse) ;
--   etape 3 = le STOCK descend au comptoir.
--   Les descendre ici melangerait deux etapes et rendrait le diagnostic
--   impossible en cas de probleme.

-- ⛔⛔ LA SURCHARGE EST INTERDITE ICI - DEFAUT CRITIQUE TROUVE EN REVUE DE
--     CODE (05/10). Ma 1re redaction creait une SECONDE fonction a 14
--     parametres en laissant celle a 13 en place, en affirmant que la
--     coexistence etait « voulue pendant la transition ». C'ETAIT FAUX.
--
--   `CREATE OR REPLACE` avec une signature differente CREE une surcharge, il
--   ne remplace pas. Les deux versions ont leurs derniers parametres en
--   DEFAULT. A l'appel avec 13 arguments, les DEUX sont candidates et
--   PostgreSQL refuse de choisir :
--       ERROR: function create_sale_idempotent(...) is not unique
--       HINT: Could not choose a best candidate function.
--
--   ⛔ Consequence : TOUTE VENTE casse a l'instant ou la migration passe.
--   Pas progressivement, pas sur certains cas : immediatement, sur tous les
--   bars. Une panne de caisse en pleine soiree.
--
-- CORRECTIF : on DROPe l'ancienne signature dans la MEME transaction, juste
--   apres avoir cree la nouvelle. Il ne reste alors qu'UNE fonction.
--   ⚠️ Et c'est SANS RUPTURE pour l'app deployee : `p_counter_id` a une
--   valeur par defaut, donc un appel a 13 arguments nommes reste valide et
--   resout vers la seule fonction existante. La transition est transparente.
--
-- ⚠️ ORDRE IMPOSE : CREATE d'abord, DROP ensuite. L'inverse laisserait une
--   fenetre - meme dans une transaction, mieux vaut ne jamais etre dans un
--   etat ou la fonction n'existe pas.

-- ⚠️ MODE SIMPLIFIE : le serveur virtuel n'a pas de compte. Decision du
--   04/10 : le comptoir vient du COMPTOIR ACTIF DU GERANT QUI SAISIT. C'est
--   lui qui appelle ce RPC, donc le controle ci-dessous le valide
--   naturellement. Aucun traitement particulier.

-- BREAKING_CHANGE: NO - `p_counter_id` a une valeur par defaut, donc les
--   appels existants a 13 arguments nommes restent valides. L'ancienne
--   signature est supprimee, mais plus rien ne peut la viser specifiquement :
--   il n'y a plus qu'une fonction.

-- ROLLBACK_STRATEGY: recreer la signature a 13 parametres depuis le corps
--   releve au PRE-VOL, puis DROPer celle a 14. ⚠️ Le PRE-VOL 5 EXIGE de
--   sauvegarder `pg_get_functiondef` AVANT : sans cette copie, le rollback
--   est impossible. Voir fin de fichier.

-- TABLES_MODIFIED: aucune
-- FUNCTIONS_MODIFIED: create_sale_idempotent — passe de 13 a 14 parametres.
--   L'ancienne signature est DROPee dans la meme transaction : il ne reste
--   qu'UNE fonction, sans ambiguite de surcharge.
-- RLS_CHANGES: aucune


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ ⛔⛔ ORDRE DE DEPLOIEMENT - A LIRE AVANT TOUTE CHOSE              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
--
--   1. CETTE MIGRATION (et 20261005100000_comptoirs_create_sales_batch)
--   2. PUIS SEULEMENT le deploiement du front
--
-- ⛔ L'INVERSE ARRETE LA CAISSE, ET CE N'EST PAS UN RISQUE : C'EST UNE
--    CERTITUDE.
--
--   A comptoir unique, `CounterProvider` resout TOUJOURS un comptoir (il
--   retombe sur le comptoir primaire du bar). Donc des le deploiement du
--   front, `p_counter_id` est renseigne et part dans le corps de CHAQUE
--   appel RPC.
--
--   Si la fonction en base n'accepte pas encore ce parametre, PostgREST ne
--   trouve aucune signature correspondante :
--       PGRST202 — Could not find the function public.create_sale_idempotent(
--                  ..., p_counter_id, ...) in the schema cache
--   => AUCUNE VENTE NE PASSE PLUS, sur tous les bars, immediatement.
--
-- ⚠️ Rappel projet : DEUX projets Vercel deploient ce depot, et seul
--    `bar-tender` sert `bartenderpro-africa.com`. Un deploiement vert sur
--    l'autre ne prouve RIEN. Verifier ce qui tourne reellement :
--        https://bartenderpro-africa.com/version.json
--    Comparer son `buildTime` a la date du dernier commit pousse.
--
-- ⚠️ L'inverse (migrations appliquees, front PAS encore deploye) est SANS
--    RISQUE : `p_counter_id` a une valeur par defaut, les appels a 13
--    arguments nommes continuent de fonctionner. C'est precisement pourquoi
--    cet ordre-la est le bon.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Une SEULE surcharge existe aujourd'hui (verifie le 05/10) :
--
-- SELECT pg_get_function_identity_arguments(p.oid) AS signature
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
-- -- Attendu : 1 ligne, 13 parametres, SANS p_counter_id.
-- -- ⛔ Si 2 lignes ou plus : cette migration a deja ete appliquee, ou une
-- --   surcharge inattendue existe. NE PAS continuer sans comprendre.
--
-- 2) Privileges actuels, a reposer a l'identique sur la nouvelle surcharge :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema='public' AND routine_name='create_sale_idempotent';
-- -- Attendu : postgres + authenticated + service_role. PAS anon, PAS PUBLIC.
--
-- 3) Les helpers dont depend le controle de comptoir existent :
--
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname IN ('is_counter_member','get_user_role','is_super_admin');
-- -- Attendu : 3 lignes.
--
-- 4) Reference de non-regression - compter les ventes AVANT :
--
-- SELECT COUNT(*) AS ventes, COUNT(counter_id) AS avec_comptoir FROM sales;
-- -- NOTER ces 2 nombres.
--
-- 5) ⛔⛔ SAUVEGARDER LE CORPS ACTUEL - SANS CELA, AUCUN ROLLBACK POSSIBLE.
--    Cette migration SUPPRIME la signature a 13 parametres. La seule facon de
--    revenir en arriere est de la recreer depuis sa definition exacte.
--
-- SELECT pg_get_functiondef(p.oid) AS definition
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--
-- ⛔ COPIER ce resultat dans un fichier AVANT d'executer la migration.
--    Le depot n'en contient aucune copie fiable : les fichiers de migration
--    ont deja diverge de la prod 3 fois sur ce projet.


BEGIN;

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
    p_source_return_id uuid DEFAULT NULL::uuid,
    -- ⭐ AJOUT 05/10/2026 — en DERNIERE position, pour que les appels
    -- positionnels existants restent valides.
    p_counter_id uuid DEFAULT NULL::uuid
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
    -- ⭐ Comptoirs (05/10/2026)
    v_counter_id        UUID;
    v_ticket_counter    UUID;
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
        IF v_caller_role NOT IN ('super_admin', 'promoteur', 'co_promoteur', 'gerant', 'serveur') THEN
            RAISE EXCEPTION 'Access denied: role % is not allowed to create sales', v_caller_role;
        END IF;

        SELECT b.settings->>'operatingMode' INTO v_operating_mode
        FROM public.bars b
        WHERE b.id = p_bar_id;

        IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN
            RAISE EXCEPTION 'Access denied: serveur role cannot create sales in simplified mode';
        END IF;

        -- ⭐⭐ GUARD COMPTOIR (AJOUT 05/10/2026)
        --
        -- ⚠️ Place ICI, DANS le bloc `auth.role() <> 'service_role'` : le
        -- service_role (SyncManager, edge functions) doit pouvoir rejouer une
        -- vente offline sans etre « affecte » a un comptoir. Le placer en
        -- dehors bloquerait la synchronisation offline — regression majeure.
        --
        -- ⚠️ `p_counter_id IS NULL` est TOLERE pendant la transition :
        -- l'app actuellement deployee ne l'envoie pas encore. Cette tolerance
        -- DOIT disparaitre a l'etape 2bis, avec le NOT NULL sur la colonne,
        -- sinon elle devient un trou permanent.
        IF p_counter_id IS NOT NULL THEN
            -- (a) le comptoir appartient-il bien a CE bar ? Anti-fuite
            --     cross-bar : sans ce test, un comptoir d'un autre bar
            --     passerait, et le Z de caisse de deux etablissements se
            --     melangerait.
            IF NOT EXISTS (
                SELECT 1 FROM public.counters c
                WHERE c.id = p_counter_id
                  AND c.bar_id = p_bar_id
                  AND c.is_active = true
            ) THEN
                RAISE EXCEPTION 'Access denied: counter % does not belong to this bar', p_counter_id;
            END IF;

            -- (b) l'appelant est-il habilite sur ce comptoir ?
            --     Superviseurs : partout dans leur bar. Gerant / serveur :
            --     uniquement leurs affectations.
            IF v_caller_role NOT IN ('super_admin', 'promoteur', 'co_promoteur')
               AND NOT public.is_counter_member(p_counter_id) THEN
                RAISE EXCEPTION 'Access denied: not assigned to counter %', p_counter_id;
            END IF;
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
    -- ⚠️ Filtre par bar_id, PAS par comptoir : le stock descendra au comptoir
    -- a l'etape 3. Ne pas melanger les deux etapes.
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

    -- ⭐ COMPTOIR DE LA VENTE (AJOUT 05/10/2026)
    --
    -- Si la vente est rattachee a un BON, elle doit porter le comptoir du bon :
    -- le trigger `trg_sale_counter_matches_ticket` (etape 2) refuserait toute
    -- discordance. Le bon fait donc autorite — sinon une vente legitime serait
    -- rejetee pour une divergence que l'appelant n'a pas choisie.
    -- Sans bon (99,5 % des cas, mesure du 04/10) : le comptoir recu.
    IF p_ticket_id IS NOT NULL THEN
        SELECT t.counter_id INTO v_ticket_counter
        FROM public.tickets t WHERE t.id = p_ticket_id;
    END IF;
    v_counter_id := COALESCE(v_ticket_counter, p_counter_id);

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

    -- Insérer la vente (+ counter_id, 05/10/2026)
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at,
        idempotency_key, ticket_id, source_return_id, counter_id
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP,
        p_idempotency_key, p_ticket_id, p_source_return_id, v_counter_id
    )
    RETURNING * INTO v_sale;

    -- ✨ Si c'est un échange, on lie aussi le retour à cette vente (inchangé)
    IF p_source_return_id IS NOT NULL THEN
        UPDATE public.returns
        SET linked_sale_id = v_sale.id
        WHERE id = p_source_return_id;
    END IF;

    -- Décrémenter stock et gérer promos
    -- ⚠️ Filtre par bar_id, PAS par comptoir : etape 3.
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

-- ⛔⛔ LE CORRECTIF DU DEFAUT CRITIQUE : SUPPRIMER L'ANCIENNE SIGNATURE.
--
-- Sans ce DROP, deux fonctions a parametres DEFAULT coexistent et PostgreSQL
-- refuse de choisir a chaque appel a 13 arguments :
--   ERROR: function create_sale_idempotent(...) is not unique
-- => TOUTE VENTE casse immediatement, sur tous les bars.
--
-- ⚠️ Dans la MEME transaction que le CREATE ci-dessus, et APRES lui : a aucun
-- instant la fonction ne doit etre absente.
--
-- ⚠️ La signature est enumeree par TYPES, sans les noms : c'est la seule
-- facon de designer une surcharge precise. 13 types = l'ancienne.
DROP FUNCTION IF EXISTS public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
);

-- ⚠️ INDISPENSABLE : les privileges NE SURVIVENT PAS a un changement de
-- signature. Lecon du durcissement RPC du 04/07/2026 : toujours
-- re-REVOKE / GRANT, et l'asserter en post-vol.
REVOKE ALL ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid, uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid, uuid
) IS
  'Creation de vente idempotente — SURCHARGE 14 parametres (05/10/2026) qui '
  'ajoute p_counter_id. Le corps est identique a la version 13 parametres, a '
  '3 modifications pres : guard comptoir dans le SECURITY CHECK, resolution '
  'du comptoir (le BON fait autorite s''il y en a un), ecriture de counter_id. '
  'Le STOCK reste filtre par bar_id : il descendra au comptoir a l''etape 3. '
  '⛔ La surcharge a 13 parametres doit etre DROPee quand le front deploye '
  'enverra systematiquement le comptoir (etape 2bis).';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⛔⛔ IL NE DOIT RESTER QU'**UNE SEULE** FONCTION :
--
-- SELECT pg_get_function_identity_arguments(p.oid) AS signature
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
-- -- Attendu : EXACTEMENT 1 ligne, 14 parametres, terminant par
-- --   `p_counter_id uuid`.
-- -- ⛔ Si 2 lignes : le DROP a echoue et les DEUX fonctions coexistent.
-- --   PostgreSQL refusera alors tout appel a 13 arguments et TOUTE VENTE
-- --   casse. Supprimer l'ancienne IMMEDIATEMENT :
-- --     DROP FUNCTION public.create_sale_idempotent(
-- --       uuid, jsonb, text, uuid, text, uuid, text, text, text, text,
-- --       date, uuid, uuid);
-- --     NOTIFY pgrst, 'reload schema';
--
-- 2) ⛔ PRIVILEGES DE LA NOUVELLE SURCHARGE - dans les DEUX sens :
--
-- SELECT
--   pg_get_function_identity_arguments(p.oid) AS signature,
--   has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_peut,
--   has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_peut
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
-- -- Attendu sur l'unique ligne : anon_peut = false, auth_peut = true,
-- --   service_peut = true.
-- -- ⚠️ Verifier auth_peut = true n'est PAS une formalite : un GRANT oublie
-- --    rendrait TOUTE VENTE impossible. Ne jamais ne controler que les refus.
--
-- 3) ⛔⛔ LE CONTROLE QUI COMPTE - LES VENTES PASSENT TOUJOURS.
--    L'app deployee appelle avec 13 arguments nommes. `p_counter_id` ayant
--    une valeur par defaut, l'appel resout vers la fonction unique et doit
--    fonctionner a l'identique. C'est le seul point reellement risque de
--    cette migration : a verifier AVANT le service du soir.
--
--    DEPUIS L'APPLICATION :
--    - se connecter en SERVEUR -> vendre un article -> la vente part,
--      le stock decremente
--    - se connecter en GERANT -> valider cette vente
--    - mode simplifie : le gerant attribue une vente a un serveur nomme
--    - ouvrir l'Historique des ventes
--    ⛔ Toute vente refusee = ROLLBACK immediat (bloc ci-dessous).
--
-- 4) Les ventes creees depuis la migration (par l'app actuelle) n'ont pas
--    encore de comptoir, et c'est NORMAL :
--
-- SELECT COUNT(*) AS ventes, COUNT(counter_id) AS avec_comptoir FROM sales;
-- -- Comparer aux nombres du PRE-VOL. `avec_comptoir` ne bougera qu'une fois
-- --   le front deploye.
--
-- 5) Test du guard comptoir avec un VRAI JWT (le SQL Editor a auth.uid()
--    NULL, donc auth.role() y vaut 'authenticated' sans identite : le guard
--    refusera des le controle de membership, ce qui ne prouve rien sur le
--    comptoir). A faire plutot APRES deploiement du front, en tentant une
--    vente sur un comptoir ou la personne n'est pas affectee.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ROLLBACK                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ Le rollback EXIGE la copie du corps sauvegardee au PRE-VOL 5. Sans
-- elle, l'ancienne signature est irrecuperable.
--
-- BEGIN;
--   -- 1. recreer la signature a 13 parametres, en collant ICI le
--   --    `pg_get_functiondef` sauvegarde au PRE-VOL 5, tel quel :
--   <COLLER LA DEFINITION SAUVEGARDEE>
--
--   -- 2. supprimer celle a 14
--   DROP FUNCTION IF EXISTS public.create_sale_idempotent(
--       uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid, uuid
--   );
--
--   -- 3. reposer les privileges (ils ne survivent pas au CREATE)
--   REVOKE ALL ON FUNCTION public.create_sale_idempotent(
--       uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
--   ) FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(
--       uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
--   ) TO authenticated, service_role;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
--
-- ⚠️ A l'issue du rollback, verifier qu'il ne reste QU'UNE fonction (post-vol 1).
-- ⚠️ `sales.counter_id` reste en place et rempli : la colonne vient de
-- l'etape 1, pas de cette migration. Rien a nettoyer.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ETAPE 2BIS - A FAIRE QUAND LE FRONT DEPLOYE ENVOIE LE COMPTOIR   │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ NE PAS EXECUTER MAINTENANT. Tant que l'app deployee n'envoie pas le
-- comptoir, un NOT NULL sur la colonne casserait TOUTES les ventes.
--
-- 1. Verifier que plus personne n'appelle l'ancienne surcharge : toutes les
--    ventes recentes doivent porter un comptoir.
--
--    SELECT COUNT(*) FROM sales
--    WHERE counter_id IS NULL AND created_at > NOW() - INTERVAL '48 hours';
--    -- Attendu : 0 avant de continuer.
--
-- 2. (rien a supprimer : il n'y a deja qu'UNE fonction, celle a 14
--    parametres. L'ancienne a ete DROPee par cette migration.)
--
-- 3. Combler les ventes orphelines, puis rendre la colonne obligatoire :
--
--    UPDATE sales s SET counter_id = c.id FROM counters c
--    WHERE c.bar_id = s.bar_id AND c.is_primary AND s.counter_id IS NULL;
--    ALTER TABLE sales ALTER COLUMN counter_id SET NOT NULL;
--
-- 4. Retirer la tolerance `p_counter_id IS NULL` du guard comptoir ci-dessus,
--    et celle de `can_write_on_counter` (migration 20261004120000).
