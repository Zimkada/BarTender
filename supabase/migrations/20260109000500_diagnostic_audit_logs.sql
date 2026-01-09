-- =====================================================
-- PHASE 2 : DIAGNOSTIC AUDIT LOGS SYSTÈME
-- =====================================================
-- Migration: Vérifier l'état du système de audit logging
-- Date: 2026-01-09
-- Objectif: Identifier pourquoi audit_logs est vide malgré triggers actifs
-- NOTE: DIAGNOSTIC ONLY - No modifications

BEGIN;

-- =====================================================
-- 1. VÉRIFIER SI AUDIT_LOGS CONTIENT DES DONNÉES
-- =====================================================

DO $$
DECLARE
    v_total_count INT;
    v_sale_count INT;
    v_stock_count INT;
    v_member_count INT;
    v_proxy_count INT;
BEGIN
    SELECT COUNT(*) INTO v_total_count FROM audit_logs;
    SELECT COUNT(*) INTO v_sale_count FROM audit_logs WHERE event = 'SALE_CREATED';
    SELECT COUNT(*) INTO v_stock_count FROM audit_logs WHERE event = 'STOCK_UPDATE';
    SELECT COUNT(*) INTO v_member_count FROM audit_logs WHERE event IN ('MEMBER_ADDED', 'MEMBER_REMOVED');
    SELECT COUNT(*) INTO v_proxy_count FROM audit_logs WHERE event = 'PROXY_SALE_CREATED';

    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             AUDIT_LOGS CONTENT ANALYSIS                    ║
    ╚════════════════════════════════════════════════════════════╝

    📊 Total Logs: %
    🛍️  Sales Created: %
    📦 Stock Updates: %
    👥 Member Changes: %
    🔐 Proxy Sales: %
    ', v_total_count, v_sale_count, v_stock_count, v_member_count, v_proxy_count;

END $$;

-- =====================================================
-- 2. VÉRIFIER TRIGGERS SONT ACTIVÉS
-- =====================================================

DO $$
DECLARE
    v_triggers TEXT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             TRIGGER STATUS CHECK                           ║
    ╚════════════════════════════════════════════════════════════╝';

    -- Sales trigger
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_sale_creation' AND tgenabled != 'D') THEN
        RAISE NOTICE '✅ trg_audit_sale_creation: ACTIVE';
    ELSE
        RAISE NOTICE '❌ trg_audit_sale_creation: DISABLED or NOT FOUND';
    END IF;

    -- Stock trigger
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_stock_update' AND tgenabled != 'D') THEN
        RAISE NOTICE '✅ trg_audit_stock_update: ACTIVE';
    ELSE
        RAISE NOTICE '❌ trg_audit_stock_update: DISABLED or NOT FOUND';
    END IF;

    -- Member trigger
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_member_change' AND tgenabled != 'D') THEN
        RAISE NOTICE '✅ trg_audit_member_change: ACTIVE';
    ELSE
        RAISE NOTICE '❌ trg_audit_member_change: DISABLED or NOT FOUND';
    END IF;

END $$;

-- =====================================================
-- 3. VÉRIFIER SUPER_ADMIN STATUS
-- =====================================================

DO $$
DECLARE
    v_super_admin_count INT;
    v_super_admin_active INT;
    v_super_admin_id UUID;
    v_bar_count INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             SUPER_ADMIN REGISTRATION CHECK                 ║
    ╚════════════════════════════════════════════════════════════╝';

    -- Check if super_admin exists in bar_members
    SELECT COUNT(*) INTO v_super_admin_count
    FROM bar_members
    WHERE role = 'super_admin';

    SELECT COUNT(*) INTO v_super_admin_active
    FROM bar_members
    WHERE role = 'super_admin' AND is_active = true;

    SELECT user_id INTO v_super_admin_id
    FROM bar_members
    WHERE role = 'super_admin' AND is_active = true
    LIMIT 1;

    RAISE NOTICE '📋 Super_admin in bar_members: % total, % active', v_super_admin_count, v_super_admin_active;

    IF v_super_admin_active = 0 THEN
        RAISE NOTICE '⚠️  WARNING: No active super_admin found in bar_members!';
        RAISE NOTICE '   → is_super_admin() function will return FALSE';
        RAISE NOTICE '   → RLS policy blocks SELECT from audit_logs';
    ELSE
        RAISE NOTICE '✅ Active super_admin found: %', v_super_admin_id;

        -- Check which bars this super_admin belongs to
        SELECT COUNT(DISTINCT bar_id) INTO v_bar_count
        FROM bar_members
        WHERE user_id = v_super_admin_id AND is_active = true;

        RAISE NOTICE '   → Associated with % bar(s)', v_bar_count;
    END IF;

END $$;

-- =====================================================
-- 4. TEST is_super_admin() FUNCTION
-- =====================================================

