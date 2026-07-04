-- =====================================================
-- FIX — create_sale_idempotent : autoriser les promotions "majoration_produit"
-- (le garde-fou prix de la Vague 4e rejetait un discount négatif)
-- =====================================================
-- Date : 2026-07-04
--
-- BUG (trouvé en revérifiant la Vague 4e) : le moteur promo
-- (promotions.service.ts, calculateBestPrice) a un type 'majoration_produit'
-- (exposé en UI, PromotionForm.tsx label "Prix augmenté") qui AUGMENTE le prix
-- → `discount = originalPrice - bestPrice` NÉGATIF par construction.
-- Deux endroits de create_sale_idempotent traitaient mal ce cas :
--   (b) garde-fou : IF v_discount_amount < 0 ... RAISE → BLOQUAIT la vente.
--   Insertion promotion_applications : IF ... v_discount_amount > 0 → la
--   majoration n'était PAS tracée dans les stats promo.
-- Fonctionnalité jamais utilisée en prod à ce jour (vérifié) → pas d'incident
-- réel, corrigé avant qu'un gérant ne l'utilise.
--
-- CERTIFICATION AVANT ÉCRITURE :
--   - Corps ci-dessous = pg_get_functiondef EXACT de la prod (2026-07-04),
--     copié tel quel — PAS retapé de mémoire (leçon incident reject_sale).
--   - Signature 13 params (dont p_source_return_id pour les échanges) et ordre
--     confirmés identiques → CREATE OR REPLACE remplace, ne crée PAS de
--     surcharge. nb_versions=1 vérifié avant.
--   - Impact stats promo d'un discount négatif vérifié : get_bar_promotion_
--     stats_with_profit agrège SUM(discounted_price)/SUM(discount_amount) →
--     net_profit = discounted_price - cost reste CORRECT (revenu réel plus
--     élevé) ; total_discount devient négatif = une majoration, sémantiquement
--     juste. Aucun faussage marge/ROI.
--
-- SEULES 2 LIGNES CHANGENT vs le corps prod : la condition (b) et la
-- condition d'insertion promotion_applications. Tout le reste est identique.
-- =====================================================

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

        -- (b) ⭐ MODIFIÉ 2026-07-04 : la remise (totale de ligne) est bornée
        --     entre -100% (majoration max = prix doublé) et +100% (gratuit) du
        --     prix ligne. Une remise NÉGATIVE = majoration légitime (promo
        --     'majoration_produit'). La borne basse évite une valeur aberrante
        --     en cas de bug/faille client — garde-fou technique large, pas une
        --     règle métier (le formulaire de promo n'a pas de plafond de
        --     majoration).
        IF v_discount_amount > (v_original_unit_price * v_quantity)
           OR v_discount_amount < -(v_original_unit_price * v_quantity) THEN
            RAISE EXCEPTION 'PRICE_ERROR:Remise/majoration invalide pour "%" (valeur: %, plage: [-%, %])',
                COALESCE(v_product_name, v_product_id::TEXT), v_discount_amount,
                (v_original_unit_price * v_quantity), (v_original_unit_price * v_quantity);
        END IF;

        -- (c) Cohérence du total : total_price ≈ (prix_pratiqué*qté) - remise,
        --     tolérance 1 CFA/ligne pour absorber les ROUND() des promos %.
        --     Fonctionne pour un discount négatif : total = original*qté -
        --     (négatif) = plus élevé (majoration). Inchangé.
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

        -- ⭐ MODIFIÉ 2026-07-04 : tracer aussi les majorations (discount != 0
        --    au lieu de > 0). Un discount négatif = majoration légitime, à
        --    enregistrer dans les stats promo (net_profit reste correct :
        --    revenu réel plus élevé).
        IF v_promotion_id IS NOT NULL AND v_discount_amount <> 0 THEN
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

-- ⚠️ OBLIGATOIRE : rétablir les privilèges explicites (cf. Vague 4a).
-- Dans CETTE base, proacl était NULL → EXECUTE hérité de PUBLIC (= anon).
-- Un CREATE OR REPLACE ne re-pose PAS de REVOKE → sans ce bloc, la brèche
-- anon de la Vague 4a se rouvre. REVOKE PUBLIC + GRANT ciblé = fermeture.
REVOKE ALL ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(
    uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
