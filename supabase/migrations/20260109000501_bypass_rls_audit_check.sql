-- =====================================================
-- PHASE 2 : VÉRIFICATION AUDIT_LOGS SANS RLS
-- =====================================================
-- Migration: Bypass RLS to check if audit logs exist in database
-- Date: 2026-01-09
-- Objective: Determine if logs are being written but hidden by RLS
-- NOTE: Uses service_role to bypass RLS

BEGIN;

-- =====================================================
-- 1. FULL AUDIT_LOGS DUMP (Bypass RLS)
-- =====================================================

DO $$
DECLARE
    v_count INT;
    v_distinct_events INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║        AUDIT_LOGS FULL CONTENT CHECK (RLS BYPASSED)        ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    SELECT COUNT(*) INTO v_count
    FROM audit_logs;

    SELECT COUNT(DISTINCT event) INTO v_distinct_events
    FROM audit_logs;

    RAISE NOTICE '📊 TOTAL RECORDS: %', v_count;
    RAISE NOTICE '📋 DISTINCT EVENT TYPES: %', v_distinct_events;

    IF v_count = 0 THEN
        RAISE NOTICE '
        ⚠️  CRITICAL: audit_logs table is COMPLETELY EMPTY!

        Possible causes:
        1. Triggers are not firing at all
        2. Internal_log_audit_event() function is failing silently
        3. Triggers exist but are DISABLED
        4. Database connection issue preventing trigger execution
        ';
    ELSE
        RAISE NOTICE '
        ✅ FOUND % records in audit_logs

        This means:
        • Triggers ARE firing and writing data
        • Problem is RLS blocking visibility to super_admin
        • Solution: Fix super_admin bar_members registration
        ', v_count;
    END IF;

END $$;

-- =====================================================
-- 2. EVENT TYPE DISTRIBUTION (Simplified)
-- =====================================================

RAISE NOTICE '
Event Type Distribution:';

SELECT '  • ' || event || ': ' || COUNT(*) as distribution
FROM audit_logs
GROUP BY event
ORDER BY COUNT(*) DESC;

-- =====================================================
-- 3. USER ID DISTRIBUTION
-- =====================================================

RAISE NOTICE '
User ID Distribution:';

SELECT '  • ' || COALESCE(user_id::text, 'System (NULL)') || ': ' || COUNT(*) as distribution
FROM audit_logs
GROUP BY user_id
ORDER BY COUNT(*) DESC
LIMIT 10;

-- =====================================================
-- 4. BAR ID DISTRIBUTION
-- =====================================================

RAISE NOTICE '
Bar ID Distribution:';

SELECT '  • ' || COALESCE(bar_id::text, 'N/A') || ': ' || COUNT(*) as distribution
FROM audit_logs
GROUP BY bar_id
ORDER BY COUNT(*) DESC;

-- =====================================================
-- 5. CHECK RECENT SALES AND AUDIT CORRELATION
-- =====================================================

DO $$
DECLARE
    v_sales_count INT;
    v_audit_sale_count INT;
    v_last_sale_time TIMESTAMPTZ;
    v_last_audit_time TIMESTAMPTZ;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║        SALES vs AUDIT_LOGS CORRELATION CHECK               ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    SELECT COUNT(*) INTO v_sales_count FROM sales;
    SELECT COUNT(*) INTO v_audit_sale_count
    FROM audit_logs WHERE event = 'SALE_CREATED';

    SELECT MAX(created_at) INTO v_last_sale_time FROM sales;
    SELECT MAX(timestamp) INTO v_last_audit_time
    FROM audit_logs WHERE event = 'SALE_CREATED';

    RAISE NOTICE '🛍️  Total Sales in DB: %', v_sales_count;
    RAISE NOTICE '📝 Audit logs for SALE_CREATED: %', v_audit_sale_count;

    IF v_sales_count > 0 AND v_audit_sale_count = 0 THEN
        RAISE NOTICE '
        ⚠️  PROBLEM IDENTIFIED:
        Sales are being created (%) but NOT being logged!
        → trg_audit_sale_creation trigger is NOT firing
        ', v_sales_count;
    ELSIF v_sales_count > 0 AND v_audit_sale_count > 0 THEN
        RAISE NOTICE '
        ✅ Sales are being properly logged
        Last sale: %
        Last audit: %
        ', v_last_sale_time, v_last_audit_time;
    END IF;

