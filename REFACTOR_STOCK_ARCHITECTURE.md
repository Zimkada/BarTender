# 🏗️ REFACTOR STOCK - ARCHITECTURE EXPERT

> **Date:** 28 Octobre 2025
> **Objectif:** Éliminer duplication stock + Préparer backend Supabase
> **Approche:** Migration progressive avec zero-downtime

---

## 📊 ÉTAT ACTUEL - CARTOGRAPHIE COMPLÈTE

### 🔴 PROBLÈME: Triple Duplication du Système Stock

```
┌─────────────────────────────────────────────────────────────┐
│                  ARCHITECTURE ACTUELLE                       │
│                     (FRAGMENTÉE)                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│   useProducts.ts    │ ❌ Hook obsolète (non utilisé)
│  (GHOST CODE)       │
└─────────────────────┘
         │
         │ decreaseStock(), increaseStock()
         │ localStorage 'bar-products'
         │
         ▼
┌─────────────────────┐
│   AppContext.tsx    │ ❌ Duplication partielle
│  (LEGACY LAYER)     │
└─────────────────────┘
         │
         │ decreaseStock(), increaseStock()
         │ + addSupply (appelle increaseStock)
         │ + validateSale (appelle decreaseStock)
         │
         ▼
┌──────────────────────────┐
│ useStockManagement.ts    │ ✅ Architecture cible
│   (NEW STANDARD)         │
└──────────────────────────┘
         │
         │ increasePhysicalStock(), decreasePhysicalStock()
         │ + claimConsignment, forfeitConsignment
         │ localStorage 'bar-products'
         │
         ▼
┌──────────────────────────┐
│   COMPOSANTS CLIENTS     │
├──────────────────────────┤
│ • QuickSaleFlow.tsx      │ ✅ Utilise useStockManagement
│ • ServerInterface.tsx    │ ✅ Utilise useStockManagement
│ • ReturnsSystem.tsx      │ ✅ Utilise useStockManagement
│ • Inventory.tsx          │ ⚠️  Mélange (addSupply → AppContext)
│ • App.tsx (cart)         │ ❌ Utilise AppContext
└──────────────────────────┘
```

---

## 🎯 POINTS D'APPEL IDENTIFIÉS

### ✅ Composants déjà migrés (useStockManagement)
1. **QuickSaleFlow.tsx** (ligne 172)
   ```typescript
   decreasePhysicalStock(item.product.id, item.quantity);
   ```

2. **ServerInterface.tsx** (ligne 119)
   ```typescript
   decreasePhysicalStock(item.product.id, item.quantity);
   ```

3. **ReturnsSystem.tsx** (lignes 216, 235)
   ```typescript
   increasePhysicalStock(returnItem.productId, returnItem.quantityReturned);
   ```

### ❌ Code Legacy à migrer (AppContext)

4. **AppContext.tsx → addSupply** (ligne 226)
   ```typescript
   increaseStock(supply.productId, supply.quantity);
   ```
   **Impact:** Crée aussi une dépense automatique
   **Dépendances:** setAllSupplies, setAllExpenses

5. **AppContext.tsx → validateSale** (lignes 304-306)
   ```typescript
   saleToValidate.items.forEach(item => {
     decreaseStock(item.product.id, item.quantity);
   });
   ```
   **Impact:** Workflow serveur → gérant validation
   **Dépendances:** setAllSales, showNotification

6. **App.tsx → handleCheckout (cart)** (ligne 187)
   ```typescript
   cart.forEach(item => {
     decreaseStock(item.product.id, item.quantity);
   });
   ```
   **Impact:** Vente directe promoteur/gérant
   **Dépendances:** Cart state, addSale

### 🗑️ Code mort (useProducts.ts)
7. **useProducts.ts** (lignes 90-100)
   ```typescript
   decreaseStock(), increaseStock()
   ```
   **Status:** ❌ JAMAIS UTILISÉ (grep confirme 0 import)
   **Action:** DELETE

---

## 🚨 RISQUES IDENTIFIÉS

### 🔴 Risque #1: Double Écriture localStorage
**Problème:**
```typescript
// AppContext increaseStock écrit dans 'all-products-v1'
setAllProducts(prev => prev.map(...));

// useStockManagement écrit dans 'bar-products'
setProducts(prev => prev.map(...));
```
**Impact:** Incohérence de données, perte de stock
**Probabilité:** ⚠️ MOYENNE (2 clés différentes sauvent)

### 🔴 Risque #2: Race Conditions
**Problème:**
```typescript
// Si 2 composants modifient stock simultanément
addSupply() → increaseStock()  // AppContext
validateSale() → decreaseStock()  // AppContext
// Pas de transaction atomique !
```
**Impact:** Stock final incorrect
**Probabilité:** 🔴 ÉLEVÉE (offline sync)

### 🔴 Risque #3: addSupply Complexe
**Problème:**
```typescript
addSupply() {
  1. Créer supply
  2. increaseStock()  // ← À migrer
  3. Créer expense automatique
  4. Notifications
}
```
**Impact:** Migration délicate (3 opérations liées)
**Probabilité:** ⚠️ MOYENNE

