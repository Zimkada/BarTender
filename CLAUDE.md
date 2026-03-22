# BarTender — Instructions pour Claude

## Présentation du projet

Application POS (Point of Sale) multi-tenant SaaS pour la gestion de bars en Afrique de l'Ouest (Bénin). Inclut la gestion des ventes, stocks, comptabilité SYSCOHADA, et une architecture offline-first avec synchronisation Supabase.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18.3, TypeScript 5.5, Vite 5.4 |
| State serveur | TanStack React Query 5.90 |
| State client | React Context API |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| UI | Tailwind CSS 3.4 + Radix UI + Framer Motion |
| Tests | Vitest 4 + Playwright + Storybook |
| Monitoring | Sentry |
| Déploiement | Vercel (PWA) |

---

## Commandes fréquentes

```bash
npm run dev           # Serveur de développement
npm run build         # Build production (génère version + inline CSS critique)
npm test              # Tests en watch mode
npm run test:ui       # Tests avec interface visuelle
npm run test:coverage # Couverture de code
npm run lint          # ESLint (exclut dist, dev-dist, .history)
npm run storybook     # Storybook sur port 6006
npx supabase db push  # Push schema DB
```

---

## Architecture

### App.tsx — Shell minimal

`App.tsx` ne rend **aucune UI** (`return null`). Il initialise uniquement les services de fond :

```typescript
function App() {
  useEffect(() => {
    networkManager.init();   // Détection réseau avec grace period
    syncManager.init();      // Auto-sync offline → online
    return () => {
      networkManager.cleanup();
      syncManager.cleanup();
    };
  }, []);
  return null; // Toute l'UI est dans les layouts
}
```

### Providers (main.tsx)

```
QueryClientProvider
  └─ Toaster (react-hot-toast)
      └─ NotificationsProvider
          └─ AuthProvider          ← auth + permissions
              └─ BarProvider       ← multi-bar + opérations
                  └─ ThemeProvider
                      └─ OnboardingProvider
                          └─ GuideProvider
                              └─ StockProvider
                                  └─ StockBridgeProvider
                                      └─ AppProvider
                                          └─ ErrorBoundary
                                              ├─ App (shell - services de fond)
                                              └─ RouterProvider ← toute l'UI
```

> **Note** : `ModalProvider` est à l'intérieur de `RootLayout`, pas dans `main.tsx`.

### Routing (src/routes/index.tsx)

3 groupes de routes via `createBrowserRouter` :

```
/auth/*       → AuthLayout    (public, Login/ForgotPassword/ResetPassword)
/admin/*      → AdminLayout   (super_admin uniquement, sidebar fixe)
/*            → RootLayout    (bar users, Header + MobileNavigation)
```

**Structure des routes :**

```typescript
// Routes admin (super_admin only)
{ path: '/admin',        element: <AdminLayout /> }
  ├─ /admin             → SuperAdminPage (dashboard)
  ├─ /admin/bars        → BarsManagementPage
  ├─ /admin/users       → UsersManagementPage
  ├─ /admin/catalog     → GlobalCatalogPage
  ├─ /admin/audit-logs  → AuditLogsPage
  └─ /admin/security    → SecurityDashboardPage

// Routes bar users
{ path: '/',             element: <RootLayout /> }
  ├─ /                  → HomePage
  ├─ /dashboard         → DashboardPage
  ├─ /sales             → SalesHistoryPage
  ├─ /sales/:saleId     → SaleDetailsPage
  ├─ /inventory         → ProtectedRoute (canViewInventory) → InventoryPage
  ├─ /accounting        → ProtectedRoute (canViewAccounting) → AccountingPage
  ├─ /settings          → ProtectedRoute (canManageSettings) → SettingsPage
  ├─ /team              → ProtectedRoute (canCreateServers) → TeamPage
  ├─ /promotions        → ProtectedRoute (canManagePromotions) → PromotionsPage
  ├─ /forecasting       → ProtectedRoute (canViewForecasting) → ForecastingAIPage
  ├─ /returns           → ReturnsPage
  ├─ /consignments      → ConsignmentPage
  ├─ /profil            → ProfilePage
  └─ /onboarding        → OnboardingPage

// Routes auth (public)
{ path: '/auth',         element: <AuthLayout /> }
  ├─ /auth/login        → LoginScreen
  ├─ /auth/forgot-password → ForgotPasswordScreen
  └─ /auth/reset-password  → ResetPasswordScreen
```

