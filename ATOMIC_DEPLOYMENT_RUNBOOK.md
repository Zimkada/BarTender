# Mode Switching - Atomic Deployment Runbook

**Version**: 1.0
**Date**: 24 Décembre 2025
**Status**: ✅ **COMPLETE** - Mode Switching Feature Ready for Production

---

## 📋 Executive Summary

This runbook documents the **atomic deployment strategy** for the Mode Switching feature in BarTender. The goal is to safely rollout server_id tracking across all bars without breaking existing functionality or losing data.

**Key Principles**:
- ✅ Zero-downtime deployment
- ✅ Gradual rollout with feature flags
- ✅ Instant rollback capability
- ✅ Comprehensive monitoring and audit trails
- ✅ Data integrity guaranteed via migrations + RLS policies

---

## 🎯 Deployment Phases

### Phase 1: Pre-Deployment Verification (2 hours)

**Goal**: Ensure all systems are ready and migrations are tested

#### 1.1 Code Review & Testing
- [ ] Verify all 9 bug fixes are merged to `feature/switching-mode`
- [ ] Run full test suite (unit + integration)
- [ ] Performance test with production-like data (10K+ sales)
- [ ] Load test: simulate 100+ sales/second to verify RLS index performance
- [ ] Test rollback scenario: revert feature flag and verify no data loss

#### 1.2 Database Backup
```bash
# Create full database backup before any migrations
pg_dump <production_db> > /backups/bartender_pre_mode_switching_$(date +%Y%m%d_%H%M%S).sql

# Verify backup integrity
pg_restore --validate /backups/bartender_pre_mode_switching_*.sql
```

#### 1.3 Feature Flag Verification
- [ ] Confirm `ENABLE_SWITCHING_MODE = false` in production config
- [ ] Confirm `SHOW_SWITCHING_MODE_UI = false` in production config
- [ ] Both flags must be OFF during code deployment

---

### Phase 2: Database Migrations (30 minutes)

**Goal**: Add server_id columns and supporting infrastructure **WITHOUT** enabling the feature yet

#### 2.1 Migration Sequence

**IMPORTANT**: Execute migrations in this exact order!

```bash
# Connection: Production Supabase CLI or direct psql connection
cd supabase/migrations/

# STEP 1: Add server_id columns to core tables
psql -d $DB_URL -f 20251224130000_add_server_id_to_sales_consignments_returns.sql

# Verify: Check columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name='sales' AND column_name='server_id';
-- Expected: 1 row returned with 'server_id'

# STEP 2: Create server_name_mappings table for simplified mode
psql -d $DB_URL -f 20251224130100_add_server_name_mappings_table.sql

# Verify: Table created
SELECT COUNT(*) FROM server_name_mappings;
-- Expected: 0 rows (empty table initially)

# STEP 3: Add RLS policy for simplified mode sales creation
psql -d $DB_URL -f 20251224130300_add_simplified_mode_sale_creation_policy.sql

# Verify: Policy enabled (visual check in Supabase UI)
SELECT COUNT(*) FROM pg_policies
WHERE tablename='sales' AND policyname LIKE '%simplified%';
-- Expected: 1+ rows

# STEP 4: Fix Foreign Key constraints (ON DELETE SET NULL)
psql -d $DB_URL -f 20251224130400_fix_server_id_foreign_keys_on_delete.sql

# Verify: FK constraints updated
SELECT constraint_name, delete_option
FROM information_schema.referential_constraints
WHERE table_name='sales' AND constraint_name LIKE '%server_id%';
-- Expected: ON DELETE SET NULL

# STEP 5: Add performance index for JSONB operatingMode
psql -d $DB_URL -f 20251224130500_add_operating_mode_index.sql

# Verify: Index created
SELECT indexname FROM pg_indexes
WHERE tablename='bars' AND indexname LIKE '%operating_mode%';
-- Expected: 1 row with 'idx_bars_operating_mode'

# STEP 6: Safely backfill existing sales with server_id
psql -d $DB_URL -f 20251224130600_robust_backfill_server_id.sql

# Verify: Backfill results
SELECT fallback_used, COUNT(*) as count FROM migration_server_id_log
GROUP BY fallback_used;
-- Expected: See successful mappings + any fallbacks used

# Check for warnings
SELECT * FROM migration_server_id_log
WHERE fallback_used = true
ORDER BY created_at DESC
LIMIT 10;
```

#### 2.2 Post-Migration Validation

