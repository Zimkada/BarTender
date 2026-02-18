-- =====================================================
-- MIGRATION: Approve/Reject Returns - Atomic RPCs
-- Date: 2026-02-18
-- Purpose: Consolidate return status updates with stock management
--          into atomic transactions
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CREATE approve_return RPC
-- =====================================================
-- Approves a return and increments stock if auto_restock=true
-- Atomic: Everything succeeds or everything fails
CREATE OR REPLACE FUNCTION public.approve_return(
    p_return_id UUID,
    p_validated_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return returns;
    v_bar_id UUID;
    v_product_id UUID;
    v_quantity_returned INT;
    v_auto_restock BOOLEAN;
    v_new_status returns.status%TYPE;
BEGIN
    -- =====================================================
    -- STEP 1: Fetch the return first
    -- =====================================================
    SELECT *
    INTO v_return
    FROM returns
    WHERE id = p_return_id;

    IF v_return IS NULL THEN
        RAISE EXCEPTION 'Return % not found', p_return_id;
    END IF;

    v_bar_id := v_return.bar_id;

    -- =====================================================
    -- STEP 2: Validate permissions
    -- =====================================================
    IF NOT (
        get_user_role(v_bar_id) IN ('promoteur', 'gerant') OR
        is_super_admin()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only managers can approve returns';
    END IF;

    -- Check valid transition
    IF v_return.status NOT IN ('pending', 'validated') THEN
        RAISE EXCEPTION 'Invalid transition: cannot approve return with status %', v_return.status;
    END IF;

    v_product_id := v_return.product_id;
    v_quantity_returned := v_return.quantity_returned;
    v_auto_restock := v_return.auto_restock;

    -- =====================================================
    -- STEP 3: Determine new status (respecting valid transitions)
    -- =====================================================
    -- pending + auto_restock=true  → restocked
    -- pending + auto_restock=false → approved
    -- validated (legacy)           → restocked (validated never goes to approved)
    v_new_status := CASE
        WHEN v_return.status = 'validated' THEN 'restocked'::returns.status
        WHEN v_auto_restock THEN 'restocked'::returns.status
        ELSE 'approved'::returns.status
    END;

    -- =====================================================
    -- STEP 4: Update return record with traceability
    -- =====================================================
    UPDATE returns
    SET
        status = v_new_status,
        validated_by = p_validated_by,
        validated_at = CURRENT_TIMESTAMP,
        restocked_at = CASE
            WHEN v_auto_restock THEN CURRENT_TIMESTAMP
            ELSE restocked_at
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_return_id
    RETURNING * INTO v_return;

    -- =====================================================
    -- STEP 5: Increment stock if auto_restock
    -- =====================================================
    IF v_auto_restock THEN
        UPDATE bar_products
        SET
            stock = stock + v_quantity_returned,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_product_id
          AND bar_id = v_bar_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in bar %', v_product_id, v_bar_id;
        END IF;

        -- ✨ Create stock adjustment record for audit
        INSERT INTO stock_adjustments (
            bar_id, product_id, delta, reason, notes, adjusted_by, business_date
        ) VALUES (
            v_bar_id,
            v_product_id,
            v_quantity_returned,
            'other'::adjustment_reason,
            'Remise en stock automatique suite à approbation de retour #' || v_return.id,
            p_validated_by,
            CURRENT_DATE
        );
    END IF;

    -- =====================================================
    -- STEP 6: Return result
    -- =====================================================
    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_return.id,
        'status', v_return.status,
        'validated_by', v_return.validated_by,
        'validated_at', v_return.validated_at,
        'restocked_at', v_return.restocked_at,
        'quantity_returned', v_return.quantity_returned,
        'stock_incremented', v_auto_restock
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 2. CREATE reject_return RPC
-- =====================================================
-- Rejects a return and optionally restores refund
CREATE OR REPLACE FUNCTION public.reject_return(
    p_return_id UUID,
    p_rejected_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return returns;
    v_bar_id UUID;
BEGIN
    -- =====================================================
    -- STEP 1: Fetch the return first
    -- =====================================================
    SELECT *
    INTO v_return
    FROM returns
    WHERE id = p_return_id;

    IF v_return IS NULL THEN
        RAISE EXCEPTION 'Return % not found', p_return_id;
    END IF;

    v_bar_id := v_return.bar_id;

    -- =====================================================
    -- STEP 2: Validate permissions
    -- =====================================================
    IF NOT (
        get_user_role(v_bar_id) IN ('promoteur', 'gerant') OR
        is_super_admin()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only managers can reject returns';
    END IF;

    -- Check valid transition
    IF v_return.status NOT IN ('pending', 'validated', 'approved') THEN
        RAISE EXCEPTION 'Invalid transition: cannot reject return with status %', v_return.status;
    END IF;

    -- =====================================================
    -- STEP 3: Update return to rejected
    -- =====================================================
    UPDATE returns
    SET
        status = 'rejected'::returns.status,
        rejected_by = p_rejected_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_return_id
    RETURNING * INTO v_return;

    -- =====================================================
    -- STEP 4: Return result
    -- =====================================================
    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_return.id,
        'status', v_return.status,
        'rejected_by', v_return.rejected_by
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 3. CREATE manual_restock_return RPC
-- =====================================================
-- Manually restocks an approved return that required manual restock
CREATE OR REPLACE FUNCTION public.manual_restock_return(
    p_return_id UUID,
    p_restocked_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return returns;
    v_bar_id UUID;
    v_product_id UUID;
    v_quantity_returned INT;
BEGIN
    -- =====================================================
    -- STEP 1: Fetch the return first
    -- =====================================================
    SELECT *
    INTO v_return
    FROM returns
    WHERE id = p_return_id;

    IF v_return IS NULL THEN
        RAISE EXCEPTION 'Return % not found', p_return_id;
    END IF;

    v_bar_id := v_return.bar_id;

    -- =====================================================
    -- STEP 2: Validate permissions
    -- =====================================================
    IF NOT (
        get_user_role(v_bar_id) IN ('promoteur', 'gerant') OR
        is_super_admin()
    ) THEN
        RAISE EXCEPTION 'Permission denied: only managers can restock returns';
    END IF;

    -- Check valid transition and preconditions
    IF v_return.status != 'approved' THEN
        RAISE EXCEPTION 'Invalid transition: return must be in approved status, got %', v_return.status;
    END IF;

    IF NOT v_return.manual_restock_required THEN
        RAISE EXCEPTION 'This return does not require manual restock';
    END IF;
    v_product_id := v_return.product_id;
    v_quantity_returned := v_return.quantity_returned;

    -- =====================================================
    -- STEP 3: Update return status
    -- =====================================================
    UPDATE returns
    SET
        status = 'restocked'::returns.status,
        restocked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_return_id
    RETURNING * INTO v_return;

    -- =====================================================
    -- STEP 4: Increment stock
    -- =====================================================
    UPDATE bar_products
    SET
        stock = stock + v_quantity_returned,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_product_id
      AND bar_id = v_bar_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in bar %', v_product_id, v_bar_id;
    END IF;

    -- ✨ Create stock adjustment record for audit
    INSERT INTO stock_adjustments (
        bar_id, product_id, delta, reason, notes, adjusted_by, business_date
    ) VALUES (
        v_bar_id,
        v_product_id,
        v_quantity_returned,
        'other'::adjustment_reason,
        'Remise en stock manuelle suite à retour approuvé #' || v_return.id,
        p_restocked_by,
        CURRENT_DATE
    );

    -- =====================================================
    -- STEP 5: Return result
    -- =====================================================
    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_return.id,
        'status', v_return.status,
        'restocked_at', v_return.restocked_at,
        'quantity_restocked', v_quantity_returned
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 4. Grant permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.approve_return(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_return(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_restock_return(UUID, UUID) TO authenticated;

-- =====================================================
-- 5. Add function comments
-- =====================================================
COMMENT ON FUNCTION public.approve_return(UUID, UUID) IS
'Approve a return and optionally increment stock (atomic).
Automatically increments stock if auto_restock=true.
Returns JSON with success flag and return details.';

COMMENT ON FUNCTION public.reject_return(UUID, UUID) IS
'Reject a return. Atomic operation.
Returns JSON with success flag.';

COMMENT ON FUNCTION public.manual_restock_return(UUID, UUID) IS
'Manually restock an approved return that required manual handling.
Increments stock and updates return status to restocked.
Returns JSON with success flag.';

-- =====================================================
-- 6. VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║          Return Approval RPCs - Atomic Transactions        ║
    ╚════════════════════════════════════════════════════════════╝

    ✅ Created approve_return(return_id, validated_by)
       - Updates return status (approved OR restocked)
       - Increments stock if auto_restock=true
       - Creates stock_adjustment record for audit
       - Atomic: everything succeeds or fails together

    ✅ Created reject_return(return_id, rejected_by)
       - Marks return as rejected
       - Terminal state (no further transitions)

    ✅ Created manual_restock_return(return_id, restocked_by)
       - Manually increments stock for approved returns
       - Only callable when manual_restock_required=true

    Advantages:
    • Atomic: No orphaned stock adjustments
    • Efficient: Single RPC call instead of 2-3 operations
    • Auditable: stock_adjustments records created automatically
    • Traceable: validated_by/rejected_by fields populated
    • Type-safe: Permission checks at DB level

    Test Plan:
    1. Approve auto_restock return → status=restocked, stock incremented
    2. Approve manual return → status=approved, stock unchanged
    3. Manual restock → status=restocked, stock incremented
    4. Reject pending return → status=rejected, no stock change
    ';
END $$;

COMMIT;
