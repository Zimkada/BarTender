# Known Issues & Limitations

Ce fichier documente les limitations connues de l'application — comportements non-critiques
dont le fix a été délibérément différé, avec justification et plan d'action.

---

## [KI-001] Stock disponible temporairement sous-estimé après rejet d'une vente offline synchronisée

**Statut** : Ouvert — fix différé
**Composant** : `src/hooks/pivots/useUnifiedStock.ts`
**Priorité** : Faible (comportement conservateur, pas de risque financier)
**Lié à** : `src/services/SyncManager.ts` — buffer de transition

### Description

En mode complet (validation gérant), si une vente est créée offline, synchronisée,
puis immédiatement rejetée par le gérant, le stock disponible affiché est temporairement
inférieur à la réalité.

### Mécanisme

Le "Flash Hole" Bridge (Step 1.5, ligne ~219) déduit les quantités des ventes présentes
dans `recentlySyncedKeys` (buffer RAM 10s / IDB 5min) pour couvrir la fenêtre entre la
sync et le prochain refetch de `serverPendingSales`.

Lorsque la vente est rejetée :
- Elle disparaît de `offlineSales` (queue nettoyée après sync)
- Elle disparaît de `serverPendingSales` (filtre `status='pending'`)
- Elle **reste** dans `recentlySyncedKeys` pendant le TTL du buffer
- → Le bridge déduit à tort les quantités du stock affiché

### Impact

- Durée : ≤ 10 secondes (RAM) / ≤ 5 minutes si refresh page pendant la fenêtre (IDB)
- Direction : **conservateur** — montre moins de stock qu'il n'en existe, jamais plus
- Conséquence : un serveur peut se voir bloquer une vente légitimement réalisable
- Aucun impact financier ni de données

### Pourquoi différé

1. **Comportement conservateur** : sous-estimation du stock est préférable à une
   sur-estimation (évite la survente)
2. **Fix architectural non trivial** : le calcul est dans un `useMemo` synchrone ;
   y injecter une requête DB async nécessite de restructurer en `useQuery`
3. **Scénario rare** : mode complet + offline + sync + rejet immédiat (< 10s) —
   combinaison peu fréquente en conditions réelles
4. **Fix symétrique déjà appliqué** pour les revenus (KI-002) ; le stock peut attendre
   un sprint dédié

### Correction future

Deux approches possibles :

**A. SyncManager (recommandée)** : écouter les events Realtime de rejet de vente
et appeler `removeFromRecentBuffer(idempotencyKey)`. Cohérent avec l'architecture
existante, sans modifier `useUnifiedStock`.

**B. useUnifiedStock** : requête secondaire sans filtre de statut pour vérifier si
la clé est `rejected` avant de déduire dans le bridge — même pattern que le fix
appliqué dans `useRevenueStats` (commit `8137422`).

À traiter dans le même sprint que l'implémentation de `syncAddSupply()` dans
`SyncManager` (opération `ADD_SUPPLY` actuellement non synchronisée).

---

## [KI-002] CA Header temporairement sur-estimé après rejet d'une vente offline synchronisée

**Statut** : **Corrigé** — commit `8137422` (2026-03-25)
**Composant** : `src/hooks/useRevenueStats.ts`

### Description (historique)

Le `transitionRevenue` dans la `queryFn` de `useRevenueStats` dédoublonnait les ventes
synchronisées en comparant uniquement contre `serverRawData` filtré sur `status='validated'`.
Une vente rejetée/pending n'y était jamais trouvée → son total restait dans `transitionRevenue`
pendant le TTL du buffer (10s RAM / 5min IDB), gonflant le CA affiché dans le Header.

### Fix appliqué

Requête secondaire `.select('idempotency_key')` sans filtre de statut pour construire
`allIndexedKeys`. Si la clé est présente en DB (quel que soit le statut), la vente est
exclue du `transitionRevenue`.

---

## [KI-003] ADD_SUPPLY non synchronisé en mode offline

**Statut** : Ouvert — fonctionnalité manquante
**Composant** : `src/services/SyncManager.ts`
**Priorité** : Moyenne

### Description

`SyncManager.syncByType()` n'implémente pas le cas `ADD_SUPPLY`. Les approvisionnements
créés hors-ligne (si le flux offline est déclenché) ne sont jamais synchronisés avec
Supabase au retour en ligne.

### Impact

Perte de données d'approvisionnement si l'opération est déclenchée offline.
Actuellement `ADD_SUPPLY` passe par une mutation directe (sans queue offline), donc
le risque réel est limité aux flows qui passent explicitement par la queue.

### Correction future

Implémenter `syncAddSupply()` dans `SyncManager`, à traiter dans le même sprint que KI-001.
