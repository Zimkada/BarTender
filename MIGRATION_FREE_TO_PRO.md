# Guide Migration Supabase Free → Pro

**Date** : À exécuter lors du passage à Supabase Pro
**Durée estimée** : 15 minutes
**Impact** : Zéro downtime
**Objectif** : Activer pg_cron pour automatisation complète

---

## 📋 **Prérequis**

- ✅ Compte Supabase Pro activé (25$/mois)
- ✅ Toutes les migrations SQL Phase 3 appliquées
- ✅ Dashboard `/admin/security` fonctionnel
- ✅ Vercel Cron désactivable (si utilisé en Free tier)

---

## 🎯 **Pourquoi Passer à Pro Maintenant ?**

### Limites Free Tier vs Besoins Production (10+ bars)

| Métrique | Free Limit | Besoins (10 bars) | Statut |
|----------|------------|-------------------|--------|
| **Database size** | 500 MB | ~200-300 MB | ⚠️ Croissance rapide |
| **Bandwidth** | 5 GB/mois | ~3-4 GB/mois | ⚠️ Limite proche |
| **Queries** | 500k/mois | ~180k/mois (optimisé) | ✅ OK grâce Phase 3 |
| **pg_cron** | ❌ Non disponible | **CRITIQUE** pour 1000+ ventes/jour | 🔴 **BLOQUANT** |
| **Refresh MV** | Manuel (2-3x/jour) | Auto (toutes les 5min) | 🔴 **ESSENTIEL** |

### ROI du passage Pro

**Sans Pro (Free tier)** :
- Refresh manuel 3x/jour = **Données obsolètes 4-8h**
- Dashboard admin montre stats périmées
- Risque perte visibilité sur 1000+ ventes/jour
- **Performance perçue : Mauvaise** ❌

**Avec Pro ($25/mois)** :
- Refresh auto toutes les 5 min
- Latence max : **5 minutes**
- Dashboard temps réel
- Zero maintenance manuelle
- **Performance perçue : Excellente** ✅

---

## 🚀 **Étapes de Migration**

### **Étape 1 : Upgrade Supabase à Pro**

1. Aller sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionner votre projet BarTender
3. **Settings** > **Billing**
4. Cliquer sur **Upgrade to Pro** ($25/mois)
5. Confirmer le paiement

**Vérification** :
```sql
-- Vérifier plan actuel
SELECT current_setting('server_version');
-- Si Pro: compute_instance doit être 'Pro'
```

---

### **Étape 2 : Activer l'Extension pg_cron**

1. Aller sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionner votre projet
3. **Database** > **Extensions**
4. Chercher `pg_cron`
5. Cliquer sur **Enable**

**Vérification** :
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- Devrait retourner 1 ligne avec extversion
```

---

### **Étape 3 : Configurer les 6 Jobs pg_cron**

**Copier-coller ce SQL complet dans Supabase Dashboard > SQL Editor** :

```sql
-- =====================================================
-- Configuration pg_cron - 6 Jobs Automatiques
-- Phase 3 Optimisation - Production Ready
-- =====================================================

-- Job 1 : Refresh bars_with_stats toutes les 5 minutes
-- Utilise safe_refresh_materialized_view avec timeout 30s
SELECT cron.schedule(
  'refresh-bars-stats',
  '*/5 * * * *',
  $$SELECT refresh_bars_with_stats()$$
);

-- Job 2 : Cleanup bar_activity toutes les 5 minutes
-- Recalcule compteurs activity_score pour 7 derniers jours
SELECT cron.schedule(
  'cleanup-bar-activity',
  '*/5 * * * *',
  $$SELECT cleanup_bar_activity()$$
);

-- Job 3 : Détecter échecs refresh consécutifs (toutes les 10min)
-- Crée alertes si 3+ échecs consécutifs détectés
SELECT cron.schedule(
  'detect-refresh-failures',
  '*/10 * * * *',
  $$SELECT create_or_update_failure_alerts()$$
);

-- Job 4 : Cleanup refresh logs quotidien (3h du matin)
-- Supprime logs > 30 jours
SELECT cron.schedule(
  'cleanup-refresh-logs',
  '0 3 * * *',
  $$SELECT cleanup_old_refresh_logs()$$
);

-- Job 5 : Cleanup RLS violations quotidien (4h du matin)
-- Supprime violations > 90 jours
SELECT cron.schedule(
  'cleanup-rls-violations',
  '0 4 * * *',
  $$SELECT cleanup_old_rls_violations()$$
);

-- Job 6 : Cleanup refresh alerts hebdomadaire (dimanche 4h)
-- Supprime alertes résolues > 90 jours
SELECT cron.schedule(
  'cleanup-refresh-alerts',
  '0 4 * * 0',
  $$SELECT cleanup_old_refresh_alerts()$$
);
```

**Note** : L'expiration des ventes en attente est gérée côté frontend (voir [PENDING_SALES_EXPIRATION.md](PENDING_SALES_EXPIRATION.md)) pour s'adapter automatiquement au `closingHour` de chaque bar.

**Vérifier que les jobs sont actifs** :
```sql
SELECT
  jobid,
  schedule,
  command,
  active,
  nodename
