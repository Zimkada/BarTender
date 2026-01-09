-- =====================================================
-- PHASE 2 : TEST TRIGGER EXECUTION
-- =====================================================
-- Migration: Test if triggers actually execute and write to audit_logs
-- Date: 2026-01-09
-- Objective: Verify trigger function can write to audit_logs

BEGIN;

-- =====================================================
-- SETUP: Count audit logs before test
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║        TRIGGER EXECUTION TEST                              ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    RAISE NOTICE '
    [SETUP] Preparing trigger test...
    ';
END $$;

-- =====================================================
-- TEST 1: Direct call to internal_log_audit_event()
-- =====================================================

DO $$
DECLARE
    v_before_count INT;
    v_after_count INT;
    v_test_bar_id UUID;
BEGIN
    RAISE NOTICE '
    [TEST 1] Direct call to internal_log_audit_event()
    ';

    -- Get a real bar_id for testing
    SELECT bar_id INTO v_test_bar_id
    FROM bar_products
    LIMIT 1;

    SELECT COUNT(*) INTO v_before_count FROM audit_logs;
    RAISE NOTICE '  Before: % records in audit_logs', v_before_count;

    -- Call the function directly
    PERFORM internal_log_audit_event(
        'TEST_EVENT',
        'info',
        NULL,
        v_test_bar_id,
        'Test trigger execution from migration',
        jsonb_build_object('test', true, 'timestamp', NOW()::text),
        NULL,
        NULL
    );

    SELECT COUNT(*) INTO v_after_count FROM audit_logs;
    RAISE NOTICE '  After: % records in audit_logs', v_after_count;

    IF v_after_count > v_before_count THEN
        RAISE NOTICE '  ✅ SUCCESS: internal_log_audit_event() can write to audit_logs';
        RAISE NOTICE '     → Triggers should also be able to write';
    ELSE
        RAISE NOTICE '  ❌ FAILURE: internal_log_audit_event() did not insert record';
        RAISE NOTICE '     → Check if function has proper permissions or RLS blocks INSERT';
    END IF;

END $$;

-- =====================================================
-- TEST 2: Insert test SALE to trigger trg_audit_sale_creation
-- =====================================================

DO $$
DECLARE
    v_test_bar_id UUID;
    v_test_user_id UUID;
    v_before_count INT;
    v_after_count INT;
    v_audit_sale_count INT;
    v_new_sale_id UUID;
BEGIN
    RAISE NOTICE '
    [TEST 2] Insert test SALE to trigger trg_audit_sale_creation
    ';

    -- Get test data
    SELECT id INTO v_test_bar_id FROM bars LIMIT 1;
    SELECT user_id INTO v_test_user_id FROM bar_members LIMIT 1;

    SELECT COUNT(*) INTO v_before_count FROM audit_logs;

    IF v_test_bar_id IS NULL THEN
        RAISE NOTICE '  ⚠️  No bar found for test';
        RETURN;
    END IF;

    -- Insert a test sale (minimum fields)
    INSERT INTO sales (
        bar_id,
        items,
        subtotal,
        discount_total,
        total,
        payment_method,
        status,
        created_by,
        sold_by
    ) VALUES (
        v_test_bar_id,
        '[]'::JSONB,
        0,
        0,
        0,
        'test',
        'pending',
        COALESCE(v_test_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(v_test_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ) RETURNING id INTO v_new_sale_id;

    SELECT COUNT(*) INTO v_after_count FROM audit_logs;
    SELECT COUNT(*) INTO v_audit_sale_count
    FROM audit_logs
    WHERE event = 'SALE_CREATED' AND related_entity_id = v_new_sale_id;

    RAISE NOTICE '  Audit logs before: %', v_before_count;
    RAISE NOTICE '  Audit logs after: %', v_after_count;

    IF v_audit_sale_count > 0 THEN
        RAISE NOTICE '  ✅ SUCCESS: trg_audit_sale_creation triggered and logged';
        RAISE NOTICE '     → Trigger is working properly';
        RAISE NOTICE '     → Problem is likely RLS blocking visibility';

        -- Clean up test sale
        DELETE FROM sales WHERE id = v_new_sale_id;
    ELSE
        RAISE NOTICE '  ❌ FAILURE: trg_audit_sale_creation did not log the sale';
        RAISE NOTICE '     → Trigger may be disabled or not firing';

        -- Clean up test sale anyway
        DELETE FROM sales WHERE id = v_new_sale_id;
    END IF;

END $$;

-- =====================================================
-- TEST 3: Update product STOCK to trigger trg_audit_stock_update
-- =====================================================

DO $$
DECLARE
    v_test_product_id UUID;
    v_before_count INT;
    v_after_count INT;
    v_audit_stock_count INT;
    v_original_stock INT;
BEGIN
    RAISE NOTICE '
    [TEST 3] Update product STOCK to trigger trg_audit_stock_update
    ';

    -- Get a test product
    SELECT id INTO v_test_product_id FROM bar_products LIMIT 1;

    IF v_test_product_id IS NULL THEN
        RAISE NOTICE '  ⚠️  No product found for test';
        RETURN;
    END IF;

    -- Get original stock
    SELECT stock INTO v_original_stock FROM bar_products WHERE id = v_test_product_id;

    SELECT COUNT(*) INTO v_before_count FROM audit_logs;

    -- Update stock
    UPDATE bar_products SET stock = stock + 1 WHERE id = v_test_product_id;

    SELECT COUNT(*) INTO v_after_count FROM audit_logs;
    SELECT COUNT(*) INTO v_audit_stock_count
    FROM audit_logs
    WHERE event = 'STOCK_UPDATE' AND related_entity_id = v_test_product_id;

    RAISE NOTICE '  Audit logs before: %', v_before_count;
    RAISE NOTICE '  Audit logs after: %', v_after_count;

    IF v_audit_stock_count > 0 THEN
        RAISE NOTICE '  ✅ SUCCESS: trg_audit_stock_update triggered and logged';
    ELSE
        RAISE NOTICE '  ❌ FAILURE: trg_audit_stock_update did not log the update';
    END IF;

    -- Restore original stock
    UPDATE bar_products SET stock = v_original_stock WHERE id = v_test_product_id;

END $$;

-- =====================================================
-- SUMMARY
-- =====================================================

DO $$
DECLARE
    v_total_audit INT;
    v_test_event_count INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║                  TEST SUMMARY                              ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    SELECT COUNT(*) INTO v_total_audit FROM audit_logs;
    SELECT COUNT(*) INTO v_test_event_count
    FROM audit_logs WHERE event = 'TEST_EVENT';

    RAISE NOTICE '
    Total audit logs now: %
    Test events created: %

    If tests passed:
    ✅ System is working correctly
    ✅ Triggers are firing and writing
    ✅ Problem is definitely RLS visibility
    → Next step: Create/fix super_admin bar_members entry

    If tests failed:
    ❌ Triggers or functions are broken
    ❌ Need to debug trigger execution
    → Next step: Check trigger function source code
    ', v_total_audit, v_test_event_count;

END $$;

COMMIT;
