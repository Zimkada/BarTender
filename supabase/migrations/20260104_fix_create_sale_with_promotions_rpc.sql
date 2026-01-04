-- MIGRATION: Corriger la fonction create_sale_with_promotions
-- DATE: 2026-01-04
-- OBJECTIF: Fusionner Version 1 (promotion recording) + Version 2 (robustesse)
--
-- CONTEXTE:
-- Bug identifié: La fonction create_sale_with_promotions existe en deux versions conflictantes:
-- - Version 1: Enregistre les promotions dans promotion_applications mais manque de validation
-- - Version 2: Robuste (validation, timeouts, error handling) MAIS ne crée pas les promotion_applications
--
-- SYMPTÔME: Les ventes avec promotions sont créées, mais la table promotion_applications reste vide.
-- Cela empêche PromotionsAnalytics d'afficher les données de promotions.
--
-- SOLUTION: Fusionner les deux versions pour avoir:
-- 1. Robustesse: validation, timeouts, messages d'erreur détaillés, support server_id
-- 2. Complétude: créer promotion_applications ET incrémenter les compteurs

BEGIN;

-- =====================================================
-- ÉTAPE 1: Supprimer les anciennes versions
-- =====================================================
DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, TEXT, UUID, TEXT
);

DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, TEXT, UUID, TEXT, TEXT
);

DROP FUNCTION IF EXISTS public.create_sale_with_promotions(
    UUID, JSONB, TEXT, TEXT, TEXT, TEXT
);

-- =====================================================
-- ÉTAPE 2: Créer la version fusionnée (ROBUSTE + COMPLÈTE)
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
    v_product_name TEXT;
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

    IF p_payment_method NOT IN ('cash', 'card', 'mobile') THEN
        RETURN QUERY SELECT
            NULL::UUID,
            '[]'::JSONB,
            NOW(),
            'INVALID_PAYMENT_METHOD'::TEXT,
            'Payment method must be one of: cash, card, mobile'::TEXT;
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
    -- Créer la vente
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
            NOW(),
            NOW()
        )
        RETURNING sales.id INTO v_sale_id;

    EXCEPTION WHEN OTHERS THEN
        -- VERSION 2 ROBUSTNESS: Messages d'erreur détaillés
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
                    'promotion_id', v_promotion_id,
                    'discount_amount', v_discount_amount,
                    'quantity_sold', v_quantity
                );

            EXCEPTION WHEN OTHERS THEN
                -- VERSION 2 ROBUSTNESS: Continuer même si une promotion échoue
                -- Mais log l'erreur
                RAISE WARNING 'Failed to record promotion %: %', v_promotion_id, SQLERRM;
            END;
        END IF;
    END LOOP;

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
    -- VERSION 2 ROBUSTNESS: Capturer les erreurs non-gérées
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
    created
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'create_sale_with_promotions'
ORDER BY created DESC;

-- =====================================================
-- ÉTAPE 4: Test simple (optionnel - décommenter pour tester)
-- =====================================================
-- SELECT * FROM public.create_sale_with_promotions(
--     p_bar_id := '66f6a6a9-35d7-48b9-a49a-4075c45ea452'::UUID,
--     p_items := '[{"product_id":"prod-1","quantity":2,"discount_amount":500,"promotion_id":"promo-1"}]'::JSONB,
--     p_payment_method := 'cash',
--     p_sold_by := 'server-123',
--     p_server_id := NULL,
--     p_status := 'pending'
-- );

COMMIT;
