-- ===================================================================
-- MIGRATION: create_sale_idempotent — guard rôle en LISTE BLANCHE
-- DATE: 2026-07-31
-- AUTHOR: AI Assistant
-- PHASE: Pré-0 du module restauration (docs/roadmaps/PLAN_MODULE_RESTAURATION.md §13.16)
-- ===================================================================
--
-- ✅✅ STATUT : APPLIQUÉE EN PRODUCTION le 02/08/2026 (dimanche matin, hors service).
--
--    Reportée du 31/07 (vendredi soir) : ce RPC porte TOUTES les ventes, on ne le
--    touche pas pendant le service. Appliquée dimanche matin, bars fermés.
--
--    ✅ PRÉ-VOL VALIDÉ (31/07, re-contrôle du 02/08) :
--       (1) 1 seule version, oid 195621, prosecdef = true
--       (2) anon=false, authenticated=true, service_role=true
--       (3) corps déployé = 20260704073000 (garde-fou prix + STOCK CHECK)
--       (4) rôles actifs = promoteur, serveur, super_admin, gerant
--
--    ✅ POST-VOL CERTIFIÉ (02/08) — les 4 contrôles conformes :
--       (1) ⭐ grants INTACTS : anon=false, auth_role=true, svc=true
--           → identiques au pré-vol, le REVOKE/GRANT a bien compensé la perte
--             de privilèges du CREATE OR REPLACE (pas de brèche anon)
--       (2) nb_versions = 1 · prosecdef = true · search_path=public, extensions
--       (3) guard_ok = true → la liste blanche est bien celle qui tourne
--       (4) rôles actifs inchangés → aucune vente légitime ne peut être refusée
--
--    ⏭ RESTE : smoke-tests par l'UI (checklist en bas de fichier). Le guard n'est
--      PAS observable en SQL Editor (auth.uid() y vaut NULL, bloc court-circuité).
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘

-- PROBLEM:
--   Le guard rôle de create_sale_idempotent est une LISTE NOIRE : il ne bloque
--   que le couple (operatingMode='simplified', role='serveur'). Tout autre rôle
--   — y compris un rôle qui n'existe pas encore — peut créer une vente.
--
--   Le module restauration ajoute le rôle 'cuisinier', qui ne doit JAMAIS vendre
--   (MATRICE_RBAC_CUISINIER.md §2, permission canSell = false ; la vente naît du
--   `serve` effectué par le serveur, cf. §6.1 du plan).
--
--   ⚠ Aggravant : §13.4 impose le MODE COMPLET pour activer la restauration. Un
--   bar avec cuisine est donc TOUJOURS dans la branche non couverte par le guard
--   actuel. Ce n'est pas un cas limite, c'est le cas nominal.
--
--   Sans ce correctif, ajouter 'cuisinier' à la contrainte CHECK ouvrirait
--   immédiatement une escalade de privilège : un cuisinier pourrait appeler le
--   RPC directement et créer une vente valide.

-- IMPACT:
--   Tous les bars. AUCUN changement de comportement pour les 4 rôles actuels
--   (super_admin, promoteur, gerant, serveur) — voir TESTING CHECKLIST.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TECHNICAL SOLUTION                                              │
-- └─────────────────────────────────────────────────────────────────┘

-- SOLUTION:
--   Ajouter un contrôle en LISTE BLANCHE avant le contrôle de mode existant :
--   seuls les rôles explicitement autorisés à vendre passent. Tout rôle inconnu
--   ou futur est refusé PAR DÉFAUT.

-- APPROACH:
--   ⭐ Ordre imposé par §13.16 : nettoyer les décisions par rôle brut AVANT
--   d'ajouter le rôle 'cuisinier'. Cette migration ne mentionne donc PAS
--   'cuisinier' — elle durcit le RPC pendant que le rôle n'existe pas encore.
--   Le jour où la valeur devient légale (phase 0), le RPC la refuse DÉJÀ, sans
--   migration supplémentaire ni fenêtre de vulnérabilité.
--
--   Le principe : une liste noire doit être mise à jour à chaque ajout de rôle
--   (et sera oubliée) ; une liste blanche est sûre par construction.

-- BREAKING_CHANGE: NO
--   Additif et rétrocompatible. Les 4 rôles actuels figurent tous dans la liste
--   blanche, donc aucun appel légitime existant n'est refusé. Le bypass
--   service_role (SyncManager, migrations, tests) est INCHANGÉ.

-- ROLLBACK_STRATEGY:
--   Rejouer supabase/migrations/20260704073000_restore_strict_price_guard.sql
--   qui contient le corps immédiatement antérieur (avec ses REVOKE/GRANT).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ AFFECTED COMPONENTS                                             │
-- └─────────────────────────────────────────────────────────────────┘

-- TABLES_MODIFIED: aucune
-- VIEWS_AFFECTED:  aucune
-- RLS_CHANGES:     aucune
-- FUNCTIONS_MODIFIED: public.create_sale_idempotent (CREATE OR REPLACE)

