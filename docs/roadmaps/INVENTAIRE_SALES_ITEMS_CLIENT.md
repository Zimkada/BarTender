# Inventaire CÔTÉ CLIENT des lecteurs de `sales.items` — phase 3A

> **Second volet de [`INVENTAIRE_SALES_ITEMS.md`](INVENTAIRE_SALES_ITEMS.md)**, qui couvre
> le SQL. Relevé le 03/08/2026.
>
> **Aucun code n'est modifié ici.**

---

## 1. Méthode — corrigée après l'échec du premier inventaire SQL

Le volet SQL a dû être repris **quatre fois** parce qu'il partait de **motifs** (`grep`).
Ici, deux sources d'autorité croisées :

1. **Le type `SaleItem`** — tout lecteur typé passe par lui → **27 fichiers**
2. **Le motif d'itération** (`.items.map/filter/reduce/forEach`) — attrape les accès non
   typés que le premier filet laisserait passer → **33 fichiers**

⭐ **Puis une troisième question, apprise du volet SQL** : *le code est-il VIVANT ?*
`top_products_by_period_mat` était une vue morte ; j'ai failli refaire l'erreur ici (§4.3).

---

## 2. ⭐ Le risque est STRUCTURELLEMENT plus faible qu'en SQL

| | SQL | Client |
|---|---|---|
| Discriminant | JSONB non typé — rien ne signale l'erreur | `SaleItem` typé — TypeScript le verra |
| Conséquence d'un oubli | Chiffre faux **silencieux** | Erreur de compilation, le plus souvent |
| Persistance | Vue matérialisée : **stockée** | Recalculé à chaque rendu |

⭐ **Quand `SaleItem` recevra `item_type`**, tout code qui construit un item sans le
renseigner **cassera à la compilation**. C'est le meilleur garde-fou de ce volet — et une
raison de plus pour que le champ soit **obligatoire** dans le type, pas optionnel.

⚠️ **La faille reste possible** partout où un `as` ou un `any` contourne le typage.

---

## 3. ⛔ À traiter — statistiques produit réellement exposées

### 3.1 `AnalyticsView.tsx` — répartition du CA par catégorie

```typescript
const product = (_products || []).find(p => p.id === productId);
const category = categories.find(c => c.id === product?.categoryId);
const catName = category?.name || 'Autre';
```

⛔ **Un plat n'est pas dans `_products`** → `product` vaut `undefined` → il tombe dans la
catégorie **« Autre »**, avec son chiffre d'affaires.

**Impact** : le graphique de répartition du CA par catégorie afficherait une part « Autre »
gonflée, sans que rien n'indique qu'il s'agit de plats. **Vivant** — monté par
`SalesHistoryPage`.

### 3.2 `useSalesExport.ts` — export CSV des ventes

```typescript
const name = item.product_name;
const product = products.find(p => p.id === item.product_id);
```

⛔ Même motif. L'export listerait les plats comme des produits sans coût ni catégorie.
**Vivant** — 1 consommateur.

⚠️ Un export est un fichier qui **sort de l'application** : il peut être transmis à un
comptable ou archivé. Une donnée fausse y survit au correctif.

---

## 4. ✅ Vérifiés — AUCUNE action

### 4.1 `useDashboardAnalytics.ts` — top produits

```typescript
const { data: topProductsServer = [] } = useTopProducts({ ... });
```

✅ **Ne lit PAS `sales.items`.** Il consomme le résultat de la RPC
`get_top_products_aggregated`, déjà inventoriée côté SQL (§4.1 du volet SQL).

⭐ **Corriger la RPC suffit** — le client hérite du filtre. C'est un cas où l'inventaire SQL
couvre déjà le client.

### 4.2 `useTeamPerformance.ts` — performance par serveur

```typescript
if (typeof sale.items_count === 'number') {
  userStats[userId].items += sale.items_count;
} else if (sale.items && Array.isArray(sale.items)) {
  userStats[userId].items += sale.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}
```

✅ **Correct tel quel.** Il compte des **articles vendus**, sans distinction de nature — et
un plat *est* un article vendu.

⭐ Même raisonnement que `compute_sale_items_count` côté SQL : la question n'est pas
« lit-il les items ? » mais **« produit-il une statistique PRODUIT ? »**. Ici, non : c'est un
volume d'activité par serveur.

⚠️ Il utilise d'ailleurs `sale.items_count` en priorité — la colonne alimentée par le
trigger, qui compte déjà les plats.

### 4.3 ⭐ `calculations.ts` — CODE MORT, à ne pas traiter

```typescript
export function calculateSaleCost(items: SaleItem[], products: Product[]): number {
  const product = products.find(p => p.id === item.product_id);
  const costPrice = product?.currentAverageCost ?? 0;   // ⚠️ plat → coût 0
}
```