```sql
-- 1. Verify server_id population
SELECT
  COUNT(*) as total_sales,
  COUNT(server_id) as with_server_id,
  COUNT(*) - COUNT(server_id) as without_server_id
FROM sales;

-- Expected: with_server_id > 95% of total
-- If < 95%, investigate missing mappings before proceeding

-- 2. Verify Foreign Key integrity
SELECT COUNT(*) FROM sales
WHERE server_id IS NOT NULL AND server_id NOT IN (SELECT id FROM auth.users);
-- Expected: 0 rows (no orphaned FKs)

-- 3. Verify index performance
EXPLAIN ANALYZE
SELECT COUNT(*) FROM bars
WHERE settings->>'operatingMode' = 'simplified';
-- Expected: Index scan (not sequential scan)

-- 4. Check for any migration audit logs with failures
SELECT COUNT(*) FROM migration_server_id_log
WHERE fallback_reason LIKE '%failed%';
-- Expected: 0 or very low number
```

**If validation fails**:
- ❌ STOP deployment
- Review migration audit logs: `SELECT * FROM migration_server_id_log WHERE fallback_used = true`
- Check server_name_mappings are correctly configured
- Rollback migrations and fix root cause
- Contact feature owner for troubleshooting

---

### Phase 3: Code Deployment (15 minutes)

**Goal**: Deploy feature flag OFF, code with server_id support, UI feature flag OFF

#### 3.1 Pre-Deployment Checklist

- [ ] Feature flag OFF: `ENABLE_SWITCHING_MODE = false`
- [ ] UI flag OFF: `SHOW_SWITCHING_MODE_UI = false`
- [ ] All bug fixes merged to `feature/switching-mode`
- [ ] Code builds successfully: `npm run build`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] No ESLint errors: `npm run lint`

#### 3.2 Deployment Steps

```bash
# 1. Build production bundle
npm run build

# 2. Deploy to staging (if available)
npm run deploy:staging

# 3. Run smoke tests on staging
npm run test:e2e:smoke

# 4. If all pass, deploy to production
npm run deploy:production

# 5. Verify deployment
curl https://api.bartender.app/health
# Expected: 200 OK with build hash matching deployed version
```

#### 3.3 Post-Deployment Checks (Monitoring)

Monitor for **15 minutes** after deployment:

```javascript
// Monitor these metrics:
1. Error rate: Should remain < 0.1%
2. API latency: P95 < 500ms (especially sales creation)
3. RLS policy violations: Should be 0
4. Server_id resolution errors: Should be 0 (feature flag is OFF)
5. Database connection pool: Should be stable
```

**Alert Thresholds**:
- Error rate > 1% → Immediate rollback
- P95 latency > 1000ms → Investigate RLS performance
- 10+ RLS policy violations → Investigate policy logic

---

### Phase 4: Feature Flag Progressive Rollout (1-3 days)

**Goal**: Enable Mode Switching for a subset of bars, monitor, then expand

#### 4.1 Rollout Schedule

**Day 1 - Phase 4a: Internal Testing (10% of bars)**
```sql
-- Enable for 1-2 internal test bars
UPDATE bars SET settings = jsonb_set(
  settings,
  '{operatingMode}',
  '"simplified"'::jsonb
)
WHERE id IN (SELECT id FROM bars WHERE name IN ('Test Bar 1', 'Test Bar 2'))
  AND settings->>'operatingMode' IS NULL;

-- Set feature flags for internal testers only
-- (via configuration: whitelist bar IDs or user IDs)
```

**Internal Testing Checklist**:
- [ ] Create sales in simplified mode
- [ ] Verify server_id is populated correctly
- [ ] Test server name mapping resolution
- [ ] Test error blocking (try invalid server names)
- [ ] Verify analytics show correct server performance
- [ ] Test consignments/returns with server_id
- [ ] Test role-based filtering (servers see only their sales)
- [ ] Monitor logs for any errors

**Day 2 - Phase 4b: Gradual Rollout (50% of bars)**
```sql
-- If Phase 4a successful, enable for 50% of bars
UPDATE bars
SET settings = jsonb_set(settings, '{operatingMode}', '"simplified"'::jsonb)
WHERE id IN (
  SELECT id FROM bars
  WHERE id < (SELECT max(id) FROM bars) / 2  -- First 50% by ID
    AND settings->>'operatingMode' IS NULL
)
LIMIT 10;  -- Still gradual
```

**Day 3 - Phase 4c: Full Rollout (100%)**
```sql
-- If Phase 4b successful after 24 hours monitoring, enable for all
UPDATE bars
SET settings = jsonb_set(settings, '{operatingMode}', '"simplified"'::jsonb)
WHERE settings->>'operatingMode' IS NULL;
```

#### 4.2 Monitoring During Rollout

Track these dashboards continuously:

1. **Error Tracking**
```sql
SELECT
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as error_count,
  COUNT(DISTINCT bar_id) as affected_bars
FROM audit_logs
WHERE error_message LIKE '%server_id%'
GROUP BY minute
ORDER BY minute DESC
LIMIT 60;
```