### Layouts (src/layouts/)

**`RootLayout`** — Bar users :
- Guard : redirige vers `/auth/login` si non authentifié
- Guard : redirige vers `/admin` si `super_admin`
- Heartbeat toutes les 30s (vérification token Supabase)
- Invalidation React Query au retour réseau / fin de sync
- Contient : `ModalProvider`, `Header`, `MobileNavigation`, `MobileSidebar`, `Cart`
- Modales lazy-loadées : `ProductModal`, `CategoryModal`, `QuickSaleFlow`, `SupplyModal`
- Précharge les pages critiques en arrière-plan

**`AdminLayout`** — SuperAdmin uniquement :
- Guard : redirige vers `/auth/login` si non authentifié
- Guard : redirige vers `/` si pas `super_admin`
- Sidebar fixe (desktop) / hamburger (mobile)
- Précharge toutes les pages admin en arrière-plan

**`AuthLayout`** — Public :
- Redirige vers `/` si déjà authentifié
- Détecte le flux `PASSWORD_RECOVERY` (ne redirige pas dans ce cas)
- Expose `useAuthNav()` pour naviguer entre les écrans auth

### Lazy Loading — `lazyWithRetry`

Toujours utiliser `lazyWithRetry` au lieu de `lazy` pour les pages :

```typescript
// ✅ Correct : retry automatique sur connexion instable
const DashboardPage = lazyWithRetry(() => import('../pages/DashboardPage'));

// ❌ À éviter : pas de retry
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
```

**Backoff exponentiel** : 1s → 3s → 10s (3 tentatives max).

### RBAC au niveau des routes

```typescript
// Protection par permission via ProtectedRoute
{
  path: 'inventory',
  element: <ProtectedRoute permission="canViewInventory" />,
  children: [{ index: true, element: <InventoryPage /> }],
}
```

### Flux de données

1. **Optimistic UI** → state local mis à jour immédiatement
2. **Offline Queue** → opérations en file si hors-ligne (IndexedDB)
3. **SyncManager** → synchronisation auto au retour en ligne
4. **Realtime** → listeners Supabase mettent à jour le cache React Query

### Structure des dossiers

```
src/
├── components/
│   ├── ui/          # Design system (Button, Card, Input, etc.)
│   ├── common/      # ErrorFallback, ConfirmationModal, EmptyState
│   ├── admin/       # Panneaux admin (SuperAdmin)
│   └── [feature]/   # Composants métier
├── context/         # Providers React Context
├── hooks/           # ~50+ hooks custom
├── layouts/         # RootLayout, AdminLayout, AuthLayout
├── pages/           # 22+ pages
├── routes/          # index.tsx (createBrowserRouter)
├── services/
│   ├── supabase/    # Appels DB (auth, bars, products, sales...)
│   ├── broadcast/   # Sync cross-tab
│   ├── realtime/    # Subscriptions Supabase
│   ├── offlineQueue.ts
│   ├── SyncManager.ts
│   └── NetworkManager.ts
├── lib/             # supabase.ts, react-query.ts, monitoring.ts
├── types/           # Types TypeScript globaux
└── utils/           # lazyWithRetry.ts, devHelpers.ts, ...
```

---

## Système RBAC (Rôles & Permissions)

### Rôles (ordre hiérarchique)