Ce code **paraît** critique : un plat y aurait un coût de **0**, donc
`calculateSaleProfit` compterait le prix de vente entier comme bénéfice.

✅ **Mais `calculateSaleCost` et `calculateSaleProfit` n'ont AUCUN consommateur** (hors
tests). Ce sont des fonctions mortes.

> ⚠️ **J'allais les classer comme bloquantes.** C'est exactement le piège de
> `top_products_by_period_mat` dans le volet SQL — signaler comme critique du code que
> personne n'appelle. La question « est-ce vivant ? » doit être posée **avant** d'évaluer la
> gravité, pas après.

**Décision** : ne pas les modifier. Si elles reviennent en service, elles devront filtrer —
mais alourdir aujourd'hui du code mort serait du travail inutile sur une fonction qui
disparaîtra peut-être.

---

## 5. Périmètre complet — 33 fichiers classés

| Catégorie | Nombre | Traitement |
|---|---|---|
| ⛔ Statistiques produit exposées | **2** | `AnalyticsView`, `useSalesExport` |
| ✅ Couverts par le correctif SQL | 1 | `useDashboardAnalytics` |
| ✅ Corrects par nature (comptage) | 1 | `useTeamPerformance` |
| ✅ Code mort | 1 | `calculations.ts` |
| 🟡 Affichage seul — à revoir en phase 3 | ~14 | voir §6 |
| ⚪ Hors périmètre | ~14 | panier, appro, retours, consignations |

⭐ **Seuls DEUX fichiers exigent un filtre** côté client. C'est très en deçà des 72 lectures
brutes dénombrées au premier balayage — la plupart manipulent `product_id` dans des
contextes sans rapport avec `sales.items` (panier, approvisionnement, ajustements de stock).

---

## 6. 🟡 Affichage — traité par le format, pas par un filtre

Ces fichiers **affichent** les items d'une vente (détail de ticket, liste, facture) :

`SaleDetailModal`, `SaleDetailsPage`, `InvoiceModal`, `SalesCardsView`, `SalesListView`,
`DashboardOrders`, `BonStrip`, `useTickets`, `useSalesFilters`…

✅ **Ils doivent afficher les plats** — un ticket contenant un plat doit le montrer.

⚠️ **Mais ils lisent `item.product_name`**, qui devient `display_name` dans le format cible
(§4.2). Ils casseront donc à la compilation quand le type changera — **c'est voulu et
souhaitable** : chaque point à adapter sera signalé par TypeScript.

⭐ **Aucun travail d'inventaire supplémentaire n'est nécessaire pour eux** : le compilateur
fera l'inventaire à notre place le jour du changement de type.

---

## 7. Deux points levés à la vérification

### ✅ `realtimeCachePatch.ts` — hors périmètre

```typescript
items: unknown;   // ligne 36
```

Il **transporte** les items sans jamais les lire : le type est `unknown`, aucun accès à
`product_id`. Son seul souci est de ne pas écraser des items existants par `[]`, ce qui
« sous-déduirait silencieusement le stock disponible ».

### ✅ `useInventoryHistory.ts` — hors périmètre

```typescript
.select('id, product_id, quantity, created_at')        // supplies
.select('id, product_id, delta, adjusted_at')          // stock_adjustments
.select('id, product_id, quantity_returned, ...')      // returns
.select('id, product_id, quantity, status, ...')       // consignments
```

Il lit `product_id` depuis **quatre tables qui ont toutes une FK** (cf. §5 du volet SQL) :
un `dish_id` y serait **rejeté par la base**. Il ne touche jamais `sales.items`.

---

## 7bis. Ce qui reste NON vérifié

- ☐ **Les `as` / `any`** contournant le typage de `SaleItem` — non recherchés
  systématiquement. C'est la seule faille structurelle de ce volet : un cast fait sauter le
  garde-fou du compilateur.
- ☐ **Les 14 fichiers d'affichage** — classés par leur rôle, pas lus un par un. Justifié :
  le changement de type les signalera tous à la compilation (§6).

---

## 8. Conclusion pour la phase 3A

**Deux fichiers à filtrer** : `AnalyticsView.tsx` et `useSalesExport.ts`.

Tout le reste est soit couvert par le correctif SQL, soit correct par nature, soit mort,
soit protégé par le compilateur.

⭐ **La séquence recommandée** :

1. Corriger le SQL (volet 1) — les 3 vues matérialisées **avant toute vente de plat**
2. Ajouter `item_type` au type `SaleItem`, **obligatoire**
3. Laisser TypeScript signaler les points d'adaptation — ils seront exhaustifs par
   construction
4. Filtrer explicitement les 2 fichiers de statistiques ci-dessus

L'étape 3 est ce qui rend ce volet client bien moins risqué que le volet SQL : **le typage
fait l'inventaire à notre place**, alors que le JSONB ne signale rien.