END $$;

-- =====================================================
-- 6. STOCK UPDATES CORRELATION
-- =====================================================

DO $$
DECLARE
    v_stock_updates INT;
    v_audit_stock_count INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║        STOCK UPDATES vs AUDIT_LOGS CORRELATION             ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    SELECT COUNT(*) INTO v_stock_updates
    FROM bar_products
    WHERE stock != 0;

    SELECT COUNT(*) INTO v_audit_stock_count
    FROM audit_logs WHERE event = 'STOCK_UPDATE';

    RAISE NOTICE '📦 Products with modified stock: %', v_stock_updates;
    RAISE NOTICE '📝 Audit logs for STOCK_UPDATE: %', v_audit_stock_count;

    IF v_stock_updates > 0 AND v_audit_stock_count = 0 THEN
        RAISE NOTICE '
        ⚠️  PROBLEM: Stock modifications exist but not logged
        → trg_audit_stock_update trigger may not be firing
        ';
    END IF;

END $$;

-- =====================================================
-- 7. RECENT SAMPLE RECORDS
-- =====================================================

RAISE NOTICE '
╔════════════════════════════════════════════════════════════╗
║        RECENT AUDIT_LOGS RECORDS (Last 10)                 ║
╚════════════════════════════════════════════════════════════╝
';

SELECT timestamp::text || ' | ' ||
       RPAD(event, 18) || ' | ' ||
       RPAD(COALESCE(user_name, 'System'), 12) || ' | ' ||
       RPAD(COALESCE(bar_name, 'N/A'), 15) || ' | ' ||
       LEFT(description, 40) as record_summary
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 10;

-- =====================================================
-- 8. TRIGGER STATUS DETAIL
-- =====================================================

RAISE NOTICE '
╔════════════════════════════════════════════════════════════╗
║        TRIGGER DETAILED STATUS                             ║
╚════════════════════════════════════════════════════════════╝
';

SELECT schemaname || '.' || tablename || '.' || trigname || ' [' ||
       CASE WHEN tgenabled = 'D' THEN 'DISABLED'
            WHEN tgenabled = 'O' THEN 'ENABLED'
            WHEN tgenabled = 'R' THEN 'REPLICA'
            WHEN tgenabled = 'A' THEN 'ALWAYS'
            ELSE tgenabled::text
       END || ']' as trigger_status
FROM pg_trigger
JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE trigname LIKE 'trg_audit%' OR trigname LIKE 'trigger_audit%'
ORDER BY tablename, trigname;

-- =====================================================
-- 9. FINAL DIAGNOSIS
-- =====================================================

DO $$
DECLARE
    v_audit_total INT;
    v_super_admin_active INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║                   FINAL DIAGNOSIS                          ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    SELECT COUNT(*) INTO v_audit_total FROM audit_logs;
    SELECT COUNT(*) INTO v_super_admin_active
    FROM bar_members WHERE role = 'super_admin' AND is_active = true;

    RAISE NOTICE '
    Analysis Summary:

    1. Audit Logs Exist: %', CASE WHEN v_audit_total > 0 THEN '✅ YES (' || v_audit_total || ' records)' ELSE '❌ NO (Empty table)' END;

    IF v_audit_total > 0 THEN
        RAISE NOTICE '
    Root Cause: RLS Policy is hiding the data
    Super admin active: %
    Solution: Create/fix super_admin bar_members entry', CASE WHEN v_super_admin_active > 0 THEN '✅ ' || v_super_admin_active ELSE '❌ NONE' END;
    ELSE
        RAISE NOTICE '
    Root Cause: Triggers are NOT firing (or internal function failing)
    Solution: Debug trigger execution and internal_log_audit_event() function';
    END IF;

    RAISE NOTICE '
    ';
END $$;

COMMIT;
