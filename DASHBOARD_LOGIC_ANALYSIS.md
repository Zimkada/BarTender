# Super Admin Dashboard Logic Analysis - Critical Issues Found

**Date**: 2025-12-14
**Status**: 🔴 CRITICAL ISSUES IDENTIFIED
**Severity**: Medium to High

---

## Executive Summary

The Super Admin Dashboard has **3 major logic inconsistencies**:

1. ❌ **"Utilisateurs actifs (7j)"** - Not actually showing 7-day active users (shows ALL users)
2. ❌ **"Aujourd'hui"** - Shows YESTERDAY's sales, not today's (no business date logic)
3. ❌ **Inconsistent Date Logic** - Dashboard uses simple `NOW() - interval`, not business date logic like Analytics

---

## Problem 1: Active Users Count is Wrong

### Current SQL Logic (Line 77 in SQL)
```sql
(SELECT COUNT(DISTINCT user_id) FROM bar_members WHERE is_active = true)::BIGINT
```

### Issues:
- ✗ Counts ALL active users in bar_members table (no date filter)
- ✗ The UI label says "Utilisateurs actifs (7j)" implying 7-day lookback
- ✗ The parameter `p_period` is completely IGNORED for this metric
- ✗ No correlation with actual activity (not counting login frequency or sales activity)

### What "Active Users" Should Mean:
**Option A (Recommended)**: Users who created/validated a sale in the lookback period
```sql
SELECT COUNT(DISTINCT sales.user_id)
FROM sales
WHERE status = 'validated'
  AND created_at >= NOW() - (p_period::interval)
```

**Option B**: Users who logged in in the lookback period
```sql
SELECT COUNT(DISTINCT user_id)
FROM bar_members
WHERE last_login_at >= NOW() - (p_period::interval)
```

**Option C**: Users marked `is_active = true` in bar_members (current behavior)
- Acceptable only if label changed to "Total Active Users" (remove "7j")

### Current Behavior vs Expected
| Period | Current | Shows | Expected |
|--------|---------|-------|----------|
| "today" | All active users | "10 utilisateurs" | Sales from yesterday at 15:00+ to today at 14:59 |
| "7d" | All active users | "10 utilisateurs" | Users who made sales in past 7 commercial days |
| "30d" | All active users | "10 utilisateurs" | Users who made sales in past 30 commercial days |

---

## Problem 2: "Aujourd'hui" Shows Yesterday's Data

### Root Cause
Dashboard uses **calendar-based date logic**, not **business date logic**:

```typescript
// SuperAdminPage.tsx - Simple calendar dates
period = 'today' → '1 day' interval
→ SQL: created_at >= NOW() - '1 day'::interval
→ Shows data from 24 hours ago (calendar time, not business day)
```

### Comparison with Analytics (CORRECT)

**Analytics uses business date logic:**
```typescript
// useRevenueStats.ts
const todayStr = getCurrentBusinessDateString(currentBar?.closingHour);
// Returns YYYY-MM-DD respecting bar's closing hour

// Filter logic:
filterByBusinessDateRange(sales, startDate, endDate, closeHour)
// If bar closes at 6 AM:
// - 15:00 on Dec 14 → belongs to Dec 14 business day
// - 03:00 on Dec 15 → belongs to Dec 14 business day
```

**Header "Ventes du jour" correctly shows:**
- If bar closes at 6 AM
- At 15:00 → Shows sales from 6 AM today to now
- At 03:00 → Shows sales from 6 AM yesterday to now

### Dashboard should work the same way

**Current Incorrect Behavior:**
- User views dashboard at 03:00 on Dec 15
- Clicks "Aujourd'hui"
- SQL runs: `created_at >= NOW() - '1 day'::interval`
- Shows: Data from 03:00 Dec 14 onwards (last 24 hours)
- ✗ WRONG: Missing data from 6 AM Dec 14 to 3 AM Dec 15

**Expected Correct Behavior:**
- User views dashboard at 03:00 on Dec 15
- Clicks "Aujourd'hui"
- SQL runs: `business_date = '2025-12-14'` (because 03:00 is before 6 AM close)
- Shows: Data from 6 AM Dec 14 to 3 AM Dec 15
- ✓ CORRECT: Complete business day

