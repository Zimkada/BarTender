# 🚀 ONBOARDING COMPLETION ROADMAP

**Date**: 9 janvier 2026
**Branch**: `feature/default-simplified-mode`
**Status**: 80% complet - Prêt pour implémentation des 20% manquants
**Effort estimé**: 6-8 heures pour MVP fonctionnel

---

## 📋 RÉSUMÉ EXÉCUTIF

### Situation Actuelle
- ✅ Architecture backend + API entièrement intégrée
- ✅ Context + localStorage pour state management
- ✅ 13 composants React créés et connectés aux services
- ✅ Database migrations en place (is_setup_complete tracking)
- ❌ **BLOCKER CRITIQUE**: Route `/onboarding` commentée à la ligne 109 dans `src/routes/index.tsx`
- ❌ Deux modales manquantes (manager search, product selector)

### Workflows Implémentés
1. **Owner/Promoter**: 7 étapes (bar details → review → launch)
2. **Manager**: 3 étapes (role confirm → check staff → tour)
3. **Bartender/Server**: 3 étapes (intro → demo → test sale)

### Workflows Fonctionnels en Production
- Bar launch avec `is_setup_complete = true` ✅
- Manager assignment à la base de données ✅
- Product linking à la base de données ✅
- Audit logging sur toutes les actions ✅

---

## 🎯 TASKS IMMÉDIATES (MVP - 30 MIN)

### TASK 1: Uncomment Route [CRITICAL]
**File**: `src/routes/index.tsx`
**Lines**: 38-39, 109

```typescript
// BEFORE (ligne 38-39):
// === Onboarding (Default Export) - TODO: Uncomment when OnboardingContext is fully implemented ===
// const OnboardingPage = lazyWithRetry(() => import('../pages/OnboardingPage'));

// AFTER:
// === Onboarding (Default Export) ===
const OnboardingPage = lazyWithRetry(() => import('../pages/OnboardingPage'));

// BEFORE (ligne 109):
// { path: 'onboarding', element: <OnboardingPage /> }, // TODO: Uncomment when ready

// AFTER:
{ path: 'onboarding', element: <OnboardingPage /> },
```

**Why**: L'onboarding ne peut pas être accessible sans cette route. C'est THE blocker.

---

## 🔴 HIGH PRIORITY TASKS (2-3 HEURES CHACUN)

### TASK 2: Manager Search & Invite Modal
**File**: `src/components/onboarding/AddManagersStep.tsx`
**Current**: Line 27-29 shows `alert("Manager search modal not implemented")`

**What to Build**:
1. Modal component that:
   - Search users by email in `public.users` table
   - Shows user list with name/email
   - Allows multi-select
   - Shows "pending" vs "assigned" status

2. Integration with `OnboardingService.assignManager(barId, managerId)`:
   - Calls on confirm
   - Updates bar_members table with role='gérant'
   - Adds to `stepData.managers` in context

**Dependencies**:
- Supabase query to `public.users` (need RLS check - only show active users)
- OnboardingService method exists and tested
- Context method `updateStepData()` ready to use

**Expected Result**:
- User can select 1+ managers from dropdown/search
- Selected managers shown in list
- "Next" button enabled when ≥1 manager selected
- On next step, managers are in database

---

### TASK 3: Product Selector Modal
**File**: `src/components/onboarding/AddProductsStep.tsx`
**Current**: Line 26-28 shows `alert("Product selector modal not implemented")`

**What to Build**:
1. Modal component that:
   - Fetch `global_products` with category filtering
   - Show product grid/list with name, category, default price
   - Allow multi-select with checkboxes
   - Let user set **local price per bar** (override global price)

2. Integration with `OnboardingService.addProductsToBar()`:
   - Calls on confirm with: `{ products: [{ productId, localPrice }, ...] }`
   - Creates `bar_products` entries in database
   - Updates `stepData.products` in context

**Technical Notes**:
- **Current bug**: Products added with `localPrice: 0` (see line 63 in AddProductsStep)
- Need to collect prices in product selector modal
- Should show global price as reference + input field for local price
- Consider default: use global price if not overridden

**Dependencies**:
- `public.global_products` already populated
- `public.global_categories` for filtering
- OnboardingService method tested
- RLS policies allow reading global products

**Expected Result**:
- User selects 10-20 products from catalog
- Sets local prices (or accepts defaults)
- Products appear in database with correct prices
- Stock initialized in next step

---

## 🟡 MEDIUM PRIORITY TASKS (1-2 HEURES CHACUN)

### TASK 4: Welcome & RoleDetected Steps
**Files**:
- Create: `src/components/onboarding/WelcomeStep.tsx`
- Create: `src/components/onboarding/RoleDetectedStep.tsx`
- Modify: `src/components/onboarding/OnboardingFlow.tsx` (add cases)