| Rôle | Niveau | Résumé |
|------|--------|--------|
| `super_admin` | 1 | Tout + dashboard admin, gestion promoteurs, stats globales |
| `promoteur` | 2 | Gère ses bars, crée bars, configure tout |
| `gerant` | 3 | Stocks, analytiques, dépenses (limité) |
| `serveur` | 4 | Ventes et retours uniquement |

### Utilisation des permissions

```typescript
// Dans un composant
const { hasPermission } = useAuth();
if (hasPermission('canCreateBars')) { /* afficher bouton */ }

// Avec le hook dédié
const { canAccess, isRole } = usePermissions();
if (canAccess('canEditProducts')) { /* autoriser édition */ }
if (isRole('super_admin')) { /* afficher menu admin */ }
```

### Permissions disponibles (RolePermissions)

- Users: `canManageUsers`, `canCreateManagers`, `canCreateServers`
- Produits: `canAddProducts`, `canEditProducts`, `canDeleteProducts`
- Stock: `canManageInventory`, `canViewInventory`
- Ventes: `canSell`, `canCancelSales`, `canViewAllSales`, `canViewOwnSales`
- Analytiques: `canViewAnalytics`, `canExportData`, `canViewForecasting`
- Comptabilité: `canViewAccounting`, `canManageExpenses`, `canManageSalaries`
- Multi-bar: `canCreateBars`, `canSwitchBars`
- Admin: `canAccessAdminDashboard`, `canManagePromoteurs`, `canViewGlobalStats`

---

## Intégration Supabase

### Pattern d'appel DB

```typescript
// Dans un service (src/services/supabase/)
export async function getProducts(barId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('bar_id', barId)
    .order('name');

  if (error) throw error;
  return data;
}
```

### Pattern Realtime

```typescript
// Subscription à des changements
supabase
  .channel(`bar_members:${barId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'bar_members',
    filter: `bar_id=eq.${barId}`
  }, (payload) => {
    // Mettre à jour le cache React Query
    queryClient.invalidateQueries(['bar-members', barId]);
  })
  .subscribe();
```

### RLS (Row-Level Security)

Chaque table a RLS activé. Toujours filtrer par `bar_id` dans les queries pour respecter l'isolation multi-tenant.

---

## Architecture des hooks — Refactorisation "Pillar 3"

### Le problème résolu

Avant la refactorisation, `AppProvider` stockait **toutes les données** en state local (produits, ventes, retours, dépenses) et les passait via contexte. Cela causait :
- Re-renders globaux à chaque modification
- Données dupliquées entre AppProvider et React Query
- AppProvider devenu un "God Object" ingérable

### Solution : 3 couches de hooks

```
hooks/
├── queries/      # Fetching pur (React Query)
├── mutations/    # Écriture (React Query mutations)
└── pivots/       # Smart Hooks = orchestrateurs (lecture + offline + optimistic)
```

### Pivot Hooks (Smart Hooks) — La couche clé

Les Pivot Hooks (`hooks/pivots/`) sont les orchestrateurs principaux. Ils combinent :
- React Query (server state)
- Données optimistes (offline queue)
- Filtrage/tri local

| Pivot Hook | Données gérées |
|---|---|
| `useUnifiedStock` | Produits + stocks |
| `useUnifiedSales` | Ventes |
| `useUnifiedReturns` | Retours |
| `useUnifiedExpenses` | Dépenses |

```typescript
// ✅ Correct — utiliser le Pivot Hook dans le composant
const { products, categories, getProductStockInfo } = useUnifiedStock(barId);
const { sales, todayTotal } = useUnifiedSales(barId);

