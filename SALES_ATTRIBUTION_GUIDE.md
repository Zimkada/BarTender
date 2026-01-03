# 📋 Sales Attribution Guide

## Overview

This document defines the three core fields used for sales attribution and tracking in BarTender. Each field has a specific, non-overlapping purpose essential for maintaining data integrity, audit trails, and accurate business metrics.

---

## Field Definitions

### 1. `created_by` (UUID, NOT NULL)
**Purpose:** Technical audit trail - who physically created the sale record

**Populated When:** At sale creation (automatic)

**Who Sets It:**
- **Full Mode:** Server (who creates their own sale)
- **Simplified Mode:** Gérant/Promoteur (who enters the sale on behalf of server)

**Usage:**
- ✅ Audit logs and forensic tracking
- ✅ Determining who initiated the action
- ❌ **DO NOT USE** for business metrics or revenue attribution
- ❌ **DO NOT USE** for sales filtering or analytics

**Example:**
- Full mode: Ahmed creates a sale → `created_by = Ahmed's UUID`
- Simplified mode: Marc (gérant) creates sale for Ahmed → `created_by = Marc's UUID`

---

### 2. `sold_by` (UUID, NOT NULL)
**Purpose:** Business logic source of truth - who receives credit for the sale

**Populated When:** At sale creation (mode-specific logic)

**Who Sets It:**
- **Full Mode:** Server's UUID (who created and sold)
- **Simplified Mode:** Server's UUID (who was assigned the sale, resolved from `server_name_mappings`)

**Usage:**
- ✅ **REQUIRED** for all business metrics (revenue, reports, analytics)
- ✅ Commission calculations and performance tracking
- ✅ Server filtering: `WHERE sold_by = server_id`
- ✅ Revenue attribution and P&L statements
- ✅ Aggregations: `COUNT(DISTINCT sold_by)`, `SUM(total) by sold_by`

**Example:**
- Full mode: Ahmed creates a sale → `sold_by = Ahmed's UUID` (both creator and seller)
- Simplified mode: Marc creates for Ahmed → `sold_by = Ahmed's UUID` (Ahmed gets credit)

---

### 3. `server_id` (UUID, NULLABLE)
**Purpose:** Mode-switching support - identifies assigned server in simplified mode

**Populated When:** At sale creation (mode-specific)

**Who Sets It:**
- **Full Mode:** Server's UUID (same as `sold_by`)
- **Simplified Mode:** Resolved server UUID from dropdown selection + `server_name_mappings` table

**Usage:**
- ✅ Server filtering in simplified mode: `WHERE server_id = ? OR sold_by = ?`
- ✅ Mode-switching support (backward compatibility)
- ✅ Database indexes for performance optimization
- ❌ **DO NOT USE** alone for attribution (always pair with `sold_by`)

**Example:**
- Full mode: Ahmed → `server_id = Ahmed's UUID` (redundant with `sold_by`)
- Simplified mode: Marc selects "Ahmed" → `server_id = Ahmed's UUID from mapping`

---

## Filtering Logic by Role

### **For Servers (Regular Users)**

Servers should see **ONLY** their own sales.

**Query Pattern:**
```sql
WHERE bar_id = ?
  AND (sold_by = ? OR server_id = ?)
```

**Explanation:**
- `sold_by = ?`: Sales they created in full mode
- `server_id = ?`: Sales assigned to them in simplified mode

**Example:**
- Ahmed (server) sees:
  - Full mode sales he created (sold_by = Ahmed)
  - Simplified mode sales Marc assigned to him (server_id = Ahmed)

---

### **For Managers (Gérant, Promoteur, Super Admin)**

Managers should see **ALL** sales for their bar.

**Query Pattern:**
```sql
WHERE bar_id = ?
```

**Explanation:**
- No filtering needed - they have full visibility for oversight and validation

**Example:**
- Marc (gérant) sees all sales in the bar, regardless of who sold or created them

---

## Operating Modes

### **Full Mode**

| Field | Value | Meaning |
|-------|-------|---------|
| `created_by` | Server UUID | Who created the sale |
| `sold_by` | Server UUID | Server selling (same as creator) |
| `server_id` | Server UUID | Server who sold (redundant) |

**Workflow:**
1. Server creates a sale
2. `created_by`, `sold_by`, and `server_id` all set to server's UUID
3. Sale auto-validates (if server) or requires gérant approval (if gérant created)
4. Stock decremented immediately

**Key Point:** In full mode, `created_by = sold_by` (self-attribution)

---

### **Simplified Mode**

| Field | Value | Meaning |
|-------|-------|---------|
| `created_by` | Gérant/Promoteur UUID | Who entered the sale |
| `sold_by` | Server UUID (mapped) | Server credited with the sale |
| `server_id` | Server UUID (mapped) | Server assigned the sale |

**Workflow:**
1. Gérant/Promoteur creates a sale, selects server name from dropdown
2. `created_by = gérant/promoteur's UUID` (who entered it)
3. `sold_by = server's UUID` (resolved from `server_name_mappings`)
4. `server_id = server's UUID` (same as `sold_by`)
5. Sale auto-validates immediately (since gérant created it)
6. Stock decremented on creation

**Key Point:** In simplified mode, `created_by ≠ sold_by` (different roles)

---

## Server Name Mappings

### Purpose
In simplified mode, servers are identified by **display names** (e.g., "Ahmed", "Marie") rather than requiring actual user accounts. The `server_name_mappings` table maintains this mapping.

### Structure
```
server_name_mappings
├── bar_id (which bar)
├── server_name (display name: "Ahmed")
├── user_id (actual user UUID)
└── is_active (boolean)
```

