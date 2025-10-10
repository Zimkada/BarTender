# BarTender Pro - Project Guidelines

> **PWA Mobile-First pour bars/restaurants - Marché Afrique de l'Ouest (MVP Bénin)**
> Déployé sur : https://bar-tender-ten.vercel.app

## 📋 Build Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 🏗️ Architecture

### File Structure
```
src/
├── components/       # React components (mobile-first, touch-optimized)
├── hooks/           # Custom React hooks (business logic)
├── context/         # React context providers (state management)
├── services/        # Business services (PWA, IndexedDB, sync)
├── utils/           # Utility functions (business logic helpers)
├── types/           # TypeScript type definitions
└── styles/          # Global CSS and Tailwind utilities
```

### Key Directories

- **`/src/components/`** - UI components optimized for mobile touch (44px+ tap targets)
- **`/src/hooks/`** - Reusable business logic (PWA, network, currency, etc.)
- **`/src/context/`** - Global state management via React Context
- **`/src/services/`** - Core services (IndexedDB, background sync, PWA)
- **`/src/utils/`** - Helper functions (business day calculations, formatting, etc.)
- **`/src/types/`** - TypeScript interfaces and types

## 🎯 Project Context

**Market:** Small/medium bars & restaurants - West Africa (Benin MVP)
**Focus:** Offline-first PWA for unstable connectivity (2G/3G networks)
**Currency:** XOF (FCFA) only for MVP - exact decimal precision required
**UI/UX:** Mobile-first, touch-optimized (minimum 44px tap targets)

### MVP Priorities (Phase 1 - Completed)
✅ PWA foundation with 7-day offline autonomy
✅ IndexedDB storage with background sync queue
✅ Mobile-first responsive UI (320px+ screens)
✅ Touch-optimized components (44px minimum)
✅ XOF currency with exact precision (no auto-rounding)
✅ Network optimization (2G/3G/4G adaptive strategies)
✅ Battery-saving optimizations

## 💻 Code Style Guidelines

### TypeScript
- **Strict typing**: Avoid `any`. Use proper types from `/src/types/index.ts`
- **Interfaces**: No 'I' prefix (use `Product` not `IProduct`)
- **Enums**: Use string enums for better debugging
- **Nullability**: Handle null/undefined explicitly

### React
- **Components**: Functional components with hooks only
- **Hooks**: Extract reusable logic to `/src/hooks/`
- **Props**: Define inline or in types file
- **State**: Use Context for global state, local state for component-specific

### Error Handling
- **localStorage/IndexedDB**: Always use try/catch with console.error
- **Network calls**: Handle offline scenarios gracefully
- **User feedback**: Show clear error messages in French