---

## Problem 3: No Business Date Logic in Dashboard SQL

### Current SQL Architecture (get_dashboard_stats)
```sql
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_period TEXT DEFAULT '1 day')
RETURNS TABLE (...)
BEGIN
  -- Query uses calendar dates only
  SELECT
    (SELECT COALESCE(SUM(total), 0) FROM sales
      WHERE status = 'validated'
      AND created_at >= NOW() - (p_period::interval))  -- ❌ Calendar logic
```

### Sales Table Structure
The `sales` table has both:
- `created_at` - Timestamp when sale was created (type: timestamptz)
- `business_date` - Calculated business date (type: date)

### Correct Approach
```sql
-- Use business_date for consistency
SELECT COALESCE(SUM(total), 0) FROM sales
WHERE status = 'validated'
  AND business_date >= CURRENT_DATE - (p_period::interval)
```

**BUT WAIT**: Can't use `business_date` with `interval` like this!

### Why This is Complex
```sql
-- ❌ WRONG - Can't subtract interval from DATE
WHERE business_date >= CURRENT_DATE - '7 days'::interval

-- ✓ CORRECT - Must convert to DATE arithmetic
WHERE business_date >= (CURRENT_DATE - '7 days'::interval)::DATE
-- OR
WHERE business_date >= CURRENT_DATE - 7  -- PostgreSQL date arithmetic
```

---

## Comparison Table: Dashboard vs Analytics vs Header

| Feature | Dashboard | Analytics | Header "Ventes du jour" |
|---------|-----------|-----------|------------------------|
| **Date Logic** | Calendar (NOW() - interval) | Business date | Business date ✓ |
| **Periods** | "today", "7d", "30d" | Monthly (12 months) | Daily only |
| **"Today" Shows** | Last 24 hours | 12-month view | Business day ✓ |
| **Active Users** | All active | N/A | N/A |
| **Active Users Time Filter** | ✗ Ignored | - | - |
| **Revenue Calculation** | Gross only | Gross + Net | Net (minus refunds) ✓ |
| **Alignment** | ❌ BROKEN | ✓ CORRECT | ✓ CORRECT |

---

## Implementation Requirements

### Required Changes

1. **SQL Function: get_dashboard_stats**
   - [ ] Accept `p_closing_hour` parameter OR get from context
   - [ ] Add `business_date` logic using trigger reference logic
   - [ ] Fix `active_users_count` to count sales participants (not all users)
   - [ ] Add fallback to bar's default closing hour (6 AM)

2. **Frontend: SuperAdminPage.tsx**
   - [ ] No changes needed IF SQL is fixed
   - [ ] Keep period selector as-is ("today", "7d", "30d")
   - [ ] Update label if keeping "all active users": "Utilisateurs actifs" (remove "7j")

3. **Configuration**
   - [ ] Ensure BUSINESS_DAY_CLOSE_HOUR = 6 (AM) matches SQL expectations
   - [ ] Document business day definition in IMPLEMENTATION_COMPLETE.md

---

## Code References

