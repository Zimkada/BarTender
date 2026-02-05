-- =====================================================
-- MIGRATION: Tickets (Bons) + ticket_id sur sales + RPCs
-- =====================================================
-- DATE: 2026-02-04
--
-- SCOPE:
--   1. CREATE TABLE tickets          — abstraction "bon" pour regrouper des ventes
--   2. ALTER TABLE sales             — ajouter ticket_id FK nullable
--   3. RPC create_ticket             — création atomique d'un bon
--   4. RPC create_sale_with_promotions — ajout du paramètre p_ticket_id (12ème param)
--   5. RPC pay_ticket                — fermeture atomique d'un bon (open → paid)
--
-- BACKWARD COMPATIBILITY:
--   - ticket_id sur sales est NULLABLE, pas de DEFAULT
--   - p_ticket_id sur le RPC a DEFAULT NULL
--   - Les ventes sans bon continuent de fonctionner exactement comme avant

BEGIN;

-- =====================================================
-- 1. CREATE TABLE tickets
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tickets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id      UUID        NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
    created_by  UUID        NOT NULL REFERENCES public.users(id),
    server_id   UUID        REFERENCES public.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at     TIMESTAMPTZ,
    paid_by     UUID        REFERENCES public.users(id),
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_bar        ON public.tickets(bar_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_bar_status ON public.tickets(bar_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_server     ON public.tickets(server_id);

COMMENT ON TABLE public.tickets IS 'Bons (tickets) pour regrouper plusieurs ventes d''un même client. Cycle de vie: open → paid.';

-- =====================================================
-- 2. RLS sur tickets
-- =====================================================
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Lecture : tous les membres actifs du bar
CREATE POLICY "tickets_bar_members_select"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bar_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.bar_id = public.tickets.bar_id
        AND bm.is_active = true
    )
  );

-- INSERT bloqué volontairement pour authenticated : les insertions passent par create_ticket (SECURITY DEFINER)
-- UPDATE bloqué volontairement : le changement de statut passe par pay_ticket (SECURITY DEFINER)

GRANT SELECT ON public.tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tickets TO service_role;

-- =====================================================
-- 3. ALTER TABLE sales — ajouter ticket_id
-- =====================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales(ticket_id);

