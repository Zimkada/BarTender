-- =====================================================
-- Migration: Support Traçabilité Échanges (Magic Swap)
-- Date: 2026-02-10
-- Objectif: Lier les ventes de remplacement aux retours originaux
-- =====================================================

-- 1. Ajouter la colonne source_return_id sur la table SALES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'source_return_id') THEN
    ALTER TABLE public.sales ADD COLUMN source_return_id UUID REFERENCES public.returns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Ajouter la colonne linked_sale_id sur la table RETURNS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'linked_sale_id') THEN
    ALTER TABLE public.returns ADD COLUMN linked_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Mettre à jour la fonction RPC create_sale_idempotent pour supporter source_return_id
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
    p_source_return_id UUID DEFAULT NULL -- ✨ NOUVEAU: Pour la traçabilité échange
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

    -- 🛡️ SECURITY CHECK
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
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'idempotency_key is required';
    END IF;

    -- ⭐ CHECK IDEMPOTENCY
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing_sale;
    END IF;

    -- Calculer business_date
    v_business_date := COALESCE(
        p_business_date,
        (CURRENT_DATE - CASE WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < 6 THEN 1 ELSE 0 END)
    );

    -- Calculer le total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total_amount := v_total_amount + COALESCE((v_item->>'total_price')::NUMERIC, 0);
    END LOOP;

    -- Insérer la vente
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

    -- ✨ Si c'est un échange, on lie aussi le retour à cette vente
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
            WHERE product_id = v_product_id AND bar_id = p_bar_id;
        END IF;
    END LOOP;

    RETURN v_sale;
END;
$$;
