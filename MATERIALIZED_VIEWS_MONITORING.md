# Monitoring des Vues Matérialisées

## 📊 Vue d'ensemble

La migration `046_materialized_view_monitoring.sql` implémente un système complet de monitoring et d'optimisation pour les vues matérialisées.

## ✨ Fonctionnalités

### 1. Logging des Refresh
- **Table `materialized_view_refresh_log`** : Historique complet de tous les rafraîchissements
- Tracking de la durée, nombre de lignes, statut (succès/échec)
- Identification de la source du refresh (manuel, trigger, cron, app startup)

### 2. Métriques de Performance
- **Vue `materialized_view_metrics`** : Statistiques agrégées par vue
  - Nombre de refresh réussis/échoués
  - Durée moyenne/min/max
  - Fraîcheur des données (minutes depuis dernier refresh)
  - Nombre de lignes actuel

### 3. Fonctions Utilitaires

#### `refresh_materialized_view_with_logging(view_name, triggered_by)`
Rafraîchit une vue avec logging automatique
```sql
SELECT refresh_materialized_view_with_logging('product_sales_stats', 'manual');
```

#### `refresh_all_materialized_views(triggered_by)`
Rafraîchit toutes les vues dans le bon ordre
```sql
SELECT * FROM refresh_all_materialized_views('app_startup');
```

#### `get_view_freshness(view_name)`
Vérifie la fraîcheur d'une vue
```sql
SELECT * FROM get_view_freshness('daily_sales_summary');
```

#### `cleanup_old_refresh_logs()`
Nettoie les logs de plus de 30 jours
```sql
SELECT cleanup_old_refresh_logs();
```

## 🔄 Configuration pg_cron (Optionnel)

### Activation dans Supabase

1. Aller dans **Database > Extensions**
2. Activer `pg_cron`

### Configuration des Jobs

```sql
-- Refresh automatique toutes les heures
SELECT cron.schedule(
  'refresh-materialized-views-hourly',
  '0 * * * *',
  $$SELECT refresh_all_materialized_views('cron')$$
);

-- Nettoyage quotidien des logs
SELECT cron.schedule(
  'cleanup-refresh-logs-daily',
  '0 3 * * *',
  $$SELECT cleanup_old_refresh_logs()$$
);
```

### Gestion des Jobs

```sql
-- Lister tous les jobs
SELECT * FROM cron.job;

-- Voir l'historique d'exécution
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;

-- Désactiver un job
SELECT cron.unschedule('refresh-materialized-views-hourly');
```

## 📱 Intégration Frontend

### 1. Afficher la Fraîcheur des Données

```typescript
// Dans AnalyticsService
export const AnalyticsService = {
  async getViewFreshness(viewName: string) {
    const { data, error } = await supabase
      .rpc('get_view_freshness', { p_view_name: viewName });
    
    if (error) throw error;
    return data[0];
  },

  async getAllMetrics() {
    const { data, error } = await supabase
      .from('materialized_view_metrics')
      .select('*');
    
    if (error) throw error;
    return data;
  }
};
```

### 2. Composant de Monitoring (Exemple)

```typescript
function DataFreshnessIndicator({ viewName }: { viewName: string }) {
  const [freshness, setFreshness] = useState<any>(null);

  useEffect(() => {
    const checkFreshness = async () => {
      const data = await AnalyticsService.getViewFreshness(viewName);
      setFreshness(data);
    };
    checkFreshness();
  }, [viewName]);

  if (!freshness) return null;

  const isStale = freshness.is_stale;
  const minutesOld = Math.round(freshness.minutes_old);

  return (
    <div className={`text-xs ${isStale ? 'text-amber-600' : 'text-gray-500'}`}>
      {isStale && '⚠️ '}
      Données mises à jour il y a {minutesOld} min
    </div>
  );
}
```

### 3. Bouton de Refresh Manuel

```typescript
function ManualRefreshButton({ viewName }: { viewName: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await supabase.rpc('refresh_materialized_view_with_logging', {
        p_view_name: viewName,
        p_triggered_by: 'manual'
      });
      // Recharger les données
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button onClick={handleRefresh} disabled={isRefreshing}>
      {isRefreshing ? 'Rafraîchissement...' : '🔄 Actualiser'}
    </button>
  );
}
```

## 🚀 Cache Warming au Démarrage

### Option 1: Dans App.tsx

```typescript
useEffect(() => {
  const warmCache = async () => {
    try {
      await supabase.rpc('refresh_all_materialized_views', {
        p_triggered_by: 'app_startup'
      });
      console.log('Cache warmed successfully');
    } catch (error) {
      console.error('Cache warming failed:', error);
    }
  };

  // Warmer le cache seulement si les données sont stales
  const checkAndWarm = async () => {
    const metrics = await AnalyticsService.getAllMetrics();
    const hasStaleData = metrics.some(m => m.minutes_since_last_refresh > 60);
    
    if (hasStaleData) {
      warmCache();
    }
  };

  checkAndWarm();
}, []);
```

### Option 2: Refresh Sélectif

```typescript
// Rafraîchir seulement les vues nécessaires
const warmCriticalViews = async () => {
  const criticalViews = ['daily_sales_summary', 'product_sales_stats'];
  
  for (const view of criticalViews) {
    const freshness = await AnalyticsService.getViewFreshness(view);
    if (freshness.is_stale) {
      await supabase.rpc('refresh_materialized_view_with_logging', {
        p_view_name: view,
        p_triggered_by: 'app_startup'
      });
    }
  }
};
```

## 📈 Monitoring Dashboard (Bonus)

### Requêtes Utiles

```sql
-- Vue d'ensemble des performances
SELECT * FROM materialized_view_metrics;

-- Historique des refresh des dernières 24h
SELECT 
  view_name,
  refresh_started_at,
  duration_ms,
  row_count,
  status,
  triggered_by
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '24 hours'
ORDER BY refresh_started_at DESC;

-- Identifier les vues lentes
SELECT 
  view_name,
  AVG(duration_ms) as avg_duration,
  MAX(duration_ms) as max_duration
FROM materialized_view_refresh_log
WHERE status = 'completed'
  AND refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name
ORDER BY avg_duration DESC;

-- Taux de succès par vue
SELECT 
  view_name,
  COUNT(*) FILTER (WHERE status = 'completed') as success_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as success_rate_percent
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name;
```

## ⚙️ Configuration Recommandée

### Production
- **pg_cron**: Refresh toutes les heures
- **Cache warming**: Au démarrage de l'app
- **Monitoring**: Dashboard avec métriques en temps réel
- **Alertes**: Notification si refresh échoue > 3 fois

### Développement
- **Refresh manuel**: Via boutons dans l'UI
- **Pas de pg_cron**: Pour éviter la charge inutile
- **Logging**: Activé pour debugging

## 🎯 Bénéfices

1. **Visibilité** : Savoir exactement quand les données ont été rafraîchies
2. **Performance** : Identifier les vues lentes à optimiser
3. **Fiabilité** : Détecter les échecs de refresh rapidement
4. **UX** : Afficher la fraîcheur des données aux utilisateurs
5. **Automatisation** : Refresh automatique via pg_cron
6. **Optimisation** : Cache warming pour démarrage rapide

## 📝 Notes

- Les logs sont automatiquement nettoyés après 30 jours
- Le refresh concurrent évite le blocage des requêtes
- Toutes les fonctions sont sécurisées avec `SECURITY DEFINER`
- Les permissions RLS s'appliquent aux vues de monitoring
