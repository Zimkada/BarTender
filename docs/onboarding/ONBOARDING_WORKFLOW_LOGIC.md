# 📊 Onboarding Workflow Logic - BarTender Pro

**Version** : 2.0 (Métier-driven)
**Date** : 7 janvier 2026
**Focus** : Processus métier réel, pas juste tour de visite

---

## 🎯 Principe Fondamental

**L'onboarding doit guider l'utilisateur à travers les setup REQUIS avant d'accéder aux features.**

Pas de "tour générique" → **Workflow linéaire avec blocages intelligents** basé sur rôle + état.

---

## 🏗️ Architecture Générale

```
First Login
    ↓
┌─────────────────────────────────────────┐
│ Determine User Role & Bar Ownership     │
│ (from auth + bar_members table)         │
└─────────────────────────────────────────┘
    ↓
OWNER/PROMOTER BRANCH        MANAGER BRANCH        BARTENDER BRANCH
    ↓                             ↓                     ↓
[Setup Path]                 [Quick Setup]        [Minimal Setup]
    ↓                             ↓                     ↓
✅ Ready to Sell             ✅ Ready to Sell     ✅ Ready to Sell
```

---

## 👑 PATH 1: BAR OWNER / PROMOTER (First Time)

### Setup Sequence (Mandatory Order)

```
Step 1: Bar Details Verification
    ├─ Bar name, location, contact info
    ├─ Closing hour (business day logic)
    ├─ Operating mode (full or simplifié)
    └─ [Confirm] → Step 2

Step 2: Add Managers
    ├─ Create manager accounts OR invite existing users
    ├─ Assign roles: manager, accountant, etc.
    ├─ (Can add later, but recommended: at least 1 manager)
    ├─ [Add Manager] → Add form
    ├─ [Skip for Now] → Step 3
    └─ [Confirm Managers] → Step 3

Step 3: Setup Staff (Mode-dependent)
    ├─ If mode = "full":
    │  └─ Create server accounts (Youssouf, Ahmed, etc.)
    │     [Add Server] → Form
    │     [Confirm] → Step 4
    │
    └─ If mode = "simplifié":
       └─ Skip (servers added dynamically)
           [Continue] → Step 4

Step 4: Add Products to Catalog
    ├─ Browse global products (beer, wine, snacks)
    ├─ Select products for this bar
    ├─ Set local price per product
    ├─ (Minimum: 5 products recommended)
    ├─ [Add Products] → Product selector
    ├─ [Skip] → Step 5 (but red warning)
    └─ [Confirm] → Step 5

Step 5: Initial Stock (First Approvisionnement)
    ├─ For each product added, set initial stock
    ├─ Example:
    │  - Heineken: 24 units at 150 FCFA/unit (CUMP)
    │  - Snacks: 15 at 200 FCFA
    ├─ [Approve Stock] → Record approvisionnement
    └─ [Confirm] → Step 6

Step 6: Set Closing Hour & Business Date
    ├─ Confirm closing_hour (default 6)
    ├─ Explain: "Sales before 6am = yesterday's date"
    ├─ Example scenario shown
    └─ [Confirm] → Step 7

Step 7: Review & Launch
    ├─ Summary card:
    │  ✓ Bar: Chez Ali | 2 managers | 3 servers | 12 products | Stock init ✓
    │  ✓ Operating mode: Full
    │  ✓ Closing hour: 6 AM
    ├─ [Edit Step X] if needed
    └─ [Launch Bar] → Ready for sales! ✅
```

### Blockers & Constraints

| Step | Blocker | Can Skip? | Impact |
|------|---------|-----------|--------|
| 1. Bar Details | NO | No | Incomplete setup |
| 2. Add Managers | Soft | Yes (but warning) | One manager recommended |
| 3. Setup Staff | Conditional | Yes (if simplifié) | Mode-dependent |
| 4. Add Products | Soft | Yes (warning) | Can't create sales without products |
| 5. Stock Init | Hard | No | Stock = 0 = can't sell |
| 6. Closing Hour | NO | No | Business date won't calculate |
| 7. Review | Info | N/A | Confirmation only |

