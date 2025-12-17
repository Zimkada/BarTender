# Bugs Found & Fixed - 2025-12-17

**Total Bugs Found**: 2
**Total Bugs Fixed**: 2
**Severity**: Both Critical (Feature blocking)
**Root Cause**: Database layer (RPC + Schema)

---

## 🐛 BUG #1: Variable Used as Column Name in RPC

### Error Message
```
AuthService.setupPromoterBar error: Error: column "v_bar_id" of relation "bar_members" does not exist
```

### Affected Code
**File**: `supabase/migrations/20251215180000_fix_user_management_security.sql`
**Function**: `setup_promoter_bar(p_owner_id UUID, p_bar_name TEXT, p_settings JSONB)`
**Line**: ~54 (in INSERT statement)

### What Was Wrong

```sql
-- ❌ INCORRECT (Bug)
INSERT INTO bar_members (
  user_id,
  v_bar_id,           -- ERROR: v_bar_id is a VARIABLE, not a column name!
  role,
  assigned_by,
  joined_at,
  is_active
) VALUES (
  p_owner_id,
  v_bar_id,           -- This is correct (variable in VALUES)
  'promoteur',
  p_owner_id,
  NOW(),
  true
);
```

### Root Cause

**PL/pgSQL Syntax Error**: In an INSERT statement, the clause lists column names, and VALUES provides values.

```
INSERT INTO table_name (column1, column2, ...) VALUES (value1, value2, ...)
                       ↑ Must be actual column names
                                              ↑ Can be values, variables, expressions
```

The code mistakenly used the variable name `v_bar_id` where the actual column name `bar_id` should be.

### The Fix

```sql
-- ✅ CORRECT (Fixed)
INSERT INTO bar_members (
  user_id,
  bar_id,             -- Correct: actual column name from the bar_members table
  role,
  assigned_by,
  joined_at,
  is_active
) VALUES (
  p_owner_id,
  v_bar_id,           -- Correct: variable containing the bar ID value
  'promoteur',
  p_owner_id,
  NOW(),
  true
);
```

### Migration Applied
**File**: `supabase/migrations/20251217000000_fix_setup_promoter_bar_rpc.sql`

**What it does**:
1. Drops the buggy function
2. Recreates it with the corrected column name
3. Adds RAISE NOTICE statements for debugging
4. Grants execute permissions

**How to verify the fix**:
```sql
-- Query the function to confirm it was updated
SELECT definition FROM pg_proc
WHERE proname = 'setup_promoter_bar';

-- Should show: 'bar_id,' (not 'v_bar_id,')
```

### Impact
- **Severity**: 🔴 Critical (Feature completely blocked)
- **Scope**: Only affects `setup_promoter_bar()` RPC
- **Data**: No data loss, just prevented bar creation
- **Users**: Super admins cannot create bars for promoters

---

## 🐛 BUG #2: NOT NULL Constraint on Legacy Column

### Error Message
```
AuthService.setupPromoterBar error: Error: null value in column "name" of relation "bar_categories" violates not-null constraint
```

### Affected Code
**Table**: `bar_categories`
**Column**: `name`
**Constraint**: NOT NULL
**Reason for Constraint**: Unknown (legacy from older schema version)

### What Was Wrong

The `bar_categories` table has a `name` column with NOT NULL constraint, but:

1. **Modern schema** doesn't use a simple `name` column
2. **Modern approach** uses: `global_category_id` (for linked global categories) OR `custom_name` (for custom categories)
3. **When RPC inserts** linked global categories, it only provides:
   ```sql
   INSERT INTO bar_categories (bar_id, global_category_id, is_active)
   ```
   → Missing the `name` field!
4. **Result**: NOT NULL constraint violation

### Root Cause

**Schema Evolution Mismatch**:

| Version | Approach | bar_categories Columns |
|---------|----------|------------------------|
| Legacy | Simple names per bar | `name` (simple) |
| Modern | Hybrid approach | `global_category_id` + `custom_name` |
| Production | Both exist | Has `name` column (legacy) + new columns (modern) |

**Timeline**:
- `001_initial_schema.sql`: Modern schema defined (NO `name` column)
- Production: Contains legacy `name` column (from older deploy)
- `019_ensure_tables_and_relationships.sql`: Added `global_category_id`, `custom_name`, `custom_color`
- `022_fix_bar_categories_schema.sql`: Made `name` nullable (first fix attempt)
- `20251216060000`: Mistakenly made it NOT NULL again
- `20251217000001`: Made it nullable again (final fix)

### The Fix

```sql
-- Migration: 20251217000001_fix_bar_categories_name_constraint.sql

-- 1. Check if column exists and is NOT NULL
DO $$
DECLARE
  v_column_exists BOOLEAN;
  v_is_not_null BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bar_categories' AND column_name = 'name'
  ) INTO v_column_exists;

  IF v_column_exists THEN
    SELECT is_nullable = 'NO' INTO v_is_not_null
    FROM information_schema.columns
    WHERE table_name = 'bar_categories' AND column_name = 'name';

    IF v_is_not_null THEN
      -- 2. Make the column nullable
      ALTER TABLE bar_categories ALTER COLUMN name DROP NOT NULL;
    END IF;
  END IF;
END $$;

-- 3. Fill any existing NULL values with generated names (data safety)
UPDATE bar_categories
SET name = 'Category ' || SUBSTRING(id::text, 1, 8)
WHERE name IS NULL AND global_category_id IS NOT NULL;

-- 4. Reload Supabase schema cache
NOTIFY pgrst, 'reload schema';
```

