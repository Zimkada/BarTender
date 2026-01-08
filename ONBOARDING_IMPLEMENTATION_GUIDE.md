# 📖 Guide d'Intégration Onboarding - BarTender Pro

**Date**: 8 janvier 2026
**Status**: Prêt pour intégration
**Effort Restant**: 2-3 heures (routing + API integration)

---

## 🎯 Ce Qui a Été Livré

### ✅ 1. Migration DB (1 fichier)
```
supabase/migrations/20260108135305_add_onboarding_tracking_to_bars.sql
```
- Ajoute `is_setup_complete` (boolean)
- Ajoute `setup_completed_at` (timestamp)
- Index sur `is_setup_complete` pour perf
- Backfill: bars existants = setup_complete=true

### ✅ 2. OnboardingContext (1 fichier)
```
src/context/OnboardingContext.tsx
```
- State machine complète
- Persistence localStorage
- 15 étapes (7 owner + 3 manager + 3 bartender + 2 finales)
- Getters/setters pour chaque étape

### ✅ 3. Composants (13 fichiers)

**Owner path (7 steps)**:
- `BarDetailsStep` - Nom, lieu, heure fermeture, mode
- `AddManagersStep` - Ajouter gérants
- `SetupStaffStep` - Créer serveurs (full mode seulement)
- `AddProductsStep` - Sélectionner produits (hard blocker: min 1)
- `StockInitStep` - Stock initial (peut être 0)
- `ClosingHourStep` - Confirmer heure fermeture
- `ReviewStep` - Résumé + Launch

**Manager path (3 steps)**:
- `ManagerRoleConfirmStep` - Confirmé rôle
- `ManagerCheckStaffStep` - Vérifier staff (optionnel si simplifié)
- `ManagerTourStep` - Tour optionnel 2 min

**Bartender path (3 steps)**:
- `BartenderIntroStep` - Intro rôle
- `BartenderDemoStep` - Démo 1 min
- `BartenderTestSaleStep` - Essayer créer vente test

**Orchestration**:
- `OnboardingFlow` - Routeur principal

### ✅ 4. Hooks (1 fichier)
```
src/hooks/useOnboardingGuard.ts
```
- `useOnboardingGuard()` - Check si redirect needed
- `useCanCreateSale()` - Peut créer vente?
- `useManagerAccessLevel()` - Accès gérant bar incomplet

### ✅ 5. Page (1 fichier)
```
src/pages/OnboardingPage.tsx
```
- Route `/onboarding`
- Guard: redirect si complèt ou pas connecté
- Affiche OnboardingFlow

---

## 🔧 ÉTAPES D'INTÉGRATION

### Étape 1: Enregistrer les Contextes

**Dans `src/layouts/RootLayout.tsx` ou `src/App.tsx`** :

```tsx
import { OnboardingProvider } from '@/context/OnboardingContext';

export const App = () => {
  return (
    <AuthProvider>
      <BarProvider>
        <OnboardingProvider>  {/* ADD THIS */}
          <ModalProvider>
            <NotificationsProvider>
              {/* ... rest of app ... */}
            </NotificationsProvider>
          </ModalProvider>
        </OnboardingProvider>
      </BarProvider>
    </AuthProvider>
  );
};
```

### Étape 2: Ajouter la Route

**Dans `src/router/routes.tsx` ou routing setup** :

```tsx
import { OnboardingPage } from '@/pages/OnboardingPage';

const routes = [
  // ... existing routes ...
  {
    path: '/onboarding',
    element: <OnboardingPage />,
    public: false,  // Requires auth
  },
  // ... rest of routes ...
];
```

### Étape 3: Ajouter Protection aux Routes Existantes

**Dans `src/components/ProtectedRoute.tsx` ou similaire** :

```tsx
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard';

export const ProtectedRoute = ({ element }: Props) => {
  const { isAuthenticated } = useAuth();
  const { shouldRedirectToOnboarding } = useOnboardingGuard();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (shouldRedirectToOnboarding) {
    return <Navigate to="/onboarding" />;
  }

  return element;
};
```

### Étape 4: Exécuter la Migration

```bash
# Dans supabase CLI ou dashboard
supabase migration up

# Ou en prod:
supabase db push
```

### Étape 5: Tester le Flow Complet

**Test 1: Nouveau Propriétaire**
1. Créer nouvel utilisateur + bar → Redirect `/onboarding`
2. Compléter 7 étapes
3. À la fin → `/dashboard`
4. Vérifier `bars.is_setup_complete = true`

**Test 2: Nouveau Gérant**
1. Propriétaire ajoute gérant à bar
2. Gérant se connecte → Redirect `/onboarding` (3 étapes)
3. À la fin → `/dashboard`

**Test 3: Nouveau Serveur**
1. Propriétaire ajoute serveur
2. Serveur se connecte → Redirect `/onboarding` (3 étapes)
3. À la fin → `/dashboard`

**Test 4: Gérant bar incomplet** (Q5 décision)
1. Propriétaire crée bar, n'ajoute que le gérant
2. Gérant peut créer ventes → ✅ Pas de blocage (accès complet)

