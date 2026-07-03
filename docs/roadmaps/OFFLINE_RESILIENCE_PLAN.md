# Plan de Résilience Offline - Session & Hardening (V2 - Triple-Lock)

Ce plan vise à garantir une fiabilité de 100% sur les chiffres et les stocks, même en mode dégradé, en éliminant les effets de bord (clignotements, CA à zéro, doublons).

## 🛡️ Stratégie "Triple-Lock" (Vision Rayons X)

### 1. Lock CA (Revenue Stats)
*   **Problème** : `useRevenueStats` écrase le cache du CA par "0" quand le serveur est injoignable.
*   **Correction** :
    *   **Garde des données stales** : Utiliser `keepPreviousData: true` dans React Query pour conserver les anciennes valeurs pendant le refetch.
    *   **Fusion Local + Serveur** : Dans le `queryFn`, fusionner les stats serveur + ventes de la `offlineQueue`.
    *   **Déduplication** : Filtrer les ventes locales via `syncManager.getRecentlySyncedKeys()` pour éviter le double-comptage pendant la fenêtre de 10s post-sync.

### 2. Lock Stock (Inventory UI)
*   **Problème** : Les ventes offline ne sont pas déduites du stock affiché tant qu'elles ne sont pas synchronisées.
*   **Correction** : Modifier `useStockManagement.ts` (ligne 256, `allProductsStockInfo` useMemo) :
    *   Récupérer les opérations `CREATE_SALE` pending de la queue.
    *   Déduire les quantités vendues (`item.quantity`) du `availableStock` de chaque produit.
    *   Appliquer la même logique de déduplication via `recentlySyncedKeys` pour éviter les doubles déductions.

### 3. Lock Transition (Anti-Flash)
*   **Problème** : Race condition entre la suppression de la queue (rapide) et l'indexation serveur (lente).
*   **Correction** : Implémenter une zone tampon dans `SyncManager.ts`. Les clés d'idempotence des ventes synchronisées restent actives 10s pour "boucher le trou" visuel.

---

## 🛠️ Sécurité & Robustesse Additionnelle

### A. Résolution de Conflits (Optimistic Locking)
*   **Problème** : Deux managers éditent les mêmes paramètres (un offline, un online).
*   **Correction** :
    *   **Migration SQL** : Ajouter `updated_at TIMESTAMPTZ` à la table `bars` avec trigger auto-update.
    *   **Détection dans SyncManager** : Avant d'appliquer `UPDATE_BAR`, comparer `server.updated_at` vs `operation.timestamp`.
    *   **Si conflit** : Retourner `{ success: false, error: 'CONFLICT_DETECTED', shouldRetry: false }` pour résolution manuelle.

### B. Validation de Session avant Sync
*   **Problème** : La synchronisation échoue (401) si le token a expiré pendant la coupure.
*   **Correction** : `SyncManager` tente systématiquement un `refreshSession()` avant de lancer le process si nécessaire.

### C. Quota IndexedDB
*   **Problème** : Crash si `QuotaExceededError`.
*   **Correction** : Catch l'erreur dans `offlineQueue.ts` et purger les logs/opérations très anciennes (> 7 jours) pour libérer de l'espace.

### D. UX Clean Navigation (Double Toasts)
*   **Correction** : Désactiver le toast de succès dans `onSuccess` pour les mutations optimistes si le toast offline a déjà été affiché.

---

## 📋 Actions détaillées

### Fichiers à modifier

1.  **[CREATE] Migration SQL `xxx_add_updated_at_to_bars.sql`** :
    ```sql
    ALTER TABLE bars ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    CREATE OR REPLACE FUNCTION update_bars_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER bars_updated_at_trigger
      BEFORE UPDATE ON bars
      FOR EACH ROW EXECUTE FUNCTION update_bars_updated_at();
    ```

2.  **[MODIFY] `SyncManager.ts`** :
    *   **Lock Flash** : Alimenter `recentlySyncedKeys` dans `syncCreateSale()` après succès RPC (ligne ~232).
    *   **Token Safety** : Ajouter `supabase.auth.getSession()` + `refreshSession()` au début de `syncOperation()`.
    *   **Conflit Detection** : Dans `syncUpdateBar()`, fetch `updated_at` du serveur et comparer avec `operation.timestamp`.

3.  **[MODIFY] `useRevenueStats.ts`** :
    *   **Cache Resilience** : Ajouter `keepPreviousData: true` à la config React Query.
    *   **Déduplication** : Dans le `queryFn`, appeler `syncManager.getRecentlySyncedKeys()` et filtrer les `offlineSales`.

4.  **[MODIFY] `useStockManagement.ts`** (ligne 256, `allProductsStockInfo`) :
    *   Récupérer `offlineQueue.getOperations({ status: 'pending', type: 'CREATE_SALE' })`.
    *   Soustraire `item.quantity` de `infoMap[item.product_id].availableStock`.
    *   Filtrer via `recentlySyncedKeys` pour éviter double-déduction.

5.  **[MODIFY] `offlineQueue.ts`** (méthode `addOperation()`) :
    *   Wrapper le `tx.objectStore().add()` dans un try-catch.
    *   Si `QuotaExceededError`, purger opérations > 7 jours et retry.

6.  **[MODIFY] `useSalesMutations.ts`** :
    *   Dans le `mutationFn`, déplacer le toast optimiste AVANT le `onSuccess`.
    *   Dans `onSuccess`, skip le toast si `sale.id.startsWith('sync_')`.

7.  **[VERIFY] `SalesService.ts`** :
    *   Confirmer que `create_sale_idempotent` RPC est bien utilisé (déjà fait selon commit 3d2f81b).

---

## ⏱️ Estimation & Priorisation

| Priorité | Tâche | Fichiers | Temps | Impact |
|----------|-------|----------|-------|--------|
| **🔴 P0** | Lock Flash (recentlySyncedKeys) | SyncManager.ts | 1h | Élimine le flash de CA |
| **🔴 P0** | Lock CA (keepPreviousData + fusion) | useRevenueStats.ts | 2h | Zéro CA affiché |
| **🔴 P0** | Token Safety (refreshSession) | SyncManager.ts | 1h | Prévient échec sync 401 |
| **🟡 P1** | Quota Protection | offlineQueue.ts | 1h | Évite crash navigateur |
| **🟡 P1** | Lock Stock (déduction offline) | useStockManagement.ts | 2h | Stock temps réel |
| **🟢 P2** | Conflit Resolution | Migration + SyncManager | 3h | Protection multi-user |
| **🟢 P3** | UX Toast Cleanup | useSalesMutations.ts | 30min | Polish UX |

**Total estimé : 10h30 de développement + 4h de tests = ~15h**

### Ordre d'implémentation recommandé

**Sprint 1 (6h - Version Stable)** :
1. Lock Flash (1h)
2. Lock CA (2h)
3. Token Safety (1h)
4. Quota Protection (1h)
5. UX Cleanup (30min)
6. Tests manuels (30min)

**Sprint 2 (9h - Version Complète)** :
1. Migration SQL (30min)
2. Lock Stock (2h)
3. Conflit Resolution (3h)
4. Tests E2E complets (3h30)
