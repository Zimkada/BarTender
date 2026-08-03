# Inventaire des lecteurs de `sales.items` — prérequis bloquant de la phase 3A

> **Relevé en PRODUCTION le 03/08/2026** (`pg_get_functiondef`, `pg_get_viewdef`,
> `pg_trigger`, `pg_constraint`, `cron.job`).
>
> ⚠️ **Ce document a été REPRIS quatre fois.** La première version, présentée comme
> exhaustive, contenait **deux erreurs factuelles et deux omissions**. La méthode et les
> corrections sont documentées au §9 — elles valent autant que le résultat.
>
> **Aucun code n'est modifié ici.** C'est un inventaire, comme `MATRICE_RBAC_CUISINIER.md`
> l'a été pour le Pré-0.

---

## 1. Pourquoi ce document est bloquant

Le §4.2 du plan est catégorique :

> **Travail obligatoire de la phase 3** : auditer **toutes** les vues matérialisées et RPC
> lisant `sales.items` [...] C'est le **seul endroit du chantier où l'invariance des bars
> purs (§3) est menacée par le format des données** et non par du code.

Le danger est **silencieux** : un `item_id` de plat agrégé comme un `product_id` ne lève
aucune erreur. Pas de log, pas d'exception — juste un chiffre faux dans une statistique de
bar.

### Format cible (§4.2)

```jsonc
{
  "item_type": "product" | "dish",   // ⭐ discriminant obligatoire
  "item_id":   "<uuid>",             // bar_products.id OU dishes.id
  "display_name": "Poulet braisé",   // figé
  "quantity": 2,
  "unit_price": 2500,
  "computed_cost": 1450              // plats uniquement
}
```

**Compatibilité** : les items existants n'ont pas `item_type`.
`COALESCE(item->>'item_type', 'product')` évite **toute reprise de données**.

---

## 2. Volumétrie — ce qui interdit le backfill

| Mesure | Valeur |
|---|---|
| Ventes en base | **19 281** |
| Ventes avec `items` | **19 281** (100 %) |
| Plus ancienne | 22/11/2025 |

⛔ **Toute proposition de « backfill des items existants » doit être refusée.** Elle
toucherait 19 281 lignes de JSONB portant l'historique comptable complet, pour un bénéfice
nul — le `COALESCE` produit exactement le même résultat sans écrire une seule ligne.

---

## 3. ⭐⭐ Vues matérialisées — TROIS à corriger, pas quatre

> C'est le point le plus grave de l'inventaire, et **il ne figurait pas dans la checklist
> du §13.9**.

| Vue | Ce qu'elle fait | Traitement |
|---|---|---|
| **`bar_ancillary_stats_mat`** | `(item_data.value ->> 'product_id')::uuid` sur **chaque item**, sans distinction | ⛔ **filtre requis** |
| **`daily_sales_summary_mat`** | agrège `FROM sales s` — porte le **CA quotidien** | ⛔ **filtre requis** |
| **`product_sales_stats_mat`** | part de `bar_products` et **joint** les items | ⛔ **filtre requis** |
| `bar_stats_multi_period_mat` | ⭐ **CASCADE** : `FROM daily_sales_summary_mat` | ✅ hérite du correctif |
| `top_products_by_period_mat` | ⭐ **VUE MORTE** — retirée du refresh (migration `20260607160000`) | ✅ aucune action |
| `expenses_summary_mat` | ne lit ni `sales` ni `items` | ✅ hors périmètre |

### 3.1 Les deux mécanismes de corruption, qui diffèrent

**`bar_ancillary_stats_mat` — agrégation directe.** Elle extrait le `product_id` de chaque
item : un plat y entrerait avec son `item_id`, agrégé **comme un produit**. Corruption
directe et visible dans les données.

**`product_sales_stats_mat` — collision par jointure.** Elle part de `bar_products` et joint
les items. Un plat n'y apparaîtra pas comme ligne — mais ses **quantités** pourraient
s'agréger sur un produit si la jointure ne filtre pas. C'est le scénario le plus insidieux :
aucune ligne aberrante, seulement un chiffre gonflé.

⚠️ `daily_sales_summary_mat` porte le **CA quotidien** — l'indicateur le plus regardé du
produit. Et elle alimente `bar_stats_multi_period_mat` : une erreur s'y propage en cascade.

### 3.2 ⏱️ Combien de temps une erreur survit — mécanisme vérifié

Trois triggers existent sur `sales` :

| Trigger | Fonction |
|---|---|
| `after_sale_refresh_daily_summary` | `trigger_refresh_daily_summary` |
| `after_sale_refresh_product_stats` | `trigger_refresh_product_stats` |
| `after_sale_validated_refresh_stats` | `trigger_refresh_product_stats` |

