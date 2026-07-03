# Plan de Migration vers Supabase Auth Native

## 🎯 Objectif
Migrer de custom auth (username/password) vers Supabase Auth (email/password) tout en gardant la compatibilité avec les données existantes.

## 📋 Plan détaillé (version améliorée)

### **Tâche 1 : Préparer public.users pour la synchronisation**

#### 1.1 Ajouter la colonne email
```sql
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Constraint de validation
ALTER TABLE users
ADD CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');
```

#### 1.2 Migrer le super admin existant
```sql
-- Générer un email temporaire pour le super admin
UPDATE public.users
SET email = username || '@bartender.local'
WHERE username = 'admin';

-- OU forcer un vrai email (à faire manuellement)
UPDATE public.users
SET email = 'votre-email@example.com'
WHERE username = 'admin';
```

---

### **Tâche 2 : Créer la synchronisation auth.users ↔ public.users**

#### 2.1 Fonction de création de profil (atomique)
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer le profil dans public.users
  INSERT INTO public.users (
    id,
    username,
    email,
    name,
    phone,
    avatar_url,
    is_active,
    first_login
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    true,
    true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

#### 2.2 Fonction de mise à jour de profil
```sql
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Synchroniser les changements
  UPDATE public.users
  SET
    email = NEW.email,
    updated_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();
```

---

### **Tâche 3 : Migrer les utilisateurs existants vers auth.users**

#### 3.1 Créer une fonction de migration (à exécuter une seule fois)
```sql
CREATE OR REPLACE FUNCTION migrate_users_to_auth()
RETURNS TEXT AS $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Pour chaque utilisateur dans public.users
  FOR v_user IN
    SELECT * FROM public.users
    WHERE email IS NOT NULL
    AND is_active = true
  LOOP
    -- Créer dans auth.users (via Admin API côté application)
    -- Note: Ceci doit être fait via l'Admin API Supabase, pas en SQL direct
    v_count := v_count + 1;
  END LOOP;

  RETURN 'Migration complète: ' || v_count || ' utilisateurs';
END;
$$ LANGUAGE plpgsql;
```

**⚠️ IMPORTANT** : La création dans `auth.users` doit se faire via l'**Admin API** côté application, pas en SQL direct.

---

### **Tâche 4 : Mettre à jour les RLS policies**

#### 4.1 Remplacer get_current_user_id() par auth.uid()
```sql
-- Supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS get_current_user_id();

-- Mettre à jour is_super_admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()  -- ✅ Changement ici
    AND role = 'super_admin'
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Mettre à jour is_bar_member
CREATE OR REPLACE FUNCTION is_bar_member(bar_id_param UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()  -- ✅ Changement ici
    AND bar_id = bar_id_param
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;

-- Mettre à jour get_user_role
CREATE OR REPLACE FUNCTION get_user_role(bar_id_param UUID) RETURNS TEXT AS $$
  SELECT role FROM bar_members
  WHERE user_id = auth.uid()  -- ✅ Changement ici
  AND bar_id = bar_id_param
  AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Mettre à jour is_promoteur_or_admin
CREATE OR REPLACE FUNCTION is_promoteur_or_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_members
    WHERE user_id = auth.uid()  -- ✅ Changement ici
    AND role IN ('super_admin', 'promoteur')
    AND is_active = true
  );
$$ LANGUAGE SQL STABLE;
```

#### 4.2 Mettre à jour les policies users
```sql
-- Users can view own profile
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (id = auth.uid() OR is_super_admin());  -- ✅ Changement ici

-- Users can update own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid());  -- ✅ Changement ici
```

---

### **Tâche 5 : Migrer AuthService vers Supabase Auth**

#### 5.1 Nouveau login avec email
```typescript
static async login(credentials: { email: string; password: string }): Promise<AuthUser> {
  try {
    // 1. Login via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (authError || !authData.user) {
      throw new Error('Email ou mot de passe incorrect');
    }

    // 2. Récupérer le profil + membership
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const { data: membership } = await supabase
      .from('bar_members')
      .select('role, bar_id, bars(name)')
      .eq('user_id', authData.user.id)
      .eq('is_active', true)
      .single();

    // 3. Construire AuthUser
    const authUser: AuthUser = {
      id: authData.user.id,
      email: authData.user.email!,
      username: profile?.username || '',
      name: profile?.name || '',
      phone: profile?.phone || '',
      avatar_url: profile?.avatar_url,
      is_active: profile?.is_active ?? true,
      first_login: profile?.first_login ?? false,
      created_at: authData.user.created_at,
      updated_at: authData.user.updated_at || '',
      last_login_at: profile?.last_login_at,
      role: membership?.role as AuthUser['role'],
      barId: membership?.bar_id || '',
      barName: (membership?.bars as any)?.name || '',
    };

    // 4. Stocker dans localStorage
    localStorage.setItem('auth_user', JSON.stringify(authUser));

    return authUser;
  } catch (error: any) {
    throw new Error(handleSupabaseError(error));
  }
}
```

#### 5.2 Nouveau signup
```typescript
static async signup(
  credentials: {
    email: string;
    password: string;
    name: string;
    phone: string;
    username?: string;
  },
  barId: string,
  role: 'gerant' | 'serveur'
): Promise<AuthUser> {
  try {
    // 1. Créer l'utilisateur dans auth.users
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          name: credentials.name,
          phone: credentials.phone,
          username: credentials.username || credentials.email.split('@')[0],
        },
      },
    });

    if (authError || !authData.user) {
      throw new Error('Erreur lors de la création du compte');
    }

    // 2. Le trigger handle_new_user() crée automatiquement le profil

    // 3. Créer le membership
    await supabase.from('bar_members').insert({
      user_id: authData.user.id,
      bar_id: barId,
      role: role,
      assigned_by: auth.uid(), // ID de l'utilisateur qui crée
      is_active: true,
    });

    // 4. Récupérer le profil complet
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    return profile as AuthUser;
  } catch (error: any) {
    throw new Error(handleSupabaseError(error));
  }
}
```

#### 5.3 Écouter les changements d'auth
```typescript
// Dans AuthContext
useEffect(() => {
  // Écouter les changements d'authentification
  const { data: authListener } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // L'utilisateur vient de se connecter
        console.log('User signed in:', session.user.id);
      } else if (event === 'SIGNED_OUT') {
        // L'utilisateur vient de se déconnecter
        setCurrentSession(null);
      }
    }
  );

  return () => {
    authListener.subscription.unsubscribe();
  };
}, []);
```

---

### **Tâche 6 : Nettoyer le code obsolète**

#### 6.1 Supprimer les fonctions RPC custom
```sql
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS set_user_session(UUID);
DROP FUNCTION IF EXISTS validate_password(TEXT, TEXT);
```

#### 6.2 Supprimer le code frontend obsolète
```typescript
// Supprimer de AuthService
- initializeSession()
- setUserSession()

// Supprimer de BarsService
- Les appels à set_user_session()
```

---

## 🔄 Migration étape par étape

### Phase 1 : Préparation (sans casser l'existant)
1. Ajouter colonne `email` à `public.users`
2. Créer les triggers de synchronisation
3. Tester la création d'un utilisateur test

### Phase 2 : Migration des données
1. Ajouter email au super admin existant
2. (Optionnel) Créer le super admin dans `auth.users` via Admin API

### Phase 3 : Mise à jour du code
1. Mettre à jour les RLS policies
2. Migrer `AuthService.login()` et `signup()`
3. Mettre à jour `AuthContext` avec `onAuthStateChange`

### Phase 4 : Nettoyage
1. Tester tout le flux end-to-end
2. Supprimer les fonctions RPC obsolètes
3. Supprimer le code frontend obsolète

### Phase 5 : Bonus (optionnel)
1. Ajouter récupération de mot de passe par email
2. Ajouter OTP par téléphone

---

## ⚠️ Points d'attention

1. **Backup obligatoire** avant toute migration
2. **Tester en dev** avant production
3. **Garder username** pour compatibilité (optionnel pour affichage)
4. **Email obligatoire** à partir de maintenant
5. **Migration des utilisateurs existants** via Admin API

---

## ✅ Checklist de validation

- [ ] Colonne email ajoutée à public.users
- [ ] Triggers de synchronisation créés
- [ ] Super admin migré avec email
- [ ] RLS policies mises à jour
- [ ] AuthService migré vers Supabase Auth
- [ ] Login fonctionne avec email/password
- [ ] Signup crée correctement user + membership
- [ ] RLS fonctionne (pas de 401)
- [ ] First login détecté
- [ ] Change password fonctionne
- [ ] Code obsolète supprimé
