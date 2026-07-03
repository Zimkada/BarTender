# BarTender Design System - Roadmap

## ✅ Phase 1-4: Complétées

### Phase 1: Fondations CSS ✅
- [x] Variables CSS (HSL) dans `src/index.css`
- [x] Configuration Tailwind avec mapping des variables
- [x] Build validé sans erreurs

### Phase 2: Composant Button ✅
- [x] Refactorisation de tous les `<button>` natifs
- [x] Intégration dans Header, pages, composants
- [x] Vérification: aucune régression CSS

### Phase 3: Documentation Storybook ✅
- [x] Alert.stories.tsx (9 stories)
- [x] Textarea.stories.tsx (7 stories)
- [x] Checkbox.stories.tsx (6 stories)
- [x] Radio.stories.tsx (5 stories)
- [x] Select.stories.tsx (17 stories - existant)
- [x] Card.stories.tsx (12 stories - existant)
- [x] Storybook fonctionnel sur http://localhost:6006/

### Phase 4: Composant Select ✅
- [x] Remplacement de 15+ `<select>` natifs dans 11 fichiers
- [x] API cohérente avec options array
- [x] Build validé, aucune régression

**Total lignes de code: +143 / -180 (code plus propre)**

---

## 🚀 Phase 5: Refactorisation Card (FUTUR)

### Objectif
Remplacer les divs "card-like" (`bg-white rounded-xl`) par le composant Card du Design System pour uniformiser l'apparence visuelle de l'application.

### État actuel
- ✅ Composant Card existe et fonctionne (`src/components/ui/Card.tsx`)
- ✅ Documentation Storybook complète (12 stories + exemples BarTender)
- ⚠️ **~60 divs card-like dans 29 fichiers** à refactoriser

### Portée estimée
```
Fichiers identifiés (29):
- features/Sales/SalesHistory/views/*.tsx (3 fichiers)
- components/analytics/*.tsx (2 fichiers)
- components/*.tsx (13 fichiers)
- pages/*.tsx (11 fichiers)

Total: ~60 divs à remplacer
Temps estimé: 2-3 heures de travail minutieux
```

### Priorisation recommandée
**Option A: Refactorisation progressive** ⭐ RECOMMANDÉ
1. **Batch 1 - Pages principales** (30min)
   - HomePage.tsx
   - DailyDashboard.tsx
   - InventoryPage.tsx

2. **Batch 2 - Composants réutilisés** (45min)
   - ProductCard.tsx
   - GlobalProductList.tsx
   - CategoryFilter.tsx

3. **Batch 3 - Pages analytics** (45min)
   - AnalyticsView.tsx
   - TopProductsChart.tsx
   - AccountingOverview.tsx

4. **Batch 4 - Reste** (30min)
   - Tous les autres fichiers restants

**Option B: Refactorisation complète** (déconseillé)
- Tout d'un coup (2-3h)
- Risque de régression plus élevé

### Risques et mitigation
❌ **Risques**:
- Casser des layouts spécifiques qui dépendent de paddings/margins personnalisés
- Régressions visuelles subtiles
- Conflits avec animations Framer Motion existantes

✅ **Mitigation**:
- Tester visuellement après chaque batch
- Commit après chaque groupe de fichiers
- Utiliser `padding="none"` pour les layouts custom
- Préserver les className personnalisées via `cn()`

### API du composant Card
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/Card';

// Variantes disponibles
<Card variant="default" | "elevated" | "outline" | "ghost">
<Card padding="none" | "sm" | "default" | "lg">

// Pattern avant
<div className="bg-white rounded-xl p-4 border border-amber-100">
  <h3 className="font-semibold">Title</h3>
  <p>Content</p>
</div>

// Pattern après
<Card variant="elevated" padding="sm" className="border-amber-100">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Content</p>
  </CardContent>
</Card>
```

### Commande pour lancer
```bash
# Identifier les occurrences
rg "bg-white.*rounded-xl|rounded-xl.*bg-white" -g "*.tsx" -g "*.ts" -c

# Voir le contexte
rg "bg-white.*rounded-xl" -g "*.tsx" -A 5 -B 2
```

---

## 📋 Phase 6: Autres composants potentiels (OPTIONNEL)

### Composants manquants du Design System

#### 1. **Badge** ⚠️ À vérifier
- [ ] Vérifier si Badge.tsx existe
- [ ] Créer Badge.stories.tsx si nécessaire
- [ ] Refactoriser les spans avec badges custom

#### 2. **Modal/Dialog** ⚠️ Nombreuses implémentations custom
- [ ] Analyser les patterns de modals existants
- [ ] Créer un composant Dialog unifié
- [ ] Remplacer les modals Framer Motion custom

#### 3. **Input** ⚠️ Inputs natifs dans forms
- [ ] Créer Input.tsx avec variants
- [ ] Créer Input.stories.tsx
- [ ] Refactoriser les `<input>` natifs

#### 4. **Toast/Notification**
- [ ] Système de notifications unifié
- [ ] Remplacer les alerts custom

#### 5. **Tabs**
- [ ] Composant Tabs avec Radix UI
- [ ] Remplacer les tabs custom (SettingsPage, etc.)

---

## 🎯 Principes du Design System

### 1. Cohérence visuelle
- Toujours utiliser les composants du Design System
- Éviter les styles inline sauf cas exceptionnels
- Préférer les variants aux className custom

### 2. Accessibilité
- Utiliser Radix UI primitives (déjà fait pour Select, Alert, Checkbox, Radio)
- Support clavier complet
- ARIA labels appropriés

### 3. Maintenabilité
- Un seul endroit pour modifier le style (composant + stories)
- Documentation Storybook à jour
- Tests visuels facilités

### 4. Performance
- class-variance-authority pour génération CSS optimisée
- Pas de CSS-in-JS runtime
- Tree-shaking avec Tailwind JIT

---

## 📊 Métriques de succès

### Couverture actuelle
- ✅ Button: 100% (tous les buttons refactorisés)
- ✅ Select: 100% (tous les selects refactorisés)
- ⏳ Card: 0% (composant existe, pas utilisé)
- ❓ Badge: À déterminer
- ❓ Input: À déterminer
- ❓ Modal: À déterminer

### Objectif final
- 🎯 95%+ des composants UI utilisent le Design System
- 🎯 Storybook documentation complète (tous composants)
- 🎯 0 warnings CSS dans le build
- 🎯 Cohérence visuelle totale

---

## 🔧 Commandes utiles

```bash
# Lancer Storybook
npm run storybook

# Build de production
npm run build

# Chercher les patterns à refactoriser
rg "className=\".*bg-white.*rounded" -g "*.tsx" -g "*.ts"

# Compter les occurrences
rg "<select" -g "*.tsx" -g "*.ts" -c
```

---

## 📝 Notes de migration

### Commits créés
1. `c3625a0` - feat: Add Design System CSS variables and Tailwind configuration
2. `69eaada` - fix: Add missing tabs configuration in SettingsPage
3. `57cd482` - fix: Remove CSP violations in SuperAdminPage
4. `1f29e4c` - refactor: Integrate Design System Button component across pages
5. `bd49791` - docs: Add Storybook stories for Alert, Textarea, Checkbox, and Radio
6. `13fa2dc` - refactor: Replace all native <select> elements with Design System Select component

### Fichiers modifiés (Phase 1-4)
- 11 fichiers refactorisés (Select)
- 7+ fichiers refactorisés (Button)
- 5 nouveaux fichiers stories
- Configuration: index.css, tailwind.config.js

---

**Dernière mise à jour**: 2025-12-10
**Statut**: Phase 1-4 complétées, Phase 5 en attente