// ❌ À éviter — ne plus passer par AppContext pour les données
const { products } = useAppContext(); // products n'existe plus dans le contexte
```

### Ce que AppProvider/AppContext fournit encore

Après refactorisation, `AppContext` ne fournit **que** :

| Catégorie | Éléments |
|---|---|
| **Settings** | `settings` |
| **Membres** | `users` (membres du bar) |
| **Panier** | `cart`, `addToCart`, `updateCartQuantity`, `removeFromCart`, `clearCart` |
| **Mutations catégories** | `addCategory`, `updateCategory`, `deleteCategory`, `linkCategory`, `addCategories` |
| **Mutations ventes** | `addSale`, `validateSale`, `rejectSale` |
| **Mutations retours** | `addReturn`, `updateReturn`, `deleteReturn`, `provideExchange` |
| **Mutations dépenses** | `addExpense`, `deleteExpense`, `addCustomExpenseCategory` |

> **Règle** : AppContext = actions (mutations). Les données = Pivot Hooks.

### AppContext est séparé de AppProvider

```
src/context/
├── AppContext.tsx     # Définition du contexte + useAppContext()
└── AppProvider.tsx    # Implémentation + logique métier
```

Cette séparation évite les imports circulaires et rend le contexte testable indépendamment.

### Séparation context / données dans les composants

```typescript
// Dans un composant
const { addSale, cart, clearCart } = useAppContext();       // actions + panier
const { products } = useUnifiedStock(currentBar?.id);       // données produits
const { sales, todayTotal } = useUnifiedSales(currentBar?.id); // données ventes

// NE PAS faire :
const { products, sales } = useAppContext(); // ces champs n'existent plus
```

### Flux provideExchange (Magic Swap)

Cas particulier documenté : échange de produit lors d'un retour.

```
1. Créer le retour (returnsMutations) → returnId stable (UUID généré avant)
2. Créer la vente liée (salesMutations) → sourceReturnId = returnId
3. Si erreur → rollback best-effort (supprimer le retour orphelin)
4. Les IDs stables garantissent la traçabilité même en mode offline
```

---

## Hooks importants

### `useRobustOperation` — Opérations résilientes

```typescript
const { executeAsync, retryAsync, error, timeoutWarning, isLoading } = useRobustOperation({
  timeoutMs: 10000,       // 15000 sur mobile
  maxRetries: 3,
  onTimeout: () => {},
  onOffline: () => {},
  onLateSuccess: () => {} // Appelé si backend réussit après timeout UI
});

await executeAsync(async () => {
  return await salesService.createSale(saleData);
});
```

**Utiliser ce hook pour toute opération critique (création vente, stock, etc.)**

### `useAuth` — Authentification

```typescript
const { currentSession, login, logout, hasPermission } = useAuth();
```

### `useBarContext` / `useBar` — Contexte bar

```typescript
const { currentBar, currentBarId, userBars, switchBar } = useBarContext();
```

### `usePermissions` — Permissions

```typescript
const { canAccess, isRole, canManage } = usePermissions();
```

---

## Patterns de gestion d'erreurs

### Structure multi-couches

1. **Global** (`main.tsx`): window.onerror → Sentry
2. **Error Boundaries**: Root + LazyLoad + AdminPanel
3. **Services**: try/catch, jamais de throw non géré
4. **useRobustOperation**: timeout + retry automatique

### Audit Logging

```typescript
import { auditLogger } from '@/services/AuditLogger';

auditLogger.log({
  event: 'SALE_CREATED',
  severity: 'info',
  userId: session.userId,
  barId: session.barId,
  description: 'Vente créée',
  metadata: { total: 50000 },
  relatedEntityId: saleId,
  relatedEntityType: 'sale'
});
```

---

## Conventions de code

### Nommage

```typescript
// Composants: PascalCase
MyComponent.tsx

// Hooks: camelCase + préfixe 'use'
useMyHook.ts

// Services: PascalCase + suffix 'Service'
class AuthService {}

// Constantes: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Types: PascalCase
type UserRole = 'super_admin' | 'promoteur' | 'gerant' | 'serveur';
```

### Structure d'un composant

```typescript
export const MyComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  // 1. Hooks
  // 2. useEffect
  // 3. Handlers
  // 4. JSX
};