### Naming Conventions
- **Components**: PascalCase (`ProductCard.tsx`)
- **Hooks**: camelCase with 'use' prefix (`useBeninCurrency.ts`)
- **Functions**: camelCase (`calculateTotal`)
- **Variables**: camelCase (`productList`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CURRENCY`)
- **Types/Interfaces**: PascalCase (`Product`, `SaleItem`)

### Import Order
```typescript
// 1. React
import { useState, useEffect } from 'react';

// 2. External libraries
import { toast } from 'react-hot-toast';

// 3. Internal components
import ProductCard from './ProductCard';

// 4. Hooks
import { useBeninCurrency } from '../hooks/useBeninCurrency';

// 5. Context
import { useApp } from '../context/AppContext';

// 6. Types
import type { Product, Sale } from '../types';

// 7. Styles (if any)
import './styles.css';
```

### State Management
- **Local state**: `useState` for component-specific data
- **Context**: Global state (products, sales, settings)
- **Persistence**: `useLocalStorage` hook for data persistence
- **Sync**: Background sync queue for offline operations

### CSS/Styling
- **Tailwind first**: Use Tailwind utility classes
- **Touch targets**: Minimum 44px for all interactive elements
- **Responsive**: Mobile-first breakpoints (320px, 375px, 480px, 768px, 1024px)
- **Colors**: Use semantic color variables
- **Spacing**: Consistent spacing scale (4px base)

## 🌍 Africa-Specific Guidelines

### Offline-First Development
- Always assume connectivity can drop at any moment
- Use IndexedDB for local storage (not just localStorage)
- Implement sync queue for deferred operations
- Test with Chrome DevTools "Offline" mode

### Mobile-First UI
- Design for smallest screens first (320px)
- Touch targets: 44px minimum (thumb-friendly)
- Use bottom navigation for easy thumb access
- High contrast for outdoor visibility

### Currency Handling (XOF/FCFA)
- **No automatic rounding** - preserve exact decimal precision
- Format: `1 000 FCFA` (space thousands separator, French style)
- Optional manual rounding (5, 10, 25 FCFA) with user consent
- Use `useBeninCurrency` hook for all currency operations

### Network Optimization
- Adaptive strategies based on connection type (2G/3G/4G)
- Compress data before sync
- Batch operations intelligently
- Show network status indicators

### Performance
- Bundle size: Keep under 300KB (gzipped)
- First load: <2s on 3G networks
- Battery efficient: Minimize background operations
- Data usage: <5MB/month typical usage

## 🏪 Business Logic (Bar-Specific)

### Business Day Management
**Concept:** Bars fermant après minuit doivent compter les ventes de nuit dans la journée précédente.

**Implementation:** [src/utils/businessDay.ts](src/utils/businessDay.ts)

```typescript
// Configuration dans Settings
businessDayCloseHour: 6  // Clôture caisse à 6h du matin

// Exemple
Vente 04/10 à 23h → Journée commerciale 04/10 ✅
Vente 05/10 à 02h → Journée commerciale 04/10 ✅ (avant clôture 6h)
Vente 05/10 à 08h → Journée commerciale 05/10 ✅ (nouvelle journée)
```

**Règles métier :**
- Utiliser `getBusinessDay(date, closeHour)` pour calculer la journée commerciale d'une vente
- Utiliser `getCurrentBusinessDay(closeHour)` pour obtenir la journée actuelle
- **TOUJOURS** utiliser ces fonctions pour filtrer ventes/retours du jour
- **Impact comptable :** CA calculé par journée commerciale, pas par jour calendaire

### Operating Modes (Mode de fonctionnement)

**Configuration:** [src/components/Settings.tsx](src/components/Settings.tsx) - Ligne 26-207

#### **Mode Complet** (`operatingMode: 'full'`)
- Chaque serveur a son propre compte utilisateur
- Système de commandes avec validation
- Chaque serveur enregistre ses propres ventes
- **Usage :** Bars avec serveurs ayant smartphones

#### **Mode Simplifié** (`operatingMode: 'simplified'`)
- Le gérant/promoteur enregistre toutes les ventes
- Liste des serveurs configurée dans Settings (`serversList`)
- Attribution vente via champ `assignedTo` (nom du serveur)
- **Usage :** Bars dont les serveurs n'ont pas de smartphones

**Stockage:**
```typescript
interface BarSettings {
  operatingMode: 'full' | 'simplified';
  serversList?: string[];  // Utilisé en mode simplifié uniquement
}

interface Sale {
  processedBy: string;     // userId qui a enregistré la vente
  assignedTo?: string;     // En mode simplifié: nom du serveur (ex: "Marie")
}
```

### Returns System (Système de Retours)

**Règle métier fondamentale :** 🚨 **RETOURS AUTORISÉS UNIQUEMENT AVANT CLÔTURE CAISSE**

**Pourquoi ?**
- Boissons = consommation immédiate sur place
- Retour légitime détecté dans la même soirée
- Anti-fraude : Caisse fermée = Comptes immuables
- Comptabilité stable : CA définitif après clôture

**Implementation:** [src/components/ReturnsSystem.tsx](src/components/ReturnsSystem.tsx)

#### **Validation Temporelle**
```typescript
// Fonction canReturnSale() - Ligne 85-120
const canReturnSale = (sale: Sale): { allowed: boolean; reason: string } => {
  // ❌ Vente d'un jour commercial déjà clôturé = REFUSÉ
  // ✅ Même jour commercial + avant heure de clôture = AUTORISÉ
};
```

**Cas d'usage :**
```
✅ Vente 04/10 22h → Retour 04/10 23h (OK)
✅ Vente 04/10 23h → Retour 05/10 02h (OK, avant clôture 6h)
❌ Vente 04/10 23h → Retour 05/10 10h (REFUSÉ, caisse clôturée)
```

#### **Motifs de Retour** (ReturnReasonConfig)

| Motif | Remise Stock | Remboursement | Usage |
|-------|--------------|---------------|-------|
| `defective` | ❌ Non | ✅ Oui | Produit défectueux (pas la faute du client) |
| `wrong_item` | ✅ Oui | ✅ Oui | Mauvais article livré (erreur du bar) |
| `customer_change` | ✅ Oui | ❌ Non | Changement d'avis client (caprice, pas de remb.) |
| `expired` | ❌ Non | ✅ Oui | Produit expiré (faute du bar) |
| `other` | ❌ Non | ❌ Non | Autre raison (décision manuelle gérant) |

**Types:**
```typescript
interface Return {
  refundAmount: number;    // Montant du remboursement
  isRefunded: boolean;     // Le client a-t-il été remboursé ?
  autoRestock: boolean;    // Remise en stock automatique ?
  status: 'pending' | 'approved' | 'rejected' | 'restocked';
}
```

#### **Impact sur CA**
```typescript
// AppContext.tsx - getTodayTotal() - Ligne 411-436
const getTodayTotal = () => {
  const salesTotal = getTodaySales().reduce(...);

  // Déduire UNIQUEMENT les retours remboursés du jour
  const returnsTotal = returns.filter(r =>
    r.status !== 'rejected' &&  // Pas les rejetés
    r.isRefunded &&             // Seulement si remboursés
    /* même jour commercial */
  ).reduce(...);

  return salesTotal - returnsTotal;  // CA NET
};
```

**Exemples comptables :**
```
Scénario 1 : Produit défectueux
- Ventes : 5 000 FCFA
- Retour : 1 000 FCFA (remboursé)
- CA NET : 4 000 FCFA ✅

Scénario 2 : Changement d'avis
- Ventes : 1 500 FCFA
- Retour : 600 FCFA (NON remboursé)
- CA NET : 1 500 FCFA ✅ (CA intact)
```

### Accounting System (Système de Comptabilité)

**Statut:** ✅ **IMPLÉMENTÉ**

**Concept:** Gestion comptable complète du bar au-delà des simples ventes

**Fichiers principaux:**
- [src/components/Accounting.tsx](src/components/Accounting.tsx) - Modal principal avec 3 tabs
- [src/components/AccountingOverview.tsx](src/components/AccountingOverview.tsx) - Vue d'ensemble bilan financier
- [src/components/ExpenseManager.tsx](src/components/ExpenseManager.tsx) - Gestion dépenses
- [src/components/SalaryManager.tsx](src/components/SalaryManager.tsx) - Gestion salaires

**Hooks custom:**
- [src/hooks/useExpenses.ts](src/hooks/useExpenses.ts) - Gestion dépenses avec localStorage
- [src/hooks/useSalaries.ts](src/hooks/useSalaries.ts) - Gestion salaires avec localStorage
- [src/hooks/useSupplies.ts](src/hooks/useSupplies.ts) - Gestion approvisionnements
- [src/hooks/useReturns.ts](src/hooks/useReturns.ts) - Gestion retours

**Types de transactions :**
```typescript
export type TransactionType =
  | 'sale'           // Vente (entrée)
  | 'return'         // Retour (sortie si remboursé)
  | 'supply'         // Approvisionnement (sortie)
  | 'expense'        // Dépense (sortie)
  | 'salary';        // Salaire (sortie)

export type ExpenseCategory =
  | 'water'          // 💧 Eau
  | 'electricity'    // ⚡ Électricité
  | 'maintenance'    // 🔧 Entretien/Réparations
  | 'custom';        // Catégorie personnalisée
```

**Fonctionnalités implémentées:**
- ✅ Modal plein écran avec navigation tabs (Overview, Dépenses, Salaires)
- ✅ Calcul automatique du bilan financier :
  ```typescript
  Revenus = Ventes - Retours remboursés
  Coûts = Approvisionnements + Dépenses + Salaires + Retours
  Bénéfice Net = Revenus - Coûts
  Marge bénéficiaire = (Bénéfice Net / Revenus) * 100
  ```
- ✅ Gestion des catégories de dépenses (eau, électricité, entretien, custom)
- ✅ Gestion des salaires par membre et par période (YYYY-MM)
- ✅ Filtres période : **Semaine** (Lundi-Dimanche) ou **Mois** (1er-dernier jour)
- ✅ Persistence localStorage pour expenses et salaries
- ✅ Interface responsive mobile-first
- ✅ Affichage des coûts par approvisionnement (totalCost = lotPrice × lotSize)

**Intégration dans App.tsx:**
- Ligne 30 : Import du composant Accounting
- Ligne 68 : State `showAccounting`
- Ligne 362 : Rendu conditionnel du modal

### Consignments System (Système de Consignes)

**Statut:** ✅ **IMPLÉMENTÉ** (Session 3)

**Concept:** Client paie mais laisse produits non consommés pour revenir plus tard

**Différence Retour vs Consigne:**
- **Retour** : Annulation vente, remboursement possible, immédiat
- **Consigne** : Conservation vente, pas de remboursement, récupération différée (7-30j configurables)

**Fichiers principaux:**
- [src/types/index.ts](src/types/index.ts) - Types `Consignment`, `ConsignmentStatus`, `ConsignmentStock`, `ProductStockInfo`
- [src/hooks/useConsignments.ts](src/hooks/useConsignments.ts) - Hook gestion consignations avec stock séparé
- [src/components/ConsignmentSystem.tsx](src/components/ConsignmentSystem.tsx) - Modal 3 tabs (Créer, Actives, Historique)

**Architecture Stock Séparé:**

🚨 **RÈGLE CRITIQUE:** Stock consigné ≠ Stock vendable

```typescript
// Types
interface Consignment {
  quantity: number;               // Quantité consignée
  status: 'active' | 'claimed' | 'expired' | 'forfeited';
  expiresAt: Date;                // Expiration auto (défaut: 7j)
}

interface ProductStockInfo {
  physicalStock: number;          // Stock physique total (Product.stock)
  consignedStock: number;         // Stock consigné (RÉSERVÉ, non vendable)
  availableStock: number;         // Stock vendable = physicalStock - consignedStock
}
```

**Workflows:**

#### **1. Création Consignation**
```typescript
// Scénario : Client paie 10 Heineken mais veut les récupérer plus tard

AVANT :
- Stock physique : 50
- Stock consigné : 0
- Stock vendable : 50

APRÈS création consignation (quantity: 10) :
- Stock physique : 50 (INCHANGÉ)
- Stock consigné : 10 (AJOUTÉ)
- Stock vendable : 40 (50 - 10) ✅ PROTECTION
```

**Règles :**
- Créée uniquement depuis une vente existante du jour
- Montant déjà payé (pas de double facturation)
- Infos client obligatoires (nom + téléphone optionnel)
- Expiration automatique après X jours (défaut: 7, configurable)

#### **2. Récupération (Claimed)**
```typescript
// Client revient chercher ses produits

AVANT :
- Stock physique : 50
- Stock consigné : 10
- Stock vendable : 40

APRÈS claim (claimConsignment(id)) :
- Stock physique : 40 (50 - 10) ✅ Déduit
- Stock consigné : 0 (10 - 10) ✅ Libéré
- Stock vendable : 40 (inchangé)
```

**Impact :**
- Stock physique déduit (produit part avec le client)
- Stock consigné libéré
- Statut → `'claimed'`

#### **3. Expiration Automatique**
```typescript
// Après X jours sans récupération

AVANT :
- Stock physique : 50
- Stock consigné : 10
- Stock vendable : 40

APRÈS expiration auto :
- Stock physique : 50 (INCHANGÉ)
- Stock consigné : 0 (libéré)
- Stock vendable : 50 ✅ Retour à la vente
```

**Mécanisme :**
- Vérification auto toutes les minutes (`checkAndExpireConsignments`)
- Statut → `'expired'`
- Stock redevient vendable automatiquement

#### **4. Confiscation (Forfeited)**
```typescript
// Gérant décide de confisquer (client renonce)

AVANT :
- Stock physique : 50
- Stock consigné : 10
- Stock vendable : 40

APRÈS forfeitConsignment(id) :
- Stock physique : 50 (INCHANGÉ)
- Stock consigné : 0 (libéré immédiatement)
- Stock vendable : 50 ✅ Retour immédiat
```

**Règles métier :**

✅ **Garanties Stock Séparé**
- `getConsignedStockByProduct(productId)` : calcule quantité consignée (status='active')
- `getProductStockInfo(productId, stock)` : retourne {physicalStock, consignedStock, availableStock}
- Affichage vente : toujours `availableStock`, JAMAIS `physicalStock`
- Impossible de vendre stock consigné

✅ **Expiration Configurable**
```typescript
// Dans Settings (AppSettings)
consignmentExpirationDays?: number; // Défaut: 7 jours

// Calcul auto dans hook
const expiresAt = new Date(createdAt);
expiresAt.setDate(expiresAt.getDate() + expirationDays);
```

✅ **Permissions**
```typescript
// RolePermissions
canCreateConsignment: boolean;  // Créer consignation
canClaimConsignment: boolean;   // Valider récupération
canViewConsignments: boolean;   // Voir liste

// Par défaut :
promoteur: true, true, true
gerant: true, true, true
serveur: false, false, false  // Serveurs ne gèrent pas les consignations
```

**UI Components:**

#### **Tab 1: Créer Consignation**
1. Sélection vente du jour
2. Choix produit à consigner
3. Quantité + Infos client (nom obligatoire, tél optionnel)
4. Récapitulatif + Création

#### **Tab 2: Consignations Actives**
- Liste cards avec infos client
- Compteur expiration (heures/jours restants)
- Badge orange si < 24h
- Actions : **Récupéré** (claim) | **Confisquer** (forfeit)

#### **Tab 3: Historique**
- Filtres : Tout | Récupérés | Expirés | Confisqués
- Tri chronologique décroissant
- Status badges colorés

**Dashboard Widget:**
```typescript
// DailyDashboard.tsx - Nouveau widget
{
  icon: Archive,
  label: "Consignations",
  count: activeConsignmentsCount,
  value: formatPrice(activeConsignmentsValue),
  gradient: "from-indigo-100 to-purple-100"
}
```

**Intégration Comptabilité:**

⚠️ **Impact Trésorerie: NEUTRE**

```typescript
// Consignation ≠ Transaction financière
TransactionType: 'consignment'  // Ajouté aux types

// Comptabilité
Revenus: Ventes - Retours remboursés  // Consignation déjà dans Ventes
Coûts: Approvisionnements + Dépenses + Salaires
```

**Raison :** Montant déjà compté dans la vente originale (pas de double comptage)

**Stockage:**
```typescript
// localStorage
'consignments-v1': Consignment[]  // Persistence
```

**Cas d'usage typiques:**

```
Scénario 1 : Client régulier
22h - Achète 20 Heineken, consigne 15 (récupération demain)
→ Stock : 100 → vendable: 85 ✅
→ Montant : déjà encaissé (dans CA du jour)

23h - Autre client veut acheter 90 Heineken
→ Stock affiché : 85 (impossible) ✅ PROTECTION

Lendemain 19h - Client revient
→ Claim consignation → stock physique: 100-15=85
→ Stock consigné: 0, vendable: 85

Scénario 2 : Client ne revient pas
7 jours plus tard - Expiration auto
→ Stock vendable : 100 (retour à la vente)
→ Statut : 'expired'
```

## 📚 Key Technical Documentation

For detailed implementation guides, see:
- [ROADMAP.md](ROADMAP.md) - Full development roadmap (14 weeks)
- [MVP_SEMAINE1_RAPPORT.md](MVP_SEMAINE1_RAPPORT.md) - Week 1 completion report
- [AUDIT_METIER_BENIN.md](AUDIT_METIER_BENIN.md) - Market analysis & strategy
- [LECONS_DEPLOIEMENT.md](LECONS_DEPLOIEMENT.md) - Deployment lessons (Windows→Linux)

## 🚀 Deployment

**Platform:** Vercel (Linux environment)
**Development:** Windows 11
**Important:** Never commit platform-specific dependencies (e.g., `@rollup/rollup-win32-x64-msvc`)

See [LECONS_DEPLOIEMENT.md](LECONS_DEPLOIEMENT.md) for cross-platform deployment guidelines.

## 🔧 Common Development Patterns

### Using Business Day Logic
```typescript
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';
import { useBarContext } from '../context/BarContext';

const MyComponent = () => {
  const { currentBar } = useBarContext();
  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;

  // Obtenir journée commerciale actuelle
  const currentBusinessDay = getCurrentBusinessDay(closeHour);

  // Calculer journée commerciale d'une vente
  const saleBusinessDay = getBusinessDay(new Date(sale.date), closeHour);

  // Vérifier si même jour commercial
  if (isSameDay(saleBusinessDay, currentBusinessDay)) {
    // Vente du jour commercial actuel
  }
};
```

### Filtering Data by Business Day
```typescript
// ✅ CORRECT - Utiliser journée commerciale
const getTodaySales = () => {
  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
  const currentBusinessDay = getCurrentBusinessDay(closeHour);

  return sales.filter(sale => {
    const saleDate = new Date(sale.date);
    const saleBusinessDay = getBusinessDay(saleDate, closeHour);
    return isSameDay(saleBusinessDay, currentBusinessDay);
  });
};

// ❌ INCORRECT - Ne pas filtrer par jour calendaire
const getTodaySales = () => {
  const today = new Date();
  return sales.filter(sale => {
    const saleDate = new Date(sale.date);
    return saleDate.getDate() === today.getDate();  // FAUX !
  });
};
```

### Creating Returns with Validation
```typescript
const createReturn = async (saleId: string, productId: string, quantity: number, reason: ReturnReason) => {
  const sale = sales.find(s => s.id === saleId);
  if (!sale) return;

  // 1. TOUJOURS vérifier validation jour commercial
  const returnCheck = canReturnSale(sale);
  if (!returnCheck.allowed) {
    showError(returnCheck.reason);
    return;
  }

  // 2. Déterminer si remboursement selon motif
  const reasonConfig = returnReasons[reason];

  // 3. Créer retour via AppContext (persistance)
  const newReturn = addReturn({
    // ... autres champs
    refundAmount: reasonConfig.autoRefund ? (price * quantity) : 0,
    isRefunded: reasonConfig.autoRefund,
    autoRestock: reasonConfig.autoRestock,
  });
};
```

### Calculating Revenue with Returns
```typescript
// CA NET = Ventes - Retours remboursés
const getTodayTotal = () => {
  const salesTotal = getTodaySales().reduce((sum, sale) => sum + sale.total, 0);

  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
  const currentBusinessDay = getCurrentBusinessDay(closeHour);

  const returnsTotal = returns
    .filter(r =>
      r.status !== 'rejected' &&           // Approuvés seulement
      r.isRefunded &&                      // Remboursés seulement
      isSameDay(
        getBusinessDay(new Date(r.returnedAt), closeHour),
        currentBusinessDay
      )
    )
    .reduce((sum, r) => sum + r.refundAmount, 0);

  return salesTotal - returnsTotal;
};
```

## 🐛 Troubleshooting

### TypeScript Errors
```bash
# Vérifier erreurs TypeScript sans build
npx tsc --noEmit
```

### Business Day Issues
- **Problème :** Ventes de nuit n'apparaissent pas dans rapport du jour
- **Solution :** Vérifier que `businessDayCloseHour` est configuré (Settings)
- **Vérifier :** Utiliser `getBusinessDay()` partout, pas `new Date().getDate()`

### Returns Not Persisting
- **Problème :** Retours disparaissent à la fermeture du modal
- **Solution :** Utiliser `useAppContext().addReturn()`, PAS `useState` local
- **Vérifier :** Les retours sont dans localStorage `returns-v1`

### CA Incorrect
- **Problème :** CA ne tient pas compte des retours
- **Solution :** `getTodayTotal()` doit déduire `returnsTotal`
- **Vérifier :** Seulement les retours avec `isRefunded = true` sont déduits

## 📅 Development Roadmap - Current Session

### Session 1 - Returns System Enhancements & UI Improvements

**Status:** ✅ **TOUTES PHASES COMPLÈTES** (1A, 1B, 2, 3, 4A, 4B, 4C)

#### ✅ Phase 1A: Flexible "Other Reason" Returns (COMPLETED)
**Objectif:** Permettre au gérant de décider manuellement du remboursement et de la remise en stock pour le motif "Autre raison"

**Fichiers modifiés:**
- `src/types/index.ts` - Ajout champs `customRefund` et `customRestock` à `Return` interface
- `src/components/ReturnsSystem.tsx` - Implémentation complète du modal personnalisé

**Implémentation:**
1. ✅ Ajout de `OtherReasonDialog` modal component (lignes 482-610)
   - Checkboxes pour choix custom remboursement/stock
   - Notes obligatoires
   - Affichage récapitulatif des choix
   - Animations framer-motion

2. ✅ Mise à jour de `CreateReturnForm` (lignes 626-962)
   - Détection motif "other" → ouverture modal
   - Callback `handleOtherReasonConfirm` pour traiter choix custom
   - Passage paramètres `customRefund` et `customRestock` à `onCreateReturn`

3. ✅ Modification fonction `createReturn` (lignes 135-217)
   - Signature étendue: `customRefund?: boolean`, `customRestock?: boolean`
   - Logique conditionnelle pour motif "other":
     ```typescript
     const finalRefund = reason === 'other'
       ? (customRefund ?? false)
       : reasonConfig.autoRefund;
     const finalRestock = reason === 'other'
       ? (customRestock ?? false)
       : reasonConfig.autoRestock;
     ```
   - Stockage des choix custom dans l'objet Return

**Résultat:**
- ✅ Modal apparaît lors de sélection "Autre raison"
- ✅ Gérant peut choisir indépendamment remboursement et remise en stock
- ✅ Notes obligatoires pour traçabilité
- ✅ Compilation TypeScript et Vite réussies
- ✅ HMR fonctionne correctement

#### ✅ Phase 1B: Transform Team Management UI (COMPLETED)
**Objectif:** Modal plein écran cohérent avec autres menus (Retours, Analytics, etc.)

**Fichiers modifiés:**
- `src/components/UserManagement.tsx` - Transformation en modal plein écran
- `src/App.tsx` - Ajout props `isOpen` et `onClose`

**Implémentation:**
1. ✅ Ajout interface `UserManagementProps` avec `isOpen` et `onClose`
2. ✅ Wrapping complet dans `AnimatePresence` + `motion.div`
3. ✅ Header coloré avec gradient orange/amber, logo Users, et bouton X
4. ✅ Zone contenu scrollable `max-h-[calc(90vh-88px)]`
5. ✅ Suppression header interne dupliqué
6. ✅ Modification App.tsx pour passer props au lieu de condition `{showServers && ...}`

**Résultat:**
- ✅ Gestion d'équipe s'ouvre en modal fullscreen (cohérent avec Retours/Analytics)
- ✅ Header magnifique avec gradient et bouton fermer
- ✅ Contenu scrollable avec stats, liste membres, modal ajout membre
- ✅ Fermeture avec bouton X ou backdrop click
- ✅ Animations framer-motion fluides

#### ✅ Phase 2: Display Returns in Sales History (COMPLETED)
**Objectif:** Afficher retours dans historique avec montants nets

**Fichiers modifiés:**
- `src/components/SalesHistory.tsx` - Ajout colonnes Retours et Net

**Implémentation:**
1. ✅ Ajout `returns` et `getReturnsBySale` dans EnhancedSalesHistory
2. ✅ Modification props de `SalesList` pour inclure returns et getReturnsBySale
3. ✅ Ajout colonnes "Retours" et "Net" dans la table
4. ✅ Badge rouge sur ID montrant nombre de retours
5. ✅ Total barré (line-through) si retours présents
6. ✅ Calcul montant retours remboursés (approved/restocked + isRefunded)
7. ✅ Affichage Net Amount en vert (Total - Retours)

**Résultat:**
- ✅ Table historique affiche 7 colonnes: ID, Date, Articles, Total, Retours, Net, Actions
- ✅ Badge "X retour(s)" en rouge sur ventes avec retours
- ✅ Total original visible mais barré si retours
- ✅ Montant retours en rouge avec signe "-"
- ✅ Montant net en vert (montant réellement encaissé)

#### ✅ Phase 3: Returns Widget for Dashboard (COMPLETED)
**Objectif:** Widget statistiques retours sur Dashboard

**Fichier modifié:**
- [src/components/DailyDashboard.tsx](src/components/DailyDashboard.tsx) (lignes 264-288)

**Implémentation:**
1. ✅ Widget retours avec gradient rouge/rose (from-red-100 to-pink-100)
2. ✅ Icône `RotateCcw` pour identifier visuellement
3. ✅ Compteur animé via `AnimatedCounter` pour nombre de retours
4. ✅ Statistiques calculées :
   - `todayReturnsCount` - Nombre total de retours du jour
   - `todayReturnsPending` - Retours en attente d'approbation
   - `todayReturnsRefunded` - Montant total remboursé (en rouge avec signe -)
5. ✅ Affichage conditionnel : retours en attente et montant remboursé
6. ✅ Filtrage par journée commerciale (business day aware)

**Résultat:**
- ✅ Widget visible sur DailyDashboard avec les ventes, commandes, et stock
- ✅ Design cohérent avec les autres widgets (hover animation, bordures)
- ✅ Format prix optimisé (espaces supprimés pour compacité)

#### ✅ Phase 4A: Export Unifié (COMPLETED)
**Objectif:** Export ventes + retours dans un seul fichier avec colonne "Type"

**Fichier modifié:**
- [src/components/SalesHistory.tsx](src/components/SalesHistory.tsx) (lignes 268-449)

**Implémentation:**
1. ✅ Fonction `exportSales()` mise à jour pour inclure retours
2. ✅ Ajout colonne **"Type"** : `'Vente'` ou `'Retour'` (ligne 374)
3. ✅ Filtrage retours selon même période que ventes (today/week/month/custom)
4. ✅ Quantités négatives pour retours (ligne 381 : `-ret.quantity`)
5. ✅ Montant total négatif si remboursé (ligne 370)
6. ✅ Bénéfice négatif si remboursé (ligne 371)
7. ✅ Tri chronologique décroissant unifié (lignes 393-397)
8. ✅ Export Excel (.xlsx) avec largeurs colonnes optimisées (lignes 418-435)
9. ✅ Export CSV avec headers corrects

**Résultat:**
- ✅ Fichier Excel/CSV contient ventes ET retours dans le même export
- ✅ Distinction claire via colonne "Type"
- ✅ Montants négatifs pour retours remboursés (comptabilité correcte)
- ✅ Tous les champs inclus : Date, Heure, ID, Produit, Catégorie, Volume, Quantité, Prix, Coût, Total, Bénéfice, Utilisateur, Rôle, Devise

#### ✅ Phase 4B: KPI CA/heure et CA/jour (COMPLETED)
**Objectif:** Afficher CA/heure pour "Aujourd'hui", CA/jour pour "Semaine/Mois"

**Fichier modifié:**
- [src/components/SalesHistory.tsx](src/components/SalesHistory.tsx) (lignes 165-227)

**Implémentation:**
1. ✅ Calcul KPI adaptatif via `useMemo` basé sur `timeFilter`
2. ✅ **Mode "Aujourd'hui" (today)** :
   - Calcul revenus par heure (0-23h) : `hourlyRevenue[hour]`
   - Déduction retours remboursés par heure
   - KPI : `CA/heure moyen = totalRevenue / nombre d'heures avec ventes`
   - Label : `"CA/heure moyen"`
3. ✅ **Mode "Semaine/Mois" (week/month)** :
   - Calcul revenus par jour calendaire : `dailyRevenue[day]`
   - KPI : `CA/jour moyen = totalRevenue / nombre de jours avec ventes`
   - Label : `"CA/jour moyen"`
4. ✅ Affichage dans Analytics (lignes 1624-1631) :
   - Card avec gradient orange
   - Icône Clock
   - Texte dynamique selon période
5. ✅ Graphique évolution CA avec granularité adaptative (lignes 1647-1667) :
   - "par heure" pour today
   - "par jour" pour week
   - "par semaine" pour month

**Résultat:**
- ✅ KPI contextuel affiché en haut de l'Analytics
- ✅ Graphique LineChart avec axe X adapté (heures ou jours)
- ✅ Label explicite indiquant l'unité de mesure
- ✅ Déduction correcte des retours remboursés dans le calcul

#### ✅ Phase 4C: Filtres Semaine/Mois Business Day (COMPLETED)
**Objectif:** Filtres période avec business day awareness pour "Aujourd'hui"

**Fichier modifié:**
- [src/components/SalesHistory.tsx](src/components/SalesHistory.tsx) (lignes 78-140)

**Implémentation:**
1. ✅ **Filtre "Aujourd'hui"** (today) :
   - Utilise `getCurrentBusinessDay(closeHour)` pour obtenir journée commerciale actuelle
   - Filtre ventes avec `getBusinessDay(saleDate, closeHour)`
   - Compare avec `isSameDay()` pour vérifier même journée commerciale
   - **Business day aware** ✅
2. ✅ **Filtre "Semaine"** (week) :
   - Calcul du lundi de la semaine courante (ligne 104-108)
   - Plage : Lundi 00:00 → Dimanche 23:59:59
   - Gère correctement le cas Dimanche (day = 0)
3. ✅ **Filtre "Mois"** (month) :
   - Premier jour du mois : `new Date(year, month, 1)` à 00:00
   - Dernier jour du mois : `new Date(year, month+1, 0)` à 23:59:59
4. ✅ **Filtre "Custom"** (personnalisé) :
   - Plage dates personnalisée avec `customDateRange.start` et `customDateRange.end`
5. ✅ Même logique appliquée aux retours (lignes 309-354)

**Résultat:**
- ✅ Filtre "Aujourd'hui" respecte la journée commerciale (ventes de nuit incluses)
- ✅ Filtres "Semaine" et "Mois" utilisent calendrier standard
- ✅ Cohérence entre ventes et retours (même logique de filtrage)
- ✅ Plage custom fonctionnelle pour analyses personnalisées

---

### Session 2 - Accounting System Implementation

**Status:** ✅ **COMPLÉTÉ**

Voir section [Accounting System (Système de Comptabilité)](#accounting-system-système-de-comptabilité) ci-dessus pour les détails complets de l'implémentation.

**Résumé:**
- ✅ Modal Accounting avec 3 tabs (Overview, Dépenses, Salaires)
- ✅ 4 hooks custom (useExpenses, useSalaries, useSupplies, useReturns)
- ✅ Calcul bilan automatique avec formules comptables
- ✅ Gestion catégories dépenses (eau, électricité, entretien, custom)
- ✅ Filtres période semaine/mois
- ✅ Persistence localStorage

---

### Session 3 - Consignment System Implementation

**Status:** ✅ **COMPLÉTÉ**

Voir section [Consignments System (Système de Consignes)](#consignments-system-système-de-consignes) ci-dessus pour les détails complets de l'implémentation.

**Résumé:**
- ✅ Types `Consignment`, `ConsignmentStatus`, `ConsignmentStock`, `ProductStockInfo`
- ✅ Hook `useConsignments` avec stock séparé garanti
- ✅ Composant `ConsignmentSystem` avec 3 tabs (Créer, Actives, Historique)
- ✅ Intégration App.tsx + Header (bouton Archive)
- ✅ Widget Dashboard (compteur + valeur consignations actives)
- ✅ Permissions système (promoteur/gérant: oui, serveur: non)
- ✅ Expiration automatique (vérification 1 min)
- ✅ Persistance localStorage `consignments-v1`

**Garanties architecture:**
- **Stock séparé:** `availableStock = physicalStock - consignedStock`
- **Impossible vendre stock consigné:** Protection totale
- **Expiration auto:** Retour stock vendable après X jours
- **Traçabilité:** Historique complet (claimed/expired/forfeited)

---

### Session 4 - Consignment Analytics & Export

**Status:** ✅ **COMPLÉTÉ**

Voir section [Consignments System (Système de Consignes)](#consignments-system-système-de-consignes) pour les détails complets de l'implémentation de base (Session 3).

**Résumé Session 4:**
- ✅ Analytics consignations dans SalesHistory.tsx
- ✅ Section dédiée consignations dans vue Analytics
- ✅ Export unifié ventes + retours + consignations
- ✅ Statistiques avancées (taux récupération, valeurs, etc.)

#### ✅ Phase A: Consignment Analytics (COMPLETED)

**Objectif:** Afficher statistiques consignations dans Analytics

**Fichiers modifiés:**
- [src/components/SalesHistory.tsx](src/components/SalesHistory.tsx) - Lignes 163-219, 1347-1377, 1798-1854

**Implémentation:**

1. ✅ **Filtrage consignations par période** (lignes 163-219)
   ```typescript
   const filteredConsignments = useMemo(() => {
     // Filtrage identique aux ventes (today/week/month/custom)
     // Business day aware pour "today"
   }, [consignments, timeFilter, customDateRange, closeHour]);
   ```

2. ✅ **Calcul statistiques consignations** (lignes 1347-1377)
   ```typescript
   const consignmentStats = useMemo(() => ({
     total: filteredConsignments.length,
     active: activeConsignments.length,
     claimed: claimedConsignments.length,
     expired: expiredConsignments.length,
     forfeited: forfeitedConsignments.length,
     activeValue, claimedValue, totalValue,
     totalQuantity, claimedQuantity,
     claimRate: (claimed / total) * 100
   }), [filteredConsignments]);
   ```

3. ✅ **Section Analytics dédiée** (lignes 1798-1854)
   - Grid 5 cartes : Total, Actives, Récupérées, Expirées, Confisquées
   - Taux de récupération avec barre de progression
   - Design gradient indigo/purple cohérent
   - Affichage conditionnel si consignations > 0

4. ✅ **Props AnalyticsView** (ligne 1276)
   - Ajout `filteredConsignments: any[]` aux props
   - Passage aux deux appels AnalyticsView (lignes 718, 1028)

**Résultat:**
- ✅ Widget visuel statistiques consignations dans Analytics
- ✅ Filtrage période identique aux ventes/retours
- ✅ KPIs clés : taux récupération, valeurs totales, statuts
- ✅ Design cohérent avec le reste de l'interface

#### ✅ Phase B: Consignment Export (COMPLETED)

**Objectif:** Inclure consignations dans export Excel/CSV

**Fichier modifié:**
- [src/components/SalesHistory.tsx](src/components/SalesHistory.tsx) - Lignes 454-506

**Implémentation:**

1. ✅ **Ajout consignations après retours** (ligne 454)
   ```typescript
   // 3. Ajouter toutes les consignations de la période filtrée
   filteredConsignments.forEach(consignment => {
     const product = products.find(p => p.id === consignment.productId);
     // ...
     exportData.push({
       'Type': 'Consignation',
       'Statut': statusLabel, // Active/Récupérée/Expirée/Confisquée
       'Client': consignment.customerName,
       'Expiration': new Date(consignment.expiresAt).toLocaleDateString('fr-FR'),
       // + tous les champs standard (Date, Heure, ID, Produit, etc.)
     });
   });
   ```

2. ✅ **Nouvelles colonnes export**
   - `Type` : Vente | Retour | **Consignation**
   - `Statut` : Active | Récupérée | Expirée | Confisquée
   - `Client` : Nom du client (consignations uniquement)
   - `Expiration` : Date d'expiration (consignations uniquement)

3. ✅ **Tri chronologique unifié**
   - Tri décroissant par date/heure après ajout des 3 types
   - Ventes + Retours + Consignations dans un seul fichier

**Résultat:**
- ✅ Export unique Excel/CSV avec colonnes Type, Statut, Client, Expiration
- ✅ Consignations filtrées selon même période que ventes/retours
- ✅ Fichier complet pour analyse business (BI tools, Excel pivot, etc.)

**Cas d'usage:**
```
Export "Aujourd'hui" contient :
- 45 Ventes
- 3 Retours
- 8 Consignations (5 actives, 2 récupérées, 1 expirée)

Total : 56 lignes dans le fichier Excel
```

---

### Future Sessions

#### 📦 Consignment System Enhancements (Priorité moyenne)
**Objectif:** Améliorations avancées système consignations

**Fonctionnalités à ajouter:**
- Notifications SMS/WhatsApp rappel expiration (J-1)
- QR Code unique par consignation (scan récupération)
- ✅ ~~Statistiques consignations dans Analytics~~ (Session 4)
- ✅ ~~Export consignations dans historique ventes~~ (Session 4)
- Intégration comptabilité (suivi valeur immobilisée)
- Recherche avancée (par client, produit, date)
- Badges "Client fidèle" (X consignations récupérées)
- Graphique évolution consignations (LineChart temporel)

#### 📊 Accounting Enhancements (Après Consignment)
**Objectifs:**
- Graphiques répartition dépenses (PieChart/BarChart)
- Export comptable unifié PDF/Excel (toutes transactions)
- Bilan financier mensuel automatique
- Gestion fournisseurs et paiements
- Tableaux de bord comptables avancés

#### 🧪 Testing & Quality Assurance
**Objectifs:**
- Tests automatisés avec Vitest + React Testing Library
- Tests unitaires hooks custom
- Tests intégration composants critiques
- Tests business day logic
- Tests calculs comptables

#### 🚀 Performance & Optimizations
**Objectifs:**
- Lazy loading composants lourds (Analytics, Accounting)
- Optimisation bundle size (code splitting)
- Service Worker optimisations
- IndexedDB migrations system
- Background sync améliorations

---

*Last updated: 10 Oct 2025 - Session 1, 2, 3 & 4 Complete (Retours + Comptabilité + Consignations + Analytics/Export)*