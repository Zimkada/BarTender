# Proxy Admin Architecture Documentation

## Overview

The Proxy Admin Architecture is a secure, auditable impersonation system that allows super_admin users to perform actions on behalf of other users without manipulating authentication tokens or changing Supabase sessions.

**Key Principle**: Super admin remains authentically logged in while the RPC layer acts on behalf of another user.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
├─────────────────────────────────────────────────────┤
│ Super Admin (authenticated with own token)          │
│           ↓                                          │
│ ActingAsContext: { isActive, userId, barName }      │
│           ↓                                          │
│ Routing Layer:                                       │
│  if (actingAs.isActive)                            │
│    → Call admin_as_* RPC                           │
│  else                                               │
│    → Call normal RPC                               │
│           ↓                                          │
│ UI Components:                                       │
│  • ActingAsBar (notification)                      │
│  • StartActingAsDialog (start impersonation)       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│               SUPABASE RPC LAYER                    │
├─────────────────────────────────────────────────────┤
│ RPCs accept p_acting_as_user_id parameter           │
│           ↓                                          │
│ _verify_super_admin_proxy():                       │
│  ✓ Verify auth.uid() is super_admin               │
│  ✓ Verify target user exists & active             │
│  ✓ Log the proxy action                           │
│           ↓                                          │
│ Execute action on behalf of target user            │
│  • Sales created with target user as seller        │
│  • Stock updates attributed to target user         │
│  • All changes timestamped & audited              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│           AUDIT LOGS (Complete Traceability)       │
├─────────────────────────────────────────────────────┤
│ Event: PROXY_SALE_CREATED                          │
│ Severity: warning                                   │
│ User ID: super_admin's actual ID                   │
│ Description: "Superadmin created sale as John"     │
│ Metadata: { acting_as_user_id, sale_id, total }   │
│ Timestamp: NOW()                                    │
└─────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. ActingAsContext (`src/context/ActingAsContext.tsx`)

Global state management for impersonation sessions.

```typescript
interface ActingAsState {
  isActive: boolean;           // Currently impersonating
  userId: string | null;       // Target user ID
  userName: string | null;     // Target user name
  barId: string | null;        // Target bar ID
  barName: string | null;      // Target bar name
  startedAt: Date | null;      // Session start time
}
```

**Methods**:
- `startActingAs(userId, userName, barId, barName)` - Begin impersonation
- `stopActingAs()` - End impersonation
- `isActingAs()` - Check if currently impersonating

---

### 2. ProxyAdminService (`src/services/supabase/proxy-admin.service.ts`)

Direct RPC wrapper for proxy admin functions.

**Methods**:
- `getBarProductsAsProxy(actingAsUserId, barId)` - Fetch products
- `getBarMembersAsProxy(actingAsUserId, barId)` - Fetch members
- `getUserBarsAsProxy(actingAsUserId)` - Fetch user's bars
- `createSaleAsProxy(actingAsUserId, barId, saleData)` - Create sale
- `updateStockAsProxy(actingAsUserId, productId, quantityChange)` - Update stock

---

### 3. useActingAsQuery Hook (`src/hooks/queries/useActingAsQuery.ts`)

Intelligent routing hook that automatically selects correct RPC based on state.

```typescript
// Usage: Replaces normal useProducts
const products = useProductsWithActingAs(barId);

// Internally:
if (actingAs.isActive) {
  // Route to admin_as_get_bar_products RPC
  return ProxyAdminService.getBarProductsAsProxy(...)
} else {
  // Route to normal get_bar_products RPC
  return ProductsService.getBarProducts(...)
}
```

---

### 4. UI Components

#### ActingAsBar (`src/components/ActingAsBar.tsx`)
Prominent notification showing current impersonation status.

```
┌─ Acting as John Doe in Bar XYZ • 5 min active ─┐
└─ [Stop Acting] ──────────────────────────────────┘
```

#### StartActingAsDialog (`src/components/StartActingAsDialog.tsx`)
Modal to initiate impersonation session.

---

## Database Layer (SQL)

### Helper Function: `_verify_super_admin_proxy()`

```sql
-- Verifies:
1. Caller is authenticated super_admin
2. Target user exists and is active
3. Returns boolean (throws on failure)

-- Logs the verification attempt
INSERT INTO audit_logs (event, user_id, description, metadata)
```

### RPC Functions

All proxy admin RPCs follow this pattern:

```sql
admin_as_* (p_acting_as_user_id UUID, p_bar_id UUID, ...)
├─ Call _verify_super_admin_proxy(p_acting_as_user_id, 'ACTION')
├─ Log proxy action to audit_logs with PROXY_* event
├─ Execute action (reading/writing with p_acting_as_user_id as actor)
└─ Return result
```

