# 📖 Plan Implémentation Guide Utilisateur - BarTender Pro

**Date** : 7 janvier 2026
**Statut** : Plan de design (avant implémentation)
**Priorité** : Moyenne (après prod-ready validation)

---

## 🎯 Objectif Global

Créer un système d'onboarding intégré en-app qui guide les nouveaux utilisateurs à travers les features clés de BarTender sans interruption de workflow.

**Métrique de succès** :
- ✅ 80% des nouveaux users complètent le tour guide au 1er login
- ✅ 0 blocage fonctionnel (l'utilisateur peut toujours fermer le guide)
- ✅ Utilisateur expérimenté skip en 1 clic

---

## 🏗️ Architecture Recommendation

**Approche** : **Hybrid** = Modal tours + Inline tooltips + Contextual help

```
First Login
    ↓
┌─────────────────────────────────┐
│ Welcome Modal (full-screen)     │ ← Intro tour + role selection
│ "Welcome to BarTender!"         │
│ [Get Started] [Skip]            │
└─────────────────────────────────┘
    ↓
Dashboard (tour mode active)
    ↓
┌─────────────────────────────────┐
│ Tour Step 1: Dashboard Overview │ ← Highlight KPI cards
│ "Track your sales in real-time" │
│ [Next] [Skip Tour]              │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Tour Step 2: Create Sale        │ ← Highlight button + flow
│ "Create your first sale here"   │
│ [Next] [Back]                   │
└─────────────────────────────────┘
    ↓
[User creates sale OR clicks Skip]
    ↓
✅ Tour Complete → "?" icon always available for re-access
```

---

## 🗂️ File Structure

```
src/
├── components/
│   └── onboarding/
│       ├── WelcomeModal.tsx          (First login modal)
│       ├── TourGuide.tsx             (Main tour orchestrator)
│       ├── TourStep.tsx              (Individual step component)
│       ├── InlineTooltip.tsx         (Contextual tooltips)
│       ├── HelpButton.tsx            (Floating "?" button)
│       └── OnboardingOverlay.tsx     (Highlight + blocker)
│
├── contexts/
│   └── OnboardingContext.tsx         (State: step, completed, role)
│
├── hooks/
│   └── useOnboarding.ts              (Custom hook for tour state)
│
├── services/
│   └── onboarding.service.ts         (Persist progress to localStorage)
│
├── content/
│   └── onboarding/
│       ├── tours.json               (Tour steps config)
│       └── tooltips.json            (Tooltips content)
│
└── pages/
    └── HelpCenter.tsx               (Full help page - optional)
```

---

## 📋 Feature Breakdown

### Phase 1️⃣ : Welcome Modal (Day 1)
**Effort** : 1 day | **Priority** : P0

```typescript
// WelcomeModal.tsx
- Displays on first login (detected via localStorage)
- Shows:
  * Brand logo + "Welcome to BarTender Pro"
  * Brief description (2-3 lines)
  * Role selector: [Bar Owner] [Manager] [Bartender]
  * Buttons: [Get Started Tour] [Skip] [Learn Later]
- Stores selection in localStorage

- On "Get Started": Start tour at step 1
- On "Skip": Close modal, show "?" button to restart
- On "Learn Later": Close modal, user can start manually
```

### Phase 2️⃣ : Tour Guide System (Days 2-3)
**Effort** : 2 days | **Priority** : P0

```typescript
// useOnboarding.ts hook
interface OnboardingState {
  isActive: boolean;           // Tour running?
  currentStep: number;         // Step 1-N
  totalSteps: number;          // Total steps
  completedSteps: Set<number>; // Which steps done
  userRole: string;            // bar_owner | manager | bartender
}

// TourGuide.tsx component
- Maintains state via Context
- Steps differ by role:
  * Bar Owner (6 steps) : Dashboard → Inventory → Promotions → Analytics → Team → Settings
  * Manager (5 steps)  : Dashboard → Inventory → Promotions → Analytics → Team
  * Bartender (3 steps): Dashboard → Create Sale → Team

- On each step:
  ✓ Highlight relevant UI element
  ✓ Show modal with explanation
  ✓ Block interaction outside highlight
  ✓ Buttons: [Next] [Back] [Skip Tour] [Skip Step]

- On tour completion:
  ✓ Show celebration modal
  ✓ Store completion in localStorage
  ✓ Offer "Help Center" link
```

### Phase 3️⃣ : Inline Tooltips (Day 4)
**Effort** : 1 day | **Priority** : P1

```typescript
// InlineTooltip.tsx + tooltips.json
- Hover tooltips on key UI elements
- Examples:
  * "Total Revenue: Sum of all validated sales today"
  * "Create Sale: Register a sale + apply promotions"
  * "Inventory: Track stock levels + alert thresholds"

- Config driven (tooltips.json):
  {
    "dashboard.totalRevenue": {
      "title": "Total Revenue",
      "content": "Sum of all validated sales in your selected date range",
      "placement": "right",
      "delay": 500
    }
  }

- Show only if user hasn't completed tour (smart hint)
```

### Phase 4️⃣ : Floating Help Button (Day 4)
**Effort** : 4 hours | **Priority** : P1

```typescript
// HelpButton.tsx (bottom-right corner)
- Floating "?" button in bottom-right
- On click: Show menu with options:
  ☐ [Restart Tour]       → Restart from step 1
  ☐ [Go to Help Center]  → Link to /help
  ☐ [Report Issue]       → Open feedback modal (existing)
  ☐ [Keyboard Shortcuts] → Show modal

- Analytics: Track click events (help usage)
```

### Phase 5️⃣ : Contextual Help Panels (Day 5)
**Effort** : 1 day | **Priority** : P2

```typescript
// Inside pages (e.g., CreateSalePage.tsx)
- "ℹ️ Need help?" panel on right sidebar
- Shows relevant content:
  * Current page context
  * Links to tour step
  * FAQ snippet
  * "Video tutorial" (future)

- Collapsible to save space
- Content from HELP_CONTENT config
```

---

## 🛠️ Tech Stack

| Component | Library | Reason |
|-----------|---------|--------|
| Tour orchestration | [Shepherd.js](https://shepherdpro.com/) | Battle-tested, accessible, headless |
| Overlay highlighting | Shepherd built-in | Highlight + block interactions |
| Tooltips | [Tooltip Primitive](https://radix-ui.com/docs/primitives/components/tooltip) (Radix) | Already in dependencies |
| State management | React Context | Simple, no new dependencies |
| Animations | Tailwind + Framer Motion | Already available |
| Content storage | JSON files + localStorage | No DB needed |
| Analytics | Existing tracker | Track tour events |

---

## 🔄 Implementation Steps

### Step 1: Setup Infrastructure
```bash
npm install shepherd.js
# Create folder: src/components/onboarding
# Create folder: src/contexts
# Create folder: src/hooks
```

### Step 2: Create OnboardingContext
```typescript
// OnboardingContext.tsx
export const OnboardingContext = createContext<OnboardingState | null>(null);
export const OnboardingProvider: React.FC<{children}> = ({children}) => {
  const [state, setState] = useState<OnboardingState>({ ... });
  return <OnboardingContext.Provider value={state}>{children}</OnboardingContext.Provider>;
};
```

### Step 3: Create useOnboarding Hook
```typescript
// useOnboarding.ts
export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  return {
    startTour: () => { ... },
    nextStep: () => { ... },
    skipTour: () => { ... },
    completeTour: () => { ... }
  };
};
```

### Step 4: Integrate WelcomeModal
```typescript
// In RootLayout.tsx
<OnboardingProvider>
  {showWelcomeModal && <WelcomeModal />}
  {/* ... rest of app ... */}
</OnboardingProvider>
```

### Step 5: Add Tour Steps
```typescript
// tours.json
{
  "bar_owner": [
    {
      "id": "dashboard-overview",
      "target": "#dashboard-kpi-cards",
      "title": "Your Dashboard",
      "content": "Track all your key metrics here: revenue, top products, team activity"
    },
    {
      "id": "create-sale",
      "target": "#create-sale-btn",
      "title": "Create a Sale",
      "content": "Add new sales, apply promotions, and track inventory"
    },
    // ... more steps
  ]
}
```

### Step 6: Add Help Center Page (Optional)
```typescript
// pages/HelpCenter.tsx
- Index of all topics
- Search functionality
- Linked to tour steps
- FAQ section
- Video tutorials placeholder
```

---

## 🎨 UX Design Details

### Modal Styling
```css
/* WelcomeModal */
- Full-screen overlay (z-index: 9999)
- Center card (md:max-w-2xl)
- Dark background (opacity 70%)
- Smooth fade-in animation

/* TourStep */
- Shepherd default styling (override with Tailwind classes)
- Highlight color: brand-primary
- Tooltip max-width: 400px
- Arrow pointing to target element
```

### Tour Highlight Behavior
```
Target element
  ↓
┌───────────────────┐
│  SPOTLIGHT        │ ← Shepherd overlay (transparent circle/rect)
│  ┌─────────────┐  │
│  │  Button     │  │
│  └─────────────┘  │
│                   │
│  Tooltip box      │
│  [Next] [Skip]    │
└───────────────────┘
  ↓
Rest of page (dimmed, z-index lower)
```

### Accessibility (WCAG 2.1 AA)
- ✅ Keyboard navigation : Arrow keys, Enter, Esc
- ✅ Focus management : Auto-focus [Next] button
- ✅ Screen reader support : aria-labels on buttons
- ✅ High contrast : Black text on white background
- ✅ Motion : Respects `prefers-reduced-motion`

---

## 📊 Content Strategy

### Tour Steps by Role

**Bar Owner (6 steps)**
1. Dashboard overview (KPIs, date filters)
2. Create a sale (quick walkthrough)
3. Manage inventory (stock levels, alerts)
4. Promotions (create happy hour, bundles)
5. Analytics (daily sales, top products)
6. Team management (add members, assign roles)

**Manager (5 steps)**
1-5. Same as bar owner (skip team settings)

**Bartender (3 steps)**
1. Dashboard overview (focus: revenue today)
2. Create a sale (step-by-step)
3. Process return (if applicable)

### Tooltip Content Examples
```json
{
  "createSaleBtn": "Click here to register a new sale, add items, apply discounts",
  "totalRevenue": "Sum of all validated sales in the selected date range",
  "inventory": "Manage stock levels and set low-stock alerts",
  "businessDate": "Sales are tracked by business date (closes at 6 AM)"
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// useOnboarding.test.ts
✓ startTour() initializes state correctly
✓ nextStep() increments step counter
✓ skipTour() marks tour as skipped
✓ localStorage persists state
```

### Integration Tests
```typescript
// WelcomeModal.integration.test.tsx
✓ Modal displays on first login
✓ Role selection changes tour steps
✓ Tour progresses through all steps
✓ Skip tour hides modal
```

### Manual QA
```
✓ First time user flow (cold start)
✓ Returning user flow (localStorage preserved)
✓ Role-specific tours (Bar Owner, Manager, Bartender)
✓ Mobile responsiveness (tour on small screens)
✓ Keyboard navigation (no mouse)
✓ Screen reader (NVDA, JAWS)
✓ High contrast mode (Windows)
```

---

## 📈 Analytics Events

Track these events in your analytics service:

```javascript
// Onboarding events
track('onboarding.tour_started', { role: 'bar_owner' });
track('onboarding.step_viewed', { step: 1, stepId: 'dashboard-overview' });
track('onboarding.tour_completed', { role: 'bar_owner', timeSpent: 432 }); // seconds
track('onboarding.tour_skipped', { step: 3 });
track('help_button_clicked', { page: 'dashboard' });
```

---

## 🚀 Rollout Plan

### Week 1: MVP (Welcome + Basic Tour)
- Deploy WelcomeModal
- Deploy TourGuide for bar_owner role only
- Manual testing only

### Week 2: Expansion
- Add manager & bartender tours
- Add HelpButton
- Add inline tooltips
- Beta test with 10% users

### Week 3: Polish
- Feedback incorporation
- Accessibility audit
- Performance optimization
- Full rollout (100%)

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Tour blocks user (bug) | User can't access features | Test all edge cases, add manual skip button |
| Tour content outdated | Confusion | Keep content.json in sync with UI changes |
| Mobile tour UX breaks | Mobile users frustrated | Test on devices, adjust step targeting |
| Analytics overload | DB strain | Batch events, sample at 10% |
| Shepherd.js conflicts | App breaks | Version lock, test in CI/CD |

---

## 💰 Effort Estimate

| Phase | Effort | Timeline |
|-------|--------|----------|
| 1. Welcome Modal | 1 day | Day 1 |
| 2. Tour Guide | 2 days | Days 2-3 |
| 3. Tooltips | 1 day | Day 4 |
| 4. Help Button | 4h | Day 4 |
| 5. Help Center (optional) | 2 days | Days 5-6 |
| QA + testing | 1 day | Day 7 |
| **Total MVP** | **4.5 days** | **Week 1** |
| Full (with Help Center) | 7 days | 1.5 weeks |

---

## 🎓 Success Criteria

✅ **Technical** :
- Zero console errors in tour flow
- Tour works on all device sizes (mobile, tablet, desktop)
- Keyboard navigation works (no mouse)
- 60+ FPS animations (no jank)

✅ **UX** :
- Users complete tour in < 5 minutes
- Tour can be skipped/restarted at any time
- Existing features not blocked by tour
- No confusion about tour vs. actual UI

✅ **Adoption** :
- 80% of new users complete tour
- < 2% user support tickets about "where do I..." (basics)
- Help button CTR > 15%

---

## 📝 Next Steps

1. **Review this plan** with team
2. **Decide**: MVP (tour only) vs. Full (+ Help Center)
3. **Setup** : Create folder structure, install dependencies
4. **Design** : Finalize tour steps content with product team
5. **Build** : Implement in priority order (Welcome → Tour → Help)
6. **Test** : Manual QA + accessibility audit
7. **Deploy** : Phased rollout (% based)

---

**Status** : Ready for implementation ✅
**Owner** : [Your team]
**Review Date** : 14 janvier 2026
