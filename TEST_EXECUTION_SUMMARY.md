# Simplified Mode Bug Fixes - Test Execution Summary

## Overview
This document tracks the comprehensive test suite created to validate all 7 critical bugs fixed in the Simplified Mode implementation.

**Date**: 2026-02-23
**Status**: ✅ All 4 Tests Created (Ready for Execution)

---

## 🧪 Test Coverage Matrix

| Bug ID | Issue | Test File | Type | Status |
|--------|-------|-----------|------|--------|
| BUG #1 | Default operatingMode misalignment (frontend='simplified' vs backend='full') | `src/__tests__/BarContext.test.ts` | TypeScript | ✅ Created |
| BUG #2 | RLS UPDATE policy LIMIT 1 random failure for multi-bar managers | `supabase/tests/test_rls_simplified_mode.sql` | SQL | ✅ Created |
| BUG #3 | canWorkOffline logic divergence (OfflineBanner vs useSalesMutations) | `src/hooks/__tests__/useCanWorkOffline.test.ts` | TypeScript | ✅ Created |
| BUG #7 | Backfill migration non-idempotent (overwrites historical records) | `supabase/tests/test_backfill_idempotence.sql` | SQL | ✅ Created |
| BUG #1.7 | business_date vs hardcoded 6h interval in RPC | *Validated in migration* | SQL | ✅ Fixed |
| React Hooks | Hook called inside async function (mutationFn) | *Fixed in useSalesMutations.ts* | TypeScript | ✅ Fixed |
| useMemo | Missing memoization in useCanWorkOffline | *Fixed in useCanWorkOffline.ts* | TypeScript | ✅ Fixed |

---

## 📋 Test Suite Details

### TypeScript Tests (2 files, 384 lines total)

#### 1. **BarContext.test.ts** (158 lines)
**Purpose**: Validate operatingMode default value alignment between frontend and backend

**Test Coverage**:
- ✅ Null/undefined operatingMode handling
- ✅ Explicit 'full' mode setting
- ✅ Explicit 'simplified' mode setting
- ✅ Default fallback to 'full' (matches backend COALESCE)
- ✅ Frontend/Backend consistency validation

**Key Assertions**:
```typescript
expect(DEFAULT_OPERATING_MODE).toBe('full');  // Frontend default
expect(barContext.operatingMode).toBe('full');  // Matches backend RLS COALESCE(..., 'full')
```

**Execution**:
```bash
npm run test -- src/__tests__/BarContext.test.ts
```

---

#### 2. **useCanWorkOffline.test.ts** (226 lines)
**Purpose**: Validate canWorkOffline hook across all role/mode combinations

**Test Coverage**:
- ✅ Manager in full mode: CAN work offline (true)
- ✅ Manager in simplified mode: CAN work offline (true)
- ✅ Server in full mode: CANNOT work offline (false) ← **Critical Security**
- ✅ Server in simplified mode: CAN work offline (true)
- ✅ Null session handling (returns false)
- ✅ Memoization prevents unnecessary re-renders
- ✅ Dependencies [role, isSimplifiedMode] trigger recalculation

**Truth Table Validation**:
```
isManagerRole | isSimplifiedMode | Expected
─────────────┼─────────────────┼──────────
true          | false           | true   ✅
true          | true            | true   ✅
false         | false           | false  ✅ (CRITICAL)
false         | true            | true   ✅
```

**Execution**:
```bash
npm run test -- src/hooks/__tests__/useCanWorkOffline.test.ts
```

---

### SQL Tests (2 files, 196 lines total)

#### 3. **test_rls_simplified_mode.sql** (87 lines)
**Purpose**: Validate RLS UPDATE policy fix for multi-bar manager access

**Bug Being Tested**: BUG #2 - LIMIT 1 random selection preventing multi-bar managers from validating sales

**Test Scenario**:
1. Create a test manager (gérant) with access to 2 bars
2. Create a pending sale in each bar
3. Attempt to validate both sales as the gérant
4. Verify both validations succeed (proves EXISTS clause works)

**Execution**:
```sql
-- In Supabase SQL Editor, copy and run the entire file
-- Look for: "PASS ✅" or "FAIL ❌" in the NOTICE output
```

**Expected Result**:
```
PASS ✅ - Multi-bar RLS Validation successful. Bug #2 is fixed.
```

---

#### 4. **test_backfill_idempotence.sql** (109 lines)
**Purpose**: Validate backfill migration is idempotent and doesn't overwrite historical records

**Bug Being Tested**: BUG #7 - Non-idempotent migration that overwrites all bars with 'full'

**Test Scenario**:
1. Create 3 bars with different operating_mode_at_creation states:
   - Bar 1: NULL (should be backfilled to 'full')
   - Bar 2: 'simplified' (should NOT be changed)
   - Bar 3: 'full' (should NOT be changed)
2. Run the UPDATE query once
3. Run the UPDATE query again (idempotence test)
4. Verify all values remain correct (no overwrites)

**Execution**:
```sql
-- In Supabase SQL Editor, copy and run the entire file
-- Look for: "PASS ✅" in both first run and second run sections
```

**Expected Result**:
```
PASS ✅ - First run: Bar 1 updated to full, Bar 2 and 3 unchanged.
| PASS ✅ - Second run (Idempotent): All values unchanged. Bug #7 is fixed.
```

---

## 🚀 Running All Tests

### Step 1: TypeScript Tests (Local Environment)
```bash
# Run all tests
npm run test

# Run specific test files
npm run test -- src/__tests__/BarContext.test.ts
npm run test -- src/hooks/__tests__/useCanWorkOffline.test.ts
```

