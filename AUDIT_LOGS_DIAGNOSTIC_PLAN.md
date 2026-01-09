# Plan de Diagnostic - Audit Logs Vides

## Problème
L'utilisateur signale que la table `audit_logs` est **complètement vide** malgré:
- Des ventes créées (visibles dans le dashboard)
- Des opérations admin proxy ("acting_as")
- Les migrations de triggers étant exécutées

## Hypothèses
1. **RLS blocking visibility** (PROBABLE): Les logs existent mais RLS empêche la lecture
2. **Triggers not firing** (POSSIBLE): Les triggers ne s'exécutent pas
3. **Super_admin not registered** (PROBABLE): Super_admin n'est pas dans bar_members, donc `is_super_admin()` = FALSE

## Plan de Diagnostic en 3 Étapes

### Étape 1: 20260109000500_diagnostic_audit_logs.sql
**Objectif**: Vérifier l'état général du système
**Tests**:
- ✅ Compte total des logs (pour voir si table vide)
- ✅ Vérifie que triggers existent et sont ACTIVÉS
- ✅ Teste la fonction `is_super_admin()`
- ✅ Vérifie les politiques RLS sur audit_logs
- ✅ Affiche les 5 derniers logs (s'il y en a)

**Résultat attendu**:
- Si audit_logs vide → Go Étape 2
- Si audit_logs plein → Go Étape 3 (problème RLS)

### Étape 2: 20260109000501_bypass_rls_audit_check.sql
**Objectif**: Vérifier si les logs existent en contournant RLS
**Tests** (exécutés avec service_role, bypass RLS):
- ✅ Dump complet de audit_logs sans restrictions
- ✅ Distribution par type d'événement
- ✅ Corrélation sales vs audit logs
- ✅ Corrélation stock updates vs audit logs
- ✅ Affiche les 10 derniers records
- ✅ Détail du statut des triggers

**Résultat attendu**:
- Logs existent mais hidden → **RLS problem** → Go Étape 3A
- Logs inexistants → **Trigger problem** → Go Étape 3B

### Étape 3A: RLS Problem - Fix Super_admin Registration
**Situation**: Les logs EXISTENT mais super_admin ne peut pas les voir
**Cause**: Super_admin n'est pas dans bar_members table
**Solution**: Créer une entrée bar_members pour super_admin

**Migration requise**:
```sql
-- Insérer super_admin dans bar_members (associé à TOUS les bars ou bar spécifique)
INSERT INTO bar_members (user_id, bar_id, role, is_active)
SELECT user_id, '5cfff673-51b5-414a-a563-66681211a98a', 'super_admin', true
FROM users
WHERE id = (SELECT MAX(id) FROM users WHERE role = 'super_admin')
ON CONFLICT DO NOTHING;
```

### Étape 3B: Trigger Problem - Debug Execution
**Situation**: Les logs n'existent PAS du tout
**Causes possibles**:
1. Triggers sont DISABLED
2. Triggers ne matchent pas les INSERT/UPDATE events
3. Fonction `internal_log_audit_event()` est cassée
4. RLS bloque les INSERT à audit_logs

**Test**: 20260109000502_test_trigger_execution.sql
- Appel direct à `internal_log_audit_event()` → peut-elle écrire?
- Insert test SALE → trigger fire?
- Update test STOCK → trigger fire?

## Flux de Décision

```
Exécuter Migration 20260109000500
    ↓
audit_logs vide?
    ├─ NON → audit_logs a % records
    │  └─ Exécuter Migration 20260109000501 pour vérifier contenu exact
    │     ├─ Logs existent (visible sans RLS)
    │     │  └─ PROBLÈME: RLS blocking super_admin → Go Étape 3A
    │     └─ Logs inexistants (même sans RLS)
    │        └─ PROBLÈME: Triggers not firing → Go Étape 3B
    │
    └─ OUI → audit_logs est vide
       └─ Exécuter Migration 20260109000502 pour tester triggers
          ├─ Tests réussissent (logs créés par test)
          │  └─ Triggers fonctionnent! Problème ailleurs
          └─ Tests échouent
             └─ Triggers cassés → debug fonction internal_log_audit_event
```

## Fichiers de Migration Créés

| Migration | Rôle |
|-----------|------|
| 20260109000500 | Diagnostic initial - Vérifier état système |
| 20260109000501 | Bypass RLS pour vérifier si logs existent |
| 20260109000502 | Test direct des triggers et fonctions |

## Commandes à Exécuter (Ordre Logique)

### 1. Diagnostic initial
```bash
# Dans Supabase CLI ou interface web
supabase db reset  # ou exécuter 20260109000500
```

### 2. Vérifier contenu réel
```bash
# Exécuter 20260109000501
# Vérifier sortie pour savoir si logs existent
```

### 3. Tester triggers
```bash
# Exécuter 20260109000502
# Vérifier si tests réussissent
```

### 4. Appliquer fix (selon résultat)
```bash
# Si RLS problem:
# Créer bar_members pour super_admin

# Si trigger problem:
# Analyser error logs
# Fixer fonction internal_log_audit_event ou triggers
```

## Résultats Attendus par Scénario

### Scénario 1: RLS Blocking (Probable)
```
✅ Migration 20260109000500 montre:
   - is_super_admin() = FALSE
   - RLS policy "Admins can view audit logs" exists
   - triggers are ACTIVE

✅ Migration 20260109000501 montre:
   - audit_logs has 26 records (from cleanup migration!)
   - Distribution: PRODUCT_CLEANUP, PRODUCT_ARCHIVE

✅ Solution:
   - Create bar_members entry for super_admin
   - Then super_admin can SELECT from audit_logs
```

### Scénario 2: Triggers Not Firing (Less Likely)
```
✅ Migration 20260109000500 montre:
   - audit_logs completely empty
   - triggers exist but may be DISABLED

✅ Migration 20260109000501 montre:
   - audit_logs still empty (confirmed)
   - No event types found

✅ Migration 20260109000502 montre:
   - Test direct function call fails
   - Test INSERT doesn't trigger audit log

✅ Solution:
   - Enable triggers: ALTER TABLE ... ENABLE TRIGGER
   - OR fix internal_log_audit_event function
```

## Notes Importantes

1. **Migrations sont NON-DESTRUCTIVES**: Seulement des SELECT et diagnostics
2. **RLS remain enabled**: Les tests ne modifient pas la configuration RLS
3. **Service role bypass**: Certains tests utilisent service_role pour bypass RLS
4. **Test data cleanup**: Migration 20260109000502 nettoie les données de test

## Prochaines Actions

1. **Exécuter les 3 migrations de diagnostic** dans l'ordre
2. **Analyser la sortie** pour identifier le problème exact
3. **Créer une migration de FIX** basée sur le diagnostic
4. **Tester la correction** avec une nouvelle vente/stock update
5. **Documenter la leçon apprise** dans MIGRATIONS_HISTORY.md

---

**Créé**: 9 janvier 2026
**État**: Prêt pour exécution
**Prochaine étape**: Exécuter migration 20260109000500
