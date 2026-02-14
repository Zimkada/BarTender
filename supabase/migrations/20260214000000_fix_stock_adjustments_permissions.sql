-- =====================================================
-- Migration: Fix Stock Adjustments Permissions (STRICT & ROBUST)
-- Description: 1. Enable RLS (Security Hardening)
--              2. Explicitly GRANT permissions to authenticated role
--              3. RESTRICT: INSERT only for 'promoteur' (Promoter).
--              4. ALLOW: SELECT for all bar members (Dashboard/Stats)
-- Date: 2026-02-14
-- =====================================================

BEGIN;

-- 0. Security Hardening: Ensure RLS is enabled
-- This prevents "GRANT" from exposing the table if RLS was off.
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- 1. Ensure Table Permissions (GRANT)
-- Needed for "permission denied for table" error
GRANT SELECT ON stock_adjustments TO authenticated;
GRANT INSERT ON stock_adjustments TO authenticated;

-- 2. Verify and Update RLS Policies
-- Re-applying logic to ensure correctness.
-- Dropping old potential policies to avoid conflicts.

DROP POLICY IF EXISTS "Only promoteur can create stock adjustments" ON stock_adjustments;
DROP POLICY IF EXISTS "Authorized users can create stock adjustments" ON stock_adjustments;
DROP POLICY IF EXISTS "Bar members can view stock adjustments" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments are immutable - no updates" ON stock_adjustments;
DROP POLICY IF EXISTS "Stock adjustments cannot be deleted" ON stock_adjustments;

-- Policy 1: Only promoteur can INSERT (Strict business rule)
-- Managers are NOT allowed to create adjustments (which imply modification of history).
-- Uses existing helper function `get_user_role` from 002_rls_policies.sql
CREATE POLICY "Authorized users can create stock adjustments"
  ON stock_adjustments FOR INSERT
  WITH CHECK (
    get_user_role(bar_id) = 'promoteur' OR is_super_admin()
  );

-- Policy 2: All bar members (including servers) can SELECT
-- This is technically safe as long as UI hides sensitive context.
-- Used for general stock history calculation if ever needed by others.
CREATE POLICY "Bar members can view stock adjustments"
  ON stock_adjustments FOR SELECT
  USING (
    is_bar_member(bar_id) OR is_super_admin()
  );

-- Policy 3 & 4: Immutable
CREATE POLICY "Stock adjustments are immutable - no updates"
  ON stock_adjustments FOR UPDATE
  USING (FALSE);

CREATE POLICY "Stock adjustments cannot be deleted"
  ON stock_adjustments FOR DELETE
  USING (FALSE);

COMMIT;