### Migration Applied
**File**: `supabase/migrations/20251217000001_fix_bar_categories_name_constraint.sql`

**What it does**:
1. Checks if the `name` column exists
2. Checks if it's constrained as NOT NULL
3. Makes it NULLABLE (safely)
4. Fills any NULL values with generated names for data integrity
5. Reloads the schema cache

**How to verify the fix**:
```sql
-- Check the column constraint
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'bar_categories' AND column_name = 'name';

-- Should show: is_nullable = 'YES'

-- Check that no bar_categories have NULL names
SELECT COUNT(*) as null_names
FROM bar_categories
WHERE name IS NULL;

-- Should show: 0
```

### Impact
- **Severity**: 🔴 Critical (Feature completely blocked)
- **Scope**: Affects any RPC that inserts into `bar_categories` without providing `name`
- **Data**: Migration fills NULL names, no data loss
- **Users**: Bars cannot be created with default categories

---

## 📊 Bug Comparison

| Aspect | Bug #1 | Bug #2 |
|--------|--------|--------|
| **Error** | Column doesn't exist | Constraint violation |
| **Layer** | RPC function | Database schema |
| **Root Cause** | Syntax error | Schema mismatch |
| **Difficulty to Spot** | Hard (typo, looks similar) | Medium (legacy column) |
| **Data Impact** | None | Fills NULLs safely |
| **Fix Complexity** | Drop/recreate function | Make column nullable |
| **Production Impact** | Feature doesn't work | Feature doesn't work |
| **Related To** | PL/pgSQL best practices | Database versioning |

---

## 🔍 Why These Bugs Weren't Caught Earlier

### Bug #1: Variable as Column Name
- **Reason**: The RPC was never executed in production before
- **Why Now**: New feature calls `setup_promoter_bar()` for first time
- **Prevention**: Code review would catch this (typo in variable name)
- **Lesson**: Always test RPCs before deploying

### Bug #2: NOT NULL on Legacy Column
- **Reason**: Production database has legacy schema + modern schema coexisting
- **Why Now**: New feature uses INSERT without populating legacy `name` field
- **Prevention**: Schema validation would catch this (column exists, is NOT NULL, but not used)
- **Lesson**: Schema evolution must be carefully managed

---

## ✅ Verification Steps

### After Deploying Migrations

**In Supabase SQL Editor**:

```sql
-- Verify Bug #1 Fix
SELECT definition FROM pg_proc
WHERE proname = 'setup_promoter_bar';
-- Look for: 'bar_id,' not 'v_bar_id,'

-- Verify Bug #2 Fix
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'bar_categories' AND column_name = 'name';
-- Should show: 'YES'

-- Test the RPC works
SELECT * FROM setup_promoter_bar(
  '<promoter_user_id>'::uuid,
  'Test Bar',
  '{"address": "123 Main St"}'::jsonb
);
-- Should return: {"success": true, "bar_id": "...", "bar_name": "Test Bar"}

-- Verify categories were created
SELECT COUNT(*) FROM bar_categories WHERE is_system = true;
-- Should show: 7 (the system categories)
```

**In Browser Console**:
```javascript
// After feature deployment, try creating a bar
// Should NOT show errors:
// - "column v_bar_id does not exist"
// - "null value in column name ... violates not-null constraint"
```

---

## 🎓 Lessons Learned

### 1. PL/pgSQL Column vs Variable Names
```sql
-- WRONG
INSERT INTO table (variable_name) VALUES (value);

-- RIGHT
INSERT INTO table (column_name) VALUES (variable_name);
```
Always double-check that INSERT column list uses COLUMN names, not VARIABLE names.

### 2. Schema Evolution in Production
- Keep track of all schema versions
- Test migrations on a replica of production schema
- Document why legacy columns still exist
- Plan deprecation path for old columns

### 3. RPC Testing
- Test RPCs with the same permissions as real users
- Test before deploying new features that use them
- Include RPC calls in integration tests

### 4. Data Integrity
- Always fill NULL values before adding NOT NULL constraints
- Document why constraints exist
- Consider adding comments to migrations explaining legacy columns

---

## 📝 Summary

**Both bugs were database layer issues**, not frontend code:
- ✅ Frontend code was correct
- ❌ RPC had syntax error
- ❌ Database schema had legacy constraint

**Fixes were straightforward** once root causes identified:
- ✅ Fix #1: Change one variable name in RPC
- ✅ Fix #2: Make one column nullable + fill NULL values

**Feature is now ready** for production deployment after migrations applied.

---

**Last Updated**: 2025-12-17
**Status**: ✅ All bugs fixed and documented