⚠️ **Ils ne rafraîchissent PAS directement** : ils émettent un `pg_notify`, avec un
**débounce de 10 minutes**. Le refresh réel passe par le cron :

```
refresh-materialized-views-hc   */30 * * * *   → refresh_all_materialized_views('cron')
```

**Délai de propagation d'une donnée fausse : jusqu'à 30 minutes.** Puis elle est figée dans
la vue **jusqu'au refresh suivant**.

⭐ **Conséquence, et c'est la règle qui découle de tout ce document :**

> ⛔ **Le filtre doit être posé AVANT la première vente d'un plat.**
> Une vue matérialisée *stocke* son résultat. Une seule vente suffit à polluer l'agrégat, et
> corriger le filtre après coup n'efface pas ce qui y est déjà — il faudra un `REFRESH`
> complet.

Le dispositif est par ailleurs **surveillé** (`materialized_view_refresh_log`,
`refresh_failure_alerts`, alertes email toutes les 15 min) : un refresh en échec à cause
d'un item mal formé déclencherait une alerte.

---

## 4. Fonctions — 9 relevées, **6 à traiter**

### 4.1 ⛔ Lecture — statistiques corrompues si non filtrées

| Fonction | Rôle | Risque |
|---|---|---|
| `get_top_products_aggregated` | Top produits du dashboard | Un plat dans le classement des **boissons** |
| `get_top_products_by_server` | Performance par serveur | Idem, par serveur |
| `admin_generate_bar_report` | Rapport admin | Chiffres faux transmis au promoteur |

⚠️ `get_top_products_aggregated` **lit les tables brutes** (c'est elle qui a rendu
`top_products_by_period_mat` inutile). Elle a déjà fait l'objet d'un correctif de **fan-out**
(`20260505000000`) : ne pas le réintroduire en ajoutant le filtre.

### 4.2 ⚠️ Écriture — doivent PRODUIRE et PRÉSERVER le format

| Fonction | Traitement |
|---|---|
| `create_sale_idempotent` | Doit accepter et **conserver** `item_type` |
| `admin_as_create_sale` | Idem |
| **`cancel_sale`** | ⭐ Doit **distinguer** : restituer le stock d'un produit, **jamais** la matière d'un plat |

⭐⭐ **`cancel_sale` est le point le plus délicat du chantier.** Le §6.1 pose qu'annuler un
plat déjà `ready` ne restitue **pas** la matière — elle est consommée, c'est une perte
mesurée (4ᵉ métrique, §8). Si `cancel_sale` tente de recréditer `bar_products` avec un
`item_id` de plat, il incrémentera soit rien, soit **le stock d'un produit par collision
d'UUID**.

### 4.3 ✅ Écartées — vérifiées une par une

| Fonction | Vérification | Verdict |
|---|---|---|
| `consume_ingredients_fefo` | **0 occurrence** de `sales.items` — lit `p_items` (ingrédients) | faux positif |
| `convert_purchase_order_to_supplies` | **0 occurrence** — lit `p_received_items` (bons fournisseur) | faux positif |
| `compute_sale_items_count` | Lit `NEW.items`, fait `SUM(quantity)` **sans distinction** | ✅ **correct tel quel** |

⭐ **`compute_sale_items_count` ne doit surtout PAS être filtré.** C'est le trigger qui
alimente `sales.items_count`, un compteur d'**articles vendus** — et un plat *est* un
article vendu. L'exclure afficherait « 2 articles » sur un ticket qui en contient 3.

> **C'est le contre-exemple utile de cet inventaire.** La question n'est pas
> « lit-il `sales.items` ? » mais **« produit-il une statistique PRODUIT ? »**.

---

## 5. `product_id` sans FK — le motif élargi du §13.9

Relevé exhaustif sur `product_id`, `item_id`, `dish_id` :

| Table | Colonne | Intégrité |
|---|---|---|
| `consignments`, `purchase_order_items`, `returns`, `stock_adjustments`, `supplies` | `product_id` | ✅ FK |
| `dish_ingredients` | `dish_id` | ✅ FK |
| **`promotion_applications`** | `product_id` | **⚠ SANS FK** |
| **`bar_product_audit_log`** | `product_id` | **⚠ SANS FK** |

### 5.1 Ce que ce relevé corrige dans le §13.9

| Affirmation du plan | Réalité vérifiée |
|---|---|
| `returns.product_id` sans FK | ❌ **A une FK** — protégé par la base |
| `promotion_applications.product_id` sans FK | ✅ exact |
| — | ⭐ **`bar_product_audit_log.product_id`** — **non mentionné par le plan** |