-- ⚠ CERTIFICATION AVANT ÉCRITURE (même discipline que 20260704073000) :
--   - Corps ci-dessous = copie EXACTE de 20260704073000_restore_strict_price_guard.sql,
--     vérifiée comme étant la dernière des 9 migrations qui font CREATE OR REPLACE
--     sur cette fonction (grep exhaustif du 31/07/2026).
--   - SEULES LIGNES AJOUTÉES : le bloc « GUARD RÔLE — LISTE BLANCHE » (7 lignes)
--     dans la section SECURITY CHECK. Tout le reste est identique au caractère près :
--     garde-fou prix (a)(b)(c), STOCK CHECK, idempotence, promotions, Magic Swap.
--   - REVOKE PUBLIC + GRANT rétablis en fin : un CREATE OR REPLACE dans cette base
--     PERD les grants (proacl NULL = brèche anon). Post-vol obligatoire ci-dessous.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT, dans le SQL Editor                  │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠ Les migrations s'exécutent À LA MAIN dans le SQL Editor Supabase (jamais db push).
--
-- 1) Une seule version de la fonction doit exister (sinon overload = ambiguïté) :
--
--    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ATTENDU : exactement 1 ligne, prosecdef = true
--
-- 2) Capturer les privilèges AVANT (à comparer au post-vol) :
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ATTENDU : anon = false, auth_role = true, svc = true
--
-- 3) Archiver le corps actuel (filet de rollback réel) :
--
--    SELECT pg_get_functiondef(p.oid)
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--
-- 4) Vérifier qu'aucun rôle hors liste blanche n'existe déjà en base :
--
--    SELECT DISTINCT role FROM public.bar_members WHERE is_active = true;
--    -- ATTENDU : uniquement super_admin / promoteur / gerant / serveur.
--    -- ⛔ Si une autre valeur apparaît, NE PAS APPLIQUER : des ventes légitimes
--    --    seraient refusées. Traiter ce rôle d'abord.

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
        v_product_id          := (v_item->>'product_id')::UUID;
        v_quantity            := (v_item->>'quantity')::INT;
        v_unit_price          := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
        v_total_price         := COALESCE((v_item->>'total_price')::NUMERIC, 0);
        v_discount_amount     := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, v_unit_price);

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'PRICE_ERROR:Quantité invalide pour le produit %', v_product_id;
        END IF;

        -- Prix catalogue réel (seul chiffre non falsifiable côté serveur)
        SELECT price, display_name INTO v_catalog_price, v_product_name
        FROM public.bar_products
        WHERE id = v_product_id AND bar_id = p_bar_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRICE_ERROR:Produit % introuvable dans ce bar', v_product_id;
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
                COALESCE(v_product_name, v_product_id::TEXT), v_catalog_price, v_original_unit_price;
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
                COALESCE(v_product_name, v_product_id::TEXT), v_discount_amount, (v_original_unit_price * v_quantity);
        END IF;

        -- (c) Cohérence du total : total_price ≈ (prix_pratiqué*qté) - remise,
        --     tolérance 1 CFA/ligne pour absorber les ROUND() des promos %.
        v_expected_total := (v_original_unit_price * v_quantity) - v_discount_amount;
        IF ABS(v_total_price - v_expected_total) > 1 THEN
            RAISE EXCEPTION 'PRICE_ERROR:Total incohérent pour "%" (attendu: %, reçu: %)',
                COALESCE(v_product_name, v_product_id::TEXT), v_expected_total, v_total_price;
        END IF;
    END LOOP;

    -- 🛡️ STOCK CHECK : Verrouiller et vérifier la disponibilité (inchangé)
    IF p_status = 'validated' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
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
  'Crée une vente de manière idempotente. Support Magic Swap via p_source_return_id. '
  'Guard rôle en LISTE BLANCHE (super_admin/promoteur/gerant/serveur) : tout rôle non '
  'listé — dont cuisinier — est refusé par défaut. Garde-fou prix strict + stock check.';

-- ⚠️ OBLIGATOIRE : rétablir les privilèges explicites (proacl NULL = anon).
REVOKE ALL ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter APRÈS, dans le SQL Editor                 │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) ⚠ CRITIQUE — les grants ont-ils survécu au CREATE OR REPLACE ?
--    Doit être IDENTIQUE au pré-vol (2) : anon=false, auth_role=true, svc=true.
--
--    SELECT has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ⛔ Si anon = true : BRÈCHE. Rejouer le bloc REVOKE/GRANT ci-dessus.
--
-- 2) Toujours une seule version, toujours SECURITY DEFINER + search_path :
--
--    SELECT count(*) AS nb_versions FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ATTENDU : 1
--
--    SELECT p.prosecdef, p.proconfig FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ATTENDU : prosecdef = true, proconfig contient search_path=public,extensions
--
-- 3) La liste blanche est bien présente dans le corps déployé :
--
--    SELECT pg_get_functiondef(p.oid) LIKE '%is not allowed to create sales%' AS guard_ok
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';
--    -- ATTENDU : true
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ TESTING CHECKLIST — smoke-tests PAR L'UI                        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠ auth.uid() vaut NULL dans le SQL Editor : le guard ne peut PAS y être testé
--   (le bloc entier est court-circuité). Ces tests se font avec de vrais comptes.
--
-- ☐ Serveur, mode COMPLET   → vente créée (statut pending)          [inchangé]
-- ☐ Serveur, mode SIMPLIFIÉ → refus « cannot create sales in simplified mode » [inchangé]
-- ☐ Gérant, mode complet    → vente créée (statut validated)        [inchangé]
-- ☐ Gérant, mode simplifié  → vente créée                           [inchangé]
-- ☐ Promoteur               → vente créée                           [inchangé]
-- ☐ Vente offline rejouée par SyncManager → OK (bypass service_role) [inchangé]
-- ☐ Magic Swap (échange produit) → retour lié à la vente            [inchangé]
-- ☐ Garde-fou prix : prix gonflé → PRICE_ERROR                      [inchangé]
-- ☐ Stock insuffisant → STOCK_ERROR                                 [inchangé]
--
-- ⭐ Le seul comportement NOUVEAU n'est pas testable aujourd'hui : un rôle hors
--    liste blanche est refusé. Il le deviendra en phase 0, avec un compte
--    'cuisinier' réel — c'est le test « le cuisinier ne peut pas vendre »
--    (MATRICE_RBAC_CUISINIER.md §8).
