# Plan d'Implémentation - Refonte Onboarding Architecture

**Branche:** `refactor/onboarding-redirect-architecture`
**Date:** 2026-01-25
**Objectif:** Transformer l'onboarding d'un système avec fonctionnalités dupliquées vers un système de guidage avec redirections vers les menus réels

---

## 📋 Résumé Exécutif

### Problème Actuel
L'onboarding actuel **duplique ~1,205 lignes de code** (28% du total) en recréant des fonctionnalités qui existent déjà dans l'application :
- ProductSelectorModal duplique ProductModal (275 lignes)
- AddProductsStep duplique la gestion des produits
- SetupStaffStep duplique la création de comptes serveurs
- StockInitStep duplique l'initialisation du stock
- AddManagersStep duplique la gestion des gérants

### Solution
Transformer l'onboarding en **système de guidage** qui :
- Redirige vers les menus réels (pas de duplication)
- Détecte automatiquement la complétion des tâches
- Permet la délégation implicite (propriétaire ↔ gérant via communication physique)
- Réduit le code de **3,678 → ~1,450 lignes** (61% de réduction)

---

## 🎯 Objectifs de la Refonte

1. ✅ **Éliminer toute duplication de code**
2. ✅ **Rediriger vers les menus existants** avec contexte onboarding
3. ✅ **Auto-détection de complétion** via polling
4. ✅ **Délégation implicite** (hints uniquement, pas de tracking)
5. ✅ **Simplifier le parcours serveur** (pas de vidéo démo)
6. ✅ **Maintenir la source de vérité unique** (`bars.is_setup_complete`)

---

## 📊 Architecture Technique

### Principes Fondamentaux

```
AVANT (Duplication):
┌─────────────────────────────────────┐
│  Onboarding                         │
│  ├─ AddProductsStep (200 lignes)   │  ← DUPLIQUE ProductModal
│  ├─ ProductSelectorModal (275)     │  ← DUPLIQUE ProductModal
│  ├─ SetupStaffStep (180)           │  ← DUPLIQUE TeamManagement
│  └─ StockInitStep (170)            │  ← DUPLIQUE InventoryPage
└─────────────────────────────────────┘

APRÈS (Redirection):
┌─────────────────────────────────────┐
│  Onboarding                         │
│  ├─ RedirectStep (1 composant)     │  → /inventory?mode=onboarding
│  │   └─ Auto-detection polling     │  → /team?mode=onboarding
│  └─ OnboardingBreadcrumb           │  → /inventory?tab=operations
└─────────────────────────────────────┘
```

### Flux de Données

```typescript
// 1. Redirection avec contexte
navigate('/inventory?mode=onboarding&task=add-products');

// 2. Page existante détecte le mode
const isOnboardingMode = searchParams.get('mode') === 'onboarding';

// 3. Affichage du breadcrumb
{isOnboardingMode && <OnboardingBreadcrumb currentStep="Ajouter Produits" />}

// 4. Utilisateur complète la tâche normalement
// (utilise ProductModal existant)

// 5. Auto-détection (polling 5s)
useEffect(() => {
  const check = async () => {
    const complete = await OnboardingCompletionService.checkProductsAdded(barId);
    if (complete) navigate('/onboarding'); // Retour à onboarding
  };
  const interval = setInterval(check, 5000);
}, []);
```

---

## 🗂️ Structure des Fichiers

### Fichiers à CRÉER

```
src/
├── services/onboarding/
│   └── completionTracking.service.ts       [NEW] Auto-détection des tâches
├── components/onboarding/
│   ├── steps/
│   │   └── RedirectStep.tsx                [NEW] Composant générique de redirection
│   └── ui/
│       └── OnboardingBreadcrumb.tsx        [NEW] Fil d'Ariane dans les pages
```

### Fichiers à MODIFIER

```
src/
├── components/onboarding/
│   ├── OnboardingFlow.tsx                  [MODIFY] Config-driven architecture
│   ├── BarDetailsStep.tsx                  [KEEP] Formulaire inline (justifié)
│   ├── ReviewStep.tsx                      [MODIFY] Validation améliorée
│   ├── WelcomeStep.tsx                     [KEEP] Aucun changement
│   ├── RoleDetectedStep.tsx                [KEEP] Aucun changement
│   ├── ManagerRoleConfirmStep.tsx          [KEEP] Déjà enrichi avec hints
│   ├── BartenderIntroStep.tsx              [KEEP] Aucun changement
│   ├── BartenderDemoStep.tsx               [KEEP] Déjà simplifié
│   └── BartenderTestSaleStep.tsx           [KEEP] Déjà simplifié
├── pages/
│   ├── InventoryPage.tsx                   [MODIFY] Support mode=onboarding
│   └── TeamManagementPage.tsx              [MODIFY] Support mode=onboarding
├── context/
│   └── OnboardingContext.tsx               [SIMPLIFY] Réduire complexité stepData
└── services/supabase/
    └── onboarding.service.ts               [CLEANUP] Supprimer méthodes dupliquées
```