---

## ✅ ARCHITECTURE CIBLE (EXPERT)

```
┌──────────────────────────────────────────────────────────────┐
│               ARCHITECTURE UNIFIÉE                            │
│           (Single Source of Truth)                            │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                useStockManagement.ts                         │
│              (UNIQUE POINT D'ENTRÉE)                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📦 STOCK OPERATIONS                                         │
│  ├─ increasePhysicalStock()                                 │
│  ├─ decreasePhysicalStock()                                 │
│  ├─ getProductStockInfo()                                   │
│  └─ getConsignedStockByProduct()                            │
│                                                              │
│  🏪 BUSINESS OPERATIONS (NEW)                               │
│  ├─ processSupply()         ✨ NOUVEAU                      │
│  │   └─ createSupply + increaseStock + createExpense       │
│  │                                                           │
│  ├─ processSaleValidation() ✨ NOUVEAU                      │
│  │   └─ updateSale + decreaseStock + notifications         │
│  │                                                           │
│  └─ processDirectSale()     ✨ NOUVEAU                      │
│      └─ createSale + decreaseStock                          │
│                                                              │
│  🔄 CONSIGNMENTS (EXISTANT)                                 │
│  ├─ createConsignment()                                     │
│  ├─ claimConsignment()      → decreasePhysicalStock        │
│  ├─ forfeitConsignment()    → increasePhysicalStock        │
│  └─ checkAndExpireConsignments()                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │
         │ Single localStorage: 'bar-products'
         │ (Prêt pour migration Supabase)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              AppContext.tsx (REFACTORÉ)                      │
│              (Pure Data Provider)                            │
├─────────────────────────────────────────────────────────────┤
│  ❌ SUPPRIMÉ: increaseStock, decreaseStock                  │
│  ❌ SUPPRIMÉ: addSupply (migré)                             │
│  ❌ SUPPRIMÉ: validateSale stock logic                      │
│                                                              │
│  ✅ CONSERVÉ:                                               │
│  ├─ Categories CRUD                                         │
│  ├─ Sales metadata (status, validation)                    │
│  ├─ Returns registry                                        │
│  ├─ Expenses registry                                       │
│  └─ Permissions & Auth                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 PLAN DE MIGRATION (4 PHASES)

### ✅ PHASE 1: PRÉPARATION (1h)

**1.1 Créer tests de régression**
```bash
npm run test src/hooks/useStockManagement.test.ts
```

**1.2 Documenter état actuel**
- ✅ Cartographie complète (ce document)
- ✅ Identifier tous les appels

**1.3 Backup de sécurité**
```bash
git checkout -b refactor/stock-unification
git commit -m "checkpoint: avant refactor stock"
```

---

### ✅ PHASE 2: NOUVEAUX WORKFLOWS (2-3h)

**2.1 Ajouter `processSupply` dans useStockManagement**

```typescript
// src/hooks/useStockManagement.ts

