# Design Détaillé: Guide Utilisateur Post-Onboarding

## 🎨 Visual Design System

### 1. Palette de Couleurs

```
PRIMARY (Blue - Actions & Focus):
- bg-blue-50   → Modal background, highlighted areas
- bg-blue-500  → Progress bar, buttons, highlights
- border-blue-200
- text-blue-900
- text-blue-600

SECONDARY (Gray - Base & Neutral):
- bg-white     → Modal content
- bg-gray-50   → Subtle backgrounds
- text-gray-900 → Titles
- text-gray-700 → Body text
- text-gray-600 → Secondary text
- text-gray-500 → Tertiary text

ACCENT (Amber - Tips & Warnings):
- bg-amber-50   → Pro tips background
- border-amber-200
- text-amber-900

SUCCESS (Green - Completion):
- bg-green-50
- border-green-200
- text-green-900
- Checkmark icon: ✓ (green-600)

HIGHLIGHT (Spotlight):
- border-blue-500 (2px)
- box-shadow: 0 0 20px rgba(59, 130, 246, 0.5)
- Pulsing animation
```

### 2. Typography

```
TITLES:
- text-xl font-semibold text-gray-900 → Step title
- text-lg font-semibold text-gray-900 → Section title
- text-base font-medium text-gray-900 → Subsection

BODY:
- text-base text-gray-700 → Main description
- text-sm text-gray-600 → Secondary text
- text-xs text-gray-500 → Helper text

LABELS:
- text-sm font-medium text-gray-700 → Button labels
- text-xs font-semibold text-blue-600 → Badge text
```

### 3. Spacing & Layout

```
Modal Content:
- Padding: p-6 (desktop), p-4 (mobile)
- Section gap: space-y-6
- Item gap: space-y-3
- Button gap: gap-3

Progress Bar:
- Height: h-1
- Margin: mb-4
- Border radius: rounded-full

Step Content:
- Max width: max-w-lg
- Line height: leading-relaxed
- Margin: mb-4
```

---

## 📱 Component Designs

### A. GuideTourModal

#### Desktop Layout (max-w-2xl w-96)
```
┌────────────────────────────────┐
│ Progress Bar (h-1)             │ ← Blue gradient, animated
├────────────────────────────────┤
│ Step N of M                    │ ← Top right corner
├────────────────────────────────┤
│ 🎯 Step Title                  │ ← Emoji + Title
│                                │
│ Step description goes here.    │ ← Body text
│ It can be multiple lines and   │
│ explain what to do.            │ ← max-w-lg
│                                │
│ [Optional: Image/GIF here]     │ ← max-h-48
│                                │
│ 💡 Pro Tips (if available)     │ ← Amber card with border
│ - Tip 1                        │
│ - Tip 2                        │
├────────────────────────────────┤
│ ← Retour  [Ignorer]  [Suivant →]│ ← Buttons at bottom
├────────────────────────────────┤
│ Était-ce utile? ⭐⭐⭐⭐⭐      │ ← On last step only
└────────────────────────────────┘
```

#### Mobile Layout (full-screen)
```
┌──────────────────────────────────┐
│ ← Close Button                    │
├──────────────────────────────────┤
│ Progress: Step N of M             │
│ ████░░░░░░ 40%                    │
├──────────────────────────────────┤
│ 🎯 Step Title                     │
│                                  │
│ Step description. Full width     │
│ on mobile. Scrollable if long.   │
│                                  │
│ [Image: full width]              │
│                                  │
│ 💡 Pro Tips                      │
│ - Tip 1                          │
│ - Tip 2                          │
│                                  │
│ [Ignorer]   [← Retour] [Suiv. →] │
│ (3 buttons on 2 lines)           │
│                                  │
│ Était-ce utile?                  │
│ ⭐ ⭐ ⭐ ⭐ ⭐                    │
└──────────────────────────────────┘
```

### B. GuideButton (Floating ? Button)

