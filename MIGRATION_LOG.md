# Historique des Migrations Supabase

## 20251217220000_create_is_user_super_admin_rpc.sql + admin-update-password Edge Function (2025-12-17 22:00:00)

**Status**: ✅ Deployed and Tested Successfully
**Date**: 2025-12-17
**Feature**: Dual-flow Password Management System for Admin Users
**Related Issue**: Broken `admin_send_password_reset` RPC using non-existent `auth.admin_generate_link()`

### Overview

Implemented a comprehensive password management system with two distinct flows:
1. **Real Email Users**: Native Supabase Auth password reset via email
2. **Fictional Email Users** (@bartender.app): Direct password setting by super admins via Edge Function

### Problem Statement

The original system had a broken RPC function `admin_send_password_reset` that attempted to use non-existent `auth.admin_generate_link()` Supabase function. This prevented admins from resetting user passwords. Additionally, there was no distinction between real email vs fictional account users.

### Solution Implemented

**Files Created:**

1. **supabase/functions/admin-update-password/index.ts** (NEW)
   - Secure Edge Function with full validation and error handling
   - Validates JWT token from Authorization header
   - Checks caller is super_admin via `is_user_super_admin(p_user_id)` RPC
   - Updates password using Supabase Auth admin API
   - Sets `first_login = true` to force password change on next login
   - Logs admin action to audit trail (non-fatal if logging fails)
   - Proper CORS headers, error responses (401/403/400/500)

2. **supabase/migrations/20251217220000_create_is_user_super_admin_rpc.sql** (NEW)
   - RPC function: `is_user_super_admin(p_user_id UUID) RETURNS BOOLEAN`
   - Why needed: Original `is_super_admin()` uses `auth_user_id()` which doesn't work in Edge Function context with service_role_key
   - Solution: Parameter-based RPC that accepts user_id explicitly
   - Checks: role='super_admin' AND is_active=true in bar_members table
   - Permissions: Granted to authenticated and service_role users
   - SECURITY DEFINER + STABLE clauses for security and performance

3. **src/components/AdminSetPasswordModal.tsx** (NEW)
   - Modal component for super admins to set passwords for fictional email users
   - Password validation (minimum 6 characters)
   - Password confirmation matching
   - Loading state and error handling
   - Integrates with `admin-update-password` Edge Function
   - Auto-closes on success and refreshes user list

**Files Modified:**

4. **src/pages/admin/UsersManagementPage.tsx** (MODIFIED)
   - Added email type detection: `isFictionalEmail()` helper function
   - Updated `handleSendPasswordReset()`:
     - Real emails: Calls native `supabase.auth.resetPasswordForEmail()`
     - Fictional emails: Opens `AdminSetPasswordModal` instead
   - Updated button rendering:
     - Real email (amber): "Send Password Reset Email" button
     - Fictional email (purple): "Set Password" button
   - Added modal component at bottom with success callback

### Errors Encountered & Fixed

**Error 1: 403 Forbidden - "Permission denied: only super_admins can perform this action"**
- **Root Cause**: Edge Function used `supabase.rpc('is_super_admin')` without parameters, which calls `auth_user_id()` that relies on RLS context. Edge Functions with service_role_key have no auth context.
- **Diagnosis**: Analyzed the RPC function and identified context mismatch
- **Solution**: Created dedicated `is_user_super_admin(p_user_id UUID)` RPC with explicit parameter passing
- **Deployed**: SQL migration executed successfully

**Error 2: 500 Internal Server Error - ".catch is not a function"**
- **Root Cause**: Used `.catch()` directly on RPC call, but Supabase client returns {data, error} object, not direct Promise
- **Original Code**: `await supabaseAdmin.rpc('log_admin_action', {...}).catch(err => ...)`
- **Fixed Code**: Wrapped in `try/catch` block to handle async errors properly
- **Deployed**: Edge Function redeployed successfully

### Security Implementation

