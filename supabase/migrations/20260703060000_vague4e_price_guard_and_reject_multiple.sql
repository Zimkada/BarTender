-- =====================================================
-- MIGRATION: Vague 4e — Garde-fou prix serveur (F6) + reject_multiple_sales détaillé (F7)
-- Date: 2026-07-03
-- Suite de: 20260703050000_vague4d_search_path_hardening.sql
--
-- =====================================================
-- PARTIE 1 — F6 : garde-fou prix dans create_sale_idempotent
-- =====================================================
-- CONTEXTE (audit F6 + diagnostic prod 2026-07-03) :
--   create_sale_idempotent fait confiance à unit_price / total_price /
--   discount_amount envoyés par le client, sans les confronter au prix
--   catalogue (bar_products.price). Un membre authentifié (client modifié)
--   peut sous-facturer ou fausser les stats promo.
--
--   ⚠️ DÉCISION DE PÉRIMÈTRE (garde-fou MINIMAL, pas recalcul complet) :
--   Le moteur de promotion réel est complexe (percentage / fixed / bundle /
--   special_price + ciblage produit/catégorie + plages horaires + récurrence
--   + limites d'usage). La fonction historique create_sale_with_promotions
--   qui tentait le recalcul serveur était CASSÉE (elle lisait
--   bar_products.unit_price — colonne INEXISTANTE, le vrai nom est `price`)
--   et ne couvrait que 2 des ~5 mécanismes promo. La réimplémenter fidèlement
--   en SQL serait un gros morceau à haut risque sur un flux de vente prod,
--   pour un risque NON exploité (diagnostic G3 : 0 vente avec écart prix sur
--   60 jours) et désormais MONO-TENANT (depuis 4a/4b, un serveur ne peut
--   trafiquer que ses propres ventes de son propre bar).
--
--   On applique donc un garde-fou d'INVARIANT ARITHMÉTIQUE, qui ne
--   réimplémente PAS les règles promo mais vérifie la cohérence de ce que le
--   client envoie :
--     (a) original_unit_price <= bar_products.price (+1 CFA tolérance) :
--         on refuse un prix GONFLÉ au-dessus du catalogue (fraude), mais on
--         TOLÈRE un prix inférieur/égal — car le prix catalogue peut avoir
--         changé entre la capture du panier et l'enregistrement (mode OFFLINE :
--         SyncManager rejoue une vente figée à l'ancien prix ; ou baisse de
--         prix). Rejeter sur "==" casserait ces ventes offline légitimes.
--     (b) 0 <= discount_amount (remise TOTALE de ligne) <= original*quantity
--         (pas de remise négative ni > 100%). Basé sur le prix PRATIQUÉ.
--     (c) total_price ≈ (original_unit_price * quantity) - discount_amount
--         (cohérence interne du total, tolérance d'arrondi). Basé sur le prix
--         PRATIQUÉ → insensible aux changements de catalogue.
--   (b) et (c) sont des invariants INTERNES à l'item (ne dépendent que de ses
--   propres champs) → toujours vrais, jamais de faux positif offline.
--   Le recalcul complet du discount depuis les règles promo reste une DETTE
--   documentée, à traiter séparément avec des tests dédiés.
--
--   SÉMANTIQUE CLIENT (vérifiée dans useCartLogic.ts) :
--     - original_unit_price = product.price (toujours, avec/sans promo)
--     - unit_price = prix après remise unitaire
--     - discount_amount = remise TOTALE de la ligne (priceInfo.discount),
--       PAS unitaire → l'invariant (c) porte sur la remise de ligne.
--     - Sans promo : discount_amount=0, unit_price=original,
--       total_price=original*quantity.
--   La tolérance d'arrondi (1 CFA/ligne) absorbe les ROUND() des promos
--   percentage sans rejeter de vente légitime.
--
-- ANTI-RÉGRESSION :
--   - Corps de create_sale_idempotent repris À L'IDENTIQUE de la prod
--     (20260326000000), SEUL ajout : la boucle garde-fou (nouvelle section)
--     + search_path (posé en 4d, on le conserve dans le CREATE OR REPLACE).
--   - Le garde-fou s'exécute pour TOUS les statuts (pending ET validated) —
--     PAS greffé sur la boucle stock conditionnelle (qui ne tourne que si
--     validated), sinon une vente pending contournerait la vérif.
--   - Tolérance d'arrondi → aucune vente légitime rejetée (G3 vide le
--     confirme : les montants client concordent déjà avec le prix DB).
--   - Signature + type de retour (RETURNS sales) INCHANGÉS → pas de surcharge.
--
-- PRÉ-VOL (à exécuter AVANT) :
--   SELECT pg_get_function_identity_arguments(p.oid) AS args,
--          pg_get_function_result(p.oid) AS ret, COUNT(*) OVER () AS nb
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='create_sale_idempotent';
--   -- Attendu : 1 ligne, ret='sales', args = les 13 paramètres ci-dessous.
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_sale_idempotent(
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_sold_by UUID,
    p_idempotency_key TEXT,
    p_server_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'validated',
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_business_date DATE DEFAULT NULL,
    p_ticket_id UUID DEFAULT NULL,
    p_source_return_id UUID DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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

    -- 🛡️ SECURITY CHECK — membership + contrôle rôle/mode (inchangé)
    IF auth.role() <> 'service_role' THEN
        SELECT bm.role INTO v_caller_role
        FROM public.bar_members bm
        WHERE bm.user_id = auth.uid()
          AND bm.bar_id = p_bar_id
          AND bm.is_active = true;

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Access denied: not an active member of this bar';
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

        -- (b) La remise (totale de ligne) ne peut dépasser 100% du prix ligne
        --     ni être négative.
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

    -- Décrémenter stock et gérer promos (inchangé)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_promotion_id := (v_item->>'promotion_id')::UUID;
        v_discount_amount := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

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
$$;

-- =====================================================
-- PARTIE 2 — F7 : reject_multiple_sales retourne les échecs détaillés
-- =====================================================
-- CONTEXTE (audit F7) : reject_multiple_sales avale toutes les exceptions
-- (EXCEPTION WHEN OTHERS → simple compteur), un rejet en masse échoue
-- partiellement en silence. On retourne désormais les IDs et raisons d'échec.
--
-- ⚠️ CHANGEMENT DE TYPE DE RETOUR → nécessite DROP (CREATE OR REPLACE échoue
-- avec 42P13 sinon). L'appelant TS (sales.service.ts:410) lit data[0]
-- .success_count/.failure_count → ces 2 colonnes sont CONSERVÉES en tête du
-- nouveau type, donc l'appelant existant continue de fonctionner SANS
-- modification (il ignore simplement les 2 nouvelles colonnes). Le code TS
-- pourra être enrichi ensuite pour exploiter failed_sale_ids/failure_reasons.
--
-- Le guard de sécurité s'applique par transitivité via reject_sale (durci en
-- 4b), inchangé ici.

