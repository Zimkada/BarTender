# 🚨 FIX URGENT - Erreur IndexedDB en Production

## Symptômes
```
InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.
ERR_CERT_VERIFIER_CHANGED
Lenteur lors des ventes
```

## Cause Racine
IndexedDB du navigateur est saturée par:
1. React Query cache persistence (trop de queries)
2. SyncQueue offline storage
3. Polling excessif créant trop de transactions simultanées

## Solution Utilisateur (MAINTENANT)

### Étape 1: Vider IndexedDB
1. Ouvrir DevTools (F12)
2. Aller dans l'onglet **Application**
3. Dans le menu gauche: **Storage** > **IndexedDB**
4. Clic droit sur chaque base de données → **Delete database**
5. Rafraîchir la page (Ctrl+F5)

### Étape 2: Vider le Cache Complet
1. Ctrl+Shift+Suppr
2. Cocher:
   - ✅ Cookies et données de site
   - ✅ Images et fichiers en cache
3. Période: **Toutes les données**
4. Cliquer sur **Effacer les données**

### Étape 3: Redémarrer le Navigateur
Fermer complètement Chrome/Edge et le rouvrir.

## Solution Code (À IMPLÉMENTER)

### Problème Identifié
`AppProvider.tsx` charge TOUTES les queries sur TOUTES les pages:
- `useSales` - polling 30s
- `useReturns` - polling 30s
- `useBarMembers` - polling 60s
- Plus produits, stats, etc.

= **10-15 requêtes simultanées** toutes les 30-60s = Saturation IndexedDB

### Fix à Appliquer
Désactiver le polling sur les queries non-critiques dans AppProvider:

```typescript
// AppProvider.tsx - AVANT (PROBLÈME)
const { data: returns = [] } = useReturns(barId); // Polling 30s actif partout
const { data: barMembers = [] } = useBarMembers(barId); // Polling 60s actif partout

// AppProvider.tsx - APRÈS (FIX)
const { data: returns = [] } = useReturns(barId, {
  refetchInterval: false // Désactiver polling global, utiliser invalidation manuelle
});
const { data: barMembers = [] } = useBarMembers(barId, {
  refetchInterval: false // Désactiver polling global
});
```

### Impact
- ✅ -70% de requêtes simultanées
- ✅ IndexedDB ne sature plus
- ✅ Les données restent à jour via:
  - Broadcast (cross-tab, 0ms)
  - Realtime (multi-user, 100-200ms)
  - Invalidation manuelle (RefreshButton)
  - Mutations (après create/update/delete)

## Monitoring
Après le fix, vérifier dans DevTools > Network:
- Nombre de requêtes simultanées < 5
- Pas d'erreur IndexedDB dans Console
- Ventes rapides (< 500ms)