- ✅ Authorization header validation (JWT token required)
- ✅ Token verification via `supabaseAdmin.auth.getUser(token)`
- ✅ Super admin role verification via dedicated RPC function
- ✅ Uses service_role_key (backend only, never exposed to client)
- ✅ Password minimum length validation (6 characters)
- ✅ CORS headers for safe cross-origin access
- ✅ Audit logging of all admin password changes
- ✅ Proper error responses (401 for auth, 403 for permissions, 400 for validation, 500 for server errors)
- ✅ First login flag pattern to force password change on next login

### Testing & Validation

**Test Scenario 1: Real Email User Password Reset** ✅
- Super admin selects user with real email
- Clicks "Send Password Reset Email" button
- User receives email with password reset link
- User sets new password via email link
- User logs in with new password

**Test Scenario 2: Fictional Email User Password Set** ✅
- Super admin selects user with fictional email (@bartender.app)
- Clicks "Set Password" button
- AdminSetPasswordModal opens
- Super admin enters and confirms password
- Edge Function validates all checks (auth, super_admin role, password requirements)
- Password updated successfully via Auth admin API
- `first_login = true` flag set
- Admin action logged to audit trail
- Modal closes and user list refreshes

**Error Handling Tests** ✅
- 403 Forbidden: Non-super-admin cannot set passwords (RPC check)
- 401 Unauthorized: Missing or invalid authorization header
- 400 Bad Request: Missing fields or password too short
- 500 Server Error: Fixed with proper try/catch

### Deployment Checklist

- [x] Created AdminSetPasswordModal component
- [x] Created admin-update-password Edge Function
- [x] Deployed Edge Function to Supabase
- [x] Created is_user_super_admin RPC function
- [x] Deployed SQL migration
- [x] Updated UsersManagementPage to use new system
- [x] Fixed 403 Forbidden error (RPC context issue)
- [x] Fixed 500 Internal Server Error (.catch() syntax)
- [x] Tested fictional email password setting
- [x] Verified audit logging
- [x] Confirmed first_login flag being set

### Key Decisions