### After Setup Complete

✅ **All checks pass** → Dashboard + full access
- [Create Sale] button available
- [Manage Inventory] accessible
- [Analytics] visible
- [Team] management available
- [Promotions] setup accessible

---

## 👤 PATH 2: MANAGER (First Time in a Bar)

### Quick Setup Sequence

```
Step 1: Manager Role Confirmation
    ├─ "You're manager of: Chez Ali"
    ├─ Permissions overview
    │  ✓ Can create sales
    │  ✓ Can manage inventory
    │  ✓ Can see analytics
    │  ✗ Cannot manage team
    │  ✗ Cannot change settings
    ├─ [Understood] → Step 2

Step 2: Server Accounts (if not already created)
    ├─ Owner has staff created?
    │  ├─ YES → Skip to Step 3
    │  └─ NO → "Contact owner to add servers first"
    │           [Contact Owner] → Email template
    │           [Continue] → Step 3

Step 3: Quick Tour (Optional)
    ├─ "Create your first sale"
    ├─ Quick 2-min walkthrough
    ├─ [Start Tour] OR [Skip] → Step 4

Step 4: Ready to Work
    ├─ Summary:
    │  ✓ Role: Manager
    │  ✓ Bar: Chez Ali
    │  ✓ Team: 3 servers ready
    │  ✓ Products: 12 in stock
    └─ [Go to Dashboard] ✅
```

### Blockers

| Step | Blocker | Can Skip? |
|------|---------|-----------|
| 1. Role confirm | NO | No |
| 2. Server accounts | Conditional | No (if not exist) |
| 3. Tour | Soft | Yes |

---

## 👕 PATH 3: BARTENDER/SERVER (First Time)

### Minimal Setup Sequence

```
Step 1: Quick Intro
    ├─ "Welcome to Chez Ali bar!"
    ├─ Your role: Bartender/Server
    ├─ Main job: Create sales
    ├─ [Understand] → Step 2

Step 2: Learn to Create Sale (1-min demo)
    ├─ "Create a sale in 3 clicks:"
    │  1. Select products (beer, snacks)
    │  2. Confirm quantity
    │  3. Choose payment method
    ├─ [Watch Demo] → Video or animation
    ├─ [Skip] → Step 3
    └─ [Continue] → Step 3

Step 3: Create First Sale (Guided)
    ├─ "Try creating a test sale"
    ├─ Highlight [Create Sale] button
    ├─ Walk through 1 example:
    │  - Select Heineken (1 unit)
    │  - Total: 300 FCFA (demo price)
    │  - Payment: Cash
    ├─ [Create Test Sale] → Confirm
    ├─ [Skip] → Step 4
    └─ [Continue] → Step 4

Step 4: Ready to Sell
    ├─ "You're all set! Start creating sales."
    └─ [Go to Dashboard] ✅
```

### Blockers

| Step | Blocker | Can Skip? |
|------|---------|-----------|
| 1. Intro | NO | No |
| 2. Demo | Soft | Yes |
| 3. Test Sale | Soft | Yes (warning) |

---

## 🔄 Workflow State Machine

```typescript
// OnboardingState enum
enum OnboardingStep {
  // Shared
  WELCOME = "welcome",
  ROLE_DETECTED = "role_detected",

  // Owner/Promoter path
  OWNER_BAR_DETAILS = "owner_bar_details",
  OWNER_ADD_MANAGERS = "owner_add_managers",
  OWNER_SETUP_STAFF = "owner_setup_staff",
  OWNER_ADD_PRODUCTS = "owner_add_products",
  OWNER_STOCK_INIT = "owner_stock_init",
  OWNER_CLOSING_HOUR = "owner_closing_hour",
  OWNER_REVIEW = "owner_review",

  // Manager path
  MANAGER_ROLE_CONFIRM = "manager_role_confirm",
  MANAGER_CHECK_STAFF = "manager_check_staff",
  MANAGER_TOUR = "manager_tour",

  // Bartender path
  BARTENDER_INTRO = "bartender_intro",
  BARTENDER_DEMO = "bartender_demo",
  BARTENDER_TEST_SALE = "bartender_test_sale",

  // All
  COMPLETE = "complete"
}

// Transitions
{
  WELCOME → ROLE_DETECTED → {
    role === "owner" → OWNER_BAR_DETAILS → ... → OWNER_REVIEW → COMPLETE
    role === "manager" → MANAGER_ROLE_CONFIRM → ... → COMPLETE
    role === "bartender" → BARTENDER_INTRO → ... → COMPLETE
  }
}
```

