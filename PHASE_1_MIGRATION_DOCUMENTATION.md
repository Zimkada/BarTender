# Phase 1: Mode Switching Architecture - Database Foundations

**Date:** 2025-12-24
**Status:** ✅ COMPLETED
**Commit:** [34da4b2](https://github.com/your-repo/commits/34da4b2) (Phase 1), [e16c940](https://github.com/your-repo/commits/e16c940) (Phase 2)
**Branch:** `feature/switching-mode`
**Feature Flag:** `ENABLE_SWITCHING_MODE` (OFF by default)

## Overview

Implementation of comprehensive mode switching architecture to allow bars to dynamically switch between:
- **Full Mode**: Individual server accounts, each server creates/manages own sales
- **Simplified Mode**: Gérant creates all sales, assigns to servers by text name

The feature enables mode transitions without data loss via a new `server_id` UUID field that tracks servers across operating modes.

## Problem Statement

**Original Bug (Production):**
- In simplified mode, servers could view ALL bar operations (not just their assigned sales)
- Root cause: RLS permissive + broken frontend filtering logic
- Impact: Servers gain unintended visibility into other servers' sales

**Strategic Challenge:**
- Bars locked into mode at creation time (no ability to switch)
- Clients requesting mode changes have no upgrade path without manual intervention
- Business model flexibility required

**Solution Approach:**
- Add `server_id` UUID field to track servers across mode changes
- Create server name → UUID mapping table for simplified mode
- Implement mode-aware RLS policies at database level
- Progressive feature flag rollout (10% → 50% → 100%)

## Architecture Decisions

### 1. Server ID Strategy
- Added `server_id` UUID column (nullable) to sales, consignments, returns
- In full mode: `server_id = sold_by` (creator's UUID)
- In simplified mode: `server_id = mapped_uuid` (resolved from server name)
- Allows unified querying across both modes via `server_id` field

### 2. Server Name Mappings Table
- New table: `server_name_mappings` (bar_id, server_name → user_id)
- Enables text-based server identification in simplified mode
- Supports batch updates during settings management
- RLS policies: managers can manage, all bar members can read

### 3. Database-Level Enforcement
- RLS policy prevents servers from creating sales in simplified mode
- Only gerant/promoteur/super_admin can create in simplified mode
- Full mode allows all bar members to create sales
- Prevents compromised server from performing invalid operations

### 4. Backward Compatibility
- All columns nullable (existing records unaffected)
- RPC function parameter optional (existing calls still work)
- Feature flag OFF by default (no behavior change)
- Soft delete pattern (is_active field) maintained throughout

## Phase 1: Migrations (4 SQL Files)

### 1️⃣ Migration: `20251224130000_add_server_id_to_sales_consignments_returns.sql`

**Purpose:** Add server_id UUID columns to core transaction tables

**Changes:**
```sql
-- Add columns (nullable for backward compatibility)
ALTER TABLE public.sales ADD COLUMN server_id UUID;
ALTER TABLE public.consignments ADD COLUMN server_id UUID;
ALTER TABLE public.returns ADD COLUMN server_id UUID;

-- Create indexes for query performance
CREATE INDEX idx_sales_server_id ON public.sales(server_id);
CREATE INDEX idx_consignments_server_id ON public.consignments(server_id);
CREATE INDEX idx_returns_server_id ON public.returns(server_id);

-- Backfill existing data
UPDATE public.sales SET server_id = sold_by WHERE server_id IS NULL;
UPDATE public.consignments SET server_id = created_by WHERE server_id IS NULL;
UPDATE public.returns SET server_id = created_by WHERE server_id IS NULL;
```

**Rationale:**
- Backfill assumes existing data in full mode (server_id = creator UUID)
- Simplified mode data (where server name stored in text) will use text parsing until migrated
- Indexes enable efficient filtering in sales history queries

**Risk Mitigation:** All changes additive; no data loss possible

---

### 2️⃣ Migration: `20251224130100_create_server_name_mappings_table.sql`

**Purpose:** Create mapping infrastructure for server name ↔ UUID resolution

**Schema:**
```sql
CREATE TABLE public.server_name_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID NOT NULL REFERENCES public.bars(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  server_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint: one server name per bar
ALTER TABLE public.server_name_mappings
  ADD CONSTRAINT unique_server_name_per_bar
  UNIQUE(bar_id, server_name);
```

**RLS Policies:**
- Managers (gerant/promoteur/super_admin) can manage mappings
- All bar members can read mappings
- Ensures data consistency and audit trail

**Usage Example:**
```typescript
// Simplified mode: Resolve "Ahmed" → UUID during sale creation
const mappedUserId = await ServerMappingsService.getUserIdForServerName(
  barId,
  'Ahmed'
);
```

**Risk Mitigation:** Referential integrity via foreign keys

---

### 3️⃣ Migration: `20251224130200_update_create_sale_rpc_with_server_id.sql`

**Purpose:** Update core RPC function to accept and store server_id

**Function Signature:**
```sql
CREATE OR REPLACE FUNCTION public.create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_server_id UUID DEFAULT NULL,      -- NEW PARAMETER
  p_status TEXT DEFAULT 'validated',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
) RETURNS TABLE (...)
```

**Changes:**
- Added optional `p_server_id` parameter (default NULL for backward compatibility)
- Insert server_id into sales record on creation
- Parameter documentation updated

**Usage Pattern:**
```typescript
// Full mode: Pass creator UUID
await supabase.rpc('create_sale_with_promotions', {
  p_bar_id: barId,
  p_sold_by: currentUserId,
  p_server_id: currentUserId,  // Full mode: same as sold_by
  // ... other params
});

// Simplified mode: Pass resolved server UUID
const mappedServerId = await ServerMappingsService.getUserIdForServerName(barId, serverName);
await supabase.rpc('create_sale_with_promotions', {
  p_bar_id: barId,
  p_sold_by: gerantId,           // Gérant creates the sale
  p_server_id: mappedServerId,   // But tracked to mapped server
  // ... other params
});
```

**Risk Mitigation:** Optional parameter maintains backward compatibility

---

### 4️⃣ Migration: `20251224130300_add_simplified_mode_sale_creation_policy.sql`

**Purpose:** Enforce mode-aware RLS policy at database level

**Policy Logic:**
```sql
CREATE POLICY "Bar members can create sales with mode restriction"
ON public.sales FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be a bar member
  EXISTS (SELECT 1 FROM bar_members ...)
  AND
  -- Mode-aware restriction
  (
    -- Full mode: any bar member can create
    (SELECT operatingMode FROM bars WHERE id = sales.bar_id) = 'full'
    OR
    -- Simplified mode: only manager roles
    (SELECT operatingMode FROM bars WHERE id = sales.bar_id) = 'simplified'
    AND EXISTS (
      SELECT 1 FROM bar_members
      WHERE role IN ('gerant', 'promoteur', 'super_admin')
    )
  )
);
```

**Additional Policies:**
- SELECT policy: Allow bar members to view sales
- UPDATE policy: Allow managers to validate/reject sales
- All policies include audit trail via created_at/updated_at

**Security Benefit:** Prevents compromised server from creating invalid sales in simplified mode

---

## Phase 2: Backend Services & Types

**Date:** 2025-12-24
**Commit:** [e16c940](https://github.com/your-repo/commits/e16c940)

### New Service: `ServerMappingsService`

**File:** [src/services/supabase/server-mappings.service.ts](src/services/supabase/server-mappings.service.ts)

**Methods:**
1. `getUserIdForServerName(barId, serverName)` - Resolve name → UUID
2. `upsertServerMapping(barId, serverName, userId)` - Create/update mapping
3. `getAllMappingsForBar(barId)` - List all mappings for a bar
4. `deleteMapping(barId, serverName)` - Remove a mapping
5. `hasMappingsForBar(barId)` - Check if bar has any mappings
6. `batchUpsertMappings(barId, mappings)` - Bulk upsert (for settings UI)

**Error Handling:**
- Catches Supabase error code PGRST116 (not found) and returns null
- All errors logged to console with context
- Throws on unexpected errors (propagated to caller)

**Example Usage:**
```typescript
import { ServerMappingsService } from '@/services/supabase/server-mappings.service';

// Get UUID for a server name
const userId = await ServerMappingsService.getUserIdForServerName(barId, 'Ahmed');

// Create/update mapping
await ServerMappingsService.upsertServerMapping(barId, 'Ahmed', someUserId);

// Batch update (from settings UI)
await ServerMappingsService.batchUpsertMappings(barId, [
  { serverName: 'Ahmed', userId: uuid1 },
  { serverName: 'Fatima', userId: uuid2 }
]);
```

### Type Updates

**File:** [src/types/index.ts](src/types/index.ts)

**Changes:**
- Added `serverId?: string` to `Sale` interface (optional UUID)
- Added `serverId?: string` to `Consignment` interface (optional UUID)
- Added `serverId?: string` to `Return` interface (optional UUID)
- All marked optional for backward compatibility
- Comment: `✨ NOUVEAU: UUID du serveur assigné (mode switching support)`

### Feature Flags

**File:** [src/config/features.ts](src/config/features.ts)

**New Flags:**
```typescript
ENABLE_SWITCHING_MODE: false,        // Master flag (OFF by default)
SHOW_SWITCHING_MODE_UI: false,       // Settings UI visibility (only if master ON)
```

**Rollout Strategy:**
- Phase 1: OFF for all users (0%)
- Phase 2: 10% of bars (internal QA)
- Phase 3: 50% of bars (customer beta)
- Phase 4: 100% of bars (full release)

**Deployment:** Change via `FEATURES` config or use Supabase's feature flag service for real-time control

---

## Immediate Bug Fixes (Main Branch)

**Commit:** df45b8c (deployed to production)

**Fixed Bugs:**

### 1. Simplified mode visibility bug
- **File:** [src/features/Sales/SalesHistory/hooks/useSalesFilters.ts](src/features/Sales/SalesHistory/hooks/useSalesFilters.ts)
- **Issue:** Servers see ALL operations instead of just assigned sales
- **Fix:** Mode-aware filtering with regex parsing of "Serveur: <name>" from notes
- **Status:** ✅ Deployed to production

### 2. Team member removal broken
- **File:** [src/context/BarContext.tsx](src/context/BarContext.tsx)
- **Issue:** Incorrect ID mismatch between frontend and database
- **Fix:** Use composite key (user_id + bar_id) for soft delete
- **Status:** ✅ Deployed to production

### 3. Team management UI stale data
- **File:** [src/pages/TeamManagementPage.tsx](src/pages/TeamManagementPage.tsx)
- **Issue:** Removed members still visible in UI
- **Fix:** Filter out inactive members (is_active = false)
- **Status:** ✅ Deployed to production

---

## Testing Checklist

- [x] Migrations execute without errors
- [x] Backfill logic correctly sets server_id
- [x] RLS policies prevent unauthorized operations
- [x] ServerMappingsService CRUD operations work
- [ ] Frontend integration (Phase 3 - in progress)
- [ ] Mode switching scenarios (Phase 4 - pending)
- [ ] Performance tests (10K+ sales queries) - Phase 4
- [ ] Feature flag rollout testing - Phase 4

---

## Phase 3: Frontend Integration (In Progress)

**Remaining Tasks:**
1. Update `SalesService.createSale` to accept and pass `server_id` parameter
2. Modify `QuickSaleFlow.tsx` to resolve server name → UUID
3. Update `Cart.tsx` with server_id integration
4. Create `ServerMappingsManager` UI component for settings
5. Enhance `useSalesFilters.ts` to use `serverId` field (deprecate text parsing)

**Timeline:** ~30 hours of frontend work

---

## Deployment Sequence

1. ✅ Deploy Phase 1 migrations to production Supabase
2. ✅ Deploy Phase 2 backend services
3. 🔄 Deploy Phase 3 frontend changes (in progress)
4. ⏳ Phase 4: Feature flag progressive rollout
5. ⏳ Monitor and support during rollout period

---

## Files Modified/Created

### Created
- [supabase/migrations/20251224130000_add_server_id_to_sales_consignments_returns.sql](supabase/migrations/20251224130000_add_server_id_to_sales_consignments_returns.sql)
- [supabase/migrations/20251224130100_create_server_name_mappings_table.sql](supabase/migrations/20251224130100_create_server_name_mappings_table.sql)
- [supabase/migrations/20251224130200_update_create_sale_rpc_with_server_id.sql](supabase/migrations/20251224130200_update_create_sale_rpc_with_server_id.sql)
- [supabase/migrations/20251224130300_add_simplified_mode_sale_creation_policy.sql](supabase/migrations/20251224130300_add_simplified_mode_sale_creation_policy.sql)
- [src/services/supabase/server-mappings.service.ts](src/services/supabase/server-mappings.service.ts) (NEW - Phase 2)

### Modified
- [src/types/index.ts](src/types/index.ts) - Added serverId? to Sale, Consignment, Return
- [src/config/features.ts](src/config/features.ts) - Added ENABLE_SWITCHING_MODE, SHOW_SWITCHING_MODE_UI
- [src/features/Sales/SalesHistory/hooks/useSalesFilters.ts](src/features/Sales/SalesHistory/hooks/useSalesFilters.ts) - Mode-aware filtering (bug fix)
- [src/context/BarContext.tsx](src/context/BarContext.tsx) - Fixed team member removal (bug fix)
- [src/pages/TeamManagementPage.tsx](src/pages/TeamManagementPage.tsx) - Filter inactive members (bug fix)

---

## Key Learnings

### Database-Level Enforcement
- RLS policies provide defense-in-depth against frontend vulnerabilities
- Mode-aware policies encapsulate business logic at database level
- Prevents need to trust frontend validation

### Backward Compatibility
- Nullable columns + optional RPC parameters = zero breaking changes
- Feature flag OFF by default = no behavior change until explicitly enabled
- Existing data unaffected (backfill happens automatically)

### Architecture Pattern
- UUID field (server_id) replaces fragile text parsing
- Mapping table enables semantic mode transitions
- Progressive rollout reduces risk of widespread breakage

---

## Risk Assessment

| Risk | Mitigation | Status |
|------|-----------|--------|
| Database migration failure | Tested locally, additive changes only, rollback not needed | ✅ LOW |
| RLS policy breaks existing permissions | Carefully designed, doesn't affect existing bar_members | ✅ LOW |
| Performance regression on large datasets | Indexes added (server_id), RPC optimized | ✅ LOW |
| Frontend feature creep | Feature flag OFF by default, Phase 3/4 separate | ✅ LOW |
| Data inconsistency during mode switch | server_id field designed for this exact scenario | ✅ MITIGATED |

---

## Related Documentation

- **Design Document:** [IMPLEMENTATION_PLAN_MODE_SWITCHING.md](./IMPLEMENTATION_PLAN_MODE_SWITCHING.md)
- **Bug Report:** Simplified mode server visibility leak (production)
- **Feature Branch:** [feature/switching-mode](https://github.com/your-repo/tree/feature/switching-mode)
