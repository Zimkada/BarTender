# ⚠️ Problème Critique: Incohérence Timezone & Business Day

## 🔴 Problème Identifié

L'application a une **incohérence critique** entre:
1. **SQL (Backend)**: Utilise `INTERVAL '4 hours'` (fixe)
2. **Frontend**: Utilise `businessDayCloseHour` configurable par bar (défaut: 6h)

### Impact

- **Données incorrectes** dans le tableau de bord (ventes d'hier affichées comme aujourd'hui)
- **Calculs de ventes journalières erronés**
- **Top produits montrant plusieurs jours**

## 📊 Détails Techniques

### SQL (Migrations)

**Fichiers concernés:**
- `supabase/migrations/043_create_daily_sales_summary_view.sql`
- `supabase/migrations/044_create_top_products_view.sql`
- `supabase/migrations/051_add_returns_to_daily_sales_summary.sql`

**Code SQL:**
```sql
-- PROBLÈME: Valeur codée en dur à 4h
DATE(s.created_at - INTERVAL '4 hours') AS sale_date
```

### Frontend (TypeScript)

**Fichiers concernés:**
- `src/context/AppContext.tsx` (ligne 309)
- `src/components/BarsManagementPanel.tsx` (ligne 66)
- `src/components/BarStatsModal.tsx` (ligne 116)
- `src/components/ReturnsSystem.tsx` (ligne 93)
- `src/components/SalesHistory.tsx` (ligne 70)
- `src/components/SuperAdminDashboard.tsx` (ligne 112)

**Code Frontend:**
```typescript
const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
```

## 🔧 Solution Temporaire (Appliquée)

### 1. Nouvelle fonction utilitaire

**Fichier:** `src/utils/businessDay.ts`

```typescript
/**
 * Convertit une date locale en format SQL compatible
 * Applique le décalage Business Day pour correspondre au SQL
 */
export function getBusinessDayDateString(
  date: Date = new Date(),
  closeHour: number = 4  // DOIT correspondre à INTERVAL SQL
): string {
  const businessDay = getBusinessDay(date, closeHour);
  // Format YYYY-MM-DD en local (pas UTC)
  const year = businessDay.getFullYear();
  const month = String(businessDay.getMonth() + 1).padStart(2, '0');
  const day = String(businessDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### 2. Correction DailyDashboard

**Avant:**
```typescript
const todayDateStr = new Date().toISOString().split('T')[0];  // ❌ UTC
```

**Après:**
```typescript
const sqlBusinessDayCloseHour = 4; // Correspond à INTERVAL '4 hours' SQL
const todayDateStr = getBusinessDayDateString(new Date(), sqlBusinessDayCloseHour); // ✅
```

## 🎯 Solution Définitive (Recommandée)

### Option A: Rendre SQL dynamique (Complexe)

**Avantages:**
- Respect total de la configuration par bar
- Cohérence parfaite Frontend/Backend

**Inconvénients:**
- Migration SQL complexe
- Les vues matérialisées doivent stocker `bar_id` pour filtrer
- Performance potentiellement impactée

**Implémentation:**
```sql
-- Créer une fonction qui récupère closeHour depuis bar_settings
CREATE OR REPLACE FUNCTION get_business_day(
  p_created_at TIMESTAMP,
  p_bar_id UUID
) RETURNS DATE AS $$
DECLARE
  v_close_hour INTEGER;
BEGIN
  -- Récupérer closeHour depuis settings
  SELECT (settings->>'businessDayCloseHour')::INTEGER
  INTO v_close_hour
  FROM bars
  WHERE id = p_bar_id;

  -- Par défaut 4h si non configuré
  v_close_hour := COALESCE(v_close_hour, 4);

  -- Appliquer le décalage
  RETURN DATE(p_created_at - (v_close_hour || ' hours')::INTERVAL);
END;
$$ LANGUAGE plpgsql STABLE;

