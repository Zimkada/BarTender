# Inventaire des lecteurs de `sales.items` — prérequis bloquant de la phase 3A

> **Relevé en PRODUCTION le 03/08/2026**, via `pg_get_functiondef` et `pg_get_viewdef`.
> Les fichiers de migration ne font **pas** foi : 70 d'entre eux mentionnent `sales.items`,
> mais les fonctions se remplacent — seule la dernière version compte. Ce document part
> de l'état réel de la base.
>
> **Aucun code n'est modifié ici.** C'est un inventaire, comme `MATRICE_RBAC_CUISINIER.md`
> l'a été pour le Pré-0.

---

## 1. Pourquoi ce document existe

Le §4.2 du plan est catégorique :

> **Travail obligatoire de la phase 3** : auditer **toutes** les vues matérialisées et RPC
> lisant `sales.items` [...] pour qu'elles filtrent `item_type = 'product'`. C'est le **seul
> endroit du chantier où l'invariance des bars purs (§3) est menacée par le format des
> données** et non par du code — un item de plat non filtré corromprait des statistiques
> de bar.

Le danger est **silencieux** : un `product_id` de plat qui se retrouve dans une jointure
`INNER JOIN bar_products` **disparaît** sans erreur. Pas de log, pas d'exception — juste un
chiffre faux.

### Le format cible (§4.2)

```jsonc
{
  "item_type": "product" | "dish",   // ⭐ discriminant obligatoire
  "item_id":   "<uuid>",             // bar_products.id OU dishes.id
  "display_name": "Poulet braisé",   // figé
  "quantity": 2,
  "unit_price": 2500,
  "computed_cost": 1450,             // plats uniquement
  "recipe_version_id": "<uuid>"      // optionnel
}
```

**Compatibilité** : les items existants n'ont pas `item_type`. Le traiter comme `'product'`
via `COALESCE(item->>'item_type', 'product')` évite **toute reprise de données**.

---

## 2. Volumétrie — ce que pèse la décision

| Mesure | Valeur |
|---|---|
| Ventes en base | **19 281** |
| Ventes avec `items` | **19 281** (100 %) |
| Plus ancienne | 22/11/2025 |

⭐ **Conséquence directe** : une migration qui réécrirait `sales.items` toucherait 19 281
lignes de JSONB. Le `COALESCE` évite cela intégralement — **c'est ce qui rend la phase 3
sûre**. Toute proposition de « backfill des items existants » doit être refusée : elle
n'apporte rien et met en jeu l'historique comptable complet.

---

## 3. Fonctions — 9 relevées, **6 à traiter**

> Aucune ne mentionne `item_type` aujourd'hui. Après vérification une par une :
> **6 à traiter**, 3 écartées (§3.3).

### 3.1 ⛔ Bloquantes — statistiques corrompues si non filtrées

| Fonction | Rôle | Risque si non filtrée |
|---|---|---|
| `get_top_products_aggregated` | Top produits du dashboard | Un plat apparaît dans le classement des **boissons** |
| `get_top_products_by_server` | Performance par serveur | Idem, par serveur |
| `admin_generate_bar_report` | Rapport admin | Chiffres faux transmis au promoteur |

⚠️ `get_top_products_aggregated` a déjà fait l'objet d'un correctif de **fan-out**
(`20260505000000_fix_top_products_fanout_bug.sql`). Toute modification doit être vérifiée
contre ce bug déjà rencontré — ne pas le réintroduire en ajoutant le filtre.

### 3.2 ⚠️ Écriture — doivent PRODUIRE le nouveau format