MyComponent.displayName = 'MyComponent';
export default MyComponent;
```

### Ordre des imports

```typescript
// 1. React
import React, { useState } from 'react';
// 2. Librairies tierces
import { motion } from 'framer-motion';
// 3. Imports projet (absolu)
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
// 4. Imports relatifs
import { helper } from '../utils/helper';
```

### Annotations dans les commentaires

```
// ✨ Nouvelle fonctionnalité importante
// 🛡️ Section critique pour la sécurité
// ⭐ Logique critique / workaround
// ❌ Pattern à éviter / code déprécié
// 🧹 Code temporaire à nettoyer
// 📋 TODO (préférer créer une issue)
```

---

## Décisions stratégiques

### Création de bars

- **Règle**: Uniquement par le SuperAdmin (pas en self-service)
- **Raison**: Contrôle qualité, sécurité, gouvernance
- **Code**: `BarsManagementPanel` + `AuthService.setupPromoterBar()`

### Multi-bar pour promoteurs

- **Règle**: `BarSelector` dans le Header (dropdown)
- **Persistance**: `localStorage` (`selectedBarId`)
- **Fallback**: Premier bar accessible si localStorage vide

### Isolation des tenants

- **Règle**: Toujours filtrer par `barId` — jamais de query cross-tenant
- **RLS**: Toutes les tables ont des politiques RLS activées
- **Vérification**: `bar_members` détermine l'accès d'un utilisateur à un bar

### Offline-first

- **Règle**: Toute opération critique doit fonctionner hors-ligne
- **Queue**: `offlineQueue.ts` (IndexedDB)
- **Sync**: `SyncManager.ts` gère la resynchronisation

### Opérations idempotentes

- **Règle**: Les ventes utilisent `idempotencyKey` (UUID)
- **Raison**: Éviter les doublons en cas de retry réseau

---

## Problèmes connus & solutions

### Scoping ES2020 avec Promise.race

```typescript
// ❌ Mauvais : operationPromise déclaré dans try, inaccessible dans catch
try {
  const operationPromise = operation();
  await Promise.race([operationPromise, timeoutPromise]);
} catch (e) {
  operationPromise.then(...); // ReferenceError!
}

// ✅ Correct : déclarer avant le try
const operationPromise = operation();
try {
  await Promise.race([operationPromise, timeoutPromise]);
} catch (e) {
  operationPromise.then(...); // OK
}
```

### Faux changement de rôle lors création d'utilisateur

```typescript
// Supabase émet SIGNED_IN pour le nouvel utilisateur → protéger la session courante
if (event === 'SIGNED_IN' && session && currentUser) {
  if (currentUser.id !== session.user.id) {
    return; // Ignorer : création de compte en cours
  }
}
```

### Déploiement Windows → Linux (Vercel)

- **Problème**: `package-lock.json` Windows contient des binaires win32 (`@rollup/rollup-win32-x64-msvc`)
- **Solution**: Supprimer le lock file avant push Vercel, laisser CI régénérer

---

## Build — Scripts personnalisés

### Pipeline de build (`npm run build`)

```
prebuild → generate-version.cjs   (génère public/version.json)
build    → inline-critical-css.mjs (build Vite + optimisation CSS critique)
```

### `scripts/inline-critical-css.mjs` — CSS critique inline

Technique de performance pour éliminer le render-blocking CSS :

1. **Build Vite** standard
2. **Extraction CSS critique** (above-the-fold) via la lib `critical` avec Chromium headless
3. **Inline** dans `<head>` → page visible immédiatement sans attendre le CSS
4. **CSS restant** chargé asynchronement : `media="print" onload="this.media='all'"`
5. **Skip automatique sur Vercel** (pas de Chromium disponible) : `if (process.env.VERCEL === '1')`

```html
<!-- Résultat dans index.html après build local -->
<head>
  <style type="text/css">/* CSS critique inliné ici */</style>
  <link rel="stylesheet" href="/assets/index.css" media="print" onload="this.media='all'">
