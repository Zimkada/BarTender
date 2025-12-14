# Cleanup & Migration Notes - Impersonation Architecture Refactoring

**Date**: 2025-12-15
**Status**: In Progress - Transitional Phase
**Target Completion**: v3.0

---

## Overview

This document tracks the migration from the **old JWT-based impersonation** and **parameter-based impersonation patterns** to the new **Proxy Admin architecture**.

### Why This Matters

The old approaches created:
- ❌ Race conditions in authentication
- ❌ Fragile state management
- ❌ Security vulnerabilities
- ❌ Difficult debugging scenarios

The new Proxy Admin approach provides:
- ✅ Stable authentication (super_admin never changes)
- ✅ Clear audit trails
- ✅ Centralized security checks
- ✅ Deterministic behavior

---

## Phase 1: Completed ✅

### Database Migrations Created

1. **20251215_complete_proxy_admin_architecture.sql**
   - Helper function: `_verify_super_admin_proxy()`
   - New RPC functions: `admin_as_*` (5 functions)
   - Audit logging for all proxy actions
   - Status: ✅ COMPLETE

2. **20251215_fix_helper_function_pattern.sql**
   - Fixed `_get_target_user_id()` to check `bar_members` instead of `users`
   - Secured admin dashboard functions (added super_admin checks)
   - Status: ✅ COMPLETE

3. **20251215_deprecate_old_impersonation_rpcs.sql**
   - Documented deprecated functions
   - Migration path for old code
   - Removal timeline: v3.0
   - Status: ✅ COMPLETE

### Frontend Components Created

1. **ActingAsContext** (`src/context/ActingAsContext.tsx`)
   - Global state management for impersonation
   - Status: ✅ COMPLETE

2. **ProxyAdminService** (`src/services/supabase/proxy-admin.service.ts`)
   - Service wrapper for admin_as_* RPCs
   - Status: ✅ COMPLETE

3. **UI Components**
   - `ActingAsBar` - Notification display
   - `StartActingAsDialog` - Impersonation initiation
   - Status: ✅ COMPLETE

4. **Query Hooks**
   - `useActingAsQuery` - Intelligent routing
   - Status: ✅ COMPLETE

---

## Phase 2: In Progress 🔄

### Step 1: Remove Hacky setSession Code

**Files to Search & Clean:**

```bash
# Search for setSession usage
grep -r "setSession" src/ --include="*.ts" --include="*.tsx"
grep -r "setSession" docs/ --include="*.md"
```

**Expected Files with setSession:**
- `src/context/AuthContext.tsx` - Check for impersonation logic using setSession
- `src/services/auth.service.ts` - Check for JWT manipulation
- Any files calling `supabase.auth.setSession()`

**Action Items:**

- [ ] Search codebase for `setSession` references
- [ ] Document what they do (keep in git history via commits)
- [ ] Remove the implementation code
- [ ] Replace with Proxy Admin pattern if needed
- [ ] Update any services that relied on it
- [ ] Verify no compilation errors

### Step 2: Integrate ActingAsProvider

**File**: `src/App.tsx`

**Changes Required:**

```typescript
// BEFORE (old structure):
<AuthProvider>
  <BarProvider>
    {/* components */}
  </BarProvider>
</AuthProvider>

// AFTER (new structure):
<AuthProvider>
  <ActingAsProvider>
    <BarProvider>
      <ActingAsBar /> {/* Notification */}
      {/* components */}
    </BarProvider>
  </ActingAsProvider>
</AuthProvider>
```

**Action Items:**

- [ ] Wrap App with ActingAsProvider
- [ ] Import ActingAsBar component
- [ ] Render ActingAsBar in appropriate location (header/top-level)
- [ ] Test provider initialization

### Step 3: Replace Query Hooks

**Files to Update:**

1. **src/components/admin/SuperAdminDashboard.tsx**
   - Replace `useProducts()` → `useProductsWithActingAs()`
   - Replace normal queries with proxy-aware versions

2. **src/pages/Inventory.tsx** (if exists)
   - Same replacements

3. **src/hooks/queries/useStockQueries.ts**
   - Keep exports but note deprecation
   - Or refactor to use intelligent routing internally

**Current Status**: `useStockQueries.ts` already uses `useApiQuery` which is prepared for migration.

