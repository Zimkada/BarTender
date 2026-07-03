# Architecture: Guide Utilisateur Post-Onboarding pour BarTender

## 🎯 Vision & Objectifs

**Objectif Principal:**
Créer un système de guide utilisateur post-onboarding qui:
- Aide les utilisateurs à maîtriser les fonctionnalités après le onboarding
- Reste discret et non-intrusif sur le dashboard
- Personnalisé par rôle (Propriétaire, Gérant, Barman)
- S'intègre naturellement à l'existant (UI, patterns, animations)

**Non-Objectifs:**
- Remplacer le onboarding (le onboarding = apprentissage forcé, guide = apprentissage optionnel)
- Créer une documentation externe (guide = dans l'app)
- Implémenter un chatbot (guide = UI structurée)

---

## 📐 Architecture Proposée

### 1. Modèle de Données: GuideTour

```typescript
// src/types/guide.ts
export interface GuideTour {
  id: string;
  title: string;
  description: string;
  targetRoles: UserRole[];
  steps: GuideStep[];
  estimatedDuration: number; // en minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  triggers: GuideTrigger[]; // Quand afficher ce guide
  createdAt: Date;
  updatedAt: Date;
}

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  elementSelector?: string; // CSS selector pour highlight
  position: 'top' | 'bottom' | 'left' | 'right';
  action: string; // "Click button X to..." ou "You'll see..."
  tips?: string[]; // Pro tips pour cette étape
  media?: {
    type: 'image' | 'video' | 'gif';
    url: string;
    alt: string;
  };
}

export interface GuideTrigger {
  type: 'onMount' | 'onAction' | 'onFeatureAvailable';
  condition: string;
  delay?: number;
  showOnce?: boolean; // Ne montrer qu'une fois
}

export interface GuideProgress {
  userId: string;
  tourId: string;
  currentStepIndex: number;
  completedAt?: Date;
  skippedAt?: Date;
  completionPercentage: number;
  helpfulRating?: 1 | 2 | 3 | 4 | 5;
}
```

---

## 🗺️ Guides Par Rôle

### A. Propriétaire (Promoteur) - 5 Guides

#### Guide 1: "Premier Coup d'Oeil Dashboard" (2 min)
**Triggers:**
- OnMount après onboarding
- showOnce = true
- Delay = 2 secondes (laisser page charger)

**Steps:**
1. "Bienvenue sur votre dashboard!" → Highlight top section
   - "Voici vos stats de revenus en temps réel"
   - Media: Screenshot du widget revenue

2. "Section Ventes en Attente" → Highlight pending sales
   - "Vos gérants doivent valider ces ventes"
   - Action: "Cliquez pour voir les détails"

3. "Performance Équipe" → Highlight team table
   - "Voyez qui performent le mieux"
   - Action: "Triez par colonnes"

4. "Navigation Principale" → Highlight header
   - "Accédez à Inventaire, Analytics, Comptabilité, etc."
   - Highlight: [Inventory] [Analytics] [Accounting] [Settings]

#### Guide 2: "Gérer Votre Inventaire" (3 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Inventory" for first time

**Steps:**
1. "Bienvenue en Inventaire"
2. "Ajouter des Produits" → Highlight + button
3. "Enregistrer un Approvisionnement" → Highlight supply form
4. "Suivre le Stock" → Highlight stock levels
5. "Pro Tips" → Conseil: "Vous pouvez exporter en Excel"

#### Guide 3: "Analyser Votre Performance" (3 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Analytics"

**Steps:**
1. "Bienvenue en Analytics"
2. "Ventes par Période" → Chart highlight
3. "Produits Top" → Chart highlight
4. "Performance par Serveur" → Chart highlight
5. "Export & Rapports" → Button highlight

#### Guide 4: "Gérer Votre Équipe" (2 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Team"

**Steps:**
1. "Gestion d'Équipe"
2. "Ajouter un Gérant"
3. "Créer des Comptes Serveur"
4. "Assigner des Rôles"
5. "Pro Tips" → "Vous pouvez désactiver temporairement des accès"

#### Guide 5: "Paramètres & Configuration" (2 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Settings"

**Steps:**
1. "Paramètres du Bar"
2. "Informations Bar"
3. "Modes Opérationnels"
4. "Horaires & Fermeture"
5. "Intégrations"

---

### B. Gérant (Manager) - 3 Guides

#### Guide 1: "Votre Espace Gérant" (2 min)
**Triggers:**
- onMount après onboarding
- showOnce = true

**Steps:**
1. "Dashboard Gérant" → Overview
2. "Créer une Vente"
3. "Valider les Ventes"
4. "Voir la Performance"

#### Guide 2: "Gérer l'Inventaire" (2 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Inventory"

**Steps:**
1. "Votre Inventaire"
2. "Enregistrer un Approvisionnement"
3. "Suivre les Stocks"
4. "Pro Tips" → "Vous ne pouvez pas ajouter de produits (demandez au propriétaire)"

#### Guide 3: "Voir les Analytics" (2 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Analytics"

**Steps:**
1. "Rapports & Analytics"
2. "Vos Ventes"
3. "Performance Équipe"
4. "Exporter un Rapport"

---

### C. Barman (Serveur) - 2 Guides

#### Guide 1: "Créer Votre Première Vente" (3 min)
**Triggers:**
- onMount après onboarding
- showOnce = true

**Steps:**
1. "Créer une Vente" → Highlight button
   - "Chaque vente compte dans le système"
2. "Sélectionner les Produits" → Highlight product selector
   - "Vous pouvez ajuster les quantités"
3. "Appliquer une Promotion?" → Highlight promo selector
4. "Sélectionner le Paiement" → Highlight payment method
5. "Valider la Vente" → Highlight submit button
6. "Voir vos Ventes" → Link to personal sales history

#### Guide 2: "Voir Votre Performance" (2 min)
**Triggers:**
- showOnce = true
- onAction: user clicks "Analytics" or personal stats

**Steps:**
1. "Votre Performance"
2. "Ventes Aujourd'hui"
3. "Top Produits Vendus"
4. "Comparaison avec Équipe"

---

## 🏗️ Structure des Composants

### Directory Structure
```
src/
├── components/
│   ├── guide/
│   │   ├── GuideProvider.tsx          # Context + state management
│   │   ├── GuideTourModal.tsx         # Modal contenant les steps
│   │   ├── GuideStep.tsx              # Single step renderer
│   │   ├── GuideHighlight.tsx         # Highlight élément target
│   │   ├── GuideButton.tsx            # "?" button dans le coin
│   │   └── GuideCard.tsx              # Petit widget pour suggestions
│   └── ...
├── context/
│   └── GuideContext.tsx               # Guide state management
├── hooks/
│   ├── useGuide.ts                    # Hook pour déclencher/arrêter guides
│   ├── useGuideProgress.ts            # Hook pour progression
│   └── useGuideAnimation.ts           # Hook pour animations
├── services/
│   └── guide.service.ts               # API calls pour guide progress
├── data/
│   └── guides/
│       ├── owner-guides.ts            # Guides pour propriétaires
│       ├── manager-guides.ts          # Guides pour gérants
│       ├── bartender-guides.ts        # Guides pour barmen
│       └── shared-guides.ts           # Guides partagés
└── types/
    └── guide.ts                       # Types & interfaces
```

### Key Components

#### 1. GuideProvider (Context)
```typescript
// src/context/GuideContext.tsx

interface GuideContextType {
  activeTour: GuideTour | null;
  currentStepIndex: number;
  isVisible: boolean;

  // Actions
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeTour: () => void;
  skipTour: () => void;
  rateTour: (rating: 1|2|3|4|5) => void;
}

// Wrap app in GuideProvider at root level
// <GuideProvider>
//   <App />
// </GuideProvider>
```

#### 2. GuideTourModal
```typescript
// src/components/guide/GuideTourModal.tsx

export const GuideTourModal: React.FC = () => {
  const { activeTour, currentStepIndex, nextStep, prevStep, completeTour, skipTour } = useGuide();

  if (!activeTour) return null;

  const currentStep = activeTour.steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / activeTour.steps.length) * 100;

  return (
    <Modal isOpen={true} className="z-50">
      {/* Progress bar */}
      <div className="h-1 bg-gray-200 rounded-full mb-4">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step content */}
      <GuideStep step={currentStep} />

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-6">
        {currentStepIndex > 0 && (
          <Button variant="outline" onClick={prevStep}>← Retour</Button>
        )}
        <Button variant="ghost" onClick={skipTour}>Ignorer</Button>
        <Button
          onClick={currentStepIndex === activeTour.steps.length - 1 ? completeTour : nextStep}
        >
          {currentStepIndex === activeTour.steps.length - 1 ? 'Terminé' : 'Suivant →'}
        </Button>
      </div>

      {/* Rating (last step) */}
      {currentStepIndex === activeTour.steps.length - 1 && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">Ce guide vous a-t-il été utile?</p>
          <div className="flex gap-2">
            {[1,2,3,4,5].map(rating => (
              <button
                key={rating}
                onClick={() => rateTour(rating)}
                className="text-2xl hover:scale-125 transition"
              >
                {'⭐'.repeat(rating)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
```

#### 3. GuideButton
```typescript
// src/components/guide/GuideButton.tsx
// Petit "?" button dans le coin bas-droit (sticky)

export const GuideButton: React.FC = () => {
  const { suggestedTours, startTour } = useGuide();

  return (
    <Popover>
      <Button
        className="fixed bottom-6 right-6 rounded-full w-12 h-12 flex items-center justify-center bg-blue-500 text-white"
      >
        ?
      </Button>

      <Popover.Content className="w-80">
        <div className="space-y-3">
          <h3 className="font-semibold">Besoin d'aide?</h3>

          {suggestedTours.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Guides recommandés:</p>
              {suggestedTours.map(tour => (
                <Button
                  key={tour.id}
                  variant="outline"
                  onClick={() => startTour(tour.id)}
                  className="w-full justify-start"
                >
                  {tour.title}
                  <span className="ml-auto text-xs text-gray-500">
                    {tour.estimatedDuration} min
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">Tous les guides ont été vus!</p>
          )}
        </div>
      </Popover.Content>
    </Popover>
  );
};
```

#### 4. GuideHighlight
```typescript
// src/components/guide/GuideHighlight.tsx
// Overlay + spotlight sur l'élément à montrer

export const GuideHighlight: React.FC<{
  selector: string;
  message?: string;
}> = ({ selector, message }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = document.querySelector(selector);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    // Positioner l'overlay autour de l'élément
    // Utiliser canvas/SVG pour créer un "spotlight"
  }, [selector]);

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" />

      {/* Spotlight area (transparent) */}
      <div
        className="fixed border-2 border-blue-500 rounded-lg pointer-events-none z-40"
        style={{
          top: `${rect.top - 8}px`,
          left: `${rect.left - 8}px`,
          width: `${rect.width + 16}px`,
          height: `${rect.height + 16}px`,
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
        }}
      />

      {/* Message tooltip */}
      {message && <GuideTooltip message={message} />}
    </>
  );
};
```

---

## 🎨 Design & UX Patterns

### Animation Style
```typescript
// src/hooks/useGuideAnimation.ts

// Modal entrance (Framer Motion)
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, type: 'spring', stiffness: 300 }
  },
  exit: { opacity: 0, scale: 0.95, y: 20 }
};

// Highlight pulse
const highlightVariants = {
  pulse: {
    boxShadow: [
      '0 0 0 0 rgba(59, 130, 246, 0.7)',
      '0 0 0 20px rgba(59, 130, 246, 0)'
    ],
    transition: { duration: 1.5, repeat: Infinity }
  }
};
```

### Color Scheme
```
Guide Modal: bg-white, border-blue-200
Step Title: text-lg font-semibold text-gray-900
Step Description: text-gray-700
Progress Bar: bg-gradient-to-r from-blue-500 to-blue-600
Pro Tips: bg-amber-50, border-amber-200, text-amber-900
Success State: bg-green-50, text-green-900
Highlight: border-blue-500, shadow-blue-500/50
```

### Modal Responsive
- Mobile: `w-full h-[95vh] max-w-full` (full screen avec petit padding)
- Desktop: `max-w-2xl w-96` (sidebar-like)
- Position: Center screen (modal), pas fixed à droite

---

## 📊 Storage & Analytics

### Progress Storage
```typescript
// Supabase table: guide_progress
{
  id: uuid,
  user_id: uuid,
  tour_id: string,
  current_step_index: int,
  started_at: timestamp,
  completed_at: timestamp (nullable),
  skipped_at: timestamp (nullable),
  helpful_rating: int (1-5, nullable),
  created_at: timestamp,
  updated_at: timestamp,
}

// Index: (user_id, tour_id) - Pour query rapide
// RLS Policy: Users ne voient que leur progress
```

### Events pour Analytics
```typescript
// Track in AuditLogger
- GUIDE_STARTED: { tour_id, user_role }
- GUIDE_STEP_VIEWED: { tour_id, step_index }
- GUIDE_COMPLETED: { tour_id, time_spent_minutes, helpful_rating }
- GUIDE_SKIPPED: { tour_id, step_index }
```

### Insights
- Quels guides sont complétés vs skippés
- Où les utilisateurs abandonnent
- Ratings par guide
- Temps moyen par guide
- Corrélation: completion de guide → moins de support requests

---

## 🚀 Implementation Phases

### Phase 1: Infrastructure (1-2 jours)
- [x] GuideContext + Provider
- [x] Guide data types
- [x] GuideProgress table in Supabase
- [x] Basic GuideTourModal component

### Phase 2: Owner Guides (2-3 jours)
- [ ] 5 guides for owners
- [ ] GuideHighlight component
- [ ] Analytics integration
- [ ] Testing on owner dashboard

### Phase 3: Manager & Bartender Guides (1-2 jours)
- [ ] 3 manager guides
- [ ] 2 bartender guides
- [ ] Multi-role testing

### Phase 4: Polish & Analytics (1 jour)
- [ ] GuideButton with suggestions
- [ ] Animations refinement
- [ ] Analytics dashboard
- [ ] User feedback collection

---

## 💡 Pro Features (Future)

**Phase 2 Ideas:**
- Video/GIF support dans les steps (not just images)
- "Search guides by keyword" dans le ? button
- "Mark as helpful" individual steps (not just tour)
- "Need more help?" → Link to help docs/support
- Dark mode support for guide modals
- Keyboard shortcuts (← → to navigate steps)
- Accessibility: ARIA labels, keyboard navigation
- A/B testing different guide wording

**Analytics Dashboard:**
- % of users who complete guides by role
- Avg time per guide
- Drop-off analysis
- Rating distribution
- Correlation with support tickets

---

## 🔌 Integration Points

### In OnboardingFlow
```typescript
// After onboarding complete, check which guides to show
const { suggestedTours, startTour } = useGuide();
useEffect(() => {
  if (onboardingComplete) {
    const suggested = suggestedTours.filter(t => t.targetRoles.includes(userRole));
    if (suggested.length > 0) {
      // "Want a quick tour?" → Start first suggested guide
    }
  }
}, [onboardingComplete]);
```

### In Dashboard
```typescript
// GuideButton always present in corner
// Suggests relevant guides based on current page
// Auto-triggers guides on first feature access (with permission)

// Example: User opens Inventory for first time
if (inventoryFirstTime && !guideCompleted('manage-inventory')) {
  startTour('manage-inventory');
}
```

### In Header
```typescript
// Optional: Small "New?" indicator if uncompleted guide relevant to current page
<div className="flex items-center gap-2">
  {uncompletedGuideForCurrentPage && (
    <Badge variant="info">Guide disponible</Badge>
  )}
  <GuideButton />
</div>
```

---

## 📋 Avantages de Cette Architecture

✅ **Moderne & Performante:**
- Lazy-loaded guides (only load when needed)
- Lightweight component tree
- No external dependencies needed (except Framer Motion, déjà utilisé)

✅ **Robuste:**
- Data persisted in Supabase (survit à refresh)
- Error boundaries autour des guides (if guide breaks, app continues)
- Fallback si selector pas trouvé

✅ **Maintenable:**
- Guides définis comme données (pas de code React)
- Easy to add/edit guides sans toucher composants
- Clair separation: data (guides/) vs logic (components/guide/)

✅ **Cohérent avec Existant:**
- Utilise les mêmes patterns (Context, Hooks, Framer Motion)
- Mêmes colors/typography du design system
- Animations consistent avec app existant
- RLS & Supabase patterns utilisés partout

✅ **Scalable:**
- Add 100 guides = just update guides/ files
- Multi-language? = guides have i18n keys
- A/B testing? = variants in guide config
- Analytics ready from day 1

---

## 📝 Next Steps

1. **Créer GuideContext & hooks** (src/context/GuideContext.tsx)
2. **Définir guide data** pour propriétaires (src/data/guides/owner-guides.ts)
3. **Implémenter GuideTourModal** (src/components/guide/GuideTourModal.tsx)
4. **Ajouter GuideHighlight** pour spotlight
5. **Intégrer GuideButton** dans RootLayout
6. **Migration Supabase** pour guide_progress table
7. **Testing & refinement** avec utilisateurs réels

---

## 🎓 Exemple Complet: Guide "Premier Coup d'Oeil Dashboard"

```typescript
// src/data/guides/owner-guides.ts

export const OWNER_GUIDES: GuideTour[] = [
  {
    id: 'dashboard-overview',
    title: 'Premier Coup d\'Oeil Dashboard',
    description: 'Découvrez les principaux éléments de votre dashboard',
    targetRoles: ['promoteur'],
    estimatedDuration: 2,
    difficulty: 'beginner',
    triggers: [
      {
        type: 'onMount',
        condition: 'isDashboard && isFirstVisitAfterOnboarding',
        delay: 2000,
        showOnce: true
      }
    ],
    steps: [
      {
        id: 'step-1',
        title: 'Bienvenue sur votre dashboard!',
        description: 'Vous êtes maintenant prêt à gérer votre bar. Voici un aperçu rapide de ce que vous allez voir.',
        position: 'bottom',
        action: 'Cliquez sur Suivant pour continuer',
        tips: [
          'Toutes les informations se mettent à jour en temps réel',
          'Vous pouvez actualiser avec le bouton sync en haut à droite'
        ],
        media: {
          type: 'image',
          url: '/guides/dashboard-welcome.png',
          alt: 'Dashboard Overview'
        }
      },
      {
        id: 'step-2',
        title: 'Vos Revenus en Temps Réel',
        description: 'Le widget en haut montre vos revenus d\'aujourd\'hui et les tendances.',
        elementSelector: '[data-guide="revenue-widget"]',
        position: 'bottom',
        action: 'Cliquez sur le widget pour voir plus de détails'
      },
      // ... plus de steps
    ]
  }
];
```

---

**Cette architecture est prête pour l'implémentation et s'intègre parfaitement à BarTender! 🚀**
