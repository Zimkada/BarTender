# Plan d'Implémentation : Système de Théming Dynamique (Vision 2026)

> **Objectif :** Permettre aux promoteurs de personnaliser la couleur de leur interface (Or, Bleu, Rouge, etc.) tout en garantissant la stabilité de la production et la distinction visuelle du rôle Super Admin.

## 🛡️ Stratégie de Sécurité "Zéro Risque"
Vu que la DB est connectée à la Prod :
1. **Migration Additive Uniquement :** Ajout de colonne `NULLABLE`. Aucune modification de donnée existante.
2. **Feature Flag :** Tout le code UI sera derrière `VITE_ENABLE_THEMING` pour permettre un déploiement "OFF" par défaut.
3. **Fallback Robuste :** Si `theme_config` est vide ou invalide, l'interface retombe silencieusement sur le thème `amber` actuel (Gold).
4. **Exception Admin Hardcodée :** Le rôle `super_admin` forcera TOUJOURS le thème Indigo, indépendamment de la configuration DB.

---

## ⏱️ Timeline Réaliste

### Phase 1: Foundations (45-60 min)
- Types & Validation: 20 min
- Migration SQL: 15 min
- Tests & Validation: 15 min

### Phase 2: The Engine (2-3h)
- ThemeContext: 90 min
- Tests unitaires: 45 min
- Intégration App + Tests: 30 min

### Phase 3: The Controls (2-3h)
- ThemeSelector: 90 min
- Tests + Storybook: 45 min
- Intégration Settings: 30 min

**Total: 6-8h sur 2-3 jours**

---

## Phase 1: Foundations (Backend & Types) - 45-60 min
*Objectif : Préparer le terrain sans rien casser.*

### 1.1 Types & Validation (Zod) - 20 min
- [ ] Créer `src/types/theme.ts` :
    - [ ] Type `ThemePreset` ('amber', 'blue', 'emerald', 'rose', 'purple')
    - [ ] Interface `ThemeConfig` avec `preset` et `customColors` optionnel
    - [ ] Constante `THEME_PRESETS` (valeurs Hex pour chaque preset)
    - [ ] Constante `DEFAULT_THEME_CONFIG` (preset: 'amber')
    - [ ] Labels: `PRESET_LABELS` pour affichage UI
- [ ] Créer `src/services/theme.service.ts` :
    - [ ] Import Zod: `import { z } from 'zod'`
    - [ ] Schéma Zod `ThemeConfigSchema` avec validation regex pour hex colors
    - [ ] Fonction `validateThemeConfig(config: ThemeConfig)`
    - [ ] Fonction `updateBarTheme(barId: string, config: ThemeConfig)`

### 1.2 Migration Base de Données (Production Safe) - 15 min
- [ ] Créer fichier `migrations/add_theme_config.sql` :
```sql
BEGIN;

-- Ajouter colonne (Safe, Nullable)
ALTER TABLE bars ADD COLUMN theme_config JSONB DEFAULT NULL;

-- Index pour performance
CREATE INDEX idx_bars_theme_config ON bars USING GIN (theme_config);

-- Contrainte de schéma (autorisant NULL)
ALTER TABLE bars ADD CONSTRAINT theme_config_schema CHECK (
  theme_config IS NULL OR (
    jsonb_typeof(theme_config) = 'object' AND
    theme_config ? 'preset'
  )
);

COMMIT;
```
- [ ] **Workflow d'exécution sécurisé:**
    - [ ] Tester migration en LOCAL (Docker Postgres ou Supabase CLI)
    - [ ] Valider: `SELECT theme_config FROM bars LIMIT 1;` retourne `NULL`
    - [ ] **Backup DB Prod** sur Supabase Dashboard → Database → Backups
    - [ ] Exécuter sur Supabase PROD via SQL Editor (Dashboard)
    - [ ] Vérifier logs Supabase: Aucune erreur, colonne existe
    - [ ] Tester: Application Prod toujours fonctionnelle (aucun crash)

