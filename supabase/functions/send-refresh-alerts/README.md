# Edge Function: send-refresh-alerts

## Description

Fonction serverless Supabase qui envoie des emails d'alerte automatiques lorsque des vues matérialisées échouent de manière répétée.

## Fonctionnalités

- ✅ Détection automatique des alertes actives (≥3 échecs consécutifs)
- ✅ Envoi d'emails HTML formatés via Resend API
- ✅ Mise à jour automatique de `alert_sent_at` après envoi
- ✅ Logging des tentatives d'envoi dans `alert_email_log`
- ✅ Sécurité par token Bearer
- ✅ Déclenchement automatique via pg_cron (toutes les 15 min)

## Installation

### 1. Installer Supabase CLI (si pas déjà fait)

```bash
npm install -g supabase
```

### 2. Lier le projet Supabase

```bash
supabase link --project-ref [votre-project-ref]
```

### 3. Configurer les secrets

```bash
# API Key Resend (obligatoire)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

# Email de l'administrateur qui recevra les alertes
supabase secrets set ADMIN_EMAIL=admin@bartender.app

# Token de sécurité pour l'authentification
supabase secrets set FUNCTION_SECRET=$(openssl rand -base64 32)

# Email "from" (optionnel, par défaut: noreply@bartender.app)
supabase secrets set SMTP_FROM=alerts@bartender.app

# Seuil d'échecs consécutifs (optionnel, par défaut: 3)
supabase secrets set ALERT_THRESHOLD=3
```

### 4. Déployer l'Edge Function

```bash
supabase functions deploy send-refresh-alerts
```

### 5. Configurer PostgreSQL

Via Supabase Dashboard > Database > Settings > Custom PostgreSQL configuration:

```sql
-- Ajouter ces paramètres
ALTER DATABASE postgres SET app.edge_function_url = 'https://[project-ref].supabase.co/functions/v1/send-refresh-alerts';
ALTER DATABASE postgres SET app.function_secret = '[votre-function-secret]';
```

### 6. Exécuter la migration

```bash
supabase db push
```

Ou via Supabase Dashboard > SQL Editor:

```sql
-- Exécuter: supabase/migrations/20251228010000_setup_alert_email_cron.sql
```

## Configuration Resend

### Créer un compte Resend

1. Aller sur [resend.com](https://resend.com)
2. S'inscrire (gratuit jusqu'à 3000 emails/mois)
3. Créer une API Key dans **API Keys**
4. Vérifier votre domaine dans **Domains** (optionnel mais recommandé)

### Format du secret

```bash
supabase secrets set RESEND_API_KEY=re_abcd1234xxxx
```

## Test Manuel

### Option 1: Via SQL

```sql
-- Voir quelles alertes seraient envoyées
SELECT * FROM test_alert_email_system();

-- Déclencher manuellement l'envoi
SELECT trigger_alert_email_edge_function();
```

### Option 2: Via HTTP (curl)

```bash
curl -X POST 'https://[project-ref].supabase.co/functions/v1/send-refresh-alerts' \
  -H "Authorization: Bearer [votre-function-secret]" \
  -H "Content-Type: application/json"
```

### Option 3: Via Supabase Dashboard

1. Aller dans **Edge Functions** > send-refresh-alerts
2. Cliquer sur **Invoke**
3. Ajouter le header `Authorization: Bearer [function-secret]`
4. Envoyer une requête POST

## Monitoring

### Vérifier les logs d'envoi

```sql
-- Derniers emails envoyés
SELECT * FROM alert_email_log
ORDER BY triggered_at DESC
LIMIT 10;

-- Statistiques des 7 derniers jours
SELECT * FROM alert_email_stats;
```

### Vérifier le job pg_cron

```sql
-- Voir tous les jobs cron
SELECT * FROM cron.job;

-- Voir les exécutions récentes
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-refresh-alerts-email')
ORDER BY start_time DESC
LIMIT 10;
```

### Logs Edge Function (Supabase Dashboard)

1. Aller dans **Edge Functions** > send-refresh-alerts
2. Onglet **Logs**
3. Voir les invocations et erreurs

## Format Email

L'email envoyé contient:

- **Header**: Vue matérialisée concernée
- **Statistiques**: Nombre d'échecs, durée de l'incident
- **Détails**: Premier/dernier échec, timestamps
- **Messages d'erreur**: 5 derniers messages d'erreur
- **Actions recommandées**: Checklist de débogage

## Désactiver/Modifier le Cron

### Désactiver temporairement

```sql
SELECT cron.unschedule('send-refresh-alerts-email');
```

### Modifier la fréquence

```sql
-- Supprimer l'ancien
SELECT cron.unschedule('send-refresh-alerts-email');

-- Créer un nouveau (ex: toutes les 30 minutes)
SELECT cron.schedule(
  'send-refresh-alerts-email',
  '*/30 * * * *',
  $$ SELECT trigger_alert_email_edge_function(); $$
);
```

## Troubleshooting

### Problème: Emails non envoyés

**Vérifier:**

1. API Key Resend valide:
   ```bash
   supabase secrets list
   ```

2. Edge Function déployée:
   ```bash
   supabase functions list
   ```

3. Logs de la fonction:
   - Supabase Dashboard > Edge Functions > Logs

4. Table alert_email_log:
   ```sql
   SELECT * FROM alert_email_log
   WHERE status = 'failed'
   ORDER BY triggered_at DESC;
   ```

### Problème: Cron ne s'exécute pas

**Vérifier:**

1. Extension pg_cron activée:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Job créé:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'send-refresh-alerts-email';
   ```

3. Exécutions récentes:
   ```sql
   SELECT * FROM cron.job_run_details
   ORDER BY start_time DESC LIMIT 5;
   ```

### Problème: Erreur "RESEND_API_KEY non configuré"

**Solution:**

```bash
# Vérifier le secret
supabase secrets list

# Le reconfigurer si absent
supabase secrets set RESEND_API_KEY=re_xxxxx
```

## Limites et Quotas

### Resend (Plan Gratuit)

- **3,000 emails/mois**
- **100 emails/jour**
- Si dépassé, passer au plan payant

### Supabase Edge Functions

- **500,000 invocations/mois** (plan gratuit)
- **2 millions invocations/mois** (plan Pro)

### pg_cron

- Toutes les 15 min = **2,880 invocations/mois**
- Largement dans les quotas

## Sécurité

- ✅ Edge Function protégée par Bearer token
- ✅ RLS activée sur alert_email_log (admin uniquement)
- ✅ Secrets stockés dans Supabase Vault
- ✅ HTTPS uniquement
- ✅ Fonction SECURITY DEFINER pour trigger_alert_email_edge_function

## Support

Pour toute question:
- Logs Supabase: Dashboard > Edge Functions > Logs
- Logs PostgreSQL: `SELECT * FROM alert_email_log`
- Documentation Resend: https://resend.com/docs
