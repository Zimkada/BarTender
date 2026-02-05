-- =====================================================
-- Migration: Créer RPC idempotent pour création de ventes
-- Date: 2026-02-05
-- Objectif: Prévenir les doublons en mode offline avec idempotency_key
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
    p_business_date DATE DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_sale sales;
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
BEGIN
    -- Configuration timeouts
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';

    -- Validation de base
    IF p_bar_id IS NULL OR p_items IS NULL OR p_sold_by IS NULL THEN
        RAISE EXCEPTION 'bar_id, items, and sold_by are required';
    END IF;

    -- 🛡️ SECURITY CHECK: Vérifier que l'utilisateur appelant est membre du bar ou super_admin
    IF NOT EXISTS (
        SELECT 1 FROM public.bar_members 
        WHERE user_id = auth.uid() 
          AND bar_id = p_bar_id 
          AND is_active = true
    ) 
    AND (auth.role() <> 'service_role') 
    AND NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
          AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: User is not an active member of this bar and not a super admin';
    END IF;

    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'idempotency_key is required';
    END IF;

    -- ⭐ CHECK IDEMPOTENCY: Vérifier si une vente existe déjà avec cette clé
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    -- Si elle existe déjà, retourner la vente existante (idempotent)
    IF FOUND THEN
        RAISE NOTICE 'Sale with idempotency_key % already exists, returning existing sale %', p_idempotency_key, v_existing_sale.id;
        RETURN v_existing_sale;
    END IF;

    -- Sinon, créer une nouvelle vente
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

    -- Insérer la vente avec idempotency_key
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at,
        idempotency_key
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP,
        p_idempotency_key
    )
    RETURNING * INTO v_sale;

    -- Enregistrer les promotions item par item (si applicable)
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
                )
                VALUES (
                    p_bar_id, v_promotion_id, v_sale.id, v_product_id,
                    v_quantity, v_original_unit_price, v_unit_price, v_discount_amount,
                    CURRENT_TIMESTAMP, p_sold_by, v_business_date
                );

                -- Ajouter à applied_promotions array
                v_applied_promotions := v_applied_promotions || jsonb_build_object(
                    'promotion_id', v_promotion_id,
                    'product_id', v_product_id,
                    'discount_amount', v_discount_amount
                );
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Failed to record promotion application: %', SQLERRM;
            END;
        END IF;

        -- Décrémenter le stock (si statut = validated)
        IF p_status = 'validated' THEN
            UPDATE public.bar_products
            SET stock = stock - v_quantity
            WHERE product_id = v_product_id
              AND bar_id = p_bar_id;

            IF NOT FOUND THEN
                RAISE WARNING 'Product % not found in bar % for stock update', v_product_id, p_bar_id;
            END IF;
        END IF;
    END LOOP;

    -- Mettre à jour applied_promotions si des promotions ont été appliquées
    IF jsonb_array_length(v_applied_promotions) > 0 THEN
        UPDATE public.sales
        SET applied_promotions = v_applied_promotions
        WHERE id = v_sale.id;

        v_sale.applied_promotions := v_applied_promotions;
    END IF;

    RETURN v_sale;
END;
$$;

COMMENT ON FUNCTION public.create_sale_idempotent IS
'Crée une vente de manière idempotente. Si une vente avec la même idempotency_key existe déjà pour le bar, retourne la vente existante sans créer de doublon.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_sale_idempotent TO authenticated;