**Current**: Default case shows "Loading..." message for WELCOME and ROLE_DETECTED steps

**WelcomeStep** (simple):
```tsx
- Show BarTender logo + "Welcome to BarTender"
- Explain: "Let's set up your bar in 3 minutes"
- Button: "Get Started" → calls nextStep()
- Optional: Show role icons (owner/manager/bartender)
```

**RoleDetectedStep** (simple):
```tsx
- Show detected role: "You're set up as a Manager"
- Brief explanation of what that means
- Show permissions they'll have
- Button: "Continue" → nextStep()
```

**Why**: Better UX. Currently jumps straight to BarDetailsStep.

---

### TASK 5: Edit Step Navigation (ReviewStep)
**File**: `src/components/onboarding/ReviewStep.tsx`
**Lines**: 94-97

**Current Issue**:
```tsx
const handleEditStep = (step: OnboardingStep) => {
  // Would navigate back to specific step
  console.log('Edit step:', step);
};
```

**Fix**:
```tsx
const handleEditStep = (step: OnboardingStep) => {
  goToStep(step); // Use context function that already exists
};
```

**Why**: Review page should let user go back and edit. Currently buttons don't work.

---

### TASK 6: Interactive Tour (Shepherd.js)
**Files**:
- `src/components/onboarding/ManagerTourStep.tsx` (line 19)
- `src/components/onboarding/BartenderDemoStep.tsx` (line 18)

**Current**:
```tsx
// would start interactive tour with Shepherd.js
// simulates 2 second tour
setTimeout(() => skipTour(), 2000);
```

**What to Do**:
1. Install Shepherd.js: `npm install shepherd.js`
2. Create tour steps that highlight key UI elements
3. For ManagerTourStep: Show how to create sales, view analytics
4. For BartenderDemoStep: Show how to process orders

**Dependencies**:
- Shepherd.js library
- DOM elements already on page to highlight
- Can use same tour logic for both roles

**Minimum MVP**: Skip for now (can be added post-launch)

---

## 🟢 LOW PRIORITY TASKS (30 MIN - 1H)

### TASK 7: Test Sale Creation (BartenderTestSaleStep)
**File**: `src/components/onboarding/BartenderTestSaleStep.tsx`
**Lines**: 19-20

**Current**:
```tsx
const handleTestSale = async () => {
  // Would create a test sale
  skipTour(); // just marks complete
};
```

**Optional Enhancement**:
- Call `OnboardingService` RPC to create actual test sale
- Show user their first sale was created
- Doesn't block completion - just nice to have

---

## 🗂️ CODE STRUCTURE REFERENCE

### Key Files (Already Exist & Connected)

**Frontend Components**:
```
src/components/onboarding/
├── OnboardingPage.tsx                 # Page wrapper (with auth guards)
├── OnboardingFlow.tsx                 # Main router (dispatch by step)
├── BarDetailsStep.tsx                 # ✅ COMPLETE
├── AddManagersStep.tsx                # ❌ Needs modal (alert placeholder)
├── SetupStaffStep.tsx                 # ✅ COMPLETE
├── AddProductsStep.tsx                # ❌ Needs modal (alert placeholder)
├── StockInitStep.tsx                  # ✅ COMPLETE
├── ClosingHourStep.tsx                # ✅ COMPLETE
├── ReviewStep.tsx                     # ✅ COMPLETE (edit buttons broken)
├── ManagerRoleConfirmStep.tsx         # ✅ COMPLETE
├── ManagerCheckStaffStep.tsx          # ✅ COMPLETE
├── ManagerTourStep.tsx                # ⚠️ Needs Shepherd.js
├── BartenderIntroStep.tsx             # ✅ COMPLETE
├── BartenderDemoStep.tsx              # ⚠️ Needs Shepherd.js
└── BartenderTestSaleStep.tsx          # ⚠️ Optional enhancement
```

**Backend Services**:
```
src/services/supabase/
└── onboarding.service.ts              # ✅ ALL 8 METHODS IMPLEMENTED
   - launchBar()
   - assignManager()
   - createServers()
   - addProductsToBar()
   - initializeStock()
   - updateBarMode()
   - verifyBarReady()
   - getOnboardingProgress()
```

**State Management**:
```
src/context/
└── OnboardingContext.tsx              # ✅ COMPLETE
   - 10 step sequences (owner/manager/bartender)
   - localStorage persistence
   - 8 action methods
```

**Routes**:
```
src/routes/index.tsx
└── Line 109: { path: 'onboarding', element: <OnboardingPage /> }
   # CURRENTLY COMMENTED OUT - NEEDS UNCOMMENTING
```

---

## 📊 IMPLEMENTATION CHECKLIST

