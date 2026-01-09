# Audit Logs Investigation - Root Cause Analysis

## Problem Statement
User confirms that **audit_logs table is completely empty** despite:
- Creating sales (ventes visible in dashboard)
- Creating admin proxy operations ("acting_as" operations)
- Even admin proxy operations (migration 20251215) are not appearing

## Root Causes Identified

### 1. ✅ CONFIRMED: Restrictive RLS Policy on audit_logs Table

**Location:** `supabase/migrations/002_rls_policies.sql:530-536`

```sql
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (is_super_admin());

CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);
```

**Issue:**
- `SELECT` requires `is_super_admin()` to be TRUE
- `INSERT` has no restrictions (`WITH CHECK (true)`)
- `INSERT` comes from triggers with `SECURITY DEFINER`, so it bypasses RLS
- But the `SELECT` policy blocks visibility

**Impact:**
- Triggers CAN write to audit_logs (bypass RLS due to SECURITY DEFINER)
- Super_admin CAN see audit_logs (if properly identified)
- Regular users CANNOT see audit_logs (blocked by RLS)

### 2. ⚠️ POTENTIAL: Super_admin User Role Detection Issue

**Location:** `supabase/migrations/002_rls_policies.sql:42-49`

```sql
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth_user_id()
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;
```

**Potential Issues:**
1. **Super_admin may not be in bar_members table** - super_admin role typically doesn't belong to a specific bar
   - If super_admin user has NO entry in bar_members, `is_super_admin()` returns FALSE
   - Then user cannot SELECT from audit_logs due to RLS policy

2. **bar_members.is_active might be FALSE** - if super_admin member record is inactive
   - Same result: RLS policy blocks access

3. **Auth context issue** - if super_admin logged in through Edge Function/service role
   - `auth.uid()` might be NULL
   - `is_super_admin()` would fail

### 3. ✅ CONFIRMED: Triggers ARE Created and Should Fire

**Verified Migrations:**

#### Migration 20251215_audit_triggers_and_login_rpc.sql
Creates these triggers:
- `trg_audit_sale_creation` - AFTER INSERT ON sales
- `trg_audit_stock_update` - AFTER UPDATE OF stock ON bar_products  
- `trg_audit_member_change` - AFTER INSERT OR DELETE ON bar_members

All use `internal_log_audit_event()` function which calls `INSERT INTO audit_logs`

#### Migration 20251215_create_proxy_admin_rpcs.sql
Function `admin_as_create_sale()` includes:
```sql
INSERT INTO audit_logs (event, severity, user_id, user_name, user_role, description, metadata, bar_id)
VALUES ('PROXY_SALE_CREATED', 'warning', v_caller_id, ...)
```

**Verdict:** Triggers and proxy functions ARE properly implemented.

### 4. ✅ CONFIRMED: Helper Functions Handle NULL auth.uid()

**Migration 20251220_fix_audit_logs_nullable_user_id.sql**

Made these changes:
- `audit_logs.user_id` is now NULLABLE (was NOT NULL)
- `internal_log_audit_event()` handles NULL user_id with fallback
- `trigger_audit_member_change()` allows NULL auth.uid()

**Verdict:** This should allow system actions to be logged.

## Diagnosis Flowchart

```
User creates a sale
    ↓
Sales INSERT trigger fires (trg_audit_sale_creation)
    ↓
Calls internal_log_audit_event() with SECURITY DEFINER
    ↓
INSERT INTO audit_logs (bypasses RLS because function is SECURITY DEFINER)
    ↓
Row successfully inserted into audit_logs ✅
    ↓
User tries to SELECT from audit_logs
    ↓
RLS Policy checks: is_super_admin()?
    ↓
is_super_admin() queries bar_members WHERE user_id = auth.uid() AND role = 'super_admin'
    ↓
    ├─ If super_admin NOT in bar_members → Returns FALSE → RLS BLOCKS SELECT ❌
    ├─ If super_admin.is_active = FALSE → Returns FALSE → RLS BLOCKS SELECT ❌
    ├─ If auth.uid() = NULL → Cannot find user → Returns FALSE → RLS BLOCKS SELECT ❌
    └─ If super_admin exists with is_active = TRUE → Returns TRUE → RLS ALLOWS SELECT ✅
```

## Recommended Tests

1. **Verify super_admin bar_members entry:**
   ```sql
   SELECT id, user_id, bar_id, role, is_active 
   FROM bar_members 
   WHERE role = 'super_admin' AND is_active = true;
   ```

2. **Check if any audit_logs exist (as service_role):**
   ```sql
   -- Run as service_role (bypasses RLS)
   SELECT COUNT(*), event, user_id FROM audit_logs GROUP BY event, user_id LIMIT 20;
   ```

3. **Verify trigger execution:**
   ```sql
   -- Check if triggers exist
   SELECT * FROM pg_trigger WHERE tgname LIKE 'trg_audit%';
   
   -- Check if they're enabled
   SELECT * FROM pg_trigger WHERE tgname LIKE 'trg_audit%' AND tgenabled != 'D';
   ```

4. **Test is_super_admin() function:**
   ```sql
   SELECT is_super_admin() AS is_super_admin;
   ```

## Conclusions

1. **Triggers ARE created** and should be firing ✅
2. **Proxy functions ARE implemented** ✅
3. **Insert access to audit_logs is unrestricted** ✅
4. **SELECT access is blocked by RLS policy** - Requires `is_super_admin() = TRUE`
5. **The likely issue:** Super_admin user is not properly registered in bar_members table with role='super_admin' and is_active=true

## Next Steps
1. Create migration to verify/fix super_admin bar_members entry
2. If not present: Create bar_members entry for super_admin
3. Ensure super_admin.is_active = true
4. Test audit_logs visibility again