#### Location
- Fixed bottom-right corner
- Bottom: 1.5rem (24px)
- Right: 1.5rem (24px)
- Z-index: z-40 (below modal z-50)
- Safe area on mobile: bottom-safe (for notches)

#### Design
```
┌─────┐
│  ?  │ ← Circle button
└─────┘
w-12 h-12
bg-blue-500
text-white
rounded-full
font-bold text-xl
shadow-lg
hover:shadow-xl
hover:scale-110 (transition)
```

#### Popover Content (click on button)
```
┌──────────────────────────────┐
│ Besoin d'aide?              │
├──────────────────────────────┤
│ Guides recommandés:          │
│                              │
│ [Premier Coup d'Oeil]  2 min│ ← Button (outline)
│ [Gérer l'Inventaire] 3 min│
│ [Analytics]          2 min│
│                              │
│ Afficher tous les guides →   │ ← Link (optional)
└──────────────────────────────┘

Width: w-80
Position: top-4 left-4 from button
Background: white
Border: border gray-200
Shadow: shadow-lg
Border radius: rounded-lg
```

### C. GuideHighlight (Spotlight Overlay)

#### Structure
```
[Dark overlay - 30% opacity black]
  ↓
[Spotlight area - transparent with border]
  ├─ Border: 2px blue-500
  ├─ Border radius: rounded-lg
  ├─ Box shadow: 0 0 20px rgba(59, 130, 246, 0.5) [pulsing]
  └─ Pulsing animation (1.5s loop)
  ↓
[Tooltip/Message - positioned around spotlight]
```

#### Pulsing Animation (Framer Motion)
```typescript
animate={{
  boxShadow: [
    '0 0 0 0 rgba(59, 130, 246, 0.7)',      // Initial
    '0 0 0 20px rgba(59, 130, 246, 0)'      // Fade
  ]
}}
transition={{
  duration: 1.5,
  repeat: Infinity,
  repeatType: 'loop'
}}
```

#### Tooltip Positioning
- Position relative to spotlight
- Options: top, bottom, left, right
- Offset: 12px from spotlight edge
- Arrow pointer to spotlight
- Background: bg-gray-900 (dark)
- Text: text-white
- Border radius: rounded-lg
- Shadow: shadow-xl
- Max width: max-w-xs

Example tooltip:
```
┌──────────────────────┐
│ 🎯 Cliquez ici!     │
│ Voici le bouton     │
│ pour créer une      │
│ nouvelle vente.     │
└──┬──────────────────┘
   └─ [Arrow pointing to spotlight]
```

### D. GuideStep Component

```typescript
interface GuideStepProps {
  step: GuideStep;
}

// Renders:
// 1. Step emoji/icon + title
// 2. Description (max-w-lg)
// 3. Optional media (image/gif/video)
// 4. Optional tips card
// 5. Action CTA text
```

#### Design
```
┌─────────────────────────────┐
│ 🎯 Step Title              │ ← emoji (text-2xl) + title
│                             │
│ Step description goes here. │ ← text-base text-gray-700
│ Multiple lines ok.          │
│ Explain what the user sees  │
│ and what to do next.        │
│                             │
│ ┌─────────────────────────┐ │ ← Image if available
│ │                         │ │   max-h-48 rounded-lg
│ │   [Image/GIF here]      │ │
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│ 💡 Pro Tips (if any)       │ ← Amber card
│ ├─ Tip 1                   │   bg-amber-50
│ ├─ Tip 2                   │   border-l-4 border-amber-500
│ └─ Tip 3                   │   p-3 rounded
│                             │
│ → Action: "Cliquez pour..." │ ← Secondary action text
└─────────────────────────────┘
```

### E. Pro Tips Card

```
┌────────────────────────────────┐
│ 💡 Pro Tips                    │ ← Bulb emoji + title
├────────────────────────────────┤
│ ✓ Tip 1: Vous pouvez...       │ ← Green checkmark
│ ✓ Tip 2: N'oubliez pas...     │
│ ✓ Tip 3: Astuce rapide...     │
└────────────────────────────────┘

Styling:
- Background: bg-amber-50
- Border: border-l-4 border-amber-500
- Padding: p-4
- Border radius: rounded-lg
- Title: font-semibold text-amber-900
- Items: text-sm text-amber-800
- Gap: space-y-2
```

