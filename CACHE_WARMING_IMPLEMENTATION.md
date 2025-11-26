# Implémentation Cache Warming & UI Indicators

## ✅ Fichiers créés/modifiés

### Nouveaux fichiers :
1. **`src/hooks/useViewMonitoring.ts`** - Hooks personnalisés
   - `useCacheWarming()` - Cache warming automatique
   - `useViewFreshness()` - Surveillance de la fraîcheur
   - `useViewRefresh()` - Refresh manuel

2. **`src/components/DataFreshnessIndicator.tsx`** - Composants UI
   - `DataFreshnessIndicator` - Indicateur complet avec bouton refresh
   - `DataFreshnessIndicatorCompact` - Version compacte

### Fichiers modifiés :
3. **`src/services/supabase/analytics.service.ts`** - Méthodes ajoutées
   - `refreshAllViews()` - Rafraîchir toutes les vues
   - `refreshView()` - Rafraîchir une vue spécifique
   - `getViewFreshness()` - Vérifier la fraîcheur
   - `getViewMetrics()` - Récupérer les métriques

4. **`src/context/AppContext.tsx`** - Cache warming intégré
   - Appel automatique au démarrage de l'app

5. **`src/components/AccountingOverview.tsx`** - Import ajouté
   - Prêt pour afficher l'indicateur de fraîcheur

## 🚀 Utilisation

### Option 2 : Cache Warming (Automatique)

Le cache warming est maintenant **actif automatiquement** dans `AppProvider` :

```typescript
// Dans AppContext.tsx
const { isWarming } = useCacheWarming(true);
```

**Comportement :**
- Au démarrage de l'app, vérifie si les données sont stale (> 60 min)
- Si oui, rafraîchit toutes les vues matérialisées
- Si non, skip le refresh (économie de ressources)
- Fonctionne en arrière-plan, n'impacte pas l'UX

### Option 3 : Indicateurs UI

#### Utilisation dans un composant :

```typescript
import { DataFreshnessIndicator } from './DataFreshnessIndicator';

// Version complète avec bouton refresh
<DataFreshnessIndicator 
  viewName="daily_sales_summary"
  showRefreshButton={true}
  onRefreshComplete={() => {
    // Recharger vos données ici
    loadAnalyticsData();
  }}
/>

// Version compacte (pour header/toolbar)
<DataFreshnessIndicatorCompact 
  viewName="daily_sales_summary"
  onRefreshComplete={() => loadAnalyticsData()}
/>
```

#### Exemple d'intégration dans AccountingOverview :

```typescript
// Dans le header du composant
<div className="flex items-center justify-between">
  <h2>Comptabilité</h2>
  <DataFreshnessIndicatorCompact 
    viewName="daily_sales_summary"
    onRefreshComplete={loadAnalyticsData}
  />
</div>
```

## 📊 Composants Recommandés pour les Indicateurs

| Composant | Vue à surveiller | Emplacement suggéré |
|-----------|------------------|---------------------|
| `AccountingOverview` | `daily_sales_summary` | Header (à droite) |
| `ForecastingSystem` | `product_sales_stats` | Toolbar |
| `SalesHistory` | `top_products_by_period` | Toolbar analytics |
| `DailyDashboard` | `daily_sales_summary` | Header |
| `BarStatsModal` | `bar_stats_multi_period` | Modal header |

## 🎨 Personnalisation

### Changer le seuil de "stale"

Par défaut, les données sont considérées stale après 60 minutes. Pour changer :

```typescript
// Dans la migration 046
CREATE OR REPLACE FUNCTION get_view_freshness(p_view_name TEXT)
...
is_stale BOOLEAN = minutes_old > 30  -- Changez 60 à 30 pour 30 minutes
```

### Changer l'intervalle de vérification

```typescript
// Par défaut: vérification toutes les 60 secondes
const { freshness } = useViewFreshness('daily_sales_summary', 30000); // 30 secondes
```

## 🔧 Debugging

### Voir les logs du cache warming

```typescript
// Dans la console du navigateur
[AppProvider] Cache warming in progress...
[Cache Warming] Refreshing stale views...
[Cache Warming] ✓ Complete
```

### Vérifier manuellement la fraîcheur

```sql
-- Dans Supabase SQL Editor
SELECT * FROM get_view_freshness('daily_sales_summary');
```

### Voir l'historique des refresh

```sql
SELECT * FROM materialized_view_refresh_log 
ORDER BY refresh_started_at DESC 
LIMIT 10;
```

## ⚡ Performance

**Impact sur le démarrage :**
- Vérification des métriques : ~100-200ms
- Refresh si nécessaire : ~2-3 secondes
- **Total max : ~3 secondes** (seulement si données stale)

**Optimisation :**
Le cache warming vérifie d'abord si les données sont stale avant de rafraîchir, évitant ainsi des refresh inutiles.

## 🎯 Prochaines étapes

1. **Ajouter les indicateurs UI** dans les composants clés
2. **Tester** le cache warming au démarrage
3. **Monitorer** les logs de refresh dans Supabase
4. **Ajuster** les seuils si nécessaire

## 💡 Conseils

- Utilisez `DataFreshnessIndicatorCompact` pour les espaces réduits
- Placez les indicateurs dans les headers/toolbars pour visibilité
- Le callback `onRefreshComplete` permet de recharger les données après refresh
- Les indicateurs se mettent à jour automatiquement toutes les 60 secondes
