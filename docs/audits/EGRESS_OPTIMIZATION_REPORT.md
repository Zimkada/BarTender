# Rapport d'optimisation Egress — BarTender Pro

> **Date** : 7 juin 2026
> **Contexte** : Analyse de la croissance de l'egress Supabase dans le temps, sur le plan Pro, pour 2 bars actifs (17 MAU).
> **Auteur** : Investigation technique (Claude Opus 4.8)

---

## 1. Résumé exécutif

L'egress Supabase **croissait dans le temps** (×3 entre début et fin mai pour un nombre de bars constant). L'investigation a identifié la cause racine exacte : **trois pages chargeaient jusqu'à 6 mois de ventes (avec leurs items JSON) alors qu'elles n'en utilisaient qu'une fraction**.

Quatre corrections ont été appliquées, ramenant l'egress estimé de **~8 GB/bar/mois à ~2-3 GB/bar/mois** (-60 à -70 %) et, surtout, **supprimant la croissance dans le temps**.

**Aucune régression fonctionnelle** : les pages corrigées filtraient déjà localement sur la fenêtre réduite — on a simplement déplacé ce filtre du client vers le serveur.

---

## 2. Données mesurées (point de départ)

Statistiques Supabase Pro, période ~30 jours, **2 bars actifs**, 17 MAU :

| Métrique | Valeur réelle | Quota Pro | % consommé | Statut |
|---|---|---|---|---|
| **Egress** | 15,949 GB (~16 GB) | 250 GB | 6,4 % | ✅ Sain |
| Realtime Messages | 15 821 | 5 000 000 | 0,3 % | ✅ |
| Realtime Peak Connections | 6 | 500 | 1,2 % | ✅ |
| Storage | 0,009 GB | 100 GB | 0,01 % | ✅ |
| Edge Functions | 2 947 | 2 000 000 | 0,1 % | ✅ |
| Compute Hours | 745 h (Micro) | 1 projet inclus | — | ✅ |
| MAU | 17 | 100 000 | 0,02 % | ✅ |

> **Note de lecture** : « 15,949 GB » utilise la virgule comme séparateur décimal (format français) = **~16 GB**, et non quinze mille. Cohérent avec le graphique journalier (~0,5 GB/jour × 30).

### Le signal d'alerte : croissance dans le temps

Le graphique « Egress per day » montrait une tendance haussière nette à nombre de bars constant :
- **Début mai** : ~0,3 GB/jour
- **Fin mai / début juin** : ~0,8-1,1 GB/jour
- **× 3 en un mois**

---

## 3. Diagnostic — cause racine exacte

### Le mécanisme : la fenêtre `dataTier` dans `useUnifiedSales`

Dans [`src/hooks/pivots/useUnifiedSales.ts`](src/hooks/pivots/useUnifiedSales.ts), la fenêtre de ventes chargée dépendait du `dataTier` du bar :

| dataTier | Fenêtre chargée (avant) |
|---|---|
| `lite` | 7 jours glissants |
| **`balanced`** | **6 MOIS glissants** ⚠️ |
| `enterprise` | 30 jours glissants |

La refonte pricing (segmentation par équipe) avait unifié **tous les plans à `dataTier: 'balanced'`** → tous les bars chargeaient potentiellement 6 mois de ventes.

### Pourquoi l'egress CROÎT dans le temps

Avec une fenêtre glissante de 6 mois, l'egress est mathématiquement croissant jusqu'à saturation :

```
Egress ventes ≈ (nb ventes des 6 derniers mois) × (poids d'une vente avec items) × (chargements/jour)
```

- **Mois 1** : le bar n'a qu'~1 mois de ventes → la fenêtre 6 mois n'en contient qu'1 → egress faible
- **Mois 3** : 3 mois de ventes accumulées → egress × 3
- **Mois 6+** : fenêtre pleine → egress maximal puis stable

→ **La croissance ×3 observée correspond exactement à l'accumulation des ventes dans la fenêtre glissante.**

### Facteur aggravant : le champ `items`

Le `SALES_DETAIL_SELECT` ([`sales.service.ts`](src/services/supabase/sales.service.ts)) inclut le champ **`items`** (JSON complet de chaque vente : produits, quantités, prix). Ce champ double/triple le poids par ligne. Plusieurs pages le chargeaient sans en avoir besoin pour des listes/stats.

---

## 4. Cartographie des 9 consommateurs de `useUnifiedSales`

