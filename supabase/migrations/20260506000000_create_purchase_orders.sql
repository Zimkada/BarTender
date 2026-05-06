-- Migration: purchase_orders + purchase_order_items + atomic conversion RPC
--
-- Adds persistent purchase orders that can be drafted, edited, and converted
-- (totally or partially) into supplies. Existing supplies table gains a
-- source_purchase_order_id column for traceability.
--
-- Key design choices:
--  * Two tables (header + items) — same pattern as the in-memory order draft.
--  * Status transitions: draft → ordered → received | partially_received,
--    plus terminal cancelled. Once received/partially_received, immutable.
--  * Conversion is atomic via RPC: all received items → supplies in a single
--    transaction, status computed at the end, source link stamped.
--  * RLS mirrors supplies: members read, gerant/promoteur write.

-- =====================================================
-- 1. TABLE: purchase_orders (header)
-- =====================================================

CREATE TABLE public.purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id          UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES public.users(id),
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
    notes           TEXT,
    ordered_at      TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_bar_status
    ON public.purchase_orders (bar_id, status);

CREATE INDEX idx_purchase_orders_bar_created
    ON public.purchase_orders (bar_id, created_at DESC);

-- =====================================================
-- 2. TABLE: purchase_order_items (lines)
-- =====================================================

CREATE TABLE public.purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES public.bar_products(id) ON DELETE RESTRICT,
    supplier_name       TEXT,
    supplier_phone      TEXT,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    lot_size            INTEGER NOT NULL CHECK (lot_size > 0),
    lot_price           NUMERIC NOT NULL CHECK (lot_price >= 0),
    unit_price          NUMERIC NOT NULL CHECK (unit_price >= 0),
    received_quantity   INTEGER CHECK (received_quantity IS NULL OR received_quantity >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_order_items_order
    ON public.purchase_order_items (purchase_order_id);

CREATE INDEX idx_purchase_order_items_product
    ON public.purchase_order_items (product_id);

-- =====================================================
-- 3. ALTER: supplies — traceability link to source order
-- =====================================================

ALTER TABLE public.supplies
    ADD COLUMN source_purchase_order_id UUID
        REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX idx_supplies_source_purchase_order
    ON public.supplies (source_purchase_order_id)
    WHERE source_purchase_order_id IS NOT NULL;

-- =====================================================
-- 4. TRIGGER: keep updated_at fresh on purchase_orders
-- =====================================================

CREATE OR REPLACE FUNCTION public.touch_purchase_order_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_purchase_order_updated_at
    BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION public.touch_purchase_order_updated_at();

-- =====================================================
-- 4b. TRIGGER: prevent mutation of items on finalized orders
-- =====================================================
-- Once an order reaches received / partially_received / cancelled, its items
-- become immutable from the application path. Only received_quantity may
-- change, and only through the conversion RPC (which uses SECURITY DEFINER
-- but updates received_quantity itself, so this trigger still allows it).

CREATE OR REPLACE FUNCTION public.guard_purchase_order_items_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM public.purchase_orders
    WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);

    IF v_status IN ('received', 'partially_received', 'cancelled') THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Cannot delete items of a finalized order (status: %)', v_status;
        END IF;
        IF TG_OP = 'UPDATE' AND (
            NEW.product_id     <> OLD.product_id
            OR NEW.quantity    <> OLD.quantity
            OR NEW.lot_size    <> OLD.lot_size
            OR NEW.lot_price   <> OLD.lot_price
            OR NEW.unit_price  <> OLD.unit_price
            OR NEW.supplier_name  IS DISTINCT FROM OLD.supplier_name
            OR NEW.supplier_phone IS DISTINCT FROM OLD.supplier_phone
        ) THEN
            RAISE EXCEPTION 'Cannot modify items of a finalized order (status: %); only received_quantity may change via RPC', v_status;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_guard_purchase_order_items_immutable
    BEFORE UPDATE OR DELETE ON public.purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_items_immutable();

-- =====================================================
-- 5. RLS — mirror supplies policies
-- =====================================================

ALTER TABLE public.purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items  ENABLE ROW LEVEL SECURITY;

-- purchase_orders --------------------------------------
CREATE POLICY "Bar members can view purchase_orders"
    ON public.purchase_orders FOR SELECT
    USING (
        is_bar_member(bar_id)
        OR is_super_admin()
        OR is_impersonating()
    );

CREATE POLICY "Managers can create purchase_orders"
    ON public.purchase_orders FOR INSERT
    WITH CHECK (
        get_user_role(bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    );

CREATE POLICY "Managers can update purchase_orders"
    ON public.purchase_orders FOR UPDATE
    USING (
        get_user_role(bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    );

CREATE POLICY "Managers can delete purchase_orders"
    ON public.purchase_orders FOR DELETE
    USING (
        get_user_role(bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    );

-- purchase_order_items ---------------------------------
-- Authorization is derived from the parent order's bar_id.
CREATE POLICY "Bar members can view purchase_order_items"
    ON public.purchase_order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND (is_bar_member(po.bar_id) OR is_super_admin() OR is_impersonating())
        )
    );

CREATE POLICY "Managers can write purchase_order_items"
    ON public.purchase_order_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND (
                  get_user_role(po.bar_id) IN ('promoteur', 'gerant')
                  OR is_super_admin()
                  OR is_impersonating()
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND (
                  get_user_role(po.bar_id) IN ('promoteur', 'gerant')
                  OR is_super_admin()
                  OR is_impersonating()
              )
        )
    );

