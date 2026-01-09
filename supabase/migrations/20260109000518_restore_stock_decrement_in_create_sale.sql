-- =====================================================
-- FIX: Restore Stock Decrement in create_sale_with_promotions
-- =====================================================
-- Issue: Migration 20260109_add_validated_by_param.sql removed the stock decrement logic
--        When recreating create_sale_with_promotions, the stock decrement loop (lines 170-186)
--        from migration 20260106_fix_missing_stock_decrement.sql was not copied
--        Result: Sales created WITHOUT decrementing stock (phantom inventory issue)
--
-- Impact: CRITICAL - All sales since Jan 9 may not have decremented stock
--
-- Solution: Restore the missing stock decrement loop to the function
-- This ensures atomicity: when a sale is created, stock is decremented in same transaction

BEGIN;

-- =====================================================
-- STEP 1: Restore the create_sale_with_promotions function with stock decrement
-- =====================================================

DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, DATE
) CASCADE;

CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_sold_by UUID,
    p_server_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'validated',
    p_validated_by UUID DEFAULT NULL,
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

    -- Insert the sale record
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN COALESCE(p_validated_by, p_sold_by) ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP
    )
    RETURNING * INTO v_sale;

    -- ✨ CRITICAL FIX: DECREMENT STOCK FOR EACH ITEM (was missing in 20260109)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        -- Décrémenter le stock du produit
        UPDATE public.bar_products
        SET stock = stock - v_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_product_id
          AND bar_id = p_bar_id;

        -- Vérifier que le produit existe et appartient au bon bar
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in bar %', v_product_id, p_bar_id;
        END IF;
    END LOOP;

    -- ✨ HANDLE PROMOTIONS: Record each promotion application
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

    -- ✨ UPDATE applied_promotions après la boucle
    BEGIN
        UPDATE public.sales
        SET applied_promotions = v_applied_promotions,
            updated_at = NOW()
        WHERE id = v_sale.id
        RETURNING * INTO v_sale;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to update applied_promotions for sale %: %', v_sale.id, SQLERRM;
    END;

    -- Return the complete sale
    RETURN v_sale;
END;
$$;

-- =====================================================
-- STEP 2: Grant permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO service_role;

-- =====================================================
-- STEP 3: Verification
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║  STOCK DECREMENT RESTORED IN create_sale_with_promotions   ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Restored stock decrement loop (lines 105-118)
    ✅ Function now decrements bar_products.stock for each item
    ✅ Atomicity maintained: stock update in same transaction as sale creation
    ✅ Error handling: Exception raised if product not found in bar

    Root Cause Fixed:
    • Migration 20260109_add_validated_by_param.sql removed stock decrement when recreating function
    • Consequence: All sales created after Jan 9 may have phantom inventory
    • Solution: Restored the stock decrement loop from migration 20260106

    What Happens Now:
    1. User creates sale with 5x Product A, 3x Product B
    2. create_sale_with_promotions() is called
    3. Sale inserted into sales table ✓
    4. FOR EACH item: bar_products.stock decremented atomically ✓ (NOW RESTORED)
    5. Promotions recorded in promotion_applications ✓
    6. entire transaction commits or rolls back together

    Next Steps:
    1. Execute this migration to restore function
    2. OPTIONAL: Audit sales since Jan 9 to manually adjust stock if needed
    3. Test: Create a test sale, verify stock decrements immediately
    ';
END $$;

COMMIT;