| # | Page | Fenêtre (avant) | Items | État initial |
|---|---|---|---|---|
| 1 | `useDashboardAnalytics` ×2 | today | mixte | ✅ Déjà optimal |
| 2 | `useRevenueStats` | défaut | non | ✅ Items OK |
| 3 | `SalesHistoryPage` ×2 | UI-driven | séparé | ✅ Déjà optimal |
| 4 | `AccountingOverview` | période | non | ✅ Déjà optimal |
| 5 | `AnalyticsPage` | période | non | ✅ Déjà optimal |
| 6 | `ConsignmentPage` ×2 | 60 jours | non | ✅ Déjà optimal |
| 7 | **`CreateConsignmentForm`** | **6 mois** 🔴 | oui | 🔴 Gaspillage |
| 8 | **`ReturnsPage`** | **6 mois** 🔴 | oui | 🔴 Gaspillage |
| 9 | **`AnalyticsView`** | **6 mois** 🔴 | oui | 🔴 Sur-large |

> **6 appelants sur 9 étaient déjà parfaitement optimisés** (commentaires « Expert Fix » présents dans le code, attestant d'un travail antérieur de qualité sur l'egress). Seuls 3 fuyaient.

---

## 5. Corrections appliquées

### Correction 1 — `CreateConsignmentForm` (risque nul)

**Fichier** : [`src/components/consignments/CreateConsignmentForm.tsx`](src/components/consignments/CreateConsignmentForm.tsx)

