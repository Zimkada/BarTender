# Production Checklist - BarTender Auth System

## ✅ Architecture validée

### Custom Authentication avec SECURITY DEFINER
- ✅ **Transaction atomique** : `login_user()` fait tout en une seule query
- ✅ **Sécurité** : Bcrypt + RLS + SECURITY DEFINER (pattern PostgreSQL standard)
- ✅ **Performance** : 1 round-trip DB au lieu de 3+
- ✅ **Audit** : `last_login_at` automatiquement mis à jour

## 📋 Migrations à appliquer

### Ordre d'application
1. ✅ `complete_setup.sql` - Schema initial + RLS basique
2. ✅ `005_add_bar_members_rls.sql` - Politiques RLS pour bar_members
3. ✅ `006_add_login_function.sql` - Fonction login_user() **[CRITIQUE]**
4. ⏳ `007_add_performance_indexes.sql` - Indices de performance **[RECOMMANDÉ]**

### Vérification post-migration
```sql
-- Vérifier que login_user existe
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'login_user';
-- Doit retourner: login_user | t (t = SECURITY DEFINER)

-- Vérifier les RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'bar_members';
-- Doit retourner 4 policies

-- Tester le login
SELECT * FROM login_user('admin', 'Admin@1234');
-- Doit retourner les infos du super admin
```

## 🔒 Sécurité en production

### Points validés
- ✅ **Pas de password_hash exposé** : Jamais retourné au client
- ✅ **Bcrypt côté serveur** : Impossible à bypass
- ✅ **RLS actif** : Toutes les tables sensibles protégées
- ✅ **SECURITY DEFINER sécurisé** : Utilisé uniquement pour auth
- ✅ **Audit trail** : Tous les logins tracés via `last_login_at`

### Recommandations additionnelles
- [ ] **Rate limiting** : Ajouter limite de tentatives de login (5/min par IP)
- [ ] **Session timeout** : Implémenter expiration de session (24h)
- [ ] **2FA** : Envisager pour les super_admins (futur)
- [ ] **IP whitelist** : Pour les super_admins (optionnel)

## 📊 Performance en production

### Benchmarks attendus (estimations)
- **Login** : < 100ms (1 query + bcrypt)
- **Queries RLS** : < 50ms (avec indices)
- **Concurrent logins** : > 100/s (PostgreSQL)

### Indices créés (migration 007)
```sql
idx_users_username              -- Login rapide
idx_bar_members_user_bar        -- RLS + membership queries
idx_bar_members_role            -- RLS role checks
idx_users_last_login            -- Analytics
```

### Monitoring recommandé
```sql
-- Voir les logins lents (> 500ms)
SELECT * FROM pg_stat_statements
WHERE query LIKE '%login_user%'
AND mean_exec_time > 500;

-- Voir les sessions actives
SELECT count(*) FROM pg_stat_activity
WHERE state = 'active';
```

## 🔄 Gestion des sessions

### Architecture actuelle
1. **localStorage** : Stocke `auth_user` côté client
2. **set_config()** : Session PostgreSQL pour RLS
3. **AuthService.initializeSession()** : Restaure au démarrage

### Limitations connues
⚠️ **set_config() ne persiste pas entre transactions HTTP**
- Impact : Chaque requête doit rappeler `setUserSession()`
- Mitigation actuelle : Appelé dans `AuthService.login()` + `initializeSession()`
- Solution future : Utiliser headers HTTP personnalisés

### Solution recommandée pour production
```typescript
// Option A: Headers HTTP (recommandé)
const supabase = createClient(url, key, {
  global: {
    headers: {
      'X-User-ID': getCurrentUserId() // Envoyé à chaque requête
    }
  }
});

// Côté PostgreSQL: Lire depuis headers
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-user-id', '')::UUID;
$$ LANGUAGE SQL STABLE;
```

## 🚀 Déploiement

### Checklist pré-déploiement
- [ ] Migrer toutes les tables vers Supabase
- [ ] Appliquer migrations 005, 006, 007
- [ ] Tester login avec `admin`/`Admin@1234`
- [ ] Vérifier RLS policies actives
- [ ] Tester création utilisateur
- [ ] Tester changement de mot de passe
- [ ] Vérifier les logs d'audit
- [ ] Backup de la DB avant déploiement

### Rollback plan
```sql
-- En cas de problème, revenir à l'ancienne version
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);
-- Puis re-déployer l'ancienne version
```

## 📝 Notes techniques

### Pourquoi SECURITY DEFINER est sûr ici
1. **Validation stricte** : Bcrypt vérifie le mot de passe
2. **Pas d'injection SQL** : Utilise paramètres PostgreSQL
3. **Retour limité** : Uniquement données user + membership
4. **Audit intégré** : Mise à jour `last_login_at`
5. **Pattern standard** : Utilisé par Supabase Auth, auth0, etc.

### Alternatives considérées
- ❌ **Multiples queries + RLS** : Fragile (session perdue)
- ❌ **Désactiver RLS pendant login** : Dangereux
- ✅ **SECURITY DEFINER** : Standard, sûr, performant
- ⏳ **Headers HTTP** : Future amélioration

## 🔍 Debugging en production

### Logs utiles
```sql
-- Voir les erreurs d'authentification
SELECT * FROM pg_stat_statements
WHERE query LIKE '%login_user%'
AND calls > 0;

-- Voir les utilisateurs actifs
SELECT id, username, last_login_at
FROM users
WHERE is_active = true
ORDER BY last_login_at DESC;
```

### Tests de charge
```bash
# Simuler 100 logins concurrents
ab -n 100 -c 10 -T 'application/json' \
  -p login.json \
  https://your-api.supabase.co/rest/v1/rpc/login_user
```

## ✅ Validation finale

### Tests à effectuer
- [ ] Login admin fonctionne
- [ ] Login gérant fonctionne
- [ ] Login serveur fonctionne
- [ ] Mauvais mot de passe rejeté
- [ ] Utilisateur inactif rejeté
- [ ] RLS bloque accès non autorisé
- [ ] Performance < 100ms par login
