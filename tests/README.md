# 🧪 Suite de Tests - Phase 5 Validation

Documentation complète des tests pour l'architecture hybride Broadcast + Realtime + Polling.

## 📊 Vue d'Ensemble

Cette suite de tests valide les Phases 1-4 de l'optimisation hybride et assure que l'architecture est prête pour la production.

### Objectifs de Validation

| Phase | Fonctionnalité | Tests | Statut |
|-------|---------------|-------|--------|
| 1-2 | SmartSync Integration | Unit + Integration | ✅ |
| 3-4 | Broadcast Integration | Unit + E2E | ✅ |
| 5 | Load Testing | K6 Load Tests | 📋 À exécuter |
| 5 | Stock Conflicts | Integration Tests | 📋 À exécuter |

---

## 🏗️ Structure des Tests

```
tests/
├── __tests__/
│   ├── services/
│   │   └── BroadcastService.test.ts      # Tests unitaires Broadcast
│   └── hooks/
│       └── useSmartSync.test.ts          # Tests unitaires SmartSync
├── integration/
│   └── stock-conflict.test.ts            # Tests conflits stock SQL
├── load/
│   ├── concurrent-sales.test.js          # Tests de charge K6
│   └── results/                          # Résultats K6 (auto-généré)
└── README.md                             # Ce fichier
```

---

## 🧪 Tests Unitaires

### 1. BroadcastService Tests

**Fichier**: `src/__tests__/services/BroadcastService.test.ts`

**Couverture**:
- ✅ Singleton pattern
- ✅ Channel creation & management
- ✅ Message broadcasting
- ✅ Query invalidation
- ✅ Error handling
- ✅ Cross-tab synchronization flow

**Exécution**:
```bash
npm run test -- BroadcastService.test.ts
```

**Métriques attendues**:
- Couverture: > 80%
- Tous les tests passent
- 0 erreurs console

### 2. useSmartSync Tests

**Fichier**: `src/__tests__/hooks/useSmartSync.test.ts`

**Couverture**:
- ✅ Hook initialization
- ✅ Sync status detection
- ✅ Broadcast + Realtime + Polling hierarchy
- ✅ Fallback behavior
- ✅ Query invalidation
- ✅ Performance optimizations

**Exécution**:
```bash
npm run test -- useSmartSync.test.ts
```

**Métriques attendues**:
- Couverture: > 80%
- Validation réduction polling: -92%
- Tous les scénarios passent

---

## 🔄 Tests d'Intégration

### Stock Conflict Tests

**Fichier**: `tests/integration/stock-conflict.test.ts`

**Scénarios**:
1. **3 utilisateurs sur dernière bouteille**
   - 1 vente réussit
   - 2 ventes échouent avec erreur stock
   - Stock final = 0 (pas de négatif)

2. **Stress test: 5 utilisateurs sur 1 bouteille**
   - Validation verrou SQL robuste
   - Performance sous charge

3. **Récupération stock après rejet vente**
   - Stock restauré correctement
   - Intégrité transactionnelle

4. **Protection stock négatif**
   - Tentative vente > stock
   - Blocage automatique

**Exécution**:
```bash
npm run test:integration -- stock-conflict
```

**Prérequis**:
- Variables d'environnement configurées:
  ```bash
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```
- Base de données accessible
- RPC `create_sale` déployé

**Résultats attendus**:
```
✅ Validation 1: Exactement 1 vente réussit (1/3)
✅ Validation 2: 2 ventes échouent (2/3)
✅ Validation 3: Erreurs liées au stock détectées
✅ Validation 4: Stock final = 0 (pas de stock négatif)
✅ Validation 5: Latence max < 1000ms
```

---

## 📈 Tests de Charge (K6)

### Concurrent Sales Load Test

**Fichier**: `tests/load/concurrent-sales.test.js`

**Configuration**:
- **Scénario 1**: Montée en charge progressive
  - 0 → 10 users (30s)
  - 10 → 20 users (1min)
  - 20 → 30 users (2min)
  - Maintien 30 users (2min)

- **Scénario 2**: Spike test
  - 0 → 50 users (10s)
  - Maintien 50 users (30s)

**Métriques Surveillées**:
- `http_req_duration`: Latence requêtes
- `http_req_failed`: Taux d'erreur
- `sales_created`: Nombre de ventes réussies
- `stock_conflicts`: Conflits détectés

**Seuils de Réussite**:
```javascript
{
  http_req_duration: ['p(95)<500'],  // 95% < 500ms
  http_req_failed: ['rate<0.01'],    // < 1% erreurs
  sales_created: ['count>500'],      // >= 500 ventes
  errors: ['rate<0.02'],             // < 2% erreurs globales
}
```

