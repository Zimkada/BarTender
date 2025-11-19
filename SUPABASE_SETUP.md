# 🎯 Supabase Integration - Setup Guide

## ✅ Étapes Complétées

1. ✅ Installation de `@supabase/supabase-js`
2. ✅ Création du fichier `.env` avec les credentials
3. ✅ Configuration du client Supabase (`src/lib/supabase.ts`)
4. ✅ Création du schéma de base de données complet
5. ✅ Définition des politiques RLS (Row Level Security)
6. ✅ Génération des types TypeScript

## 🔧 Configuration Requise sur Supabase

### 1. Exécuter les Migrations SQL

Connectez-vous à votre projet Supabase : https://yekomwjdznvtnialpdcz.supabase.co

**Étape 1 : Accédez à l'éditeur SQL**
- Dashboard Supabase > SQL Editor > New Query

**Étape 2 : Exécutez les migrations dans l'ordre**

#### Migration 1 : Schéma initial
```bash
# Copiez le contenu de: supabase/migrations/001_initial_schema.sql
# Collez dans l'éditeur SQL et exécutez (Run)
```

#### Migration 2 : Politiques RLS
```bash
# Copiez le contenu de: supabase/migrations/002_rls_policies.sql
# Collez dans l'éditeur SQL et exécutez (Run)
```

### 2. Créer un Utilisateur Super Admin Initial

Une fois les migrations exécutées, créez le premier utilisateur :

```sql
-- Créer le super admin initial
INSERT INTO users (id, username, password_hash, name, phone, is_active, first_login)
VALUES (
  uuid_generate_v4(),
  'admin',
  -- Pour le hash, utilisez bcrypt côté client ou un mot de passe temporaire
  -- Nous créerons une fonction de hash côté backend
  'TEMP_HASH_TO_REPLACE',
  'Super Administrateur',
  '+22900000000',
  true,
  true
);

-- Récupérer l'ID du super admin créé
SELECT id, username FROM users WHERE username = 'admin';

-- Créer une entrée bar_members pour donner le rôle super_admin
INSERT INTO bar_members (user_id, bar_id, role, assigned_by)
VALUES (
  '[ID_DU_SUPER_ADMIN]',
  uuid_generate_v4(), -- Bar fictif pour le super admin
  'super_admin',
  '[ID_DU_SUPER_ADMIN]'
);
```

## 📊 Structure de la Base de Données

### Tables Principales

1. **users** - Utilisateurs du système
2. **bars** - Bars (multi-tenant)
3. **bar_members** - Association users ↔ bars avec rôles
4. **categories** - Catégories de produits par bar
5. **products** - Produits par bar
6. **supplies** - Approvisionnements
7. **sales** - Ventes avec workflow de validation
8. **returns** - Retours produits
9. **consignments** - Consignations
10. **expenses** - Dépenses
11. **salaries** - Salaires
12. **accounting_transactions** - Transactions comptables
13. **admin_notifications** - Notifications admin
14. **audit_logs** - Logs d'audit

### Sécurité RLS

Toutes les tables sont protégées par Row Level Security :
- ✅ Isolation multi-tenant (chaque bar voit uniquement ses données)
- ✅ Contrôle d'accès basé sur les rôles
- ✅ Super admins ont accès complet
- ✅ Promoteurs gèrent leurs bars
- ✅ Gérants gèrent un bar spécifique
- ✅ Serveurs accès limité (ventes uniquement)

## 🚀 Prochaines Étapes

1. **Créer la couche de services** (`src/services/supabase/`)
   - auth.service.ts - Authentification
   - bars.service.ts - Gestion des bars
   - products.service.ts - Gestion des produits
   - sales.service.ts - Gestion des ventes
   - etc.

2. **Migrer AuthContext** pour utiliser Supabase Auth

3. **Migrer AppContext** pour utiliser les services Supabase

4. **Tests d'intégration**
   - Test de connexion
   - Test CRUD pour chaque entité
   - Test RLS (isolation multi-tenant)

## ⚠️ Points d'Attention

1. **Hashing des mots de passe** : Utiliser bcrypt côté client avant l'insertion
2. **Gestion des erreurs** : Wrapper toutes les requêtes avec try/catch
3. **Optimistic updates** : Garder l'UX fluide avec des updates locaux
4. **Offline mode** : Implémenter une queue de synchronisation
5. **Migration des données** : Script pour migrer localStorage → Supabase

## 📝 Notes Techniques

- **Base de données** : PostgreSQL 15
- **Auth** : Supabase Auth avec JWT
- **Storage** : Supabase Storage pour les images produits
- **Real-time** : Optionnel - pour sync multi-appareils
- **Types** : 100% type-safe avec types générés

## 🔐 Environnement Variables

```env
VITE_SUPABASE_URL=https://yekomwjdznvtnialpdcz.supabase.co
VITE_SUPABASE_ANON_KEY=[VOTRE_CLE]
```

✅ Déjà configuré dans `.env` (ignoré par git)