2. **Server_id Resolution Success Rate**
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(CASE WHEN server_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM sales
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

3. **RLS Policy Performance**
```sql
-- Monitor slow queries caused by RLS
SELECT
  query,
  COUNT(*) as executions,
  AVG(duration) as avg_duration_ms
FROM pg_stat_statements
WHERE query LIKE '%settings%operatingMode%'
GROUP BY query
ORDER BY avg_duration_ms DESC;
```

4. **Feature Flag Adoption**
```sql
SELECT
  CASE WHEN ENABLE_SWITCHING_MODE THEN 'Enabled' ELSE 'Disabled' END as feature_status,
  COUNT(*) as bar_count,
  SUM(CASE WHEN EXTRACT(EPOCH FROM (NOW() - last_sale_at)) < 86400 THEN 1 ELSE 0 END) as active_bars
FROM bars
GROUP BY feature_status;
```

---

## 🔄 Rollback Procedures

### Immediate Rollback (< 5 minutes)

**If critical errors detected during Phase 3-4**:

#### Option A: Feature Flag Rollback (Safest)
```bash
# Disable feature flags immediately
ENABLE_SWITCHING_MODE = false
SHOW_SWITCHING_MODE_UI = false

# Redeploy config (no code change needed)
npm run deploy:config:production

# Affected functionality:
# - Mode Switching UI hidden
# - server_id creation disabled
# - Sales revert to old behavior (created without server_id)
# - Data remains intact (server_id columns still exist)

# Recovery time: < 2 minutes
```

#### Option B: Code Rollback (If code issue)
```bash
# Revert to previous stable commit
git revert <previous_stable_commit_hash>

# Rebuild and redeploy
npm run build && npm run deploy:production

# This undoes server resolution logic but keeps migrations
# Affected: No server_id set on new sales
# Recovery time: 5-10 minutes (depending on CI/CD speed)
```

#### Option C: Database Rollback (Last Resort)
```bash
# ONLY if data corruption suspected
# Requires >= 15 minute downtime window

# 1. Take database offline
systemctl stop supabase-api

# 2. Restore from backup
pg_restore /backups/bartender_pre_mode_switching_<timestamp>.sql

# 3. Re-apply only safe migrations (1-5)
# Skip unsafe migrations that caused issues

# 4. Bring systems back online
systemctl start supabase-api

# Recovery time: 15-30 minutes
```

### Root Cause Analysis After Rollback

```sql
-- Immediately after rollback, investigate
-- 1. Check audit logs for error patterns
SELECT
  error_type,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND error_message LIKE '%server_id%'
GROUP BY error_type
ORDER BY count DESC;

-- 2. Check migration logs for unexpected fallbacks
SELECT
  fallback_reason,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT bar_id) as affected_bars
FROM migration_server_id_log
WHERE fallback_used = true
GROUP BY fallback_reason
ORDER BY count DESC;

-- 3. Check for orphaned sales without server_id
SELECT COUNT(*) as orphaned_sales
FROM sales
WHERE created_at > (NOW() - INTERVAL '1 hour')
  AND server_id IS NULL
  AND bar_id IN (
    SELECT id FROM bars
    WHERE settings->>'operatingMode' = 'simplified'
  );
```

---

## 🔐 Security & Data Integrity

### RLS Policy Verification

The Mode Switching feature relies on RLS policies to prevent unauthorized access. Verify before deployment:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('sales', 'consignments', 'returns')
  AND schemaname = 'public';
-- Expected: All should have rowsecurity = true

-- Check policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('sales', 'consignments', 'returns');
-- Expected: Multiple policies per table (create, select, update, delete)
```

### Data Validation Checklist

- [ ] All sales have `bar_id` (required for RLS)
- [ ] All simplified mode sales have `server_id` (from migration backfill)
- [ ] No orphaned sales (all server_id values reference valid users)
- [ ] FK constraints in place: `server_id` → `auth.users(id)`
- [ ] Indexes created for performance
- [ ] Audit trail table populated with migration details

---

## 📊 Monitoring & Alerting

### Critical Alerts (Requires Immediate Action)

```javascript
// Alert if any of these trigger:
1. server_id resolution error rate > 5% (in last 5 minutes)
2. RLS policy violations > 10 (indicates SQL injection attempt or policy bypass)
3. Orphaned sales created > 0 (server_id = NULL when should not be)
4. DB connection pool > 80% (indicates resource exhaustion)
5. API latency P95 > 1 second (RLS performance degradation)
```

### Warning Alerts (Monitor Closely)

```javascript
// These indicate something may be wrong, investigate:
1. Fallback mappings used > 10% of sales (indicates server mapping issues)
2. Simplified mode adoption < expected (adoption slower than planned)
3. Error logs contain "serverId" > 100 in last hour
4. Performance: migration_server_id_log shows many failures
```

### Health Check Queries

Run these every 5 minutes in production:

```sql
-- 1. Feature adoption rate
SELECT
  COUNT(CASE WHEN settings->>'operatingMode' = 'simplified' THEN 1 END) * 100.0 / COUNT(*) as adoption_rate
FROM bars;

-- 2. Server_id population in last 24 hours
SELECT
  COUNT(CASE WHEN server_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as coverage
FROM sales
WHERE created_at > NOW() - INTERVAL '24 hours';

-- 3. RLS policy performance (should use index)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM sales
WHERE server_id = '<test-server-uuid>'
LIMIT 100;
-- Look for: Index scan (✓ good) vs Sequential scan (✗ bad)

-- 4. Zero errors in last 5 minutes
SELECT COUNT(*) as error_count
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '5 minutes'
  AND level = 'error';
```

---

## 📞 Escalation Procedure

### If Deployment Fails

**Contact Chain** (in order):
1. **Development Team** - First point of contact
   - Assess severity and impact
   - Check logs and audit trails
   - Decide: Proceed with caution, rollback, or abort

2. **DevOps/Database Team** - If migration/database issue
   - Check database health
   - Verify backup integrity
   - Handle rollbacks if needed

3. **Product/Business Team** - If customer impact expected
   - Notify key customers
   - Update status page
   - Coordinate communication

### Communication Template

```
INCIDENT: Mode Switching Deployment Issue

Time: 2025-12-24 14:30 UTC
Severity: [Critical/High/Medium]
Status: [Investigating/Mitigating/Resolved]

Issue: [Brief description]
Impact: [# of bars affected, # of sales affected]
Actions Taken: [Rollback/Pause/Remediation]

Next Update: [Time or "Upon Resolution"]
Contact: [Escalation contact name + phone]
```

---

## ✅ Post-Deployment Verification

### Day 1 After Full Rollout

```sql
-- Verify all systems healthy
1. Check server_id coverage >= 98%
SELECT COUNT(CASE WHEN server_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as coverage
FROM sales WHERE created_at > NOW() - INTERVAL '24 hours';

2. Check zero orphaned sales
SELECT COUNT(*) FROM sales
WHERE server_id IS NOT NULL
  AND server_id NOT IN (SELECT id FROM auth.users);

3. Check RLS enforcement (sample random sales)
-- User should NOT see sales from other servers
SELECT COUNT(*) FROM sales
WHERE server_id != '<current_user_id>'
  AND '<current_user_id>' IN (
    SELECT user_id FROM bar_members
    WHERE bar_id = sales.bar_id
  );
-- Expected: 0 (due to RLS policy)

4. Check feature adoption trend
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as sales_with_server_id,
  (SELECT COUNT(*) FROM sales s2
   WHERE DATE_TRUNC('hour', s2.created_at) = DATE_TRUNC('hour', sales.created_at)) as total_sales
FROM sales
WHERE server_id IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour;
```

### Week 1 After Full Rollout

- [ ] Zero critical errors in error logs
- [ ] server_id coverage >= 98% (daily check)
- [ ] No security incidents related to RLS
- [ ] Customer feedback positive (no usability issues)
- [ ] Performance baseline met (RLS latency < 50ms)

---

## 📝 Deployment Record Template

```markdown
# Mode Switching Deployment Record

**Date**: _______________
**Deployer**: _______________
**Reviewer**: _______________

## Pre-Deployment Verification
- [ ] Database backup created: _______________
- [ ] All tests passing: ✓ / ✗
- [ ] Feature flags OFF: ✓ / ✗
- [ ] Code builds successfully: ✓ / ✗

## Deployment Timeline
- Pre-deployment start: ________
- Migrations start: ________ end: ________
- Code deployment start: ________ end: ________
- Post-deployment monitoring: ________ to ________

## Issues Encountered
[Describe any issues or their absence]

## Monitoring Results (First 24 hours)
- Error rate: ________%
- server_id coverage: ________%
- RLS policy violations: ________
- Performance: ________ ms latency

## Sign-off
Deployer: _______________  Date: _______________
Reviewer: _______________  Date: _______________

**Status**: ✓ Successful / ✗ Rolled Back
```

---

## 🎓 Additional Resources

- [Mode Switching Implementation Status](IMPLEMENTATION_STATUS_MODE_SWITCHING.md)
- [Phase 1 Migration Documentation](PHASE_1_MIGRATION_DOCUMENTATION.md)
- [Database Schema Changes](supabase/migrations/)
- [Feature Flag Configuration](src/config/features.ts)

---

**Document Version**: v1.0
**Last Updated**: 24 Décembre 2025
**Approval**: Ready for Production Deployment
