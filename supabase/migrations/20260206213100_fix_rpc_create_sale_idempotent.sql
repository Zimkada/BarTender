-- =====================================================
-- Migration: Mise à jour finale du RPC create_sale_idempotent
-- Date: 2026-02-06
-- Objectif: Fix PGRST202 (ticket_id) + Fix 42703 (id stock)
-- =====================================================

-- 1. Nettoyage radical des signatures pour éviter toute ambiguïté (Overloading)
DROP FUNCTION IF EXISTS public.create_sale_idempotent(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.create_sale_idempotent(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DATE, UUID);

-- 2. Création de la fonction avec la signature complète à 12 paramètres
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
    p_ticket_id UUID DEFAULT NULL
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
    v_total_amount NUMERIC := 0;
    v_business_date DATE;
BEGIN
    -- Configuration de sécurité
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';

    -- A. Vérifier l'idempotence (Anti-doublon)
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing_sale;
    END IF;

    -- B. Calculer business_date
    v_business_date := COALESCE(
        p_business_date,
        (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
    );

    -- C. Calculer le total réel à partir des items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total_amount := v_total_amount + COALESCE((v_item->>'total_price')::NUMERIC, 0);
    END LOOP;

    -- D. Insérer la vente principale
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        server_id, ticket_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at,
        idempotency_key
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        p_server_id, p_ticket_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP,
        p_idempotency_key
    )
    RETURNING * INTO v_sale;

    -- E. Décrémenter le stock (si validé)
    IF p_status = 'validated' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INT;
            
            IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
                UPDATE public.bar_products
                SET stock = stock - v_quantity
                WHERE id = v_product_id AND bar_id = p_bar_id;
            END IF;
        END LOOP;
    END IF;

    RETURN v_sale;
END;
$$;

-- 3. Commentaire explicite avec les types pour éviter le "not unique"
COMMENT ON FUNCTION public.create_sale_idempotent(UUID, JSONB, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DATE, UUID) 
IS 'V11.5 - Restauration totale de la synchronisation offline/online';