FROM cron.job
ORDER BY jobid;
```

**Résultat attendu** : 6 lignes avec `active = true`

---

### **Étape 4 : Désactiver Vercel Cron (Si Utilisé)**

**Si vous aviez configuré Vercel Cron comme fallback en Free tier** :

**Option A : Supprimer la configuration** (recommandé)
```json
// vercel.json - AVANT
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "crons": [
    {
      "path": "/api/cron/refresh-views",
      "schedule": "0 */2 * * *"
    }
  ]
}

// vercel.json - APRÈS
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Déployer sur Vercel** :
```bash
git add vercel.json
git commit -m "chore: disable Vercel Cron (pg_cron activated)"
git push
```

---

### **Étape 5 : Vérifier que pg_cron Fonctionne**

**Attendre 10 minutes**, puis vérifier :

**1. Historique exécutions pg_cron** :
```sql
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

**Résultat attendu** :
- `status = 'succeeded'` pour tous les jobs
- `return_message` vide ou message de succès
- `start_time` récent (< 10min)

**2. Vérifier logs refresh materialized views** :
```sql
SELECT * FROM materialized_view_refresh_stats;
```

**Colonnes importantes** :
- `last_refresh_at` : Devrait être < 5min
- `success_count` : Devrait augmenter toutes les 5min
- `failed_count` : Devrait rester à 0
- `avg_duration_ms` : Devrait être < 100ms

**3. Vérifier dashboard admin** :
- Naviguer vers `/admin/security`
- Section "Performance Materialized Views"
- Vérifier "Dernier Refresh" < 5 minutes
- Success rate doit être 100%

---

### **Étape 6 : Test de Smoke (Validation Complète)**

**Exécuter ces tests pour valider l'installation** :

```sql
-- Test 1: Vérifier extension pg_cron
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';
-- Attendu: 1 ligne avec version 1.x

-- Test 2: Vérifier 6 jobs actifs
SELECT COUNT(*) as job_count FROM cron.job WHERE active = true;
-- Attendu: 6

-- Test 3: Vérifier dernière exécution refresh bars_with_stats
SELECT * FROM cron.job_run_details
WHERE command LIKE '%refresh_bars_with_stats%'
ORDER BY start_time DESC
LIMIT 1;
-- Attendu: status = 'succeeded', start_time < 10min

-- Test 4: Vérifier stats refresh view
SELECT view_name, success_count, failed_count, last_refresh_at
FROM materialized_view_refresh_stats
WHERE view_name = 'bars_with_stats';
-- Attendu: success_count > 0, failed_count = 0, last_refresh_at < 5min

-- Test 5: Vérifier aucune alerte active
SELECT COUNT(*) as active_alerts FROM active_refresh_alerts;
-- Attendu: 0
```

**Si tous les tests passent → Migration réussie ! ✅**

---

## 🔧 **Troubleshooting**

### **Problème 1 : Jobs pg_cron ne s'exécutent pas**

**Symptôme** : `cron.job_run_details` vide ou ancien

**Diagnostic** :
```sql
-- Vérifier extension activée
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Vérifier jobs créés
SELECT * FROM cron.job;

-- Vérifier logs exécution
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

**Solutions** :
1. Vérifier que pg_cron est bien activé (Étape 2)
2. Recréer les jobs manuellement (Étape 3)
3. Vérifier permissions : `GRANT USAGE ON SCHEMA cron TO authenticated;`
4. Attendre 10min et revérifier

---

### **Problème 2 : Refresh échoue avec timeout**

**Symptôme** : `failed_count > 0` dans `materialized_view_refresh_stats`

**Diagnostic** :
```sql
SELECT * FROM materialized_view_refresh_log
WHERE status IN ('failed', 'timeout')
ORDER BY created_at DESC
LIMIT 10;
```

**Solutions** :
```sql
-- Augmenter timeout (si nécessaire pour grandes tables)
-- Modifier dans 20251227000300_pg_cron_safeguards.sql
-- Puis re-exécuter la migration

-- Ou manuellement:
DROP FUNCTION IF EXISTS refresh_bars_with_stats();
CREATE FUNCTION refresh_bars_with_stats()
RETURNS TABLE(success BOOLEAN, duration_ms INTEGER, error_message TEXT)
AS $$
  SELECT * FROM safe_refresh_materialized_view('bars_with_stats', TRUE, 60); -- 60s au lieu de 30s
$$ LANGUAGE sql;
```

---

### **Problème 3 : Vercel Cron et pg_cron actifs simultanément**

**Symptôme** : Refresh 2× plus fréquent que prévu

**Solutions** :
1. Vérifier `vercel.json` (section `crons` doit être supprimée)
2. Redéployer sur Vercel
3. Vérifier dans Vercel Dashboard > Cron Jobs (doit être vide)
4. Surveiller logs pendant 1h pour confirmer

---

### **Problème 4 : Alertes actives après migration**