DO $$
DECLARE
    v_result BOOLEAN;
    v_current_user UUID;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             is_super_admin() FUNCTION TEST                 ║
    ╚════════════════════════════════════════════════════════════╝';

    v_current_user := auth.uid();
    RAISE NOTICE '👤 Current auth.uid(): %', COALESCE(v_current_user::text, 'NULL');

    v_result := is_super_admin();
    RAISE NOTICE '🔍 is_super_admin() returns: %', v_result;

    IF v_result = FALSE THEN
        RAISE NOTICE '⚠️  Current user is NOT identified as super_admin';
        RAISE NOTICE '   → This blocks access to audit_logs via RLS';
    ELSE
        RAISE NOTICE '✅ Current user IS identified as super_admin';
        RAISE NOTICE '   → Should be able to SELECT from audit_logs';
    END IF;

END $$;

-- =====================================================
-- 5. VÉRIFIER RLS POLICIES SUR AUDIT_LOGS
-- =====================================================

DO $$
DECLARE
    v_select_policy INT;
    v_insert_policy INT;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             RLS POLICIES ON AUDIT_LOGS                     ║
    ╚════════════════════════════════════════════════════════════╝';

    -- Check if RLS is enabled
    IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'audit_logs') THEN
        RAISE NOTICE '✅ RLS is ENABLED on audit_logs table';
    ELSE
        RAISE NOTICE '❌ RLS is DISABLED on audit_logs table';
    END IF;

    -- Count policies
    SELECT COUNT(*)::INT INTO v_select_policy
    FROM pg_policies
    WHERE tablename = 'audit_logs' AND cmd = 'SELECT';

    SELECT COUNT(*)::INT INTO v_insert_policy
    FROM pg_policies
    WHERE tablename = 'audit_logs' AND cmd = 'INSERT';

    RAISE NOTICE '📋 SELECT policies: %', v_select_policy;
    RAISE NOTICE '📋 INSERT policies: %', v_insert_policy;

    IF v_select_policy > 0 THEN
        RAISE NOTICE '   Policy: Requires is_super_admin() = TRUE to read';
    END IF;

    IF v_insert_policy > 0 THEN
        RAISE NOTICE '   Policy: WITH CHECK (true) - always allows write';
    END IF;

END $$;

-- =====================================================
-- 6. SAMPLE AUDIT_LOGS DATA (if any exists)
-- =====================================================

DO $$
DECLARE
    v_count INT;
    record RECORD;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             SAMPLE AUDIT_LOGS RECORDS (Last 5)             ║
    ╚════════════════════════════════════════════════════════════╝';

    SELECT COUNT(*) INTO v_count FROM audit_logs;

    IF v_count = 0 THEN
        RAISE NOTICE '❌ No audit logs found in table!';
    ELSE
        RAISE NOTICE '✅ Found % records', v_count;

        -- Show last 5
        FOR record IN
            SELECT event, user_name, bar_name, description, timestamp::text
            FROM audit_logs
            ORDER BY timestamp DESC
            LIMIT 5
        LOOP
            RAISE NOTICE '  • % | % | % | %',
                record.event,
                record.user_name,
                COALESCE(record.bar_name, 'N/A'),
                LEFT(record.description, 50);
        END LOOP;
    END IF;
END $$;

-- =====================================================
-- 7. CHECK AUDIT_LOGS TABLE STRUCTURE
-- =====================================================

DO $$
DECLARE
    v_has_timestamp BOOLEAN;
    v_user_id_nullable BOOLEAN;
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║             AUDIT_LOGS TABLE STRUCTURE                     ║
    ╚════════════════════════════════════════════════════════════╝';

    -- Check if timestamp column exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'timestamp'
    ) INTO v_has_timestamp;

    -- Check if user_id is nullable
    SELECT is_nullable = 'YES'
    FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'user_id'
    INTO v_user_id_nullable;

    RAISE NOTICE '✅ timestamp column: %', CASE WHEN v_has_timestamp THEN 'EXISTS' ELSE 'MISSING' END;
    RAISE NOTICE '✅ user_id nullable: %', CASE WHEN v_user_id_nullable THEN 'YES' ELSE 'NO' END;

END $$;

-- =====================================================
-- SUMMARY & RECOMMENDATIONS
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║                    DIAGNOSTIC SUMMARY                      ║
    ╚════════════════════════════════════════════════════════════╝

    🔍 NEXT STEPS:

    1️⃣  If audit_logs is EMPTY:
        → Triggers may not be firing OR data is being inserted but hidden by RLS
        → Test: Execute INSERT INTO sales manually to trigger audit

    2️⃣  If is_super_admin() = FALSE:
        → Super_admin NOT in bar_members table OR is_active = FALSE
        → Fix: Create/update bar_members entry for super_admin

    3️⃣  If SELECT policies exist but can''t read:
        → RLS is too restrictive
        → Fix: Modify policy to allow super_admin access or make public for logs

    4️⃣  If triggers are DISABLED:
        → Enable triggers before proceeding
        → Fix: ALTER TABLE ... ENABLE TRIGGER
    ';
END $$;

COMMIT;
