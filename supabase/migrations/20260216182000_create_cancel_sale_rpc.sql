-- Migration: Create atomic cancel_sale RPC
-- Description: Handles stock restoration and status update for cancelled sales atomically.

CREATE OR REPLACE FUNCTION cancel_sale(
    p_sale_id UUID,
    p_cancelled_by UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_item JSONB;
BEGIN
    -- 1. Lock the sale record and check status
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vente introuvable');
    END IF;

    IF v_sale.status != 'validated' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seules les ventes validées peuvent être annulées via ce flux');
    END IF;

    -- 2. Security Check: Block if there are active returns or consignments
    -- This protection MUST be in the database to prevent race conditions
    IF EXISTS (
        SELECT 1 FROM returns 
        WHERE sale_id = p_sale_id 
        AND status != 'rejected'
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Impossible d''annuler cette vente car elle contient des retours produitsactifs.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM consignments 
        WHERE sale_id = p_sale_id 
        AND status IN ('active', 'claimed')
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Impossible d''annuler cette vente car elle contient des consignations actives.');
    END IF;

    -- 3. Restore Stock
    FOR v_item IN SELECT jsonb_array_elements(items) FROM sales WHERE id = p_sale_id LOOP
        UPDATE bar_products
        SET stock = stock + (v_item->>'quantity')::INTEGER
        WHERE id = (v_item->>'product_id')::UUID;
    END LOOP;

    -- 3. Update Status
    UPDATE sales
    SET 
        status = 'cancelled',
        cancelled_by = p_cancelled_by,
        cancelled_at = NOW(),
        cancel_reason = p_reason
    WHERE id = p_sale_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
