-- =====================================================
-- MIGRATION: Update Atomic Reject Sale RPC
-- Date: 2026-02-20
-- Description: Unifies sale status update, stock restoration (irrelevant here), and optional notes appending.
-- =====================================================

CREATE OR REPLACE FUNCTION reject_sale(
  p_sale_id UUID,
  p_rejected_by UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bar_id UUID;
  v_status TEXT;
  v_current_notes TEXT;
BEGIN
  -- 1. Lock and check
  SELECT bar_id, status, notes INTO v_bar_id, v_status, v_current_notes
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- 2. Security Check: Prevent changing status if already validated
  -- A validated sale must go through the "Cancel" flow
  IF v_status = 'validated' THEN
    RAISE EXCEPTION 'Impossible de rejeter une vente déjà validée. Veuillez utiliser le flux d''annulation sécurisé.';
  END IF;

  -- 3. Update status and conditionally append notes
  IF p_note IS NOT NULL THEN
    UPDATE sales
    SET 
      status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = NOW(),
      notes = CASE 
                WHEN v_current_notes IS NULL OR v_current_notes = '' THEN p_note
                ELSE v_current_notes || E'\n' || p_note
              END
    WHERE id = p_sale_id;
  ELSE
    UPDATE sales
    SET 
      status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = NOW()
    WHERE id = p_sale_id;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION reject_sale(UUID, UUID, TEXT) TO authenticated;

-- =====================================================
-- PRIORITY 2: Partial Index for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sales_stale_lookup 
  ON sales(bar_id, status, business_date) 
  WHERE status = 'pending';

-- =====================================================
-- PRIORITY 3: Batch RPC for Multiple Sales
-- =====================================================
CREATE OR REPLACE FUNCTION reject_multiple_sales(
    p_sale_ids UUID[],
    p_rejector_id UUID,
    p_reason TEXT DEFAULT NULL
) 
RETURNS TABLE(success_count INT, failure_count INT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
    v_success INT := 0;
    v_failed INT := 0;
BEGIN
    FOREACH v_id IN ARRAY p_sale_ids
    LOOP
        BEGIN
            PERFORM reject_sale(v_id, p_rejector_id, p_reason);
            v_success := v_success + 1;
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            -- We swallow the exception to continue processing the rest of the array
        END;
    END LOOP;

    RETURN QUERY SELECT v_success, v_failed;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_multiple_sales(UUID[], UUID, TEXT) TO authenticated;