-- =====================================================
-- 4. RPC create_ticket
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_ticket(
    p_bar_id     UUID,
    p_created_by UUID,
    p_notes      TEXT DEFAULT NULL,
    p_server_id  UUID DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
BEGIN
    SET LOCAL row_security = off;

    IF p_bar_id IS NULL OR p_created_by IS NULL THEN
        RAISE EXCEPTION 'bar_id et created_by sont requis';
    END IF;

    INSERT INTO public.tickets (bar_id, created_by, server_id, notes)
    VALUES (p_bar_id, p_created_by, p_server_id, p_notes)
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ticket TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ticket TO service_role;

COMMENT ON FUNCTION public.create_ticket IS 'Créer un nouveau bon (ticket) pour un bar. SECURITY DEFINER.';

-- =====================================================
-- 5. RPC create_sale_with_promotions — mise à jour avec p_ticket_id
-- =====================================================
-- DROP avec la signature exacte des 11 paramètres actuels (depuis 20260126000002)
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
    p_business_date DATE DEFAULT NULL,
    p_ticket_id UUID DEFAULT NULL
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
    SET LOCAL lock_timeout = '2s';
    SET LOCAL statement_timeout = '30s';
    SET LOCAL row_security = off;

    -- Validation de base
    IF p_bar_id IS NULL OR p_items IS NULL OR p_sold_by IS NULL THEN
        RAISE EXCEPTION 'bar_id, items, and sold_by are required';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'items cannot be empty';
    END IF;

    -- Validation du ticket si fourni : doit exister, être open, et appartenir au même bar
    IF p_ticket_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tickets
            WHERE id = p_ticket_id
              AND bar_id = p_bar_id
              AND status = 'open'
        ) THEN
            RAISE EXCEPTION 'ticket_id % non trouvé ou non ouvert dans le bar %', p_ticket_id, p_bar_id;
        END IF;
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

    -- Insert the sale record (+ ticket_id)
    INSERT INTO public.sales (
        bar_id, items, subtotal, discount_total, total,
        payment_method, status, sold_by, validated_by, validated_at,
        applied_promotions, server_id, created_by,
        customer_name, customer_phone, notes, business_date, created_at,
        ticket_id
    ) VALUES (
        p_bar_id, p_items, v_total_amount, 0, v_total_amount,
        p_payment_method, p_status, p_sold_by,
        CASE WHEN p_status = 'validated' THEN COALESCE(p_validated_by, p_sold_by) ELSE NULL END,
        CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
        '[]'::JSONB, p_server_id, p_sold_by,
        p_customer_name, p_customer_phone, p_notes, v_business_date, CURRENT_TIMESTAMP,
        p_ticket_id
    )
    RETURNING * INTO v_sale;

    -- DECREMENT STOCK FOR EACH ITEM
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        UPDATE public.bar_products
        SET stock = stock - v_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_product_id
          AND bar_id = p_bar_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in bar %', v_product_id, p_bar_id;
        END IF;
    END LOOP;

    -- HANDLE PROMOTIONS
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_promotion_id := (v_item->>'promotion_id')::UUID;
        v_discount_amount := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_original_unit_price := COALESCE((v_item->>'original_unit_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC);
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        IF v_promotion_id IS NOT NULL AND v_discount_amount > 0 THEN
            BEGIN
                INSERT INTO public.promotion_applications (
                    bar_id, promotion_id, sale_id, product_id,
                    quantity_sold, original_price, discounted_price, discount_amount,
                    applied_at, applied_by, business_date
                ) VALUES (
                    p_bar_id, v_promotion_id, v_sale.id, v_product_id,
                    v_quantity, v_original_unit_price, v_unit_price, v_discount_amount,
                    CURRENT_TIMESTAMP, p_sold_by, v_business_date
                );

                UPDATE public.promotions
                SET current_uses = COALESCE(current_uses, 0) + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_promotion_id;

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

    -- UPDATE applied_promotions après la boucle
    BEGIN
        UPDATE public.sales
        SET applied_promotions = v_applied_promotions,
            updated_at = NOW()
        WHERE id = v_sale.id
        RETURNING * INTO v_sale;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to update applied_promotions for sale %: %', v_sale.id, SQLERRM;
    END;

    RETURN v_sale;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_with_promotions TO service_role;

COMMENT ON FUNCTION public.create_sale_with_promotions IS
'Create a sale with automatic stock decrement and promotion handling.
CRITICAL: Uses row_security = off to bypass RLS for stock operations.
Added p_ticket_id (12th param, DEFAULT NULL) in migration 20260204000000.';

-- =====================================================
-- 6. RPC pay_ticket
-- =====================================================
CREATE OR REPLACE FUNCTION public.pay_ticket(
    p_ticket_id UUID,
    p_paid_by   UUID
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
BEGIN
    SET LOCAL row_security = off;

    IF p_ticket_id IS NULL OR p_paid_by IS NULL THEN
        RAISE EXCEPTION 'ticket_id et paid_by sont requis';
    END IF;

    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'Ticket % non trouvé', p_ticket_id;
    END IF;

    IF v_ticket.status <> 'open' THEN
        RAISE EXCEPTION 'Ticket % n''est pas ouvert (statut actuel: %)', p_ticket_id, v_ticket.status;
    END IF;

    UPDATE public.tickets
    SET status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        paid_by = p_paid_by
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_ticket TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_ticket TO service_role;

COMMENT ON FUNCTION public.pay_ticket IS 'Fermer un bon (open → paid). SECURITY DEFINER avec SELECT FOR UPDATE pour éviter les race conditions.';

COMMIT;
