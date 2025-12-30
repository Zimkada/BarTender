# 📧 Guide de Configuration des Alertes Email

**Date**: 2025-12-28
**Projet**: BarTender
**Système**: Alertes automatiques via Edge Function + pg_cron

---

## ✅ Étape 1: Migration SQL Déployée

La migration `20251228010000_setup_alert_email_cron.sql` est déjà déployée avec succès.

✅ Table `alert_email_log` créée
✅ Colonne `alert_sent_at` ajoutée à `refresh_failure_alerts`
✅ Fonction `trigger_alert_email_edge_function()` créée
✅ pg_cron job configuré (toutes les 15 minutes)
✅ Vue `alert_email_stats` créée
✅ Fonction `test_alert_email_system()` créée

---

## 📦 Étape 2: Installer Supabase CLI

### Option A: Via Scoop (Recommandé pour Windows)

```powershell
# Installer Scoop (si pas déjà fait)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Installer Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Option B: Téléchargement direct

1. Aller sur https://github.com/supabase/cli/releases
2. Télécharger `supabase_windows_amd64.zip`
3. Extraire et ajouter au PATH

### Option C: Via Homebrew (si installé)

```bash
brew install supabase/tap/supabase
```

---

## 🔗 Étape 3: Lier le Projet Supabase

```bash
cd "c:\Users\HP ELITEBOOK\DEV\BarTender"

supabase login
# Suivre les instructions pour s'authentifier

supabase link --project-ref yekomwjdznvtnialpdcz
```

---

## 🔐 Étape 4: Configurer les Secrets

```bash
# API Key Resend
supabase secrets set RESEND_API_KEY="re_9zrvuhk4_4iqouU48WVtHfNUYGQKiDH26"

# Email admin
supabase secrets set ADMIN_EMAIL="zimkada@gmail.com"

# Token de sécurité (généré)
supabase secrets set FUNCTION_SECRET="L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY="

# Email d'envoi
supabase secrets set SMTP_FROM="alerts@bartender.app"

# Seuil d'alertes
supabase secrets set ALERT_THRESHOLD="3"
```

### Vérifier les secrets

```bash
supabase secrets list
```

Résultat attendu:
```
RESEND_API_KEY (secret)
ADMIN_EMAIL (secret)
FUNCTION_SECRET (secret)
SMTP_FROM (secret)
ALERT_THRESHOLD (secret)
```

---

## 🚀 Étape 5: Déployer l'Edge Function

```bash
supabase functions deploy send-refresh-alerts --no-verify-jwt
```

Résultat attendu:
```
Deploying function send-refresh-alerts...
Function send-refresh-alerts deployed successfully
URL: https://yekomwjdznvtnialpdcz.supabase.co/functions/v1/send-refresh-alerts
```

---

## 🗄️ Étape 6: Configurer PostgreSQL

Via **Supabase Dashboard** > **SQL Editor**, exécuter:

```sql
ALTER DATABASE postgres
SET app.edge_function_url = 'https://yekomwjdznvtnialpdcz.supabase.co/functions/v1/send-refresh-alerts';

ALTER DATABASE postgres
SET app.function_secret = 'L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY=';
```

---

## ✅ Étape 7: Tester le Système

### Test 1: Vérifier les alertes qui seraient envoyées

Via **SQL Editor**:

```sql
SELECT * FROM test_alert_email_system();
```

Résultat: Liste des alertes actives avec `should_send = true` si ≥3 échecs.

### Test 2: Vérifier le cron job

```sql
SELECT * FROM cron.job
WHERE jobname = 'send-refresh-alerts-email';
```

Résultat attendu:

| jobid | schedule    | command                                  | nodename | active |
|-------|-------------|------------------------------------------|----------|--------|
| 3     | */15 * * * * | SELECT trigger_alert_email_edge_function(); | localhost | t      |

### Test 3: Déclencher manuellement

```sql
SELECT trigger_alert_email_edge_function();
```

Vérifier ensuite:

```sql
SELECT * FROM alert_email_log
ORDER BY triggered_at DESC
LIMIT 5;
```

### Test 4: Tester l'Edge Function directement

Via **Dashboard** > **Edge Functions** > **send-refresh-alerts** > **Invoke**:

Headers:
```json
{
  "Authorization": "Bearer L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY="
}
```

Body: (vide pour POST)

Résultat attendu:
```json
{
  "success": true,
  "message": "0/0 alertes envoyées",
  "alertsCount": 0,
  "successCount": 0,
  "results": []
}
```

---

## 📊 Monitoring

### Voir les emails envoyés

```sql
SELECT
  id,
  triggered_at,
  status,
  alerts_sent,
  error_message