### 1.3 Update Types Backend - 10 min
- [ ] Mettre à jour `src/types/index.ts` (`Bar` interface) :
```typescript
export interface Bar {
  id: string;
  name: string;
  // ... autres champs
  theme_config?: string; // ⚠️ JSON stringifié, pas ThemeConfig directement
}
```
- [ ] **Note Critique:** `theme_config` est un JSON stringifié.
    - Usage: `const parsed: ThemeConfig = JSON.parse(bar.theme_config || '{}')`

### 1.4 Commit Phase 1
- [ ] Commit avec message:
```bash
feat(theme): Add backend foundation for dynamic theming

- Add ThemeConfig types with Zod validation
- Add theme_config JSONB column to bars table
- Create theme service with updateBarTheme function
- Add THEME_PRESETS (amber, blue, emerald, rose, purple)

BREAKING CHANGE: None (backward compatible)
TEST: npm test -- theme.service.test.ts
```

---

## Phase 2: The Engine (Logic Core) - 2-3h
*Objectif : Le moteur de changement de couleur, invisible pour l'instant.*

### 2.1 Utilitaires Couleur - 30 min
- [ ] Créer `src/utils/colorUtils.ts` :
    - [ ] Fonction `getContrastRatio(hex1: string, hex2: string): number`
    - [ ] Fonction `validateThemeColors(primary: string)` pour WCAG 2.1 AA (ratio 4.5:1)
    - [ ] Tests unitaires: `colorUtils.test.ts`

### 2.2 Context & Injection - 90 min
- [ ] Créer `src/context/ThemeContext.tsx` :
    - [ ] Interface `ThemeContextValue` avec toutes les méthodes
    - [ ] `ThemeProvider` wrapper avec children
    - [ ] Logique `useMemo` pour fusionner (Preview > DB Config > Default)
    - [ ] **Try-Catch autour de `JSON.parse()`** avec fallback sur DEFAULT_THEME_CONFIG
    - [ ] **Injection CSS Directe** (`document.documentElement.style.setProperty`) :
        - `--brand-primary`
        - `--brand-secondary`
        - `--brand-accent`
        - `--brand-shadow` (primary avec 25% opacity)
        - `--brand-gradient` (linear-gradient primary → secondary)
    - [ ] **Gestion `isSuperAdmin`** (Force Indigo avec priorité absolue, ignore theme_config)
    - [ ] `previewTheme(config: ThemeConfig)` (State local temporaire)
    - [ ] `resetPreview()` (Annuler aperçu)
    - [ ] `updateTheme(config: ThemeConfig)` (Sauvegarder en DB via service)
    - [ ] Hook `useTheme()` avec error si hors provider

### 2.3 Tests Unitaires - 45 min
- [ ] Créer `src/context/ThemeContext.test.tsx` :
    - [ ] Test: Fallback DEFAULT_THEME si `theme_config` NULL
    - [ ] Test: Fallback DEFAULT_THEME si JSON invalide (parsing error)
    - [ ] Test: SuperAdmin toujours Indigo (ignore `theme_config` du bar)
    - [ ] Test: Preview mode active/reset
    - [ ] Test: Multi-bar switching (Bar A: blue → Bar B: rose)
    - [ ] Test: CSS variables injection (mock document.documentElement)
    - [ ] Test: updateTheme sauvegarde en DB
    - [ ] Test: Error handling si updateTheme échoue
    - [ ] **Objectif: 9+ tests passants**

