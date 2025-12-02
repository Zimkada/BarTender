# Analyse de Risque - Refactorisation Logique de Dates

> **Date**: 2025-12-01  
> **Refactorisation**: Centralisation de la logique de filtrage de dates  
> **Niveau de risque global**: 🟡 MODÉRÉ

---

## 📊 Évaluation des Risques

### 🔴 Risques CRITIQUES (Aucun)
*Aucun risque critique identifié pour cette refactorisation*

### 🟠 Risques ÉLEVÉS

#### 1. Différence de Comportement (Probabilité: 30%, Impact: Élevé)
**Problème**: Les calculs de dates peuvent avoir des subtilités différentes entre les implémentations actuelles

**Exemple concret**:
```typescript
// Version 1 (SalesHistory ligne 194-201)
const currentDay = today.getDay();
const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
monday.setHours(0, 0, 0, 0);  // ✅ Minuit

// Version 2 (hypothétique ailleurs)
const monday = startOfWeek(today);
monday.setHours(6, 0, 0, 0);  // ❌ 6h du matin (business day)
```

**Mitigation**:
- ✅ Créer des tests unitaires avec des cas limites
- ✅ Comparer les résultats avant/après sur données réelles
- ✅ Garder l'ancien code en commentaire temporairement

---

#### 2. Fuseaux Horaires (Probabilité: 20%, Impact: Élevé)
**Problème**: Les calculs de dates peuvent être affectés par le fuseau horaire du navigateur

**Exemple**:
```typescript
// Utilisateur au Bénin (UTC+1)
new Date('2025-12-01').getDay() // Peut varier selon l'heure locale

// Avec business day close hour à 6h
// Une vente à 5h59 = jour précédent
// Une vente à 6h01 = jour actuel
```

**Mitigation**:
- ✅ Utiliser systématiquement `closeHour` dans tous les calculs
- ✅ Tester avec différents fuseaux horaires
- ✅ Documenter le comportement attendu

---

### 🟡 Risques MOYENS

#### 3. Dépendances Cachées (Probabilité: 40%, Impact: Moyen)
**Problème**: D'autres composants peuvent dépendre du comportement actuel

**Zones à vérifier**:
```bash
# Chercher tous les usages de filtrage de dates
grep -r "getBusinessDay\|getCurrentBusinessDay" src/
grep -r "timeRange.*week\|timeRange.*month" src/
grep -r "customRange" src/
```

**Mitigation**:
- ✅ Faire un grep exhaustif avant de commencer
- ✅ Migration progressive (un composant à la fois)
- ✅ Tests de régression sur tous les composants

---

#### 4. État Local vs Props (Probabilité: 30%, Impact: Moyen)
**Problème**: Les composants peuvent avoir des états locaux qui interfèrent

**Exemple**:
```typescript
// Composant A utilise son propre closeHour
const [closeHour] = useState(6);

// Composant B utilise celui du bar
const closeHour = currentBar?.closingHour ?? 6;

// Après centralisation, lequel utiliser ?
```

**Mitigation**:
- ✅ Standardiser la source de `closeHour` (toujours depuis `currentBar`)
- ✅ Documenter la source de vérité
- ✅ Ajouter des warnings si incohérence

---

### 🟢 Risques FAIBLES

#### 5. Performance (Probabilité: 10%, Impact: Faible)
**Problème**: La centralisation pourrait créer des re-calculs inutiles

**Mitigation**:
- ✅ Utiliser `useMemo` dans les hooks
- ✅ Mesurer les performances avant/après
- ✅ Optimiser si nécessaire

---

## 🛡️ Stratégie de Mitigation Globale

### 1️⃣ Tests de Régression (OBLIGATOIRE)

