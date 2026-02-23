# 📋 Rapport d'Audit Expert : Fonctionnement du "Mode Simplifié"

**Date :** 23 Février 2026
**Auditeur :** Antigravity (Expert Ingénierie Logicielle)
**Sujet :** Analyse complète de l'architecture, de la sécurité et du flux de données conditionnant le Mode Simplifié de BarTender.

---

## 1. Synthèse Exécutive

Le "Mode Simplifié" est une mécanique d'adaptation métier essentielle du système BarTender, conçue pour les établissements où les serveurs n'utilisent pas leurs propres terminaux pour enregistrer les ventes. Dans ce mode, la responsabilité de la saisie (et sa validation immédiate) incombe au gérant ou à la caisse centrale, tout en assurant l'attribution de la vente au serveur réel (via un système de mapping).

**Conclusion Globale :** L'implémentation est globalement **robuste, sécurisée et bien pensée**. Le couplage entre le Frontend (React Context), le Backend (Supabase RPCs \u0026 RLS) et le système Hors-Ligne (Offline Queue) démonte une architecture de qualité "Enterprise-ready". 

Quelques légères dettes techniques et optimisations potentielles (notées en section 5) ont été relevées pour parfaire la solution.

---

## 2. Audit de l'Architecture et du Frontend

### Points Solides 🟢
1. **Centralisation de l'État :** La variable `isSimplifiedMode` est calculée de manière dérivée (`useMemo`) directement depuis les paramètres du bar (`currentBar.settings.operatingMode`) dans le `BarContext.tsx`. Cela élimine les risques de désynchronisation d'état.
2. **Impact Dynamique sur l'UI :** 
   - Le composant `Cart.tsx` et `QuickSaleFlow.tsx` conditionnent dynamiquement l'affichage d'un sélecteur de serveur (`ServerMappingsManager`). 
   - L'utilisation du hook `useServerMappings()` garantit le chargement hors-ligne des alias (ex: "Ahmed" \u003e UUID).
3. **Optimisation des Rôles :** Les serveurs connectés sur une application configurée en mode simplifié voient automatiquement le bouton de vente (`FloatingButton`) masqué (réf: `Cart.tsx`, ligne 144 : `shouldHide = ... || (isSimplifiedMode \u0026\u0026 isServerRole)`). 

### Points à Corriger / Améliorer 🟠
- *Dette Technique - React Query :* Dans `QuickSaleFlow.tsx`, de nombreuses dépendances (`isSimplifiedMode`, `createSale`, `currentBar`) sont passées aux dépendances de hooks ou fonctions mémorisées. Une vigilance est nécessaire sur les re-renders excessifs si le paramètre du bar devait changer "à chaud".

---

## 3. Audit Backend et Sécurité (Supabase \u0026 RLS)

### Points Solides 🟢
1. **Verrouillage Strict Mode-Aware (RLS) :** La politique `20251224130300_add_simplified_mode_sale_creation_policy.sql` est un modèle de sécurité zero-trust :
   - Le SGBD bloque de lui-même (indépendamment du Frontend) la création de ventes par un rôle `serveur` si `settings-\u003e\u003e'operatingMode' = 'simplified'`.
2. **Traçabilité Atomique (server_id vs created_by) :** 
   - L'ajout d'une distinction stricte entre `sold_by`/`created_by` (le gérant qui tape) et `server_id` (le serveur qui sert le client) est parfaitement géré (migrations de fin Décembre 2025).
   - Les requêtes d'analyse (`top_products_by_server`) ont bien été adaptées pour supporter la bascule entre "Full Mode" et "Simplified Mode" en consolidant intelligemment `server_id` OR `created_by`.

### Points à Corriger / Améliorer 🟠
- *Risque d'Incohérence Historique (Mode Switching) :* Bien que la colonne `operating_mode_at_creation` ait été ajoutée (`20251226120000`), toute bascule fréquente entre le mode complet et simplifié d'un bar (si le gérant s'amuse avec le bouton) peut scinder les vues ou complexifier les requêtes analytiques à long terme. La logique a l'air gérée mais nécessitera de lourds index B-Tree sur de grands volumes.

---

## 4. Audit du Mode Hors-Ligne \u0026 Synchronisation

### Points Solides 🟢
1. **Élévation de Privilège Offline Transparente :** Dans `useSalesMutations.ts`, la logique `const canWorkOffline = isManagerOrAdmin || isSimplifiedMode;` est la clé de voûte de la résilience. Elle assume brillamment que si le bar est en mode simplifié, le terminal est celui du gérant et mérite la persistance hors-ligne totale.
2. **Dual-Casing Stratégie (Phase 15) :** Dans `sales.service.ts` (`mapOperationToOfflineSale`), la présence de `server_id` et `serverId` contourne les problèmes de parseurs capricieux entre le cache de l'UI et les typages stricts de Supabase. C'est robuste.
3. **Idempotence Hors-Ligne :** Le jeton `idempotency_key` (Lock Flash) est injecté même sur la file d'attente hors ligne, ce qui élimine les cas de ventes doubles à la reconnexion réseau, même pour les ventes créées au nom d'un serveur tiers.

---

## 5. Recommandations et Plan d'Action Correctif

1. **Vérification de la purge des mappings :**
   S'assurer que lors de la suppression d'un membre d'un bar (`removeBarMember` dans le `BarContext`), son mapping éventuel (dans la table `server_name_mappings`) est purgé ou désactivé, de sorte que le gérant ne puisse plus lui attribuer de ventes. *(Action SQL Recommandée : Ajouter un `ON DELETE CASCADE` ou un trigger).*
2. **Gestion de l'historique RLS :**
   Continuer le monitoring des performances SQL sur la policy `Bar members can create sales with mode restriction` (ligne 49). Exécuter un `SELECT COALESCE(b.settings-\u003e\u003e'operatingMode', 'full')` lors d'un `INSERT` pour *chaque* ligne ajoutée dans un panier lourd (~50 articles) peut causer des goulots d'étranglement de milliseconds (N+1 Selects dans un RLS). Penser à encapsuler ça sous une fonction `STABLE` Postgres pour un cache par transaction.
3. **Notification "Live" du Mode :**
   Si le promoteur change le "Mode" de son bar à distance, la souscription Realtime (Supabase) devrait forcer un rechargement d'application pour les serveurs locaux afin de s'assurer que leur bouton de vente ou leurs autorisations soient révoqués sans rafraîchissement manuel de la page.

---
*Fin du Rapport.*
*Un audit de qualité réalisé par l'expertise d'Antigravity.*