### 2.4 Intégration App - 30 min
- [ ] Créer `.env` avec `VITE_ENABLE_THEMING=false`
- [ ] Modifier `src/App.tsx` :
```typescript
import { ThemeProvider } from './context/ThemeContext';

const ENABLE_DYNAMIC_THEMING = import.meta.env.VITE_ENABLE_THEMING === 'true';

function App() {
  const ThemeWrapper = ENABLE_DYNAMIC_THEMING ? ThemeProvider : React.Fragment;

  return (
    <BarProvider>
      <ThemeWrapper>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </ThemeWrapper>
    </BarProvider>
  );
}
```
- [ ] **Vérification régression (VITE_ENABLE_THEMING=false):**
    - [ ] Lancer app: `npm run dev`
    - [ ] Vérifier CSS variables dans DevTools:
        - `--brand-primary` = `#f59e0b` (amber actuel)
        - `--brand-gradient` = gradient amber actuel
    - [ ] Tester navigation: Aucun crash, aucun warning console
    - [ ] Tester changement de bar: Thème reste amber
    - [ ] Console Sentry: 0 erreur

### 2.5 Commit Phase 2
- [ ] Commit avec message:
```bash
feat(theme): Add ThemeProvider with CSS injection

- Create ThemeProvider with useMemo optimization
- Implement direct CSS injection (zero React re-renders)
- Add SuperAdmin exception (always Indigo theme)
- Add preview mode for testing themes before save
- Add feature flag VITE_ENABLE_THEMING (default: false)

PERFORMANCE: 0ms re-render on theme change (CSS injection)
TEST: npm test -- ThemeContext.test.tsx (9/9 passing)
SAFETY: Feature flag for progressive rollout
```

---

## Phase 3: The Controls (UI) - 2-3h
*Objectif : L'interface utilisateur dans les Settings.*

### 3.1 Composant Selecteur - 90 min
- [ ] Créer `src/components/ThemeSelector.tsx` :
    - [ ] Import: `useTheme`, `THEME_PRESETS`, `PRESET_LABELS`
    - [ ] State: `isLoading` pour save action
    - [ ] Grid 3 colonnes avec 5 presets (cercles de couleur cliquables)
    - [ ] Chaque preset affiche:
        - 3 cercles couleur (primary, secondary, accent)
        - Label preset
        - Check mark si actif
    - [ ] **Debounce preview (100ms)** avec `useDebouncedCallback` pour éviter 60 updates/sec
    - [ ] Validation contraste (afficher warning si < 4.5:1)
    - [ ] Badge "Mode Aperçu Actif" avec:
        - Animation pulse
        - Bouton "Annuler" (resetPreview)
        - Bouton "Sauvegarder" (updateTheme avec loading state)
    - [ ] Error handling avec toast notification
    - [ ] Animations Framer Motion (scale on hover/click)

### 3.2 Tests & Storybook - 45 min
- [ ] Créer `src/components/ThemeSelector.test.tsx` :
    - [ ] Test: Render 5 presets
    - [ ] Test: Click preset active preview mode
    - [ ] Test: Cancel button resets preview
    - [ ] Test: Save button calls updateTheme
    - [ ] Test: Loading state during save
- [ ] Créer `src/components/ThemeSelector.stories.tsx` :
    - [ ] Story: Default (amber)
    - [ ] Story: Preview mode active (blue selected)
    - [ ] Story: Loading state

### 3.3 Intégration Settings - 30 min
- [ ] Modifier `src/pages/SettingsPage.tsx` :
    - [ ] Ajouter section "Apparence" **conditionnelle:**
```typescript
{import.meta.env.VITE_ENABLE_THEMING === 'true' && (
  <section>
    <h2>Apparence</h2>
    <p>Personnalisez les couleurs de votre interface</p>
    <ThemeSelector />
  </section>
)}
```
    - [ ] Positionner après section "Général"
    - [ ] Style cohérent avec autres sections (card, padding, border)

### 3.4 Tests Manuels - 30 min
- [ ] **Test avec flag ON en staging:**
    - [ ] Click preset "Bleu Océan" → Aperçu instantané (< 100ms)
    - [ ] Vérifier tous les éléments changent (Header, boutons, badges)
    - [ ] Click "Annuler" → Retour thème original
    - [ ] Click preset + "Sauvegarder" → Persiste après F5
    - [ ] SuperAdmin → Section "Apparence" invisible OU presets disabled
    - [ ] Multi-bar switching: thèmes différents s'appliquent correctement