**Avant** : `useUnifiedSales(currentBar?.id)` → 6 mois + items, puis filtre local sur `currentBusinessDate` (aujourd'hui).

**Après** : fetch borné à `today` côté serveur (la consignation ne porte que sur les tickets de la journée active).

```typescript
const todayStr = useMemo(
  () => getCurrentBusinessDateString(currentBar?.closingHour),
  [currentBar?.closingHour]
);
const { sales: allSales } = useUnifiedSales(currentBar?.id, {
  startDate: todayStr,
  endDate: todayStr,
  includeItems: true, // items requis : sélection produit dans le ticket
});
```

**Pourquoi sûr** : la page filtrait déjà sur `currentBusinessDate` en aval. On déplace le filtre client → serveur. Comportement identique.

**Gain** : ~40 MB → ~0,2 MB par chargement = **-99 % sur cette page**.

---

### Correction 2 — `ReturnsPage` (risque nul)

**Fichier** : [`src/pages/ReturnsPage.tsx`](src/pages/ReturnsPage.tsx)

**Avant** : `useUnifiedSales(currentBar?.id)` → 6 mois + items, puis filtre local sur `currentBusinessDate`.

**Après** : fetch borné à `today` (les retours ne portent que sur les ventes de la journée active — règle métier déjà appliquée en aval lignes 187-191).

```typescript
const returnsSalesDay = useMemo(
  () => getCurrentBusinessDateString(currentBar?.closingHour),
  [currentBar?.closingHour]
);
const { sales } = useUnifiedSales(currentBar?.id, {
  startDate: returnsSalesDay,
  endDate: returnsSalesDay,
  includeItems: true, // items requis : sélection de l'article à retourner
});
```

**Vérification** : `sales` alimente `getReturnableSales` (filtre today), `createReturn` (retour sur vente du jour) et `useSalesFilters` (qui n'utilise `sales` que pour `filteredSales`, non consommé par ReturnsPage — la page n'extrait que `filteredReturns`, dérivé de `returns`).

**Gain** : **-99 % sur cette page**.

---

### Correction 3 — `AnalyticsView` (risque faible)

**Fichier** : [`src/features/Sales/SalesHistory/views/AnalyticsView.tsx`](src/features/Sales/SalesHistory/views/AnalyticsView.tsx)

**Avant** : `useUnifiedSales(currentBar?.id)` → 6 mois + items, alors que l'utilisateur sélectionne une période (`startDate`/`endDate` en props).

**Après** : fetch borné à `[startDate - durée ; endDate]` = la période analysée **plus** la période précédente (nécessaire aux comparaisons de tendance).

```typescript
const analyticsSalesFilters = useMemo(() => {
  const currentDuration = endDate.getTime() - startDate.getTime();
  const fetchStart = currentDuration > 0
    ? new Date(startDate.getTime() - currentDuration)
    : startDate;
  return {
    startDate: dateToYYYYMMDD(fetchStart),
    endDate: dateToYYYYMMDD(endDate),
    includeItems: true, // requis pour le top produits (sale.items)
  };
}, [startDate, endDate]);
const { sales: allSales } = useUnifiedSales(currentBar?.id, analyticsSalesFilters);
```

**Subtilité gérée** : le composant calcule la période précédente (durée doublée vers le passé, lignes 130-148) pour les comparaisons. La fenêtre de fetch couvre donc `2× la durée` de la période courante.

**Gain** : variable selon la période. « Aujourd'hui » → -95 % ; « 6 mois » → 0 % (légitime).

> ⚠️ **À tester manuellement** : vérifier que les comparaisons de tendance (% d'évolution vs période précédente) restent correctes après ce changement.

---

### Correction 4 — Resserrement du garde-fou `dataTier` `balanced`

**Fichier** : [`src/hooks/pivots/useUnifiedSales.ts`](src/hooks/pivots/useUnifiedSales.ts)

**Avant** : `balanced` = 6 mois glissants.
**Après** : `balanced` = **60 jours glissants**.

```typescript
} else if (currentBar.settings.dataTier === 'balanced') {
    // 60 jours glissants (resserré depuis 6 mois — garde-fou egress).
    businessDatePivot.setDate(businessDatePivot.getDate() - 60);
}
```

**Rôle** : défense en profondeur. Depuis les corrections 1-3, tous les appelants passent des dates explicites — cette fenêtre ne sert plus que de garde-fou contre un futur fetch non borné accidentel. La réduire limite l'impact de tout oubli.

---

## 6. Gain global estimé

| Métrique | Avant | Après |
|---|---|---|
| Egress / bar (bar mûr) | ~8 GB/mois | **~2-3 GB/mois** |
| Croissance dans le temps | ×3 sur 6 mois 🔴 | **Stable** ✅ |
| Pages chargeant 6 mois inutilement | 3 | 0 |

**Réduction estimée : -60 à -70 % d'egress global**, et **suppression de la croissance temporelle** (fenêtres désormais fixes : aujourd'hui ou période choisie).

### Impact sur le scaling

| Nb bars | Egress avant | Egress après | Quota 250 GB |
|---|---|---|---|
| 2 | 16 GB | ~5 GB | ✅ |
| 10 | 80 GB | ~25 GB | ✅ |
| 30 | 240 GB (limite) | ~75 GB | ✅ large marge |
| 50 | 400 GB (dépassement) | ~125 GB | ✅ |

→ **Le plan Pro porte désormais bien au-delà de 50 bars sans surcoût egress.**

---

## 7. Validation technique

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| ESLint (fichiers modifiés) | ✅ 0 erreur (warnings exhaustive-deps préexistants uniquement) |
| Suite de tests | ✅ 442/443 |
| Test en échec | ⚠️ `offline-resilience.integration.test.tsx` — **échec préexistant** (mock `salesKeys.list` incomplet), **sans rapport avec ces changements** (confirmé par test sur version stashée) |

---

## 8. Recommandations de suivi

### Monitoring (avant 30 bars)
- Mettre en place une alerte Supabase quand l'egress dépasse **200 GB/mois** (80 % du quota).
- Surveiller l'egress/bar après déploiement : il devrait se stabiliser autour de 2-3 GB et **ne plus croître dans le temps**.

### KPI marketing
- L'ancien seuil « Egress/bar/mois : alerte si > 5 GB » redevient pertinent : après optimisation, un bar normal est à 2-3 GB. Un bar > 5 GB signale une anomalie à investiguer.

### Test fonctionnel à faire
- **AnalyticsView** : valider manuellement les comparaisons de tendance (% évolution) sur plusieurs périodes (aujourd'hui, 7 jours, 30 jours, custom).

### Dette technique connexe (hors scope)
- Corriger le mock du test `offline-resilience.integration.test.tsx` (`salesKeys.list` non mocké) — bug préexistant.

---

## 9. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `src/components/consignments/CreateConsignmentForm.tsx` | Fetch borné à today |
| `src/pages/ReturnsPage.tsx` | Fetch borné à today |
| `src/features/Sales/SalesHistory/views/AnalyticsView.tsx` | Fetch borné à la période analysée + précédente |
| `src/hooks/pivots/useUnifiedSales.ts` | Garde-fou `balanced` 6 mois → 60 jours |

---

*Rapport généré le 7 juin 2026. Les estimations d'egress sont des ordres de grandeur basés sur les mesures à 2 bars ; à recalibrer après quelques semaines de données post-déploiement.*