</head>
```

> **Important** : le script skip sur Vercel — l'optimisation n'est active qu'en build local.
> Le site fonctionne correctement sur Vercel mais sans ce gain de performance spécifique.

### `scripts/generate-version.cjs` — Versioning de build

Génère `public/version.json` à chaque build :

```json
{
  "version": "1.2.3",
  "buildTime": "2025-11-21T10:00:00.000Z",
  "buildNumber": "local",
  "gitCommit": "abc123"
}
```

Utilisé par `VersionCheckService` pour détecter les nouvelles versions et déclencher le prompt de mise à jour PWA.

**Règle** : ne jamais modifier `public/version.json` manuellement — il est généré automatiquement.

---

## Déploiement Vercel — Règles et leçons apprises

Voir `LECONS_DEPLOIEMENT.md` pour le détail complet.

### Quick fix (90% des cas d'échec)

```bash
rm package-lock.json
git add package-lock.json
git commit -m "fix: Remove package-lock.json for cross-platform deployment"
git push
# Vercel régénère automatiquement un lockfile Linux propre
```

### Règles absolues

- **JAMAIS** ajouter manuellement des packages `*-win32-*` ou `*-linux-*` dans `package.json`
- **JAMAIS** committer un `package-lock.json` généré sur Windows pour un déploiement Vercel
- **JAMAIS** utiliser `npm install --force` pour contourner des erreurs de dépendances

### Ce qui ne fonctionne pas

```bash
# ❌ Exclut les binaires Linux nécessaires
echo "omit=optional" > .npmrc

# ❌ Ne résout pas le problème racine
# vercel.json avec installCommand personnalisée

# ❌ Recrée le même problème
npm install --package-lock-only  # sur Windows
```

### Checklist avant chaque déploiement

- [ ] Audit `package.json` : `grep -i "win32\|linux\|darwin" package.json`
- [ ] `npm run build` local réussi
- [ ] `npm run lint` sans erreurs
- [ ] Lockfile supprimé si développé sur Windows
- [ ] Variables d'environnement à jour sur Vercel
- [ ] Migrations DB appliquées (`npx supabase db push`)

### URL de production

`https://bar-tender-ten.vercel.app`

---

## Design System & Storybook

### Composants avec stories

Tous les composants UI de base ont des stories Storybook pour développement et régression visuelle :

```
src/components/ui/
  Button.stories.tsx
  Input.stories.tsx
  Select.stories.tsx
  Card.stories.tsx
  Badge.stories.tsx
  Alert.stories.tsx
  Modal.stories.tsx
  Spinner.stories.tsx
  Checkbox.stories.tsx
  Radio.stories.tsx
  Textarea.stories.tsx
  Toast.stories.tsx
  RoleSwitcher.stories.tsx
src/components/LoadingButton.stories.tsx
```

```bash
npm run storybook        # Dev Storybook (port 6006)
npm run build-storybook  # Build statique
```

### Règle : tout nouveau composant UI doit avoir sa story

Chaque composant du design system doit documenter ses variants (default, disabled, loading, error...) dans une story.

---

## Theming System

### Architecture

Le thème est dynamique et par-bar : chaque bar peut avoir ses propres couleurs, stockées dans `bars.theme_config` (JSON en DB).

**Priorité de résolution du thème** (dans `ThemeContext`) :

```
1. Mode Preview (previewTheme() actif)
2. bar.theme_config en DB (état React live)
3. Cache localStorage 'bartender_theme_cache' (anti-FOUC)
4. Cache legacy 'bartender_bars' (fallback V1)
5. DEFAULT_THEME_CONFIG (fallback ultime)
```