### 3.5 Commit Phase 3
- [ ] Commit avec message:
```bash
feat(theme): Add theme selector UI in Settings

- Create ThemeSelector component with 5 presets
- Add live preview mode with debounce (100ms)
- Add save/cancel actions with loading states
- Integrate in SettingsPage under Appearance section
- Add Storybook stories for all states

UX: Instant visual feedback on preset click
TEST: npm test -- ThemeSelector.test.tsx
DESIGN: Follows Vision 2026 design system
```

---

## ✅ Critères de Validation Finale

### 1. Migration DB Sécurisée
```bash
# Vérifications:
SELECT theme_config FROM bars LIMIT 5;
# → Résultat: NULL pour tous les bars existants ✅

# Application Prod: Aucun crash, aucune erreur Sentry ✅
# Performance: Query time < 50ms (index GIN actif) ✅
```

### 2. Exception SuperAdmin
```bash
# Scénario de test:
1. Login en super_admin
2. DevTools: --brand-primary = #6366f1 (Indigo) ✅
3. Naviguer vers Settings → Apparence
4. Sélectionner preset "Bleu Océan"
5. DevTools: --brand-primary RESTE #6366f1 (Indigo) ✅
6. Aucun badge "Mode Aperçu" visible pour admin ✅
```

### 3. Promoteur - Changement Instantané
```bash
# Scénario de test:
1. Login en promoteur
2. DevTools: --brand-primary = #f59e0b (Amber par défaut) ✅
3. Settings → Apparence → Click "Bleu Océan"
4. Vérification instantanée (< 100ms):
   - DevTools: --brand-primary = #3b82f6 ✅
   - Header devient bleu ✅
   - Boutons deviennent bleus ✅
   - Badge "Mode Aperçu Actif" visible ✅
5. Click "Annuler" → Retour à Amber ✅
```

### 4. Persistance Après Reload
```bash
# Scénario de test:
1. Sélectionner "Bleu Océan" + Sauvegarder
2. Loading spinner pendant 500ms ✅
3. Notification success "Thème sauvegardé" ✅
4. F5 (Reload page)
5. DevTools après reload: --brand-primary = #3b82f6 (Bleu persisté) ✅
6. Vérifier DB: SELECT theme_config FROM bars WHERE id = 'xxx';
   → Résultat: {"preset":"blue"} ✅
```

### 5. Multi-Bar Switching
```bash
# Scénario de test (promoteur avec 2 bars):
1. Bar A configuré en "Bleu Océan"
2. Bar B configuré en "Rose Passion"
3. Sélectionner Bar A dans dropdown Header
4. DevTools: --brand-primary = #3b82f6 (Bleu) ✅
5. Sélectionner Bar B dans dropdown
6. DevTools: --brand-primary = #f43f5e (Rose) ✅
7. Switch rapide A → B → A → B (10x)
8. Aucun freeze, aucun flash, aucune erreur ✅
```

---

## 🚨 Plan de Rollback d'Urgence

### Si Crash en Phase 1 (Migration SQL):
1. **Rollback SQL:** `ALTER TABLE bars DROP COLUMN theme_config;`
2. **Restaurer backup** Supabase (< 5 min)
3. **Vérifier:** Application fonctionne normalement

### Si Crash en Phase 2 (ThemeProvider):
1. **Changer flag:** `VITE_ENABLE_THEMING=false` dans `.env`
2. **Redéployer frontend** (< 2 min via Vercel/Netlify)
3. **Résultat:** ThemeProvider s'ignore automatiquement, app revient au thème amber

### Si Crash en Phase 3 (UI):
1. **Commenter section "Apparence"** dans `SettingsPage.tsx`
2. **Redéployer** (< 2 min)
3. **Résultat:** ThemeProvider reste actif mais invisible, aucun impact utilisateur