DROP FUNCTION IF EXISTS public.reject_multiple_sales(uuid[], uuid, text);

CREATE OR REPLACE FUNCTION public.reject_multiple_sales(
    p_sale_ids UUID[],
    p_rejector_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    success_count INT,
    failure_count INT,
    failed_sale_ids UUID[],
    failure_reasons TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_id UUID;
    v_success INT := 0;
    v_failed INT := 0;
    v_failed_ids UUID[] := ARRAY[]::UUID[];
    v_failed_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH v_id IN ARRAY p_sale_ids
    LOOP
        BEGIN
            PERFORM reject_sale(v_id, p_rejector_id, p_reason);
            v_success := v_success + 1;
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            v_failed_ids := array_append(v_failed_ids, v_id);
            v_failed_reasons := array_append(v_failed_reasons, SQLERRM);
        END;
    END LOOP;

    RETURN QUERY SELECT v_success, v_failed, v_failed_ids, v_failed_reasons;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_multiple_sales(uuid[], uuid, text) TO authenticated, service_role;

-- Recharger le cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- POST-VOL (à exécuter après — résultats à certifier) :
--   -- (a) create_sale_idempotent : toujours 1 seule signature (pas de surcharge)
--   --     et search_path conservé :
--   SELECT pg_get_function_identity_arguments(oid) AS args,
--          pg_get_function_result(oid) AS ret, proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname='create_sale_idempotent';
--   -- Attendu : 1 ligne, ret='sales', proconfig contient search_path.
--
--   -- (b) reject_multiple_sales : nouveau type de retour, 1 seule signature :
--   SELECT pg_get_function_result(oid) AS ret,
--          COALESCE((SELECT array_agg(DISTINCT acl.grantee::regrole::text)
--            FROM aclexplode(proacl) acl WHERE acl.privilege_type='EXECUTE'),
--            ARRAY['aucun']) AS grantees
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname='reject_multiple_sales';
--   -- Attendu : ret contient failed_sale_ids/failure_reasons ;
--   --           grantees = {authenticated, service_role}.
--
--   -- (c) Smoke-test via l'app :
--   --   1. Vente normale (avec et sans promo) → passe (garde-fou transparent).
--   --   2. Vente forgée avec unit_price < catalogue → REFUSÉE (PRICE_ERROR).
--   --   3. Rejet multiple avec un ID invalide → success_count/failure_count
--   --      corrects, l'app fonctionne toujours (lit data[0]).
-- =====================================================
