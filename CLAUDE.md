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

**Concept:** Gestion comptable complète du bar au-delà des simples ventes

**Types de transactions :**
```typescript
export type TransactionType =
  | 'sale'           // Vente (entrée)
  | 'return'         // Retour (sortie si remboursé)
  | 'supply'         // Approvisionnement (sortie)
  | 'salary'         // Salaire (sortie)
  | 'rent'           // Loyer (sortie)
  | 'electricity'    // Électricité (sortie)
  | 'water'          // Eau (sortie)
  | 'other_expense'  // Autre dépense (sortie)
  | 'consignment'    // Consigne (neutre)
  | 'investment';    // Apport capital (entrée)
```

**Fonctionnalités :**
- Gestion dépenses complètes (loyer, électricité, salaires)
- Suivi fournisseurs et paiements
- Bilan financier (revenus - dépenses = résultat)
- Export comptable unifié (toutes transactions)
- Graphiques répartition dépenses
- Calcul marges réelles

**Statut:** 🔄 En cours d'implémentation (priorité haute)

### Future: Consignments System (Système de Consignes)

**Concept:** Client paie mais laisse produits non consommés pour revenir plus tard

**Différence Retour vs Consigne:**
- **Retour** : Annulation vente, remboursement possible, immédiat
- **Consigne** : Conservation vente, pas de remboursement, récupération différée (7-30j)

**Statut:** 🚧 À implémenter (après comptabilité)

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

**Status:** ✅ Phases 1A, 1B & 2 Complete | 🔄 Phase 3 In Progress

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

#### 📊 Phase 3: Returns Widget for Dashboard (À FAIRE)
**Objectif:** Widget statistiques retours sur Dashboard

#### 📈 Phase 4: Analytics Improvements (À FAIRE)
- **4A:** Export unifié (Type: Vente/Retour/Approv)
- **4B:** KPI CA/heure (aujourd'hui) ou CA/jour (semaine/mois)
- **4C:** Filtres semaine calendaire et mois (avec business day awareness)

---

### Future Sessions

#### 💰 Accounting System (Priorité élevée)
**Objectif:** Gestion comptabilité complète (dépenses, salaires, loyer, etc.)

**Types de transactions prévus:**
```typescript
export type TransactionType =
  | 'sale'           // Vente (entrée)
  | 'return'         // Retour (sortie si remboursé)
  | 'supply'         // Approvisionnement (sortie)
  | 'salary'         // Salaire (sortie)
  | 'rent'           // Loyer (sortie)
  | 'electricity'    // Électricité (sortie)
  | 'water'          // Eau (sortie)
  | 'other_expense'  // Autre dépense (sortie)
  | 'consignment'    // Consigne (neutre)
  | 'investment';    // Apport capital (entrée)
```

#### 📦 Consignment System (Après Accounting)
**Objectif:** Gestion système consignes bouteilles/emballages

---

*Last updated: 06 Oct 2025 - Phases 1A, 1B & 2 Complete*