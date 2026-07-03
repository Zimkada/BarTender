# Audit Performance & Consommation Réseau — BarTender

> **Date** : 2026-03-21
> **Mise à jour V3** : 2026-03-21 — Corrections post double contre-analyse experte (voir section Errata)
> **Contexte** : Application POS offline-first déployée en Afrique de l'Ouest (Bénin), réseau 3G/Edge instable.
> **Objectif** : Identifier les problèmes de consommation réseau et de fluidité de navigation.

---

## Bilan global : Requêtes réseau par navigation

| Page visitée | Queries Supabase déclenchées | Polling actif (intervalles) | Verdict |
|---|---|---|---|
| **HomePage (POS)** | ~7 queries | 4 pollings (30s-60s) | **Trop lourd** |
| **Dashboard** | ~11 queries | 5+ pollings | **Critique** |
| **Sales History** | ~10 queries | 4 pollings | **Trop lourd** |
| **Accounting** | ~12+ queries par onglet | 5+ pollings | **Critique** |
| **Inventory** | ~4 queries | 3 pollings | Acceptable |

### Trafic d'arrière-plan permanent (RootLayout monté)

| Source | Fréquence | Req/jour (max théorique) | Req/jour (estimé réaliste) |
|---|---|---|---|
| NetworkManager ping | 1 HEAD / 3s | 28 800 | **8 000 - 15 000** ¹ |
| Heartbeat auth | 1 appel Supabase Auth / 30s | 2 880 | **~2 500** ¹ |
| VersionCheck | 1 fetch / 5 min | 288 | ~288 |
| Polling Realtime fallback | jusqu'à 3 intervalles ² (30s-60s) | 2 160 - 4 320 | **1 000 - 3 000** ¹ |

> ¹ Les navigateurs modernes throttlent les `setInterval` à ~1/min quand l'onglet est en arrière-plan ou l'écran verrouillé. Les chiffres "max théorique" supposent 8h d'écran actif ininterrompu. Les chiffres "estimé réaliste" tiennent compte des pauses naturelles d'usage. **Le code ne contient aucune gestion de `visibilitychange`** — le throttling est uniquement celui du navigateur, non intentionnel et variable selon les moteurs/WebViews.

---

## P0 — Problèmes critiques

### 1. NetworkManager poll toutes les 3 secondes

**Fichier** : `src/services/NetworkManager.ts` (ligne 169)

```
setInterval → checkConnectivity() toutes les 3s
→ fetch HEAD /index.html (7s timeout)
→ 8 000 - 15 000 requêtes/jour/utilisateur (réaliste)
```

**Impact** : Sur réseau instable africain (3G/Edge), ce polling consomme de la bande passante avec des requêtes HEAD incessantes. Chaque ping consomme ~500 bytes + overhead TCP/TLS.

**Fait aggravant vérifié** : Le ping part systématiquement quand `navigator.onLine === true`, **même si le ping précédent a réussi 3 secondes avant** (ligne 251 : aucun short-circuit `lastPingOK`). Aucune utilisation de `document.hidden` / `visibilitychange` pour pauser le polling en arrière-plan.