| Fonction | Rôle | Traitement |
|---|---|---|
| `create_sale_idempotent` | Création de vente | Doit accepter et **conserver** `item_type` |
| `admin_as_create_sale` | Création par admin | Idem |
| `cancel_sale` | Annulation | Doit **distinguer** : restituer le stock d'un produit, pas d'un plat (§6 : la matière n'est jamais restituée) |

⭐ **`cancel_sale` est le point le plus délicat.** Le §6.1 pose qu'annuler un plat déjà
`ready` ne restitue **pas** la matière — elle est consommée. Si `cancel_sale` tente de
recréditer le stock d'un `bar_products` avec un `item_id` de plat, il incrémentera soit
rien (aucune ligne trouvée), soit **le stock d'un produit homonyme par collision d'UUID**.

### 3.3 ✅ Écartées — vérifiées une par une, AUCUNE action

> Ces trois-là remontaient parce que la requête cherche `jsonb_array_elements`, utilisé pour
> **d'autres** tableaux JSONB. Vérification faite sur le code source, pas supposée.

| Fonction | Vérification | Verdict |
|---|---|---|
| `consume_ingredients_fefo` | **0 occurrence** de `sales.items` — lit `p_items` (ingrédients) | ✅ faux positif |
| `convert_purchase_order_to_supplies` | **0 occurrence** — lit `p_received_items` (bons **fournisseur**) | ✅ faux positif |
| `compute_sale_items_count` | Lit bien `NEW.items`, mais fait `SUM(quantity)` **sans distinction de nature** | ✅ **correct tel quel** |

⭐ **`compute_sale_items_count` ne doit surtout PAS être filtré.** C'est un trigger qui
alimente `sales.items_count`, un compteur d'articles vendus. Un plat **est** un article
vendu : l'exclure ferait afficher « 2 articles » sur un ticket qui en contient 3.
C'est le contre-exemple utile de cet inventaire — **tout lecteur de `sales.items` n'est pas
à filtrer**. La question n'est pas « lit-il les items ? » mais « produit-il une statistique
PRODUIT ? ».

---

## 4. Vues matérialisées — 4 relevées, TOUTES à auditer

| Vue | Ce qu'elle alimente |
|---|---|
| `product_sales_stats_mat` | Statistiques produit — **référencée 5× dans les types générés** |
| `top_products_by_period_mat` | Top produits par période |
| `daily_sales_summary_mat` | Résumé quotidien (dashboard) |
| `bar_ancillary_stats_mat` | Statistiques annexes |

⭐⭐ **Les vues MATÉRIALISÉES sont le point le plus grave de tout l'inventaire.**

Contrairement à une fonction, une vue matérialisée **stocke** son résultat. Un plat qui y
entre y **reste** jusqu'au prochain `REFRESH` — et si le filtre est ajouté après qu'un plat
a été vendu, il faudra un `REFRESH` complet pour purger les données déjà agrégées.

**Règle qui en découle : le filtre doit être posé AVANT la première vente d'un plat.**
C'est ce qui rend cet inventaire bloquant pour la phase 3A, et non un travail de finition.

⚠️ `daily_sales_summary_mat` porte le CA quotidien. Un plat non filtré y gonflerait le
chiffre d'affaires « bar » — l'indicateur le plus regardé du produit.

---

## 5. ⭐ Le motif élargi — `product_id` sans FK

Le §13.9 avertit : « auditer **tout** `product_id` sans FK, pas seulement ces trois-là ».
Relevé exhaustif sur les colonnes `product_id`, `item_id`, `dish_id` :

| Table | Colonne | Intégrité |
|---|---|---|
| `consignments` | `product_id` | ✅ FK |
| `purchase_order_items` | `product_id` | ✅ FK |
| `returns` | `product_id` | ✅ FK |
| `stock_adjustments` | `product_id` | ✅ FK |
| `supplies` | `product_id` | ✅ FK |
| `dish_ingredients` | `dish_id` | ✅ FK |
| **`promotion_applications`** | `product_id` | **⚠ SANS FK** |
| **`bar_product_audit_log`** | `product_id` | **⚠ SANS FK** |

### 5.1 Ce que ce relevé CORRIGE dans le plan

Le §13.9 annonce **trois** tables nommant `product_id` sans FK :
`sales.items`, `returns.product_id`, `promotion_applications.product_id`.

**Deux de ces trois affirmations sont fausses** :

| Affirmation du plan | Réalité vérifiée |
|---|---|
| `returns.product_id` sans FK | ❌ **A une FK** — protégé par construction |
| `promotion_applications.product_id` sans FK | ✅ exact |
| — | ⭐ **`bar_product_audit_log.product_id`** sans FK — **non mentionné par le plan** |

⭐ **`bar_product_audit_log` est une découverte de cet inventaire.** Le plan ne la cite pas.
C'est un journal d'audit : y écrire un `product_id` de plat produirait des lignes d'audit
pointant vers un produit inexistant — invisible jusqu'à une enquête, où elles brouilleraient
la piste.

### 5.2 Ce qui reste à traiter

Seules **deux** tables sont réellement exposées :

- **`promotion_applications`** — le §4 du plan prévoit déjà d'y ajouter un discriminant
  `item_type` (« sinon analytics faux, §15.2 »). Confirmé nécessaire.
- **`bar_product_audit_log`** — à trancher : soit ne jamais y écrire de plat, soit y ajouter
  le même discriminant.

Les six autres tables ont une FK : un `dish_id` y serait **rejeté par la base**. C'est une
bonne nouvelle — le rayon d'exposition est bien plus étroit que ce que le §13.9 laissait
craindre.

---

## 6. Écart avec la checklist du §13.9

| Cible annoncée par le plan | Statut après relevé |
|---|---|
| Top produits (`product_sales_stats`) | ✅ confirmé — vue matérialisée + 2 RPC |
| Dashboard / stats quotidiennes | ✅ confirmé — `daily_sales_summary_mat` |
| Forecasting | ⚠️ **aucune fonction ni vue relevée** — à confirmer côté client |
| Exports (inventaire, ventes) | ⚠️ **aucune fonction SQL** — probablement côté client |
| Stats par serveur | ✅ confirmé — `get_top_products_by_server` |
| Analytics promotions | ✅ confirmé — `promotion_applications.product_id` sans FK |
| Résumés de ticket (`BonStrip`, `useTickets`) | ⚠️ côté client, hors de ce relevé SQL |

⭐ **Trois cibles du plan n'existent pas en SQL** (forecasting, exports, résumés de ticket) :
elles vivent **côté client**, où 72 lectures de `sale.items` ont été dénombrées. Un second
volet d'inventaire, côté TypeScript, est nécessaire — mais le risque y est moindre : le
typage rend une confusion produit/plat visible à la compilation, ce que le JSONB ne fait pas.

---

## 7. Ordre de traitement recommandé pour la phase 3A

1. **Vues matérialisées d'abord** (4) — elles stockent, donc l'erreur y persiste.
2. **RPC de lecture** (3) — `get_top_products_aggregated`, `get_top_products_by_server`,
   `admin_generate_bar_report`.
3. **RPC d'écriture** (3) — `create_sale_idempotent`, `admin_as_create_sale`, et surtout
   `cancel_sale` avec sa règle de non-restitution de matière.
4. **`promotion_applications`** — discriminant `item_type`.
5. **`bar_product_audit_log`** — décision à prendre.
6. **Inventaire côté client** — 72 lectures à balayer, second document.

⛔ **Aucune vente de plat ne doit avoir lieu avant que les points 1 à 3 soient traités.**
Une seule vente suffit à polluer une vue matérialisée, et l'erreur survit au correctif
jusqu'au prochain `REFRESH`.

---

## 8. Leçon de méthode — pourquoi ce relevé et pas la checklist

Le Pré-0 a montré que **chercher un motif ne prouve rien sur les autres** : l'inventaire des
décisions par rôle a dû être repris **trois fois** (recherche par motif, liste blanche
positive, balayage exhaustif) avant d'être complet.

Cet inventaire a donc été fait par **relevé exhaustif en production**
(`pg_get_functiondef` / `pg_get_viewdef` / `pg_constraint`), et non en vérifiant la liste du
§13.9 point par point. Résultat : il a trouvé une table que le plan ne mentionnait pas
(`bar_product_audit_log`) et infirmé une affirmation qu'il posait comme un fait
(`returns.product_id` sans FK).

Une liste fournie est un point de départ, jamais une garantie d'exhaustivité.