-- =====================================================
-- 6. RPC: atomic conversion to supplies
-- =====================================================
-- Input p_received_items shape:
--   [
--     { "item_id": "<uuid>", "received_quantity": <int> },
--     ...
--   ]
-- Behavior:
--   * Locks the order row (FOR UPDATE) — anti double-click.
--   * Refuses if status NOT IN ('draft', 'ordered').
--   * For each received line: calls create_supply_and_update_product,
--     stamps source_purchase_order_id on the resulting supply,
--     writes received_quantity on the order item.
--   * Final status:
--       'received'            if every item is fully received,
--       'partially_received'  otherwise.
--   * Returns { success, order_id, status, supplies_created }.

CREATE OR REPLACE FUNCTION public.convert_purchase_order_to_supplies(
    p_order_id        UUID,
    p_received_items  JSONB,
    p_user_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_order              public.purchase_orders%ROWTYPE;
    v_item               public.purchase_order_items%ROWTYPE;
    v_received           RECORD;
    v_supply_result      JSONB;
    v_supply_id          UUID;
    v_supplies_created   JSONB := '[]'::JSONB;
    v_total_items        INTEGER := 0;
    v_fully_received     INTEGER := 0;
    v_final_status       TEXT;
BEGIN
    -- 1. Lock the order to prevent concurrent conversions
    SELECT * INTO v_order
    FROM public.purchase_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order % not found', p_order_id;
    END IF;

    IF v_order.status NOT IN ('draft', 'ordered') THEN
        RAISE EXCEPTION 'Cannot convert order %: status is %', p_order_id, v_order.status;
    END IF;

    -- 1b. Authorization check (SECURITY DEFINER bypasses RLS, so we must verify
    --     the caller has the right role on the order's bar).
    IF NOT (
        get_user_role(v_order.bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: insufficient role for bar %', v_order.bar_id;
    END IF;

    -- 1c. Verify p_user_id matches the authenticated caller (or is allowed to
    --     act on behalf of others via super_admin / impersonation).
    IF p_user_id <> auth.uid()
       AND NOT is_super_admin()
       AND NOT is_impersonating() THEN
        RAISE EXCEPTION 'p_user_id does not match authenticated user';
    END IF;

    -- 2. Iterate received items
    FOR v_received IN
        SELECT
            (elem->>'item_id')::UUID            AS item_id,
            (elem->>'received_quantity')::INT   AS received_quantity
        FROM jsonb_array_elements(p_received_items) AS elem
    LOOP
        IF v_received.received_quantity IS NULL OR v_received.received_quantity < 0 THEN
            RAISE EXCEPTION 'Invalid received_quantity for item %', v_received.item_id;
        END IF;

        SELECT * INTO v_item
        FROM public.purchase_order_items
        WHERE id = v_received.item_id
          AND purchase_order_id = p_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % does not belong to order %', v_received.item_id, p_order_id;
        END IF;

        -- Skip lines with zero received (no supply created, but line is marked)
        IF v_received.received_quantity = 0 THEN
            UPDATE public.purchase_order_items
            SET received_quantity = 0
            WHERE id = v_received.item_id;
        ELSE
            -- Create supply + update product stock + CUMP (existing RPC)
            SELECT public.create_supply_and_update_product(
                p_bar_id     := v_order.bar_id,
                p_product_id := v_item.product_id,
                p_quantity   := v_received.received_quantity,
                p_lot_price  := v_item.lot_price,
                p_lot_size   := v_item.lot_size,
                p_supplier   := COALESCE(v_item.supplier_name, ''),
                p_created_by := p_user_id
            ) INTO v_supply_result;

            v_supply_id := (v_supply_result->'supply'->>'id')::UUID;

            -- Stamp traceability link
            UPDATE public.supplies
            SET source_purchase_order_id = p_order_id
            WHERE id = v_supply_id;

            -- Mark the order item as received
            UPDATE public.purchase_order_items
            SET received_quantity = v_received.received_quantity
            WHERE id = v_received.item_id;

            v_supplies_created := v_supplies_created || jsonb_build_object(
                'item_id',           v_received.item_id,
                'supply_id',         v_supply_id,
                'received_quantity', v_received.received_quantity
            );
        END IF;
    END LOOP;

    -- 3. Compute final status from ALL items of the order
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE received_quantity IS NOT NULL AND received_quantity >= quantity)
    INTO v_total_items, v_fully_received
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id;

    IF v_total_items = 0 THEN
        RAISE EXCEPTION 'Order % has no items to convert', p_order_id;
    END IF;

    IF v_fully_received = v_total_items THEN
        v_final_status := 'received';
    ELSE
        v_final_status := 'partially_received';
    END IF;

    UPDATE public.purchase_orders
    SET status      = v_final_status,
        received_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success',           TRUE,
        'order_id',          p_order_id,
        'status',            v_final_status,
        'supplies_created',  v_supplies_created
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'convert_purchase_order_to_supplies: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_purchase_order_to_supplies(UUID, JSONB, UUID)
    TO authenticated;

-- =====================================================
-- 7. GRANTS — table access for authenticated role
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