### Rules
1. **Only servers can be mapped** - Gérants/Promoteurs are excluded
2. **Used at sale creation** - Resolves selected name to UUID
3. **Sets both `sold_by` and `server_id`** to the resolved UUID

### Example
```
bar_id: "bar-123"
server_name: "Ahmed"
user_id: "user-uuid-456"
```

When gérant selects "Ahmed" in simplified mode:
- `sold_by` = "user-uuid-456"
- `server_id` = "user-uuid-456"

---

## Validation Fields

### `validated_by` (UUID, NULLABLE)
**Who validated the sale:**
- **Full Mode - Server Creates:** Gérant/Promoteur (validates manually)
- **Full Mode - Gérant Creates:** Gérant (auto-validates)
- **Simplified Mode:** Gérant/Promoteur (auto-validates)

### `validated_at` (TIMESTAMP, NULLABLE)
**When the sale was validated**

### `rejected_by` (UUID, NULLABLE)
**Who rejected the sale (if status = 'rejected')**

### `rejected_at` (TIMESTAMP, NULLABLE)
**When the sale was rejected**

---

## Database Constraints

### NOT NULL Constraints
```sql
-- These fields MUST always be populated
created_by UUID NOT NULL
sold_by UUID NOT NULL
```

### Status Validation Constraint
```sql
-- If validated: both validated_by and validated_at must be set
-- If rejected: both rejected_by and rejected_at must be set
CONSTRAINT validated_fields CHECK (
  (status = 'validated' AND validated_by IS NOT NULL AND validated_at IS NOT NULL) OR
  (status = 'rejected' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL) OR
  (status = 'pending')
)
```

### Foreign Keys
```sql
created_by UUID REFERENCES users(id)
sold_by UUID REFERENCES users(id)
server_id UUID REFERENCES users(id) ON DELETE SET NULL
validated_by UUID REFERENCES users(id)
rejected_by UUID REFERENCES users(id)
```

---

## Analytics & Reporting

### Revenue Attribution
**Always use `sold_by`**, never `created_by`:

```sql
SELECT
  sold_by,
  COUNT(*) AS sales_count,
  SUM(total) AS revenue
FROM sales
WHERE bar_id = ? AND status = 'validated'
GROUP BY sold_by;
```

### Active Servers Count
**Always use `sold_by`**, never `created_by`:

```sql
SELECT COUNT(DISTINCT sold_by) AS active_servers
FROM sales
WHERE bar_id = ? AND status = 'validated' AND business_date = ?;
```

### Server-Specific Metrics
**Combine `sold_by` and `server_id` with OR logic** for filtering:

```sql
SELECT *
FROM sales
WHERE bar_id = ?
  AND (sold_by = ? OR server_id = ?)
  AND status = 'validated';
```

---

## Common Queries

### Get all sales for a specific server
```typescript
// User sees their own sales
const sales = await supabase
  .from('sales')
  .select('*')
  .eq('bar_id', barId)
  .or(`sold_by.eq.${userId},server_id.eq.${userId}`);
```

### Get all sales for a bar (manager view)
```typescript
// Manager sees all sales
const sales = await supabase
  .from('sales')
  .select('*')
  .eq('bar_id', barId);
```

### Revenue report by server
```typescript
// Always use sold_by for business metrics
const report = await supabase
  .from('daily_sales_summary')
  .select('*')
  .eq('bar_id', barId)
  .gte('business_date', startDate)
  .lte('business_date', endDate);
// Column 'active_servers' uses COUNT(DISTINCT sold_by)
```

---

## Migration Impact

### What Changed
1. ✅ FK joins updated: `sales_created_by_fkey` → `sales_sold_by_fkey` (display purposes)
2. ✅ Filters standardized: `created_by` → `sold_by` (analytics)
3. ✅ Materialized views updated: Use `sold_by` for server counts
4. ✅ Rejection bug fixed: Uses `rejected_by` instead of `validated_by`
5. ✅ Server mappings cleaned: Removed gérant/promoteur entries

### What Stayed the Same
1. ✅ `created_by` preserved for audit trails
2. ✅ `server_id` preserved for mode-switching support
3. ✅ Overall filtering logic (`sold_by OR server_id`)
4. ✅ Validation flows (auto-validation, manual approval)

---

## Inconsistencies & Trade-offs

### Semantic Difference Between Modes
**In full mode:** `created_by = sold_by` (person who created also gets credit)
**In simplified mode:** `created_by ≠ sold_by` (gérant creates, server gets credit)

This is **intentional and correct** - the system reflects different operational models.

### `server_id` Redundancy in Full Mode
In full mode, `server_id` equals `sold_by`. This is accepted for:
- Backward compatibility
- Performance optimization (indexes)
- Mode-switching support

It is **not** considered a bug, just a trade-off.

---

## Testing Checklist

- [ ] Server sees only their sales (full + simplified)
- [ ] Manager sees all sales
- [ ] Revenue reports use `sold_by` correctly
- [ ] Active server counts are accurate
- [ ] Mode switching preserves visibility
- [ ] Validation workflow works in both modes
- [ ] Rejection sets `rejected_by` (not `validated_by`)
- [ ] Mappings dropdown excludes gérant/promoteur

---

## Questions & Support

For questions about this guide:
1. Check the relevant mode section (Full vs Simplified)
2. Verify the field definition above
3. Consult the Database Constraints section
4. Run the provided SQL examples

---

**Last Updated:** 2026-01-02
**Version:** 1.0