**Nuance importante** : `navigator.onLine` est **non fiable en Afrique** (forfait épuisé = "online" mais pas d'accès Internet, faisceau hertzien coupé). Le ping serveur doit rester, mais à fréquence réduite.

**Recommandation** : Passer de 3s → 15-30s + ajouter `visibilitychange` pour suspendre en arrière-plan + ajouter un short-circuit `lastPingOK` (si dernier ping réussi il y a <30s, skip).

---

### 2. Heartbeat auth toutes les 30 secondes

**Fichier** : `src/layouts/RootLayout.tsx` (lignes 98-128)

```typescript
setInterval(async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
}, 30000);
```

**Point positif vérifié** : Le heartbeat skip déjà l'appel quand offline (lignes 104-107 : `if (isOffline) return`).

**Impact** : Appel `supabase.auth.getSession()` toutes les 30s **quand le réseau est actif**. Sur réseau instable, ces requêtes en échec créent des timeouts qui bloquent d'autres requêtes dans la file du navigateur (6 connexions max par domaine).

**Nuance** : Le comportement exact de `getSession()` dépend de la version de `@supabase/supabase-js`. Dans les versions récentes, `getSession()` peut retourner la session depuis la mémoire locale sans requête réseau systématique. L'impact réseau exact nécessite une mesure runtime (DevTools Network tab) pour être confirmé. Indépendamment de l'impact réseau, le heartbeat reste un **anti-pattern architectural** : `onAuthStateChange` + décodage local du `exp` JWT couvrent le même besoin sans polling.

**Alternative existante** : Supabase JWT contient `exp` — suffisant pour détecter l'expiration sans appel réseau. Supabase fournit `onAuthStateChange` qui notifie déjà les changements de session.

---

### 3. `useUnifiedStock` instancié au minimum 4 fois sur le shell — impact CPU/rendering (pas réseau)

**Fichiers (shell authentifié, avant toute page métier)** :
- `src/context/StockContext.tsx` (ligne 44) — via `<StockProvider>` dans `main.tsx` (ligne 93)
- `src/context/StockBridgeProvider.tsx` (ligne 28) — via `<StockBridgeProvider>` dans `main.tsx`
- `src/context/AppProvider.tsx` (ligne 112) — via `<AppProvider>` dans `main.tsx`
- `src/layouts/RootLayout.tsx` (ligne 48) — appel direct

**Appels supplémentaires dans les pages/composants** (20 call sites hors tests, pas tous montés simultanément) :
- Pages : `HomePage.tsx`, `SalesHistoryPage.tsx`, `ReturnsPage.tsx`, `ConsignmentPage.tsx`, `InventoryPage.tsx`
- Hooks : `useDashboardAnalytics.ts`, `useInventoryActions.ts`
- Composants : `ProductGrid.tsx`, `QuickSaleFlow.tsx`, `ProductModal.tsx`, `SwapProductSelector.tsx`, `CreateReturnForm.tsx`, `StockAdjustmentModal.tsx`, `AccountingOverview.tsx`, `OrderPreparation.tsx`, `PromotionForm.tsx`, `ProductImport.tsx`
- Seul `InventoryPage.tsx` utilise `{ skipSupplies: true }` (conditionnel)

Chaque instance crée 7 queries React Query :
- `useProducts` (polling 30s)
- `useSupplies` (polling 60s)
- `useConsignments` (polling 60s)
- `useCategories` (polling 30s)
- `offline-sales-for-stock` (staleTime 5s)
- `server-pending-sales-for-stock` (staleTime 5s)
- `useMutationState`

**Clarification** : React Query **déduplique les requêtes réseau** par clé identique. Les multiples instances ne génèrent qu'**un seul fetch réseau** par query key. L'impact réseau est quasi nul.

**Le vrai problème** : Les `useEffect` d'écoute d'événements (`stock-synced`, `sales-synced`, `queue-updated`) sont **multipliés par le nombre d'instances**. Chaque événement de sync déclenche N cycles de re-render dans l'arbre React. C'est un problème **CPU/rendering**, pas réseau.

**Conséquence sur skipSupplies** : Ajouter `{ skipSupplies: true }` sur HomePage ou SalesHistory **ne supprimera pas les fetches supplies/consignments** car les 4 providers parents les chargent déjà sans cette option. Le fix doit d'abord passer par la rationalisation des providers.

---

### 4. Invalidation massive au retour réseau (14+ queries)

**Fichier** : `src/layouts/RootLayout.tsx` (lignes 147-176)

Au retour en ligne OU à chaque `sync-completed`, le code invalide :

```
salesKeys.all, statsKeys.all, stockKeys.products, stockKeys.supplies,
stockKeys.consignments, returnKeys.all, expenseKeys.list, ticketKeys.all,
analyticsKeys.all, dailySummary, topProducts, barMembers,
stale-pending-sales, server-pending-sales-for-stock, stock-adjustments
```

**Impact** : `invalidateQueries` ne refetch que les queries **actives** (montées dans un composant visible). Le nombre exact de refetches dépend de l'état de l'UI au moment du retour réseau. Vu le nombre de providers toujours montés (StockProvider, StockBridgeProvider, AppProvider, RootLayout), la plupart de ces queries seront actives. Le burst réel est estimé à **10-12 requêtes simultanées** (pas systématiquement 14-15). Sur réseau 3G africain (~300 Kbps), ce burst monopolise la bande passante et peut provoquer un freeze UI.

**Fait aggravant** : Cet événement se déclenche à CHAQUE micro-coupure réseau (fréquent en Afrique de l'Ouest).

---

### 5. `useRealtimeSubscription` poll le statut toutes les secondes

**Fichier** : `src/hooks/useRealtimeSubscription.ts` (lignes 105-108)

```typescript
const checkStatus = setInterval(() => {
  const connected = realtimeService.isConnected(channelIdRef.current);
  setIsConnected(connected);
}, 1000);
```

**Impact** : Pour N canaux Realtime actifs (typiquement 3-5), cela crée N intervals à 1 seconde qui chacun appellent `isConnected()` et potentiellement déclenchent un `setState` → re-render. Pas d'impact réseau, mais consomme du CPU et provoque des micro-re-renders continus.

---

### 6. HomePage et SalesHistory chargent des données inutilement

**Fichiers** :
- `src/pages/HomePage.tsx` (ligne 21) : `useUnifiedStock(currentBar?.id)` — sans `skipSupplies`
- `src/pages/SalesHistoryPage.tsx` (ligne 48) : idem

**HomePage** : Ni supplies ni consignments ne sont utilisés. Les deux queries sont inutiles.

**SalesHistoryPage** : Les **consignments sont utilisés** dans la modale de détail (ligne 454 : `consignments.some(c => c.saleId === selectedSale.id)` pour désactiver le bouton d'annulation si la vente a des consignations actives). En revanche, **supplies n'est pas utilisé** du tout (non extrait du destructuring).

**Dépendances inutiles côté page** : HomePage a des dépendances sur supplies et consignments qu'elle n'utilise pas. SalesHistory a une dépendance sur supplies qu'elle n'utilise pas.

**Limitation** : Ces pages n'ajoutent pas de fetches réseau supplémentaires à elles seules, car les providers parents (StockContext, StockBridgeProvider, AppProvider, RootLayout) appellent déjà `useUnifiedStock` sans `skipSupplies` (voir point 3). Le fix `skipSupplies` ne sera effectif qu'après la rationalisation des providers (P0-3).

---

## P1 — Problèmes significatifs

### 7. Plusieurs queries service utilisent `SELECT *`

**Fichiers concernés** :
- `src/services/supabase/sales.service.ts` (lignes 418-422) : `.select('*')` + 2 joins
- `src/services/supabase/returns.service.ts` (ligne 93) : `.select('*')`
- `src/services/supabase/expenses.service.ts` (ligne 35) : `.select('*')`

**Exception** : `products.service.ts` utilise le RPC `get_bar_products` (ligne 287) pour la query principale (`useProducts`), pas un `SELECT *`. Le `select('*')` à la ligne 89 concerne `getGlobalProducts()` (fonction admin, pas le chemin principal).

**Impact** : Chaque vente contient un champ `items` (JSONB) qui peut peser 1-5 KB par vente. Les vues liste n'utilisent que ~8-10 colonnes sur les ~25 disponibles.

**Clarification importante sur l'offline** : L'offline queue **ne dépend PAS du cache React Query**. Les ventes offline sont stockées via le payload de la mutation dans IndexedDB (`offlineQueue.addOperation()`, ligne 177), puis reconstruites depuis ce payload (`useUnifiedSales.ts`, lignes 106-145). Que la query liste fasse `SELECT *` ou une projection ciblée ne change rien au fonctionnement offline.

**Cependant** : Le champ `items` est nécessaire en vue liste pour le comptage d'articles (`sale.items.reduce()` dans `SalesListView.tsx:33`). La réduction réaliste est de **~50% du payload** (pas 70-80%), car `items` doit rester dans la projection.

**Exemple** :

```typescript
// ACTUEL (sales.service.ts:418-422) — fetche tout
.select(`
  *,
  seller:users!sales_sold_by_fkey (name),
  validator:users!sales_validated_by_fkey (name)
`)

// OPTIMISÉ — colonnes nécessaires pour la vue liste (items inclus pour le comptage)
.select(`
  id, bar_id, items, total, subtotal, discount_total, status,
  created_at, business_date, payment_method, sold_by,
  validated_by, source_return_id, customer_name, idempotency_key,
  seller:users!sales_sold_by_fkey (name),
  validator:users!sales_validated_by_fkey (name)
`)
```

**Attention** : Vérifier que les champs retirés ne sont pas utilisés dans des composants enfants (modales de détail, export) avant d'appliquer. Si nécessaire, créer une query séparée `getSaleById` avec `SELECT *` pour la vue détail.

---

### 8. `RefreshButton` invalide TOUT le cache sans filtre

**Fichier** : `src/components/RefreshButton.tsx` (ligne 20)

```typescript
await queryClient.invalidateQueries(); // AUCUN filtre
```

**Impact** : Invalide toutes les queries y compris categories (staleTime 24h), settings (staleTime 24h), données offline. Déclenche un burst identique au point 4 mais encore plus large car inclut les queries quasi-statiques.

---

### 9. Onglet Accounting : unmount/remount et staleTime courts

**Fichier** : `src/pages/AccountingPage.tsx` (lignes 76-85)

`AnimatePresence mode="wait"` démonte le composant de l'onglet précédent avant de monter le nouveau.

**Composants par onglet (vérifié)** :
- `AccountingOverview` : appelle `useUnifiedSales`, `useUnifiedStock`, `useUnifiedExpenses`, `useUnifiedReturns`
- `RevenueManager` : appelle `useDailyAnalytics` (pas de pivot hooks directs)
- `ExpenseManager` : appelle `useUnifiedExpenses`, `useSalaries` (pas de `useUnifiedStock`)

**Nuance importante** : Les queries principales (sales, expenses, analytics) ont un `staleTime` de **5 minutes** (`CACHE_STRATEGY.salesAndStock`). Si l'utilisateur change d'onglet en <5 min, React Query sert depuis le cache **sans refetch réseau**.

**Le vrai coupable** : Les sous-queries pivots `offline-sales-for-stock` et `server-pending-sales-for-stock` ont un `staleTime` de **5 secondes** (`useUnifiedStock.ts:112-146`). Elles deviennent stale quasi-immédiatement au remount. Un changement d'onglet >5s (quasi systématique) déclenche **au minimum 2 refetch Supabase**.

**Recommandation** : Ne PAS remplacer `AnimatePresence` par `display:none` (casserait les animations de sortie Framer Motion). Monter le `staleTime` des sous-queries pivots de 5s → 60s (P1-5).

---

### 10. Dashboard : cascade de pivot hooks dupliqués

**Fichier** : `src/hooks/useDashboardAnalytics.ts` (lignes 20-109)

- `useUnifiedStock()` sans `skipSupplies` charge `supplies` alors que ce hook n'en fait pas usage direct.
- `consignments` ne sont **pas** inutiles ici : ils servent à calculer `activeConsignments` et `serverFilteredConsignments`.
- `useRevenueStats()` (ligne 106) appelle en interne `useUnifiedSales` et `useUnifiedReturns` (`useRevenueStats.ts:52-53`), alors que `useDashboardAnalytics` appelle déjà ces pivot hooks directement (lignes 24-29).

**Impact** : React Query déduplique les fetches réseau par clé, donc le problème principal n'est pas un double fetch réseau systématique mais une duplication de pivot hooks, d'écouteurs et de re-renders sur une page très fréquentée.

---

### 11. Polling Realtime fallback : incohérence entre hooks

Quand Supabase Realtime est déconnecté, le fallback polling **devrait** s'activer. Mais le comportement varie selon les hooks à cause d'une incohérence dans la condition de coupure :

**Hooks utilisant `isSynced`** (polling coupé si BroadcastChannel supporté — quasi tous les navigateurs modernes) :

| Hook | Intervalle | Condition | Polling actif en pratique |
|---|---|---|---|
| `useSales` | 30s | `smartSync.isSynced ? false : 30000` | **Non** (BroadcastChannel suffit) |
| `useExpenses` | 60s | `smartSync.isSynced ? false : 60000` | **Non** |
| `useBarMembers` | 60s | `smartSync.isSynced ? false : 60000` | **Non** |
| `useCategories` | 30s | `smartSync.isSynced ? false : 30000` | **Non** |

**Hooks utilisant `isRealtimeConnected`** (polling coupé SEULEMENT si Realtime est connecté — BroadcastChannel ne suffit PAS) :

| Hook | Intervalle | Condition | Polling actif en pratique |
|---|---|---|---|
| `useProducts` | 30s | `smartSync.isRealtimeConnected ? false : 30000` | **Oui** (si Realtime down) |
| `useSupplies` | 60s | `smartSync.isRealtimeConnected ? false : 60000` | **Oui** |
| `useConsignments` | 60s | `smartSync.isRealtimeConnected ? false : 60000` | **Oui** |

**Bilan réel** : Sur un navigateur moderne avec BroadcastChannel, **seuls 3 hooks polleraient** en fallback quand Realtime est déconnecté, pas 8. Le chiffre "8 intervalles" de l'audit initial surestimait le problème.

**Incohérence** : Products, supplies et consignments utilisent `isRealtimeConnected` au lieu de `isSynced`, contrairement au reste du code. L'intention derrière ce choix n'est pas documentée — à clarifier avant d'harmoniser.

---

### 12. `offline-sales-for-stock` et `server-pending-sales-for-stock` : staleTime 5 secondes

**Fichier** : `src/hooks/pivots/useUnifiedStock.ts` (lignes 112-146)

```typescript
staleTime: 5000 // 5 secondes
```

**Impact** : Ces queries deviennent stale après 5 secondes. Tout re-render du composant parent (fréquent avec les provider cascades) ou remount d'onglet (Accounting, point 9) déclenche un refetch. La query `server-pending-sales-for-stock` appelle Supabase à chaque fois.

---

## P2 — Problèmes modérés

### 13. `useReturns` n'utilise pas `useSmartSync`

**Fichier** : `src/hooks/queries/useReturnsQueries.ts`

Contrairement à `useSales`, `useProducts`, `useExpenses` qui ont Realtime + BroadcastChannel + polling fallback, `useReturns` poll inconditionnellement toutes les 30s sans vérifier si Realtime est connecté.

---

### 14. `useStockAdjustment` : clé de query trop large

**Fichier** :
- `src/hooks/mutations/useStockAdjustment.ts` (ligne 52) : `['bar-products']` sans barId

**Impact** : `['bar-products']` invalide les produits de TOUS les bars en cache, pas seulement le bar courant.

**Note** : `useCategoryMutations.ts` (ligne 19) utilise `['stock', 'categories', barId]` en dur, ce qui est **cohérent** avec `stockKeys.categories(barId)` (`useStockQueries.ts:68`). Ce n'est pas un bug, même si l'utilisation du key builder serait préférable pour la maintenabilité.

---

### 15. Preloading de 5 pages au mount de RootLayout

**Fichier** : `src/layouts/RootLayout.tsx` (lignes 59-65)

```typescript
useRoutePreload([
  () => import('../pages/DashboardPage'),
  () => import('../pages/InventoryPage'),
  () => import('../pages/SalesHistoryPage'),
  () => import('../pages/AccountingPage'),
  () => import('../pages/AnalyticsPage'),
], isAuthenticated && !!currentBar);
```

**Point positif** : Le preloading est **différé d'1 seconde** via `setTimeout` dans `useRoutePreload.ts` (ligne 38), pas immédiat au mount.

**Impact** : ~150-250 KB de JS chargés en background 1 seconde après l'authentification. Sur 3G, cela concurrence les requêtes API de données initiales pendant 3-8 secondes.

---

## Budget réseau estimé (1 utilisateur, 8h de travail)

| Source | Req/jour (max théorique) | Req/jour (estimé réaliste ¹) | Payload estimé |
|---|---|---|---|
| NetworkManager ping (3s) | 28 800 | **8 000 - 15 000** | ~4-7 MB (headers) |
| Heartbeat auth (30s) | 2 880 | **~2 500** ² | ~3-4 MB ² |
| Polling fallback 3 hooks ³ (30-60s) | 2 160 - 4 320 | **1 000 - 3 000** | ~3-8 MB |
| VersionCheck (5min) | 288 | ~288 | ~150 KB |
| Invalidation au retour réseau | Variable (×10-12 queries actives) | Variable | ~2-5 MB/événement |
| Navigation entre pages | ~10-15 queries/navigation | Variable | ~500 KB - 2 MB/nav |

**Total background passif (réaliste)** : **~12 000 - 21 000 requêtes/jour** sans action utilisateur.

> ¹ Les chiffres "max théorique" supposent 8h de focus actif ininterrompu. Les chiffres "estimé réaliste" tiennent compte du throttling navigateur en arrière-plan (~1/min pour les setInterval), des verrouillages d'écran, et des pauses naturelles. Le code n'implémente **aucune** gestion de `visibilitychange` — le throttling est purement côté navigateur.
>
> ² L'impact réseau exact du heartbeat est incertain : `getSession()` peut retourner depuis la mémoire locale dans les versions récentes de supabase-js. Nécessite une mesure runtime.
>
> ³ Seuls 3 hooks (products, supplies, consignments) polleraient en fallback sur un navigateur moderne supportant BroadcastChannel (voir point 11). Les 5 autres coupent leur polling via `isSynced`.
>
> ² Sur un navigateur supportant BroadcastChannel (tous les navigateurs modernes), seuls 3 hooks polleraient en fallback (products, supplies, consignments) car ils vérifient `isRealtimeConnected` au lieu de `isSynced`. Les 5 autres (sales, expenses, barMembers, categories, promotions) coupent leur polling dès que `isSynced` est `true` (ce qui inclut le support BroadcastChannel). Voir point 11 pour le détail.

---

## Actions recommandées (par priorité)

| # | Action | Fichier(s) | Gain estimé |
|---|---|---|---|
| **P0-1** | Réduire ping NetworkManager de 3s → 15-30s + ajouter `visibilitychange` pour suspendre en background + short-circuit `lastPingOK` | `src/services/NetworkManager.ts` | **-80% req ping** |
| **P0-2** | Remplacer heartbeat 30s par décodage JWT local (`exp` claim) + `onAuthStateChange` | `src/layouts/RootLayout.tsx` | **-2 500 req/jour** |
| **P0-3** | Rationaliser `useUnifiedStock` (1 seul Provider au lieu de 4+) — impact CPU/rendering, pas réseau. Prérequis pour que `skipSupplies` ait un effet. | `StockContext.tsx`, `StockBridgeProvider.tsx`, `AppProvider.tsx`, `RootLayout.tsx` | **÷4 event listeners, ÷4 re-renders par sync** |
| **P0-4** | Throttler l'invalidation réseau (debounce 5s + batch) | `src/layouts/RootLayout.tsx` | **-10+ req/événement** |
| **P1-1** | Ajouter `skipSupplies: true` sur HomePage (après P0-3) | `HomePage.tsx` | Effet conditionné par P0-3 |
| **P1-2** | Column projection dans sales/returns/expenses services (garder `items` pour comptage) | `sales.service.ts`, `returns.service.ts`, `expenses.service.ts` | **-50% payload** |
| **P1-3** | Filtrer `RefreshButton` (exclure categories/settings) | `RefreshButton.tsx` | **-5 queries inutiles** |
| **P1-4** | Monter staleTime sous-queries pivots de 5s → 60s (résout aussi le problème Accounting) | `useUnifiedStock.ts` | **-12x refetch, onglets Accounting fluides** |
| **P1-5** | Harmoniser `isRealtimeConnected` → `isSynced` pour products/supplies/consignments | `useStockQueries.ts` | **-3 pollings inutiles** (bug d'incohérence) |
| **P2-1** | Différer le preloading pages (`requestIdleCallback` ou après 5-10s) | `useRoutePreload.ts` | Libère bande passante au login (actuellement différé d'1s seulement) |

---

## Errata — Corrections post double contre-analyse

Ce document a été révisé suite à deux contre-analyses expertes indépendantes.

### Contre-analyse #1 — Corrections appliquées

| Point | Erreur initiale | Correction |
|---|---|---|
| **Budget réseau global** | Max théorique présenté comme réaliste (37 000-43 000 req/jour) | Distingué max théorique vs estimé réaliste. Ajout de la note sur le throttling navigateur des `setInterval` en arrière-plan. |
| **Point 1 (NetworkManager)** | Recommandation de skip si `navigator.onLine` | `navigator.onLine` est non fiable en Afrique (forfait épuisé, faisceau coupé). Le ping serveur doit rester. Recommandation ajustée : réduire la fréquence + `visibilitychange` + `lastPingOK`. |
| **Point 3 (useUnifiedStock)** | Présenté comme impact réseau, compté 3 fois | React Query déduplique les requêtes réseau par clé identique. Le vrai impact est CPU/rendering. Reclassé. |
| **Point 7 (SELECT *)** | Réduction estimée à 70-80% | Le champ `items` est nécessaire pour le comptage d'articles en vue liste. Réduction réaliste : ~50%. |
| **Point 9 (Accounting)** | Recommandation `display:none` au lieu d'unmount | Casserait `AnimatePresence mode="wait"` (Framer Motion). La bonne solution est de monter le staleTime des sous-queries pivots (point P1-4). |

### Contre-analyse #1 — Corrections refusées (avec justification)

| Affirmation | Vérification factuelle | Verdict |
|---|---|---|
| "Le cache offline a besoin de SELECT * (objet complet)" | L'offline queue stocke le **payload de mutation** dans IndexedDB (`offlineQueue.ts:177`), pas le cache React Query. Les ventes offline sont reconstruites depuis `op.payload.items` (`useUnifiedSales.ts:126`). | **Faux** — la projection de colonnes ne casse pas l'offline. |

### Contre-analyse #2 — Corrections appliquées

| Point | Erreur initiale | Correction |
|---|---|---|
| **Point 3 (useUnifiedStock)** | Compté "3 fois", puis "18 appels" | Au minimum **4 call sites** sur le shell authentifié (StockContext, StockBridgeProvider, AppProvider, RootLayout). **20 call sites** hors tests au total, mais pas tous montés simultanément. |
| **Point 5 (code cité)** | Code montrait `getChannelStatus()` + comparaison string | Le code réel utilise `realtimeService.isConnected()` qui retourne un booléen. Le fond du constat (polling 1s) reste valide. |
| **Point 6 (SalesHistory)** | "consignments inutiles sur SalesHistory" | **Faux** — consignments sont utilisés dans la modale de détail (ligne 454) pour désactiver le bouton d'annulation. Seul supplies est inutile. |
| **Point 6 (impact réseau)** | "2 queries inutiles" / "1 query inutile" présentés comme fetches supplémentaires | Les pages n'ajoutent pas de fetches réseau supplémentaires car les providers parents montent déjà `useUnifiedStock` sans `skipSupplies`. Ce sont des dépendances inutiles côté page, pas des fetches en plus. |
| **Point 10 (Dashboard)** | "consignments inutiles sur Dashboard" | **Faux** — `useDashboardAnalytics` utilise bien `consignments` pour calculer `activeConsignments` (ligne 77) et `serverFilteredConsignments` (ligne 78-83). Seul `supplies` est inutile. `categories` non utilisées non plus. |
| **Point 10 (cascade)** | "query séparée redondante" | **Sous-estimé** — `useRevenueStats` appelle en interne `useUnifiedSales` ET `useUnifiedReturns`, créant une double instanciation des pivot hooks avec `useDashboardAnalytics`. |
| **Point 11 (polling)** | "8 intervalles simultanés" | **Surestimé** — seuls 3 hooks (products, supplies, consignments) polleraient en fallback sur un navigateur supportant BroadcastChannel. Les 5 autres coupent le polling via `isSynced`. Révèle une **incohérence** (`isRealtimeConnected` vs `isSynced`) dont l'intention n'est pas documentée. |
| **Point 4 (invalidation)** | "14-15 requêtes simultanées" présenté comme certitude | `invalidateQueries` ne refetch que les queries **actives**. Le burst réel est estimé à ~10-12 queries, pas systématiquement 14-15. |
| **Point 2 (heartbeat)** | "Chaque getSession() = requête HTTPS" | Le comportement exact dépend de la version de `supabase-js`. Impact réseau nécessite mesure runtime. L'anti-pattern reste valide indépendamment. |
| **Point 7 (products.service)** | "Toutes les queries utilisent SELECT *" | **Faux pour products** — la query principale utilise le RPC `get_bar_products` (ligne 287), pas SELECT *. Vrai pour sales, returns, expenses. |
| **Point 14 (clé categories)** | "clé incohérente" | **Faux** — `['stock', 'categories', barId]` est cohérent avec `stockKeys.categories(barId)`. Seul `useStockAdjustment` avec `['bar-products']` est un vrai problème. |
| **Point 15 (preloading)** | "ReturnsPage préchargée, immédiat au mount" | **Faux** — c'est AnalyticsPage (pas ReturnsPage). Le preloading est différé d'1 seconde via `setTimeout` dans `useRoutePreload.ts:38`. |

### Note méthodologique

Les chiffres en KB/jour, "freeze 1-3s", "6 connexions saturées" sont des **extrapolations basées sur le code**, pas des mesures runtime instrumentées. Un profiling DevTools (Network tab + Performance tab) est nécessaire pour confirmer les impacts réels.

---

## Annexe : Patterns correctement implémentés

Les éléments suivants sont bien conçus et ne nécessitent pas de modification :

- **Architecture 3 couches hooks** (queries / mutations / pivots) — séparation claire
- **CACHE_STRATEGY centralisé** avec durées adaptées par type de donnée
- **QUERY_KEYS hiérarchiques** — invalidation ciblée possible
- **networkMode: 'always'** sur les données critiques (stock, ventes, tickets)
- **Anti-doublon via idempotency_key** dans SyncManager
- **Hash-based memoization** dans les pivot hooks (évite re-renders inutiles)
- **Realtime + BroadcastChannel + polling** (triple fallback pour haute disponibilité)
- **Business date logic** (respect de l'heure de fermeture, pas minuit calendaire)
- **Data tiering** (lite/balanced/enterprise) pour scalabilité
- **InventoryPage** utilise `skipSupplies` correctement selon le `viewMode`
- **Lazy loading** des modales dans RootLayout
- **Refs stables** pour les callbacks Realtime dans BarContext (évite re-subscription)
- **Web Locks API** dans SyncManager (empêche sync multi-onglets simultanés)
- **Heartbeat skip offline** — le heartbeat auth vérifie `networkManager.getDecision()` avant d'appeler `getSession()` (RootLayout:104-107)
- **isPinging guard** — NetworkManager empêche les pings concurrents (ligne 216)
- **Déduplication React Query** — les appels multiples à `useUnifiedStock` ne créent qu'un seul fetch réseau par query key