### Fichiers à SUPPRIMER

```
src/components/onboarding/
├── AddProductsStep.tsx                     [DELETE] 200 lignes
├── AddManagersStep.tsx                     [DELETE] 230 lignes
├── SetupStaffStep.tsx                      [DELETE] 180 lignes
├── StockInitStep.tsx                       [DELETE] 170 lignes
└── modals/
    ├── ProductSelectorModal.tsx            [DELETE] 275 lignes
    └── ManagerSearchModal.tsx              [DELETE] 150 lignes

TOTAL SUPPRIMÉ: ~1,205 lignes
```

---

## 🔧 Implémentation Détaillée

### Phase 1️⃣ : Création des Nouveaux Services

#### 1.1 OnboardingCompletionService

**Fichier:** `src/services/onboarding/completionTracking.service.ts`

```typescript
import { supabase } from '@/lib/supabase';

/**
 * Service de détection automatique de complétion des tâches d'onboarding
 * Utilisé par RedirectStep pour polling
 */
export class OnboardingCompletionService {
  /**
   * Vérifie si des produits ont été ajoutés au bar
   */
  static async checkProductsAdded(barId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('bar_products')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('is_active', true);

    if (error) {
      console.error('Error checking products:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Vérifie si le stock a été initialisé (au moins 1 produit avec stock > 0)
   */
  static async checkStockInitialized(barId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('bar_products')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('is_active', true)
      .gt('current_stock', 0);

    if (error) {
      console.error('Error checking stock:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Vérifie si des serveurs ont été ajoutés
   */
  static async checkServersAdded(barId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('bar_members')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('role', 'serveur')
      .eq('is_active', true);

    if (error) {
      console.error('Error checking servers:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Vérifie si des gérants ont été ajoutés
   */
  static async checkManagersAdded(barId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('bar_members')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('role', 'gérant')
      .eq('is_active', true);

    if (error) {
      console.error('Error checking managers:', error);
      return false;
    }

    return (count || 0) > 0;
  }

  /**
   * Vérifie toutes les tâches obligatoires pour le propriétaire
   */
  static async checkOwnerMandatoryTasks(barId: string): Promise<{
    barDetailsComplete: boolean;
    productsAdded: boolean;
  }> {
    const { data: bar } = await supabase
      .from('bars')
      .select('name, location')
      .eq('id', barId)
      .single();

    return {
      barDetailsComplete: !!(bar?.name && bar?.location),
      productsAdded: await this.checkProductsAdded(barId),
    };
  }
}
```

**Justification:**
- **Séparation des préoccupations:** Logique métier isolée
- **Réutilisable:** Peut être utilisé ailleurs (ReviewStep, Dashboard)
- **Testable:** Facile à mocker pour les tests unitaires
- **Performance:** Utilise `head: true` pour compter sans charger les données

---

#### 1.2 RedirectStep Component

