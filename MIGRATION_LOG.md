# Historique des Migrations Supabase

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
