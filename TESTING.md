# Testing Guide - BarTender Pro

## 🎯 Stratégie de Tests

**Approche:** Tests stratégiques minimaux (1 jour) - Focus sur logique métier pure

**Principes:**
- ✅ **Tester:** Fonctions pures sans dépendances React/Context
- ✅ **Tester:** Logique métier qui restera valable après migration backend
- ❌ **Éviter:** Hooks React, Context providers (changeront avec Supabase)
- ❌ **Éviter:** Tests d'intégration complexes (refactoring backend imminent)

## 📊 Couverture Actuelle

**Total: 103 tests** (3 fichiers de test)

| Fichier | Tests | Description |
|---------|-------|-------------|
| `businessDay.test.ts` | 10 | Logique journée commerciale (clôture caisse) |
| `BeninCurrencyService.test.ts` | 41 | Formatage/parsing devise XOF/FCFA |
| `calculations.test.ts` | 52 | Calculs métier (CA, marges, stock, profits) |

## 🚀 Commandes

```bash
# Exécuter tous les tests
npm test

# Mode watch (redémarre automatiquement)
npm test -- --watch

# Interface UI interactive
npm run test:ui

# Rapport de couverture
npm run test:coverage

# Exécuter un fichier spécifique
npm test -- businessDay.test.ts
```

## 📁 Structure Tests

```
src/
├── utils/
│   ├── businessDay.ts           # Logique journée commerciale
│   ├── businessDay.test.ts      # 10 tests
│   ├── calculations.ts          # Calculs métier purs
│   └── calculations.test.ts     # 52 tests
├── services/
│   └── currency/
│       ├── BeninCurrencyService.ts
│       └── BeninCurrencyService.test.ts  # 41 tests
└── tests/
    └── setup.ts                 # Configuration globale
```

## 🧪 Détails Modules Testés

### 1. Business Day Logic (`businessDay.test.ts`)

**Objectif:** Valider calcul journée commerciale pour bars fermant après minuit

**Fonctions testées:**
- `getBusinessDay(date, closeHour)` - Calcule journée commerciale d'une date
- `getCurrentBusinessDay(closeHour)` - Obtient journée commerciale actuelle
- `isSameDay(date1, date2)` - Compare deux dates (jour/mois/année)

**Cas testés:**
- Vente avant minuit → journée actuelle
- Vente après minuit mais avant clôture (6h) → journée précédente
- Vente après clôture (6h) → nouvelle journée
- Normalisation dates (00:00:00)
- Comparaison dates identiques/différentes

**Importance:** Critique pour comptabilité (CA calculé par journée commerciale)

---

### 2. Benin Currency Service (`BeninCurrencyService.test.ts`)

**Objectif:** Valider formatage/parsing devise béninoise (XOF/FCFA)

**Fonctions testées:**

#### Formatage (6 tests)
- `formatPrice(amount, options?)` - Formatage avec/sans symbole, séparateurs
- Support espace insécable étroite (\u202f) - standard français
- Arrondis décimales
- Grands montants (1 234 567 FCFA)

#### Parsing (6 tests)
- `parsePrice(priceString)` - Extraction montant depuis string formatée
- Gestion espaces, symboles FCFA
- Strings vides, caractères non-numériques

#### Validation (5 tests)
- `validateAmount(amount)` - Validation montants
- Rejets: négatif, NaN, Infinity
- Warnings: montants très élevés (>100M FCFA)

#### Complexité Rendu Monnaie (4 tests)
- `calculateChangeComplexity(amount)` - Décomposition billets/pièces
- Suggestions arrondis si complexité > 5

#### Options Arrondis (5 tests)
- `getRoundingOptions(price)` - Options arrondis psychologiques
- 5 FCFA, 10 FCFA, 25 FCFA, 50 FCFA, 100 FCFA
- Calcul différence et pourcentage

#### Mobile Money (4 tests)
- `isMobileMoneyCompatible(amount)` - Validation paiement mobile
- Entier positif uniquement

#### Impact Arrondis (3 tests)
- `calculateRoundingImpact(originalPrice, roundedPrice, costPrice)` - Impact marges
- Recommandations selon seuils (<2%, 2-5%, >5%)

#### Prix Suggérés (4 tests)
- `getSuggestedPrices(basePrice)` - Prix psychologiques ±20%
- Terminaisons 0, 5, 25, 50, 75, 00

#### Rapports (4 tests)
- `formatForReport(amount, options?)` - Formatage rapports
- Conversion EUR/USD optionnelle

---

### 3. Business Calculations (`calculations.test.ts`)

**Objectif:** Valider calculs métier critiques (CA, marges, stock)

**Fonctions testées (52 tests):**

#### Calculs Ventes (12 tests)
- `calculateSaleTotal(items)` - Montant total vente
- `calculateSaleCost(items, products)` - Coût total (prix achat)
- `calculateSaleProfit(items, products)` - Bénéfice (total - coût)
- `calculateProfitMargin(profit, total)` - Marge %

