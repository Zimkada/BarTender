# Plan de Correction des Contrastes - BarTender

**Date:** 02/01/2026
**Status:** À implémenter
**Pages affectées:** 10 pages avec 90 éléments (~10 par page)

---

## 📋 Problèmes Identifiés par Lighthouse

### Pages avec problèmes de contraste (11/13):
1. HomePage - ~10 éléments
2. VentRapide - ~10 éléments
3. Dashboard - ~10 éléments
4. Inventaire - ~10 éléments
5. Historique - ~10 éléments
6. Retours - ~10 éléments (Worst case: 80/100 accessibility)
7. Consignations - ~10 éléments
8. Prévisions - ~10 éléments
9. Équipe - ~10 éléments
10. Comptabilité - ~10 éléments
11. Accounting - ~10 éléments

---

## 🎨 Combinaisons Problématiques Courantes

### Pattern 1: Texte gris clair sur blanc
```
❌ PROBLÉMATIQUE:
text-gray-400 (#9CA3AF) sur bg-white (#FFFFFF) = 2.9:1 (WCAG AA ≥ 4.5:1)
text-gray-500 (#6B7280) sur bg-white (#FFFFFF) = 4.5:1 (Limite)
text-gray-600 (#4B5563) sur bg-white (#FFFFFF) = 10.8:1 ✅

✅ SOLUTIONS:
- Darkener: gray-400 → gray-600 ou gray-700
- OU Lightener background: white → gray-50
```

### Pattern 2: Texte sur background coloré
```
❌ PROBLÉMATIQUE:
text-amber-600 sur bg-amber-500 = 2.1:1

✅ SOLUTIONS:
- text-amber-900 pour contraste fort
- OU text-white avec fond plus foncé
```

### Pattern 3: Placeholder text
```
❌ PROBLÉMATIQUE:
<input placeholder="..." class="text-gray-400" /> = 2.9:1

✅ SOLUTIONS:
- text-gray-500 minimum
- OU ajouter opacity: opacity-60 + darker base
```

---

## 🛠️ Stratégie de Fix (Par Fichier)

### 1. Header.tsx
**Problème potentiel:** Texte blanc sur orange (amber)
**Fix:**
```typescript
// AVANT:
className="text-amber-600"

// APRÈS:
className="text-amber-900"  // ou text-white
```

### 2. Pages Dashboard, Inventory, etc.
**Problème courant:** Labels et texte secondaire
**Fix Pattern:**
```typescript
// Remplacer partout:
text-gray-400 → text-gray-600
text-gray-500 → text-gray-700 (si besoin)

// Pour placeholders:
placeholder:text-gray-400 → placeholder:text-gray-500
```

### 3. Cards & Buttons
**Problème:** Texte muted sur background clair
**Fix:**
```typescript
// AVANT:
<button className="text-gray-400">Action</button>

// APRÈS:
<button className="text-gray-700">Action</button>
```

---

## 📝 Checklist de Fix

### Phase 1: Header & Navigation
- [ ] Header.tsx - Navigation links contrast
- [ ] MobileSidebar.tsx - Menu items contrast
- [ ] BarSelector.tsx - Text visibility

### Phase 2: Main Pages
- [ ] HomePage.tsx - Title & subtitle contrast
- [ ] DashboardPage.tsx - Stats card labels
- [ ] InventoryPage.tsx - Table text contrast
- [ ] SalesHistoryPage.tsx - Chart labels

### Phase 3: Secondary Pages
- [ ] SettingsPage.tsx - Form labels
- [ ] ProfilePage.tsx - User info text
- [ ] ReturnsPage.tsx - Return list text (WORST: 80/100)
- [ ] TeamManagementPage.tsx - Team member info

### Phase 4: Components
- [ ] ProductCard.tsx - Product info text
- [ ] Chart components - Axis labels
- [ ] Form components - Hint text
- [ ] Modal headers - Title contrast

---

## 🚀 Implémentation Rapide

### Option 1: Find & Replace (FAST)
```bash
# Find all problematic classes
grep -r "text-gray-400\|text-gray-500" src/ --include="*.tsx" | wc -l

# Replace in all files
find src -name "*.tsx" -exec sed -i 's/text-gray-400/text-gray-600/g' {} \;
find src -name "*.tsx" -exec sed -i 's/placeholder:text-gray-400/placeholder:text-gray-500/g' {} \;
```

### Option 2: Manual by Severity (SAFER)
1. Start with Pages (highest visibility)
2. Then Components (most reused)
3. Then Utilities (lowest priority)

### Option 3: CSS Variables (BEST)
```css
:root {
  --text-primary: #111827;      /* 19.1:1 on white */
  --text-secondary: #4B5563;    /* 8.6:1 on white */
  --text-muted: #6B7280;        /* 4.6:1 on white - MINIMUM for WCAG AA */
  --text-disabled: #9CA3AF;     /* 2.9:1 - NOT WCAG AA, avoid for body text */
}

/* Usage */
.text-muted {
  color: var(--text-muted);
}
```

---

## ⏱️ Effort Estimate

| Approach | Time | Risk | Quality |
|----------|------|------|---------|
| Find & Replace | 15 min | HIGH (could miss context) | 70% |
| Manual Auditing | 3-4h | LOW | 95% |
| CSS Variables | 2h | MEDIUM | 90% |
| Combination | 1.5-2h | LOW | 95% |

---

## 📈 Expected Impact

- **Pages fixed:** 10/11 (90%)
- **Accessibility score gain:** +2-3 points
- **WCAG AA compliance:** 100% (vs ~85% current)
- **User experience:** Better readability for low-vision users

---

## ✅ Validation

After fixing, verify:
```bash
# Run Lighthouse accessibility audit
npx lighthouse https://bar-tender-ten.vercel.app \
  --only-categories=accessibility \
  --view

# Check for "color-contrast" issues
# Should show: 0 issues (vs 90 current)
```

---

## 🎯 Recommendation

**Approach:** CSS Variables + Manual Updates
1. Create CSS variables for text colors (30 min)
2. Update Tailwind theme config (15 min)
3. Replace problematic classes in main pages (1h)
4. Verify with Lighthouse (15 min)
5. Fine-tune edge cases (30 min)

**Total Time:** ~2.5h for 95% quality
**Impact:** +2-3 Lighthouse points + Better accessibility