-- Utiliser dans les vues
DATE(get_business_day(s.created_at, s.bar_id)) AS sale_date
```

### Option B: Standardiser à 4h (Simple) ⭐ RECOMMANDÉ

**Avantages:**
- Solution simple et immédiate
- Cohérence garantie
- Pas de migration complexe

**Inconvénients:**
- Perte de flexibilité par bar
- Doit mettre à jour l'UI Settings

**Implémentation:**

1. **Fixer `businessDayCloseHour` à 4h partout:**

```typescript
// src/context/AppContext.tsx (et tous les autres fichiers)
const closeHour = 4; // Aligné avec SQL INTERVAL '4 hours'
```

2. **Désactiver/Masquer le réglage dans Settings UI**

3. **Documentation:**
```typescript
/**
 * BUSINESS DAY CLOSE HOUR
 *
 * Valeur fixe à 4h pour cohérence avec les vues SQL matérialisées.
 * Modifier cette valeur nécessite une migration SQL complète.
 *
 * SQL: DATE(s.created_at - INTERVAL '4 hours')
 * Frontend: closeHour = 4
 */
const BUSINESS_DAY_CLOSE_HOUR = 4;
```

## 🚨 Actions Requises

### Court Terme (Urgent)

- [x] Corriger `DailyDashboard.tsx` pour utiliser `getBusinessDayDateString()`
- [ ] Vérifier tous les autres composants utilisant des dates SQL
- [ ] Ajouter tests unitaires pour `getBusinessDayDateString()`

### Moyen Terme (Important)

- [ ] **DÉCIDER:** Option A (SQL dynamique) ou Option B (Fixer à 4h)
- [ ] Implémenter la solution choisie
- [ ] Migrer toutes les données existantes si nécessaire
- [ ] Mettre à jour documentation

### Long Terme (Amélioration)

- [ ] Centraliser la configuration timezone dans un seul fichier
- [ ] Créer constante globale `BUSINESS_DAY_CLOSE_HOUR`
- [ ] Ajouter validation au démarrage (Frontend vs SQL)
- [ ] Logger des warnings si détection d'incohérence

## 📝 Notes Importantes

1. **Le problème affecte TOUTES les vues SQL matérialisées:**
   - `daily_sales_summary_mat`
   - `top_products_by_period_mat`
   - Toute nouvelle vue avec dates

2. **Les retours (returns) utilisent aussi le Business Day:**
   ```typescript
   DATE(r.returned_at - INTERVAL '4 hours')
   ```

3. **Context utilise la logique Business Day correctement:**
   - `getTodaySales()` utilise `getCurrentBusinessDay(closeHour)`
   - MAIS le `closeHour` peut différer du SQL

4. **Timezone du serveur Supabase:**
   - Par défaut UTC
   - Les timestamps sont stockés en UTC
   - La conversion locale se fait via `INTERVAL`

## 🔍 Commandes de Débogage

### Vérifier l'heure SQL actuelle:
```sql
SELECT NOW(), NOW() - INTERVAL '4 hours' AS business_day_adjusted;
```

### Vérifier les données avec décalage:
```sql
SELECT
  created_at,
  DATE(created_at) AS utc_date,
  DATE(created_at - INTERVAL '4 hours') AS business_day_date
FROM sales
ORDER BY created_at DESC
LIMIT 10;
```

### Test Frontend:
```typescript
console.log('UTC:', new Date().toISOString().split('T')[0]);
console.log('Business Day (4h):', getBusinessDayDateString(new Date(), 4));
console.log('Business Day (6h):', getBusinessDayDateString(new Date(), 6));
```

## 📚 Références

- Business Day Logic: `src/utils/businessDay.ts`
- SQL Migrations: `supabase/migrations/043_*.sql`, `044_*.sql`
- Context Implementation: `src/context/AppContext.tsx:309`
- Settings UI: `src/components/Settings.tsx` (businessDayCloseHour picker)