**Decision 1: Two Separate Password Flows**
- Chosen: Email detection-based routing (real vs fictional emails)
- Alternative: Single admin panel (rejected - fictional emails can't receive email)
- Rationale: Leverage native Supabase Auth for real users, custom Edge Function only for fictional emails

**Decision 2: Parameter-Based RPC for Super Admin Check**
- Chosen: `is_user_super_admin(p_user_id UUID)` with explicit parameter
- Alternative: Call auth.uid() in RPC (rejected - doesn't work with service_role_key)
- Rationale: Explicit parameter allows Edge Function to pass caller's user ID for verification

**Decision 3: first_login Flag Pattern**
- Chosen: Set `first_login = true` after admin sets password
- Alternative: Send email notification (rejected - fictional emails can't receive email)
- Rationale: Forces user to change password on first login, enhancing security

**Decision 4: Audit Logging Non-Fatal**
- Chosen: Logging failures don't block password update
- Alternative: Fail password update if logging fails (rejected - affects user experience)
- Rationale: Logging is informational; core operation (password update) takes priority

### Production Considerations

**Security Notes**
- ✅ Service role key used only in backend Edge Function
- ✅ Never exposed to client-side code
- ✅ JWT token validation required for all requests
- ✅ Super admin role verified via dedicated RPC
- ✅ Audit trail maintained for compliance
- ✅ Password requirements enforced (minimum 6 characters)

**Performance Notes**
- ✅ RPC function uses STABLE flag for query optimization
- ✅ Single permission check per password update (efficient)
- ✅ Non-blocking audit logging (async, error-safe)
- ✅ Modal prevents accidental password updates (confirmation required)

**Scalability Notes**
- ✅ No polling or intervals
- ✅ No database subscriptions needed
- ✅ Edge Function handles concurrent requests natively
- ✅ RPC function is lightweight single-row query

---

## 20251217000000_fix_setup_promoter_bar_rpc.sql - UPDATE (2025-12-17 00:00:00.1)

**Status**: Ready for deployment
**Update Type**: Enhancement to existing migration
**Issue Fixed**: Address and phone not extracted to table columns

### Update Details

The original migration fixed the RPC column name bug (`v_bar_id` → `bar_id`) but **did not extract address and phone from `p_settings` JSONB into table columns**. This caused:

- ❌ Address and phone stayed in the JSONB `settings` field only
- ❌ Columns `bars.address` and `bars.phone` remained NULL
- ❌ BarSelector couldn't display addresses in the dropdown

**Now updated to:**

1. **Extract address and phone** from `p_settings` using `->>` operator and `::TEXT` casting
2. **Insert directly into columns** `bars.address` and `bars.phone` (not just JSONB)
3. **Include in response** JSON with `bar_address` and `bar_phone` keys
4. **Improve logging** to show extracted values in NOTICE statements

### Code Changes

```sql
-- BEFORE: Only settings JSONB
INSERT INTO bars (name, owner_id, settings, is_active)
VALUES (p_bar_name, p_owner_id, v_default_settings, true)

-- AFTER: Extract and insert address/phone to columns too
INSERT INTO bars (name, owner_id, address, phone, settings, is_active)
VALUES (
  p_bar_name,
  p_owner_id,
  COALESCE((p_settings->>'address')::TEXT, NULL),  -- Extracted from JSONB
  COALESCE((p_settings->>'phone')::TEXT, NULL),    -- Extracted from JSONB
  v_default_settings,
  true
)
```

### Result

Now address and phone are persisted to **both**:
- ✅ Database columns (for display in BarSelector)
- ✅ Settings JSONB (for backward compatibility)

---

## 20251217000002_refactor_setup_promoter_bar_parameters.sql (2025-12-17 00:00:02)

**Status**: Ready for deployment
**Date**: 2025-12-17
**Related Issues**: Address and phone not persisted to database columns
**Related Migration**: 20251217000000_fix_setup_promoter_bar_rpc.sql, 20251217000001_fix_bar_categories_name_constraint.sql

### Description

Refactorisation du RPC `setup_promoter_bar` pour accepter l'adresse et le téléphone comme paramètres séparés au lieu de les passer uniquement via `p_settings` JSONB. Cette amélioration augmente la robustesse, la performance et la maintenabilité du code.

### Root Cause

- Précédemment: `barAddress` et `barPhone` étaient passés dans `p_settings` JSONB
- Problème: Les données entraient dans `settings.address` et `settings.phone` (colonne JSONB)
- Impact: Les colonnes directes `bars.address` et `bars.phone` restaient NULL
- Conséquence: Le BarSelector ne pouvait pas afficher l'adresse des bars créés

### Solution

1. **Nouveaux paramètres**: Ajout de `p_address TEXT` et `p_phone TEXT` à la signature de la fonction
2. **Insertion directe**: Les paramètres sont insérés directement dans les colonnes `bars.address` et `bars.phone` au lieu du JSONB
3. **Type safety**: Les paramètres sont typés et validés par PostgreSQL
4. **Performance**: Pas d'extraction JSONB à chaque insertion
5. **Logging amélioré**: Affichage de l'adresse et téléphone dans les logs NOTICE

### Impact

- **Fixes**: Adresse et téléphone maintenant correctement sauvegardés dans les colonnes
- **Affected Function**: `setup_promoter_bar(uuid, text, text, text, jsonb)` - signature changée
- **Data Integrity**: Les nouvelles données seront dans les bonnes colonnes
- **Backward Compatible**: Non (breaking change de signature) - mais c'est une RPC interne, pas une API publique
- **Frontend Changes Required**: `AddBarModal.tsx` et `AuthService.setupPromoterBar()`

### Testing Recommendations

1. Déployer cette migration après les migrations 20251217000000 et 20251217000001
2. Créer un nouveau bar avec adresse et téléphone via l'interface admin
3. Vérifier dans le BarSelector que l'adresse s'affiche correctement
4. Vérifier en base que `bars.address` et `bars.phone` sont remplies (pas NULL)
5. Vérifier que `get_my_bars()` RPC retourne les valeurs correctes

### Migration Order

```
20251217000000_fix_setup_promoter_bar_rpc.sql
    ↓
20251217000001_fix_bar_categories_name_constraint.sql
    ↓
20251217000002_refactor_setup_promoter_bar_parameters.sql
```

---

## 20251217000001_fix_bar_categories_name_constraint.sql (2025-12-17 00:00:01)

**Status**: Ready for deployment
**Date**: 2025-12-17
**Related Issue**: null value in column "name" of relation "bar_categories" violates not-null constraint
**Related Migration**: 20251217000000_fix_setup_promoter_bar_rpc.sql (previous)

### Description

Correction d'une contrainte NOT NULL héritée d'un schéma legacy sur la colonne `bar_categories.name`. Cette colonne n'est pas utilisée par le schéma moderne qui utilise `global_category_id` + `custom_name` à la place. Le RPC `setup_promoter_bar` essayait d'insérer des catégories globales liées (où `name` serait NULL) et échouait.

### Root Cause

- La table `bar_categories` a une colonne `name` legacy héritée d'une version antérieure
- Cette colonne est définie avec NOT NULL
- Le schéma moderne (001_initial_schema.sql) n'a pas de colonne `name` mais utilise un hybrid approach:
  - Catégories globales liées: `global_category_id` (non NULL) + `custom_name` (NULL)
  - Catégories custom: `global_category_id` (NULL) + `custom_name` (non NULL)
- Quand le RPC `setup_promoter_bar` insère `INSERT INTO bar_categories (bar_id, global_category_id, is_active)`, il ne fournit pas de `name`, ce qui cause la violation

### Solution

1. Vérifie si la colonne `name` existe et est NOT NULL
2. La rend NULLABLE si elle existe et est contrainte
3. Remplit les valeurs NULL existantes avec des noms générés (`'Category ' || UUID_substring`) pour la sécurité des données
4. Recharge le schéma Supabase

### Impact

- **Fixes**: `null value in column "name" ... violates not-null constraint` lors de la création de bars
- **Affected Function**: Indirect (fix dans la base pour supporter le RPC `setup_promoter_bar`)
- **Data Integrity**: Toutes les catégories existantes auront un nom (generate ou existant)
- **Backward Compatible**: Oui (rend nullable, n'affecte pas les données existantes)

### Testing Recommendations

1. Déployer cette migration après 20251217000000_fix_setup_promoter_bar_rpc.sql
2. Re-tester création de bar pour promoteur existant
3. Vérifier que les catégories sont correctement liées au bar
4. Vérifier que les requêtes `SELECT` sur les catégories fonctionnent

---

## 20251217000000_fix_setup_promoter_bar_rpc.sql (2025-12-17 00:00:00)

**Description :** Correction critique d'un bug PL/pgSQL dans la fonction RPC `setup_promoter_bar` pour permettre la création de bars pour les promoteurs existants via l'interface admin.
**Domaine :** Gestion des Utilisateurs / Bar Creation / Bug Fix
**Impact :**
- **Problème identifié:** RPC utilisait le nom de variable `v_bar_id` comme nom de colonne dans la clause INSERT de `bar_members`
  - Erreur levée: `column "v_bar_id" of relation "bar_members" does not exist`
  - La table `bar_members` a une colonne `bar_id`, pas `v_bar_id`
- **Solution appliquée:**
  - Correction de la syntaxe PL/pgSQL: `INSERT INTO bar_members (user_id, bar_id, role, ...)` (colonne correcte)
  - La variable `v_bar_id` reste en VALUES: `VALUES (p_owner_id, v_bar_id, 'promoteur', ...)`
  - Distinction claire entre noms de colonnes (en clause INSERT) et variables (en VALUES)
- **Fonctionnalité débloquée:**
  - Feature "Ajouter un bar" pour les promoteurs existants en interface admin
  - Super admin peut maintenant créer des bars additionnels pour promoteurs via bouton Building2 dans le tableau UsersManagementPage
  - Workflow: Admin clique Building2 → Modal s'ouvre → Remplit formulaire (nom, adresse, téléphone) → RPC exécute sans erreur
- **Fichiers affectés:**
  - `src/components/AddBarForm.tsx` (new - formulaire réutilisable)
  - `src/components/AddBarModal.tsx` (new - orchestration modal)
  - `src/pages/admin/UsersManagementPage.tsx` (modified - intégration bouton)
- **Compatibilité:** Rétroactive compatible (fix uniquement, pas de breaking changes)
- **Testing recommandé:**
  1. Déployer la migration
  2. Tester création d'un bar pour un promoteur existant via UI
  3. Vérifier que bar est correctement lié au promoteur en base
  4. Vérifier permissions RLS sur le nouveau bar
---

## 2025-12-16: Audit et Corrections (Catalogue Global & Logs d'Audit)

**Description :** Session d'audit et de corrections de bugs sur les modules "Catalogue Global" et "Logs d'Audit" en se basant sur le rapport d'un expert.
**Domaine :** Catalogue Global, Logs d'Audit, Sécurité RLS
**Impact :**
- **Catalogue Global :**
  - **Correction :** La suppression des produits globaux (`deleteGlobalProduct`) a été modifiée pour utiliser un "soft-delete" (`is_active = false`), la rendant cohérente avec la suppression des catégories.
  - **Décision métier :** Il a été clarifié que la désactivation d'un produit global ne doit **pas** affecter les bars qui l'utilisent déjà. Ces derniers conservent leur autonomie et peuvent continuer à vendre le produit. Le comportement actuel est donc correct.
  - **Abandon :** La refactorisation pour la pagination a été jugée prématurée et a été annulée pour éviter de la sur-ingénierie et des régressions potentielles.
- **Logs d'Audit :**
  - **Correction (Bug 400) :** La fonction `getPaginatedGlobalCatalogAuditLogs` a été refactorisée pour gérer correctement les filtres de date `undefined` et pour utiliser une seule requête au lieu de deux, améliorant ainsi la performance.
  - **Correction (Bug 403) :** Un bug profond et persistant lié aux politiques de sécurité (RLS) sur la table `global_catalog_audit_log` a été identifié. Même avec des données et une fonction `is_super_admin()` correctes, l'accès était refusé.
  - **Contournement :** La RLS sur la table a été désactivée et remplacée par une fonction RPC `get_paginated_catalog_logs_for_admin` de type `SECURITY DEFINER`. Cette fonction effectue elle-même la vérification de rôle `super_admin` avant de retourner les données, contournant ainsi le bug RLS. La migration finale est `20251216180000_fix_ambiguous_columns_in_rpc.sql`.
---

## 20251215170000_fixup_and_finalize_stats_objects.sql (2025-12-15 17:00:00)

**Description :** Finalisation de la fonctionnalité "Statistiques Détaillées" pour les super-administrateurs. Ce script idempotent nettoie les tentatives précédentes et installe la version finale et sécurisée des objets liés aux statistiques annexes.
**Domaine :** Statistiques des Bars (Gestion des Utilisateurs indirectement lié via les rôles)
**Impact :
- Création de `bar_ancillary_stats_mat` (vue matérialisée pour membres, top produits avec quantités).
- Création de `bar_ancillary_stats` (vue sécurisée pour l'accès client).
- Création de `get_bar_live_alerts` (fonction RPC pour alertes stock en temps réel).
- Implémentation de la sécurité d'accès basée sur les rôles (`super_admin` ou membre du bar) pour les statistiques annexes.
- Intégration du calcul des quantités vendues pour les top produits.
---

## 20251215180000_fix_user_management_security.sql (2025-12-15 18:00:00)

**Description :** Correction des failles de sécurité critiques dans la gestion des utilisateurs. Ajout de contrôles de rôle 'super_admin' aux fonctions RPC sensibles.
**Domaine :** Gestion des Utilisateurs (Sécurité)
**Impact :**
- `get_paginated_users` : Désormais exécutable uniquement par les `super_admin`. Empêche l'énumération de tous les utilisateurs par un utilisateur non autorisé.
- `setup_promoter_bar` : Désormais exécutable uniquement par les `super_admin`. Empêche l'auto-promotion non autorisée et la création de bars illégitimes.
---

## 20251215190000_optimize_user_search.sql (2025-12-15 19:00:00)

**Description :** Optimisation de la performance des requêtes de recherche sur les utilisateurs.
**Domaine :** Gestion des Utilisateurs (Performance)
**Impact :
- Activation de l'extension PostgreSQL `pg_trgm`.
- Création d'un index GIN (`users_search_gin_idx`) sur les colonnes `name`, `email`, et `username` de la table `public.users` pour accélérer les recherches `ILIKE`.
---

## 20251215191500_extend_user_search_by_bar.sql (2025-12-15 19:15:00)

**Description :** Ajout de la capacité de recherche par nom de bar dans la fonction de pagination des utilisateurs.
**Domaine :** Gestion des Utilisateurs (Fonctionnalité / Recherche)
**Impact :**
- La fonction RPC `get_paginated_users` inclut désormais `bars.name` dans sa logique de recherche `ILIKE`.
---

## 20251215193000_add_admin_send_password_reset_rpc.sql (2025-12-15 19:30:00)

**Description :** Ajout d'une fonction RPC pour permettre aux super admins d'envoyer des liens de réinitialisation de mot de passe aux utilisateurs.
**Domaine :** Gestion des Utilisateurs (Fonctionnalité / Sécurité)
**Impact :**
- Création de la fonction RPC `admin_send_password_reset` qui prend un `user_id` et déclenche l'envoi d'un email de réinitialisation de mot de passe via Supabase Auth.
- Cette fonction est sécurisée et exécutable uniquement par les `super_admin`.
---

## 20251215200000_update_admin_send_password_reset_rpc.sql (2025-12-15 20:00:00)

**Description :** Amélioration de la fonction RPC `admin_send_password_reset` pour gérer les e-mails fictifs (`@bartender.app`).
**Domaine :** Gestion des Utilisateurs (Fonctionnalité / Sécurité)
**Impact :**
- La fonction `admin_send_password_reset` vérifie désormais si l'e-mail de l'utilisateur est un placeholder (`@bartender.app`).
- Si l'e-mail est fictif, aucun lien de réinitialisation n'est envoyé, et un message spécifique est retourné au frontend.
---

## 20251215210000_add_ancillary_stats_to_refresh_function.sql (2025-12-15 21:00:00)

**Description :** Mise à jour de la fonction globale de rafraîchissement des vues matérialisées (`refresh_all_materialized_views`) pour inclure `bar_ancillary_stats_mat`.
**Domaine :** Statistiques des Bars (Maintenance / Performance)
**Impact :**
- La vue matérialisée `bar_ancillary_stats_mat` (top produits et nombre de membres) sera désormais automatiquement rafraîchie lors de l'exécution de la fonction `refresh_all_materialized_views()`.
---

## 20251216010000_add_restrict_global_categories.sql (2025-12-16 01:00:00)

**Description :** Ajout d'une contrainte RESTRICT au niveau de la base de données pour empêcher la suppression de catégories globales utilisées par des produits.
**Domaine :** Catalogue Global (Intégrité des Données / Sécurité)
**Impact :**
- Création d'une contrainte de clé étrangère `fk_global_products_category` entre `global_products.category` et `global_categories.name`.
- `ON DELETE RESTRICT` : La base de données rejette maintenant toute tentative de suppression d'une catégorie si des produits la référencent.
- Erreur levée au superadmin: "Cette catégorie ne peut pas être supprimée car elle est utilisée par X produits".
- Protection contre l'orphelinage silencieux de produits globaux.
---

## 20251216020000_create_global_catalog_audit_log.sql (2025-12-16 02:00:00)

**Description :** Création d'un système complet d'audit logging pour tracer toutes les modifications du catalogue global (produits et catégories).
**Domaine :** Catalogue Global (Audit / Conformité)
**Impact :**
- Création de la table `global_catalog_audit_log` avec enregistrement de: action (CREATE/UPDATE/DELETE), entity_type (PRODUCT/CATEGORY), old/new values (JSONB), utilisateur, timestamp.
- Création de deux triggers (`trg_audit_global_products` et `trg_audit_global_categories`) pour capturer automatiquement toutes les modifications.
- RLS Policy: Seuls les `super_admin` peuvent consulter l'audit log.
- Indexes sur entity_type, created_at, modified_by pour requêtes efficaces.
- Permet la traçabilité complète: qui a changé quoi, quand, et l'ancienne/nouvelle valeur.
- Utile pour: compliance, debugging, rollback manual, détection d'anomalies.
---

## 20251216030000_add_restrict_local_categories.sql (2025-12-16 03:00:00)

**Description :** Ajout d'une contrainte RESTRICT au niveau de la base de données pour empêcher la suppression de catégories locales utilisées par des produits.
**Domaine :** Catégories Locales (Intégrité des Données / Sécurité)
**Impact :**
- Création d'une contrainte de clé étrangère `fk_bar_products_local_category` entre `bar_products.local_category_id` et `bar_categories.id`.
- `ON DELETE RESTRICT` : La base de données rejette toute tentative de suppression d'une catégorie locale si des produits la référencent.
- Erreur levée au manager de bar: "Cette catégorie ne peut pas être supprimée car elle est utilisée par X produits".
- Protection contre l'orphelinage silencieux de produits locaux.
- Gestion d'erreur côté application via `CategoriesService.deleteCategory()` ligne 183-184.
---

## 20251216040000_fix_audit_log_triggers.sql (2025-12-16 04:00:00)

**Description :** Correction critique des triggers d'audit logging pour résoudre l'erreur "null value in column modified_by".
**Domaine :** Catalogue Global (Audit / Bug Fix)
**Impact :**
- **Problème identifié:** `auth.uid()` retourne NULL dans le contexte de trigger PostgreSQL (pas de session utilisateur active).
- **Solution:** Utilisation d'une variable `current_user_id` avec fallback en cascade: `auth.uid()` → `NEW.created_by` → UUID système (`00000000-0000-0000-0000-000000000000`).
- Regénération complète des functions `audit_global_products()` et `audit_global_categories()`.
- Les triggers se déclencheront désormais sans erreur lors de CREATE/UPDATE/DELETE sur `global_products` et `global_categories`.
- Les logs système (modified_by = all zeros UUID) peuvent être distingués des logs utilisateurs authentifiés.
---

## 20251216050000_add_rls_to_global_products.sql (2025-12-16 05:00:00)

**Description :** Correction CRITIQUE de la faille RLS bypass sur la table global_products.
**Domaine :** Catalogue Global (Sécurité / RLS)
**Impact :**
- **Problème identifié (Issue #6 RLS Bypass):** Table `global_products` n'avait PAS RLS activée - n'importe quel utilisateur authentifié pouvait créer/modifier/supprimer tous les produits globaux!
- **Solution appliquée:**
  - Activation de RLS sur `global_products`
  - 4 policies restrictives:
    1. SELECT (READ): Tous les utilisateurs authentifiés peuvent LIRE les produits globaux
    2. INSERT (CREATE): Seuls les `super_admin` peuvent créer des produits
    3. UPDATE (MODIFY): Seuls les `super_admin` peuvent modifier des produits
    4. DELETE: Seuls les `super_admin` peuvent supprimer des produits
- **Résultat:** Protection complète par rôle - cohérente avec `global_categories` qui avait déjà RLS
- **Vérification effectuée:** Toutes les tables critiques (bar_products, bar_categories, global_categories, global_catalog_audit_log) ont maintenant RLS activée et des policies appropriées.
---

## 20251216060000_fix_cascade_and_null_constraints.sql (2025-12-16 06:00:00)

**Description :** Correction des problèmes de cascade FK et de contraintes NULL manquantes (Issues #4, #7, #10).
**Domaine :** Intégrité des Données / Sécurité
**Impact :**
- **Issue #4 - CASCADE Behavior:**
  - Modification de la FK `bar_products.global_product_id → global_products.id`
  - `ON DELETE NO ACTION` → `ON DELETE SET NULL`
  - Quand un `global_product` est supprimé, les `bar_products` qui le référencent deviennent des produits locaux indépendants (global_product_id = NULL)
  - Évite les orphelins silencieux avec FK cassées
- **Issue #10 - NULL Safety:**
  - Migration des `bar_categories.name` NULL vers noms uniques basés sur ID (`'Sans nom ' || SUBSTRING(id, 1, 8)`)
  - Ajout contrainte `NOT NULL` sur `bar_categories.name`
  - `global_products.created_by` reste NULLABLE (FK vers users.id, pas d'utilisateur système, NULL = legacy data)
  - Garantit l'intégrité des noms de catégories
- **Issue #7 - Soft-Delete (Code Application):**
  - Modification de `CategoriesService.deleteGlobalCategory()` ligne 284-302
  - Hard DELETE → Soft-delete (UPDATE `is_active = false`)
  - Gestion d'erreur pour contrainte RESTRICT sur `fk_global_products_category`
  - Cohérence avec `deleteCategory()` qui fait déjà du soft-delete
---

## 20251216070000_add_official_image_to_get_bar_products.sql (2025-12-16 07:00:00)

**Description :** Correction de l'affichage des images des produits globaux pour les bars (Issue #13).
**Domaine :** Catalogue Global / UX
**Impact :**
- **Problème identifié (Issue #13):** Les RPC `get_bar_products` et `admin_as_get_bar_products` ne retournaient pas `official_image` de `global_products`
- **Conséquence:** Les bars ne voyaient JAMAIS les images du catalogue global, même après mise à jour par le superadmin
- **Solution appliquée:**
  - Ajout de `official_image` au RETURNS TABLE des 2 RPC
  - Modification du SELECT pour inclure `gp.official_image`
  - Modification du frontend `ProductsService.getBarProducts()` ligne 286
  - Logique de fallback: `local_image || official_image || null`
- **Résultat:**
  - Les bars voient maintenant les images globales pour les produits non customisés
  - Les bars qui customisent l'image gardent leur priorité (local_image prioritaire)
  - Les produits custom sans image affichent le placeholder (NULL → null)
  - Les mises à jour d'images globales sont désormais visibles immédiatement pour tous les bars
---

## 20251216080000_fix_supabase_query_syntax.sql (2025-12-16 08:00:00)

**Description :** Correction de la syntaxe invalide des requêtes Supabase causant des erreurs 400 (Issues #14, #15).
**Domaine :** Catalogue Global / Bug Fix
**Impact :**
- **Problème identifié (Issues #14, #15):** Syntaxe `.not('is_active', 'eq', false)` invalide en Supabase (cause erreur 400)
- **Fonctions affectées:**
  - `CategoriesService.getGlobalCategories()` ligne 201
  - `ProductsService.getGlobalProducts()` ligne 90
  - `ProductsService.getGlobalProductsByCategory()` ligne 129
- **Conséquence:** Les catégories et produits supprimés (soft-deleted) réapparaissaient dans l'interface superadmin
- **Solution appliquée:**
  - Remplacement de `.not('is_active', 'eq', false)` par `.eq('is_active', true)`
  - Syntaxe correcte Supabase : méthode `.not()` prend 2 paramètres max, pas 3
- **Résultat:**
  - Les catégories et produits soft-deleted ne s'affichent plus dans le catalogue global
  - Requêtes Supabase correctement exécutées sans erreur 400
  - Cohérence avec le système soft-delete implémenté en base de données
---

## 20251216090000_set_is_active_not_null.sql (2025-12-16 09:00:00)

**Description :** Correction définitive de la nullabilité de is_active pour résoudre les erreurs de requêtes (Issue #16).
**Domaine :** Catalogue Global / Intégrité des Données
**Impact :**
- **Problème identifié (Issue #16):** Colonnes `is_active` nullables sur `global_products` et `global_categories` causaient des erreurs lors des requêtes avec `.eq('is_active', true)`
- **Tables affectées:**
  - `global_products.is_active`
  - `global_categories.is_active`
- **Solution appliquée:**
  - Ajout de `DEFAULT true` pour les futures insertions
  - Migration des valeurs NULL vers `true` (par sécurité)
  - Ajout de contrainte `NOT NULL`
- **Code corrigé:**
  - Rétablissement des filtres `.eq('is_active', true)` dans:
    - `CategoriesService.getGlobalCategories()` ligne 201
    - `ProductsService.getGlobalProducts()` ligne 90
    - `ProductsService.getGlobalProductsByCategory()` ligne 129
- **Résultat:**
  - Requêtes Supabase fonctionnent correctement avec filtres is_active
  - Catégories et produits soft-deleted ne s'affichent plus (filtrage actif)
  - Intégrité garantie: tous les nouveaux enregistrements auront `is_active = true` par défaut
  - Système soft-delete pleinement opérationnel et cohérent
---