FROM alert_email_log
ORDER BY triggered_at DESC
LIMIT 10;
```

### Statistiques des 7 derniers jours

```sql
SELECT * FROM alert_email_stats;
```

Colonnes:
- `total_emails_triggered`: Total de tentatives
- `success_count`: Emails envoyés avec succès
- `failed_count`: Échecs
- `total_alerts_sent`: Nombre total d'alertes envoyées
- `last_email_sent_at`: Dernier envoi
- `avg_alerts_per_email`: Moyenne d'alertes par email

### Voir les alertes actives

```sql
SELECT
  view_name,
  consecutive_failures,
  first_failure_at,
  last_failure_at,
  alert_sent_at,
  status
FROM refresh_failure_alerts
WHERE status = 'active'
ORDER BY consecutive_failures DESC;
```

### Logs Edge Function

Via **Dashboard** > **Edge Functions** > **send-refresh-alerts** > **Logs**

---

## 🔧 Troubleshooting

### Problème: Aucun email reçu

**Vérifications:**

1. **Secrets configurés?**
   ```bash
   supabase secrets list
   ```

2. **Edge Function déployée?**
   ```bash
   supabase functions list
   ```

3. **API Key Resend valide?**
   - Aller sur https://resend.com/api-keys
   - Vérifier que la clé est active

4. **Logs de l'Edge Function**
   - Dashboard > Edge Functions > Logs
   - Chercher les erreurs

5. **Table alert_email_log**
   ```sql
   SELECT * FROM alert_email_log
   WHERE status = 'failed'
   ORDER BY triggered_at DESC;
   ```

### Problème: Cron job ne s'exécute pas

```sql
-- Vérifier que pg_cron est activé
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Voir les exécutions récentes
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- Relancer le job
SELECT cron.unschedule('send-refresh-alerts-email');
SELECT cron.schedule(
  'send-refresh-alerts-email',
  '*/15 * * * *',
  $$ SELECT trigger_alert_email_edge_function(); $$
);
```

### Problème: Erreur RESEND_API_KEY

```bash
# Reconfigurer le secret
supabase secrets set RESEND_API_KEY="re_9zrvuhk4_4iqouU48WVtHfNUYGQKiDH26"

# Redéployer la fonction
supabase functions deploy send-refresh-alerts --no-verify-jwt
```

---

## 📱 Format de l'Email

L'email HTML envoyé contient:

- **Header rouge** avec nom de la vue matérialisée
- **Statistiques**: Échecs consécutifs, durée incident
- **Détails**: Premier/dernier échec avec timestamps
- **Messages d'erreur**: 5 derniers messages
- **Actions recommandées**: Checklist de troubleshooting
- **Footer**: Branding BarTender

---

## 📈 Quotas et Limites

### Resend (Plan Gratuit)
- ✅ 3,000 emails/mois
- ✅ 100 emails/jour

### Supabase Edge Functions
- ✅ 500,000 invocations/mois (gratuit)
- ✅ 2M invocations/mois (Pro)

### pg_cron
- Toutes les 15 min = **2,880 invocations/mois**
- ✅ Largement dans les quotas

---

## 🔗 Liens Utiles

- **Dashboard Supabase**: https://supabase.com/dashboard/project/yekomwjdznvtnialpdcz
- **Edge Functions**: https://supabase.com/dashboard/project/yekomwjdznvtnialpdcz/functions
- **Resend Dashboard**: https://resend.com/emails
- **Documentation Edge Function**: `supabase/functions/send-refresh-alerts/README.md`

---

## ✅ Checklist Finale

- [ ] Supabase CLI installée et fonctionnelle
- [ ] Projet lié (`supabase link`)
- [ ] Secrets configurés (5 secrets)
- [ ] Edge Function déployée
- [ ] PostgreSQL configuré (app.edge_function_url, app.function_secret)
- [ ] Test manuel réussi
- [ ] Cron job actif
- [ ] Email de test reçu

---

## 🎯 Résultat Attendu

Une fois configuré, le système:
- ✅ Vérifie les alertes toutes les 15 minutes
- ✅ Envoie un email à `zimkada@gmail.com` si ≥3 échecs consécutifs
- ✅ Log chaque tentative dans `alert_email_log`
- ✅ Met à jour `alert_sent_at` après envoi réussi
- ✅ Fonctionne 24/7 sans intervention humaine

**MTTR**: Réduction de plusieurs heures à quelques minutes
**Disponibilité**: Monitoring automatique 24/7