#### Calculs CA/Revenus (8 tests)
- `calculateRevenue(sales)` - CA brut
- `calculateRefundedReturns(returns)` - Retours remboursés
- `calculateNetRevenue(sales, returns)` - CA net (brut - retours)

#### Calculs Approvisionnements (6 tests)
- `calculateSupplyCost(lotPrice, lotSize)` - Coût total lot
- `calculateUnitCost(lotPrice, lotSize)` - Prix unitaire

#### Calculs Stock (8 tests)
- `calculateAvailableStock(physical, consigned)` - Stock vendable
- `isLowStock(current, min)` - Alerte stock faible
- `calculateStockValue(products)` - Valeur totale stock

#### Calculs Prix/Marges (8 tests)
- `calculateMarkup(sellingPrice, costPrice)` - Taux de marge (markup) %
- `calculateSellingPrice(costPrice, targetMarkup)` - Prix vente cible

#### Calculs Statistiques (4 tests)
- `calculateTotalItemsSold(sales)` - Nombre articles vendus

#### Cas Edge Testés
- Valeurs zéro
- Arrays vides
- Propriétés manquantes (costPrice undefined)
- Produits inconnus
- Marges négatives (pertes)
- Stock consigné > stock physique

---

## 🔧 Configuration

### `vitest.config.ts`
```typescript
export default mergeConfig(viteConfig, defineVitestConfig({
  test: {
    globals: true,           // describe/it/expect globaux
    environment: 'jsdom',    // Environnement DOM pour React
    setupFiles: './src/tests/setup.ts',
  },
}));
```

### `src/tests/setup.ts`
```typescript
// Mocks localStorage
const localStorageMock = { ... };

// Mock navigator.onLine
Object.defineProperty(window.navigator, 'onLine', { ... });
```

## ✅ Bonnes Pratiques

### 1. Tests Purs vs Tests d'Intégration
```typescript
// ✅ BON - Fonction pure testable
export function calculateProfit(total: number, cost: number): number {
  return total - cost;
}

// ❌ ÉVITER - Hook React (changera avec backend)
export function useProfit() {
  const { sales } = useAppContext();
  return useMemo(() => calculateProfit(...), [sales]);
}
```

### 2. Mock Data Réaliste
```typescript
const mockProducts: Product[] = [
  {
    id: 'prod1',
    name: 'Heineken',
    price: 1000,
    costPrice: 600,
    stock: 50,
    // ... autres champs requis
  },
];
```

### 3. Tests Edge Cases
```typescript
it('should handle empty array', () => {
  expect(calculateRevenue([])).toBe(0);
});

it('should handle missing costPrice', () => {
  const products = [{ ...product, costPrice: undefined }];
  expect(calculateCost(items, products)).toBe(0);
});
```

### 4. Assertions Flexibles (Narrow No-Break Space)
```typescript
// ❌ ÉVITER - Espace normale vs \u202f (Intl.NumberFormat)
expect(formatPrice(1000)).toBe('1 000 FCFA');

// ✅ BON - Flexible
const result = formatPrice(1000);
expect(result).toContain('1');
expect(result).toContain('000');
expect(result).toContain('FCFA');
```

## 🎓 Pourquoi Ces Tests ?

### Logique Métier Stable
Ces fonctions resteront valables après migration Supabase :
- Calculs CA/marges (même formules)
- Formatage XOF (spécificité Bénin)
- Journée commerciale (règle métier bar)

### Éviter Tests Éphémères
On évite de tester :
- Hooks React (refactoring backend)
- Context providers (remplacement Supabase)
- Components complexes (UI peut changer)

### ROI Maximum
103 tests stratégiques couvrant :
- Comptabilité critique (CA, bénéfices)
- Conformité locale (devise FCFA)
- Règles métier uniques (business day)

**Temps investi:** 1 jour
**Bénéfice:** Confiance dans logique métier avant backend

## 🚧 Tests NON Couverts (Volontairement)

**Raisons:** Refactoring backend imminent (migration localStorage → Supabase)

- ❌ Hooks custom (`useExpenses`, `useSalaries`, `useConsignments`)
- ❌ Context providers (`AppContext`, `NotificationsContext`)
- ❌ Components React (interactions UI)
- ❌ localStorage/IndexedDB persistence
- ❌ Service Worker/PWA features
- ❌ API calls (n'existent pas encore)

**Stratégie:** Ces tests seront écrits après architecture backend stabilisée

## 📚 Ressources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## 🔄 CI/CD (À venir)

GitHub Actions workflow suggéré :

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --run
      - run: npm run build
```

---

**Dernière mise à jour:** Session Testing Stratégiques - Octobre 2025
**Tests totaux:** 103 (businessDay: 10, BeninCurrency: 41, calculations: 52)
**Couverture:** Logique métier pure uniquement (stratégie pré-backend)
