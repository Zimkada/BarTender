-- Migration: allow completing or closing a partially_received purchase order
--
-- Problem: once an order reaches 'partially_received', there is no way out.
-- The RPC convert_purchase_order_to_supplies refuses statuses other than
-- 'draft' / 'ordered', so the order stays stuck in "En cours" forever.
--
-- This migration adds two transitions:
--
--   1) Complete the reception of a partially_received order.
--      The existing RPC is replaced (DROP + CREATE) so it now accepts
--      'partially_received' as an input status. When called on such an order,
--      the supplied quantity is treated as the NEW delta (not a replacement):
--      a supply is created for the delta only, and received_quantity is
--      incremented. Final status is recomputed from the cumulative totals.
--
--   2) Close a partially_received order without receiving the remainder.
--      A new RPC close_partial_purchase_order flips the status to 'received'
--      and appends an optional reason to notes. No supply is created.
--      The badge "Partielle" in the UI is preserved because items still
--      have received_quantity < quantity.
--
-- Backward compatibility for transitions from 'draft' / 'ordered':
--   * received_quantity is NULL before the first reception → treated as 0,
--     so the cumulative logic produces the same result as the old "replace"
--     logic on the first call. No behavioral change for existing flows.

-- =====================================================
-- 1. RPC: convert_purchase_order_to_supplies (replaced)
-- =====================================================
-- Drop the previous version (signature unchanged, but body is rewritten).
DROP FUNCTION IF EXISTS public.convert_purchase_order_to_supplies(UUID, JSONB, UUID);

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
    v_previous           INTEGER;
    v_target             INTEGER;
    v_delta              INTEGER;
BEGIN
    -- 1. Lock the order to prevent concurrent conversions
    SELECT * INTO v_order
    FROM public.purchase_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order % not found', p_order_id;
    END IF;

    -- 'partially_received' is now allowed (completion of a partial reception).
    -- 'received' and 'cancelled' remain terminal.
    IF v_order.status NOT IN ('draft', 'ordered', 'partially_received') THEN
        RAISE EXCEPTION 'Cannot convert order %: status is %', p_order_id, v_order.status;
    END IF;

    -- 1b. Authorization check (SECURITY DEFINER bypasses RLS).
    IF NOT (
        get_user_role(v_order.bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: insufficient role for bar %', v_order.bar_id;
    END IF;

    -- 1c. Verify p_user_id matches the authenticated caller.
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

        -- v_received.received_quantity is the TOTAL target after this call
        -- (the UI sends the cumulative quantity the bar has received so far).
        v_previous := COALESCE(v_item.received_quantity, 0);
        v_target   := v_received.received_quantity;
        v_delta    := v_target - v_previous;

        -- Cannot go backwards. Reverting a reception requires its own flow
        -- (cancel + new order). Refuse to silently destroy stock history.
        IF v_delta < 0 THEN
            RAISE EXCEPTION 'Cannot decrease received_quantity for item % (% → %)',
                v_received.item_id, v_previous, v_target;
        END IF;

        IF v_delta = 0 THEN
            -- No new physical reception. Still ensure the line carries a value
            -- (NULL → 0) so the final status computation treats it as "marked".
            IF v_item.received_quantity IS NULL THEN
                UPDATE public.purchase_order_items
                SET received_quantity = 0
                WHERE id = v_received.item_id;
            END IF;
        ELSE
            -- Create a supply for the DELTA only — never the cumulative total.
            SELECT public.create_supply_and_update_product(
                p_bar_id     := v_order.bar_id,
                p_product_id := v_item.product_id,
                p_quantity   := v_delta,
                p_lot_price  := v_item.lot_price,
                p_lot_size   := v_item.lot_size,
                p_supplier   := COALESCE(v_item.supplier_name, ''),
                p_created_by := p_user_id
            ) INTO v_supply_result;

            v_supply_id := (v_supply_result->'supply'->>'id')::UUID;

            UPDATE public.supplies
            SET source_purchase_order_id = p_order_id
            WHERE id = v_supply_id;

            UPDATE public.purchase_order_items
            SET received_quantity = v_target
            WHERE id = v_received.item_id;

            v_supplies_created := v_supplies_created || jsonb_build_object(
                'item_id',           v_received.item_id,
                'supply_id',         v_supply_id,
                'received_quantity', v_delta
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
-- 2. RPC: close_partial_purchase_order
-- =====================================================
-- Closes a partially_received order without receiving the missing quantities.
-- Effects:
--   * status: partially_received → received
--   * notes: optional reason appended
--   * received_at: refreshed to now
-- No supply is created. received_quantity on items is untouched, so the badge
-- "Partielle" remains visible in the historical view (items show qty < quantity).

CREATE OR REPLACE FUNCTION public.close_partial_purchase_order(
    p_order_id  UUID,
    p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_order      public.purchase_orders%ROWTYPE;
    v_new_notes  TEXT;
BEGIN
    SELECT * INTO v_order
    FROM public.purchase_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order % not found', p_order_id;
    END IF;

    IF v_order.status <> 'partially_received' THEN
        RAISE EXCEPTION 'Cannot close order %: status is % (expected partially_received)',
            p_order_id, v_order.status;
    END IF;

    IF NOT (
        get_user_role(v_order.bar_id) IN ('promoteur', 'gerant')
        OR is_super_admin()
        OR is_impersonating()
    ) THEN
        RAISE EXCEPTION 'Permission denied: insufficient role for bar %', v_order.bar_id;
    END IF;

    IF p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN
        v_new_notes := COALESCE(v_order.notes || E'\n', '')
                    || 'Clôturée : ' || trim(p_reason);
    ELSE
        v_new_notes := v_order.notes;
    END IF;

    UPDATE public.purchase_orders
    SET status      = 'received',
        notes       = v_new_notes,
        received_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success',  TRUE,
        'order_id', p_order_id,
        'status',   'received'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'close_partial_purchase_order: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_partial_purchase_order(UUID, TEXT)
    TO authenticated;
