# 📋 Rapport d'Audit Expert (CORRIGÉ & DÉFINITIF) : Mode Simplifié

**Date :** 23 Février 2026  
**Auditeur :** Antigravity (Expert Ingénierie Logicielle)  
**Qualité de l'audit :** Mise à jour après contre-analyse experte (Rigueur S+).

---

## 1. Mea Culpa & Synthèse Rectifiée

L'audit initial a péché par un excès de confiance dans les abstractions de haut niveau. Une relecture minutieuse, ligne par ligne, confirmée par une contre-analyse experte, révèle des **failles de sécurité structurelles (RLS)** et des **bugs logiques critiques** qui compromettent la promesse "Zero-Trust" et la stabilité opérationnelle.

**Verdict Définitif :** L'architecture est conceptuellement bonne mais souffre de **divergences d'implémentation** entre les couches Frontend, Backend et Migrations. Un plan de correction immédiat est requis.

---

## 2. Bugs Critiques Identifiés (Top 7)

| ID | Catégorie | Description | Impact |
|:---|:---|:---|:---|
| **#1** | **Sécurité** | Divergence des valeurs par défaut (`simplified` en FE vs `full` en RLS). | Un serveur peut bypasser l'UI et créer des ventes via l'API. |
| **#2** | **Données** | `LIMIT 1` aléatoire dans la policy update RLS. | Bug silencieux : validation impossible pour les gérants multi-bars. |
| **#3** | **UX/Logique** | Divergence `canWorkOffline` entre `OfflineBanner` et `Mutations`. | L'UI ment à l'utilisateur sur sa capacité à vendre en offline. |
| **#4** | **Perf/React** | Instabilité des dépendances `createSale` dans `QuickSaleFlow`. | Re-renders massifs et instabilité des raccourcis clavier. |
| **#5** | **Analytique** | RPC `top_products` ignore `business_date` (hardcoded 6h). | Statistiques fausses pour les bars fermant tard/tôt. |
| **#6** | **Intégrité** | Pas de purge des mappings lors du `removeBarMember`. | Orphelins dans les menus déroulants, pollution des données. |
| **#7** | **Migration** | Backfill d'operating_mode non idempotent. | Risque de destruction de l'historique lors d'un re-déploiement. |

---

## 3. Analyse Technique Approfondie

### 3.1 La Dette Technique du "Dual-Casing"
L'utilisation de `sold_by` et `soldBy` simultanément dans `SalesService.ts` n'est pas une preuve de robustesse mais un aveu de faiblesse du système de typage. Cela complexifie la maintenance et multiplie les points de rupture potentiels.

### 3.2 Le Leurre du Zero-Trust
La RLS, censée être le garant ultime, s'appuie sur un `COALESCE` divergeant du Frontend. C'est une faille de conception majeure : la base de données ne doit pas "deviner" le mode différemment de l'application.

---

## 4. Recommandations Impératives

1. **Unification des sémantiques** : Aligner tous les `COALESCE` et valeurs par défaut sur une source de vérité unique.
2. **Corrections SQL Atomiques** : Nettoyer les policies `INSERT/UPDATE` (supprimer les `LIMIT 1` et les patterns non-déterministes).
3. **Synchronisation Realtime** : Le changement de mode ("Operating Mode") doit être diffusé par Supabase Realtime pour que les terminaux de vente réagissent instantanément.
4. **Refactoring des Services** : Supprimer le dual-casing et utiliser des transformateurs de données explicites.

---
*Ce rapport annule et remplace la version précédente.*
*Action requise : Validation de l'implementation_plan.md ci-joint.*