**Available RPCs**:
- `admin_as_get_bar_products(p_acting_as_user_id, p_bar_id)`
- `admin_as_get_bar_members(p_acting_as_user_id, p_bar_id)`
- `admin_as_get_user_bars(p_acting_as_user_id)`
- `admin_as_create_sale(p_acting_as_user_id, p_bar_id, ...)`
- `admin_as_update_stock(p_acting_as_user_id, p_product_id, p_quantity_change)`

---

## Security Model

### Defense in Depth

1. **Authentication Layer**: Super admin must have valid Supabase token
2. **RPC Permission Layer**: RPC only callable by authenticated users
3. **RPC Authorization Layer**: `_verify_super_admin_proxy()` checks super_admin role
4. **Audit Layer**: Every proxy action logged with caller ID and acting_as ID
5. **Separation of Concerns**: Proxy RPCs separate from normal RPCs

### Audit Trail

Every proxy action creates audit log entry:

```json
{
  "event": "PROXY_SALE_CREATED",
  "severity": "warning",
  "user_id": "super_admin_actual_id",
  "user_name": "Admin Jane",
  "user_role": "super_admin",
  "description": "Superadmin created sale as John Doe",
  "metadata": {
    "acting_as_user_id": "target_user_id",
    "sale_id": "sale_uuid",
    "total": 125.50
  },
  "timestamp": "2025-12-15T14:30:00Z"
}
```

---

## Migration Path

### Phase 1: Infrastructure (COMPLETE)
- ✅ Create `ActingAsContext` for state management
- ✅ Create `ProxyAdminService` for RPC calls
- ✅ Create proxy admin RPC functions in database
- ✅ Create audit logging for proxy actions

### Phase 2: Components (COMPLETE)
- ✅ Create `ActingAsBar` notification component
- ✅ Create `StartActingAsDialog` for initiating impersonation
- ✅ Create `useActingAsQuery` hook for intelligent routing

### Phase 3: Integration (PENDING)
- [ ] Update `App.tsx` to wrap with `ActingAsProvider`
- [ ] Render `ActingAsBar` in main layout
- [ ] Add "Act As" button in user management UI
- [ ] Route `useProductsWithActingAs` in product pages
- [ ] Test end-to-end impersonation flow

### Phase 4: Cleanup (PENDING)
- [ ] Remove old parameter-based impersonation code
- [ ] Remove old `_get_target_user_id()` helper
- [ ] Update documentation
- [ ] Remove old migrations (keep as historical reference)

---

## Usage Guide

### For Super Admin Users

1. **Enter "Acting As" Mode**
   ```
   Click [Admin Menu] → [Act As User]
   → Select user and bar
   → Click [Start Acting As]
   ```

2. **Notification** shows active impersonation
   ```
   🟠 Acting as John Doe in Bar XYZ • 3 min active [Stop]
   ```

3. **All actions** are performed as the target user
   - Sales attributed to target user
   - Stock changes credited to target user
   - Audit log shows "Superadmin (Jane) created sale as John"

4. **Exit "Acting As" Mode**
   ```
   Click [Stop Acting] on notification
   ```

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Session Manipulation** | Custom JWT + setSession() | No session changes |
| **Audit Trail** | Indirect, hard to trace | Direct: "admin acting as user" |
| **Code Complexity** | Every RPC needs param | Separate dedicated RPCs |
| **Security** | JWT vulnerability risk | SECURITY DEFINER + permission checks |
| **Scalability** | All RPCs modified | Only proxy RPCs created |
| **Maintenance** | Changes scattered | Centralized in proxy service |

---

## Troubleshooting

### Issue: "Access Denied: Only super_admin can perform this action"
**Cause**: User is not super_admin in any bar
**Solution**: Verify user has super_admin role in bar_members table

### Issue: RPC call fails silently
**Check**:
1. ActingAsContext provider wrapped App.tsx
2. Target user exists and is_active = true
3. Supabase project has updated migrations
4. Browser console for error messages

### Issue: Audit logs show no PROXY_* events
**Check**:
1. Migration 20251215_complete_proxy_admin_architecture applied
2. audit_logs table has metadata column
3. User permissions on audit_logs table

---

## Future Enhancements

1. **Time-limited Sessions**: Auto-expire "Acting As" after X minutes
2. **Scope Restrictions**: Limit proxy actions to specific bars/permissions
3. **Multi-user Sessions**: Track which super_admin started session
4. **Rollback Capability**: Archive session changes for emergency rollback
5. **Webhooks**: Notify user when super_admin acts as them
6. **Rate Limiting**: Prevent abuse of proxy actions
