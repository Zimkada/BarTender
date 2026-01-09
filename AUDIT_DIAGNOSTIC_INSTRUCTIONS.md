# Instructions pour Exécuter le Diagnostic Audit Logs

## 📋 Résumé Rapide

La table `audit_logs` est **complètement vide** et tu dois découvrir pourquoi. Trois hypothèses:

1. **Logs existent mais RLS les cache** → Fix: Créer bar_members pour super_admin
2. **Triggers ne tirent pas** → Fix: Déboguer les triggers
3. **Fonction internal_log_audit_event est cassée** → Fix: Corriger la fonction

## 🚀 Étapes à Suivre

### Étape 1: Exécuter la Migration Diagnostic Simple

**Fichier:** `supabase/migrations/20260109000500_diagnostic_audit_logs_simple.sql`

Cette migration génère **10 SELECT queries** avec résultats visibles.

**Comment exécuter:**
1. Va sur [Supabase Console](https://supabase.com/dashboard)
2. Sélectionne ton projet BarTender
3. Va dans **SQL Editor**
4. Copie/colle le contenu de `20260109000500_diagnostic_audit_logs_simple.sql`
5. Clique **Run** ou Ctrl+Enter

### Étape 2: Copier les Résultats

Après exécution, tu verras **10 sections de résultats**:

1. **AUDIT_LOGS_CONTENT** - Compte total et par type d'événement
2. **SUPER_ADMIN_STATUS** - Est-ce que super_admin existe dans bar_members?
3. **TRIGGERS_STATUS** - Triggers activés ou désactivés?
4. **RLS_POLICIES_AUDIT_LOGS** - Quelles politiques RLS existent?
5. **LAST_10_AUDIT_LOGS** - Les 10 derniers logs (s'il y en a)
6. **EVENT_DISTRIBUTION** - Distribution par type d'événement
7. **CORRELATION_SALES_VS_AUDIT** - Sales créées vs logs audit
8. **IS_SUPER_ADMIN_TEST** - Est-ce que tu es identifié comme super_admin?
9. **AUDIT_LOGS_TABLE_STRUCTURE** - Structure de la table
10. **RLS_ENABLED_CHECK** - RLS activé sur audit_logs?

### Étape 3: Partager les Résultats

**Copie tout le résultat et colle-le dans le chat.** Exemple format:

```
AUDIT_LOGS_CONTENT
total_records | sale_created_count | stock_update_count | ...
0             | 0                  | 0                  | ...

SUPER_ADMIN_STATUS
total_super_admin | active_super_admin | active_super_admin_id
1                 | 0                  | NULL

...
```

## 📊 Interprétation des Résultats

### Scénario 1: Logs Existent Mais RLS Cache (PROBABLE)

**Indicateurs:**
- AUDIT_LOGS_CONTENT: `total_records = 26` (du cleanup migration 300)
- LAST_10_AUDIT_LOGS: Affiche 10 records
- SUPER_ADMIN_STATUS: `active_super_admin = 0` ⚠️
- IS_SUPER_ADMIN_TEST: `is_super_admin_result = false` ⚠️

**Diagnostic:**
→ Les logs EXISTENT mais super_admin ne peut pas les voir
→ Cause: Super_admin n'est pas dans bar_members OR is_active = FALSE
→ Solution: Créer/activer bar_members pour super_admin

### Scénario 2: Logs Vides, Triggers Cassés (POSSIBLE)

**Indicateurs:**
- AUDIT_LOGS_CONTENT: `total_records = 0` ⚠️
- LAST_10_AUDIT_LOGS: Aucun résultat
- TRIGGERS_STATUS: Tous les triggers = DISABLED ⚠️
- CORRELATION_SALES_VS_AUDIT: `total_sales = 50, logged_sales = 0` ⚠️

**Diagnostic:**
→ Les triggers ne tirent pas du tout
→ Cause: Triggers sont désactivés OR fonction cassée
→ Solution: Activer triggers ET déboguer internal_log_audit_event

### Scénario 3: Logs Vides, Triggers Actifs, Fonction Cassée

**Indicateurs:**
- AUDIT_LOGS_CONTENT: `total_records = 0` ⚠️
- TRIGGERS_STATUS: Tous = ENABLED ✅
- CORRELATION_SALES_VS_AUDIT: `unlogged_sales > 0` ⚠️

**Diagnostic:**
→ Triggers existent et sont actifs mais ne créent pas de logs
→ Cause: Fonction internal_log_audit_event est cassée
→ Solution: Déboguer et corriger la fonction

## 🔧 Actions Suivantes (Après Diagnostic)

### Si Scénario 1 (RLS Problem):

Créer migration pour ajouter super_admin dans bar_members:

```sql
INSERT INTO bar_members (user_id, bar_id, role, is_active)
SELECT
  (SELECT id FROM users WHERE email = 'ton-super-admin-email'),
  '5cfff673-51b5-414a-a563-66681211a98a', -- Bar ID
  'super_admin',
  true
ON CONFLICT DO NOTHING;
```

Puis tester:
```sql
SELECT is_super_admin();
SELECT * FROM audit_logs LIMIT 5;
```

### Si Scénario 2 ou 3 (Triggers/Function Problem):

Exécuter: `20260109000502_test_trigger_execution.sql`
- Test 1: Appel direct internal_log_audit_event()
- Test 2: Insert test SALE
- Test 3: Update test STOCK

## 📝 Checklist

- [ ] Copier le contenu de `20260109000500_diagnostic_audit_logs_simple.sql`
- [ ] Exécuter dans Supabase SQL Editor
- [ ] Attendre que tous les SELECT terminent
- [ ] Copier TOUS les résultats
- [ ] Coller dans le chat Claude
- [ ] Attendre le diagnostic
- [ ] Exécuter la migration de fix recommandée

## ⏱️ Durée Estimée

- Exécution diagnostic: 2-5 secondes
- Copie résultats: 1 minute
- Diagnostic complet: 5 minutes

**Total: ~10 minutes pour diagnostic complet**

## 🆘 Problèmes Courants

**Q: "ERROR: permission denied for schema public"**
A: Tu dois être connecté comme super_admin ou service_role

**Q: "Aucun résultat affiché"**
A: Assure-toi que le SQL s'est exécuté jusqu'au bout (vérifier les erreurs rouges)

**Q: "Results truncated"**
A: Supabase truncate si trop de résultats. Copie quand même ce qui est visible.

---

**Prêt à exécuter?** Vas-y! Je suis prêt à recevoir les résultats.
