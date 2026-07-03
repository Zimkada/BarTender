# Configuration Alertes Email SANS CLI (Dashboard uniquement)

**Pour**: zimkada@gmail.com
**Project**: yekomwjdznvtnialpdcz

---

## Etape 1: Deployer l'Edge Function

### 1.1 Aller dans le Dashboard Supabase

URL: https://supabase.com/dashboard/project/yekomwjdznvtnialpdcz/functions

### 1.2 Creer la fonction

1. Cliquer sur **"Create a new function"**
2. Nom: `send-refresh-alerts`
3. Copier-coller le code de: `supabase/functions/send-refresh-alerts/index.ts`
4. Cliquer sur **"Deploy function"**

---

## Etape 2: Configurer les Secrets

### 2.1 Aller dans Settings > Edge Functions

URL: https://supabase.com/dashboard/project/yekomwjdznvtnialpdcz/settings/functions

### 2.2 Ajouter les secrets (section "Secrets")

Cliquer sur **"Add secret"** pour chacun:

| Nom | Valeur |
|-----|--------|
| `RESEND_API_KEY` | `re_9zrvuhk4_4iqouU48WVtHfNUYGQKiDH26` |
| `ADMIN_EMAIL` | `zimkada@gmail.com` |
| `FUNCTION_SECRET` | `L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY=` |
| `SMTP_FROM` | `alerts@bartender.app` |
| `ALERT_THRESHOLD` | `3` |

**IMPORTANT:** Apres avoir ajoute les secrets, **redeploy** la fonction pour qu'elle les prenne en compte.

---

## Etape 3: Configurer PostgreSQL

### 3.1 Aller dans SQL Editor

URL: https://supabase.com/dashboard/project/yekomwjdznvtnialpdcz/sql/new

### 3.2 Executer ces 2 commandes SQL

```sql
ALTER DATABASE postgres
SET app.edge_function_url = 'https://yekomwjdznvtnialpdcz.supabase.co/functions/v1/send-refresh-alerts';
```

Cliquer **Run**, puis executer:

```sql
ALTER DATABASE postgres
SET app.function_secret = 'L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY=';
```

Cliquer **Run**.

---

## Etape 4: Tester le Systeme

### 4.1 Test 1: Verifier les alertes

Dans SQL Editor, executer:

```sql
SELECT * FROM test_alert_email_system();
```

**Resultat attendu:** Liste des alertes actives (peut etre vide si pas d'erreurs).

### 4.2 Test 2: Verifier le cron job

```sql
SELECT
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'send-refresh-alerts-email';
```

**Resultat attendu:**

| jobid | schedule | command | active |
|-------|----------|---------|--------|
| 3 | */15 * * * * | SELECT trigger_alert_email_edge_function(); | t |

### 4.3 Test 3: Tester l'Edge Function manuellement

1. Aller dans **Edge Functions** > **send-refresh-alerts**
2. Onglet **"Invoke"**
3. Methode: **POST**
4. Headers (onglet "Headers"):
   ```json
   {
     "Authorization": "Bearer L55/iiNDnWH67T9/z8/Ojd20FBO10gd+bDVbJ1Hf0PY="
   }
   ```
5. Body: laisser vide
6. Cliquer **"Send request"**

**Resultat attendu:**
```json
{
  "success": true,
  "message": "0/0 alertes envoyees",
  "alertsCount": 0,
  "successCount": 0,
  "results": []
}
```

Si vous avez des alertes actives, elles seront envoyees et vous recevrez un email a `zimkada@gmail.com`.

---

## Etape 5: Verification Finale

### 5.1 Verifier les logs d'execution

Dans SQL Editor:

```sql
SELECT
  id,
  triggered_at,
  status,
  alerts_sent,
  error_message
FROM alert_email_log
ORDER BY triggered_at DESC
LIMIT 5;
```

### 5.2 Voir les statistiques

```sql
SELECT * FROM alert_email_stats;
```

---

## Troubleshooting

### Probleme: "RESEND_API_KEY non configure"

**Solution:**
1. Verifier que les secrets sont bien ajoutes dans Settings > Edge Functions > Secrets
2. Redeploy la fonction apres avoir ajoute les secrets

### Probleme: Fonction ne s'execute pas

**Solution:**
1. Verifier les logs: Edge Functions > send-refresh-alerts > Logs
2. Chercher les erreurs en rouge

### Probleme: Pas d'email recu

**Verifications:**
1. API Key Resend valide? Aller sur https://resend.com/api-keys
2. Email admin correct? Verifier le secret `ADMIN_EMAIL`
3. Verifier spam/courrier indesirable

### Probleme: Erreur 401 Unauthorized

**Solution:**
Verifier que le `FUNCTION_SECRET` dans les headers correspond bien au secret configure.

---

## Monitoring en Continu

### Tableau de bord recommande

Ajouter ce query en **Saved query** dans SQL Editor:

```sql
-- Dashboard Alertes Email
SELECT
  'Emails envoyes (7j)' AS metric,
  COUNT(*) AS value
FROM alert_email_log
WHERE triggered_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Taux succes' AS metric,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'success')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    1
  )::TEXT || '%' AS value
FROM alert_email_log
WHERE triggered_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Alertes actives' AS metric,
  COUNT(*)::TEXT AS value
FROM refresh_failure_alerts
WHERE status = 'active'
  AND consecutive_failures >= 3
  AND alert_sent_at IS NULL;
```

---

## Recapitulatif

Une fois configure:

- Le systeme verifie automatiquement toutes les **15 minutes**
- Envoie un email si **>= 3 echecs consecutifs**
- Email envoye a: **zimkada@gmail.com**
- Logs dans: **alert_email_log**
- Monitoring: **alert_email_stats**

**C'est tout! Le systeme est 100% automatique.**