### Step 2: SQL Tests (Supabase Dashboard)
1. Navigate to: **Supabase Dashboard → Your Project → SQL Editor**
2. Create a new query
3. Copy entire content from `supabase/tests/test_rls_simplified_mode.sql`
4. Click **RUN** button
5. Verify success message in the results panel
6. Repeat for `supabase/tests/test_backfill_idempotence.sql`

### Step 3: Verify No Regressions
```bash
# Run full test suite to ensure no side effects
npm run test

# Check TypeScript compilation
npm run build

# (Optional) Run e2e tests if available
npm run test:e2e
```

---

## ✅ Code Changes Validated

### 1. **BarContext.tsx** (Line 83)
```typescript
// ❌ OLD: const operatingMode = settings?.operating_mode || 'simplified';
// ✅ NEW: const operatingMode = settings?.operating_mode || 'full';
```
**Validation**: BarContext.test.ts verifies default is 'full'

---

### 2. **useCanWorkOffline.ts** (Complete Rewrite)
```typescript
✅ Added useMemo wrapper
✅ Explicit dependencies: [currentSession?.role, isSimplifiedMode]
✅ Centralized logic: isManagerRole || isSimplifiedMode
```
**Validation**: useCanWorkOffline.test.ts verifies all role/mode combinations and memoization

---

### 3. **useSalesMutations.ts** (Lines 114-115)
```typescript
// ✅ MOVED: useCanWorkOffline() from inside mutationFn to top-level
const canWorkOffline = useCanWorkOffline();  // ← Top-level (correct)

const mutationFn = async (data: CreateSaleData) => {
  // canWorkOffline is captured here, not called here
  if (!canWorkOffline && networkManager.shouldBlockNetworkOps()) {
    throw new Error('Cannot create sale offline in full mode');
  }
};
```
**Validation**: Fix adheres to React Hooks Rules (hooks only at top-level)

---

### 4. **20260223180000_fix_simplified_mode_rls_and_rpc.sql**
```sql
✅ RLS Policy: Replaced LIMIT 1 with EXISTS query
✅ RPC: Changed DATE(s.created_at - INTERVAL '6 hours') to business_date >= ... AND business_date <=
```
**Validation**: test_rls_simplified_mode.sql verifies multi-bar manager access

---

### 5. **20251226120000_add_operating_mode_at_creation.sql**
```sql
-- ❌ OLD: WHERE operating_mode_at_creation IS NULL OR operating_mode_at_creation = 'full'
-- ✅ NEW: WHERE operating_mode_at_creation IS NULL
```
**Validation**: test_backfill_idempotence.sql verifies idempotency

---

## 📊 Test Execution Checklist

- [ ] **TypeScript Tests**: Run `npm run test` - All tests pass (0 failures)
- [ ] **SQL Test #1**: Run test_rls_simplified_mode.sql - "PASS ✅" message
- [ ] **SQL Test #2**: Run test_backfill_idempotence.sql - Both runs show "PASS ✅"
- [ ] **Build Verification**: Run `npm run build` - No errors
- [ ] **Code Review**: All changes reviewed and approved
- [ ] **Git Commit**: Create commit with all fixes and tests
- [ ] **Staging Deploy**: Push to staging branch for CI/CD validation
- [ ] **Production Deploy**: After staging validation, deploy to production

---

## 🎯 Key Test Insights

### Security-Critical Test
The **useCanWorkOffline.test.ts** includes a critical security validation:
```typescript
it('should PREVENT server from working offline in full mode', () => {
  // Server role + full mode = MUST return false
  expect(result.current).toBe(false);  // ← Security boundary
});
```
This ensures servers cannot create sales offline in full mode, maintaining data integrity.

### Idempotence Validation
The **test_backfill_idempotence.sql** runs the migration twice to prove:
- First run: Updates NULL values to 'full'
- Second run: Makes no changes (idempotent)
- Historical records ('simplified') are never overwritten

This prevents data corruption if the migration runs multiple times.

### Multi-Bar Access Validation
The **test_rls_simplified_mode.sql** verifies that managers with access to multiple bars can:
- Create sales in Bar 1
- Create sales in Bar 2
- Validate sales in BOTH bars (not just one)

This proves the EXISTS fix resolves the LIMIT 1 random selection bug.

---

## 📚 Files Created/Modified

### New Test Files
- ✅ `src/__tests__/BarContext.test.ts` (158 lines)
- ✅ `src/hooks/__tests__/useCanWorkOffline.test.ts` (226 lines)
- ✅ `supabase/tests/test_rls_simplified_mode.sql` (87 lines)
- ✅ `supabase/tests/test_backfill_idempotence.sql` (109 lines)

### Modified Code Files
- ✅ `src/context/BarContext.tsx` (1 line changed)
- ✅ `src/hooks/useCanWorkOffline.ts` (complete rewrite, 32 lines)
- ✅ `src/hooks/useSalesMutations.ts` (2 lines moved, 1 comment added)

### Database Migrations
- ✅ `supabase/migrations/20260223180000_fix_simplified_mode_rls_and_rpc.sql` (126 lines)
- ✅ `supabase/migrations/20251226120000_add_operating_mode_at_creation.sql` (1 line modified)

---

## 🔄 Next Steps After Validation

1. **All Tests Pass?** → Proceed to git commit
2. **Test Failure?** → Review specific test output, fix code, re-run
3. **After Commit**: Push to staging for CI/CD pipeline validation
4. **After Staging**: Schedule production deployment window

---

## 📞 Support

For test execution issues:
- **TypeScript Tests**: Check `npm run test` output
- **SQL Tests**: Check Supabase SQL Editor "NOTICE" panel for messages
- **Build Issues**: Run `npm run build` and check errors

---

**Created**: 2026-02-23
**Status**: Ready for Test Execution ✅