### F. Rating Section (Last Step)

```
┌────────────────────────────────┐
│ Ce guide vous a-t-il été       │
│ utile?                         │
│                                │
│ ⭐ ⭐ ⭐ ⭐ ⭐              │
│                                │
│ Votre feedback nous aide à     │
│ améliorer les guides!          │
└────────────────────────────────┘

Stars:
- Clickable (hover effect)
- Animation on click (scale 1.2)
- Color filled: #FBBF24 (amber-400)
- Interactive: Can change rating
- Cursor: pointer
```

---

## 🎬 Animation Specifications

### 1. Modal Entrance
```typescript
initial: { opacity: 0, scale: 0.95, y: 20 }
animate: { opacity: 1, scale: 1, y: 0 }
exit: { opacity: 0, scale: 0.95, y: 20 }
transition: {
  duration: 0.3,
  type: 'spring',
  stiffness: 300,
  damping: 20
}
```

### 2. Progress Bar Fill
```typescript
// Smooth fill animation
transition: { duration: 0.5, ease: 'easeInOut' }
// Example: 0% → 50% → 100%
```

### 3. Spotlight Pulse
```typescript
// Continuous pulse around highlighted element
animate: {
  boxShadow: [
    '0 0 0 0 rgba(59, 130, 246, 0.7)',
    '0 0 0 20px rgba(59, 130, 246, 0)'
  ]
}
transition: {
  duration: 1.5,
  repeat: Infinity,
  repeatType: 'loop'
}
```

### 4. Step Content Fade
```typescript
// Staggered reveal of step content
container: { staggerChildren: 0.05 }
child: { opacity: 0, y: 10 } → { opacity: 1, y: 0 }
```

### 5. Button Hover States
```
Default:
- Background: bg-blue-600
- Scale: 1
- Shadow: shadow-md

Hover:
- Background: bg-blue-700
- Scale: 1.02
- Shadow: shadow-lg

Click/Active:
- Scale: 0.98
- Shadow: shadow-md

Disabled:
- Opacity: opacity-50
- Cursor: cursor-not-allowed
```

### 6. Navigation Buttons
```
Previous Button (← Retour):
- Appears only if currentStep > 0
- Variant: outline
- Click: prevStep()

Skip Button (Ignorer):
- Always visible
- Variant: ghost (low visibility)
- Click: skipTour()

Next/Continue Button (Suivant →):
- Always visible
- Variant: primary (blue)
- Changes text on last step: "Terminé"
- Click: nextStep() or completeTour()
```

---

## 📐 Responsive Design

### Breakpoints
```
Mobile (< 640px):
- Full screen modal
- Modal height: 95vh
- Padding: p-4
- Single column layout
- Buttons stack on 2 rows

Tablet (640px - 1024px):
- Center modal
- Max width: max-w-md (28rem)
- Padding: p-6
- 2-column button layout

Desktop (> 1024px):
- Center modal
- Max width: max-w-2xl (42rem) OR w-96 (sidebar-like)
- Padding: p-8
- 3-button row
```

### Mobile Considerations
- Touch targets: min-h-12 (48px) for buttons
- Spacing: Larger gaps for touch
- Text: Larger font on mobile (text-base instead of text-sm for body)
- Scrolling: Content may scroll inside modal
- Notch safe area: Use safe-area-inset on bottom-right button

---

## 🎯 User Flow Diagrams

### Flow 1: Guide Triggered on Page Load
```
User lands on Dashboard
    ↓
GuideProvider checks triggers
    ↓
"First visit after onboarding?" YES
    ↓
Load guide data (dashboard-overview)
    ↓
Wait 2 seconds (delay)
    ↓
Show GuideTourModal
    ↓
User sees Step 1 with spotlight (if selector available)
```