| # | Task | File | Status | Effort | Notes |
|---|------|------|--------|--------|-------|
| 1 | Uncomment route | src/routes/index.tsx | ❌ TODO | 1 min | **BLOCKER** |
| 2 | Manager modal | AddManagersStep.tsx | ❌ TODO | 2-3h | High priority |
| 3 | Product modal | AddProductsStep.tsx | ❌ TODO | 2-3h | High priority |
| 4 | Welcome step | Create WelcomeStep.tsx | ❌ TODO | 1h | Medium priority |
| 5 | RoleDetected step | Create RoleDetectedStep.tsx | ❌ TODO | 30 min | Medium priority |
| 6 | Edit navigation | ReviewStep.tsx:94 | ❌ TODO | 10 min | Quick fix |
| 7 | Shepherd tours | Manager/BartenderTourStep | ⚠️ OPTIONAL | 2h | Post-launch |
| 8 | Test sale | BartenderTestSaleStep | ⚠️ OPTIONAL | 1h | Nice to have |

---

## 🔌 DATABASE STATE

**New Columns** (from migration 20260108135305):
```sql
ALTER TABLE bars ADD COLUMN is_setup_complete BOOLEAN DEFAULT false;
ALTER TABLE bars ADD COLUMN setup_completed_at TIMESTAMPTZ;
```

**Existing Tables Used**:
- `public.users` - Search managers
- `public.bars` - Store onboarding state
- `public.bar_members` - Assign managers/staff
- `public.bar_products` - Link products to bar
- `public.supplies` - Initialize stock
- `public.global_products` - Source for product selection
- `public.global_categories` - Filter products

**RLS Status**:
- ✅ All tables allow authenticated users to read/write their own data
- ✅ Super admin can view all
- ✅ No additional RLS changes needed for onboarding

---

## 🧪 TESTING CHECKLIST

Once implementation done:

1. **Route Access**
   - [ ] Visit `/onboarding` - page loads
   - [ ] Redirect if bar already complete
   - [ ] Shows correct role-based flow

2. **Owner Flow**
   - [ ] Bar details saved to database
   - [ ] Can search and assign managers → appear in bar_members
   - [ ] Can select products → appear in bar_products
   - [ ] Can set stock → appear in supplies
   - [ ] Launch bar sets is_setup_complete=true

3. **Manager Flow**
   - [ ] Role confirmation shows
   - [ ] Can confirm and proceed
   - [ ] Tour optional (skip works)

4. **Bartender Flow**
   - [ ] Intro shows
   - [ ] Can skip or complete demo
   - [ ] Test sale optional

5. **Data Validation**
   - [ ] All data in database matches form inputs
   - [ ] Prices correctly set (not all 0)
   - [ ] Audit logs record all manager assignments
   - [ ] setup_completed_at timestamp populated

---

## 🚀 DEPLOYMENT STRATEGY

### Phase 1: MVP Launch (After Tasks 1-3)
- Route enabled
- Manager modal working
- Product modal working
- Users can complete onboarding end-to-end
- Launch: Ready for beta users

### Phase 2: UX Polish (Tasks 4-6)
- Welcome/RoleDetected steps
- Edit navigation
- Interactive tours

### Phase 3: Post-Launch (Tasks 7-8)
- Shepherd.js integration
- Test sale creation
- Gathering user feedback

---

## 📝 NOTES FOR NEXT SESSION

1. **Start with**: Task 1 (uncomment route) - Takes 1 minute, unblocks testing
2. **Then tackle**: Task 2 & 3 (modals) - Highest value, highest effort
3. **Then polish**: Task 4-6 - UX improvements
4. **Skip until v2**: Task 7-8 - Post-launch enhancements

**Key URLs to Keep Handy**:
- Local dev: `http://localhost:5173/onboarding`
- Database explorer: Your Supabase dashboard
- Component files: `src/components/onboarding/`

**Commands**:
```bash
# Start dev server
npm run dev

# Build
npm run build

# Run migrations (if needed)
supabase migration up

# Test specific modal (once built)
# Just navigate to /onboarding in browser
```

---

## 📞 CONTEXT FROM PREVIOUS SESSION

**Recent Wins**:
- Phase 14 completed: Fixed Prévisions menu (RLS bypass issue)
- Login error fixed (audit trigger corrected)
- Audit logs now visible to admins
- All 3 production console errors resolved

**Why Finish Onboarding Now**:
- Users can't create bars without it
- Currently hardcoded manager/product IDs
- Blocks new customer signup flow
- MVP feature for SaaS launch

**Architecture Notes**:
- OnboardingService uses AuditLogger on every action
- RLS handled by Supabase auth context
- No custom auth needed (Supabase handles it)
- localStorage backup for state (survives page reload)

---

**Last Updated**: 9 Jan 2026 23:45 UTC
**Status**: Ready for implementation
**Next Step**: Uncomment route, then build modals