const processSupply = useCallback((
  supplyData: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId' | 'createdBy'>,
  createExpenseCallback: (expense: ExpenseData) => void
): Supply | null => {
  if (!currentBar || !session) return null;
  if (session.role !== 'promoteur' && session.role !== 'gerant') return null;

  // 1️⃣ Calculer coût total
  const totalCost = (supplyData.quantity / supplyData.lotSize) * supplyData.lotPrice;

  // 2️⃣ Créer supply
  const newSupply: Supply = {
    ...supplyData,
    id: `supply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    barId: currentBar.id,
    date: new Date(),
    totalCost,
    createdBy: session.userId
  };

  // 3️⃣ Opération atomique: supply + stock
  setSupplies(prev => [newSupply, ...prev]);
  increasePhysicalStock(supplyData.productId, supplyData.quantity);

  // 4️⃣ Callback pour expense (AppContext garde la logique expenses)
  const product = products.find(p => p.id === supplyData.productId);
  createExpenseCallback({
    category: 'supply',
    amount: totalCost,
    date: new Date(),
    description: `Approvisionnement: ${product?.name || 'Produit'} (${supplyData.quantity} unités)`,
    createdBy: session.userId,
    relatedSupplyId: newSupply.id,
  });

  return newSupply;
}, [currentBar, session, products, setSupplies, increasePhysicalStock]);
```

**Justification Architecture:**
- ✅ Stock management reste dans useStockManagement
- ✅ Expenses restent dans AppContext (séparation des responsabilités)
- ✅ Callback pattern = couplage faible
- ✅ Testable unitairement

**2.2 Ajouter `processSaleValidation` dans useStockManagement**

```typescript
const processSaleValidation = useCallback((
  saleId: string,
  saleItems: CartItem[],
  onSuccess: () => void,
  onError: (msg: string) => void
): boolean => {
  // Vérifier stock disponible AVANT validation
  for (const item of saleItems) {
    const stockInfo = getProductStockInfo(item.product.id);
    if (!stockInfo || stockInfo.availableStock < item.quantity) {
      onError(`Stock insuffisant pour ${item.product.name}`);
      return false;
    }
  }

  // Opération atomique: décrémenter tous les stocks
  saleItems.forEach(item => {
    decreasePhysicalStock(item.product.id, item.quantity);
  });

  onSuccess();
  return true;
}, [getProductStockInfo, decreasePhysicalStock]);
```

**2.3 Tests unitaires nouveaux workflows**

```typescript
// src/hooks/useStockManagement.test.ts

describe('processSupply', () => {
  it('should increase stock and trigger expense callback', () => {
    const expenseCallback = vi.fn();
    const supply = processSupply(supplyData, expenseCallback);

    expect(supply).toBeDefined();
    expect(getProductStockInfo(productId).physicalStock).toBe(initialStock + quantity);
    expect(expenseCallback).toHaveBeenCalledOnce();
  });
});

describe('processSaleValidation', () => {
  it('should reject if stock insufficient', () => {
    const onError = vi.fn();
    const result = processSaleValidation(saleId, items, noop, onError);

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Stock insuffisant'));
  });
});
```

---

### ✅ PHASE 3: MIGRATION COMPOSANTS (2-3h)

**3.1 Migrer Inventory.tsx**

```typescript
// Avant
const { addSupply } = useAppContext();

// Après
const { processSupply } = useStockManagement();
const { addExpense } = useAppContext(); // Garde expenses

const handleSupply = (supplyData) => {
  processSupply(supplyData, (expenseData) => {
    addExpense(expenseData);
  });
  setShowSupplyModal(false);
};
```

**3.2 Migrer App.tsx (cart checkout)**

```typescript
// Avant
const { addSale, decreaseStock } = useAppContext();
cart.forEach(item => decreaseStock(...));

// Après
const { processDirectSale } = useStockManagement();
const { addSale } = useAppContext(); // Garde sales registry

processDirectSale(cart, (saleData) => {
  addSale(saleData);
});
```

**3.3 Migrer AppContext validateSale**

```typescript
// Avant
const validateSale = (saleId, validatorId) => {
  setAllSales(...);
  saleToValidate.items.forEach(item => decreaseStock(...));
};

// Après
const { processSaleValidation } = useStockManagement();

const validateSale = (saleId, validatorId) => {
  const saleToValidate = allSales.find(s => s.id === saleId);

  processSaleValidation(
    saleId,
    saleToValidate.items,
    () => {
      setAllSales(prev => prev.map(s =>
        s.id === saleId ? { ...s, status: 'validated', validatedBy, validatedAt: new Date() } : s
      ));
      showNotification('success', 'Vente validée');
    },
    (error) => {
      showNotification('error', error);
    }
  );
};
```

---

### ✅ PHASE 4: NETTOYAGE & VALIDATION (1h)

**4.1 Supprimer code mort**
```bash
# Supprimer useProducts.ts (jamais importé)
rm src/hooks/useProducts.ts

# Supprimer increaseStock/decreaseStock de AppContext
```

**4.2 Tests E2E**
```bash
# Scénario 1: Vente complète
1. Créer produit (stock 50)
2. Vendre 10 (stock → 40)
3. Vérifier stock cohérent

# Scénario 2: Approvisionnement
1. Stock initial 10
2. Approvisionner 20
3. Vérifier stock → 30 ET expense créée

# Scénario 3: Consignation
1. Stock 50, vendre 10, consigner 5
2. Vérifier availableStock = 35
3. Claim → stock physique = 45
4. Forfeit → stock physique = 45 (redevient vendable)
```

**4.3 Build production**
```bash
npm run build
npm run test
npm run lint
```

---

## 🎯 MÉTRIQUES DE SUCCÈS

| Critère | Avant | Après |
|---------|-------|-------|
| **Fichiers gérant le stock** | 3 (useProducts, AppContext, useStockManagement) | 1 (useStockManagement) |
| **localStorage keys** | 2 ('bar-products', 'all-products-v1') | 1 ('bar-products') |
| **Lines of code stock logic** | ~150 lignes (dupliquées) | ~80 lignes (consolidées) |
| **Tests unitaires** | 0 | 15+ |
| **Risque race conditions** | 🔴 Élevé | ✅ Faible |
| **Prêt backend** | ❌ Non | ✅ Oui |

---

## 🔄 ROLLBACK PLAN

Si problème critique pendant migration:

```bash
# Option 1: Revert commit
git revert HEAD

# Option 2: Retour branche stable
git checkout main
git branch -D refactor/stock-unification

# Option 3: Feature flag
const USE_NEW_STOCK_SYSTEM = false; // Désactiver temporairement
```

---

## 📚 RÉFÉRENCES

- [useStockManagement.ts](src/hooks/useStockManagement.ts) - Architecture cible
- [calculations.ts](src/utils/calculations.ts) - Logique métier pure
- [LECONS_DEPLOIEMENT.md](LECONS_DEPLOIEMENT.md) - Bonnes pratiques
- [TESTING.md](TESTING.md) - Stratégie tests

---

*Document d'architecture créé le 28/10/2025*
*Auteur: Claude Code (Expert Architecture)*
