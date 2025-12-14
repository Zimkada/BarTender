-- =====================================================
-- DEPRECATION NOTICE: Old Impersonation Pattern RPCs
-- =====================================================
-- These RPCs use the old impersonation pattern with
-- p_impersonating_user_id parameter. They are deprecated
-- in favor of the new Proxy Admin architecture (admin_as_* RPCs).
--
-- Kept for backward compatibility during transition.
-- These should be removed in a future major version.
-- =====================================================

-- RPCs that are DEPRECATED (use admin_as_* instead):
-- - get_user_bars(p_user_id, p_impersonating_user_id) → admin_as_get_user_bars()
-- - get_bar_members(p_bar_id, p_impersonating_user_id) → admin_as_get_bar_members()
-- - get_bar_products(p_bar_id, p_impersonating_user_id) → admin_as_get_bar_products()

-- Migration Notes:
-- 1. These functions were created as a transitional pattern
-- 2. They pass impersonating_user_id as a parameter
-- 3. The new Proxy Admin pattern (admin_as_*) is cleaner:
--    - No parameter passing required
--    - Audit trail is automatic
--    - Security is centralized in _verify_super_admin_proxy()

-- Frontend Migration Guide:
-- OLD (still working, but deprecated):
--   ProductsService.getBarProducts(barId, impersonatingUserId)
--     └─ Calls RPC: get_bar_products(p_bar_id, p_impersonating_user_id)

-- NEW (recommended):
--   ProxyAdminService.getBarProductsAsProxy(actingAsUserId, barId)
--     └─ Calls RPC: admin_as_get_bar_products(p_acting_as_user_id, p_bar_id)

-- Timeline for Removal:
-- v2.0: Current version (both patterns supported)
-- v2.1: Add deprecation warnings in logs
-- v2.2: Make proxy admin the default
-- v3.0: Remove old pattern RPCs

-- =====================================================
-- DOCUMENTATION: Deprecated Functions
-- =====================================================

COMMENT ON FUNCTION get_user_bars(UUID, UUID) IS 'DEPRECATED: Use admin_as_get_user_bars(p_acting_as_user_id) instead. Old impersonation pattern with parameter passing. Kept for backward compatibility until v3.0.';

COMMENT ON FUNCTION get_bar_members(UUID, UUID) IS 'DEPRECATED: Use admin_as_get_bar_members(p_acting_as_user_id, p_bar_id) instead. Old impersonation pattern with parameter passing. Kept for backward compatibility until v3.0.';

COMMENT ON FUNCTION get_bar_products(UUID, UUID) IS 'DEPRECATED: Use admin_as_get_bar_products(p_acting_as_user_id, p_bar_id) instead. Old impersonation pattern with parameter passing. Kept for backward compatibility until v3.0.';

-- =====================================================
-- TRANSITION SUPPORT: Track which pattern is being used
-- =====================================================

-- Optional: Add logging when deprecated functions are called
-- This helps identify which parts of code still use old pattern

COMMENT ON FUNCTION _get_target_user_id(UUID) IS 'Helper for deprecated impersonation pattern. Used by get_user_bars, get_bar_members, get_bar_products. Will be removed in v3.0. New code should use _verify_super_admin_proxy() instead.';