**Exécution**:
```bash
# Installation K6 (première fois)
# Windows: choco install k6
# Mac: brew install k6
# Linux: sudo snap install k6

# Exécuter le test
k6 run tests/load/concurrent-sales.test.js

# Avec variables d'environnement
k6 run -e SUPABASE_URL=https://... -e SUPABASE_ANON_KEY=... tests/load/concurrent-sales.test.js
```

**Output Attendu**:
```
📊 VALIDATION PHASE 5 - ARCHITECTURE HYBRIDE
============================================================

🚀 LATENCE:
  Moyenne: 245.32ms
  P95: 487.21ms
  Max: 982.45ms

❌ ERREURS: 0.45%

💰 VENTES:
  Créées: 687
  Échouées: 3
  Conflits: 2

🎯 VERDICT:
  Latence P95 < 500ms: ✅ PASS
  Erreurs < 1%: ✅ PASS
  Architecture: ✅ PRODUCTION READY
============================================================
```

---

## 🎯 Critères de Validation Phase 5

### Tests Unitaires (Vitest)

- [ ] BroadcastService: Tous les tests passent
- [ ] useSmartSync: Tous les tests passent
- [ ] Couverture de code: > 80% pour les modules critiques
- [ ] Aucune fuite mémoire détectée

### Tests d'Intégration

- [ ] Stock conflict: 1/3 ventes réussit (verrou SQL)
- [ ] Stock jamais négatif dans tous les scénarios
- [ ] Récupération stock après rejet fonctionne
- [ ] Realtime notifications reçues en < 2s

### Tests de Charge (K6)

- [ ] Latence P95 < 500ms avec 30 users
- [ ] Taux d'erreur < 1%
- [ ] >= 500 ventes créées pendant le test
- [ ] Système stable pendant spike à 50 users

### Performance Globale

- [ ] Réduction polling: -92% confirmée
- [ ] Sync cross-tab: 0ms latence (Broadcast)
- [ ] Sync multi-user: 100-200ms (Realtime)
- [ ] Coût estimé: ~40$/mois pour 100 bars

---

## 🚀 Exécution Complète

### Quick Start

```bash
# 1. Tests unitaires
npm run test

# 2. Tests d'intégration
npm run test:integration

# 3. Tests de charge (nécessite K6)
k6 run tests/load/concurrent-sales.test.js
```

### Configuration Environnement

Créer `.env.test`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Scripts NPM

Ajouter à `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --run",
    "test:integration": "vitest --run tests/integration",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:load": "k6 run tests/load/concurrent-sales.test.js"
  }
}
```

---

## 📊 Rapport de Tests

### Template Résultats

```markdown
# Test Report - [Date]

## Tests Unitaires
- BroadcastService: ✅ 15/15 pass
- useSmartSync: ✅ 18/18 pass
- Coverage: 87%

## Tests d'Intégration
- Stock Conflicts: ✅ 4/4 pass
- Realtime Sync: ✅ 1/1 pass

## Tests de Charge
- Users: 30 simultanés
- Latence P95: 412ms (< 500ms ✅)
- Erreurs: 0.3% (< 1% ✅)
- Ventes: 645 (>= 500 ✅)

## Verdict
✅ PRODUCTION READY
```

---

## 🐛 Débogage

### Tests Unitaires qui Échouent

```bash
# Mode watch avec debug
npm run test:watch -- --reporter=verbose

# Coverage détaillée
npm run test:coverage
```

### Tests d'Intégration qui Échouent

1. Vérifier variables d'environnement
2. Vérifier connexion Supabase
3. Vérifier RPC `create_sale` déployé
4. Consulter logs Supabase Dashboard

### Tests de Charge qui Échouent

1. Vérifier quota Supabase
2. Vérifier indexes base de données
3. Analyser logs K6: `k6 run --out json=results.json`
4. Vérifier RLS policies optimisées

---

## 📚 Ressources

- [Vitest Documentation](https://vitest.dev/)
- [K6 Documentation](https://k6.io/docs/)
- [Testing Library](https://testing-library.com/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/testing)

---

## ✅ Checklist Phase 5

- [x] Tests unitaires BroadcastService créés
- [x] Tests unitaires useSmartSync créés
- [x] Tests intégration conflits stock créés
- [x] Tests de charge K6 créés
- [ ] Tests unitaires exécutés avec succès
- [ ] Tests intégration exécutés avec succès
- [ ] Tests de charge exécutés avec succès
- [ ] Documentation résultats complétée
- [ ] Métriques validées (latence, erreurs, throughput)
- [ ] Architecture certifiée Production Ready ✅

---

**Dernière mise à jour**: 30 décembre 2025
**Phase**: 5 - Tests & Validation
**Statut**: Tests créés, exécution en attente