```typescript
// src/utils/__tests__/dateRangeCalculators.test.ts
describe('getWeekRange', () => {
  it('should return Monday to Sunday for any day of the week', () => {
    // Mercredi 2025-12-03
    const wednesday = new Date('2025-12-03T12:00:00');
    const { start, end } = getWeekRange(wednesday);
    
    expect(start.getDay()).toBe(1); // Lundi
    expect(end.getDay()).toBe(0); // Dimanche
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });
  
  it('should handle Sunday correctly (edge case)', () => {
    const sunday = new Date('2025-12-07T12:00:00');
    const { start, end } = getWeekRange(sunday);
    
    // Le dimanche doit pointer vers le lundi PRÉCÉDENT
    expect(start.getDate()).toBe(1); // Lundi 1er décembre
    expect(end.getDate()).toBe(7); // Dimanche 7 décembre
  });
  
  it('should handle business day boundary', () => {
    // Vente à 5h59 = jour précédent
    // Vente à 6h01 = jour actuel
    const beforeClose = new Date('2025-12-01T05:59:00');
    const afterClose = new Date('2025-12-01T06:01:00');
    
    const bd1 = getBusinessDay(beforeClose, 6);
    const bd2 = getBusinessDay(afterClose, 6);
    
    expect(bd1.getDate()).toBe(30); // 30 novembre
    expect(bd2.getDate()).toBe(1);  // 1er décembre
  });
});
```

### 2️⃣ Comparaison Avant/Après (OBLIGATOIRE)

```typescript
// Script de validation
// scripts/validate-date-refactoring.ts
import { sales, returns, consignments } from './test-data';

// Ancienne logique (copie exacte du code actuel)
function oldWeekFilter(items: any[], closeHour: number) {
  const today = new Date();
  const currentDay = today.getDay();
  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
  const monday = new Date();
  monday.setDate(monday.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return items.filter(item => {
    const date = new Date(item.createdAt);
    return date >= monday && date <= sunday;
  });
}

// Nouvelle logique
function newWeekFilter(items: any[], closeHour: number) {
  const { start, end } = getWeekRange();
  return filterByDateRange(items, start, end);
}

// Comparaison
const oldResult = oldWeekFilter(sales, 6);
const newResult = newWeekFilter(sales, 6);

console.log('Old count:', oldResult.length);
console.log('New count:', newResult.length);
console.log('Match:', oldResult.length === newResult.length);

// Vérifier que ce sont exactement les mêmes IDs
const oldIds = new Set(oldResult.map(s => s.id));
const newIds = new Set(newResult.map(s => s.id));
const diff = [...oldIds].filter(id => !newIds.has(id));

if (diff.length > 0) {
  console.error('❌ DIFFÉRENCE DÉTECTÉE:', diff);
} else {
  console.log('✅ Résultats identiques');
}
```

### 3️⃣ Migration Progressive (RECOMMANDÉ)

```typescript
// Étape 1: Créer les utilitaires SANS toucher au code existant
// ✅ utils/dateRangeCalculators.ts créé

// Étape 2: Ajouter les tests
// ✅ Tests passent

// Étape 3: Migrer UN SEUL composant (le plus simple)
// ✅ AppContext.tsx migré
// ✅ Tests manuels OK

// Étape 4: Migrer le suivant
// ✅ SalesHistory (consignations) migré
// ✅ Tests manuels OK

// Étape 5: Migrer le dernier
// ✅ SalesHistory (top produits) migré
// ✅ Tests manuels OK

// Étape 6: Cleanup (supprimer l'ancien code)
```

### 4️⃣ Feature Flag (OPTIONNEL mais RECOMMANDÉ)

```typescript
// config/features.ts
export const FEATURES = {
  USE_CENTRALIZED_DATE_LOGIC: true, // Toggle pour rollback rapide
};

// Usage
function filterConsignments() {
  if (FEATURES.USE_CENTRALIZED_DATE_LOGIC) {
    // Nouvelle logique
    return newDateFilter(items);
  } else {
    // Ancienne logique (backup)
    return oldDateFilter(items);
  }
}
```

---

## ✅ Checklist de Sécurité

### Avant de Commencer
- [ ] Créer une branche Git: `git checkout -b refactor/centralize-date-logic`
- [ ] Commit de l'état actuel: `git commit -m "Snapshot avant refactorisation"`
- [ ] Identifier TOUS les endroits de duplication (grep)
- [ ] Créer les tests de régression

### Pendant l'Implémentation
- [ ] Créer les utilitaires avec tests unitaires
- [ ] Vérifier que les tests passent (100% coverage)
- [ ] Migrer UN composant à la fois
- [ ] Tester manuellement après chaque migration
- [ ] Comparer les résultats avant/après

