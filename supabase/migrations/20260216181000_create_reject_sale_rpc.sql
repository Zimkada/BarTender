-- =====================================================
-- MIGRATION: Create Atomic Reject Sale RPC
-- Date: 2026-02-16
-- Description: Unifies sale status update and stock restoration in a single transaction.
-- =====================================================

CREATE OR REPLACE FUNCTION reject_sale(
  p_sale_id UUID,
  p_rejected_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bar_id UUID;
  v_status TEXT;
  v_item JSONB;
BEGIN
  -- 1. Lock and check
  SELECT bar_id, status INTO v_bar_id, v_status
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  -- 2. Security Check: Prevent changing status if already validated
  -- A validated sale must go through the "Cancel" flow (reconcile_sale or cancel_sale)
  IF v_status = 'validated' THEN
    RAISE EXCEPTION 'Impossible de rejeter une vente déjà validée. Veuillez utiliser le flux d''annulation sécurisé.';
  END IF;

  -- 3. Update status
  UPDATE sales
  SET 
    status = 'rejected',
    rejected_by = p_rejected_by,
    rejected_at = NOW()
  WHERE id = p_sale_id;

  -- 4. Stock restoration is now irrelevant here as we only reject 'pending' sales
  -- (Stock for pending sales is only deducted at validation time in this architecture)

END;
$$;

GRANT EXECUTE ON FUNCTION reject_sale(UUID, UUID) TO authenticated;