**Fichier:** `src/components/onboarding/steps/RedirectStep.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBar } from '@/context/BarContext';
import { CheckCircle, ArrowRight, Clock } from 'lucide-react';
import { LoadingButton } from '@/components/ui/LoadingButton';

interface RedirectStepConfig {
  id: string;
  title: string;
  description: string;
  icon?: string;
  targetRoute: string;
  completionCheck: (barId: string) => Promise<boolean>;
  isMandatory: boolean;
  delegationHint?: string; // Pour les étapes du propriétaire
}

interface RedirectStepProps {
  config: RedirectStepConfig;
  onComplete: () => void;
  onSkip?: () => void;
}

export const RedirectStep: React.FC<RedirectStepProps> = ({
  config,
  onComplete,
  onSkip,
}) => {
  const navigate = useNavigate();
  const { currentBar } = useBar();
  const [isComplete, setIsComplete] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Initial check + polling toutes les 5 secondes
  useEffect(() => {
    if (!currentBar?.id) return;

    const checkCompletion = async () => {
      try {
        // Délai artificiel pour éviter race conditions DB
        await new Promise(resolve => setTimeout(resolve, 500));
        const complete = await config.completionCheck(currentBar.id);
        setIsComplete(complete);

        if (complete && isChecking) {
          setIsChecking(false);
          // Auto-progression si tâche complétée
          setTimeout(() => onComplete(), 1500);
        }
      } catch (error) {
        console.error('Error checking completion:', error);
      } finally {
        setIsChecking(false);
      }
    };

    // Check immédiat
    checkCompletion();

    // Polling toutes les 5 secondes
    const interval = setInterval(checkCompletion, 5000);

    return () => clearInterval(interval);
  }, [currentBar?.id, config, isChecking, onComplete]);

  const handleRedirect = () => {
    navigate(config.targetRoute);
  };

  const handleSkip = () => {
    if (onSkip) onSkip();
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="mb-8">
          {config.icon && (
            <div className="text-5xl mb-4 text-center">{config.icon}</div>
          )}
          <h1 className="text-3xl font-bold text-gray-900">{config.title}</h1>
          <p className="mt-2 text-gray-600">{config.description}</p>
        </div>

        {/* Status */}
        <div className={`p-6 rounded-lg mb-6 ${
          isComplete
            ? 'bg-green-50 border border-green-200'
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-center gap-3">
            {isComplete ? (
              <>
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">✓ Tâche complétée</p>
                  <p className="text-sm text-green-700">Redirection automatique...</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">
                    {config.isMandatory ? '⚠️ Tâche obligatoire' : 'Tâche optionnelle'}
                  </p>
                  <p className="text-sm text-blue-700">
                    Cliquez ci-dessous pour accéder au menu concerné
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Delegation Hint (Propriétaire uniquement) */}
        {config.delegationHint && !isComplete && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
            <p className="text-sm text-amber-900">
              💡 <strong>Délégation :</strong> {config.delegationHint}
            </p>
          </div>
        )}

        {/* Actions */}
        {!isComplete && (
          <div className="space-y-3">
            <LoadingButton
              onClick={handleRedirect}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold flex items-center justify-center gap-2"
            >
              Aller au menu
              <ArrowRight className="w-5 h-5" />
            </LoadingButton>

            {!config.isMandatory && onSkip && (
              <button
                onClick={handleSkip}
                className="w-full px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Passer cette étape
              </button>
            )}
          </div>
        )}

        {/* Progress indicator when complete */}
        {isComplete && (
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="bg-green-600 h-full animate-pulse" style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
};
```

**Caractéristiques:**
- **Générique:** Configurable via props, réutilisable pour toutes les tâches
- **Auto-détection:** Polling intelligent avec délai anti-race
- **UX optimisée:** Feedback visuel clair (complet/incomplet)
- **Délégation:** Support optionnel des hints de délégation
- **Accessibilité:** Icônes + texte descriptif

---

#### 1.3 OnboardingBreadcrumb Component

**Fichier:** `src/components/onboarding/ui/OnboardingBreadcrumb.tsx`

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Home } from 'lucide-react';

interface OnboardingBreadcrumbProps {
  currentStep: string;
  onBackToOnboarding?: () => void;
}

/**
 * Breadcrumb affiché en haut des pages métier quand mode=onboarding
 * Permet à l'utilisateur de retourner à l'onboarding
 */
export const OnboardingBreadcrumb: React.FC<OnboardingBreadcrumbProps> = ({
  currentStep,
  onBackToOnboarding,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBackToOnboarding) {
      onBackToOnboarding();
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3 mb-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Home className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Configuration initiale</p>
            <p className="text-sm font-semibold text-blue-900">{currentStep}</p>
          </div>
        </div>

        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition text-sm font-medium text-blue-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour à l'onboarding
        </button>
      </div>
    </div>
  );
};
```

**Justification:**
- **Contexte visuel:** L'utilisateur sait qu'il est en mode configuration
- **Navigation facile:** Retour à l'onboarding en 1 clic
- **Non-intrusif:** Petit bandeau en haut, ne gêne pas l'interface
- **Cohérence:** Design aligné avec le reste de l'app

---

### Phase 2️⃣ : Modification des Pages Existantes

#### 2.1 InventoryPage.tsx

```typescript
// Ajout en haut du composant
const searchParams = new URLSearchParams(location.search);
const isOnboardingMode = searchParams.get('mode') === 'onboarding';
const onboardingTask = searchParams.get('task'); // 'add-products' ou 'init-stock'

return (
  <>
    {/* Breadcrumb si mode onboarding */}
    {isOnboardingMode && (
      <OnboardingBreadcrumb
        currentStep={
          onboardingTask === 'add-products'
            ? 'Ajouter des Produits'
            : 'Initialiser le Stock'
        }
        onBackToOnboarding={() => navigate('/onboarding')}
      />
    )}

    {/* Interface normale - AUCUN changement */}
    <div className="p-6">
      {/* ... code existant inchangé ... */}
    </div>
  </>
);
```

**Changements minimaux:**
- Ajout du breadcrumb conditionnel
- Zéro modification de la logique métier
- Interface reste identique

---

#### 2.2 TeamManagementPage.tsx

```typescript
const searchParams = new URLSearchParams(location.search);
const isOnboardingMode = searchParams.get('mode') === 'onboarding';
const onboardingTask = searchParams.get('task'); // 'add-managers' ou 'add-servers'

return (
  <>
    {isOnboardingMode && (
      <OnboardingBreadcrumb
        currentStep={
          onboardingTask === 'add-managers'
            ? 'Ajouter des Gérants'
            : 'Créer Comptes Serveurs'
        }
        onBackToOnboarding={() => navigate('/onboarding')}
      />
    )}

    {/* Interface normale inchangée */}
    <div className="p-6">
      {/* ... code existant ... */}
    </div>
  </>
);
```

---

### Phase 3️⃣ : Refonte OnboardingFlow.tsx

#### 3.1 Configuration-Driven Architecture

**Avant (Switch Statement - 191 lignes):**
```typescript
const renderStep = () => {
  switch (currentStep) {
    case OnboardingStep.OWNER_ADD_PRODUCTS:
      return <AddProductsStep />; // 200 lignes dupliquées
    case OnboardingStep.OWNER_SETUP_STAFF:
      return <SetupStaffStep />; // 180 lignes dupliquées
    // ... 15+ cases
  }
};
```

**Après (Config-Driven - ~100 lignes):**
```typescript
import { OnboardingCompletionService } from '@/services/onboarding/completionTracking.service';
import { RedirectStep } from './steps/RedirectStep';

// Configuration des étapes propriétaire
const OWNER_REDIRECT_STEPS = {
  [OnboardingStep.OWNER_ADD_PRODUCTS]: {
    id: 'add-products',
    title: 'Ajouter des Produits',
    description: 'Créez votre catalogue de produits avec les prix locaux',
    icon: '🍻',
    targetRoute: '/inventory?mode=onboarding&task=add-products&tab=operations',
    completionCheck: OnboardingCompletionService.checkProductsAdded,
    isMandatory: true,
    delegationHint: 'Vous pouvez aussi demander à votre gérant de faire cette tâche',
  },
  [OnboardingStep.OWNER_STOCK_INIT]: {
    id: 'init-stock',
    title: 'Initialiser le Stock',
    description: 'Définissez les quantités initiales pour chaque produit',
    icon: '📦',
    targetRoute: '/inventory?mode=onboarding&task=init-stock&tab=operations',
    completionCheck: OnboardingCompletionService.checkStockInitialized,
    isMandatory: false,
    delegationHint: 'Votre gérant peut aussi initialiser le stock',
  },
  [OnboardingStep.OWNER_SETUP_STAFF]: {
    id: 'add-servers',
    title: 'Créer Comptes Serveurs',
    description: 'Ajoutez vos baristas et serveurs',
    icon: '👥',
    targetRoute: '/team?mode=onboarding&task=add-servers',
    completionCheck: OnboardingCompletionService.checkServersAdded,
    isMandatory: false,
    delegationHint: 'Votre gérant peut créer les comptes serveurs',
  },
  [OnboardingStep.OWNER_ADD_MANAGERS]: {
    id: 'add-managers',
    title: 'Ajouter des Gérants',
    description: 'Invitez des gérants pour superviser le bar',
    icon: '👔',
    targetRoute: '/team?mode=onboarding&task=add-managers',
    completionCheck: OnboardingCompletionService.checkManagersAdded,
    isMandatory: false,
    delegationHint: undefined, // Pas de délégation (owner-only)
  },
};

const renderStep = () => {
  // Étapes avec RedirectStep
  if (OWNER_REDIRECT_STEPS[currentStep]) {
    return (
      <RedirectStep
        config={OWNER_REDIRECT_STEPS[currentStep]}
        onComplete={nextStep}
        onSkip={!OWNER_REDIRECT_STEPS[currentStep].isMandatory ? nextStep : undefined}
      />
    );
  }

  // Étapes spéciales (formulaires inline)
  switch (currentStep) {
    case OnboardingStep.WELCOME:
      return <WelcomeStep />;
    case OnboardingStep.ROLE_DETECTED:
      return <RoleDetectedStep />;
    case OnboardingStep.OWNER_BAR_DETAILS:
      return <BarDetailsStep />; // Formulaire inline justifié
    case OnboardingStep.OWNER_REVIEW:
      return <ReviewStep />;
    // Manager
    case OnboardingStep.MANAGER_ROLE_CONFIRM:
      return <ManagerRoleConfirmStep />;
    case OnboardingStep.MANAGER_TOUR:
      return <ManagerTourStep />;
    // Bartender
    case OnboardingStep.BARTENDER_INTRO:
      return <BartenderIntroStep />;
    case OnboardingStep.BARTENDER_DEMO:
      return <BartenderDemoStep />;
    case OnboardingStep.BARTENDER_TEST_SALE:
      return <BartenderTestSaleStep />;
    // Completion
    case OnboardingStep.COMPLETE:
      return <CompletionScreen />;
    default:
      return <LoadingScreen />;
  }
};
```

**Avantages:**
- **Maintenabilité:** Ajouter une nouvelle étape = ajouter une config
- **Lisibilité:** Configuration déclarative vs logique impérative
- **Testabilité:** Configuration facile à mocker
- **Scalabilité:** Facile d'ajouter des types d'étapes

---

### Phase 4️⃣ : Simplification OnboardingContext

#### 4.1 Réduction de StepData

**Avant (Complexe - 435 lignes):**
```typescript
export interface StepData {
  [OnboardingStep.OWNER_BAR_DETAILS]?: {
    barName: string;
    location: string;
    closingHour: number;
    operatingMode: 'full' | 'simplifié';
    contact?: string;
  };
  [OnboardingStep.OWNER_ADD_MANAGERS]?: {
    managerIds: string[];
  };
  [OnboardingStep.OWNER_SETUP_STAFF]?: {
    serverNames: string[];
  };
  [OnboardingStep.OWNER_ADD_PRODUCTS]?: {
    products: Array<{ productId: string; localPrice: number }>;
  };
  [OnboardingStep.OWNER_STOCK_INIT]?: {
    stocks: Record<string, number>;
  };
}
```

**Après (Simplifié - ~150 lignes):**
```typescript
export interface StepData {
  // Uniquement les données nécessaires pour ReviewStep
  [OnboardingStep.OWNER_BAR_DETAILS]?: {
    barName: string;
    location: string;
    closingHour: number;
    operatingMode: 'full' | 'simplifié';
    contact?: string;
  };
  // Les autres étapes n'ont plus besoin de stocker de données
  // car elles redirigent vers les menus réels
}
```

**Justification:**
- **Plus de duplication:** Les données sont dans les tables métier
- **Source unique de vérité:** Database = source of truth
- **Moins de localStorage:** Réduit la complexité de synchronisation

---

### Phase 5️⃣ : Cleanup Services

#### 5.1 OnboardingService.ts

**Méthodes à SUPPRIMER:**
```typescript
// ❌ SUPPRIMER - duplique ProductsService
static async addProductsToBar(barId, products, userId) { ... }

// ❌ SUPPRIMER - duplique TeamService
static async addServersToBar(barId, serverNames, ownerId) { ... }

// ❌ SUPPRIMER - duplique InventoryService
static async initializeStock(barId, stocks, userId) { ... }
```

**Méthodes à GARDER:**
```typescript
// ✅ GARDER - logique spécifique onboarding
static async completeBarOnboardingAtomic(barId, userId, operatingMode) { ... }
static async updateBarDetails(barId, details, userId) { ... }
```

**Résultat:** ~300 lignes supprimées

---

## 📝 Ordre d'Implémentation (Étapes Séquentielles)

### Semaine 1: Infrastructure

**Jour 1-2:**
- [ ] Créer `completionTracking.service.ts`
- [ ] Créer `RedirectStep.tsx`
- [ ] Créer `OnboardingBreadcrumb.tsx`
- [ ] Tests unitaires des 3 composants

**Jour 3:**
- [ ] Modifier `InventoryPage.tsx` (breadcrumb)
- [ ] Modifier `TeamManagementPage.tsx` (breadcrumb)
- [ ] Tester navigation avec `?mode=onboarding`

**Jour 4-5:**
- [ ] Refactoriser `OnboardingFlow.tsx` (config-driven)
- [ ] Tester flux complet propriétaire avec redirections
- [ ] Vérifier auto-détection fonctionne

### Semaine 2: Cleanup & Tests

**Jour 1-2:**
- [ ] Supprimer `AddProductsStep.tsx`
- [ ] Supprimer `SetupStaffStep.tsx`
- [ ] Supprimer `StockInitStep.tsx`
- [ ] Supprimer `AddManagersStep.tsx`
- [ ] Supprimer `ProductSelectorModal.tsx`
- [ ] Supprimer `ManagerSearchModal.tsx`

**Jour 3:**
- [ ] Simplifier `OnboardingContext.tsx` (StepData)
- [ ] Cleanup `onboarding.service.ts`
- [ ] Mettre à jour imports dans tous les fichiers

**Jour 4-5:**
- [ ] Tests end-to-end (E2E)
  - Flux propriétaire complet
  - Flux gérant avec délégation
  - Flux serveur simplifié
- [ ] Tests de régression
- [ ] Documentation mise à jour

---

## 🧪 Plan de Test

### Tests Unitaires

```typescript
// completionTracking.service.test.ts
describe('OnboardingCompletionService', () => {
  it('should detect products added', async () => {
    // Mock Supabase
    const result = await OnboardingCompletionService.checkProductsAdded('bar-id');
    expect(result).toBe(true);
  });

  it('should detect stock initialized', async () => {
    const result = await OnboardingCompletionService.checkStockInitialized('bar-id');
    expect(result).toBe(true);
  });
});

// RedirectStep.test.tsx
describe('RedirectStep', () => {
  it('should poll for completion every 5 seconds', () => {
    jest.useFakeTimers();
    render(<RedirectStep config={mockConfig} />);

    jest.advanceTimersByTime(5000);
    expect(mockCompletionCheck).toHaveBeenCalledTimes(2); // Initial + 1 poll
  });

  it('should auto-redirect when complete', async () => {
    mockCompletionCheck.mockResolvedValue(true);
    render(<RedirectStep config={mockConfig} onComplete={mockOnComplete} />);

    await waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
  });
});
```

### Tests d'Intégration

```typescript
// onboarding-flow.integration.test.ts
describe('Onboarding Flow Integration', () => {
  it('owner should complete full onboarding', async () => {
    // 1. Start onboarding
    await startOnboarding('owner');

    // 2. Fill bar details
    await fillBarDetails({ name: 'Test Bar', location: 'Dakar' });

    // 3. Redirect to inventory
    await clickRedirectButton();
    expect(window.location.pathname).toBe('/inventory');
    expect(window.location.search).toContain('mode=onboarding');

    // 4. Add products
    await addProduct({ name: 'Heineken', price: 300 });

    // 5. Auto-return to onboarding
    await waitFor(() => {
      expect(window.location.pathname).toBe('/onboarding');
    });
  });
});
```

### Tests E2E (Cypress/Playwright)

```typescript
// cypress/e2e/onboarding.cy.ts
describe('Onboarding E2E', () => {
  it('should complete owner onboarding with delegation', () => {
    cy.login('owner@test.com');
    cy.visit('/onboarding');

    // Welcome
    cy.contains('Bienvenue sur BarTender').should('be.visible');
    cy.contains('Commencer').click();

    // Bar details
    cy.get('input[name="barName"]').type('Mon Bar');
    cy.get('input[name="location"]').type('Dakar');
    cy.contains('Continuer').click();

    // Add products - delegation hint visible
    cy.contains('Délégation').should('be.visible');
    cy.contains('Vous pouvez aussi demander à votre gérant').should('be.visible');
    cy.contains('Aller au menu').click();

    // On inventory page
    cy.url().should('include', '/inventory');
    cy.contains('Configuration initiale').should('be.visible');

    // Add product
    cy.contains('Ajouter Produit').click();
    cy.get('input[name="productName"]').type('Heineken');
    cy.get('input[name="price"]').type('300');
    cy.contains('Enregistrer').click();

    // Auto-return to onboarding (wait for polling)
    cy.url({ timeout: 10000 }).should('include', '/onboarding');
    cy.contains('✓ Tâche complétée').should('be.visible');
  });
});
```

---

## 🚨 Points d'Attention & Risques

### Risque 1: Race Conditions

**Problème:** L'utilisateur complète une tâche mais le polling n'a pas encore détecté

**Mitigation:**
```typescript
// Délai artificiel de 500ms avant check
await new Promise(resolve => setTimeout(resolve, 500));
const complete = await config.completionCheck(barId);
```

**Alternative:** WebSocket pour notification temps réel (overkill pour MVP)

---

### Risque 2: Utilisateur quitte la page métier avant retour auto

**Problème:** User clique "Retour à l'onboarding" avant que la tâche soit détectée

**Mitigation:**
```typescript
// Dans RedirectStep, bouton "Retour" fait un re-check immédiat
const handleManualReturn = async () => {
  const complete = await config.completionCheck(barId);
  if (complete) {
    onComplete();
  } else {
    // Message: "Tâche non encore complétée"
    setShowIncompleteWarning(true);
  }
};
```

---

### Risque 3: Multi-bar Context Switching

**Problème:** User switch de bar pendant l'onboarding

**Solution actuelle (déjà implémentée):**
```typescript
// OnboardingContext.tsx
useEffect(() => {
  if (state.barId !== currentBar?.id) {
    // Reset onboarding pour le nouveau bar
    updateState({ barId: currentBar?.id, currentStep: OnboardingStep.WELCOME });
  }
}, [currentBar?.id]);
```

**Aucune modification nécessaire**

---

### Risque 4: Permissions Manager vs Owner

**Problème:** Manager ne peut pas ajouter de gérants (owner-only)

**Validation dans ReviewStep:**
```typescript
// ReviewStep.tsx - validation finale
const validateOwnerTasks = async () => {
  const { productsAdded } = await OnboardingCompletionService.checkOwnerMandatoryTasks(barId);

  if (!productsAdded) {
    throw new Error('Vous devez ajouter au moins 1 produit');
  }

  // Stock et serveurs = optionnels
};
```

**Manager peut compléter:**
- ✅ Ajouter produits
- ✅ Initialiser stock
- ✅ Créer serveurs

**Manager ne peut PAS:**
- ❌ Ajouter gérants (redirect step montré mais permissions refusées dans TeamPage)

---

## 📊 Métriques de Succès

### Code Metrics

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| Lignes totales onboarding | 3,678 | ~1,450 | **-61%** |
| Composants dupliqués | 6 | 0 | **-100%** |
| Fichiers onboarding | 19 | 13 | **-32%** |
| Complexité cyclomatique | 47 | 18 | **-62%** |

### Performance Metrics

| Métrique | Cible |
|----------|-------|
| Temps de chargement étape | < 300ms |
| Délai détection complétion | < 6s (1 check + 1 poll) |
| Taille bundle onboarding | < 50KB (gzip) |

### User Experience Metrics

| Métrique | Cible |
|----------|-------|
| Taux complétion onboarding propriétaire | > 80% |
| Taux complétion onboarding gérant | > 90% |
| Taux complétion onboarding serveur | > 95% |
| Temps moyen complétion propriétaire | < 5 min |
| Taux délégation (owner → manager) | Mesure qualitative |

---

## 🔄 Migration & Déploiement

### Stratégie de Déploiement

**Option 1: Big Bang (Recommandé pour refonte)**
```
1. Merge feature branch → main
2. Deploy à production
3. Monitoring intensif 48h
4. Rollback possible via git revert
```

**Option 2: Feature Flag (Overkill)**
```typescript
const USE_NEW_ONBOARDING = process.env.REACT_APP_NEW_ONBOARDING === 'true';

return USE_NEW_ONBOARDING ? <NewOnboardingFlow /> : <OldOnboardingFlow />;
```

**Recommandation:** Option 1 (Big Bang)
- Refonte complète, pas de compatibilité à maintenir
- Moins de dette technique
- Migration localStorage automatique (voir ci-dessous)

---

### Migration localStorage

**Problème:** Utilisateurs avec onboarding en cours (stepData dans localStorage)

**Solution:**
```typescript
// OnboardingContext.tsx - dans useEffect d'hydratation
useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const data = JSON.parse(stored);

    // Détecter ancien format
    if (data.stepData?.OWNER_ADD_PRODUCTS) {
      console.warn('Old onboarding format detected - migrating');

      // Reset vers étape OWNER_BAR_DETAILS (seule étape avec stepData nécessaire)
      const migratedData = {
        ...data,
        currentStep: OnboardingStep.OWNER_BAR_DETAILS,
        stepData: {
          [OnboardingStep.OWNER_BAR_DETAILS]: data.stepData[OnboardingStep.OWNER_BAR_DETAILS],
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedData));
      setState(migratedData);
      return;
    }

    setState(data);
  }
}, []);
```

**Impact:** Users en cours perdent progrès des étapes obsolètes (acceptable car étapes refaites via redirections)

---

### Monitoring Post-Déploiement

**Métriques à surveiller:**

```typescript
// analytics.ts
export const trackOnboardingEvent = (event: string, data: any) => {
  // Sentry, Mixpanel, ou custom analytics
  console.log('[Onboarding]', event, data);

  // Exemples d'events
  // onboarding_started
  // onboarding_step_completed: { step, duration }
  // onboarding_redirect_clicked: { target, step }
  // onboarding_task_detected: { task, detectionTime }
  // onboarding_completed: { totalDuration, role }
  // onboarding_abandoned: { lastStep, duration }
};
```

**Alertes critiques:**
- Taux d'erreur > 5% sur `completionCheck`
- Temps détection > 10s (polling rate trop lent)
- Taux abandon > 30% sur étape spécifique

---

## 📚 Documentation

### README.md à créer

**Fichier:** `src/components/onboarding/README.md`

```markdown
# Onboarding System Architecture

## Overview
Système de guidage pour configuration initiale du bar. Redirige vers les menus réels (pas de duplication).

## Key Components

### RedirectStep
Composant générique pour étapes de redirection.
- Auto-détection complétion (polling 5s)
- Support délégation hints (owner → manager)
- Skip optionnel pour tâches non-obligatoires

### OnboardingCompletionService
Service de vérification des tâches complétées.
- `checkProductsAdded(barId)`
- `checkStockInitialized(barId)`
- `checkServersAdded(barId)`
- `checkManagersAdded(barId)`

### OnboardingBreadcrumb
Fil d'Ariane affiché dans pages métier en mode onboarding.

## Flows

### Owner Flow
1. Welcome → Role Detected
2. Bar Details (inline form)
3. Add Managers (redirect /team) - optional
4. Add Products (redirect /inventory) - **mandatory**
5. Init Stock (redirect /inventory) - optional
6. Add Servers (redirect /team) - optional
7. Review → Complete

### Manager Flow
1. Welcome → Role Detected
2. Role Confirm (with delegation hints)
3. Tour
4. Complete

### Bartender Flow
1. Welcome → Role Detected
2. Intro
3. Demo (simplified, no video)
4. Ready (simplified, no test sale)
5. Complete

## Configuration

Étapes configurées dans `OnboardingFlow.tsx`:

```typescript
const OWNER_REDIRECT_STEPS = {
  [OnboardingStep.OWNER_ADD_PRODUCTS]: {
    id: 'add-products',
    title: 'Ajouter des Produits',
    targetRoute: '/inventory?mode=onboarding&task=add-products',
    completionCheck: OnboardingCompletionService.checkProductsAdded,
    isMandatory: true,
    delegationHint: 'Vous pouvez aussi demander à votre gérant...',
  },
  // ...
};
```

## Testing

```bash
# Unit tests
npm run test -- onboarding

# E2E tests
npm run e2e -- onboarding.cy.ts
```

## Troubleshooting

**Q: Auto-détection ne fonctionne pas**
A: Vérifier permissions Supabase RLS sur bar_products/bar_members

**Q: Polling trop lent**
A: Ajuster interval dans RedirectStep (actuellement 5s)

**Q: User coincé sur étape**
A: Check console errors, probablement `completionCheck` rejette
```

---

## ✅ Checklist Finale Avant Merge

### Code Quality
- [ ] Tous les tests unitaires passent
- [ ] Tous les tests E2E passent
- [ ] Aucune erreur TypeScript
- [ ] Aucun warning ESLint
- [ ] Code coverage > 80% (nouveaux fichiers)

### Fonctionnel
- [ ] Flux owner complet testé manuellement
- [ ] Flux manager complet testé manuellement
- [ ] Flux bartender complet testé manuellement
- [ ] Délégation owner → manager testée
- [ ] Multi-bar switching testé
- [ ] Migration localStorage testée

### Performance
- [ ] Lighthouse score > 90 (onboarding pages)
- [ ] Bundle size onboarding < 50KB gzip
- [ ] Pas de memory leaks (polling cleanup vérifié)

### Documentation
- [ ] README.md créé
- [ ] Commentaires JSDoc ajoutés
- [ ] CHANGELOG.md mis à jour
- [ ] Migration guide écrit

### Déploiement
- [ ] Branch rebasée sur main
- [ ] Pas de conflits
- [ ] PR créée avec description détaillée
- [ ] Review par au moins 1 développeur senior
- [ ] Monitoring dashboard configuré

---

## 🎉 Résultat Final Attendu

### Avant Refonte
```
Onboarding: 3,678 lignes
- 19 composants
- 6 composants dupliqués (1,205 lignes)
- Complexité élevée (stepData pour chaque étape)
- Maintenance difficile
```

### Après Refonte
```
Onboarding: ~1,450 lignes (-61%)
- 13 composants (-32%)
- 0 duplication (-100%)
- Architecture config-driven
- Maintenance facile (ajouter étape = ajouter config)
- Délégation implicite (hints uniquement)
- UX améliorée (menus réels)
```

### Impact Business
- ✅ **Réduction dette technique:** -61% code
- ✅ **Amélioration maintenabilité:** Config-driven
- ✅ **Meilleure UX:** Menus réels (pas de confusion)
- ✅ **Délégation facilitée:** Hints clairs owner/manager
- ✅ **Onboarding plus rapide:** Serveur simplifié
- ✅ **Source de vérité unique:** Database (pas localStorage)

---

**Prochaine étape:** Commencer Phase 1️⃣ (Création infrastructure)

**Branche:** `refactor/onboarding-redirect-architecture`

**Estimation:** 2 semaines (10 jours ouvrables)