**Symptôme** : `active_refresh_alerts` contient des alertes

**Solution** :
```sql
-- Acknowledger toutes les anciennes alertes (migration)
UPDATE refresh_failure_alerts
SET status = 'acknowledged'
WHERE status = 'active'
  AND created_at < NOW() - INTERVAL '1 hour';

-- Ou via dashboard /admin/security
-- Bouton "Acknowledger" sur chaque alerte
```

---

## ✅ **Checklist Post-Migration**

### **Technique**
- [ ] pg_cron activé dans Supabase Dashboard > Extensions
- [ ] 6 jobs pg_cron créés (`SELECT * FROM cron.job` retourne 6 lignes)
- [ ] Jobs actifs (`active = true` pour tous)
- [ ] Premier refresh pg_cron réussi (< 10min attente)
- [ ] Logs `materialized_view_refresh_log` montrent succès récents
- [ ] Aucune erreur dans `cron.job_run_details`
- [ ] Vercel Cron désactivé (si utilisé)

### **Fonctionnel**
- [ ] Dashboard `/admin/security` accessible
- [ ] Section "Performance Materialized Views" affiche stats récentes
- [ ] "Dernier Refresh" < 5 minutes pour `bars_with_stats`
- [ ] Success rate = 100% (ou > 95%)
- [ ] Aucune alerte active dans section "Alertes"
- [ ] Bouton "Refresh bars_with_stats" fonctionne manuellement

### **Monitoring**
- [ ] Monitoring configuré (alertes si échecs > 3 consécutifs)
- [ ] Notifications SuperAdmin actives
- [ ] Tests smoke tous passés (6 queries ci-dessus)

---

## 📊 **Comparaison Free vs Pro**

| Aspect | Supabase Free + Manuel | Supabase Pro + pg_cron |
|--------|------------------------|------------------------|
| **Coût** | 0$/mois | 25$/mois |
| **Refresh MV** | Manuel 2-3x/jour | Auto toutes les 5min |
| **Latence données** | 4-8h obsolètes | < 5min temps réel |
| **Fiabilité** | Dépend humain | Automatique 24/7 |
| **Maintenance** | 5-10min/jour | 0min (autopilote) |
| **Scalabilité** | ❌ Bloquante > 10 bars | ✅ Jusqu'à 100+ bars |
| **Database size** | 500 MB max | 8 GB |
| **Bandwidth** | 5 GB/mois | 250 GB/mois |
| **Support** | Community | Email support |

---

## 🎯 **Recommandations**

### **Passer à Pro IMMÉDIATEMENT si** :
- ✅ **> 7 bars actifs** (proche limite scalabilité)
- ✅ **> 500 ventes/jour** (données temps réel critiques)
- ✅ **DB > 400 MB** (proche limite Free)
- ✅ **Besoin refresh < 10min** (exigence business)
- ✅ **Équipe > 1 personne** (zero maintenance manuelle)

### **Rester en Free acceptable si** :
- Phase développement/test uniquement
- < 5 bars actifs
- < 200 ventes/jour
- Budget très serré
- Refresh manuel 2-3x/jour acceptable

---

## 📈 **Monitoring Post-Migration**

### **Première semaine (quotidien)** :

```sql
-- Dashboard santé pg_cron
SELECT
  j.schedule,
  j.command,
  j.active,
  COUNT(jrd.runid) FILTER (WHERE jrd.status = 'succeeded') AS success_count,
  COUNT(jrd.runid) FILTER (WHERE jrd.status = 'failed') AS failed_count,
  MAX(jrd.start_time) AS last_run
FROM cron.job j
LEFT JOIN cron.job_run_details jrd ON jrd.jobid = j.jobid
  AND jrd.start_time > NOW() - INTERVAL '24 hours'
GROUP BY j.jobid, j.schedule, j.command, j.active
ORDER BY j.jobid;
```

**Alertes à surveiller** :
- ❌ Si `failed_count` > 3 consécutifs → Investiguer logs
- ❌ Si `last_run` > 15 minutes pour refresh-bars-stats → Vérifier pg_cron actif
- ❌ Si `success_count` = 0 → Jobs ne s'exécutent pas

### **Après 1 mois (mensuel)** :

```sql
-- Analyse tendances performance
SELECT
  view_name,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total_refreshes,
  AVG(duration_ms) AS avg_duration_ms,
  MAX(duration_ms) AS max_duration_ms,
  COUNT(*) FILTER (WHERE status = 'failed') AS failures
FROM materialized_view_refresh_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY view_name, DATE_TRUNC('day', created_at)
ORDER BY day DESC, view_name;
```

---

## 🔗 **Ressources**

- [Documentation pg_cron](https://github.com/citusdata/pg_cron)
- [Supabase Pro Pricing](https://supabase.com/pricing)
- [Materialized Views Performance](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [MIGRATION_OPTIMISATION_LOG.md](./MIGRATION_OPTIMISATION_LOG.md) - Documentation complète Phase 3

---

**Migration estimée** : ✅ **15 minutes, zéro downtime, production-ready**
