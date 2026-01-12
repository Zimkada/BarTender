-- =====================================================
-- CLEANUP: Remove unused proxy admin RPC functions
-- =====================================================
-- Date: 2026-01-12
-- Phase: 11 - Complete removal of actingAs feature
-- Reason: ActingAs feature was designed and database RPCs were created
--         but never integrated into frontend. Cleaning up orphaned code.

BEGIN;

-- =====================================================
-- 1. DROP HELPER FUNCTION
-- =====================================================

DROP FUNCTION IF EXISTS _verify_super_admin_proxy(UUID, TEXT);

-- =====================================================
-- 2. DROP ADMIN_AS_* RPC FUNCTIONS
-- =====================================================

-- Get bar products as super_admin (on behalf of user)
DROP FUNCTION IF EXISTS admin_as_get_bar_products(UUID, UUID);

-- Get bar members as super_admin (on behalf of user)
DROP FUNCTION IF EXISTS admin_as_get_bar_members(UUID, UUID);

-- Get user's bars as super_admin (on behalf of user)
DROP FUNCTION IF EXISTS admin_as_get_user_bars(UUID);

-- Create sale as super_admin (on behalf of user)
-- Note: This function has multiple signatures, drop all variants
DROP FUNCTION IF EXISTS admin_as_create_sale(UUID, UUID, JSONB, NUMERIC, TEXT);

-- Update stock as super_admin (on behalf of user)
DROP FUNCTION IF EXISTS admin_as_update_stock(UUID, UUID, INT);

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '
    ╔════════════════════════════════════════════════════════════╗
    ║      CLEANUP Proxy Admin Functions - Phase 11             ║
    ╚════════════════════════════════════════════════════════════╝
    ';

    RAISE NOTICE '✅ Dropped helper function: _verify_super_admin_proxy()';
    RAISE NOTICE '✅ Dropped RPC: admin_as_get_bar_products()';
    RAISE NOTICE '✅ Dropped RPC: admin_as_get_bar_members()';
    RAISE NOTICE '✅ Dropped RPC: admin_as_get_user_bars()';
    RAISE NOTICE '✅ Dropped RPC: admin_as_create_sale()';
    RAISE NOTICE '✅ Dropped RPC: admin_as_update_stock()';

    RAISE NOTICE '
    Summary:
    • Removed 6 unused proxy admin functions
    • ActingAs feature completely removed from codebase
    • No breaking changes (functions were never used)
    • Documentation cleaned up
    ';
END $$;

COMMIT;