### Après l'Implémentation
- [ ] Tests manuels complets (tous les timeRange)
- [ ] Vérifier les cas limites (dimanche, minuit, 6h du matin)
- [ ] Tester avec différentes dates (début/fin de mois, année)
- [ ] Code review par un pair
- [ ] Déployer en staging
- [ ] Monitoring pendant 24h
- [ ] Merge en production

---

## 🎯 Scénarios de Test Obligatoires

### 1. Filtrage "Aujourd'hui"
```typescript
// Cas 1: Vente à 5h59 (avant closeHour)
const sale1 = { createdAt: '2025-12-01T05:59:00', total: 1000 };
// Doit être comptée dans le jour PRÉCÉDENT (30 nov)

// Cas 2: Vente à 6h01 (après closeHour)
const sale2 = { createdAt: '2025-12-01T06:01:00', total: 2000 };
// Doit être comptée dans le jour ACTUEL (1er déc)
```

### 2. Filtrage "Semaine"
```typescript
// Cas 1: Aujourd'hui = Dimanche
// Doit retourner Lundi-Dimanche de la semaine EN COURS

// Cas 2: Aujourd'hui = Lundi
// Doit retourner Lundi-Dimanche de la semaine EN COURS

// Cas 3: Aujourd'hui = Mercredi
// Doit retourner Lundi-Dimanche de la semaine EN COURS
```

### 3. Filtrage "Mois"
```typescript
// Cas 1: 1er du mois
// Cas 2: 15 du mois
// Cas 3: Dernier jour du mois (28, 29, 30, 31)
// Cas 4: Février (année bissextile)
```

### 4. Filtrage "Personnalisé"
```typescript
// Cas 1: Même jour (start === end)
// Cas 2: Plusieurs mois
// Cas 3: Année complète
```

---

## 🚨 Signaux d'Alerte

### ⚠️ Arrêter immédiatement si :
1. Les tests de comparaison montrent des différences
2. Les compteurs de ventes changent après migration
3. Les graphiques analytics affichent des données différentes
4. Les utilisateurs reportent des incohérences

### 🔄 Rollback Plan
```bash
# Si problème détecté
git checkout main
git branch -D refactor/centralize-date-logic

# Ou avec feature flag
FEATURES.USE_CENTRALIZED_DATE_LOGIC = false
```

---

## 📈 Métriques de Succès

### Avant Refactorisation
- Lignes de code dupliquées: ~150
- Endroits à maintenir: 3+
- Couverture de tests: 0%

### Après Refactorisation
- Lignes de code: ~50 (-66%)
- Endroits à maintenir: 1 (-66%)
- Couverture de tests: 100%
- Bugs introduits: 0 ✅

---

## 🎓 Conclusion

### Niveau de Risque: 🟡 MODÉRÉ

**Pourquoi MODÉRÉ et pas FAIBLE ?**
- Logique métier critique (calculs financiers)
- Multiples endroits à migrer
- Cas limites complexes (fuseaux horaires, business day)

**Pourquoi pas ÉLEVÉ ?**
- Pas de modification de base de données
- Pas de changement d'API
- Logique isolée (frontend uniquement)
- Rollback facile

### Recommandation Finale

✅ **OUI, vous pouvez commencer** MAIS avec ces conditions :

1. **Créer les tests AVANT** de toucher le code
2. **Migrer progressivement** (1 composant à la fois)
3. **Comparer les résultats** avant/après sur données réelles
4. **Tester en staging** avant production
5. **Avoir un plan de rollback** prêt

### Temps Estimé
- Préparation + Tests: 2-3 heures
- Implémentation: 3-4 heures
- Validation: 1-2 heures
- **Total: 6-9 heures**

### Bénéfices vs Risques
- **Bénéfices**: Code plus maintenable, moins de bugs futurs, DRY
- **Risques**: Bugs temporaires si mal fait
- **Verdict**: ✅ **Bénéfices >> Risques** (avec mitigation appropriée)

---

*Document créé le 2025-12-01 | Analyse de risque pour refactorisation logique de dates*