**Six colonnes sur huit ont une FK** : un `dish_id` y serait **rejeté par la base**. Le rayon
d'exposition est plus étroit que le §13.9 le laissait craindre — mais il contient un objet de
plus.

### 5.2 À traiter

- **`promotion_applications`** — le §4 prévoit déjà d'y ajouter `item_type` (« sinon
  analytics faux », §15.2). Confirmé nécessaire.
- **`bar_product_audit_log`** — à trancher : ne jamais y écrire de plat, ou y ajouter le
  discriminant. Un `product_id` de plat y produirait des lignes d'audit pointant vers un
  produit inexistant — invisible jusqu'à une enquête, où elles brouilleraient la piste.

---

## 6. Écart avec la checklist du §13.9

| Cible annoncée | Statut après relevé |
|---|---|
| Top produits | ✅ 2 RPC + `product_sales_stats_mat` |
| Dashboard / stats quotidiennes | ✅ `daily_sales_summary_mat` (+ cascade) |
| Stats par serveur | ✅ `get_top_products_by_server` |
| Analytics promotions | ✅ `promotion_applications` |
| Forecasting | ⚠️ **aucun objet SQL** — côté client |
| Exports | ⚠️ **aucun objet SQL** — côté client |
| Résumés de ticket (`BonStrip`, `useTickets`) | ⚠️ côté client |
| — | ⭐ **`bar_ancillary_stats_mat`** — non mentionnée |
| — | ⭐ **`admin_generate_bar_report`** — non mentionnée |

**Trois cibles du plan n'existent pas en SQL** : elles vivent côté client, où **72 lectures**
de `sale.items` ont été dénombrées. Second volet d'inventaire nécessaire — risque moindre,
le typage TypeScript rendant la confusion visible à la compilation, ce que le JSONB ne fait
pas.

---

## 7. Ordre de traitement — phase 3A

1. **Les 3 vues matérialisées** — elles stockent, l'erreur y persiste
2. **Les 3 RPC de lecture** — top produits ×2, rapport admin
3. **Les 3 RPC d'écriture** — dont `cancel_sale` et sa règle de non-restitution
4. **`promotion_applications`** — discriminant `item_type`
5. **`bar_product_audit_log`** — décision à prendre
6. **Inventaire côté client** — 72 lectures, second document

⛔ **Aucune vente de plat avant que 1 à 3 soient traités.**

---

## 8. Ce qui reste NON vérifié

Par honnêteté sur les limites de ce document :

- ☐ **Les 72 lectures côté client** — non balayées
- ☐ **Le contenu exact** des définitions de `daily_sales_summary_mat` et
  `product_sales_stats_mat` au-delà des 600 premiers caractères
- ☐ **Les Edge Functions** — non inspectées ; si l'une lit `sales.items`, elle échappe à ce
  relevé SQL
- ☐ **`admin_generate_bar_report`** — présence confirmée, contenu non lu

---

## 9. ⚠️ Méthode — ce que cet inventaire a coûté

**Ce document a été repris quatre fois.** La première version se présentait comme
exhaustive. Chaque relance a trouvé quelque chose :

| Vérification | Découverte |
|---|---|
| Triggers (`pg_trigger`) | 3 triggers de refresh, **non relevés** |
| Fonctions de refresh | `top_products_by_period_mat` est **MORTE** |
| `cron.job` | Débounce 10 min + cron 30 min — mon « refresh immédiat » était **faux** |
| Définition de `refresh_all_materialized_views` | **2 vues manquées** : `expenses_summary`, `bar_stats_multi_period` |
| Lecture des définitions | Ma regex `\bsales\b` **ne matchait pas** `sales s` (alias) → conclusion initiale inversée |

### La leçon

La première requête cherchait `sales.items` et `jsonb_array_elements` — des **motifs**. Elle
a trouvé ce qu'elle cherchait, et rien de ce qu'elle ignorait.

**La bonne source d'autorité n'était pas un `grep` sur les définitions, mais la liste de
refresh** — `refresh_all_materialized_views` énumère les vues *vivantes*. Partir de là aurait
donné le périmètre juste du premier coup, et signalé la vue morte.

C'est exactement le motif du Pré-0, où l'inventaire des décisions par rôle a dû être repris
trois fois (motif → liste blanche → balayage exhaustif).

> **Une liste fournie est un point de départ, jamais une garantie d'exhaustivité.**
> Et un inventaire qui ne s'est pas trompé au moins une fois n'a probablement pas assez
> cherché.