### Flow 2: User Manually Opens Guide
```
User clicks "?" button
    ↓
Show Popover with suggested guides
    ↓
User clicks "Premier Coup d'Oeil"
    ↓
startTour('dashboard-overview')
    ↓
GuideTourModal opens
    ↓
Show Step 1
```

### Flow 3: User Completes Guide
```
User on last step
    ↓
User clicks "Terminé" button
    ↓
Show 5-star rating
    ↓
User clicks rating (e.g., 4 stars)
    ↓
completeTour(rating: 4)
    ↓
Save progress to Supabase
    ↓
Modal closes with success animation
    ↓
Show brief "Thanks for feedback" toast
```

---

## 🚨 Error States

### If Selector Not Found
```
// Don't show GuideHighlight
// Modal still shows normally
// Log warning: console.warn('Guide selector not found:', selector)
// User sees regular modal without spotlight
```

### If Data Fails to Load
```
// Show error state in modal
┌─────────────────────────────┐
│ ⚠️ Guide Error             │
│                             │
│ Oops! We couldn't load      │
│ this guide. Please try      │
│ again later.                │
│                             │
│ [← Retour] [Fermer]        │
└─────────────────────────────┘
```

### If Network Error
```
// Show Supabase error gracefully
// Don't block app
// Show toast: "Couldn't save your feedback"
// Continue with guide (progress saved locally)
```

---

## ♿ Accessibility

### ARIA Labels
```jsx
<div
  role="dialog"
  aria-labelledby="guide-title"
  aria-describedby="guide-description"
  aria-modal="true"
>
  <h2 id="guide-title">{step.title}</h2>
  <p id="guide-description">{step.description}</p>
</div>
```

### Keyboard Navigation
```
Tab → Navigate buttons
Enter → Click button
Escape → Close modal (if allowed)
Arrow Keys → Prev/Next step (optional)
```

### Screen Reader Text
```jsx
<span className="sr-only">
  Étape {currentStepIndex + 1} de {totalSteps}
</span>
```

### Color Contrast
- All text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Don't rely on color alone for highlighting
- Use border + icon + color for visibility

---

## 🎪 Example: Complete Step Design

### Step: "Create Your First Sale" (Bartender)

```
┌────────────────────────────────────────┐
│ Progress: Step 1 of 3  |  33%         │
├────────────────────────────────────────┤
│                                        │
│ 🍺 Créer Votre Première Vente        │
│                                        │
│ Chaque vente que vous créez compte    │
│ dans le système. C'est simple: cliquez│
│ sur le bouton ci-dessous et suivez   │
│ les étapes.                           │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ [Video/GIF showing sale creation]  │ │
│ │ Duration: 15 seconds               │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 💡 Pro Tips                           │
│ ✓ Vous pouvez ajouter plusieurs      │
│   produits à une vente                │
│ ✓ Les promos s'appliquent            │
│   automatiquement                     │
│ ✓ Gardez un reçu imprimé ou digital │
│                                        │
│ → Cliquez sur [+Créer Vente] pour    │
│   commencer                           │
│                                        │
├────────────────────────────────────────┤
│ [← Retour]  [Ignorer]  [Suivant →]   │
├────────────────────────────────────────┤
│ Était-ce utile?                       │
│ ⭐ ⭐ ⭐ ⭐ ⭐ (Click to rate)       │
└────────────────────────────────────────┘
```

---

## 📋 Implementation Checklist

- [ ] Color palette defined in Tailwind
- [ ] Typography system consistent
- [ ] Modal component responsive
- [ ] Highlight component with animations
- [ ] Button styles and states
- [ ] Pro tips card styling
- [ ] Rating component
- [ ] Popover for guide button
- [ ] Mobile breakpoints tested
- [ ] Accessibility WCAG AA
- [ ] Animation timings consistent
- [ ] Error states designed
- [ ] Loading states
- [ ] Success animations
- [ ] Dark mode support (optional)
- [ ] RTL support consideration (future)

---

**Cette spécification visuelle est prête pour l'implémentation des composants! 🎨**
