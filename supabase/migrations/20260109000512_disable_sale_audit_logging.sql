-- =====================================================
-- AUDIT: Disable SALE_CREATED logging (too verbose)
-- =====================================================
-- Date: 2026-01-09
-- Reason: Sales are already in sales table with created_by + created_at
--         With growing number of bars, audit_logs would explode
--         Better to query sales table directly for sales history
--
-- Decision: Keep historical logs, stop creating new ones
-- Impact: audit_logs will remain ~900-1000 records instead of growing to thousands

BEGIN;

-- =====================================================
-- 1. DISABLE SALE AUDIT TRIGGER
-- =====================================================

-- Find and disable the trigger that logs SALE_CREATED events
DROP TRIGGER IF EXISTS trg_audit_sale_creation ON sales;

-- Also remove the old trigger function if it exists
DROP FUNCTION IF EXISTS log_sale_creation() CASCADE;

-- =====================================================
-- 2. VERIFICATION
-- =====================================================

DO $$
DECLARE
  v_sale_log_count INT;
BEGIN
  SELECT COUNT(*) INTO v_sale_log_count
  FROM audit_logs
  WHERE event = 'SALE_CREATED';

  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║     SALE_CREATED AUDIT LOGGING DISABLED                    ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ Disabled trg_audit_sale_creation trigger on sales table

  Why:
  • Sales are already in sales table with created_by + created_at
  • No need to duplicate in audit_logs
  • With growth, this would pollute audit logs with thousands of entries
  • Better to query sales table directly for sales history

  Status:
  • Historical logs preserved: % SALE_CREATED records
  • New sales: Will NOT be logged to audit_logs
  • audit_logs will remain focused on actual audit events (users, products, returns, impersonations)

  If you need sales history:
  • Query: SELECT id, created_by, created_at, total FROM sales ORDER BY created_at DESC
  • This is more efficient than audit_logs
  ', v_sale_log_count;
END $$;

COMMIT;
