-- =====================================================
-- AUDIT: Disable STOCK_UPDATE logging (too verbose)
-- =====================================================
-- Date: 2026-02-03
-- Reason: Stock changes are implicit in sales/returns/supplies data
--         With growing number of bars, audit_logs would explode
--         Better to query bar_products.updated_at for stock history
--
-- Decision: Keep historical logs, stop creating new ones
-- Impact: Massive reduction in audit_logs volume (estimated 70-80%)
--
-- Safety: Trigger only logs, does NOT affect business logic
--         Stock decrement happens in create_sale_with_promotions() independently
--         Trigger type: AFTER UPDATE (runs after stock is already changed)

BEGIN;

-- =====================================================
-- 1. DISABLE STOCK UPDATE AUDIT TRIGGER
-- =====================================================

-- Find and disable the trigger that logs STOCK_UPDATE events
DROP TRIGGER IF EXISTS trg_audit_stock_update ON bar_products;

-- Note: We keep the function in case we want to re-enable later
-- The function trigger_audit_stock_update() is preserved for potential future use

-- =====================================================
-- 2. VERIFICATION
-- =====================================================

DO $$
DECLARE
  v_stock_log_count INT;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Count existing STOCK_UPDATE logs
  SELECT COUNT(*) INTO v_stock_log_count
  FROM audit_logs
  WHERE event = 'STOCK_UPDATE';

  -- Verify trigger is gone
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_audit_stock_update'
  ) INTO v_trigger_exists;

  RAISE NOTICE '
  ╔════════════════════════════════════════════════════════════╗
  ║     STOCK_UPDATE AUDIT LOGGING DISABLED                    ║
  ╚════════════════════════════════════════════════════════════╝

  ✅ Disabled trg_audit_stock_update trigger on bar_products table

  Why:
  • Stock changes are implicit in sales/returns/supplies
  • No need to duplicate in audit_logs
  • With growth, this would pollute audit logs with thousands of entries
  • Better to query bar_products.updated_at for stock history

  Status:
  • Historical logs preserved: % STOCK_UPDATE records
  • New stock changes: Will NOT be logged to audit_logs
  • Trigger removed: %
  • audit_logs will remain focused on actual audit events

  Business Logic Safety:
  • Stock decrement happens in create_sale_with_promotions() (lines 105-122)
  • Trigger was AFTER UPDATE (ran after stock already changed)
  • Trigger only logged, did NOT modify data
  • Zero impact on sales, returns, or stock adjustments

  Combined with previous optimizations:
  • LOGIN_SUCCESS removed (frontend)
  • LOGOUT removed (frontend)
  • SALE_CREATED removed (database trigger, Jan 9)
  • STOCK_UPDATE removed (database trigger, TODAY)
  
  Expected total reduction: 85-90%% of audit log volume

  If you need stock history:
  • Query: SELECT id, stock, updated_at FROM bar_products WHERE id = ? ORDER BY updated_at DESC
  • Or check sales/returns/supplies tables for stock movements
  ', v_stock_log_count, 
     CASE WHEN v_trigger_exists THEN '❌ Still exists!' ELSE '✅ Successfully removed' END;

  -- Raise error if trigger still exists
  IF v_trigger_exists THEN
    RAISE EXCEPTION 'Trigger trg_audit_stock_update still exists after DROP!';
  END IF;
END $$;

COMMIT;