---

## 💾 State Persistence

```typescript
// localStorage structure
{
  "onboarding": {
    "userId": "uuid",
    "barId": "uuid",
    "userRole": "owner|manager|bartender",
    "currentStep": "owner_add_managers",
    "completedSteps": [
      "welcome",
      "role_detected",
      "owner_bar_details",
      "owner_add_managers"
    ],
    "stepData": {
      "owner_bar_details": {
        "barName": "Chez Ali",
        "closingHour": 6,
        "operatingMode": "full"
      },
      "owner_add_managers": {
        "managerIds": ["uuid1", "uuid2"]
      },
      "owner_setup_staff": {
        "serverNames": ["Ahmed", "Youssouf"]
      },
      "owner_add_products": {
        "productIds": ["prod1", "prod2", ...]
      },
      "owner_stock_init": {
        "stocks": {
          "prod1": 24,
          "prod2": 15
        }
      }
    },
    "isComplete": false,
    "startedAt": "2026-01-07T08:00:00Z",
    "lastUpdatedAt": "2026-01-07T08:15:00Z"
  }
}
```

---

## 🎯 Validation Rules per Step

### OWNER_BAR_DETAILS
```
✓ Bar name: 3-50 chars, not empty
✓ Closing hour: 0-23, numeric
✓ Operating mode: "full" or "simplifié"
✓ Contact: email format (optional)
→ Can't proceed without all required fields
```

### OWNER_ADD_MANAGERS
```
✓ At least 0 managers (soft blocker: warning)
✓ Each manager: valid user_id exists in users table
✓ Role exists: manager, accountant roles available
→ Can proceed with 0 managers (but show warning)
```

### OWNER_ADD_PRODUCTS
```
✓ At least 1 product selected (soft blocker)
✓ Each product: global product exists
✓ Price: > 0, numeric
→ Can't create sales without products
```

### OWNER_STOCK_INIT
```
✓ Stock for each added product: >= 0, numeric
✓ All products must have stock value (can be 0)
→ Hard blocker: can't proceed without stock data
```

### OWNER_CLOSING_HOUR
```
✓ Closing hour: 0-23 (already set in step 1)
✓ Format: single integer
→ Confirm = no skip
```

---

## 🚨 Error Handling

### If Manager/Bartender joins BAR without setup:

```
Manager tries to access bar:
    ↓
Check bar.isSetupComplete flag
    ↓
NO → Show modal:
    ┌────────────────────────────────┐
    │ Bar Not Ready                  │
    │ Owner must complete setup:     │
    │ ☐ Add managers                │
    │ ☐ Add staff (if full mode)    │
    │ ☐ Add products                │
    │ ☐ Set initial stock           │
    │ ☐ Confirm closing hour        │
    │                                │
    │ Contact owner: [Email]        │
    │ [Go to Dashboard] (limited)   │
    └────────────────────────────────┘
    ↓
Limited dashboard (can't create sales, only view)
```

---

## 📋 Implementation Checklist

### Database Side
- [ ] Add `bars.is_setup_complete` BOOLEAN DEFAULT false
- [ ] Add `bars.setup_completed_at` TIMESTAMPTZ
- [ ] Add `bar_members.is_onboarded` BOOLEAN DEFAULT false
- [ ] Track setup steps in `onboarding_progress` table (optional but recommended)

### Frontend Side
- [ ] Create OnboardingContext with step machine
- [ ] Create step components (BarDetails, AddManagers, etc.)
- [ ] Create step validators
- [ ] Add role detection logic
- [ ] Add routing: if not complete → show wizard, else → dashboard
- [ ] Persist state to localStorage + sync to DB