### Rollback Complet (Worst Case):
```bash
# 1. Rollback Git
git revert <commit-phase-3> <commit-phase-2> <commit-phase-1>
git push origin main

# 2. Rollback DB (si nécessaire)
ALTER TABLE bars DROP COLUMN theme_config;

# Temps total: < 10 minutes
```

---

## 📊 Monitoring & Alerts Post-Déploiement

### Métriques à Surveiller (7 premiers jours):
- **Sentry:** `ThemeContext.parse_error` (doit rester 0)
- **Analytics:** `theme_changed` events (mesurer adoption)
  - Target: 20% bars changent thème en semaine 1
- **Performance:** Lighthouse score stable (> 90)
- **DB:** Query time `SELECT theme_config` (< 50ms)
- **Errors:** Taux d'erreur global stable (< 0.1%)

### Alerts Critiques:
- **Si > 10 errors `ThemeContext` en 1h** → Rollback automatique Phase 2
- **Si Lighthouse < 80** → Investigation performance immédiate
- **Si query time > 100ms** → Audit index GIN

### Dashboard Monitoring:
```typescript
// Analytics tracking à ajouter
trackEvent('theme_changed', {
  preset: themeConfig.preset,
  bar_id: currentBar?.id,
  user_role: currentSession?.role,
});

// Error tracking
Sentry.captureException(error, {
  tags: { feature: 'dynamic-theming' },
  extra: {
    theme_config: currentBar?.theme_config,
    bar_id: currentBar?.id,
  },
});
```

---

## 📝 Notes Techniques Importantes

### Gestion JSON Stringifié
```typescript
// ❌ INCORRECT
const theme: ThemeConfig = bar.theme_config; // Type error!

// ✅ CORRECT
const themeStr: string | undefined = bar.theme_config;
const theme: ThemeConfig = themeStr
  ? JSON.parse(themeStr)
  : DEFAULT_THEME_CONFIG;

// ✅ AVEC ERROR HANDLING
try {
  const theme: ThemeConfig = JSON.parse(bar.theme_config || '{}');
} catch {
  console.error('Invalid theme_config, using default');
  theme = DEFAULT_THEME_CONFIG;
}
```

### CSS Variables Performance
```typescript
// ✅ OPTIMAL: Injection directe (pas de re-render React)
document.documentElement.style.setProperty('--brand-primary', '#3b82f6');

// ❌ LENT: Re-render tout l'arbre React
<div style={{ '--brand-primary': '#3b82f6' }}>...</div>
```

### SuperAdmin Priorité Absolue
```typescript
// ThemeContext.tsx
useEffect(() => {
  if (isSuperAdmin) {
    // Force Indigo AVANT tout calcul
    injectIndigoTheme();
    return; // STOP, ignorer theme_config
  }

  // Logique normale pour autres rôles
  const theme = calculateTheme(currentBar?.theme_config);
  injectTheme(theme);
}, [isSuperAdmin, currentBar?.theme_config]);
```

---

## 🎯 Checklist Finale Avant Production

- [ ] **Tests:** 9+ tests ThemeContext.test.tsx PASSANTS
- [ ] **Tests:** ThemeSelector.test.tsx PASSANTS
- [ ] **Storybook:** Stories visibles et fonctionnelles
- [ ] **Migration:** Exécutée sur Prod, colonne existe
- [ ] **Backup:** DB Prod sauvegardée (timestamp documenté)
- [ ] **Feature Flag:** VITE_ENABLE_THEMING=false en Prod initialement
- [ ] **Monitoring:** Sentry configuré pour tracker ThemeContext errors
- [ ] **Analytics:** Events theme_changed configurés
- [ ] **Documentation:** README mis à jour (section Theming)
- [ ] **Rollback Plan:** Testé en staging
- [ ] **Validation Manuelle:** 5 critères de validation testés et ✅

---

**Auteur:** Claude Sonnet 4.5 | **Date:** 2026-01-30 | **Version:** 2.0 (Enrichie)
