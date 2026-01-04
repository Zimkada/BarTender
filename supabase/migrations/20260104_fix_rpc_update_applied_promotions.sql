-- MIGRATION: Corriger le stockage de applied_promotions dans la table sales
-- DATE: 2026-01-04
-- OBJECTIF: La RPC doit UPDATE la colonne applied_promotions après créer promotion_applications
--
-- BUG DÉCOUVERT:
-- - La RPC crée les promotion_applications correctement (1 enregistrement en DB)
-- - MAIS la colonne applied_promotions dans sales reste vide []
-- - Raison: La vente est INSERTée AVANT de calculer applied_promotions
-- - Solution: UPDATEr la vente APRÈS avoir boucled sur tous les items

BEGIN;

-- =====================================================
-- ÉTAPE 1: Supprimer la version bugguée
-- =====================================================
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, TEXT, UUID, TEXT, TEXT
);

-- =====================================================
-- ÉTAPE 2: Créer la version CORRIGÉE
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
    p_bar_id UUID,
    p_items JSONB,
    p_payment_method TEXT,
    p_sold_by TEXT,
    p_server_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'pending',
    p_additional_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    applied_promotions JSONB,
    created_at TIMESTAMP,
    error_code TEXT,
    error_message TEXT
) AS $$
DECLARE
    v_sale_id UUID;
    v_applied_promotions JSONB := '[]'::JSONB;
    v_item JSONB;
    v_promotion_id UUID;
    v_product_id UUID;
    v_quantity INT;
    v_discount_amount NUMERIC;
    v_error_msg TEXT;
BEGIN
    -- ========================================
    -- VERSION 2 ROBUSTNESS: Timeouts & Locks
    -- ========================================
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';

    -- ========================================
    -- VERSION 2: Validation des paramètres
    -- ========================================
    IF p_bar_id IS NULL OR p_bar_id = '00000000-0000-0000-0000-000000000000' THEN
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'INVALID_BAR_ID'::TEXT,
            'Bar ID is invalid'::TEXT;
        RETURN;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'EMPTY_ITEMS'::TEXT,
            'Items array cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF p_payment_method NOT IN ('cash', 'card', 'mobile', 'mobile_money', 'credit') THEN
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'INVALID_PAYMENT_METHOD'::TEXT,
            'Payment method must be one of: cash, card, mobile, mobile_money, credit'::TEXT;
        RETURN;
    END IF;

    IF p_sold_by IS NULL OR p_sold_by = '' THEN
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'INVALID_SOLD_BY'::TEXT,
            'Sold by cannot be null or empty'::TEXT;
        RETURN;
    END IF;

    -- ========================================
    -- Créer la vente (INITIALEMENT avec applied_promotions = [])
    -- ========================================
    BEGIN
        INSERT INTO public.sales (
            bar_id,
            items,
            payment_method,
            sold_by,
            server_id,
            status,
            additional_notes,
            applied_promotions,
            created_at,
            updated_at
        ) VALUES (
            p_bar_id,
            p_items,
            p_payment_method,
            p_sold_by,
            p_server_id,
            p_status,
            p_additional_notes,
            '[]'::JSONB,
            NOW(),
            NOW()
        )
        RETURNING sales.id INTO v_sale_id;

    EXCEPTION WHEN OTHERS THEN
        v_error_msg := 'Failed to create sale: ' || SQLERRM;
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'SALE_CREATION_FAILED'::TEXT,
            v_error_msg::TEXT;
        RETURN;
    END;

    -- ========================================
    -- VERSION 1: Enregistrer les promotions
    -- Boucler sur chaque item pour enregistrer les promotion_applications
    -- ========================================
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_promotion_id := CASE
            WHEN v_item->>'promotion_id' IS NOT NULL
            THEN (v_item->>'promotion_id')::UUID
            ELSE NULL
        END;
        v_quantity := COALESCE((v_item->>'quantity')::INT, 0);
        v_discount_amount := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);

        -- Si une promotion était appliquée à cet item
        IF v_promotion_id IS NOT NULL AND v_discount_amount > 0 THEN
            BEGIN
                -- Insérer dans promotion_applications
                INSERT INTO public.promotion_applications (
                    id,
                    bar_id,
                    promotion_id,
                    sale_id,
                    product_id,
                    discount_amount,
                    quantity_sold,
                    applied_at,
                    created_at
                ) VALUES (
                    gen_random_uuid(),
                    p_bar_id,
                    v_promotion_id,
                    v_sale_id,
                    v_product_id,
                    v_discount_amount,
                    v_quantity,
                    NOW(),
                    NOW()
                );

                -- Incrémenter le compteur current_uses de la promotion
                UPDATE public.promotions
                SET current_uses = COALESCE(current_uses, 0) + 1,
                    updated_at = NOW()
                WHERE id = v_promotion_id
                  AND bar_id = p_bar_id;

                -- Ajouter à la liste des promotions appliquées
                v_applied_promotions := v_applied_promotions || jsonb_build_object(
                    'promotion_id', v_promotion_id::TEXT,
                    'discount_amount', v_discount_amount,
                    'quantity_sold', v_quantity
                );

            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Failed to record promotion %: %', v_promotion_id, SQLERRM;
            END;
        END IF;
    END LOOP;

    -- ========================================
    -- ÉTAPE CRUCIALE: UPDATEr la vente avec applied_promotions
    -- ========================================
    BEGIN
        UPDATE public.sales
        SET applied_promotions = v_applied_promotions,
            updated_at = NOW()
        WHERE id = v_sale_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to update applied_promotions for sale %: %', v_sale_id, SQLERRM;
    END;

    -- ========================================
    -- Retourner la vente créée avec les promotions appliquées
    -- ========================================
    RETURN QUERY SELECT
        v_sale_id,
        v_applied_promotions,
        NOW(),
        NULL::TEXT,
        NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
    v_error_msg := 'Unexpected error in create_sale_with_promotions: ' || SQLERRM;
    RETURN QUERY SELECT
        NULL::UUID,
        '[]'::JSONB,
        NOW(),
        'UNEXPECTED_ERROR'::TEXT,
        v_error_msg::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- ÉTAPE 3: Vérifier que la fonction est créée
-- =====================================================
SELECT
    routine_name,
    routine_type,
    last_altered
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'create_sale_with_promotions'
ORDER BY last_altered DESC
LIMIT 1;

COMMIT;