**Exception SuperAdmin** : thème Indigo forcé (`#6366f1`), quel que soit le bar.

### Variables CSS injectées dynamiquement

`ThemeProvider` injecte dans `document.documentElement` :

```css
--brand-primary      /* Couleur principale HEX */
--brand-secondary    /* Couleur secondaire HEX */
--brand-accent       /* Couleur d'accent HEX */
--brand-hue          /* Teinte HSL (number) */
--brand-saturation   /* Saturation HSL (%) */
--brand-shadow       /* Couleur ombre (primary + 40% opacité) */
--brand-gradient     /* linear-gradient(135deg, primary, secondary) */
```

### Utilisation dans les composants

```typescript
// ✅ Utiliser les classes CSS brand (theming dynamique)
<div className="bg-brand-gradient text-white">   // suit le thème du bar
<button className="btn-brand">                   // gradient + shadow adaptatifs
<div className="bg-brand-subtle">                // background léger adaptatif

// ✅ Utiliser le hook pour accéder à la config
const { themeConfig, previewTheme, resetPreview, isPreviewMode } = useTheme();

// ✅ Pour sauvegarder le thème du bar
await updateTheme(newConfig);  // Sync DB + état + cache offline
```

### Classes CSS brand disponibles (`brand-utilities.css`)

```css
.btn-brand          /* Bouton gradient + shadow + hover */
.btn-brand-lg       /* Bouton CTA large */
.card-header-brand  /* Header de carte coloré */
.text-brand-primary /* Texte couleur primaire */
.bg-brand-primary   /* Background couleur primaire */
.bg-brand-subtle    /* Background léger */
.bg-brand-gradient  /* Background gradient */
.border-brand-primary
.border-brand-subtle
.shadow-brand
.shadow-brand-subtle
.accent-brand       /* Pour inputs natifs (range, radio...) */
```

### Système de couleurs statiques (`colorSystem.ts`)

Pour les couleurs **non-dynamiques** (statiques par convention), utiliser les constantes :

```typescript
import { COLORS, COMPONENTS, WIDGETS } from '@/styles/colorSystem';

// 3 couleurs sémantiques SEULEMENT :
// 🟠 BRAND (orange/amber)  → actions, états actifs
// 🟢 SUCCESS (vert)        → argent, revenus, validations
// 🔴 DANGER (rouge)        → erreurs, retours, alertes
// ⬜ NEUTRAL (gris)        → tout le reste

// Exemples
<div className={`bg-gradient-to-r ${COLORS.brand.gradient}`}>
<span className={COMPONENTS.badgeSuccess}>Validé</span>
<div className={COMPONENTS.cardBase}>
```

**Règle stricte** : max 3 couleurs sémantiques dans l'UI. Tout le reste en gris/blanc/noir.

### Ne pas confondre

| Usage | Quand |
|-------|-------|
| `var(--brand-*)` / `.btn-brand` | Theming dynamique par-bar |
| `COLORS` / `COMPONENTS` de `colorSystem.ts` | Couleurs statiques de convention |
| Classes Tailwind directes (`amber-500`) | Jamais dans les composants partagés |

---

## Spécificités métier

### Devise

- Franc CFA (XOF) — Afrique de l'Ouest
- Formater avec `useBeninCurrency()` hook

### Journée comptable

- Les bars ferment souvent après minuit (ex: 6h du matin)
- Les ventes de 2h du matin appartiennent à la journée précédente
- Utiliser `businessDate` (pas `createdAt`) pour les calculs

### Comptabilité SYSCOHADA

- Norme comptable Afrique de l'Ouest
- Module dans `services/supabase/syscohada.service.ts`
- Génère le "Z de Caisse" (rapport de clôture caisse)

### CUMP (Coût Unitaire Moyen Pondéré)

- Coût moyen recalculé à chaque entrée stock
- Utilisé pour valoriser l'inventaire
