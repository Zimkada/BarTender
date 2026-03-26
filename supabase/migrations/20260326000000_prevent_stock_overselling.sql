-- =====================================================
-- Migration: Empêcher l'overselling (stock négatif)
-- Date: 2026-03-26
-- Incident: Bar 5cfff673 a vendu 8 unités avec 6 en stock (Kwaabo Grand, 22 mars 2026)
--
-- Stratégie défense en profondeur :
--   1. Corriger les stocks déjà négatifs (données existantes)
--   2. Ajouter CHECK constraint stock >= 0 sur bar_products
--   3. Ajouter FOR UPDATE + vérification explicite dans create_sale_idempotent
--   4. Ajouter FOR UPDATE + vérification explicite dans validate_sale
--
-- Le batch RPC (create_sales_batch) appelle create_sale_idempotent en boucle,
-- donc il est automatiquement couvert.
-- =====================================================

-- ============ ÉTAPE 1 : Corriger les stocks négatifs existants ============

UPDATE public.bar_products
SET stock = 0
WHERE stock < 0;

-- ============ ÉTAPE 2 : CHECK constraint (filet de sécurité absolu) ============

ALTER TABLE public.bar_products
ADD CONSTRAINT bar_products_stock_non_negative CHECK (stock >= 0);

-- ============ ÉTAPE 3 : create_sale_idempotent avec vérification stock ============

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

    -- ⭐ CHECK IDEMPOTENCY
    SELECT * INTO v_existing_sale
    FROM public.sales
    WHERE bar_id = p_bar_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing_sale;
    END IF;

    -- 🛡️ STOCK CHECK : Verrouiller et vérifier la disponibilité AVANT toute modification
    -- Le FOR UPDATE empêche deux transactions concurrentes de lire le même stock
    IF p_status = 'validated' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INT;

            SELECT stock, name INTO v_current_stock, v_product_name
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

    -- Décrémenter stock et gérer promos (stock déjà verrouillé par FOR UPDATE ci-dessus)
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

-- ============ ÉTAPE 4 : validate_sale avec vérification stock ============

CREATE OR REPLACE FUNCTION public.validate_sale(
    p_sale_id UUID,
    p_validated_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bar_id UUID;
    v_status TEXT;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INT;
    v_current_stock INT;
    v_product_name TEXT;
BEGIN
    -- 1. Lock the sale row and check status
    SELECT bar_id, status INTO v_bar_id, v_status
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_status != 'pending' THEN
        RAISE EXCEPTION 'Only pending sales can be validated (Current status: %)', v_status;
    END IF;

    -- 2. Vérifier ET verrouiller le stock de chaque produit AVANT de décrémenter
    FOR v_item IN SELECT * FROM jsonb_array_elements((SELECT items FROM sales WHERE id = p_sale_id))
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT stock, name INTO v_current_stock, v_product_name
        FROM bar_products
        WHERE id = v_product_id AND bar_id = v_bar_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'STOCK_ERROR:Produit % introuvable dans le bar %', v_product_id, v_bar_id;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'STOCK_ERROR:Stock insuffisant pour "%" (disponible: %, demandé: %)',
                COALESCE(v_product_name, v_product_id::TEXT), v_current_stock, v_quantity;
        END IF;

        -- Décrémenter (safe car vérifié juste au-dessus + FOR UPDATE)
        UPDATE bar_products
        SET stock = stock - v_quantity
        WHERE id = v_product_id AND bar_id = v_bar_id;
    END LOOP;

    -- 3. Update sale status
    UPDATE sales
    SET
        status = 'validated',
        validated_by = p_validated_by,
        validated_at = NOW()
    WHERE id = p_sale_id;
END;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION public.validate_sale(UUID, UUID) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration anti-overselling appliquée : CHECK constraint + FOR UPDATE dans create_sale_idempotent et validate_sale';
END $$;