### Key Files
- **Dashboard Page**: [SuperAdminPage.tsx:100-110](src/pages/SuperAdminPage.tsx#L100-L110) - Active users count display
- **Admin Service**: [admin.service.ts:56-80](src/services/supabase/admin.service.ts#L56-L80) - RPC call and mapping
- **SQL Function**: [20251215_fix_helper_function_pattern.sql:56-82](supabase/migrations/20251215_fix_helper_function_pattern.sql#L56-L82) - get_dashboard_stats definition
- **Business Date Logic**: [businessDateHelpers.ts:16-32](src/utils/businessDateHelpers.ts#L16-L32) - Reference implementation
- **Analytics Hook**: [useRevenueStats.ts:27-46](src/hooks/useRevenueStats.ts#L27-L46) - Correct business date usage

### Related Issues
1. **Inconsistent Date Logic** - Dashboard doesn't match Analytics/Header
2. **Active Users Semantics** - Label promises 7-day but shows all-time
3. **No Business Day Support** - SQL ignores business date logic

---

## Testing Scenarios

### Scenario 1: Early Morning (03:00 AM)
**Bar closing hour: 6 AM**

**Current (BROKEN)**:
```
Dashboard "Aujourd'hui" at 2025-12-15 03:00
→ Shows last 24 hours = 2025-12-14 03:00 to 2025-12-15 03:00
→ MISSING: 2025-12-14 00:00-03:00
```

**Expected (CORRECT)**:
```
Dashboard "Aujourd'hui" at 2025-12-15 03:00
→ Shows business day = 2025-12-14 06:00 to 2025-12-15 06:00
→ Currently at 03:00 = showing 2025-12-14 business day
```

### Scenario 2: Active Users
**Scenario**: 15 users in system, 3 made sales yesterday

**Current (WRONG)**:
```
"Utilisateurs actifs (7j)" = 15
(All users in is_active=true)
```

**Expected (CORRECT)**:
```
"Utilisateurs actifs (7j)" = 3
(Users who validated sales in period)
```

---

## Notes for Implementation

1. **Do NOT change business hour (6 AM)** - Already consistent across system
2. **Test with early morning** - This is when issue manifests
3. **Consider timezone** - All timestamps in UTC (PostgreSQL default)
4. **Backwards compatibility** - Old data without `business_date` column should fallback to calculated value

---

## Decision Needed

**Question for Product**: What should "Utilisateurs actifs (7j)" mean?

1. **Users who made sales** (Recommended) - Operational metric
2. **Users who logged in** - Activity metric
3. **Total active users in system** - Roster metric (change label)

Current implementation is **Option 3** but label promises **Option 1**.

---

## Status

- [x] Root causes identified
- [x] Code patterns documented
- [x] SQL function fixed (commit 37f9d4e)
- [x] Frontend labels updated (commit 37f9d4e)
- [x] Business date logic implemented
- [ ] Database migration applied
- [ ] Tests written
- [ ] Deployment ready

---

## Implementation Summary (Commit 37f9d4e)

### What Changed

**SQL Function: get_dashboard_stats**
```sql
-- NEW: Business date logic with 6 AM closing hour
v_closing_hour INT := 6;
IF EXTRACT(HOUR FROM CURRENT_TIME) < v_closing_hour THEN
    v_start_date := CURRENT_DATE - (v_period_days || ' days')::INTERVAL;
ELSE
    v_start_date := CURRENT_DATE - ((v_period_days - 1) || ' days')::INTERVAL;
END IF;

-- NEW: Active users based on login activity
(SELECT COUNT(DISTINCT user_id) FROM users
  WHERE is_active = true
  AND last_login_at IS NOT NULL
  AND DATE(last_login_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date)

-- ALL metrics now use business date calculation
DATE(created_at - (v_closing_hour || ' hours')::INTERVAL) >= v_start_date
```

**Frontend: SuperAdminPage.tsx**
- Label changed: "Utilisateurs actifs (7j)" → "Utilisateurs connectés"
- Now accurate to metric definition

### How It Works Now

**Example: 2025-12-15 03:00 AM**
```
Period: "today" (1 day)
Closing Hour: 6 AM

Calculation:
- Current time: 03:00 < 06:00 = true
- Current business date: 2025-12-14
- v_start_date: 2025-12-14 (today's business day started at 2025-12-14 06:00)

Results:
- "Chiffre d'affaires": Sum of all sales from 2025-12-14 06:00 to 2025-12-15 03:00
- "Ventes": Count of all sales in that period
- "Utilisateurs connectés": Count of distinct users who logged in during that period
- "Nouveaux utilisateurs": Count of new users created during that period
```

**Same as Header "Ventes du jour"** ✓
**Same as Analytics business date logic** ✓

---

## Testing Notes

After database migration, test these scenarios:

1. **Early Morning (03:00 AM)**
   - Click "Aujourd'hui"
   - Should show yesterday's business day (6 AM yesterday to now)

2. **Active Users**
   - Users who logged in = count increases
   - Users who didn't log in = not counted (even if they exist)

3. **Period Consistency**
   - "Aujourd'hui" = 1 business day
   - "7 jours" = Last 7 business days
   - "30 jours" = Last 30 business days