### UX/Design
- [ ] Design step forms (visual mockups)
- [ ] Write copy for each step (French)
- [ ] Create inline help text
- [ ] Design error states

---

## 🎨 UI Flow Example (Owner)

```
Screen 1: Bar Details Form
┌──────────────────────────────────────┐
│ Welcome! Let's set up Chez Ali      │
│                                      │
│ Bar Name: [Chez Ali______________] │
│ Location: [Cotonou, Benin________] │
│ Phone:    [+229 94 12 34 56_____] │
│ Closing Hour: [6 ▼]                │
│ Operating Mode: [Full ▼]           │
│                                      │
│ ℹ️ Closing hour = business day     │
│    start time (6 = closes at 6 AM)  │
│                                      │
│        [Back] [Next] [Skip]        │
└──────────────────────────────────────┘

Screen 2: Add Managers
┌──────────────────────────────────────┐
│ Add Team Members                     │
│                                      │
│ Current managers: 0                  │
│ ⚠️ Recommended: at least 1 manager  │
│                                      │
│ ┌────────────────────────────────┐ │
│ │ + Add Manager                  │ │
│ └────────────────────────────────┘ │
│                                      │
│ [Search existing users...]          │
│ OR [Invite by email]               │
│                                      │
│        [Back] [Next →]             │
└──────────────────────────────────────┘

Screen 3: Review & Launch
┌──────────────────────────────────────┐
│ Ready to Launch?                     │
│                                      │
│ ✓ Bar: Chez Ali                     │
│ ✓ Managers: 2                       │
│ ✓ Servers: 3                        │
│ ✓ Products: 12                      │
│ ✓ Stock: Initialized               │
│ ✓ Closing Hour: 6 AM               │
│ ✓ Mode: Full                        │
│                                      │
│ [Edit Step] [Edit Step] [Edit...]  │
│                                      │
│        [Back] [🚀 Launch]           │
└──────────────────────────────────────┘
    ↓
✅ ONBOARDING COMPLETE
→ Dashboard + full access
```

---

## 📊 Analytics Events

```javascript
// Onboarding flow tracking
track('onboarding.started', { userRole: 'owner' });
track('onboarding.step_viewed', { step: 'owner_bar_details' });
track('onboarding.step_completed', { step: 'owner_bar_details' });
track('onboarding.step_skipped', { step: 'owner_add_managers', reason: 'soft_blocker' });
track('onboarding.blocker_hit', { step: 'owner_stock_init', reason: 'empty_stock' });
track('onboarding.completed', {
  userRole: 'owner',
  totalSteps: 7,
  timeSpent: 600,  // seconds
  skippedSteps: 0
});
track('onboarding.abandoned', {
  userRole: 'owner',
  lastStep: 'owner_add_products',
  reason: 'user_closed'
});
```

---

## 🧪 Test Scenarios

### Happy Path - Owner
1. Login as new owner
2. Complete all 7 steps in order
3. Verify bar.is_setup_complete = true
4. Verify dashboard access
5. Verify can create sale

### Happy Path - Manager
1. Owner creates bar + setup complete
2. Owner adds manager account
3. Manager logs in
4. Verify quick setup (3 steps)
5. Verify can create sale

### Happy Path - Bartender
1. Setup complete
2. Bartender logs in
3. Verify minimal setup (3 steps)
4. Verify can create sale

### Error Path - Manager joins incomplete bar
1. Owner creates bar, doesn't finish setup
2. Manager joins bar
3. Verify error modal shown
4. Verify limited dashboard access
5. Verify blocked from sales creation

---

## 🚀 Rollout Strategy

### Phase 1 (Week 1): Owner Setup
- Deploy onboarding for new owners
- 10% canary rollout
- Monitor completion rate

### Phase 2 (Week 2): All Roles
- Deploy manager/bartender workflows
- Expand to 50% users

### Phase 3 (Week 3): Full Rollout
- 100% rollout
- Feedback collection

---

**Status**: Ready for development ✅
**Next**: Start with backend (add DB fields) + OnboardingContext
