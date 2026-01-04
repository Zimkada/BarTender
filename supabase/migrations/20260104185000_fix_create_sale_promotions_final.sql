-- MIGRATION: Nettoyer toutes les versions de create_sale_with_promotions et installer la version correcte
-- DATE: 2026-01-04 18:50
-- OBJECTIF: Supprimer toutes les versions conflictuelles et installer UNE SEULE version qui fonctionne

BEGIN;

-- =====================================================
-- ÉTAPE 1: Supprimer TOUTES les versions existantes
-- =====================================================
-- Version 1: OID 73073 (9 params)
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DATE
) CASCADE;

-- Version 2: OID 141242 (10 params - celle utilisée actuellement)
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE
) CASCADE;

-- Version 3: OID 154360 (7 params)
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, TEXT, UUID, TEXT, TEXT
) CASCADE;

-- =====================================================
-- ÉTAPE 2: Créer LA SEULE BONNE version
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_sold_by UUID,
    p_server_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'validated',
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_business_date DATE DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale sales;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC;
    v_total_price NUMERIC;
    v_total_amount NUMERIC := 0;
    v_business_date DATE;
    v_promotion_id UUID;
    v_discount_amount NUMERIC;
    v_original_unit_price NUMERIC;
    v_applied_promotions JSONB := '[]'::JSONB;
    v_promotion_record JSONB;
BEGIN
    -- Configuration timeouts
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';

    -- Validation
    IF p_bar_id IS NULL OR p_items IS NULL OR p_sold_by IS NULL THEN
        RAISE EXCEPTION 'bar_id, items, and sold_by are required';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'items cannot be empty';
    END IF;

    -- Calculer business_date
    v_business_date := COALESCE(
        p_business_date,
        (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
    );

    -- Calculer le total et valider les items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_total_price := (v_item->>'total_price')::NUMERIC;

        IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Invalid item: product_id and quantity > 0 required';
        END IF;

        v_total_amount := v_total_amount + COALESCE(v_total_price, 0);
    END LOOP;

    -- Insérer la vente avec applied_promotions vide initialement
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP
    )
    RETURNING * INTO v_sale;

    -- ✨ CRITIQUE: Enregistrer les promotions item par item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_promotion_id := (v_item->>'promotion_id')::UUID;
        v_discount_amount := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        -- Si l'item a une promotion appliquée
        IF v_promotion_id IS NOT NULL AND v_discount_amount > 0 THEN
            BEGIN
                -- Créer l'enregistrement promotion_applications
                INSERT INTO public.promotion_applications (
                    bar_id, promotion_id, sale_id, product_id,
                    quantity_sold, original_price, discounted_price, discount_amount,
                    applied_at, applied_by, business_date
                ) VALUES (
                    p_bar_id, v_promotion_id, v_sale.id, v_product_id,
                    v_quantity, v_original_unit_price, v_unit_price, v_discount_amount,
                    CURRENT_TIMESTAMP, p_sold_by, v_business_date
                );

                -- Incrémenter current_uses de la promotion
                UPDATE public.promotions
                SET current_uses = COALESCE(current_uses, 0) + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_promotion_id;

                -- Ajouter au résumé applied_promotions
                v_promotion_record := jsonb_build_object(
                    'promotion_id', v_promotion_id,
                    'product_id', v_product_id,
                    'discount_amount', v_discount_amount,
                    'promotion_name', v_item->>'promotion_name',
                    'promotion_type', v_item->>'promotion_type'
                );
                v_applied_promotions := v_applied_promotions || v_promotion_record;

            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Failed to apply promotion % for product %: %',
                    v_promotion_id, v_product_id, SQLERRM;
            END;
        END IF;
    END LOOP;

    -- ✨ CRUCIAL: UPDATE applied_promotions après la boucle
    BEGIN
        UPDATE public.sales
        SET applied_promotions = v_applied_promotions,
            updated_at = NOW()
        WHERE id = v_sale.id
        RETURNING * INTO v_sale;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to update applied_promotions for sale %: %', v_sale.id, SQLERRM;
    END;

    -- Retourner la vente complète
    RETURN v_sale;
END;
$$;

-- =====================================================
-- ÉTAPE 3: Accorder les permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO service_role;

COMMIT;