**Action Items:**

- [ ] Find all `useProducts(barId)` calls
- [ ] Replace with `useProductsWithActingAs(barId)` where impersonation is relevant
- [ ] Test that queries work in both normal and proxy modes
- [ ] Verify no regression in non-admin pages

### Step 4: Add "Act As User" Button

**Location**: Super Admin Dashboard / User Management Panel

**Implementation Required:**

```typescript
// In UserManagementPanel or similar:
const [showActAsDialog, setShowActAsDialog] = useState(false);

return (
  <>
    <button onClick={() => setShowActAsDialog(true)}>
      Act As User
    </button>
    <StartActingAsDialog
      isOpen={showActAsDialog}
      onClose={() => setShowActAsDialog(false)}
      users={availableUsers}
      bars={availableBar}
    />
  </>
);
```

**Action Items:**

- [ ] Find user management UI component
- [ ] Add "Act As" button next to user actions
- [ ] Fetch list of users for dialog
- [ ] Fetch list of bars for dialog
- [ ] Test dialog opens and closes correctly
- [ ] Test impersonation flow end-to-end

---

## Phase 3: Code Cleanup 🧹

### Remove Old Code

**Items to Remove:**

1. **Old impersonation Edge Function** (if exists)
   - `supabase/functions/sign-impersonate-token/`
   - Keep commit history, remove code

2. **Old JWT signing logic** (if in AuthContext)
   - Any custom JWT generation
   - Keep in commit history, remove code

3. **Old impersonation helpers**
   - Any functions that tried to manipulate tokens
   - Keep in commit history, remove code

**Preservation Strategy:**

```bash
# These changes will be in the git history:
git log --oneline | grep -i impersonate
git show <commit-hash>  # Can review old code anytime

# But the current codebase will be clean
```

### Code Quality Checks

- [ ] Run TypeScript compiler: `npm run type-check`
- [ ] Run ESLint: `npm run lint`
- [ ] Search for unused imports
- [ ] Verify no dead code remains

---

## Phase 4: Testing & Validation 🧪

### Manual Testing Checklist

**Normal Operation (non-impersonation):**
- [ ] Super admin logs in
- [ ] Super admin can view own bars
- [ ] Super admin can view own products
- [ ] Super admin can create sales
- [ ] ActingAsBar is NOT visible

**Impersonation Mode:**
- [ ] Click "Act As User"
- [ ] Select user and bar
- [ ] ActingAsBar appears with correct info
- [ ] Products show correct for selected bar
- [ ] Can create sales as impersonated user
- [ ] Audit log shows "super_admin acting as user"
- [ ] Click "Stop Acting"
- [ ] Return to normal mode

**Edge Cases:**
- [ ] Try impersonating non-existent user → Error
- [ ] Try impersonating as non-super_admin → Error
- [ ] Refresh page while impersonating → Session should continue
- [ ] Navigate between pages → Acting mode persists
- [ ] Multiple tabs → Acting state per tab (not shared)

### Automated Testing (if applicable)

- [ ] Unit tests for ActingAsContext
- [ ] Integration tests for proxy admin service
- [ ] RPC tests (if you have Supabase test suite)

---

## Phase 5: Documentation 📚

### Files Already Created

- ✅ `docs/PROXY_ADMIN_ARCHITECTURE.md` - Complete architecture guide
- ✅ `CLEANUP_AND_MIGRATION_NOTES.md` - This file

### Files to Create (if needed)

- [ ] `docs/MIGRATION_GUIDE.md` - For developers upgrading from old pattern
- [ ] `docs/CHANGELOG.md` - Document breaking changes
- [ ] `docs/DEPRECATION_NOTICE.md` - List deprecated functions

---

## RPC Migration Status

### Summary Statistics

**Total RPCs**: 37
**Migrated to Proxy Admin**: 5 ✅
**Still using old pattern**: 14 ⚠️
**Need security fixes**: 5 🔴

### Detailed Status by Category

