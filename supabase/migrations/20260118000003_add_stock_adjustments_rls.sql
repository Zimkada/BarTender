-- =====================================================
-- Migration: Add RLS policies for stock_adjustments
-- Description: Restrict access based on user role
--              Prevent UPDATE/DELETE (immutable audit trail)
-- Date: 2026-01-18
-- =====================================================

BEGIN;

-- Enable RLS on stock_adjustments table
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Policy 1: Only promoteur can CREATE adjustments
CREATE POLICY "Only promoteur can create stock adjustments"
  ON stock_adjustments FOR INSERT
  WITH CHECK (
    (get_user_role(bar_id) = 'promoteur' OR is_super_admin())
  );

-- Policy 2: Bar members can SELECT (view adjustment history)
CREATE POLICY "Bar members can view stock adjustments"
  ON stock_adjustments FOR SELECT
  USING (
    is_bar_member(bar_id) OR is_super_admin()
  );

-- Policy 3: Prevent UPDATE (adjustments are immutable)
CREATE POLICY "Stock adjustments are immutable - no updates"
  ON stock_adjustments FOR UPDATE
  USING (FALSE);

-- Policy 4: Prevent DELETE (audit trail integrity)
CREATE POLICY "Stock adjustments cannot be deleted"
  ON stock_adjustments FOR DELETE
  USING (FALSE);

COMMIT;
