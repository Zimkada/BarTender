# Historique des Migrations Supabase

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