| Category | Status | Action |
|----------|--------|--------|
| Admin Dashboard (5) | ⚠️ No security | Add super_admin checks (Done in 20251215_fix_helper_function_pattern.sql) |
| User/Bar Data (4) | ✅ Partially OK | Uses _get_target_user_id (pattern fixed) |
| Proxy Admin (5) | ✅ Complete | New pattern, fully implemented |
| Write Operations (3) | ⚠️ Some missing | `admin_as_create_sale`, `admin_as_update_stock` done |
| User Management (1) | ⚠️ Old pattern | `admin_update_user` - needs migration |
| Setup Functions (3) | ⚠️ Incomplete | `create_user_profile`, `assign_bar_member`, `setup_promoter_bar` |
| Analytics (3) | ⚠️ Rely on RLS | Relies on Row Level Security |

### Deprecated Functions (Keep Until v3.0)

These are still callable but should not be used for new code:

```
get_user_bars(p_user_id, p_impersonating_user_id)
get_bar_members(p_bar_id, p_impersonating_user_id)
get_bar_products(p_bar_id, p_impersonating_user_id)
_get_target_user_id(p_impersonating_user_id) [helper]
```

**Migration Path**:
```
OLD CODE:
  ProductsService.getBarProducts(barId, impersonatingUserId)
    → get_bar_products(p_bar_id, p_impersonating_user_id)

NEW CODE:
  ProxyAdminService.getBarProductsAsProxy(actingAsUserId, barId)
    → admin_as_get_bar_products(p_acting_as_user_id, p_bar_id)
```

---

## Commit Strategy

All work is kept in git history:

1. **Commit 8b758ea**: Complete Proxy Admin architecture (new pattern)
2. **Next Commit**: Fix helper function pattern + secure admin functions
3. **Next Commit**: Deprecation documentation
4. **Next Commit**: Integration into App.tsx
5. **Next Commit**: Remove setSession/JWT hack code
6. **Final Commit**: Complete cleanup and documentation

Each commit is atomic and reviewable.

---

## Timeline & Versions

| Version | Status | Focus | Deadline |
|---------|--------|-------|----------|
| v2.0 | Current | Both patterns supported | ✅ Done |
| v2.1 | Next | Deprecation warnings, add logging | Planned |
| v2.2 | Planned | Proxy admin becomes default | Planned |
| v3.0 | Future | Remove old pattern RPCs | 2026 Q1 |

---

## Known Issues & Limitations

### Current (v2.0)

1. **Multiple tabs**: Acting state is per-tab, not per-browser
   - Workaround: Super admin must use single tab for impersonation
   - Fix in v3.0: Could use localStorage with encryption

2. **Session timeout**: If token expires while impersonating
   - Current: User is logged out
   - Fix in v2.1: Refresh both tokens transparently

3. **No role restrictions**: Super admin can only access bars they're member of
   - Current: By design (RLS + bar_members)
   - Could expand in v3.0 if needed

---

## Support & Questions

### Common Issues

**Q: "I see setSession errors after the update"**
- A: The old JWT code has been removed. If you custom code relied on it, migrate to ProxyAdminService instead.

**Q: "Impersonation doesn't show all user's bars"**
- A: Normal - you only see bars that user is member of (RLS policy). This is secure by design.

**Q: "Can I test the old code?"**
- A: Yes, use `git checkout <commit-hash>` to see old implementation. Learn why it was problematic!

---

## Checklist for Completion

- [ ] Phase 1: All database migrations applied
- [ ] Phase 2: All integration complete
  - [ ] setSession code removed
  - [ ] ActingAsProvider integrated
  - [ ] Query hooks replaced
  - [ ] "Act As" button added
- [ ] Phase 3: Cleanup complete
  - [ ] Old code removed
  - [ ] Compilation succeeds
  - [ ] Linting passes
- [ ] Phase 4: Testing complete
  - [ ] Manual tests passed
  - [ ] No regressions found
- [ ] Phase 5: Documentation complete
  - [ ] PROXY_ADMIN_ARCHITECTURE.md reviewed
  - [ ] CLEANUP_AND_MIGRATION_NOTES.md completed
- [ ] Final commit and tag for v2.0.0

---

## Additional Resources

- **Original Architecture Doc**: `docs/PROXY_ADMIN_ARCHITECTURE.md`
- **RPC Inventory**: See earlier in this document
- **Security Patterns**: Reference `_verify_super_admin_proxy()` function in migrations

---

**Last Updated**: 2025-12-15
**Status**: In Progress - Phase 2 Starting
**Next Step**: Implement Phase 2 integration tasks