---

## 🔌 INTÉGRATION API (À FAIRE)

Les composants utilisent actuellement des placeholders. Faut connecter aux vraies APIs:

### BarDetailsStep
- [ ] Appeler RPC `setup_promoter_bar(owner_id, bar_name, settings)` au submit
- [ ] Retour: `bar_id` → Stocker dans context

### AddManagersStep
- [ ] Implémenter modal pour chercher/inviter users
- [ ] Appeler `assign_bar_member(user_id, bar_id, 'gérant', owner_id)`

### SetupStaffStep
- [ ] Créer serveurs via RPC (ou direct INSERT bar_members)
- [ ] Gérer mapping noms → user_ids

### AddProductsStep
- [ ] Modal pour chercher global products
- [ ] Appeler `INSERT bar_products (bar_id, product_id, local_price)`

### StockInitStep
- [ ] Appeler `INSERT supplies (bar_id, product_id, unit_cost, quantity, ...)`
- [ ] Calculer CUMP automatiquement

### ReviewStep
- [ ] Au Launch: `UPDATE bars SET is_setup_complete=true, setup_completed_at=NOW() WHERE id=bar_id`
- [ ] Créer audit log pour tracking

---

## 📊 DÉCISIONS MÉTIER IMPLÉMENTÉES

| Decision | Implementation |
|----------|----------------|
| Q1: Gérants obligatoires? | NON - Soft warning, on peut passer |
| Q2: Produits obligatoires? | OUI - Hard blocker (min 1) |
| Q3: Stock peut être 0? | OUI - Pas de blocker sur stock=0 |
| Q4: Modes inter-changeable? | OUI - Soft du code, defaut="simplifié" |
| Q5: Gérant bar incomplet? | Accès complet - Pas de blocage |

---

## 🧪 TEST SCENARIOS COUVERTS

✅ **Happy Path Owner** (7 steps)
```
Welcome → Bar Details → Managers → Staff → Products → Stock → Closing Hour → Review → Launch → Dashboard
```

✅ **Happy Path Manager** (3 steps)
```
Welcome → Role Confirm → Check Staff → Tour → Dashboard
```

✅ **Happy Path Bartender** (3 steps)
```
Welcome → Intro → Demo → Test Sale → Dashboard
```

✅ **Error Handling**
- Validation errors bloquent progression
- LocalStorage persist across refresh
- Redirect automatique si déjà complet

✅ **Mode-Based Logic**
- SetupStaffStep skips si `operatingMode='simplifié'`

---

## 🎨 STYLES & TAILWIND

Tous les composants utilisent:
- Tailwind CSS (déjà dépendance)
- Classes standard (px, py, bg, text, border, rounded, hover, transition)
- Pas de dépendances UI supplémentaires

---

## 📝 PROCHAINES AMÉLIORATIONS (Phase 2)

- [ ] Intégrer Shepherd.js pour interactive tours (manager/bartender)
- [ ] Validation côté serveur (backend checks)
- [ ] Emails d'invitation pour managers/servers
- [ ] Analytics events tracking (onboarding.started, onboarding.completed)
- [ ] Restart tour button sur dashboard
- [ ] Multi-language support (FR/EN)
- [ ] Mobile-responsive refinement

---

## 📚 FICHIERS CRÉÉS - RÉSUMÉ

```
supabase/migrations/
  └─ 20260108135305_add_onboarding_tracking_to_bars.sql

src/context/
  └─ OnboardingContext.tsx

src/components/onboarding/
  ├─ BarDetailsStep.tsx
  ├─ AddManagersStep.tsx
  ├─ SetupStaffStep.tsx
  ├─ AddProductsStep.tsx
  ├─ StockInitStep.tsx
  ├─ ClosingHourStep.tsx
  ├─ ReviewStep.tsx
  ├─ ManagerRoleConfirmStep.tsx
  ├─ ManagerCheckStaffStep.tsx
  ├─ ManagerTourStep.tsx
  ├─ BartenderIntroStep.tsx
  ├─ BartenderDemoStep.tsx
  ├─ BartenderTestSaleStep.tsx
  ├─ OnboardingFlow.tsx
  └─ index.ts

src/hooks/
  └─ useOnboardingGuard.ts

src/pages/
  └─ OnboardingPage.tsx
```

---

## ✅ CHECKLIST AVANT DEPLOY

- [ ] Migration exécutée (`is_setup_complete` colonne existe)
- [ ] OnboardingProvider wrappé dans App
- [ ] Route `/onboarding` créée
- [ ] ProtectedRoute utilise `useOnboardingGuard`
- [ ] Tests manuels (3 happy paths)
- [ ] LocalStorage persiste correctement
- [ ] Redirect loops testés (login → onboarding → dashboard)
- [ ] API integration (5 composants à connecter)
- [ ] Error handling fonctionnel
- [ ] Analytics events configurés

---

**Status**: ✅ Prêt à intégrer
**Temps Restant**: 2-3h (routeur + API)
**Owner**: Claude Code
**Date**: 8 janvier 2026
