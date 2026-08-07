# Plan — Module Restauration

> **Statut** : réflexion de cadrage, aucune implémentation.
> **Date** : 30/07/2026
> **Décisions structurantes** :
> 1. Intégrer au socle existant, ne pas réécrire d'application (§2).
> 2. Le plat est une entité **autonome** (`dishes`), pas un `bar_product` (§4.5).
> 3. Les ingrédients sont décrémentés à **`ready`** (matière cuite = consommée) ; la vente naît au
>    **retrait par le serveur** et naît **validée** (§6). Deux événements, deux moments.
> 4. Les **ingrédients** sont valorisés en **FIFO/FEFO** (`ingredient_lots`) — seule méthode gérant la
>    **péremption** ; les **boissons** gardent le **CUMP** inchangé (§16.13). SYSCOHADA autorise les
>    deux.
>
> ✅ **Plus aucun blocage conceptuel interne** (31/07/2026) : les 6 décisions du §12.4 sont tranchées et
> le périmètre des promotions est fixé (§15.2).
>
> ⛔ **Prérequis EXTERNES, non levés** :
> 1. **validation par un comptable OHADA** — 3 questions, §10 (dont la coexistence CUMP + FIFO) ;
> 2. **entretien terrain avec 2-3 bars-restos** — conditionne l'ordre des sous-phases (§14) — ✅ LEVÉ le 31/07.
>
> 📋 **§13 = règles à implémenter** (prescriptif), dont **§13.15 = conventions de code** relevées dans
> la configuration réelle du projet. **§6 = machine d'état faisant foi.**
> **`MATRICE_RBAC_CUISINIER.md`** à produire avant la phase 0 (§13.16).
>
> **Deux passes de revue** : §15 = audit **technique** contre le code (7 failles) ; §16 = test
> **« service réel »** (13 corrections métier, dont `service_mode` pour l'emporté — angle mort
> complet — et `cost_mode` pour l'huile de friture).

---

## 1. Point de départ

Avant cette réflexion, la restauration n'existait que par bribes dans le dépôt, jamais comme
chantier cadré :

| Source | Contenu |
|---|---|
| [.agents/workflows/syscohada_analysis.md](../../.agents/workflows/syscohada_analysis.md) | Section 2 « Le To-Be : Restauration » + section 3.C « Préparation ». La plus substantielle. |
| [PRESENTATION_TECHNIQUE.md](../../PRESENTATION_TECHNIQUE.md) §16.3 | 4 lignes : constat marché + périmètre + posture roadmap |
| [whatsapp-agent/knowledge/prospects.md](../../whatsapp-agent/knowledge/prospects.md) | Consigne commerciale : ne rien promettre sur la cuisine |

Balayage exhaustif effectué : 128 fichiers `.md` du dépôt principal + 65 du dossier
`BarTender_Copie`. Aucun document dédié. Le sujet n'avait jamais été abordé que lorsqu'il
croisait un autre travail.

**Seule trace concrète dans le code** : le plan de comptes utilise `7011` Ventes de Boissons et
`6011` Achats de Boissons ([syscohada.types.ts](../../src/services/accounting/syscohada.types.ts))
plutôt qu'un `701`/`601` générique.

> ⛔ **Appréciation initialement fausse** (corrigée le 31/07/2026, cf. §10) : je qualifiais cela
> d'« investissement minime, bien choisi ». **C'est une erreur de nomenclature**, pas une
> préparation : `7011` signifie officiellement « ventes de marchandises **dans la Région** », un
> sous-compte de ventilation **géographique**. La *logique* de séparation boissons/repas était juste ;
> la numérotation à 4 chiffres était détournée.

---

## 2. Décision fondatrice : intégrer, pas réécrire

### Ce qu'une application neuve jetterait

Le code existant n'est pas « du code » — c'est du durcissement acquis par la production réelle,
et il serait entièrement à refaire :

| Acquis | Coût déjà payé |
|---|---|
| CUMP source de vérité unique | Audit externe (finding F3), bug de CUMP doublé sur produits réels ([vague 4c](../../supabase/migrations/20260703040000_vague4c_cump_single_source_of_truth.sql)) |
| Durcissement RPC | 4 vagues certifiées en prod |
| Egress Supabase | 3 vagues, ~800 → ~200 MB/j |
| Offline + idempotence | Rollback best-effort, IDs pré-générés, file IndexedDB |
| SYSCOHADA | Service testé, Z de caisse, `businessDate` |
| Auth / RLS multi-tenant | 17 migrations touchant les rôles |

Aucune de ces lignes n'est du code métier resto. Toutes seraient à re-souffrir, dans le même
ordre, au même prix — sans savoir a priori qu'elles sont nécessaires.

### Arguments décisifs

1. **Des bars sont en production** — une app neuve impose de migrer des données comptables
   réelles et de faire changer d'outil des clients payants.
2. **La restauration est le 3e/4e chantier de la roadmap**, pas le premier. Réécrire l'app pour
   lui, c'est laisser la queue remuer le chien.
3. **Les bars purs sont le cœur de marché** — « certains bars font *aussi* resto ». Une app
   conçue bar+resto à égalité serait *moins bonne* pour les bars purs.
4. **La spécialisation bar est un atout concurrentiel** face aux ERP généralistes.
5. **Le coût du module resto est identique dans les deux scénarios.** Une app neuve n'économise
   pas une ligne de code resto ; elle ajoute la réécriture de tout le reste. Ratio ~1 à 30.

### Condition qui aurait justifié le zéro — non remplie

Le socle serait incompatible si le CUMP était faux ou le décrément irrémédiablement mono-produit.
C'est l'inverse : le moteur de valorisation existant est sain (les ingrédients seront finalement
valorisés en FIFO — §16.13 — mais **sans toucher** au CUMP des boissons), et le décrément
mono-produit est un RPC à côté duquel on en ajoute un autre. Le ticket possède déjà
`table_number` et `customer_name`, champs qui n'ont de sens qu'en restauration.

**Le socle n'est pas un obstacle au resto, il en est le point de départ.**

---

## 3. Exigence transversale : invariance totale pour les bars purs

> **Contrainte de plus haut niveau du chantier.** Elle prime sur toute considération de confort
> d'implémentation. Un arbitrage qui la met en cause doit être rejeté, pas négocié.

### Pourquoi « presque inchangé » ne suffit pas

Un bar pur ne doit pas être *presque* inchangé : il doit être **strictement identique**.
« Presque » est le mot qui autorise les petites dégradations cumulatives — un onglet vide, un
compteur à 0, une requête qui part quand même.

**Tous les clients actuels sont des bars purs.** Pour eux, le module restauration n'apporte rien :
c'est une mise à jour à bénéfice nul. Le seul résultat acceptable est donc **zéro changement
perceptible** — la moindre régression serait un coût pur, sans contrepartie.

### Les trois niveaux à garantir

| Niveau | Exigence | Piège |
|---|---|---|
| **Visuel** | Aucun menu, onglet, badge, bouton ni carte nouveaux | Un `ScopeSwitcher` grisé ou à option unique |
| **Fonctionnel** | Chemins de code identiques | Un `if (hasRestaurant)` traversant `create_sale` |
| **Réseau** | Pas un octet d'egress supplémentaire | Une query React Query avec `enabled` mal posé |

Le niveau **réseau** est le plus insidieux et le plus coûteux ici : 3 vagues d'optimisation ont été
menées pour descendre à ~200 MB/j. Une requête `kitchen_orders` partant sur tous les bars
annulerait une partie de ce travail sans que personne ne le remarque avant la facture Supabase.

**Règle pratique** : `enabled: !!barId && hasRestaurant` sur **chaque** query resto, abonnement
Realtime conditionné de même. Jamais de requête qui part « pour rien » en comptant sur un
résultat vide.

### Le point exigeant le plus de discipline

**`create_sale` pour une bière doit rester exactement le même code qu'aujourd'hui.**

La tentation naturelle serait d'ajouter une branche dans le RPC existant pour distinguer produit
et plat. Erreur : cela mettrait du code resto dans le chemin critique de **tous** les bars, y
compris purs.

Bon découpage : de **nouveaux** RPC dédiés au parcours plat (`mark_kitchen_item_ready` pour la
consommation de matière, `serve_kitchen_item` pour la vente — cf. §6 et §11), à côté de l'existant
qu'on ne touche pas. C'est aussi ce qui permet de tester le module sans risquer une régression sur
le cœur du produit.

> C'est la raison technique qui a fait pencher pour `dishes` autonome (§4.5) : avec l'héritage, il
> aurait fallu filtrer `is_dish = false` dans les requêtes existantes — donc **modifier du code
> qui sert aux bars purs**. L'autonomie garantit l'invariance **par construction**, pas par
> vigilance.

### Seule exception assumée

Les **paramètres du bar**, où l'option « Cet établissement fait aussi de la restauration » doit
apparaître pour être activable. C'est la porte d'entrée, donc légitime.

Deux précautions :
- la placer dans les paramètres **avancés** plutôt qu'en évidence — un bar pur n'a pas à se poser
  la question ;
- **⚠ à trancher** : que se passe-t-il si l'option est **désactivée** après usage ? Masquer les
  écrans est facile, mais que devient l'historique des ventes de plats déjà réalisées ? Il doit
  rester consultable en comptabilité, sinon on perd des données comptables. Désactiver ne doit
  jamais signifier supprimer.

### Vérifier plutôt qu'espérer

Une intention d'invariance ne suffit pas — il faut pouvoir la constater :

- un **test** montant l'app avec `has_restaurant = false`, vérifiant qu'aucune requête resto n'est
  émise ;
- une **comparaison de captures** avant/après sur dashboard, vente et inventaire. Le pipeline
  Playwright + sharp des guides utilisateurs peut servir à ça.

### Exigences de performance associées

L'invariance réseau ne suffit pas : le module doit aussi rester léger **pour les bars-restos**.

- **Index partiel** sur `kitchen_order_items(bar_id, status, created_at)` pour la file active —
  c'est la requête la plus fréquente du module (écran Service rafraîchi en continu).
- **Realtime sur les statuts actifs uniquement**, jamais sur l'historique des commandes soldées.
- **Fenêtre dure** sur les commandes terminées (la file ne doit jamais charger le mois écoulé).
- **Vues/RPC agrégées** pour le dashboard cuisine — pas de jointure client sur un gros historique.
- **Aucun préchargement de la route cuisine** si `has_restaurant = false` (les layouts préchargent
  les pages critiques en arrière-plan : la page Cuisine doit en être exclue conditionnellement).

---

## 4. Modèle de données

### 4.1 Principe : le plat est vendable, pas stocké

Le coût d'un plat est **dérivé de sa recette**, jamais stocké comme un coût d'achat. Un plat n'a
pas de stock mais une *disponibilité calculée*.

Corollaire : **les ingrédients ne sont pas des `bar_products`**. Les tomates ne doivent pas
apparaître dans l'inventaire de boissons ni dans le catalogue de vente.

```
ingredients                          -- tomates, poulet, huile, gaz
  id, bar_id, name, category
  purchase_unit          -- 'kg', 'L', 'sac'        (ce qu'on achète)
  usage_unit             -- 'g', 'ml', 'unité'      (ce que la recette consomme)
  conversion_factor      -- 1 kg = 1000 g
  current_stock          -- en usage_unit — dérivé de Σ(lots.remaining_qty)
  cost_mode              -- ⭐ direct | global | per_dish_flat | cost_only (cf. 14.3)
                         --   remplace le booléen is_transversal, trop binaire
  default_shelf_life_days -- ⭐ durée de conservation par défaut (pré-remplit expires_at)
  min_stock_alert
  -- ⚠ PAS de current_average_cost : les ingrédients sont valorisés en FIFO/FEFO (cf. 14.13)

ingredient_lots                      -- ⭐⭐ FIFO/FEFO — un lot par approvisionnement (14.13)
  id, bar_id, ingredient_id
  received_qty           -- en usage_unit
  remaining_qty          -- décrémenté à la consommation ; 0 = lot épuisé
  unit_cost              -- coût d'achat RÉEL de ce lot (pas une moyenne)
  received_at, expires_at
  supply_id              -- lien vers ingredient_supplies
  -- ⛔ is_regularization SUPPRIMÉ : les lots négatifs sont remplacés par
  --    la table ingredient_stock_debts (cf. 13.2)
  expired_qty, expired_at -- perte par péremption, valorisée à unit_cost

dishes
  id, bar_id, name, category_id, price
  is_available           -- le cuisinier coupe un plat
  production_mode        -- ⭐⭐ V1 : on_order | batch | batch_finish   (cf. 15.8)
                         --    'precooked' reporté Post-V1 : c'est un bar_product,
                         --    pas un plat (cf. 12.4.c)
                         --    remplace requires_preparation, trop binaire
  preparation_time_min   -- calibre les seuils d'alerte de retard
  -- ⛔ resale_window_min : RETIRÉ du périmètre V1 (cf. 16.11) — Post-V1 uniquement
  is_batch_base          -- ⭐ true = lot produit puis prélevé (riz cuit, poulet bouilli)
  portions_per_batch     -- ⭐ rendement du lot (5 kg riz ≈ 20 portions)
  photo_url

dish_ingredients                     -- recette : ingrédients bruts
  dish_id, ingredient_id
  quantity               -- en usage_unit
  is_optional
  yield_factor           -- pertes de préparation (épluchage, parage)
  consumed_at_stage      -- ⭐ 'batch' | 'finish' (cf. 14.8 batch_finish)

dish_recipe_components               -- ⭐ le MODÈLE : sous-recettes (cf. 12.4.d, 15.12)
  dish_id                -- le plat composé
  base_dish_id           -- la base réutilisable (sauce, marinade, bouillon)
  quantity               -- portions de base prévues
                         -- ⚠ PAS de coût ici : une recette porte une quantité, pas un prix

kitchen_item_batch_consumptions      -- ⭐ l'INSTANCE : lots réellement prélevés (cf. 12.4.d)
  kitchen_order_item_id
  production_batch_id
  quantity, unit_cost    -- le coût vit ICI, pas sur la recette

-- ⭐ EXISTANT — ajouts pour les promotions (cf. 14.2)
bar_categories
  type                   -- ⭐ 'product' | 'dish' — une catégorie n'est JAMAIS mixte
promotions
  target_type            -- + 'dish' / 'all_dishes' ; 'all' reste = BOISSONS seulement
promotion_applications
  item_type, item_id     -- ⭐ discriminant (product|dish) — sinon analytics faux (§15.2)

ticket_payment_events                -- ⭐ LEDGER de paiement (cf. 13.1)
  id, bar_id, ticket_id
  event_type             -- 'payment' | 'refund' | 'transfer_to_substitution'
  amount                 -- toujours POSITIF ; event_type porte le sens
  payment_method         -- pour 'payment' et 'refund'
  kitchen_order_item_id  -- pour 'refund' / 'transfer_to_substitution'
  created_by, created_at, business_date, notes
  -- solde = Σ(payment) − Σ(refund) − Σ(transfer_to_substitution)

ingredient_stock_debts               -- ⭐ remplace les lots négatifs (cf. 13.2)
  id, bar_id, ingredient_id
  qty_owed               -- consommé sans stock disponible (POSITIF)
  estimated_unit_cost    -- dernier prix connu au moment de la dette
  incurred_at, business_date
  settled_qty, settled_at
  price_variance         -- écart estimé / réel, calculé au solde
  status                 -- 'open' | 'settled'

production_batches                   -- ⭐ lots produits (cf. 16.8 batch / batch_finish)
  id, bar_id, dish_id    -- dish_id = le plat-base (is_batch_base = true)
  produced_qty           -- portions produites
  remaining_qty          -- portions restantes (décrémenté au service)
  status                 -- ⭐ active | depleted | expired | discarded | closed (cf. 13.3)
  unit_cost              -- coût de production / portions (coût moyen du lot)
  produced_at, produced_by, business_date
  expires_at             -- fin de conservation
  discarded_qty, discarded_at, discard_reason  -- reste jeté = perte valorisée

ingredient_supplies                  -- miroir de supplies
  id, bar_id, ingredient_id, quantity, unit_cost, total_cost
  supplier, business_date, created_by

ingredient_adjustments               -- ⭐ calque stock_adjustments (cf. 14.5)
  id, bar_id, ingredient_id
  ingredient_lot_id      -- ⭐ QUEL lot est ajusté (sinon coût non imputable en FIFO)
  old_qty, new_qty, delta -- ⚠ PAS de CHECK >= 0 (stock négatif autorisé, §4.4)
  reason                 -- inventory_count | loss_damage | donation_sample
                         -- | expiration | theft_report | other  (même ENUM que le bar)
  notes                  -- obligatoires si reason = 'other'
  adjusted_by, adjusted_at, business_date

tickets                              -- ⭐ EXISTANT — 2 colonnes ajoutées (cf. 12.4.a, 12.4.b)
  ... colonnes actuelles inchangées (status reste 'open' | 'paid')
  fulfillment_status     -- ⭐ NULL | pending | fulfilled
                         --    NULL = aucune ligne cuisine → bar pur inchangé (§3)
  -- ⛔ prepaid_amount SUPPRIMÉ : solde calculé depuis ticket_payment_events (cf. 13.1)

kitchen_orders                       -- extension du ticket, PAS un doublon
  id, bar_id ⭐, ticket_id
  status                 -- DÉRIVÉ des lignes, jamais écrit directement (cf. 4.3)
  service_mode           -- ⭐ 'dine_in' | 'takeaway' (cf. 15.1) — delivery hors V1
  priority, notes
  created_at

kitchen_order_items                  -- ⭐ porteur du statut canonique
  id, bar_id ⭐, kitchen_order_id, dish_id, quantity
  status                 -- pending | accepted | preparing | ready | served | cancelled
  accepted_by, accepted_at
  ready_at, ready_by     -- ⭐ moment de la CONSOMMATION de matière
  served_at, served_by   -- ⭐ moment de la NAISSANCE du CA
  cancelled_by, cancelled_at
  cancel_reason          -- ⭐ ENUM structuré, pas du texte libre (cf. 14.4)
  cancel_note            -- texte libre en complément, jamais à la place
  reminder_count, last_reminder_at
  modifiers              -- JSONB : « sans piment »
  unit_price
  computed_cost          -- ⭐ snapshot du coût matière, figé à `ready` (cf. 6)
  consumed_at            -- ⭐ horodatage du décrément (idempotence)
  sale_id                -- ⭐ FK nullable — NULL si ready mais jamais servi (= perte)
```

Le couple `consumed_at` / `sale_id` porte la distinction du §6 : une ligne avec `consumed_at`
renseigné mais `sale_id` à NULL est une **perte** (matière consommée, aucun produit). C'est cette
combinaison qui rend les pertes cuisine mesurables plat par plat.

⭐ **`bar_id` obligatoire sur les deux tables**, bien que dérivable via `ticket_id`. Toutes les
tables du projet le portent : c'est la convention d'isolation multi-tenant, et les policies RLS
comme les filtres Realtime en dépendent. Dériver par jointure alourdirait chaque policy, chaque
index et chaque filtre Realtime. Prévoir une contrainte de cohérence avec le `bar_id` du ticket.

### 4.2 Format unifié de `sales.items` — produits et plats

**Fait vérifié** : il n'existe **aucune table `sale_items`**. Les lignes de vente sont stockées
dans `sales.items JSONB NOT NULL`
([001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)) — donc **aucune
contrainte référentielle vers `bar_products` à contourner**. Même bonne surprise que pour les
promotions (§4.5, fait 4).

**Mais c'est un risque, pas un confort.** Puisque le JSONB n'impose rien, rien n'empêchera un
`product_id` de plat de se retrouver dans une vue de stats produits jointe sur `bar_products`, et
de **disparaître silencieusement d'un `INNER JOIN`**. Un JSONB non typé est plus dangereux qu'une
FK : l'erreur ne remonte pas, elle se traduit en chiffres faux.

**Format à imposer dès la phase 3** :

```jsonc
{
  "item_type": "product" | "dish",   // ⭐ discriminant obligatoire
  "item_id":   "<uuid>",             // bar_products.id OU dishes.id selon item_type
  "display_name": "Poulet braisé",   // figé (le plat peut être renommé plus tard)
  "quantity": 2,
  "unit_price": 2500,
  "computed_cost": 1450,             // coût matière figé (plats uniquement)
  "recipe_version_id": "<uuid>"      // optionnel — traçabilité de la recette servie
}
```

**Travail obligatoire de la phase 3** : auditer **toutes** les vues matérialisées et RPC lisant
`sales.items` (stats produits, top produits, forecasting, CUMP, exports) pour qu'elles filtrent
`item_type = 'product'`. C'est le **seul endroit du chantier où l'invariance des bars purs (§3)
est menacée par le format des données** et non par du code — un item de plat non filtré
corromprait des statistiques de bar.

Note de compatibilité : les items existants n'ont pas `item_type`. Traiter l'absence comme
`'product'` (`COALESCE(item->>'item_type', 'product')`) évite toute reprise de données.

### 4.3 Statut canonique au niveau ligne, parent dérivé

`kitchen_orders.status` et `kitchen_order_items.status` modifiables indépendamment créeraient une
classe entière de bugs de synchronisation. Cas sans réponse au niveau parent : **une commande de
2 plats dont l'un est prêt et l'autre annulé — quel statut porte le parent ?**

**Règle** : le statut canonique vit sur la **ligne**. Le statut parent est **dérivé** (vue, RPC ou
trigger), jamais écrit directement. Dérivation suggérée :

| Toutes les lignes… | Statut parent dérivé |
|---|---|
| `cancelled` | `cancelled` |
| `served` ou `cancelled` | `served` (commande soldée) |
| au moins une `ready`, aucune en cours | `ready` |
| au moins une `preparing` | `preparing` |
| sinon | `pending` |

### 4.4 Points non négociables

**`computed_cost` figé à `ready`** (moment de la consommation de matière — §6, §16.13), **jamais
recalculé**. Recalculer la marge d'un plat de mars avec les prix de juillet rendrait tout l'historique
de marge faux. C'est la leçon déjà apprise sur le CUMP des boissons.

**Séparation `purchase_unit` / `usage_unit`.** Le promoteur achète un sac de riz de 25 kg, la
recette consomme 300 g. Sans conversion explicite : soit des recettes en « fractions de sac »
(illisible), soit un appro pénible. Confirmé par les pratiques professionnelles de costing
(AP cost converti en unités de recette + yield pour les pertes).

**Ni tout décrémenter, ni tout exclure — `cost_mode` à 4 niveaux (§16.3).** Modéliser le sel au
gramme est une fausse précision (saisie alourdie, résultat inexploitable) ; mais exclure l'huile de
friture du coût d'un alloco est un **biais de marge**. D'où quatre traitements : `direct`
(décrémenté + coût), `global` (stock simple + charge indirecte : sel, eau), `per_dish_flat`
(forfait au coût sans décrément : **huile de friture**, charbon, emballage), `cost_only`. Le gaz
reste une charge de cuisine (`6052`), pas un ingrédient de recette.

**Stock d'ingrédients non bloquant.** Ne jamais empêcher un plat de sortir parce que le stock
théorique dit 0 : en cuisine réelle, le cuisinier voit ce qu'il a. Alerte, jamais blocage —
l'inverse du stock de boissons.

### 4.5 Le plat est une entité autonome — décision tranchée

Deux options étaient en balance : `dishes` autonome, ou `bar_product` avec `is_dish = true`
(qui hériterait gratuitement des promotions, du price guard, du catalogue et des images).

**Décision : `dishes` autonome.** Analyse sur pièces ci-dessous.

#### Faits établis dans le code

1. **`bar_products` impose `CHECK (stock >= 0)`**
   ([001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)). Un plat n'a pas
   de stock : le champ resterait à 0 en permanence — un **champ mensonger structurel**, pas
   seulement inutile.

2. **Un invariant global/custom est gravé en base :**
   ```sql
   CHECK ((global_product_id IS NOT NULL) OR (is_custom_product = true AND local_name IS NOT NULL))
   ```
   Cet invariant a **déjà causé une corruption de données héritée** bloquant la modification des
   prix en inventaire (corrigée par migration dédiée). Y injecter une troisième nature d'objet
   ajoute du risque sur un invariant déjà fragile.

3. **Au moins 10 tables ont une FK `ON DELETE CASCADE` vers `bar_products`** : `supplies`,
   `returns`, `stock_adjustments`, `purchase_orders`, `decisions_manuelles`… Chacune hériterait
   mécaniquement des plats — un plat pourrait apparaître dans un bon de commande fournisseur.

4. **Les promotions ciblent par `target_product_ids UUID[]`, SANS clé étrangère**
   ([059_create_promotions_and_events.sql](../../supabase/migrations/059_create_promotions_and_events.sql)).
   Le moteur travaille sur des UUID nus, donc il peut cibler des plats venant d'une autre table :
   l'argument « menu du jour à prix réduit » n'impose donc **pas** l'héritage.

   > ⚠ **Vérification initialement incomplète** (corrigée à l'audit, cf. §15.2) : j'avais lu
   > `target_product_ids` sans lire `target_type TEXT CHECK (target_type IN ('product', 'category',
   > 'all'))`. Les modes **`'all'`** et **`'category'`** posent un vrai problème de périmètre
   > (§15.2). Les promotions ne sont donc **pas gratuites** avec `dishes` autonome — cet avantage
   > était surestimé. La décision reste valide sur ses autres appuis (faits 1-3 et 5, et surtout le
   > filtrage `is_dish = false` à propager partout), mais pas sur celui-là.

5. **Le price guard, lui, est couplé** : il lit `bar_products.price` et `display_name` pour
   valider chaque ligne
   ([restore_strict_price_guard.sql](../../supabase/migrations/20260704073000_restore_strict_price_guard.sql)).
   Un plat hors de cette table y échapperait — sauf extension explicite (cf. coûts acceptés).

#### Comparaison

| | `bar_product` + `is_dish` | `dishes` autonome |
|---|---|---|
| Contrainte `stock >= 0` | Champ mensonger permanent | Sans objet |
| Invariant global/custom | 3ᵉ nature dans un invariant déjà fragile | Sans objet |
| 10 FK CASCADE | Héritées **toutes**, à neutraliser une par une | Aucune |
| `display_name`, `alert_threshold`, `local_image` | Sémantique à réinterpréter | Champs propres |
| Promotions | Gratuit pour `'product'`, mais `'all'`/`'category'` restent ambigus | Ciblage `'product'` possible (UUID[] sans FK) ; périmètre `'all'`/`'category'` **à définir dans les deux cas** (§15.2) |
| Price guard | Gratuit | À dupliquer dans le RPC plat (§15.5) |
| Catalogue / photos | Hérité | À rebâtir (nom, prix, image — borné) |
| **Requêtes existantes sur les produits** | **Toutes** à filtrer `is_dish = false` | **Inchangées** |

#### Raisons de la décision, par ordre d'importance

1. **La règle de ce chantier est « ne rien casser dans le bar ».** C'est la raison même du choix
   d'intégrer plutôt que réécrire (§2). Injecter les plats dans la table centrale du modèle
   produit met le risque **au cœur** de ce qui fonctionne — l'inverse de l'objectif.

2. **Le coût de l'héritage est récurrent, celui de l'autonomie est ponctuel.** Rebâtir un
   formulaire de plat est un travail fini. Filtrer `is_dish = false` partout (inventaire,
   forecasting, stats produits, réassort, alertes de stock bas) est une **dette permanente** :
   chaque nouvelle requête devra y penser, indéfiniment, y compris par des développeurs qui
   ignoreront la raison du filtre. **En oublier une seule = un plat dans l'inventaire des
   boissons ou compté dans une alerte de stock** — un défaut invisible en test, visible en
   production chez un client.

3. **Les deux objets sont sémantiquement distincts.** Un produit est acheté puis revendu (stock +
   CUMP d'achat). Un plat est produit (recette + coût calculé). Les forcer dans la même table
   produit exactement le genre de champ mensonger (`stock = 0` éternel) qui finit par tromper.

#### Coûts acceptés

- **Étendre le price guard aux plats** — garde-fou anti-fraude issu de plusieurs migrations
  correctives. **Obligatoire, pas optionnel** : les plats ne doivent pas y échapper.
- **Créer un formulaire de plat** (nom, prix, catégorie, photo, disponibilité) — modeste mais réel.
- **`create_sale_with_promotions`** doit distinguer produit et plat — mais c'était vrai **dans les
  deux options** (un plat ne décrémente pas son stock mais N ingrédients).
- **Catégories** : réutiliser `bar_categories` avec un flag de type est probablement suffisant, à
  condition de filtrer côté cuisine.

#### Variante écartée

Une table parente `sellable_items` dont `bar_products` et `dishes` hériteraient : élégant sur le
papier, mais imposerait de migrer la table centrale d'une application **en production** pour un
bénéfice théorique. Abstraction prématurée.

---

## 5. Prise de commande : boissons et plats sur une même addition

### Un client, une addition — deux chemins d'exécution

Un client commande « 2 bières et 1 poulet » en un geste et paie une seule addition. Mais les deux
natures ont des cycles de vie incompatibles :

| | Boisson | Plat |
|---|---|---|
| Délai de service | Immédiat | 10-40 min de production |
| Consommation de stock | 1 ligne, à la vente | N ingrédients, à la production |
| Peut échouer | Non | Oui (rupture découverte en cuisine) |
| Annulable après commande | Rarement | Oui, avant production |

Forcer les deux dans le même chemin technique dégraderait le bar ou rendrait la cuisine
inutilisable.

### Le ticket comme point de convergence

**Correction d'une erreur d'analyse initiale** : le ticket n'est pas « la commande ».
[pay_ticket](../../supabase/migrations/20260204000000_create_tickets_table.sql) ne fait qu'un
`UPDATE status='paid'` — il ne crée aucune vente. Le flux réel
([QuickSaleFlow.tsx](../../src/components/QuickSaleFlow.tsx)) crée le bon **puis** chaque vente
immédiatement avec `ticketId`. Le ticket est donc un **regroupement de ventes déjà enregistrées**,
c'est-à-dire **l'addition**.

> Le bon est **optionnel** pour une boisson (vente au comptoir) mais **nécessaire** pour un plat qui
> demande une préparation — sinon la commande n'a aucun support pendant sa production. D'où le **bon
> implicite** de §16.7, créé automatiquement dès qu'un plat entre dans le panier.

```
        TICKET (addition unique — table 5)
                    │
        ┌───────────┴───────────┐
        │                       │
   LIGNES BOISSONS         LIGNES PLATS
   create_sale immédiat    kitchen_order (pending)
   stock décrémenté        → cuisinier : accepted → preparing
   ✅ chemin actuel        → ready   : MATIÈRE décrémentée + coût figé
      INTACT               → served  : VENTE créée (CA)
        └───────────┬───────────┘
                    │
             pay_ticket (existant)
             une seule addition, un seul encaissement
```

> **Référence unique des transitions : §6 (machine d'état).** Les descriptions narratives de ce
> document sont indicatives ; en cas de divergence, **la machine d'état fait foi**.

Le serveur ne voit qu'un écran avec onglets Boissons / Plats. La séparation est invisible pour
lui, réelle en dessous.

### Garde-fous — prérequis bloquants de la phase 3

**1. `pay_ticket` doit refuser la fermeture s'il reste des `kitchen_order_items` non
`served`/`cancelled`** — ✅ **règle maintenue sans assouplissement en V1** (l'emporté payé d'avance est
Post-V1, §14). L'assouplissement décrit en §16.2 ne s'appliquera qu'avec l'emporté.

Ce n'est pas une précaution mais une **nécessité de cohérence comptable**. `pay_ticket` a évolué :
il prend désormais `p_payment_method` et **propage le moyen de paiement aux ventes du ticket**
([vague 4a](../../supabase/migrations/20260703020000_vague4a_close_anon_execute_breach.sql)). Or un
plat non encore servi **n'est pas encore une vente**. Sans ce garde-fou, un plat servi après
paiement produirait une vente **sans moyen de paiement propagé** — donc une ligne comptable
orpheline, invisible dans la ventilation des encaissements.

Le RPC a déjà la bonne structure pour l'accueillir (`FOR UPDATE`, rejet des statuts invalides).

**2. Le résumé du ticket doit additionner ventes existantes + lignes cuisine non encore
comptables.** Sinon l'addition affichée est **fausse** avant le service (elle omet les plats en
préparation). D'où la ligne « dont en cuisine » de l'écran de vente (§9).

---

## 6. ⭐⭐ MACHINE D'ÉTAT — référence unique des transitions

> **Ce document fait foi.** Les sections narratives sont indicatives ; en cas de divergence, cette
> machine d'état prévaut. **À produire et valider AVANT la première migration.**
>
> **Pourquoi elle existe** : les transitions étaient décrites en prose, dispersées sur ~2 000 lignes.
> Résultat mécanique — 5 contradictions internes accumulées après les corrections successives
> (« coût figé à la commande » vs « à `ready` », « vente et décrément simultanés », deux formules au
> CUMP après le passage au FIFO, un schéma de flux obsolète). Ces contradictions ne sont pas des
> étourderies : elles sont le **symptôme prévisible** de l'absence de table de vérité unique.

### 6.1 `kitchen_order_item` — statut canonique (§4.3)

| De | Transition | Vers | Acteur | Effet **stock** | Effet **CA** |
|---|---|---|---|---|---|
| — | `create` | `pending` | serveur / gérant | — | — |
| `pending` | `accept` | `accepted` | cuisinier | — | — |
| `pending` / `accepted` | `start` | `preparing` | cuisinier | — | — |
| `preparing` | **`mark_ready`** | `ready` | cuisinier | ⭐ **décrément FEFO + `computed_cost` figé + `consumed_at`** | — |
| `ready` | **`serve`** | `served` | serveur | — | ⭐ **vente créée `validated` + `sale_id`** |
| `pending` / `accepted` / `preparing` | `cancel` | `cancelled` | cuisinier | — (rien consommé) | — |
| `ready` | `cancel` | `cancelled` | gérant | ⚠ **matière consommée, NON restituée** | — (aucune vente n'a existé) → **perte** (§8) |

**Transitions interdites** — à faire respecter par les RPC, pas seulement par l'UI :
- `pending → served` (on ne sert pas un plat non produit) ;
- `served → cancelled` (utiliser `cancel_sale`, qui annule le CA sans restituer la matière) ;
- toute transition rétrograde (`ready → preparing`) ;
- `cancel` par le **cuisinier** après `ready` (décision sanitaire/commerciale = gérant).

**Invariants** :
- `consumed_at IS NOT NULL` ⟺ statut ∈ {`ready`, `served`} ou (`cancelled` **après** `ready`) ;
- `sale_id IS NOT NULL` ⟺ statut = `served` ;
- `consumed_at IS NOT NULL AND sale_id IS NULL` ⟹ **perte** (4ᵉ métrique, §8).

### 6.2 `kitchen_order` — statut DÉRIVÉ, jamais écrit

Calculé depuis les lignes (§4.3). Aucune transition propre, aucun RPC n'écrit ce champ.

### 6.3 `ticket` — ⚠ DEUX AXES, pas un

⛔ **Décision à trancher avant la phase 3.** `tickets.status` n'a qu'un axe
(`CHECK (status IN ('open','paid'))`,
[migration](../../supabase/migrations/20260204000000_create_tickets_table.sql)). Or le paiement
anticipé (§16.2) autorise un ticket **payé avec des plats encore en cuisine** — donc `paid` ne
signifie plus « terminé », et un tel ticket **disparaîtrait des bons ouverts** alors qu'il reste du
travail.

Séparation nécessaire :

| Axe | Valeurs | Sens |
|---|---|---|
| `payment_status` | `unpaid` / `paid` | l'argent est encaissé |
| `fulfillment_status` | `pending` / `fulfilled` | toutes les lignes sont `served`/`cancelled` |

Un ticket n'est **clos** que si `paid` **et** `fulfilled`. Les 4 combinaisons sont légitimes :

| `payment` | `fulfillment` | Cas réel |
|---|---|---|
| `unpaid` | `pending` | service en cours (cas normal) |
| `unpaid` | `fulfilled` | tout servi, addition à encaisser |
| **`paid`** | **`pending`** | ⭐ **emporté payé d'avance** (§16.2) |
| `paid` | `fulfilled` | clos |

### 6.4 `production_batch` (§16.8)

| De | Transition | Vers | Effet |
|---|---|---|---|
| — | `produce` | actif | **décrément FEFO des ingrédients** + `unit_cost` = coût / portions |
| actif | `consume` | actif ou épuisé | `remaining_qty −= n` — ⚠ **ne touche PAS aux ingrédients** (déjà consommés) |
| actif | `expire` | clos | `discarded_qty` → **perte valorisée** à `unit_cost` |

⚠ **Piège du double comptage** (§16.8) : `consume` ne décrémente **jamais** les ingrédients.

### 6.5 `sale` — inchangé

Le circuit existant (`pending → validated` / `rejected`) n'est **pas modifié**. Une vente issue de
`serve` naît directement `validated` (§7) — elle n'entre pas dans le circuit de validation gérant.

### 6.6 Effets comptables par transition — table de vérité

| Transition | Charge (classe 6) | Produit (classe 7) | `business_date` |
|---|---|---|---|
| `mark_ready` | ⭐ consommation matière (`602`) | — | `served_at` si servi plus tard, sinon `consumed_at` (§15.4) |
| `serve` | — | ⭐ vente (`702`) | `served_at` |
| `cancel` après `ready` | consommation matière (`602`) | — (perte) | `consumed_at` |
| `produce` (lot) | consommation matière (`602`) | — | `produced_at` |
| `expire` (lot) | perte valorisée | — | date de constat |

⚠ **Une seule `business_date` comptable** (§15.4) — `ready_at` / `served_at` restent disponibles comme
horodatages bruts pour l'analyse opérationnelle. Ne **pas** créer deux journées comptables
concurrentes : les rapports cesseraient de s'accorder selon celle qu'ils utilisent.

---

## 7. Validation : le double constat remplace le contrôle a posteriori

### Deux validations de nature différente

| | Validation cuisine | Validation financière |
|---|---|---|
| Question | « Puis-je le faire ? » | « Cette vente est-elle légitime ? » |
| Qui | Cuisinier | Gérant / promoteur |
| Objet | `kitchen_order_item.status` | `sales.status` |
| Existe | Non (à créer) | Oui (`validate_sale`) |

### Le cuisinier valide la faisabilité

Il peut **refuser** un plat, mais uniquement **avant** `preparing`, avec un motif **structuré**
(`cancel_reason` en énumération — §16.4, pas du texte libre). Puisque
la vente n'existe pas encore, un refus n'a **aucune conséquence comptable** — rien à
contre-passer. Le cuisinier ne touche jamais à l'argent, seulement à la faisabilité.

### La vente naît au retrait par le serveur — et naît validée

**Correction majeure du raisonnement initial.** J'avais transposé le circuit
`pending → validate_sale` des boissons vers les plats sans interroger sa raison d'être.

Pourquoi ce circuit existe : un serveur prend une bière au frigo et l'encaisse — **personne n'a
rien constaté**. La validation gérant est son seul point de contrôle.

Un plat, c'est structurellement différent : le cuisinier marque `ready`, le serveur vient
retirer. **Deux personnes distinctes ont constaté la sortie physique.** Le contrôle est dans le
processus, plus solide qu'une validation d'écran a posteriori. Aucun des deux ne peut fabriquer
une vente seul.

```
Serveur commande → pending
Cuisinier accepte → preparing
Cuisinier a fini → ready     ⟵ ⭐ MATIÈRE CONSOMMÉE : décrément ingrédients + snapshot coût
SERVEUR RETIRE  → served     ⟵ ⭐ PRODUIT CONSTATÉ : vente créée, status = 'validated'
```

### ⭐ Deux événements distincts, deux moments (correction)

**Le décrément des ingrédients a lieu à `ready`, PAS à `served`.**

Le modèle initial liait les deux dans une seule transaction atomique à `served`. C'était une
**erreur de fond** : un plat marqué `ready` a été **cuit**, donc les ingrédients sont consommés
définitivement. S'il n'est jamais servi (client parti, erreur de commande, plat tombé), le stock
doit **quand même** refléter cette consommation.

Sans cette correction, un plat `ready → cancelled` ne décrémentait rien alors qu'il avait coûté —
et l'écart théorique/réel (§8), métrique centrale du module, se trouvait faussé **dans le mauvais
sens** : il attribuait à du gaspillage invisible une consommation parfaitement connue.

Deux faits de nature différente étaient forcés dans une seule transition :

| Événement | Fait constaté | Moment juste | Nature comptable |
|---|---|---|---|
| **Consommation de matière** | Le plat a été cuisiné | `ready` | Charge engagée |
| **Naissance du produit** | Le plat a été remis au client | `served` | Produit constaté |

La comptabilité les traite d'ailleurs séparément (une charge, un produit). Les lier était une
commodité technique, pas une nécessité.

**Conséquence** : un plat `ready` non servi laisse matière consommée + aucun CA — c'est-à-dire
**une perte correctement enregistrée**, avec coût matière connu, recette identifiée et motif saisi.
Bien plus exploitable que de la noyer dans l'écart d'inventaire, puisqu'on sait *quel* plat a été
perdu et *pourquoi*.

**Le snapshot du coût se fait donc à `ready`**, jamais à `served` : c'est là que la matière sort, donc
là que les **lots consommés** sont connus (§16.13). Avantage du FIFO ici : le coût figé correspond aux
lots **réellement** prélevés, pas à une moyenne au moment du décrément.

Effet secondaire favorable : la règle « `cancel_sale` annule le CA mais pas la consommation »
(§6, conséquences) cesse d'être une exception à traiter — elle découle naturellement du modèle.

Le retrait plutôt que `ready` : un plat prêt mais oublié sur le passe n'est pas servi, et l'écart
`ready → served` mesure la réactivité du service.

### Conséquences de cette correction

**Ce qui disparaît :**
- Le rejet d'un plat déjà consommé dans le flux normal (restait le casse-tête « faut-il
  restaurer les ingrédients ? »). Reste `cancel_sale` par exception, où la règle est : on annule
  le CA, **pas** la consommation de matière (la matière est réellement perdue — elle apparaîtra
  dans l'écart théorique/réel).
- Le décalage temporel dans l'écran de validation (des plats arrivant 20 min après les boissons
  du même ticket).
- L'ambiguïté sur le moment de la consommation : la matière est décrémentée à `ready` (fait
  physique), le CA constaté à `served` (fait commercial) — chaque événement est rattaché au moment
  où il se produit réellement, cf. machine d'état §5.

**Argument décisif :** sur un service de 40 couverts, faire valider chaque plat rendait l'écran
de validation inexploitable — donc « Valider tout » cliqué mécaniquement, ce qui **détruit** la
valeur du contrôle, y compris pour les boissons noyées dans le flot.

### Ce que le gérant garde

Il perd un veto sans objet, rien d'utile :
- **supervision temps réel** avec chrono et relance (§9) ;
- **`cancel_sale`** pour corriger par exception, avec trace d'audit.

Il supervise pendant, il corrige après. Il n'autorise pas.

### Mode simplifié

Un serveur ne peut pas créer de vente
([guard SQL](../../supabase/migrations/20260304000001_add_role_mode_check_to_create_sale.sql)) :
le gérant commande et retire, la vente naît validée par lui. Pas de circuit spécial.

### Écarté volontairement

Un paramètre « exiger la validation des plats » pour promoteur méfiant : sur-ingénierie tant
qu'aucun client ne l'a demandé.

---

## 8. Marge : trois niveaux

| Niveau | Formule | Usage |
|---|---|---|
| **Marge matière brute** | `prix − Σ(qté × coût FIFO du lot consommé)` (§16.13) | Décision de prix, comparaison entre plats |
| **Coût matière réel** | via inventaire physique périodique | Détecte vol, gaspillage, portions trop généreuses |
| **Marge contributive** | marge matière − charges cuisine réparties | Rentabilité réelle du volet resto |

**L'écart entre théorique et réel est la métrique la plus précieuse du module** — standard du
secteur. Dans un bar où la cuisine est une zone de fuite non mesurée, c'est probablement
l'argument de vente le plus fort.

**Conséquence** : l'inventaire physique périodique des ingrédients est **obligatoire**, pas
optionnel. Sans lui le module ne mesure que du théorique, et la « marge précise » promise est
fausse. Mécanisme, rythme, motifs d'ajustement et gel par période : **§16.5**.

### Quatrième métrique : les pertes cuisine mesurées

La dissociation du §6 (matière à `ready`, CA à `served`) fait apparaître une donnée que le modèle
initial perdait : les **plats produits mais non servis**.

| Requête | Signification |
|---|---|
| `consumed_at IS NOT NULL AND sale_id IS NULL` | Plat cuisiné, jamais vendu = **perte identifiée** |

Contrairement à l'écart théorique/réel — qui agrège toutes les causes sans les distinguer — cette
métrique est **attribuable** : on connaît le plat, sa recette, son coût matière, le motif
d'annulation et l'heure. Elle réduit d'autant la part inexpliquée de l'écart d'inventaire.

Pour un promoteur, c'est une information directement actionnable : « 4 poulets braisés perdus cette
semaine, dont 3 le vendredi soir » désigne un problème de rythme de service, pas un vol.

### Cinquième métrique : les pertes par péremption

Rendue possible par le FIFO/FEFO (§16.13) — **impossible en CUMP**, qui fond tous les achats dans une
moyenne sans dates. Chaque `ingredient_lot` portant `expires_at`, un lot non consommé à échéance
devient une perte **valorisée à son coût d'achat réel**.

> « Vous perdez 8 % de vos tomates » → achats surdimensionnés, levier immédiat.

Les trois métriques de perte se complètent sans se recouvrir :

| Métrique | Cause identifiée |
|---|---|
| Écart théorique/réel | toutes causes confondues (vol, portions, gaspillage) |
| Plats produits non servis | rythme de service, annulations |
| **Pertes par péremption** | **surdimensionnement des achats** |

Chaque métrique attribuable réduit d'autant la part inexpliquée de la première.

---

## 9. Interfaces

### Contrainte découverte

La nav mobile est **saturée** : [MobileNavigation.tsx](../../src/components/MobileNavigation.tsx)
fait `slice(0, 5)` et un promoteur a déjà 6 items — **Import/Export est déjà invisible** pour
lui. Ajouter « Cuisine » ferait disparaître un item sans avertissement.

### Deux expériences

| Profil | Ce qu'il voit |
|---|---|
| Promoteur / gérant | Le bar comme aujourd'hui **+** entrée Cuisine + données resto |
| Serveur | **Rien de nouveau dans les menus** — les plats arrivent dans son écran de vente |
| Cuisinier | App quasi mono-écran : sa file de commandes |
| Bar pur (`has_restaurant=false`) | **Zéro différence, pixel pour pixel** |

Le serveur ne gère pas la cuisine, il vend des plats : lui ajouter un menu serait une erreur.

### Menu latéral : une seule entrée

Insertion après *Inventaire* (même registre mental), icône `ChefHat`, filtre combiné
`rôle + currentBar.hasRestaurant`. Une entrée, pas quatre — elle mène à une page à onglets,
comme Inventaire.

> ⭐⭐ **ARBITRAGE DU 03/08/2026 — cette prescription est RÉVISÉE pour la phase 3.**
>
> **Décision : « Cuisine » devient un GROUPE de menu avec sous-entrées, et le découpage est
> la PREMIÈRE tâche de la phase 3 — avant d'écrire l'onglet Service.**
>
> **Ce qui a changé depuis la rédaction de ce §9 :**
>
> | Moment | Onglets de la page | Verdict |
> |---|---|---|
> | Écriture du plan | 0 (page inexistante) | entrée unique évidente |
> | Fin phase 1 | 2 (Stock, Péremption) | entrée unique encore juste |
> | **Fin phase 2** | **3** (Plats, Stock, Péremption) | limite atteinte |
> | Phase 3 prévue | **5** (+ Service, + Appro) | **illisible sur mobile** |
>
> **Trois arguments pour le groupe :**
>
> 1. **Cinq onglets ne tiennent pas sur mobile**, et l'un d'eux (Appro) doit être masqué au
>    cuisinier — un `TabbedPageHeader` à onglets conditionnels par rôle devient vite
>    incompréhensible à maintenir.
> 2. **Les écrans ont des rythmes d'usage opposés** : *Service* est du temps réel pour le
>    cuisinier en plein rush ; *Plats* est de la configuration pour le promoteur. Les mettre
>    au même niveau mélange deux métiers.
> 3. **Le RBAC est plus propre par route** : un onglet masqué reste dans le bundle et dans le
>    DOM ; une route gardée par `ProtectedRoute` ne se charge pas du tout.
>
> ⭐ **Ce §9 le prévoyait déjà à moitié** : il prescrit « 3 items (Commandes / Recettes /
> Ingrédients) » pour le cuisinier en navigation mobile — donc une navigation ÉCLATÉE pour lui,
> et une entrée unique pour le promoteur. Le groupe réconcilie les deux publics.
>
> **⚠️ POURQUOI PAS MAINTENANT (fin phase 2) :** *Service* et *Appro* n'existent pas encore.
> Découper aujourd'hui créerait 4 routes dont 2 mèneraient à des pages vides, à remplir ensuite.
> Découper au début de la phase 3, c'est écrire les nouvelles pages directement au bon endroit —
> même travail, une seule fois. Et on saura alors ce que *Service* contient vraiment.
>
> **⚠️ RISQUE §3 À TRAITER AU DÉCOUPAGE — le point le plus facile à rater :**
> chaque route est un chunk lazy. Aujourd'hui, un bar pur ne télécharge **jamais** le chunk
> cuisine (une seule route à surveiller). Avec 4 routes, ce sont **4 chunks** à tenir hors
> préchargement : 4 occasions d'oublier au lieu d'une. Prévoir un test §3 par route, sur le
> modèle de `dishesInvariance.test.tsx`.
>
> **Structure cible :**
> ```
> Cuisine  (groupe, icône ChefHat)
>   ├─ Service       → cuisinier, gérant, promoteur   (phase 3)
>   ├─ Plats         → gérant, promoteur              (existe : onglet Plats)
>   ├─ Ingrédients   → cuisinier, gérant, promoteur   (existe : onglets Stock + Péremption)
>   └─ Appro         → gérant, promoteur UNIQUEMENT   (§9 : le cuisinier touche à l'argent)
> ```

### Navigation mobile

- **Cuisinier** : 3 items (Commandes / Recettes / Ingrédients) — c'est son outil principal.
- **Autres rôles** : ne rien ajouter, plafond atteint. La Cuisine reste au menu latéral.

Le type `roles` de `NavItem` (`'promoteur' | 'gerant' | 'serveur'`) devra être étendu.

### Page Cuisine — `TabbedPageHeader`

Pattern établi (Inventaire, Comptabilité, Consignations, Dashboard, Promotions).

```
┌─────────────────────────────────────────────────────────┐
│ 🍳  Cuisine                                        [?]  │
│     Plats, recettes et approvisionnement.               │
│  ┌────────┬────────┬─────────────┬──────────┐           │
│  │ Service│ Plats  │ Ingrédients │  Appro   │           │
│  └────────┴────────┴─────────────┴──────────┘           │
└─────────────────────────────────────────────────────────┘
```

Onglet nommé **« Service »** et non « Commandes » — évite l'homonymie avec
« Gestion Commandes » du dashboard. Le cuisinier ne voit jamais l'onglet Appro (il touche à
l'argent). Page de menu → pas de `showBack` explicite (défaut `true`).

**Onglet Service** — 3 colonnes desktop, liste verticale mobile :

```
┌── À FAIRE (3) ──────┐ ┌── EN COURS (2) ─────┐ ┌── PRÊT (1) ──────────┐
│ Table 5   ⏱2min     │ │ Table 2   ⏱11min    │ │ Table 8  ✓ Prêt      │
│ 2× Poulet braisé    │ │ 1× Poisson braisé   │ │ 1× Riz gras          │
│ 1× Riz gras         │ │   sans piment       │ │                      │
│ [ Commencer ]       │ │ [ Plat prêt ]       │ │ En attente retrait   │
└─────────────────────┘ └─────────────────────┘ └──────────────────────┘
```

- **Le chrono monte, il ne descend pas** — un compte à rebours suppose un temps fiable qu'on
  n'aura pas ; un temps écoulé est toujours vrai.
- **Un seul bouton par carte** : l'action suivante, jamais un choix de statut. En cuisine, les
  mains sont occupées.
- **Zones de tap ≥ 44px** : mains humides ou grasses.
- **Modificateurs en évidence** (« sans piment ») : l'information qui coûte le plus cher quand
  elle est manquée.
- ⭐ **Regroupement par table obligatoire** (pas seulement une liste de plats). Le ticket est une
  **addition attachée à une table** : sur un rush à 12 tables, une liste plate devient illisible et
  le cuisinier perd le lien entre les plats d'une même table. Ce n'est **pas** un plan de salle
  graphique (toujours écarté) — juste un regroupement visuel par `table_number`, avec un compteur
  de plats en cours par table.

**Onglet Plats** — la marge est l'élément central de la carte, avec seuil d'alerte :

```
🍗 Poulet braisé                          [●] Dispo
   2 500 F  •  coût 1 450 F  •  marge 42 %
   8 ingrédients                          [Recette ›]

🍚 Riz gras                               [○] Coupé
   1 500 F  •  coût 1 320 F  •  marge 12 % ⚠
```

Toggle Dispo/Coupé **immédiat, sans modale** — geste le plus fréquent du service. Couleurs
limitées à success/danger du `colorSystem` existant.

**Onglet Ingrédients** — deux sections, portant une décision de fond :

```
INGRÉDIENTS DE RECETTE
🍗 Poulet     12,5 kg      1 200 F/kg
🐟 Poisson     3,0 kg  ⚠   1 800 F/kg

CONSOMMABLES  (non décomptés par plat)
🧂 Sel          2 paquets
🫗 Huile        1 bidon   ⚠
🔥 Gaz          1 bouteille
```

La mention « non décomptés par plat » évite de laisser croire à un suivi au gramme. Stock affiché
en **unité d'achat** — personne ne pense « 12 500 g de poulet ».

**Onglet Appro** — réutilise strictement le pattern boissons existant (`SupplyModal`). Aucune
raison d'inventer une seconde ergonomie.

### Écran de vente serveur — intervention minimale et additive

```
┌──────────┬──────────┐
│ Boissons │ Plats 🍳 │
└──────────┴──────────┘
   [grille]
─────────────────────────
PANIER — Table 5
2× Beaulieu         1 000 F
1× Poulet braisé 🍳 2 500 F
Total               3 500 F
dont en cuisine     2 500 F
              [ Valider ]
```

- **Un seul panier, une seule addition.**
- La ligne « dont en cuisine » rend lisible la règle « le plat n'est vendu qu'au retrait ».
- L'onglet Plats n'apparaît que si `has_restaurant` — sur un bar pur, écran identique à
  aujourd'hui.
- Sur `BonStrip`, un badge 🍳 signale un plat en cours ; paiement désactivé tant qu'il reste des
  plats non servis.

### Sélecteur de portée (Dashboard)

Un composant **`ScopeSwitcher`** placé après le `PageHeader`, avant les cartes, dans le `<main>` :

```
[ Tout ]  [ 🍺 Bar ]  [ 🍳 Cuisine ]
```

**Trois positions, « Tout » par défaut.** Un basculeur binaire obligerait le promoteur à faire
l'addition mentalement — régression par rapport à aujourd'hui.

Le sélecteur **rend possible** l'ajout de métriques resto sans allonger le dashboard des bars
purs. Certaines cartes n'ont aucun équivalent bar :

| Portée | Cartes |
|---|---|
| Tout | CA total, marge globale, articles vendus, ventes en attente, retours, stock bas |
| Bar | Les cartes actuelles, à l'identique |
| Cuisine | CA resto, marge matière, plats vendus, plat le plus rentable, **écart théorique/réel**, ingrédients en alerte, temps moyen de préparation |

**Point d'injection unique** : les 3 vues de
[DailyDashboard](../../src/components/DailyDashboard.tsx) reçoivent toutes leurs données d'un
seul objet `analytics`. Filtrer `analytics` suffit — `DashboardSummary`, `DashboardOrders` et
`DashboardPerformance` restent inchangés.

**Règle : zéro refetch au changement de portée.**

Formulation corrigée — « filtrage côté client obligatoire » était trop rigide et devient faux si
les métriques cuisine proviennent de vues agrégées distinctes (l'écart théorique/réel ou le temps
moyen de préparation ne se dérivent pas des ventes de boissons).

La règle robuste :
- **une** query initiale agrégée supplémentaire est autorisée quand `has_restaurant = true` ;
- **changer de portée ne déclenche aucune requête** — les trois portées se servent des données déjà
  en cache.

L'egress a fait l'objet de 3 vagues d'optimisation pour descendre à ~200 MB/j : ce qui compte est
qu'un bar pur ne paie rien (§3) et qu'un bar-resto ne paie qu'une fois, pas à chaque clic.

Sur mobile, sélecteur compact (emojis seuls) : avec header + onglets + `BonStrip`, le premier
chiffre descend bas.

### Onglet « Gestion Commandes » : supervision + validations

En portée Cuisine, l'onglet affiche **tout le cycle** :

```
┌─ EN CUISINE (3) ─────────────────────────────────────┐
│ 🍳 Table 5 · 1× Poulet braisé  ⏱ 4 min   À faire     │
│    Kofi                                  [Relancer]   │
│ 🍳 Table 2 · 1× Poisson        ⏱ 22 min  En cours ⚠  │
│ 🍳 Table 8 · 2× Riz gras       ⏱ 31 min  En cours 🔴 │
└───────────────────────────────────────────────────────┘

┌─ À VALIDER (2) ──────────────  [ Valider tout ] ─────┐
│ 🍺 Table 3 · 2× Beaulieu       1 000 F   [✓] [✗]     │
└───────────────────────────────────────────────────────┘
```

**Voir n'est pas valider** : un plat en préparation n'a aucune existence comptable, donc la
section « En cuisine » n'a aucun bouton de validation. C'est une vue de supervision.

**Bouton Relancer** : notifie le cuisinier (`NotificationsProvider` existe), marque la ligne
comme relancée, **ne change pas le statut**. Garde-fous : anti-spam (1 relance / 2 min max, sinon
15 notifications ignorées) et compteur de relances — objective un problème récurrent plutôt que
de se fier aux impressions.

**Seuils de retard** : gris / ⚠ orange / 🔴 rouge, calibrés par `preparation_time_min` du plat
(le champ trouve ici sa fonction). Défaut unique 15/25 min si non renseigné.

**Badge sur l'onglet** (`Commandes ③`) incluant les plats en retard — le gérant sait qu'il doit
regarder sans y être en permanence.

**Une seule interface de validation** :
[DashboardOrders](../../src/components/dashboard/tabs/DashboardOrders.tsx) groupe par **serveur**
(`sale.soldBy`), pas par type de produit — la logique est déjà indifférente à la nature du
produit. Ajout suggéré : afficher le numéro de table sur chaque ligne pour reconstituer
visuellement le ticket, sans regrouper par ticket (refonte pour bénéfice marginal).

### Historique

**Pas de basculeur mais un filtre.** Une vente resto et une vente bar peuvent appartenir au
**même ticket** : un basculeur cachant la moitié d'un ticket serait déroutant (on cherche « la
table 5 d'hier soir », pas « la partie bar de la table 5 »). Ventes unifiées avec badge 🍺/🍳,
filtre ajouté au groupe de filtres existant. Sur l'onglet *analytics* en revanche, le
`ScopeSwitcher` reprend tout son sens (comparer bar vs cuisine).

### Note design system

[`ViewSwitcherPageHeader`](../../src/components/common/PageHeader/patterns/ViewSwitcherPageHeader.tsx)
existe mais n'est utilisé par **aucune page**, avec des commentaires de délibération non nettoyés
(l.67-72) suggérant qu'il n'a jamais été finalisé. Il est figé à `'list' | 'analytics'` et c'est
un *header*, alors que le besoin est un contrôle **dans le contenu**. → créer un `ScopeSwitcher`
autonome (CVA + `cn()` + story Storybook, comme l'exige la convention).

### À ne pas faire

- Pas d'onglet « Recettes » séparé — elle s'ouvre depuis la carte du plat.
- Pas de plan de salle graphique — `table_number` suffit.
- Pas de thème visuel « cuisine » — casserait le theming par-bar et la règle des 3 couleurs.
- Pas d'impression de bons cuisine — un écran suffit et coûte moins cher au client.

---

## 10. Comptabilité

### ⛔ Correction : `7021` est un code détourné — et `7011` l'est déjà

**Vérification effectuée le 31/07/2026** contre le
[référentiel OHADA](https://plan-comptable-ohada.com/nouvelle-norme-2016/compte/70.html)
(AUDCIF 2017, SYSCOHADA révisé applicable depuis le 01/01/2018).

Le compte `70` se subdivise en 7 catégories, et **chaque sous-compte à 4 chiffres est réservé à une
ventilation géographique**, pas à une nature de produit :

| Code | Signification **officielle** |
|---|---|
| `701` | Ventes de marchandises |
| `702` | Ventes de produits finis |
| **`7021`** | **« dans la Région »** (produits finis vendus en zone OHADA) |
| `7022` | hors Région |
| `7023` / `7024` | aux entités du groupe (dans / hors Région) |
| `7025` | sur internet |

→ Employer `7021` pour « Ventes de repas » **détourne un code normalisé de son sens**.

⛔ **Conséquence sur le code en production** : [syscohada.types.ts](../../src/services/accounting/syscohada.types.ts)
déclare `'7011': 'Ventes de Boissons'` et `'6011': 'Achats de Boissons'`. Or `7011` signifie
officiellement « ventes de marchandises **dans la Région** » et `6011` « achats de marchandises
**dans la Région** ». **La même confusion existe déjà, indépendamment du module restauration.**

> **Correction d'appréciation** : le §1 qualifiait cette granularité d'« investissement minime, bien
> choisi ». **C'est faux** — c'était une **erreur de nomenclature**, pas une préparation
> intelligente. Un plan qui se félicite d'une erreur est pire qu'un plan qui l'ignore.

### Ce qui reste juste

**La logique de séparation** est exactement celle que SYSCOHADA prescrit : les boissons sont des
**marchandises** revendues en l'état (`601`/`701`), les repas des **produits finis** issus d'une
transformation (`602`/`702`). Seule la numérotation à 4 chiffres était détournée.

### Nomenclature retenue — comptes à 3 chiffres

| Usage | Compte | Libellé officiel |
|---|---|---|
| Achats boissons | `601` | Achats de marchandises |
| Ventes boissons | `701` | Ventes de marchandises |
| Achats ingrédients | `602` | Achats de matières premières et fournitures liées |
| Ventes repas | `702` | Ventes de produits finis |
| Variation des stocks | `603` | Variations des stocks |
| Gaz | `6052` | Autres achats — combustibles |

Le `603` reste la vraie nouveauté : une activité de **transformation** doit constater la variation de
stock de matières premières en fin de période, ce qu'une pure revente peut esquiver.

**Le détail « Boissons » / « Repas » reste un libellé applicatif**, affiché dans les écrans — jamais
un code comptable. L'export SYSCOHADA sort `701` et `702`.

### ⚠ À valider par un comptable OHADA — trois questions

Ma source est un référentiel **en ligne**, pas un avis professionnel. Sur un sujet où une erreur se
voit devant l'administration fiscale, cela ne suffit pas pour modifier du code comptable en
production.

1. `701` / `702` sont-ils les bons comptes pour distinguer ventes de boissons et ventes de repas ?
2. Les sous-comptes à 4 chiffres sont-ils **réservés** à la ventilation géographique, ou peut-on les
   personnaliser ?
3. ⭐ **Deux méthodes de valorisation dans le même bilan** — CUMP pour les marchandises, FIFO pour les
   matières premières (§16.13) — est-ce acceptable, et **comment le déclarer en annexe** ?

### Correctif attendu sur le code en production — NON appliqué

Décision : **ne pas corriger `7011`/`6011` maintenant.**

| Raison | Détail |
|---|---|
| Source non normative | Recherche en ligne, pas avis professionnel |
| Pas urgent | L'erreur existe depuis l'origine sans conséquence connue. Un compte détourné produit un export **inhabituel**, pas un calcul faux — les montants sont justes, l'étiquette est mauvaise |
| Vérification > correction | Changer le code prend 5 min ; s'assurer qu'aucun export déjà remis à un comptable ne devient incohérent est un autre travail |

Correctif à appliquer **après** validation comptable :
- `syscohada.types.ts` : `7011` → `701`, `6011` → `601` ;
- `syscohada.service.ts` : 3 occurrences de `'7011'` + le mapping `case 'supply'` ;
- `syscohada.service.test.ts` : les assertions attendent `7011`.

> Si un comptable OHADA n'est **pas** accessible à court terme, la correction `701`/`702` devient
> préférable au statu quo : mieux vaut un compte normalisé sur la base d'une recherche sérieuse qu'un
> compte qu'on **sait** détourné.

---

## 11. Offline

> ⚠ **Règles fermes en §13.5.** Ce qui suit détaille le raisonnement ; **la table du §13.5 fait foi.**

**Position V1 — plus restrictive que la doctrine bar habituelle :**

| Opération | Offline |
|---|---|
| Prise de commande, `accept`, `start` | ✅ Oui — file + IDs pré-générés |
| **`mark_ready`**, **`serve`**, `produce` (lot) | ⛔ **NON — réseau obligatoire** |

**Raison** : `mark_ready` décrémente en **FEFO** (donc dépend de l'état réel des lots) et `serve` crée
du **CA**. Hors ligne sur plusieurs appareils, ils produiraient **deux réalités de stock**
irréconciliables.

**Pas d'exception paramétrable** (ni « poste cuisinier unique ») : une règle simple et explicable vaut
mieux qu'une exception que personne ne comprend. Perte fonctionnelle quasi nulle — un cuisinier
travaille sur un poste fixe.

- **Jamais bloquant** sur le stock d'ingrédients (§4.4) — un stock insuffisant crée une **dette**
  (§13.2), il n'empêche pas de servir.

### Chaque transition de ligne doit être idempotente

Il ne suffit **pas** de « mettre les `kitchen_order_items` dans la file ». Chaque transition
(`accept`, `start`, `ready`, `serve`, `cancel`) est une opération distincte, rejouable après une
coupure, et doit donc porter sa **propre clé stable** — sinon un rejeu produit une double
transition (ou un double décrément).

| Transition | Effet | Criticité |
|---|---|---|
| `accept`, `start` | Changement de statut seul | Faible — rejeu inoffensif si idempotent |
| `cancel` (avant `ready`) | Statut + motif, aucun effet matière ni CA | Faible |
| **`ready`** | **Décrémente N ingrédients + fige le coût** | ⭐ **Maximale** |
| **`serve`** | **Crée la vente (CA)** | ⭐ Élevée |

**Deux RPC distincts, chacun idempotent** (conséquence de la dissociation du §6) :

| RPC | Responsabilité | Clé d'idempotence |
|---|---|---|
| `mark_kitchen_item_ready` | Statut → `ready`, décrément des ingrédients, snapshot `computed_cost`, `consumed_at` | `kitchen_order_item_id` |
| `serve_kitchen_item` | Statut → `served`, création de la vente `validated`, liaison `sale_id` | `kitchen_order_item_id` |

`mark_kitchen_item_ready` devient **le RPC le plus dangereux du module** : c'est lui qui touche au
stock. Exigences : atomique, `SECURITY DEFINER`, `FOR UPDATE` sur les lignes d'ingrédients (races
entre appareils), rejeu retournant l'état déjà consommé **sans double décrément**.

`serve_kitchen_item` reste sensible (il crée du CA) mais ne touche plus au stock — un rejeu doit
retourner la vente déjà créée, jamais en créer une seconde (même contrat que
`create_sale_idempotent`).

> **Note** : la revue externe recommandait de faire de `serve` le RPC le plus durci, au motif qu'il
> créait du CA **et** décrémentait du stock. La dissociation du §6 déplace cette cible vers
> `mark_ready`. La recommandation reste valable, elle change d'objet — et le résultat est meilleur :
> **aucun RPC ne fait plus les deux à la fois.**

Le stock négatif est possible (« jamais bloquant », §4.4). En FIFO il n'a **aucune définition
naturelle** — consommer un lot inexistant, à quel prix ? D'où le **lot de régularisation** au dernier
prix connu, marqué comme anomalie (§16.13). Un stock chroniquement négatif produirait un coût matière
faux, donc une marge fausse — d'où l'inventaire physique obligatoire (§8).

---

## 12. Blocages

### 12.1 Plafond de membres — ✅ LEVÉ (non-blocage)

[src/config/plans.ts](../../src/config/plans.ts) :

| Plan | maxMembers | Prix |
|---|---|---|
| Starter | **4** | 9 000 XOF |
| Pro | 8 | 15 000 XOF |
| Max | 20 | 30 000 XOF |

**Analysé à tort comme un blocage.** L'erreur : avoir pris pour référence un bar-resto avec 2-3
serveurs **et** 2 cuisiniers, puis généralisé depuis le cas le plus gros au lieu du plus fréquent.

Le cas réellement fréquent — un petit resto — tient dans Starter :

| Composition | Total |
|---|---|
| Promoteur + cuisinier + serveur | **3** (une place libre) |
| Promoteur + gérant + cuisinier + serveur | **4** (exactement le plafond) |

Le libellé du plan le confirme : *« Bar qui démarre — équipe jusqu'à 4 personnes (promoteur
inclus) »*. Un petit resto **est** un établissement qui démarre.

**Conclusion** : le plafond fait son travail — il n'interdit pas l'entrée, il accompagne la
croissance. Un resto qui embauche un 2ᵉ cuisinier et un 3ᵉ serveur a aussi le chiffre d'affaires
pour payer Pro. Réserver le module à Pro/Max aurait **fermé la porte à un segment entier** (les
petits restos, plus nombreux que les gros bars-restos, et qui ont autant besoin de connaître la
rentabilité de leurs plats).

**Point d'UX à traiter (pas de pricing)** : vérifier la qualité du message quand la limite est
atteinte. `check_plan_member_limit` doit produire un message actionnable (« votre plan Starter
permet 4 personnes, passez à Pro pour en ajouter ») et non une erreur technique sèche.

### 12.2 Modèle du plat — ✅ TRANCHÉ

`dishes` autonome. Analyse complète et coûts acceptés en **§4.5**.

### 12.3 ✅ Retour de plat et périmètre des promotions — TRANCHÉS

Deux blocages découverts lors de l'audit du 30/07 (§15.1 et §15.2), **tous deux résolus le
31/07/2026** :

- **Retour de plat** (`returns.product_id` FK `NOT NULL` vers `bar_products`) → **le blocage tombe en
  V1** : son seul cas légitime était `precooked`, qui est un `bar_product` et non un plat (§12.4.c).
  Les plats cuisinés se traitent par annulation de ligne (avant `served`) ou `cancel_sale` (après).
- **Périmètre des promotions** → **`'all'` = boissons uniquement**, les plats exigent un ciblage
  explicite, catégories non mixtes, **alerte de marge minimum** sur les plats (§15.2). Rétrocompatible
  à 100 % : aucun changement de comportement en production.

### 12.4 ✅ Six décisions révélées par la 3ᵉ revue — TRANCHÉES (31/07/2026)

Toutes issues des **corrections récentes** : le modèle était devenu plus juste métier sans être
stabilisé techniquement. **Les six sont désormais tranchées** — plus aucun blocage avant la
phase 3A.

#### 12.4.a ✅ `paid` ne signifie plus « terminé » → `fulfillment_status` nullable

Le paiement anticipé (§16.2) autorise un ticket payé avec des plats en cuisine. Or
`tickets.status CHECK (status IN ('open','paid'))` n'a **qu'un axe** → un tel ticket
**disparaîtrait des bons ouverts** alors qu'il reste du travail.

**Décision : ne PAS toucher à `tickets.status`.** Il est utilisé en production (index,
[`BonStrip`](../../src/components/dashboard/BonStrip.tsx), `pay_ticket`, RLS) et sa sémantique reste
correcte pour un bar pur. Ajouter une **colonne nullable** :

```
status              -- inchangé : open | paid              (l'argent)
fulfillment_status  -- NULL | pending | fulfilled          (la cuisine)
```

`NULL` = « aucune ligne cuisine sur ce ticket » → **un bar pur ne voit aucune différence** (§3).
Ticket clos ⟺ `paid` **ET** (`fulfillment_status IS NULL OR = 'fulfilled'`).

Additif, rétrocompatible, et **aucune migration d'un `CHECK` en production**.

#### 12.4.b ✅ Trou financier du prépaiement → remboursement espèces **ou** substitution

**Manque non vu lors de l'assouplissement de §16.2.** Si un plat prépayé est annulé avant `ready`
(rupture) : **aucune vente à annuler** (elle naît à `served`), **aucun retour possible** (§15.1),
**aucun remboursement modélisé** → argent encaissé **sans contrepartie ni mécanisme de restitution**.

**Décision (fondateur)** : les **deux** résolutions sont offertes — **le choix appartient au client**,
pas au système :

| Résolution | Effet |
|---|---|
| `cash_refund` | ⭐ **Sortie de caisse** tracée, imputée au ticket prépayé |
| `substitution` | Nouvelle ligne cuisine sur le **même** ticket, prépaiement reporté dessus |

Modèle minimal :

```
tickets.prepaid_amount            -- montant encaissé avant service

prepaid_resolutions               -- une par ligne annulée après prépaiement
  id, bar_id, ticket_id, kitchen_order_item_id
  amount
  resolution        -- 'cash_refund' | 'substitution'
  substituted_item_id  -- si substitution
  resolved_by, resolved_at, notes
```

⚠ **`cash_refund` est une sortie de caisse** : elle doit apparaître en comptabilité (contrepartie de
la classe 5) et être **soumise aux mêmes contrôles qu'une annulation de vente** — traçabilité de
l'auteur, motif, et visibilité dans le Z de caisse. Ne pas la traiter comme un simple ajustement.

Le serveur propose, le client choisit, le système enregistre les deux cas sans en privilégier un.

#### 12.4.c ⚠️ `precooked` → reporté Post-V1 — **CORRIGÉ le 08/08/2026, cf. §19.2**

> ⛔ **La conclusion ci-dessous est FAUSSE pour un article SERVI EN SALLE.** Le critère n'est pas
> « acheté ou produit » mais « servi en salle ou vendu au comptoir » : un `bar_product` compte en
> portée **Bar**, donc un akassa acheté et servi à table sous-évaluerait le CA restauration.
> La bonne réponse est un **plat dont la recette compte une seule ligne** (§19.2).

§16.8 disait qu'un plat `precooked` « se vend comme une boisson, retour possible ». Mais `dishes`
**n'a pas de stock** (§4.1) et `returns.product_id` pointe **obligatoirement** vers `bar_products`
(§15.1) → **ni stock ni retour** : catégorie déclarée, non implémentable.

**Décision : report Post-V1**, pour une raison de fond — **`precooked` n'est pas un plat.** C'est un
**produit fini revendu en l'état** : stock dénombrable, retour possible, aucune production à la
commande. C'est exactement la définition d'un `bar_product`.

> **Le classer comme plat était une erreur de catégorisation.** Un maquis qui vend des beignets peut
> les saisir comme **produits** dès aujourd'hui, sans le module cuisine. Ce qui manque (recette d'un
> précuisiné, coût de production) est un **raffinement**, pas un bloquant — le report ne prive
> personne de rien.

→ `production_mode` n'a donc que **3 valeurs en V1** : `on_order`, `batch`, `batch_finish`.

#### 12.4.d ✅ Séparer recette (modèle) et lots (instances)

Le plan faisait porter à `recipe_components` **les sous-recettes** (§16.12) **et** le prélèvement de
lots (§16.8). Erreur structurelle : une recette est un **modèle**, un `production_batch` une
**instance datée** avec coût et reliquat.

```
dish_recipe_components          -- le MODÈLE : « ce plat contient 1 portion de sauce »
  dish_id, base_dish_id, quantity

kitchen_item_batch_consumptions -- l'INSTANCE : « cette ligne a prélevé 1 portion du lot #47 »
  kitchen_order_item_id, production_batch_id, quantity, unit_cost
```

**Ce qui tranche** : `unit_cost` n'a de sens que sur l'**instance**. Une recette porte une quantité,
pas un coût. Les mélanger imposerait un coût *nullable* dans une table de modèle — signe qu'on
confond deux choses.

Bénéfice gratuit : la traçabilité exigée par l'écran de détail du coût (§16.13) — on sait **de quel
lot** venait chaque portion.

#### 12.4.e ✅ Résorption du lot de régularisation : compensation à l'appro

§16.13 crée un lot fictif au dernier prix connu sur stock négatif — bonne rustine, mais **le plan ne
disait pas comment il disparaît**.

**Règle, à l'arrivée d'un approvisionnement réel** :

1. chercher les régularisations ouvertes de cet ingrédient (`is_regularization = true`,
   `remaining_qty < 0`) ;
2. **les solder d'abord** avec la quantité entrante, **avant** de créer le lot réel ;
3. **tracer l'écart de prix** — prix estimé de la régularisation vs prix réellement payé.

⚠ **Clôturer, ne pas supprimer** le lot de régularisation : sinon on perd la trace de l'anomalie, qui
est précisément le signal qu'on voulait rendre visible.

L'écart de prix est la donnée intéressante : s'il est systématiquement négatif, le « dernier prix
connu » **sous-estime** les achats.

#### 12.4.f ✅ `current_stock` = colonne cache écrite par les RPC

§4.1 écrivait `current_stock -- dérivé de Σ(lots.remaining_qty)` — **ambigu**.

| Option | Verdict |
|---|---|
| Vue calculée (`SUM`) | Juste, mais recalcule à chaque lecture — coûteux sur l'écran Service rafraîchi en continu |
| Vue matérialisée | Latence de rafraîchissement **inacceptable** pour un stock |
| ✅ **Colonne cache** | Écrite **uniquement** par les RPC qui touchent aux lots |

**Ce qui tranche** : c'est le pattern **déjà validé** par le projet sur le CUMP. La
[vague 4c](../../supabase/migrations/20260703040000_vague4c_cump_single_source_of_truth.sql) a établi
que `current_average_cost` est écrit par les RPC incrémentales et **jamais par un trigger** —
précisément parce que **deux écrivains créent des divergences**.

Donc : `ingredients.current_stock` est un **cache d'affichage**, la source de vérité est
`SUM(ingredient_lots.remaining_qty)`, avec un **test de cohérence** périodique. Statut à documenter
dans un `COMMENT ON COLUMN`, comme fait pour `last_unit_cost`.

### 12.5 Rôle `cuisinier` — point dur technique

Mesures réelles :

| Point d'impact | Volume |
|---|---|
| Fichiers TS/TSX avec `UserRole` / `ROLE_PERMISSIONS` | 15 |
| Fichiers TS/TSX avec `'serveur'` en littéral | **56** |
| Migrations avec `CHECK (role IN (...))` | **17** |
| Permissions booléennes dans `RolePermissions` | **30** |

`role` est une contrainte `CHECK` en base
([001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)) répliquée dans 17
migrations, avec des RLS et guards métier testant le rôle en dur — ex.
[create_sale](../../supabase/migrations/20260304000001_add_role_mode_check_to_create_sale.sql)
teste `v_caller_role = 'serveur'`, et
[harden_bar_members_role_update_rls](../../supabase/migrations/20260218000000_harden_bar_members_role_update_rls.sql)
restreint le gérant à poser `role='serveur'`.

Questions à répondre : un gérant peut-il créer un cuisinier ? Que fait le guard `create_sale`
pour un cuisinier ? Les 30 permissions doivent-elles toutes être définies ? Et surtout : **tout
`role !== 'serveur'` existant devient potentiellement faux** pour un cuisinier.

Un cuisinier n'est **pas** un 5e niveau hiérarchique : il est transversal, au même niveau que
`serveur` (4), avec des permissions disjointes (`canViewKitchenOrders`,
`canUpdateKitchenOrderStatus`, `canManageRecipes`, `canManageIngredientStock`) et **sans**
`canSell`. À éviter : un flag `is_kitchen_staff` sur un serveur — mélange deux métiers.

#### Protéger par permission, jamais par rôle brut

La route et les écrans cuisine doivent être gardés par **permission**
(`<ProtectedRoute permission="canViewKitchenOrders" />`), pas par un test `role === 'cuisinier'`.
Le projet a déjà ce mécanisme, et c'est ce qui permet à un gérant ou un promoteur d'accéder à la
cuisine sans dupliquer la liste des rôles autorisés à chaque point de contrôle.

#### Livrables obligatoires de la phase 0

1. **Audit exhaustif** de tous les `role !== 'serveur'` et `role === 'serveur'` — chacun doit être
   requalifié explicitement (le cuisinier est-il concerné ?).
2. **Migrations de contraintes** : ajouter `'cuisinier'` aux 17 `CHECK (role IN ...)`. Rétrocompatible
   (aucune donnée existante n'utilise cette valeur), mais attention au piège connu du
   `CREATE OR REPLACE` qui perd les grants — re-`REVOKE`/`GRANT` systématique + post-vol
   `has_function_privilege('anon', ...)`.
3. **Tests RBAC** couvrant les 30 permissions pour le nouveau rôle, et vérifiant qu'un cuisinier
   **ne peut pas** vendre, valider une vente, ni lire la comptabilité.
4. **Décisions explicites** : un gérant peut-il créer un cuisinier (probablement oui → adapter la
   RLS qui le restreint à `role='serveur'`) ? Que fait le guard `create_sale` en mode simplifié
   pour un cuisinier (il ne doit pas vendre du tout) ?

---

## 13. ⭐⭐ PRÉREQUIS AVANT MIGRATION — règles à implémenter

> **Section prescriptive.** Ce ne sont pas des options : ce sont les règles à appliquer. Toute
> implémentation qui s'en écarte est un défaut, pas une variante.

### 13.1 `ticket_payment_events` — ledger, pas montant scalaire

**Le solde prépayé est calculé, jamais stocké.** Un `prepaid_amount` scalaire divergerait au premier
remboursement partiel ou substitution.

```
ticket_payment_events
  id, bar_id, ticket_id
  event_type       -- 'payment' | 'refund' | 'transfer_to_substitution'
  amount           -- toujours positif ; le type porte le sens
  payment_method   -- pour 'payment' et 'refund'
  kitchen_order_item_id  -- pour 'refund' / 'transfer_to_substitution'
  created_by, created_at, business_date, notes
```

- **Solde prépayé** = `Σ(payment) − Σ(refund) − Σ(transfer_to_substitution)`.
- `tickets.prepaid_amount` **est supprimé du modèle** (§4.1) : remplacé par ce ledger.
- Même raisonnement que `production_batches` vs stock scalaire : un journal auditable plutôt qu'une
  valeur à maintenir.

**Permission dédiée** : `canRefundPrepaidKitchenItem` — **gérant / promoteur seulement en V1**. Un
serveur ne rembourse pas.

⚠ **Tout `refund` est une sortie de caisse** : obligatoire dans le **Z de caisse** et dans
l'**audit log** (`auditLogger`), avec auteur et motif. Jamais un simple ajustement.

### 13.2 `ingredient_stock_debts` — remplace les « lots négatifs »

**Décision** : un lot FEFO avec `remaining_qty < 0` est un objet qui n'a pas de sens (un lot est un
stock *disponible*, pas un découvert). Le « lot de régularisation » du §16.13 est **remplacé** par une
table dédiée.

```
ingredient_stock_debts
  id, bar_id, ingredient_id
  qty_owed              -- quantité consommée sans stock disponible (positive)
  estimated_unit_cost   -- dernier prix connu au moment de la dette
  incurred_at, business_date
  settled_qty, settled_at
  price_variance        -- écart entre coût estimé et coût réel à l'appro
  status                -- 'open' | 'settled'
```

**Règle de solde, à l'arrivée d'un approvisionnement** :
1. solder les dettes ouvertes de cet ingrédient (FIFO sur `incurred_at`) **avant** de créer le lot
   disponible ;
2. calculer et **tracer `price_variance`** (estimé vs réel) ;
3. passer la dette à `settled` — **jamais la supprimer** : la trace de l'anomalie est le signal.

`ingredients.current_stock` = `Σ(lots.remaining_qty) − Σ(debts.qty_owed WHERE status='open')`.

### 13.3 `production_batches` — statut métier explicite

`remaining_qty` est un **chiffre**, l'état métier a son **champ** :

```
status  -- 'active' | 'depleted' | 'expired' | 'discarded' | 'closed'
```

Sans ce champ, `remaining_qty = 0` ne distingue pas « épuisé par les ventes » de « jeté » ni de
« périmé » — trois situations aux conséquences comptables différentes (§8).

### 13.4 Restauration ⟹ mode complet obligatoire

**Décision ferme** (§15.7 signalait l'incohérence sans trancher) : un bar en **mode simplifié** ne peut
pas activer la restauration.

**Raison** : un cuisinier a besoin d'un **compte** pour faire avancer les statuts de production. Le
mode simplifié signifie « le gérant fait tout, personne d'autre n'a de compte » — les deux sont
contradictoires.

**UX à l'activation** : proposer explicitement le passage en mode complet, avec l'explication
(« la cuisine nécessite un compte pour le cuisinier »). Ne **jamais** basculer le mode silencieusement.

**État d'implémentation (02/08/2026)** : appliqué dans `BarContext.hasRestaurant`, qui exige
`settings.hasRestaurant === true` **ET** `operatingMode === 'full'`. Un bar dont le drapeau serait
`true` en base alors qu'il est repassé en simplifié n'expose donc pas la cuisine — l'incohérence est
rendue inoffensive au lieu d'être subie. Couvert par `BarContext.test.ts`.

#### ⏸ Question rouverte : une « cuisine simplifiée » est-elle possible ? — POST-V1

> Soulevée par le fondateur le 02/08/2026 : *« ne peut-on pas permettre au gérant d'enregistrer les
> opérations cuisine en mode simplifié, en les simplifiant comme pour les ventes de boissons ? »*
>
> La question est **fondée** et le §13.4 ci-dessus tranchait plus fermement que le §15.7, qui
> qualifiait le point de « non bloquant, à trancher ». Cette sous-section lève la tension.

**Le parallèle avec les ventes est réel.** En mode simplifié, le gérant enregistre une vente et
**attribue** un serveur par son nom : le serveur n'a pas de compte, c'est une chaîne
(`serversList`, `server_name_mappings`). Le principe est *un seul opérateur authentifié, plusieurs
acteurs nommés*.

**Pourquoi il ne se transpose pas directement.** La différence n'est pas le nombre de comptes, c'est
la **nature de l'objet enregistré** :

| | Vente de boisson | Production d'un plat |
|---|---|---|
| Forme | événement **instantané** | **séquence** dans le temps (§6.1) |
| Enregistrement | un seul, a posteriori | 3 à 5 transitions horodatées |
| Effet de `mark_ready` | — | ⭐ **décrément FEFO + coût matière figé** |

Un gérant qui saisirait les transitions a posteriori les **inventerait** : « le plat était prêt à
19h42 » suppose que quelqu'un l'a constaté à 19h42. Or `mark_ready` n'est pas un horodatage
décoratif — il déclenche la consommation de matière et fige `computed_cost`, donc toute la chaîne de
marge (§8).

**Le cas qui resterait légitime** : un bar-resto où le gérant fait **réellement** tout — il prend la
commande, il cuisine, il sert. Les transitions ne sont alors pas fictives, elles sont simplement
toutes faites par la même personne. Une « cuisine simplifiée » y aurait du sens : pas d'écran
cuisinier, pas de file d'attente, le gérant enregistre un plat vendu et le stock se décrémente.

**Décision : POST-V1.** Trois raisons, par ordre de poids :

1. Cela **double les chemins à tester** dans la machine d'état — le cœur du module, et l'endroit où
   une erreur coûte le plus cher ;
2. Les métriques qui font la valeur du module (écart théorique/réel, temps de préparation, pertes
   §8) supposent des transitions **constatées**, pas déclarées. Un mode dégradé produirait des
   chiffres d'apparence identique mais de fiabilité moindre — sans que rien ne le signale ;
3. Mode minoritaire : la V1 doit prouver sa valeur sur le cas nominal avant de se ramifier.

⚠ **Signal terrain à surveiller** : si une part significative des bars-restos s'avère être en mode
simplifié, cet arbitrage remonte en priorité. Ce n'est pas un refus de principe mais un
séquencement — le besoin est réel, la V1 n'est pas le bon moment.

### 13.5 Offline cuisine — règles strictes

| Opération | Offline |
|---|---|
| Prise de commande (création de lignes) | ✅ **Oui** — file + IDs pré-générés |
| `accept` / `start` | ✅ Oui — changement de statut sans effet stock/CA |
| **`mark_ready`** | ⛔ **NON — réseau obligatoire** |
| **`serve`** | ⛔ **NON — réseau obligatoire** |
| Déclaration de lot (`produce`) | ⛔ **NON — réseau obligatoire** |

**Raison** : `mark_ready` décrémente le stock (FEFO, donc dépendant de l'état réel des lots) et
`serve` crée du CA. Hors ligne sur plusieurs appareils, ils produiraient **deux réalités de stock**
irréconciliables.

**Pas d'exception** — ni « poste cuisinier unique », ni configuration. Une règle simple et
explicable vaut mieux qu'une exception paramétrable que personne ne comprend. Message clair à
l'utilisateur : « connexion requise pour valider un plat prêt ».

Perte fonctionnelle acceptée : quasi nulle — un cuisinier travaille sur un poste fixe, pas en
mobilité.

### 13.6 `isTicketClosed` — helper unique, usage direct interdit

```typescript
// L'UNIQUE façon de savoir si un ticket est terminé
export const isTicketClosed = (t: Ticket) =>
  t.status === 'paid' && (t.fulfillment_status == null || t.fulfillment_status === 'fulfilled');
```

⛔ **Interdit ailleurs** : `status === 'paid'` pour signifier « terminé ».

**Point vérifié** : [tickets.service.ts](../../src/services/supabase/tickets.service.ts) filtre les
bons ouverts par `.eq('status', 'open')` → un ticket **prépayé avec des plats en cuisine
disparaîtrait de la liste**. Cette requête doit devenir
`status = 'open' OR fulfillment_status = 'pending'`.

Point rassurant : `status === 'paid'` n'apparaît **qu'une fois** en écriture dans `src/` — la
discipline est facile à instaurer **maintenant**, avant que les usages ne se multiplient.

### 13.7 `fulfillment_status` — piloté par RPC uniquement

- **Aucune écriture client.** Recalculé par les **RPC cuisine**, dans **la même transaction** que la
  transition de ligne qui le provoque (création, `serve`, `cancel`).
- Dérivé des lignes, exactement comme `kitchen_orders.status` (§6.2).
- **Test de cohérence périodique** : `fulfillment_status` doit toujours correspondre à l'état réel des
  lignes.

### 13.8 Sous-recettes — un seul niveau, garanti par le RPC

`dish_recipe_components.base_dish_id` **ne peut pas** désigner un plat lui-même composé.

- **Contrôle applicatif dans le RPC** (pas seulement dans l'UI) ;
- **test dédié** vérifiant le rejet d'un cycle et d'un second niveau.

Une contrainte SQL pure ne suffit pas pour un graphe : le RPC est le garde-fou.

### 13.9 Checklist bloquante — vues/RPC lisant `sales.items`

**À traiter avant la phase 3A.** Chaque lecture de `sales.items` doit filtrer
`COALESCE(item->>'item_type', 'product') = 'product'` (§4.2) — sinon un item de plat corrompt une
statistique de bar (§3).

| Cible | Vérifié |
|---|---|
| Top produits (`product_sales_stats`) | ☐ |
| Dashboard / stats quotidiennes | ☐ |
| Forecasting | ☐ |
| Exports (inventaire, ventes) | ☐ |
| Stats par serveur / performance équipe | ☐ |
| Analytics promotions (`promotion_applications`) | ☐ |
| Résumés de ticket (`BonStrip`, `useTickets`) | ☐ |

⭐ **Motif systématique** : trois tables nomment `product_id` sans FK (`sales.items`,
`returns.product_id`, `promotion_applications.product_id`). **Auditer tout `product_id` sans FK**, pas
seulement ces trois-là.

> ⭐⭐ **INVENTAIRE FAIT LE 03/08/2026 → [`INVENTAIRE_SALES_ITEMS.md`](INVENTAIRE_SALES_ITEMS.md)**
>
> Relevé **en production** (`pg_get_functiondef` / `pg_get_viewdef` / `pg_constraint`), et non
> par vérification de cette checklist point par point — leçon du Pré-0, où l'inventaire par
> motif a dû être repris trois fois.
>
> **Ce que le relevé CORRIGE dans ce §13.9 :**
>
> | Affirmation ci-dessus | Réalité vérifiée |
> |---|---|
> | `returns.product_id` sans FK | ❌ **A une FK** — protégé par construction |
> | `promotion_applications.product_id` sans FK | ✅ exact |
> | — | ⭐ **`bar_product_audit_log.product_id`** sans FK, **non mentionné ici** |
>
> **Résultat du balayage** : 6 fonctions à traiter (3 écartées après vérification),
> **3 vues MATÉRIALISÉES**, 2 tables sans FK. Les 6 autres colonnes `product_id` du schéma
> ont une FK : un `dish_id` y serait rejeté par la base. Le rayon d'exposition est donc plus
> ÉTROIT que ce §13.9 le laissait craindre — mais il contient deux objets de plus
> (`bar_ancillary_stats_mat`, `admin_generate_bar_report`).
>
> ⚠️ **Le point le plus grave n'était pas dans cette checklist** : les vues MATÉRIALISÉES
> *stockent* leur résultat. Un plat qui y entre y **reste** jusqu'au prochain `REFRESH`.
> → **Le filtre doit être posé AVANT la première vente d'un plat**, sinon un `REFRESH`
> complet sera nécessaire pour purger l'historique agrégé.
> ⏱️ Délai mesuré : les triggers `pg_notify` avec un débounce de 10 min, le cron rafraîchit
> toutes les 30 min. Une donnée fausse est figée dans la vue jusqu'au refresh suivant.
>
> ⭐ **Deux vues sont HORS périmètre, contrairement à ce qu'un balayage textuel suggère** :
> `top_products_by_period_mat` est une **vue MORTE** (retirée du refresh par la migration
> `20260607160000` — le dashboard passe par `get_top_products_aggregated` qui lit les tables
> brutes), et `bar_stats_multi_period_mat` est une **cascade** de `daily_sales_summary_mat`
> qui hérite donc du correctif de sa source.
>
> ⭐ **Contre-exemple utile** : `compute_sale_items_count` lit `sales.items` et ne doit
> **PAS** être filtré — c'est un compteur d'articles vendus, et un plat *est* un article
> vendu. La question n'est pas « lit-il les items ? » mais « produit-il une statistique
> PRODUIT ? ».
>
> **Trois cibles de la table ci-dessous n'existent pas en SQL** (forecasting, exports,
> résumés de ticket) : elles vivent côté client.
>
> ⭐ **VOLET CLIENT FAIT → [`INVENTAIRE_SALES_ITEMS_CLIENT.md`](INVENTAIRE_SALES_ITEMS_CLIENT.md)**
> Résultat : sur 33 fichiers itérant sur `sales.items`, **DEUX seulement** exigent un filtre
> (`AnalyticsView.tsx` pour la répartition du CA par catégorie, `useSalesExport.ts` pour
> l'export CSV). Le reste est couvert par le correctif SQL, correct par nature (comptage
> d'articles), mort, ou protégé par le compilateur.
>
> ⭐ **Le typage fait l'inventaire à notre place** : quand `SaleItem` recevra `item_type`
> comme champ OBLIGATOIRE, tout code construisant un item sans le renseigner cassera à la
> compilation. C'est la différence structurelle avec le JSONB, qui ne signale rien — et une
> raison de plus pour que le champ ne soit **pas** optionnel dans le type.

### 13.10 `bar_categories.type` — backfill et étanchéité

1. **Backfill** : toutes les catégories existantes → `type = 'product'` ;
2. les plats reçoivent des **catégories dédiées** ;
3. **UI et RPC interdisent** d'attacher un produit et un plat à la même catégorie.

C'est ce qui garantit qu'une promotion `'category'` ne franchit **jamais** la frontière (§15.2).

### 13.11 Cohérence des caches — vue d'audit obligatoire

`ingredients.current_stock` est un cache (§12.4.f). Il exige sa vérification :

```
ingredient_stock_consistency_violations   -- vue ou RPC admin
  → alerte si current_stock ≠ Σ(lots.remaining_qty) − Σ(debts.qty_owed open)
```

Un cache sans détecteur de divergence est une bombe à retardement — la leçon du CUMP (vague 4c) est
qu'un écart silencieux se découvre des mois plus tard, sur des données déjà corrompues.

### 13.12 Onboarding recettes — exigence produit V1

**La saisie initiale est le principal risque d'abandon**, pas la technique. 30 plats × 8 ingrédients
= 240 saisies avant la première information utile.

**Assistant progressif obligatoire en V1** :
1. **ingrédients critiques d'abord** (viande, poisson, riz — ceux qui portent le coût) ;
2. **une recette simple**, puis **coût et marge affichés immédiatement** — la valeur doit apparaître
   après le premier plat, pas après le trentième ;
3. import CSV : **Post-V1**.

Ne **jamais** présenter un formulaire vide de 30 plats à remplir.

### 13.13 Libellés de promotions — sans ambiguïté

| `target_type` | Libellé UI |
|---|---|
| `all` | « **Toutes les boissons** » |
| `all_dishes` | « **Tous les plats** » |
| `product` / `dish` | sélection explicite |

⛔ **Aucune option « Tout le menu »**, même en créant deux promotions en coulisses : cela masquerait
l'existence de deux objets et rendrait leur modification ultérieure incompréhensible.

### 13.14 Motifs de correction de vente cuisine

`cancel_sale` est trop grossier pour la cuisine. Motifs à ajouter :

```
dish_refused | quality_issue | wrong_dish | commercial_gesture
```

**V1 : annulation totale uniquement.** La remise partielle (`partial_refund_needed`) est **Post-V1** —
elle suppose de fractionner une vente, ce qui est un chantier distinct.

### 13.15 Conventions de code à respecter — vérifiées dans la configuration réelle

> Relevé le 31/07/2026 dans `tsconfig.app.json`, `eslint.config.js`, le design system et les
> conventions de migration. **Ce sont les règles effectives du projet, pas des préférences.**

#### TypeScript — `strict` est actif

`tsconfig.app.json` : `strict: true`, **`noUnusedLocals`**, **`noUnusedParameters`**,
`noFallthroughCasesInSwitch`, `target: ES2020`, alias **`@/*` → `./src/*`**.

| Règle | Application au module cuisine |
|---|---|
| **Pas de `any`** | 48 occurrences existent (surtout dans les tests et un `supabase.rpc(x as any)`). **Aucune nouvelle** dans le code cuisine : utiliser `unknown` + type guard |
| `noUnusedParameters` | Préfixer `_` les paramètres inutilisés (`argsIgnorePattern: '^_'` en ESLint) |
| Types discriminés | `production_mode`, `cost_mode`, `item_type`, `cancel_reason`, `resolution` → **unions littérales**, jamais `string` |
| `getErrorMessage(error: unknown)` | [`src/utils/errorHandler.ts`](../../src/utils/errorHandler.ts) — à utiliser dans **tous** les `catch`, jamais `error.message` |
| `undefined`, jamais `null`, pour les params RPC Supabase | Convention établie du projet |

#### Architecture — 3 couches de hooks

```
hooks/queries/    useIngredientsQueries, useDishesQueries, useKitchenOrdersQueries
hooks/mutations/  useKitchenMutations, useIngredientMutations, useBatchMutations
hooks/pivots/     useUnifiedKitchen  (orchestrateur : query + offline + optimistic)
```

- **`AppContext` = actions**, les données passent par les Pivot Hooks. Ne **rien** ajouter aux données
  d'`AppContext` (règle anti-God-Object).
- Services dans `src/services/supabase/` : `ingredients.service.ts`, `dishes.service.ts`,
  `kitchenOrders.service.ts` — pattern `TicketsService` (classe statique + `handleSupabaseError` +
  détection `networkManager` + `offlineQueue`).
- Clés React Query hiérarchiques + `CACHE_STRATEGY` : la file cuisine est du temps réel
  (`salesAndStock`), les recettes du quasi-statique (`products`).

#### Design system — CVA + `cn()`, jamais de Tailwind ad hoc

- Composants avec ≥ 2 variantes → **CVA** + `cn()` (`clsx` + `tailwind-merge`), pattern de
  [`Button.tsx`](../../src/components/ui/Button.tsx) : `forwardRef`, `VariantProps<typeof xVariants>`.
- **Story Storybook obligatoire** pour tout nouveau composant UI (règle du projet).
- Couleurs : `.btn-brand`, `bg-brand-*` (theming par-bar) ou `COLORS`/`COMPONENTS` de
  `colorSystem.ts` — **jamais** `amber-500` en dur dans un composant partagé. Max **3 couleurs
  sémantiques**.
- Pages : `TabbedPageHeader` / `SimplePageHeader` du design system, **jamais** de bouton retour ad hoc.
- Routes : **`lazyWithRetry`**, jamais `lazy`.
- `displayName` sur chaque composant.

#### Migrations SQL

- Nommage **obligatoire** : `YYYYMMDDHHMMSS_description_slug.sql` (jamais de numérotation
  séquentielle).
- Utiliser [`MIGRATION_TEMPLATE.sql`](../migrations/MIGRATION_TEMPLATE.sql) : sections METADATA,
  BUSINESS CONTEXT, TECHNICAL SOLUTION, AFFECTED COMPONENTS, TESTING CHECKLIST, `BREAKING_CHANGE`
  explicite.
- **Exécution à la main dans le SQL Editor** (jamais `db push`) → fournir **pré-vol** (`pg_proc`) et
  **post-vol** (privilèges).
- ⚠ **`CREATE OR REPLACE` perd les grants** : re-`REVOKE`/`GRANT` systématique +
  `has_function_privilege('anon', ...)` en post-vol.
- Tous les RPC : `SECURITY DEFINER` + `SET search_path` + guard « membre actif du bar » + `FOR UPDATE`
  sur les lignes touchées.
- RLS activée sur **chaque** nouvelle table, filtrée par `bar_id`.

#### Tests

- Vitest, pattern Arrange/Act/Assert.
- **Obligatoires** : la machine d'état (§6) transition par transition, l'idempotence des RPC, le calcul
  FEFO, les permissions du rôle `cuisinier`, et le **test d'invariance** (§3 : aucune requête cuisine
  si `has_restaurant = false`).

### 13.16 Matrice RBAC — livrable séparé

Rôle × permission × route × RPC sur **56 fichiers** et **17 migrations** : ce n'est pas un paragraphe
de plan mais un **outil de migration et de vérification**.

→ **Fichier dédié à produire avant la phase 0** : `docs/roadmaps/MATRICE_RBAC_CUISINIER.md`.

⚠ **Ordre imposé** : supprimer les décisions par **rôle brut** dans les zones critiques (`create_sale`,
RLS `bar_members`) **avant** d'ajouter le rôle `cuisinier`. Ajouter d'abord ferait de chaque
`role !== 'serveur'` existant un bug potentiel.

---

## 14. Séquençage

| Phase | Contenu | Valeur livrée | Risque |
|---|---|---|---|
| **Pré-0** | **`MATRICE_RBAC_CUISINIER.md`** (§13.16) + suppression des décisions par **rôle brut** dans les zones critiques | Aucune — outil de migration | — |
| **0** | Ajout rôle `cuisinier` + `has_restaurant` + permissions + **`operatingMode = 'full'` exigé** (§13.4) | Rien de visible | **Élevé** — 56 fichiers, 17 migrations |
| **1** | `ingredients` (+ `cost_mode`, §16.3) + **`ingredient_lots` FIFO/FEFO** (§16.13) + `ingredient_supplies` + **vue de cohérence des caches** (§13.11) + écran appro + saisie en portions (§16.6) + **écran de détail du coût** | Le promoteur suit ses achats cuisine, aujourd'hui invisibles, **et ses pertes par péremption** | Moyen — nouveau moteur de valorisation (table neuve, aucune reprise) |
| **2** | `dishes` (+ **`production_mode`**, §16.8) + `dish_ingredients` + **`dish_recipe_components`** (1 niveau garanti par RPC, §13.8) + marge théorique + **`bar_categories.type` + backfill** (§13.10) + **assistant d'onboarding recettes** (§13.12) | **Le promoteur découvre la marge réelle de ses plats** — souvent une révélation | Faible — lecture seule |
| **3A** | ⭐ **PRÉREQUIS : découpage de la page Cuisine en groupe de menu** (arbitrage 03/08/2026, cf. §9 « Menu latéral ») — à faire AVANT d'écrire l'écran Service, sinon la page atteint 5 onglets illisibles sur mobile · Machine d'état (§6) + `fulfillment_status` piloté par RPC (§13.7) + `isTicketClosed` (§13.6) + **checklist `sales.items`** (§13.9) + écran Service + **`mark_kitchen_item_ready`** et **`serve_kitchen_item`** + format `sales.items` (§4.2) + bon implicite (§16.7) + motifs cuisine de `cancel_sale` (§13.14) + régime **`on_order`** seul + arbitrages §15.1 à §15.6 | Prise de commande à table, **sans emporté, sans prépaiement, sans lot** | **Élevé** — touche au flux de vente |
| **3B** | **`production_batches`** (+ `status`, §13.3) + **`kitchen_item_batch_consumptions`** (§12.4.d) + régime **`batch_finish`** | Spaghetti-poulet, alloco-poisson | Moyen |
| **3C** | Régime **`batch`** complet + **`ingredient_stock_debts`** (§13.2) + **`service_alerts`** (§16.10) | Riz sauce, plats du jour | Moyen |
| **4** | **`ingredient_adjustments`** + inventaire physique (rythme + **gel par période**, §16.5) + écart théorique/réel + **enregistrement** des pertes (§16.11) | Détection gaspillage et fuites | Moyen |
| **5** | `ScopeSwitcher` + dashboard resto + comptes **`602`/`702`/`603`/`6052`** (§10) + **promotions plats** (`target_type 'dish'`, `promotion_applications.item_type`, **alerte de marge**, §15.2) | Vision consolidée bar + resto, promos cuisine sécurisées | Faible |
| **Post-V1** | ⭐ **Emporté + paiement anticipé** (`service_mode`, `ticket_payment_events`, §16.1-16.2) + `precooked` géré comme plat (§12.4.c — **déjà couvert via `bar_products`**) + **remise en vente** des plats récupérés (§16.11) + retour de plat cuisiné + remise partielle | — | Reporté volontairement |

### Règles de livraison

1. **Ne jamais livrer 3A→3C ensemble.** Chaque sous-phase est livrable et testable seule.
2. **Un seul régime de production par sous-phase** : `on_order` (3A), `batch_finish` (3B), `batch`
   (3C). Ajouter deux régimes d'un coup rend les régressions indiscernables.
3. **Les prérequis §13 correspondants sont livrés AVEC leur phase**, jamais après.
4. **`MATRICE_RBAC_CUISINIER.md` (§13.16) précède la phase 0** — et la suppression des décisions par
   rôle brut précède l'ajout du rôle.

### ✅ Réserve terrain LEVÉE (31/07/2026)

Réponses du fondateur, qui **confirment l'ordre** et **réduisent le périmètre V1** :

| Question | Réponse | Conséquence |
|---|---|---|
| `batch` ou service à table ? | **Le service à table domine** | ✅ Ordre **3A → 3B → 3C** confirmé |
| L'emporté payé d'avance ? | **Pas une priorité** | ⛔ **3B sort de la V1** |

#### ⛔ 3B retiré de la V1 — ce qui disparaît avec

| Élément | Sort |
|---|---|
| `service_mode` (`dine_in`/`takeaway`, §16.1) | Post-V1 |
| Paiement anticipé + assouplissement de `pay_ticket` (§16.2) | Post-V1 |
| `ticket_payment_events` (§13.1) | Post-V1 |
| `canRefundPrepaidKitchenItem` | Post-V1 |
| ⭐ **Trou financier du prépaiement (§12.4.b)** | **Disparaît** — le besoin n'existe pas |

⭐ **Conséquence favorable** : le garde-fou **d'origine** de `pay_ticket` redevient valide **sans
assouplissement** — un ticket ne peut pas être payé s'il reste des `kitchen_order_items` non
`served`/`cancelled`. Le point le plus lourd de la 3ᵉ revue s'évapore parce que le cas d'usage n'est
pas prioritaire.

`tickets.fulfillment_status` (§12.4.a) **reste néanmoins utile** : il porte l'état cuisine du ticket et
alimente `isTicketClosed` (§13.6).

### 🎯 Articulation avec le chantier IA — la vraie raison du séquençage

**Objectif du fondateur** : que le modèle cuisine existe **avant** la conception de l'IA, pour éviter
de refaire prompts, requêtes et métriques.

**L'objectif est juste, mais il porte sur le *modèle*, pas sur la *livraison*** :

| Ce qui doit précéder l'IA | Statut |
|---|---|
| Le **modèle** de données cuisine (tables, métriques, sémantique) | ✅ **Déjà acquis** — c'est ce document |
| Les **données** cuisine accumulées | ⏳ Plusieurs mois d'usage réel requis |

Livrer la restauration juste avant l'IA ne donnerait à celle-ci **aucun historique cuisine** à
exploiter — or la roadmap pose que l'IA exige d'abord « des données de bars en situation réelle sur une
période significative ».

**→ Conséquence sur la priorité** : livrer **les phases 1 et 2 tôt** est ce qui sert le mieux le
chantier IA, parce que c'est ce qui **démarre la collecte**. Elles ne touchent pas au flux de vente
(risque faible) et délivrent déjà la valeur vendable (« costing cuisine »). 3A peut suivre quand la
prise de commande est voulue ; l'IA peut être **conçue en parallèle**, sur un schéma désormais connu.

### Le noyau de la phase 3 : deux RPC atomiques

La dissociation du §6 (matière à `ready`, CA à `served`) donne **deux** RPC plutôt qu'un :

**`mark_kitchen_item_ready`** — le plus durci du module, c'est lui qui touche au stock :
1. transition `preparing → ready` sur la ligne (`FOR UPDATE`) ;
2. décrément des N ingrédients de la recette ;
3. snapshot du coût matière (`computed_cost`) = Σ des lots **réellement consommés** en FEFO
   (§16.13) — figé, jamais recalculé (§4.4) ;
4. `consumed_at` renseigné ;
5. **idempotence** par clé stable sur `kitchen_order_item_id` — un rejeu ne doit **jamais** produire
   un second décrément.

**`serve_kitchen_item`** — ne touche plus au stock :
1. transition `ready → served` (`FOR UPDATE`) ;
2. création de la vente, `status = 'validated'` (§6) ;
3. liaison `sale_id` sur la ligne ;
4. **idempotence** par la même clé — un rejeu retourne la vente déjà créée.

Toutes les transitions (`accept`, `start`, `ready`, `serve`, `cancel`) doivent être idempotentes
avec des clés stables — prérequis du mode offline (§11).

**Logique de l'ordre général** : les phases 1 et 2 délivrent l'essentiel de la valeur perçue **sans
toucher au flux de vente**, qui est la partie la mieux durcie de l'app (idempotence, promotions,
price guard, offline). Un promoteur qui découvre en phase 2 que son plat vedette a 12 % de marge
a déjà rentabilisé le module.

### Positionnement commercial par phase

**Après la phase 2, le module est vendable — mais comme « costing cuisine », pas comme « gestion
restauration ».**

| Phase | Ce qui est vendu | Formulation à employer |
|---|---|---|
| 2 | Pilotage de la rentabilité des recettes | « Connaître la marge réelle de chaque plat » |
| 3+ | Commande cuisine opérationnelle | « Prise de commande et suivi cuisine » |

Annoncer « gestion restauration » dès la phase 2 serait survendre : il n'y a ni prise de commande
ni écran cuisinier à ce stade. Cohérent avec la consigne commerciale existante (ne rien promettre
sur la cuisine tant que ce n'est pas livré).

---

## 15. Failles identifiées à l'audit (30/07/2026)

> Audit du plan contre le code réel, en cherchant les endroits raisonnés **par analogie** avec le
> flux boissons sans vérification. Sept failles — les deux bloquantes (13.1, 13.2) sont désormais
> **résolues** : 13.1 tombe en V1 (§12.4.c) et 13.2 est tranchée ci-dessous.
>
> Origine commune de 13.1, 13.3 et 13.4 : le flux de vente a été analysé **sans ses satellites**
> (retours, échanges, journée comptable).

### 15.1 ⛔ BLOQUANTE — Le retour d'un plat est structurellement impossible

`returns.product_id` est une FK **`NOT NULL REFERENCES bar_products(id)`**
([015_create_returns_table.sql](../../supabase/migrations/015_create_returns_table.sql)).

Contrairement à `sales.items` (JSONB permissif, §4.2) et aux promotions (`UUID[]` sans FK), **ici la
contrainte est dure**. Un plat n'étant pas un `bar_product` (§4.5), **aucun retour de plat ne peut
être inséré** — échec au niveau base.

Aggravant : le trigger `handle_auto_restock` fait
`UPDATE bar_products SET stock = stock + quantity_returned`
([auto_restock_trigger.sql](../../supabase/migrations/20260210140000_auto_restock_trigger.sql)). Si
on contournait la FK, il incrémenterait le stock d'un article qui n'en a pas — ou d'un
`bar_product` homonyme.

Or un plat **se retourne** dans la vraie vie : « ce poisson n'est pas frais », « ce n'est pas ce que
j'ai commandé ».

| Option | Coût |
|---|---|
| `returns.product_id` nullable + `item_type` + `dish_id` | Touche une table centrale utilisée par les bars purs — **contredit §3** |
| Table `dish_returns` séparée | Duplique tout le circuit (statuts, validation, remboursement) |
| ✅ **Pas de retour de plat en V1** | Trou métier assumé et documenté |

**Recommandation : option 3** pour les plats **cuisinés** (`on_order`, `batch`, `batch_finish`). Un
plat servi puis refusé se traite par `cancel_sale` — le CA est annulé, la matière reste consommée, ce
qui est comptablement juste (§6). Avant `served`, une annulation de ligne suffit.

> ⭐ **Le blocage disparaît en V1** (§12.4.c) : le seul cas où le retour était légitime était
> `precooked` (pâtisserie) — or ce n'est **pas un plat** mais un `bar_product` (stock dénombrable,
> aucune production). Saisi comme **produit**, il utilise le circuit de retour **existant**, sans
> toucher à la FK.
>
> → **Aucun retour de plat n'est nécessaire en V1.** La FK `NOT NULL` cesse d'être un obstacle : elle
> le redeviendra si un `precooked` géré comme plat est implémenté Post-V1.
>
> Pour les plats cuisinés, la réponse au besoin métier n'est pas le retour mais :
> - **avant `served`** : annulation de ligne (aucune vente n'existe) ;
> - **après `served`** : `cancel_sale` — CA annulé, matière consommée (comptablement juste, §6) ;
> - **prêt mais non retiré** : enregistrement de la perte (§16.11).

### 15.2 ✅ TRANCHÉE — `target_type = 'all'` promouvait les plats par accident

Les promotions ont trois modes de ciblage
([059](../../supabase/migrations/059_create_promotions_and_events.sql)) :

```sql
target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'all'))
target_product_ids  UUID[]   -- si 'product'
target_category_ids UUID[]   -- si 'category'
```

Deux modes cassent :

- **`'all'`** — une promotion « −10 % sur tout ce soir », créée pour les boissons, s'applique-t-elle
  aux plats ? Le moteur ne sait pas distinguer. Silence du plan = **comportement indéfini**.
- **`'category'`** — si les plats réutilisent `bar_categories` (suggéré « probablement suffisant » en
  §4.5), une promotion sur une catégorie boisson peut toucher des plats, et inversement.

Ce n'est pas un détail : **une remise involontaire sur les plats détruit la marge** — précisément la
métrique que le module est censé protéger (§8).

### ✅ TRANCHÉ (31/07/2026) — `'all'` = boissons, les plats se ciblent explicitement

**En clair, la règle suppose trois choses :**

1. **Une promo « sur tout » ne touche jamais la cuisine.** « −10 % sur tout » → **les boissons
   seulement**. Pour remiser un plat, il faut le désigner (le plat, ou une catégorie de plats).
2. **Une catégorie est soit boisson, soit plat — jamais les deux.** Pas de catégorie mixte
   « Vendredi soir » contenant bières *et* poulet braisé. C'est la contrepartie de la garantie : des
   catégories mixtes rendraient impossible d'empêcher une promo de franchir la frontière.
3. **Un avertissement s'affiche si la remise écrase la marge d'un plat.**

| Décision | Effet |
|---|---|
| `'all'` = tous les **produits** (boissons) | ⭐ **Zéro changement en production** |
| Nouveau `target_type` `'dish'` / `'all_dishes'` | Ciblage cuisine **explicite** |
| `bar_categories.type` (`'product'` \| `'dish'`) | `'category'` ne franchit **jamais** la frontière |
| **Alerte de marge minimum sur les plats** | Le promoteur décide en connaissance de cause |
| ~~`target_scope: 'bar'\|'kitchen'\|'both'`~~ | ❌ **Écarté** — sur-ingénierie (cf. ci-dessous) |

#### Les trois raisons, la première étant décisive

**1. Le principe de moindre surprise ne joue que dans un sens.** Un promoteur crée « −10 % sur tout »
en pensant à son happy hour. Deux erreurs sont possibles, et elles ne coûtent pas la même chose :

| Erreur | Conséquence |
|---|---|
| Les plats sont remisés **sans qu'il le veuille** | ⛔ **Perte d'argent invisible** |
| Les plats **ne sont pas** remisés alors qu'il le voulait | ✅ Il le constate aussitôt et corrige |

→ **L'erreur par défaut doit être celle qui ne coûte rien.**

**2. Rétrocompatibilité gratuite.** Toutes les promotions existantes ont été créées par des bars purs,
où `'all'` a toujours signifié « mes boissons ». Cette lecture ne change **aucun comportement en
production** — invariance du §3 satisfaite sans effort.

**3. Une marge plat n'a rien à voir avec une marge boisson.** −10 % sur une bière entame une marge de
revente confortable. **La même remise sur un plat à 12 % de marge matière le vend à perte.** Ce ne sont
pas les mêmes objets économiques ; les traiter d'un seul geste est une erreur de conception, pas une
commodité.

#### ⭐ Garde-fou : alerte de marge minimum (et non blocage)

Quand une promotion ferait passer un plat sous un seuil de marge matière, avertir **à la création** :

> « Cette remise porte le poulet braisé à **4 %** de marge matière (coût 1 450 F, prix remisé
> 1 510 F). Confirmer ? »

**Alerte, jamais blocage** : vendre à perte pour écouler un lot proche de la péremption est une
décision commerciale **légitime** (§16.13). Mais elle doit être prise en le sachant.

Ce garde-fou n'existe pas pour les boissons et n'a pas besoin d'exister : leur marge est stable et
connue. Celle d'un plat **varie avec le coût des ingrédients**, donc le promoteur n'a pas le chiffre
en tête.

#### Pourquoi `target_scope` est écarté

Je l'avais moi-même proposé. C'est un **axe supplémentaire à croiser** avec `target_type` → 3 × 3
combinaisons à documenter, tester et expliquer, pour un besoin (« promouvoir bar et cuisine d'un seul
geste ») dont **rien ne prouve l'existence**. S'il apparaît, **deux promotions** le couvrent : mieux
vaut deux objets simples qu'un objet à deux dimensions.

#### Ce que ça coûte au promoteur

**Un geste en plus** quand il veut une promo sur les deux : deux promotions au lieu d'une. C'est le
**seul** inconvénient réel — à mettre en face de « vendre un plat à perte sans le savoir ».

#### ⚠ Complément (3ᵉ revue) : l'historique analytics reste faux même avec un ciblage correct

Ce point ne couvrait que le **ciblage**. Il manquait la **traçabilité** :
`promotion_applications.product_id UUID NOT NULL`
([059](../../supabase/migrations/059_create_promotions_and_events.sql)) — pas de FK, donc l'insertion
d'un UUID de plat **passe**, mais la colonne est **nommée et interprétée comme un produit**.

→ Même une promo plat correctement ciblée polluerait les analytics promotionnelles. Il faut le même
discriminant que pour `sales.items` (§4.2) : **`item_type` + `item_id`** sur
`promotion_applications`, et filtrer `item_type = 'product'` dans les vues existantes.

⭐ **Symptôme récurrent** : troisième table (`sales.items`, `returns.product_id`,
`promotion_applications.product_id`) où « produit » est **implicitement synonyme de `bar_products`**.
À traiter comme un **motif systématique**, pas comme trois cas isolés : tout endroit nommant
`product_id` sans FK doit être audité avant la phase 3A.

### 15.3 Le Magic Swap (`provideExchange`) est incompatible avec les plats

`provideExchange` ([AppProvider.tsx](../../src/context/AppProvider.tsx)) crée un retour puis une
vente liée, avec une signature typée `swapProduct: Product`. Trois cas non traités :

| Cas | Problème |
|---|---|
| Plat → boisson | Bloqué par 13.1 (le retour du plat est impossible) |
| **Boisson → plat** | ⚠ La vente d'échange serait créée **immédiatement**, contredisant « la vente d'un plat naît à `served` » (§6) → **vente de plat sans passage en cuisine** |
| Plat → plat | Cumule les deux |

**Recommandation** : interdire explicitement le plat comme produit d'échange en V1 (échange
boisson → boisson uniquement, comportement actuel). Sans cette interdiction écrite, quelqu'un
l'implémentera par symétrie et créera une vente de plat fantôme.

### 15.4 `business_date` : la charge et le produit peuvent tomber dans deux journées

**Incohérence introduite par la dissociation du §6**, non vue lors de cette correction.

Depuis que le décrément a lieu à `ready` et la vente à `served`, les deux événements ont des
horodatages distincts. Avec `closing_hour = 6` (défaut Afrique de l'Ouest), un plat prêt à **5h50**
et servi à **6h10** franchit la clôture : **la charge matière tomberait la veille, le produit le
jour suivant**. Un Z de caisse afficherait une consommation sans vente, et l'inverse le lendemain.

| Source de `business_date` | Effet |
|---|---|
| `created_at` (commande) | CA rattaché au moment de la commande |
| ✅ **`served_at`** | Cohérent avec « la vente naît au retrait » |
| `consumed_at` (`ready`) | ⛔ Charge et produit dans des journées différentes |

**Recommandation** : `business_date` calculée depuis `served_at` pour la vente, **et la même valeur
reportée sur la ligne de consommation**, même si `ready_at` appartient à la veille. La cohérence
comptable prime sur l'exactitude horaire du décrément.

Cas particulier : un plat `ready` **jamais servi** (perte, §8) n'a pas de `served_at` → sa
`business_date` se calcule alors depuis `consumed_at`.

### 15.5 Price guard : la duplication doit être assumée, pas subie

§4.5 annonçait « étendre le price guard aux plats » sans mesurer la contradiction. Le guard lit
`bar_products.price` et `display_name`
([restore_strict_price_guard.sql](../../supabase/migrations/20260704073000_restore_strict_price_guard.sql)).
Pour un plat il faudrait lire `dishes.price` — donc une **branche conditionnelle selon `item_type`
dans le RPC de vente**. Or §3 exige que `create_sale` reste inchangé pour les boissons.

**Recommandation** : **dupliquer** le guard dans le RPC plat plutôt que de généraliser l'existant.
Trois lignes similaires valent mieux qu'une abstraction qui met du code resto dans le chemin
critique des bars purs. Décision à assumer explicitement, sinon quelqu'un « factorisera » et
touchera au guard des boissons.

### 15.6 `ingredients.current_stock` ne doit PAS porter de `CHECK >= 0`

Deux règles du plan se combinent mal : « stock d'ingrédients **jamais bloquant** » (§4.4) et
décrément optimiste offline avec réconciliation (§11). Rien n'empêche donc un stock négatif.

Or `bar_products.stock` porte un `CHECK (stock >= 0)`. Ajouter la même contrainte par **mimétisme**
ferait **échouer le RPC en plein service** — exactement ce que « jamais bloquant » voulait éviter.

**Décision explicite** : pas de `CHECK >= 0` sur `ingredients.current_stock`. Un stock négatif est
un **signal** (« vous avez servi plus que vous n'avez acheté »), pas une erreur. En FIFO/FEFO il est
matérialisé par un **lot de régularisation** marqué comme anomalie (§16.13). À écrire, sinon la
contrainte sera ajoutée par réflexe.

### 15.7 Le mode simplifié n'a pas de traduction cuisine cohérente

§6 affirme qu'en mode simplifié « le gérant commande et retire ». Mais **qui marque `ready`** ?

- Si le cuisinier a un compte → il existe un acteur de terrain dans un mode censé ne pas en avoir ;
- Si le cuisinier n'a pas de compte → le gérant fait les trois transitions, et l'écran cuisinier
  perd son sens.

Non bloquant (mode minoritaire), mais le plan affirmait une cohérence **non vérifiée**. À trancher :
le plus probable est qu'un bar-resto en mode simplifié donne quand même un compte au cuisinier — ce
qui signifie que « mode simplifié » et « restauration » sont partiellement contradictoires, et
mérite d'être dit.

> **✅ TRANCHÉ — voir §13.4.** La restauration exige le mode complet en V1, et c'est **appliqué**
> (`BarContext.hasRestaurant` teste les deux conditions). L'hypothèse formulée ici était la bonne :
> un bar-resto donne un compte à son cuisinier.
>
> ⏸ La variante « cuisine simplifiée » — le gérant seul enregistrant tout, comme il le fait pour les
> ventes — a été rouverte le 02/08/2026 puis **reportée Post-V1**. Le raisonnement complet, et
> pourquoi le parallèle avec les ventes ne se transpose pas (événement instantané vs séquence
> horodatée déclenchant le décrément FEFO), est en **§13.4**.

---

## 16. Test « service réel » — corrections métier (30/07/2026)

> Le plan avait été audité **techniquement** (§15) mais jamais confronté à un service de 40 couverts
> un vendredi soir. Cette section corrige 13 manques métier, dont **trois angles morts complets** :
> `service_mode` (§16.1), la vente sans bon (§16.7) et surtout **les quatre régimes de production**
> (§16.8) — le plan supposait que tout plat est préparé à la commande, alors que c'est le cas
> **minoritaire** dans un maquis béninois.
>
> Sources : **seconde revue externe** pour §16.1 à §16.6 et §16.12 (elle portait sur une version
> antérieure — 4 de ses 12 points étaient déjà traités — mais ses apports métier restants sont réels
> et l'un d'eux est meilleur que l'analyse initiale) ; **question du fondateur** pour §16.7.

### 16.1 ⏸ POST-V1 — `service_mode` : le plan supposait partout « table »

> ⏸ **Reporté Post-V1 (31/07/2026)** : l'emporté n'est pas une priorité (§14). Angle mort réel, mais
> hors périmètre V1 — conservé ici car il devra être traité intégralement le jour où l'emporté arrive.

**Aucune occurrence** de « emporté », « takeaway » ou `service_mode` dans le plan avant cette
section. Ni la contre-analyse, ni la revue externe, ni l'audit §15 ne l'avaient vu.

Or un petit resto béninois vend beaucoup **à emporter**. Sans ce champ, l'écran cuisine forcerait de
fausses tables (« table 99 » pour l'emporté), ce qui pollue les données et rend inutilisable le
regroupement par table (§9).

```
kitchen_orders
  service_mode  -- 'dine_in' | 'takeaway'    (delivery : hors V1)
```

**Combinaison critique avec §16.2** : un client qui emporte **paie avant** que le plat soit prêt.
Le garde-fou `pay_ticket` (§5) **rendrait donc la vente à emporter impossible**. Une règle comptable
qui bloque un cas d'usage courant est une erreur de conception, pas une rigueur.

Conséquences UI : `table_number` devient nullable quand `service_mode = 'takeaway'` ; l'écran Service
groupe par table **ou** par « À emporter » ; le nom du client (`tickets.customer_name`, déjà présent)
devient le repère pour l'emporté.

### 16.2 ⏸ POST-V1 — Paiement anticipé

> ⏸ **Reporté Post-V1 (31/07/2026)** : l'emporté payé d'avance n'est pas prioritaire (§14).
> ⭐ **Conséquence favorable** : le garde-fou **d'origine** de `pay_ticket` reste valide **sans
> assouplissement**, et le trou financier du §12.4.b **disparaît** — le besoin n'existe pas.

Cas terrain que le garde-fou actuel bloque : paiement d'avance, emporté payé avant préparation,
table qui veut partir.

Mais **lever** le garde-fou rouvrirait le problème qu'il résolvait : `pay_ticket` propage
`payment_method` aux ventes du ticket, donc un plat servi après paiement produirait une vente **sans
moyen de paiement**.

**Solution** : traiter le paiement anticipé comme un cas explicite plutôt que comme une exception.
Le moyen de paiement est **mémorisé sur le ticket** (`tickets.payment_method`, déjà présent) et
**appliqué aux ventes créées ensuite** par `serve_kitchen_item`. Le ticket passe alors dans un état
`paid` avec des lignes cuisine encore actives — état légitime, plus « incohérent ».

**Décision V1** : paiement anticipé du **ticket entier** supporté ; **paiement partiel interdit**
(payer les boissons maintenant et le plat après suppose de fractionner une addition — chantier à
part entière).

### 16.3 Typologie des consommables — `is_transversal` binaire est un biais de marge

§17 admettait que `is_transversal` est « binaire alors que la réalité ne l'est pas » **sans en tirer
de conséquence**. Aveu sans correction.

L'argument qui tranche : ce n'est pas une imprécision mais un **biais systématique**. L'huile de
friture est un coût **majeur** pour l'alloco, le poisson frit, les beignets — plats centraux au
Bénin. La traiter comme le sel **sous-estime la marge des plats frits et surestime celle des
mijotés** : le classement des plats par rentabilité, qui est le livrable de la phase 2, serait
**faux**.

Typologie à 4 niveaux remplaçant le booléen :

| `cost_mode` | Exemples | Décrément stock | Inclus au coût du plat |
|---|---|---|---|
| `direct` | poulet, riz, poisson | ✅ par recette | ✅ **coût FEFO des lots consommés** (§16.13) |
| `global` | sel, gaz, eau | ❌ stock simple + alerte | ❌ charge indirecte cuisine |
| ⭐ `per_dish_flat` | **huile de friture**, charbon, emballage | ❌ | ✅ **forfait par plat** |
| `cost_only` | — | ❌ non suivi | ✅ |

Le niveau `per_dish_flat` est ce qui manquait : il évite la fausse précision (personne ne pèse
l'huile) **tout en** attribuant le coût aux plats qui le supportent réellement.

### 16.4 `cancel_reason` structuré, pas du texte libre

§6 dit « avec un motif court » — donc du texte libre. Sans énumération, impossible de distinguer une
**fuite de stock** d'un **problème d'organisation** ou d'une **mauvaise carte**.

```
cancel_reason ENUM :
  ingredient_shortage    -- rupture → signal d'appro
  kitchen_overloaded     -- délai trop long → signal d'organisation
  dish_unavailable       -- plat coupé mais encore visible côté serveur → signal de carte
  server_input_error     -- erreur de saisie
  customer_cancelled     -- annulation client
  substitution_offered   -- remplacé par un autre plat
```

Un champ texte libre reste utile **en complément**, jamais à la place. C'est la structure qui rend
les annulations analysables — et donc actionnables pour le promoteur (cf. métrique des pertes, §8).

### 16.5 Inventaire physique et ajustements de stock

§8 pose l'obligation **trois fois**, le rythme **nulle part**. Compter tous les ingrédients chaque
jour est irréaliste en restaurant.

#### Le mécanisme existe déjà pour le bar — le calquer

[`stock_adjustments`](../../supabase/migrations/20260118000001_create_stock_adjustments_table.sql)
gère déjà l'ajustement manuel des `bar_products`, avec **6 motifs contraints** et un audit complet :

```sql
reason CHECK (reason IN ('inventory_count', 'loss_damage', 'donation_sample',
                         'expiration', 'theft_report', 'other'))
old_stock, new_stock, delta, notes, adjusted_by, adjusted_at
CONSTRAINT notes_required_for_other  -- notes obligatoires si motif = 'other'
```

**Ne pas réinventer** : `ingredient_adjustments` reprend la même structure, la même énumération et le
même garde-fou sur `other`. Le promoteur retrouve un geste qu'il connaît déjà côté bar.

**Deux différences imposées par le modèle cuisine** :

| Point | Bar (`stock_adjustments`) | Ingrédients |
|---|---|---|
| `old_stock`/`new_stock` | `CHECK >= 0` | ⚠ **PAS de contrainte** — stock négatif autorisé (§4.4, §15.6) |
| Cible de l'ajustement | le produit | ⚠ **le lot** (`ingredient_lot_id`) — sinon quel coût imputer ? |

Le second point est le plus important : en FIFO/FEFO (§16.13), un ajustement doit désigner **quel
lot** est concerné, sinon la perte n'est pas valorisable. Par défaut : imputer au lot le plus proche
de l'expiration (cohérent avec FEFO), avec possibilité de choisir explicitement.

#### Rythme réaliste

| Fréquence | Portée |
|---|---|
| Quotidien | **Comptage rapide** des ingrédients critiques uniquement (viande, poisson) |
| Hebdomadaire | **Inventaire complet** |
| À la demande | **Ajustement ponctuel** avec motif |

Motifs adaptés à la cuisine, en réutilisant l'énumération existante là où elle convient :

| Motif | Usage cuisine |
|---|---|
| `inventory_count` | écart constaté au comptage — le cas le plus fréquent |
| `loss_damage` | casse, renversement |
| `expiration` | périmé — **recoupe la 5ᵉ métrique** (§8), à réconcilier pour ne pas compter deux fois |
| `theft_report` | vol suspecté |
| `donation_sample` | ⭐ couvre le **repas du personnel**, poste réel et souvent invisible en maquis |
| `other` | notes obligatoires |

⚠ **Point de vigilance** : `expiration` en ajustement manuel **et** péremption automatique de lot
(§16.13) mesurent la même perte. Il faut que la péremption automatique **crée** l'ajustement plutôt
que de coexister avec lui, sinon la perte est comptée deux fois.

#### ⭐ Gel par période — le point le plus important

Une fois la marge d'une période calculée et communiquée au promoteur, un inventaire tardif ne doit
**pas** la réécrire. Sans gel, les chiffres changent après coup et **le promoteur perd confiance dans
l'outil** — ce qui coûte plus cher qu'une imprécision assumée.

Mécanisme : une période clôturée refuse tout ajustement antérieur à sa date de gel ; l'écart constaté
après clôture s'impute sur la **période courante**, avec une note de rattachement.

Note : ces motifs recoupent `cancel_reason` (§16.4) et `service_alerts` (§16.10) — même logique
partout dans le module : **catégoriser rend analysable**.

### 16.6 Portions : couche de saisie, pas manque du modèle

`yield_factor` (§4.1) et `usage_unit` couvrent déjà le **calcul** : un poulet de 1,5 kg acheté ne
donne pas 1,5 kg vendable, et `yield_factor` l'exprime.

Ce qui manque est **ergonomique** : un cuisinier pense en « un quart de poulet », pas en « 375 g ».
Prévoir une saisie en portions métier avec conversion automatique vers `usage_unit`. Sans cela, les
recettes seront remplies avec des approximations arbitraires — le modèle serait juste et les données
fausses.

**Portée** : couche de présentation, pas refonte du modèle.

### 16.7 Vente sans bon : bon implicite dès qu'un plat entre dans le panier

**Cas non examiné par le plan.** Le bon est **entièrement optionnel** aujourd'hui : `sales.ticket_id`
est nullable, `p_ticket_id` a `DEFAULT NULL`
([create_tickets_table.sql](../../supabase/migrations/20260204000000_create_tickets_table.sql)), et
[QuickSaleFlow](../../src/components/QuickSaleFlow.tsx) passe `ticketId || undefined`. **La vente
sans bon est le cas par défaut** — c'est la vente au comptoir.

Or le plan fait de `kitchen_orders.ticket_id` le rattachement de la commande cuisine (§4.1). Sans
bon, ce champ serait NULL et **le plat flotterait sans support pendant sa préparation**.

| | Boisson sans bon | Plat sans bon |
|---|---|---|
| Commande et remise | Simultanées | 10 à 40 min d'écart |
| Où vit la commande entre les deux ? | Nulle part — pas besoin | **Nulle part = problème** |

**Options écartées** :
- *`kitchen_orders.ticket_id` nullable* → deux chemins de rattachement à maintenir, et `pay_ticket`
  perd toute prise sur ces plats, donc le paiement anticipé (§16.2) devient impossible pour eux.
- *Exiger explicitement un bon* → friction inutile : le serveur ne devrait pas avoir à comprendre
  qu'un plat « exige un bon ». La règle est déductible par le système.

> ⚠ **Règle affinée (3ᵉ revue)** : le critère n'est **pas** « un plat entre dans le panier » mais
> « **une ligne crée un délai ou un suivi cuisine** » — donc `on_order` et `batch_finish` seulement.
> Un plat `batch` vendu immédiatement **ne déclenche aucun bon**, sauf si le panier
> contient **aussi** une ligne à préparation (l'addition ne doit pas être fragmentée). Le tableau des
> régimes (§16.8) disait déjà « bon : non » pour ces deux régimes — la formulation ci-dessous était
> trop large.

**Décision : bon implicite.** Dès qu'une ligne à préparation entre dans le panier, un bon est créé
automatiquement
si aucun n'est sélectionné. **Toutes les lignes du panier y sont rattachées**, boissons incluses —
sinon l'addition serait fragmentée, ce qui contredirait « un ticket = une addition » (§5).

Selon le `service_mode` (§16.1), le bon change de sens sans changer de structure :

| `service_mode` | Repère affiché sur le bon |
|---|---|
| `dine_in` | `table_number` |
| `takeaway` | `customer_name` (déjà présent) — c'est le **ticket de retrait** |

**Invariance préservée (§3)** : un bon n'est créé implicitement **que** si le panier contient un
plat → jamais pour un bar pur.

⚠ **Effet à assumer** : `ticket_number` est **séquentiel par journée comptable**
([add_payment_method_and_number](../../supabase/migrations/20260204140000_add_payment_method_and_number_to_tickets.sql)).
Un bon implicite consomme donc un numéro visible dans le suivi. Acceptable, mais à ne pas découvrir
en production — le promoteur verra plus de bons qu'il n'en a créés manuellement.

**Décision du 04/08/2026 — `QuickSaleFlow` ne prend PAS de commande cuisine.**

L'enchaînement ticket → cuisine → boissons vit dans `Cart.tsx` uniquement. La vente rapide reste
un écran de comptoir : boissons seulement.

| Raison | Détail |
|---|---|
| Métiers distincts | La vente rapide sert quelqu'un qui attend debout (raccourcis, validation en un geste). Une commande cuisine demande table, délai annoncé, modificateurs. |
| Duplication = risque avéré | L'enchaînement a révélé 3 défauts à sa code review. Le même jour, 3 schémas Zod portaient le même défaut à 3 endroits. L'implanter deux fois avant de l'éprouver reproduirait ce motif. |
| Contournement trivial | Commander un plat passe par l'Accueil, qui porte la grille avec sélecteur Tout/Bar/Restau. |

**Invariance structurelle** : `QuickSaleFlow` monte `CartDrawer` sans lui passer les props cuisine,
toutes optionnelles. La section ne *peut pas* s'afficher — aucune condition à maintenir.

⚠ **Si le terrain le réclame** : extraire d'abord l'enchaînement de `Cart.tsx` dans une fonction
partagée, **puis** l'appeler des deux côtés. Jamais deux implémentations de la même règle.

### 16.8 ⭐⭐ `production_mode` : quatre régimes de production

Le plan supposait que **tout** plat passe par la cuisine à la commande. Faux, et de loin : c'est
même le cas **minoritaire** dans un maquis béninois.

Deux axes suffisent à décrire tous les cas — **la matière vient-elle d'un lot ?** et **la commande
déclenche-t-elle une production ?** Les quatre combinaisons donnent quatre régimes, ce qui garantit
la complétude du modèle (pas de cinquième cas caché) :

| `production_mode` | Lot | Finition à la commande | Délai | Bon | Retour | Exemple |
|---|---|---|---|---|---|---|
| `on_order` | non | totale | 20-40 min | oui | non | poulet braisé, poisson grillé |
| **`batch`** | oui | **aucune** | nul | **oui** ⚠ | non | **riz gras + sauce légume**, akassa |
| **`batch_finish`** | oui | **partielle** | 5-10 min | oui | non | **spaghetti-poulet, alloco-poisson** |
| ~~`precooked`~~ | — | aucune | nul | non | ✅ oui | ⏸ **Post-V1** (§12.4.c) — pâtisserie, beignet |

> ⏸ **`precooked` reporté Post-V1** (§12.4.c) : ce n'est **pas un plat** mais un **produit fini
> revendu en l'état** (stock dénombrable, retour possible, aucune production) — donc un
> `bar_product`. Le classer comme plat était une **erreur de catégorisation**. Un maquis qui vend des
> beignets les saisit comme **produits** dès aujourd'hui, sans le module cuisine.
>
> → **V1 : 3 régimes** (`on_order`, `batch`, `batch_finish`).

**Libellés UI en langage clair** (jamais le nom technique) : « Préparé à la commande » / « Cuisiné en
grande quantité » / « Précuit puis fini à la commande ».

##### `on_order` — le cas déjà modélisé

Comportement du §6 sans changement : matière à `ready`, vente à `served`, bon implicite, statuts de
production, chrono.

##### `batch` — production le matin, service à la portion

Le fait structurant : **la matière est consommée à la cuisson du lot, ni à la commande ni au
service.**

```
Matin       : 5 kg riz + sauce cuisinés     → ingrédients décrémentés ICI (une seule fois)
              → production_batches : 20 portions, unit_cost = coût lot / 20
Service     : commande « riz + légumes »    → prélève 1 portion de chaque lot
              → PASSAGE CUISINE COMME LES AUTRES RÉGIMES (corrigé 08/08/2026)
              → remaining_qty décrémenté, PAS les ingrédients
Fin de jour : reste conservable → report ; sinon discarded_qty = perte valorisée
```

⚠ **Piège à éviter** : décrémenter les ingrédients à chaque portion servie **double-compterait** la
matière déjà consommée le matin. Le service ne touche **que** `remaining_qty`.

> ### ⛔ CORRECTION DU 08/08/2026 — `batch` PASSE PAR LA CUISINE
>
> La première rédaction écrivait « vente immédiate (comme une boisson), AUCUN passage cuisine », et
> le tableau des régimes porte encore `Bon : non`. **C'est faux**, démenti par le terrain :
>
> > « Dans un bar restau, même pour le riz gras, c'est le cuisinier qui sert du bac vers l'assiette,
> > puis le serveur vient récupérer et servir le client. Pour l'akassa c'est pareil. »
>
> L'erreur venait d'un raisonnement sur le **modèle de stock** (une portion décomptée, comme un
> casier) qui a oublié la **géographie** : où la portion se trouve, et qui a le droit d'y toucher.
> Une bouteille est dans le frigo du bar — le serveur se sert. Une portion de riz gras est dans le
> bac **en cuisine** : le serveur ne peut pas se servir, et si la commande n'apparaît pas sur
> l'écran Service, **personne ne dit au cuisinier de dresser l'assiette**. Il n'a aucune autre
> interface.
>
> **Ce qui distingue `batch` de `on_order` n'est donc PAS le circuit, mais ce qui est DÉCOMPTÉ** :
> `remaining_qty` au lieu des ingrédients. Le reste (bon, statuts, chrono) est identique.
>
> ⚠️ Conséquence sur le tableau du §16.8 : la colonne `Bon` de la ligne `batch` doit se lire **oui**.
>
> #### Lot vide → REFUS avec alternative
>
> Arbitrage du 08/08/2026, **aligné sur `batch_finish`** (§16.9, arbitrage du 07/08) : quand le bac
> est vide, `accept_kitchen_item` REFUSE et propose de préparer à la commande.
>
> Le repli sur les ingrédients bruts a été **écarté** : il supposerait de recuisiner un bac entier
> pour une assiette, ce qui n'arrive pas en cuisine réelle. Un riz gras épuisé est épuisé — le
> serveur doit pouvoir dire « c'est terminé » plutôt que de laisser le client attendre.
>
> ⭐ C'est le même raisonnement que le 07/08 : on refuse **parce qu'une alternative existe**. Un
> ingrédient manquant, lui, n'en a aucune — d'où la dette (§4.4). L'asymétrie est conservée.
>
> #### ⚠️ Ce que le code fait aujourd'hui (à corriger)
>
> `mark_ready_kitchen_item` ne prélève dans un lot que pour `batch_finish`. Un plat `batch` décompte
> donc ses **ingrédients** — exactement le double-comptage interdit ci-dessus. Pour un lot
> `purchased` (§19.3) c'est pire : on décompterait du maïs jamais utilisé.

Le coût de la portion est un **coût moyen de lot** : `coût du lot / portions_per_batch`, figé à la
production.

Métrique la plus utile de ce régime : « 20 portions cuisinées, 14 vendues, 6 jetées » → **signal de
surproduction**, levier de marge plus actionnable que l'écart d'inventaire.

Note : « riz + légumes » prélève dans **deux lots distincts** → `kitchen_item_batch_consumptions` porte les
prélèvements, exactement comme il porte les sous-recettes.

##### `batch_finish` — hybride : lot puis finition

**La matière est consommée en deux temps**, et c'est ce qui le distingue :

| Moment | Consommé | Source |
|---|---|---|
| Production du lot (matin) | spaghetti secs, poulet cru, eau, sel | `ingredients` (`consumed_at_stage = 'batch'`) |
| **Finition** (à la commande) | portion du lot **+** huile, sauce, oignon | lot **+** `ingredients` (`'finish'`) |

La recette a donc deux volets : `kitchen_item_batch_consumptions` (lots prélevés, §12.4.d) et
`dish_ingredients` filtré sur `consumed_at_stage = 'finish'`.

```
coût du plat = Σ(portions de lot × unit_cost du lot)
             + Σ(ingrédients de finition × coût FEFO des lots consommés)   -- §16.13
```

⭐ **C'est ici que `cost_mode = per_dish_flat` (§16.3) trouve sa justification la plus nette** :
l'huile de friture appartient à la **finition**, pas au lot. Un poulet bouilli le matin ne consomme
pas d'huile ; le même poulet frit à la commande en consomme. Les deux mécanismes se combinent
exactement à cet endroit.

Circuit de service : identique à `on_order` (`pending → preparing → ready → served`, bon implicite,
chrono) mais avec `preparation_time_min` calibré à 5-10 min. Le prélèvement du lot **et** le
décrément des ingrédients de finition ont lieu à `ready`, cohérent avec §6.

##### ⏸ `precooked` — reporté Post-V1, à traiter comme un `bar_product`

Vente immédiate, aucun `kitchen_order`, aucun bon implicite, retour possible — parce qu'un plat
précuisiné a un **stock réel dénombrable** (12 beignets sur le présentoir).

**C'est précisément ce qui montre que ce n'est pas un plat** : stock dénombrable + retour + aucune
production = **la définition d'un `bar_product`**. D'où le report Post-V1 (§12.4.c) : le besoin est
couvert **dès aujourd'hui** en saisissant ces articles comme produits, sans le module cuisine.

Ce qui manquerait pour bien faire (recette d'un précuisiné, coût de production plutôt que coût
d'achat) est un **raffinement**, pas un bloquant.

#### ⭐ Aucun régime n'est « normal » pour un plat donné

**Correction d'une normativité fausse** introduite par la première rédaction (« grillades →
`on_order` », « plats du jour → `batch` »). **Chaque maquis a sa propre pratique pour un même plat**,
et aucune n'est plus juste que l'autre :

| Maquis A | Maquis B |
|---|---|
| Braise à la commande, 30 min d'attente | Braise 20 poulets le matin, réchauffe à la commande |
| `on_order` | `batch_finish` |

Même plat, même nom, deux économies différentes. `dishes` étant **par bar** (`bar_id`), le modèle le
permet déjà techniquement — c'est la **documentation** qui installait à tort une norme.

**Conséquence** : pas de régime imposé par catégorie. Un défaut peut être *suggéré* à la création
d'un plat, jamais appliqué silencieusement.

#### Simplification : 3 choix pour le promoteur, 4 régimes en interne

Le risque d'adoption reste réel (un mauvais choix produit des données fausses), mais il se réduit en
ne demandant que ce que le promoteur sait :

| Ce qu'il déclare | Régime déduit |
|---|---|
| « Je le prépare à la commande » | `on_order` |
| « Je le prépare d'avance » | `batch` **ou** `batch_finish` — **déduit de la recette** |
| ~~« Il est déjà prêt à vendre »~~ | ⏸ Post-V1 — à saisir comme **produit** (§12.4.c) |

→ **2 choix en V1**, et la distinction `batch`/`batch_finish` reste déduite. Le risque d'adoption s'en
trouve encore réduit.

La distinction `batch` / `batch_finish` **n'a pas à être demandée** : si la recette contient des
ingrédients marqués `consumed_at_stage = 'finish'`, il y a une finition ; sinon, non. Le système le
déduit au lieu de l'exiger.

Libellés en langage clair, jamais de jargon technique dans l'UI.

### 16.9 Régime hybride : intention configurée + basculement automatique

Le régime déclaré est une **intention**, l'état du lot est un **fait**. Un même plat peut changer de
régime au fil de la journée — un maquis peut braiser 10 poulets le matin (`batch_finish`) puis braiser
à la commande le soir (`on_order`) — sans qu'il faille créer deux plats homonymes (ce qui fausserait
les statistiques et la marge par plat).

```
production_mode = intention du promoteur   (config explicite, par plat, par bar)
remaining_qty   = réalité du moment        (le lot est-il épuisé ?)

Régime effectif = intention, sauf lot épuisé → repli sur on_order
```

#### Ce que l'app décide seule — et ce qu'elle ne décide PAS

Distinction essentielle : l'app **constate un fait** (`remaining_qty = 0`), elle ne **décide** pas.

| Action | Qui |
|---|---|
| Constater le lot épuisé | **App**, automatique |
| Adapter le délai affiché | **App**, automatique |
| Router vers le circuit de production | **App**, automatique |
| **Le plat reste-t-il vendable ?** | ⚠ **Humain** — jamais l'app |

⚠ **Lot épuisé ≠ le plat reste disponible.** Trois situations que le système **ne peut pas
distinguer** :

| Situation réelle | Ce que le système voit | Bonne réaction |
|---|---|---|
| Il reste des poulets crus | `remaining_qty = 0` | Basculer en `on_order` |
| Plus de poulet cru du tout | `remaining_qty = 0` | **Couper le plat** |
| Cuisinier débordé, 45 min | `remaining_qty = 0` | Couper ou avertir |

Basculer automatiquement dans les trois cas laisserait un serveur **vendre un plat que la cuisine ne
peut pas produire** — la promesse impossible qui provoque une annulation en cuisine.

Et le stock d'ingrédients **ne peut pas** servir de garde-fou : le plan pose qu'il est *jamais
bloquant* (§4.4), donc un stock théorique à 0 n'interdit pas de servir. **La même raison qui interdit
de bloquer sur le stock interdit de décider à la place du cuisinier.**

#### Le déclenchement : à la première commande, pas à l'épuisement

Le mécanisme bascule seul ; la **disponibilité** est confirmée par un humain, au moment où la question
se pose réellement — cf. §16.10.

### 16.10 ⭐ Alertes de service : l'app détecte, l'humain tranche

Généralisation du point précédent. Le basculement de régime n'est qu'un cas particulier d'un besoin
plus large : **un point de décision unique en cas de rupture**, quel qu'en soit le déclencheur.

L'app ne peut pas trancher, parce que la bonne réponse dépend d'informations qu'elle n'a pas : le
fournisseur est-il ouvert, y a-t-il quelqu'un pour aller au marché, combien de temps avant le rush.

| Déclencheur | Plats touchés | Options réalisables |
|---|---|---|
| Lot épuisé | 1 plat | couper · cuire un lot · préparer à la commande |
| Ingrédient **spécifique** en rupture | les plats qui l'utilisent | couper · s'approvisionner · changer la recette |
| ⭐ Ingrédient **transversal** en rupture | **toute une famille** | s'approvisionner · couper la famille |

⭐ **Le cas transversal justifie la généralisation.** Une rupture de **gaz** ne touche pas un plat :
elle touche **tous les plats qui cuisent**. Une rupture d'**huile** touche tous les plats frits. La
décision porte donc sur un **ensemble** de plats, et les options ne sont pas les mêmes — personne ne
« prépare à la commande » sans gaz. C'est une décision de **carte**, pas de plat.

```
service_alerts
  id, bar_id
  trigger_type      -- batch_depleted | ingredient_shortage | transversal_shortage
  trigger_ref       -- le lot ou l'ingrédient concerné
  affected_dishes   -- calculé : les plats réellement touchés
  raised_at
  resolution        -- disable_dishes | resupply | produce_batch | switch_to_on_order | ignore
  resolved_by, resolved_at, note
```

Chaque résolution déclenche une action concrète : `disable_dishes` → `is_available = false` sur les
plats concernés ; `produce_batch` → ouvre la déclaration de lot ; `resupply` → ouvre l'appro cuisine ;
`switch_to_on_order` → plat vendable avec délai long.

**`ignore` compte autant que les autres** : le cuisinier sait parfois qu'il a de quoi tenir même si le
stock théorique dit non. Cohérent avec « stock jamais bloquant » (§4.4).

#### ⚠ Anti-sur-sollicitation — obligatoire

Une alerte à chaque seuil franchi, en pleine affluence, sur un téléphone posé en cuisine : **personne
ne les traite**. Trois règles :

1. l'alerte se déclenche **quand elle bloque quelque chose** (une commande arrive), pas au
   franchissement d'un seuil théorique ;
2. **une seule alerte** par ingrédient et par service, jamais de répétition ;
3. une résolution `ignore` **tient jusqu'à la fin du service** — sinon la question revient et
   l'utilisateur apprend à cliquer sans lire.

Même raisonnement que l'anti-spam du bouton Relancer (§9) : un mécanisme de notification sans
garde-fou devient un mécanisme ignoré.

#### Bénéfice non anticipé : un historique de gestion

Les alertes résolues constituent une donnée exploitable :

> « 14 ruptures ce mois-ci, dont 9 sur le poisson, dont 6 le vendredi »

Ça ne dit pas seulement qu'il y a eu des ruptures — ça dit que **l'approvisionnement du jeudi est
sous-dimensionné**. Même mécanisme que `cancel_reason` structuré (§16.4) : catégoriser rend
analysable.

Et ça alimente directement le **chantier de prévision** (prochain de la roadmap) : un historique de
ruptures horodatées est exactement ce qu'un moteur de suggestion sait exploiter.

#### Périmètre V1

Livrer d'abord `batch_depleted` et `ingredient_shortage` (un plat, une décision) ; le cas
**transversal** ensuite (décision groupée sur plusieurs plats → UI plus complexe). Mais la structure
`service_alerts` doit être prévue **dès le départ pour les trois**, sinon elle est à refaire.

### 16.11 File de récupération : resservir un plat prêt non retiré

> ⚠ **Découpage V1 / Post-V1 (3ᵉ revue)** : la revue recommandait de retirer ce mécanisme de la V1
> (risque juridique, socle cuisine non validé terrain). **Nuance retenue** — ce n'est pas la *file*
> qu'il faut retirer, c'est la **remise en vente** :
>
> | Élément | Phase |
> |---|---|
> | **Enregistrement** de la perte (`consumed_at` sans `sale_id`) | ✅ **V1** — c'est la 4ᵉ métrique (§8), coût nul, aucun risque |
> | **Remise en vente** d'un plat récupéré | ⏸ **Post-V1** — décision sanitaire, à valider terrain d'abord |
>
> Mesurer une perte n'engage rien ; proposer de resservir engage une responsabilité.
>
> ⛔ **Retiré du périmètre V1** : le champ **`resale_window_min`** et **tout libellé « récupérable »**
> dans l'UI. En V1, un plat prêt non retiré est **une perte, point** — sans suggestion, sans compteur,
> sans vocabulaire laissant entendre qu'il est réutilisable. À revoir après validation terrain et
> juridique.

Concept absent du plan **et** des POS examinés. Il ne s'agit **pas** d'un retour (impossible, §15.1)
mais d'une **fenêtre de rattrapage avant que la perte devienne définitive**.

```
plat ready → non retiré (client parti, erreur, refus)
   → file d'attente horodatée
      ├─ resservi à un autre client avant resale_window_min → récupération, perte évitée
      └─ délai dépassé                                      → jeté, perte assumée
```

Élégance du mécanisme : il **réutilise le modèle existant**. La matière est déjà décrémentée (à
`ready`, §6), donc resservir ne redécrémente rien — il n'y a **que la vente** à créer. C'est
exactement la métrique de perte du §8 (`consumed_at IS NOT NULL AND sale_id IS NULL`), avec une
possibilité d'annulation.

**Périmètre** : `on_order` et `batch_finish` uniquement (plats finis). Sans objet pour `batch` (la
portion non servie reste dans le lot).

#### ⚠ Trois garde-fous obligatoires

**1. L'app enregistre, elle ne suggère JAMAIS.** Resservir un plat passé en salle est encadré par la
réglementation sanitaire et peut être mal perçu par un client. Si l'app **proposait** activement de
resservir, elle porterait une part de responsabilité dans la décision. Elle doit donc être un outil
de **traçabilité**, pas de conseil. La nuance est mince et elle est essentielle.

**2. Le délai est par plat** (`resale_window_min`), pas une constante : un riz gras et un poisson
grillé n'ont pas la même tolérance. Réserve : un champ de configuration mal rempli est un champ
inutile — prévoir un défaut par catégorie.

**3. La remise en vente est validée par le gérant ou le serveur, pas par le cuisinier seul.** Le
cuisinier voit l'état du plat et le **signale** récupérable ; la décision sanitaire appartient à qui
en porte la responsabilité.

#### ⭐ Coût matière de la ligne récupérée = 0

Un plat resservi a **deux clients** dans l'historique : celui qui l'a commandé (n'a pas payé) et
celui qui le consomme (paie). Traitement retenu :

- **nouvelle ligne** rattachée au nouveau ticket (l'addition doit être juste), avec
  `recovered_from_item_id` pointant vers l'originale (traçabilité du premier client préservée) ;
- **`computed_cost = 0`** sur la ligne récupérée — la matière a déjà été imputée à la première.

Sans cette mise à zéro, **le même coût matière serait compté deux fois** : la marge du plat récupéré
paraîtrait nulle alors qu'elle est totale. C'est la condition pour que la métrique de marge (§8)
reste juste.

### 16.12 Sous-recettes : de « écartées » à `dish_recipe_components` minimal en V1

§17 reconnaissait la contradiction : écarter les sous-recettes oblige à dupliquer les mêmes
ingrédients dans 10 plats — précisément la saisie identifiée comme **principal coût d'adoption**.

Dans la cuisine ouest-africaine, sauces, marinades, bouillons et bases se répètent
systématiquement. Forcer 10 plats à redéclarer « sauce tomate maison » alourdit la saisie **et**
crée des divergences de coût entre plats censés partager la même base.

**Position corrigée** : pas un moteur de production complet, mais **`dish_recipe_components` minimal dès
la V1** — un plat peut inclure une base réutilisable avec une quantité. La base est elle-même une
recette, dont le coût unitaire remonte dans les plats qui la référencent.

Limite V1 : **un seul niveau d'imbrication** (une base ne peut pas contenir une autre base), pour
éviter la récursion de coût.

---

### 16.13 ⭐⭐ Valorisation des ingrédients : FIFO/FEFO, pas CUMP

**Décision** : les **ingrédients** sont valorisés en **FIFO** (`ingredient_lots`) ; les **boissons**
gardent le **CUMP** inchangé.

#### Pourquoi deux méthodes dans la même application

**SYSCOHADA autorise les deux** — CUMP (en deux variantes) et FIFO/PEPS. Mon objection initiale
(« le CUMP est *la* méthode conforme, en sortir créerait une incohérence ») était **factuellement
fausse**.

Et il s'agit de **natures de stock différentes**, ce qui rend la coexistence légitime :

| Stock | Nature | Comptes | Méthode |
|---|---|---|---|
| Boissons | marchandises revendues en l'état | `601` / `701` | **CUMP** |
| Ingrédients | matières premières transformées | `602` / `702` | **FIFO/FEFO** |

⚠ **À documenter en annexe comptable** : deux méthodes dans un même bilan est autorisé, mais doit
être **déclaré**.

#### Coût de migration : nul

Les **102 occurrences** de `current_average_cost` dans **25 migrations** + 10 fichiers TS concernent
`bar_products`. La table `ingredients` est **neuve** → aucune reprise de données, aucun code existant
touché. Le durcissement de la vague 4c n'est pas rouvert.

#### Les deux arguments décisifs

**1. Le FIFO décrémente au coût d'achat réel** — un lot identifié, une facture précise, pas une
moyenne. La charge et l'inventaire restant correspondent aux prix effectivement payés.

**2. ⭐ Il est la SEULE méthode qui permette de gérer la péremption.** C'est l'argument le plus fort,
et il est spécifique aux ingrédients : ce sont des **denrées à courte durée de conservation**.

| Capacité | Impossible en CUMP | Valeur pour le promoteur |
|---|---|---|
| « Ce poisson expire demain » | pas de dates, tout est fondu | consommer avant de perdre |
| Lot périmé → perte valorisée | — | chiffrer ce que la péremption coûte |
| Historique de pertes par ingrédient | — | « vous perdez 8 % de vos tomates » → achats surdimensionnés |

Même logique que `service_alerts` (§16.10) et `cancel_reason` (§16.4) : **catégoriser rend
actionnable**.

#### La périssabilité résout l'objection « le FIFO valorise à un prix périmé »

Objection initiale : le FIFO valorise au prix du plus **ancien** lot, donc potentiellement périmé
(tomate à 300 F le mois dernier, 1200 F cette semaine → alloco valorisé à 300 F, marge affichée
trompeuse).

**Cette objection ne s'applique pas aux denrées fraîches** : le cas suppose un stock ancien coexistant
avec un achat récent, ce qui **ne se produit pas** quand la conservation est de quelques jours. Le lot
le plus ancien a été acheté hier ou avant-hier.

→ **Pour les ingrédients frais, le FIFO converge naturellement vers le prix du jour.** L'objection
était structurellement valide mais **quantitativement négligeable** ici.

**Conséquence, qui simplifie** : la « double marge » (réalisée FIFO + prix du jour) que j'avais
proposée devient **redondante**. Un écart de quelques pour cent ne justifie pas deux indicateurs
permanents — ce serait de la complexité pour un gain nul, et un écran plus confus.
→ **Une seule marge, au FIFO**, qui est de fait la marge actuelle. L'**alerte de dérive** garde son
sens (elle signale un saut de prix), le second indicateur permanent non.

#### FEFO, pas FIFO strict

L'ordre de consommation doit être **« premier expiré, premier sorti »** :

```sql
ORDER BY expires_at, received_at   -- ⭐ et non received_at seul
```

Identique dans ~95 % des cas, mais pas toujours : un lot acheté plus tard peut expirer plus tôt selon
sa fraîcheur à l'achat. **En cuisine, c'est la date de péremption qui commande**, pas la date d'achat
— c'est aussi une obligation sanitaire.

#### ⚠ Le stock négatif : lot de régularisation

Conflit à résoudre : le plan pose que le stock d'ingrédients est **jamais bloquant** (§4.4). En CUMP un
stock négatif garde son coût moyen ; **en FIFO, consommer un lot qui n'existe pas n'a aucune
définition** — à quel prix ?

**Solution** : un **lot de régularisation** créé automatiquement (`is_regularization = true`),
valorisé au **dernier prix connu**, et **marqué comme anomalie — jamais silencieux**.

Ainsi la règle « jamais bloquant » est préservée **et** le FIFO reste honnête : l'écart devient
**visible** au lieu d'être absorbé, et il alimente directement l'écart théorique/réel (§8).

#### ⚠ Réserve : quatre niveaux de valorisation en cascade

```
ingredient_lots → production_batches → portions → ligne de vente (computed_cost)
```

Le calcul sera **juste**, mais le risque est la **traçabilité mentale**. Quand un promoteur demandera
« pourquoi mon riz sauce coûte 340 F et pas 310 », il faut pouvoir remonter la chaîne.

**Un écran de détail du coût est obligatoire dès le départ** — un calcul juste mais opaque est presque
aussi problématique qu'un calcul faux, parce qu'il n'est pas cru.

---

## 17. Points de vigilance

**Ce qui peut mal tourner :**

1. **Le piège de la fausse précision.** Modéliser l'huile au gramme produira des recettes que
   personne ne remplira. Tolérer l'approximation sur le transversal, être précis sur le
   structurant (viande, poisson, riz).
2. **La saisie initiale des recettes** est le vrai coût d'adoption, pas la technique. 30 plats ×
   8 ingrédients = 240 saisies. Sans import assisté, le module restera vide. À traiter comme une
   fonctionnalité, pas un détail d'onboarding.
   *(Réserve : l'idée de recettes-types béninoises pré-remplies n'est étayée par aucune donnée
   terrain ; les recettes varient fortement d'un bar à l'autre, et un catalogue mal calibré peut
   nuire plus qu'aider.)*
3. **Ne pas dupliquer le ticket.** Créer un `restaurant_orders` autonome est plus simple à coder
   mais produirait deux systèmes de commande concurrents — donc deux additions pour une table.

**Faiblesses assumées de cette réflexion :**

- ~~`is_transversal` binaire~~ → **résolu en §16.3** : typologie `cost_mode` à 4 niveaux, dont
  `per_dish_flat` pour l'huile de friture.
- ~~Sous-recettes écartées~~ → **résolu en §16.12** : `dish_recipe_components` minimal dès la V1, un seul
  niveau d'imbrication.
- ~~`7021` non confirmé par une source normative~~ → **tranché en §10** : `7021` est un code de
  **ventilation géographique** (« produits finis dans la Région »), donc détourné. Nomenclature
  retenue : comptes à **3 chiffres** (`601`/`701` bar, `602`/`702` cuisine, `603`, `6052`).
- **Reste ouvert : 3 questions à un comptable OHADA (§10)** — validation de `701`/`702`,
  personnalisation des sous-comptes à 4 chiffres, et **déclaration en annexe de la coexistence
  CUMP + FIFO** (§16.13). Plus un **correctif en attente** sur `7011`/`6011` en production,
  volontairement **non appliqué** faute de source normative.

---

## 18. Ce qui a été corrigé en cours de réflexion

Traçabilité des erreurs redressées, pour ne pas les refaire :

| Affirmation initiale | Correction |
|---|---|
| « Le ticket est exactement l'objet commande » | Faux : `pay_ticket` ne crée aucune vente. Le ticket est l'**addition** (regroupement de ventes déjà créées) |
| « Le cuisinier ne peut pas refuser » | Trop rigide : un plat devient infaisable *après* commande (rupture). Refus autorisé avant `preparing`, sans conséquence comptable |
| « La vente de plat naît au statut `ready`, en `pending` » | La vente naît au **retrait par le serveur** (`served`) et naît **`validated`** : le double constat cuisinier/serveur remplace la validation gérant |
| « Le sélecteur de portée doit être masqué sur l'onglet Commandes » | Faux : c'est là que la portée Cuisine a le plus de sens (supervision de production) |
| « Renommer *Gestion Commandes* pour lever l'homonymie » | Devenu inutile : l'onglet contient réellement commandes cuisine + validations. C'est l'onglet cuisine qui est renommé **Service** |
| « Rôle cuisinier : risque très faible » | **Élevé** : 56 fichiers, 17 migrations, 30 permissions |
| « L'inventaire physique est optionnel (phase 4) » | **Obligatoire** : sans lui, la « marge précise » vendue est fausse |
| Plafond `maxMembers` non vu, puis qualifié de blocage imposant de réserver le module à Pro/Max | **Faux blocage** : un petit resto (promoteur + cuisinier + serveur, avec ou sans gérant) tient dans Starter. Erreur de généralisation depuis le cas le plus gros (§12.1) |
| « Le plat doit être un `bar_product` pour bénéficier des promotions » | **Faux** : les promotions ciblent des `UUID[]` **sans FK**. L'argument principal de l'héritage reposait sur une hypothèse non vérifiée → `dishes` autonome (§4.5) |

### Corrections issues de la revue externe (30/07/2026)

| Point soulevé | Traitement |
|---|---|
| **Séquençage phase 3/4 incohérent** : le RPC de consommation en phase 4 alors que la vente naît avec décrément atomique | ✅ **Accepté** — `serve_kitchen_item` déplacé en phase 3 (§14). Erreur réelle : la décision §6 a été prise après l'écriture du séquençage, sans le corriger |
| **Divergence `kitchen_orders.status` / `kitchen_order_items.status`** | ✅ **Accepté** — statut canonique sur la ligne, parent dérivé (§4.3) |
| **`bar_id` manquant sur les tables cuisine** | ✅ **Accepté** — ajouté, conforme à la convention multi-tenant du projet (§4.1) |
| **Items de vente à typer (`item_type`)** | ✅ **Accepté**, avec correction factuelle : il n'existe **pas** de table `sale_items` — `sales.items` est du **JSONB sans FK**. Le risque est donc *plus* élevé (échec silencieux, pas erreur SQL) → §4.2 |
| **`pay_ticket` plus fragile qu'annoncé** (propage `payment_method` aux ventes) | ✅ **Accepté** — le garde-fou passe de « à ajouter » à **prérequis bloquant** (§5) |
| **Rôle cuisinier : protéger par permission, pas par rôle brut** | ✅ **Accepté** — livrables de phase 0 formalisés (§12.5) |
| **Offline : idempotence par transition, `serve` le plus durci** | ✅ **Accepté** (§11) |
| **Vue par table dans le Service** | ✅ **Accepté** — regroupement par `table_number` obligatoire, sans plan de salle graphique (§9) |
| **`ScopeSwitcher` : « filtrage client obligatoire » trop rigide** | ✅ **Accepté** — règle reformulée en « zéro refetch au changement de portée » (§9) |
| **Positionnement produit phase 2** | ✅ **Accepté** — « costing cuisine », pas « gestion restauration » (§14) |

### Correction post-revue : moment du décrément (30/07/2026)

| Affirmation | Correction |
|---|---|
| « Vente **et** décrément dans la même transaction, au retrait (`served`) » | **Faux sur le fond** : un plat marqué `ready` a été **cuit**, donc la matière est consommée définitivement. Un plat `ready` puis annulé ne décrémentait rien alors qu'il avait coûté → l'écart théorique/réel était faussé **dans le mauvais sens** (consommation connue comptée comme gaspillage invisible) |

**Modèle corrigé** : décrément + snapshot du coût à **`ready`** (charge engagée), création de la
vente à **`served`** (produit constaté). Deux faits comptables distincts, deux RPC idempotents
(§11). Gains : les pertes cuisine deviennent **attribuables** (§8), et `mark_ready` remplace `serve`
comme RPC le plus sensible — **aucun RPC ne touche plus au stock et au CA simultanément**.

> Origine : remarque métier du fondateur. Deuxième fois qu'une intuition terrain corrige une
> décision prise pour des raisons techniques (la première : la validation gérant inutile pour les
> plats, §6).

### Audit interne du plan (30/07/2026) — 7 failles

Audit systématique du plan contre le code, à la recherche des raisonnements **par analogie** non
vérifiés. Détail complet en **§15**.

| # | Faille | Gravité | Nature de l'erreur |
|---|---|---|---|
| 13.1 | Retour de plat impossible (FK `NOT NULL`) | ⛔ Bloquante | Trou métier non vu |
| 13.2 | `target_type = 'all'` promeut les plats | ⛔ Bloquante | Vérification partielle (§4.5 surestimé) |
| 13.3 | Magic Swap incompatible | Majeure | Flux existant ignoré |
| 13.4 | `business_date` : charge ≠ produit | Majeure | **Introduite par la correction précédente** |
| 13.5 | Price guard : duplication à assumer | Majeure | Contradiction avec §3 non mesurée |
| 13.6 | `CHECK >= 0` sur ingrédients | Modérée | Piège de mimétisme |
| 13.7 | Mode simplifié et cuisine | Mineure | Cohérence affirmée non vérifiée |

### Seconde revue externe (30/07/2026) — test « service réel »

12 points soulevés, sur une **version antérieure** du plan. Tri après vérification ligne par ligne :

| Statut | Points | Détail |
|---|---|---|
| **Déjà traités** | 1, 2, 3, 11 | Le point 1 (« la vente naît trop tard ») **recommandait exactement la décision déjà prise** en §6 — matière à `ready`, CA à `served` |
| **Intégrés** | 4, 5, 6, 7, 8, 9, 12 | → §16 |
| **Écarté** | 10 (rôle « chef cuisine ») | Un 2ᵉ rôle doublerait le coût du §12.5 (56 fichiers, 17 migrations) pour un besoin non confirmé. La distinction est déjà servie par des **permissions** séparées (`canManageIngredientStock` ≠ `canViewKitchenOrders`) |

### Question du fondateur : vente combinée sans bon (30/07/2026)

« Une vente boisson + plat est-elle possible sans passer par un bon ? »

Cas **jamais examiné** par le plan, alors que la vente sans bon est le comportement **par défaut**
de l'app (`sales.ticket_id` nullable, `p_ticket_id DEFAULT NULL`). Le modèle rattachait pourtant la
commande cuisine au ticket (§4.1) — sans bon, un plat en préparation n'aurait **aucun support**.

Résolu en **§16.7** : bon implicite créé dès qu'un plat entre dans le panier, toutes lignes
rattachées (addition non fragmentée).

### ⭐⭐ Quatre régimes de production — le manque le plus important (31/07/2026)

La question précédente a ouvert un fil qui a révélé **l'angle mort le plus grave du plan** : il
supposait que **tout plat est préparé à la commande**, alors que c'est le cas **minoritaire** dans un
maquis béninois.

Trois précisions successives du fondateur ont construit le modèle :

| Apport | Régime révélé |
|---|---|
| « Un beignet déjà cuit n'a ni production ni délai » | `precooked` — et **seul régime où le retour est possible** |
| « Le riz dans la glacière, la sauce dans le plateau : à la commande, plus rien n'est préparé » | **`batch`** — la matière est consommée **à la cuisson du lot**, ni à la commande ni au service |
| « Le spaghetti bouilli au frigo, le poulet bouilli en lot, puis on finalise à la commande » | **`batch_finish`** — matière consommée **en deux temps** (lot + finition) |

Le modèle final tient sur **deux axes** (matière issue d'un lot ? commande déclenchant une
production ?) dont les 4 combinaisons donnent les 4 régimes — ce qui garantit qu'il n'y a **pas de
cinquième cas caché**. Détail en §16.8.

Trois conséquences non anticipées :
1. **Piège du double comptage** : décrémenter les ingrédients à chaque portion de `batch` servie
   compterait deux fois la matière consommée le matin. Le service ne touche que `remaining_qty`.
2. **`cost_mode = per_dish_flat` (§16.3) trouve ici sa justification la plus nette** : l'huile de
   friture appartient à la **finition**, pas au lot. Deux corrections indépendantes se rejoignent.
3. **Correction de séquençage** : j'avais proposé de reporter les lots en phase 4-5 ; avec
   `batch_finish`, les deux régimes de lot couvrent la majorité de ce qu'un maquis vend réellement →
   **phase 3 obligatoire**, sinon périmètre invendable.

### Flexibilité de configuration et alertes de service (31/07/2026)

Deux apports du fondateur sur le même fil :

| Remarque | Correction |
|---|---|
| « Chaque maquis a sa spécificité pour un même plat, 2 régimes différents peuvent être adoptés » | **Normativité fausse retirée** (§16.8) : la doc installait « grillades → `on_order` », « plats du jour → `batch` » comme s'il existait une bonne réponse par plat. Le modèle le permettait déjà (`dishes` est par bar) — c'était la documentation qui était en tort. Simplification au passage : **3 choix pour le promoteur**, `batch`/`batch_finish` étant **déduit de la recette** |
| « Config explicite préalable + basculement automatique au fil de la journée » | **§16.9** : le régime déclaré est une *intention*, `remaining_qty` un *fait*. Lève une imprécision de ma réponse (« bascule sans rien demander ») : l'app bascule le **mécanisme** seule, mais **jamais la disponibilité** — lot épuisé ≠ plat encore produisible, et le stock d'ingrédients ne peut pas servir de garde-fou puisqu'il est *jamais bloquant* (§4.4) |
| « Donner la possibilité entière au restau de décider : retirer le plat, approvisionner, cuire par lot, préparer à la commande… » | **§16.10 `service_alerts`** — généralisation : le basculement de régime n'était qu'un cas particulier. 3 déclencheurs × 5 résolutions, l'app **détecte et propose**, l'humain **tranche**. Le cas **transversal** (gaz, huile) justifie la généralisation : c'est une décision de **carte**, pas de plat |

Bénéfice non anticipé : l'historique des alertes résolues (« 9 ruptures sur le poisson, dont 6 le
vendredi ») alimentera le **chantier de prévision**, prochain de la roadmap.

### Valorisation des ingrédients : FIFO retenu contre le CUMP (31/07/2026)

Question du fondateur : *« les prix des ingrédients varient beaucoup selon les périodes, le CUMP est-il
la bonne métrique ? »*

**Mon objection principale était factuellement fausse** : j'avais affirmé que le CUMP était *la*
méthode conforme SYSCOHADA et qu'en sortir créerait une incohérence comptable. **SYSCOHADA autorise
les deux** (CUMP en 2 variantes, et FIFO/PEPS). L'obstacle réglementaire n'existait pas.

| Objection initiale | Sort |
|---|---|
| « Le CUMP est la méthode conforme SYSCOHADA » | ❌ **Faux** — les deux sont autorisées |
| « Coût de migration massif (102 occurrences, 25 migrations) » | ❌ **Sans objet** — le fondateur visait les **ingrédients seuls** ; `ingredients` est une table **neuve** |
| « Le FIFO valorise à un prix périmé » | ❌ **Négligeable** — les ingrédients sont **périssables à courte durée**, donc le FIFO **converge vers le prix du jour** |
| « Conflit avec stock jamais bloquant » | ✅ **Valide** → résolu par le **lot de régularisation** |

**Argument décisif, que je n'avais pas identifié** : le FIFO est la **seule méthode qui permette de
gérer la péremption**. Le CUMP, sans dates, ne peut ni alerter avant expiration, ni valoriser une
perte, ni historiser les pertes par ingrédient. Sur des denrées à courte durée, ce n'est pas un
détail — c'est un poste de perte structurel (→ 5ᵉ métrique, §8).

**Simplification obtenue** : la « double marge » (réalisée FIFO + prix du jour) que j'avais proposée
devient **redondante** puisque le FIFO ≈ prix du jour sur denrées fraîches. Une seule marge, un écran
plus simple. L'alerte de dérive suffit pour signaler un saut de prix.

**Raffinement ajouté** : **FEFO** plutôt que FIFO strict (`ORDER BY expires_at, received_at`) — en
cuisine c'est la date de péremption qui commande, pas la date d'achat.

### Inventaire physique et ajustements : structure manquante (31/07/2026)

Question du fondateur : *« as-tu prévu l'inventaire physique avec ajustement de stock pour divers
motifs ? »*

**Réponse honnête : le principe oui, la structure non.** §16.5 posait le rythme et les motifs en
**prose**, sans table ni énumération — donc rien d'implémentable. Et §8 posait l'obligation trois fois
sans jamais décrire le mécanisme.

Vérification faite, **le mécanisme existe déjà pour le bar** :
[`stock_adjustments`](../../supabase/migrations/20260118000001_create_stock_adjustments_table.sql) —
6 motifs contraints, `old_stock`/`new_stock`/`delta`, audit complet, et un
`CONSTRAINT notes_required_for_other`. Il n'y avait rien à inventer, seulement à **calquer**.

Trois adaptations imposées par le modèle cuisine, que le simple calque n'aurait pas données :

| Point | Raison |
|---|---|
| **Pas de `CHECK >= 0`** sur les quantités | Le stock d'ingrédients est *jamais bloquant* (§4.4) et peut être négatif (§15.6) — la contrainte du bar ferait échouer l'ajustement |
| ⭐ Ajustement porté par le **lot** (`ingredient_lot_id`) | En FIFO/FEFO (§16.13), sans lot désigné **la perte n'est pas valorisable**. Défaut : le lot le plus proche de l'expiration |
| ⚠ `expiration` **doit créer** l'ajustement, pas coexister | La péremption automatique de lot (§16.13) et le motif manuel `expiration` mesurent **la même perte** → sinon **comptée deux fois** |

Observation utile : le motif existant `donation_sample` couvre le **repas du personnel** — poste réel
et souvent invisible en maquis. L'énumération du bar était plus adaptée à la cuisine que prévu.

### ⛔ Nomenclature SYSCOHADA : `7021` détourné, `7011` l'était déjà (31/07/2026)

Vérification du dernier point ouvert du plan, contre le
[référentiel OHADA](https://plan-comptable-ohada.com/nouvelle-norme-2016/compte/70.html) (AUDCIF 2017).

**Résultat : le point est tranché, mais pas dans le sens du plan.** `7021` **existe** officiellement
et signifie « produits finis vendus **dans la Région** » — les sous-comptes à 4 chiffres du compte 70
sont réservés à une **ventilation géographique**, pas à une nature de produit.

**Et la même erreur est déjà en production** : `7011` (« Ventes de Boissons ») signifie officiellement
« ventes de marchandises dans la Région ». L'erreur n'a **pas** été introduite par le module
restauration — elle est dans le code depuis l'origine.

| Ce que j'affirmais | Réalité |
|---|---|
| §1 : `7011`/`6011` = « investissement minime, **bien choisi** » | ⛔ **Erreur de nomenclature**, pas préparation |
| §10 : `7021` = « Ventes de repas » | ⛔ Code de **ventilation géographique** détourné |
| La *logique* boissons (marchandises) / repas (produits finis) | ✅ **Juste** — c'est ce que SYSCOHADA prescrit |

**Nomenclature retenue** : comptes à **3 chiffres** (`601`/`701` bar, `602`/`702` cuisine, `603`,
`6052`). Le détail « Boissons »/« Repas » devient un **libellé applicatif**, jamais un code comptable.

**Décision assumée : le code en production n'est PAS corrigé.** Ma source est un référentiel en ligne,
pas un avis professionnel ; l'erreur produit un export *inhabituel*, pas un calcul faux (les montants
sont justes, l'étiquette est mauvaise) ; et rien n'est urgent. Corriger sur cette base, dans un module
comptable en production, serait prendre un risque pour gagner peu. Correctif documenté en §10, à
appliquer après validation.

**Enseignement** : cette vérification a été faite **parce qu'une réserve avait été écrite** et
maintenue visible pendant tout le cadrage. Sans elle, `7021` serait passé en implémentation. Écrire ses
doutes fonctionne — à condition de finir par les lever (cf. enseignement 5 : « une faiblesse admise
mais non corrigée reste une faille »).

Apports les plus précieux :
- **§16.1 `service_mode`** — angle mort **total** : 0 occurrence d'« emporté » dans 1323 lignes.
  Ni la contre-analyse, ni la 1ʳᵉ revue, ni l'audit §15 ne l'avaient vu. Et il **invalidait** le
  garde-fou `pay_ticket` (§5) pour la vente à emporter.
- **§16.3 `cost_mode`** — meilleur que l'analyse initiale : §17 admettait que `is_transversal` était
  trop binaire **sans en tirer de conséquence**. L'argument décisif manquait : c'est un **biais
  systématique** (marge des plats frits sous-estimée, mijotés surestimée), donc le classement des
  plats par rentabilité — livrable de la phase 2 — serait faux.

**Enseignements méthodologiques** :
1. **13.1, 13.3 et 13.4 ont la même origine** : le flux de vente a été analysé sans ses satellites
   (retours, échanges, journée comptable). Toute décision sur le flux principal doit désormais être
   testée contre ces trois-là.
2. **13.4 est née d'une correction** — améliorer un point (dissocier matière et CA) a créé une
   incohérence ailleurs (deux journées comptables possibles). Chaque correction doit être re-auditée.
3. **13.2 montre le coût d'une vérification partielle** : avoir lu `target_product_ids` sans lire
   `target_type` a produit un argument surestimé dans une décision structurante.
4. **Un audit technique ne remplace pas un test métier.** Le §15 a été mené contre le code et a
   trouvé 7 failles ; il n'a trouvé **aucun** des 7 manques du §16, parce que ceux-là ne sont
   visibles qu'en simulant un service réel (un client qui emporte, un plat frit, une sauce de base
   partagée). Les deux angles sont nécessaires.
5. **Une faiblesse admise mais non corrigée reste une faille.** `is_transversal` et les
   sous-recettes étaient tous deux signalés en §17 comme « à reconsidérer » — et sont restés en
   l'état jusqu'à ce qu'un tiers en démontre l'impact. Documenter un doute ne le résout pas.

---

### ⭐⭐ 3ᵉ revue externe (31/07/2026) — cohérence interne

**La plus utile des trois.** Les deux précédentes cherchaient des oublis métier ; celle-ci attaque la
**cohérence interne du plan**. Et son diagnostic central est juste : *« le modèle est devenu plus juste
métier, mais il n'est pas encore stabilisé techniquement »*.

#### 5 contradictions internes confirmées — de ma responsabilité

| Endroit | Texte fautif | Origine |
|---|---|---|
| §4.4 | « `computed_cost` figé **à la commande** » | avant la dissociation `ready`/`served` |
| §5 (schéma) | « vente créée **+ ingrédients décrémentés** » à `served` | idem |
| §7 | « vente et décrément devenant **simultanés** » | idem |
| §16.3 | `direct` → « au **CUMP** » | avant le passage au FIFO |
| §16.8 | formule `batch_finish` → « × **CUMP** » | idem |

**Ces contradictions ne sont pas des étourderies.** Chaque correction a été appliquée *localement* sans
rebalayer le document — exactement le risque que j'avais moi-même inscrit en enseignement
méthodologique (« chaque correction doit être re-auditée ») et que **je n'ai pas appliqué**.

#### Points acceptés sans réserve

| Point | Traitement |
|---|---|
| `paid` ne signifie plus « terminé » | ✅ §6.3 — séparer `payment_status` / `fulfillment_status` (`tickets.status` n'a qu'un axe, vérifié) |
| ⛔ **Trou financier** : plat prépayé puis annulé | ✅ §12.4.b — **manque non vu** lors de l'assouplissement de §16.2. Argent encaissé sans contrepartie ni restitution |
| `precooked` techniquement orphelin | ✅ §12.4.c — ni stock (`dishes` n'en a pas) ni retour (`returns.product_id` → `bar_products`) → **reporté Post-V1** |
| `recipe_components` mélange modèle et instance | ✅ §12.4.d — séparer `dish_recipe_components` / `kitchen_item_batch_consumptions` |
| Lot de régularisation ne se résorbe pas | ✅ §12.4.e — un appro compense d'abord les régularisations, écart de prix tracé |
| `current_stock` dérivé **ou** colonne ? | ✅ §12.4.f — à trancher explicitement |
| `promotion_applications.product_id NOT NULL` | ✅ §15.2 — vérifié ; mon point ne couvrait que le **ciblage**, pas la traçabilité |
| Phase 3 trop grosse | ✅ §14 — découpée **3A / 3B / 3C** (l'ancien 3B — emporté — est sorti de la V1) |
| Bon implicite doit exclure `batch`/`precooked` | ✅ §16.7 — critère corrigé : « une ligne **crée un délai** », pas « un plat entre dans le panier » |
| ⭐ **Machine d'état manquante** | ✅ **§6** — le livrable qui explique *mécaniquement* les 5 contradictions |

#### Points ajustés plutôt qu'adoptés

| Point | Ma position |
|---|---|
| Deux `business_date` (opérationnelle + comptable) | ⚠ **Non** : deux sources de vérité temporelle = rapports qui cessent de s'accorder. **Une seule** `business_date` comptable (§15.4) ; `ready_at`/`served_at` restent lisibles comme horodatages bruts (§6.6) |
| Retirer la file de récupération de la V1 | ⚠ **Nuancé** : retirer la **remise en vente** (Post-V1), garder l'**enregistrement** de la perte en V1 — coût nul, aucun risque, c'est la 4ᵉ métrique (§16.11) |
| Motifs de correction de vente spécifiques cuisine | ✅ Retenu sur le fond (`cancel_sale` ne couvre pas remboursement / geste commercial / plat offert) — à intégrer avec §12.4.b, même sujet |

#### Motif systématique révélé

Troisième table où **« produit » signifie implicitement `bar_products`** : `sales.items` (§4.2),
`returns.product_id` (§15.1), `promotion_applications.product_id` (§15.2). **À traiter comme un motif,
pas trois cas isolés** — tout `product_id` sans FK doit être audité avant la phase 3A.

#### ✅ Les six décisions tranchées le 31/07/2026 — §12.4

| # | Décision | Raison qui a tranché |
|---|---|---|
| a | `fulfillment_status` **nullable** plutôt que refonte de `tickets.status` | `NULL` = bar pur inchangé (§3) ; additif, **aucune migration de `CHECK`** en production |
| **b** | **Remboursement espèces OU substitution** — au choix du **client** | Décision du fondateur : le système enregistre, il n'impose pas. ⚠ `cash_refund` = **sortie de caisse** à contrôler comme une annulation de vente |
| c | `precooked` **reporté Post-V1** | **Erreur de catégorisation** de ma part : stock dénombrable + retour + aucune production = c'est un `bar_product`, pas un plat. Le besoin est **déjà couvert** en V1 → V1 à **3 régimes**, et le blocage §15.1 (retour) **disparaît** |
| d | `dish_recipe_components` / `kitchen_item_batch_consumptions` | `unit_cost` n'a de sens que sur l'**instance**. Une recette porte une quantité, pas un prix — un coût *nullable* dans une table de modèle signalerait la confusion |
| e | L'appro **solde d'abord** les régularisations, écart de prix tracé, lot **clôturé** (jamais supprimé) | Supprimer perdrait la trace de l'anomalie — précisément le signal qu'on voulait rendre visible |
| f | `current_stock` = **colonne cache** écrite uniquement par les RPC | Pattern **déjà validé** par la vague 4c : `current_average_cost` est écrit par les RPC et **jamais par un trigger**, parce que **deux écrivains créent des divergences** |

**Effet de bord favorable de (c)** : le blocage bloquant §15.1 (retour de plat impossible par la FK
`returns.product_id`) **tombe en V1** — le seul cas légitime était `precooked`, désormais traité comme
produit. La FK ne redeviendra un obstacle que Post-V1.

#### ✅ Dernier arbitrage : périmètre des promotions (§15.2)

**Décision : `'all'` = boissons uniquement**, les plats exigent un ciblage explicite.

Ce qui a tranché — **le principe de moindre surprise ne joue que dans un sens** :

| Erreur possible | Conséquence |
|---|---|
| Plats remisés **sans que le promoteur le veuille** | ⛔ perte d'argent **invisible** |
| Plats **non** remisés alors qu'il le voulait | ✅ constaté aussitôt, corrigé |

→ L'erreur par défaut doit être **celle qui ne coûte rien**. Et cette lecture est **rétrocompatible à
100 %** : les promotions existantes ont été créées par des bars purs, où `'all'` a toujours signifié
« mes boissons ».

Trois conséquences : catégories **non mixtes** (`bar_categories.type`), nouveau `target_type`
`'dish'`, et **alerte de marge minimum** sur les plats — parce qu'une remise de 10 % est indolore sur
une bière mais **vend à perte** un plat à 12 % de marge matière.

`target_scope: 'bar'|'kitchen'|'both'`, que j'avais moi-même proposé, est **écarté** : 3 × 3
combinaisons pour un besoin dont rien ne prouve l'existence. Deux promotions distinctes le couvrent.

**Coût pour le promoteur** : un geste en plus s'il veut une promo sur les deux. C'est le seul
inconvénient, à mettre en face de « vendre un plat à perte sans le savoir ».

#### Recommandation finale de la revue, adoptée

> *« Avant d'écrire une migration, produire une machine d'état unique pour ticket,
> kitchen_order_item, production_batch, sale, avec les transitions autorisées et leurs effets
> comptables. »*

C'est **§6**, désormais déclarée **référence unique faisant foi**. Sans elle, chaque correction locale
pouvait contredire une autre section sans que rien ne le signale — ce qui s'est produit 5 fois.

---

## 19. ⭐ Découvertes terrain — 08/08/2026

Trois manques relevés par l'exploitant **après la livraison de la phase 3**, en confrontant le
module à des cas réels de maquis béninois. Aucun n'est un défaut d'implémentation : ce sont des
**angles morts du plan lui-même**.

⚠️ Aucun n'est bloquant. Le module fonctionne, avec des contournements dont le coût est mesurable.
Ils sont notés ici pour être tranchés **après le test terrain complet**, ensemble plutôt qu'un à un.

### 19.1 ⛔ Suppléments — l'accompagnement se recommande

> « Pour un plat comme frites au poulet à 2500, le client demande une portion de frites
> complémentaire sans le poulet. » Puis : « ça peut se constater pour presque tous les plats :
> akassa poisson, akassa poulet, où le client demande une ou plusieurs boules complémentaires. »

**Le plan suppose partout qu'un plat se vend entier.** Le §16 couvre les régimes, les lots, les
pertes — jamais la composition d'une commande. Or au Bénin l'accompagnement se recommande : c'est le
geste normal, pas l'exception.

`kitchen_order_items.modifiers` existe et s'affiche en cuisine, mais **aucun écran ne le saisit**, et
surtout il **ne touche pas au prix** : c'est un texte (« sans piment »), pas un article facturable.

| Contournement | Ce qu'il donne | Ce qu'il coûte |
|---|---|---|
| ⭐ Créer « Boule d'akassa » comme plat à part | coût, marge et statistiques EXACTS · zéro code · **prélève le même lot que les assiettes** (depuis `is_sellable`, cf. note ci-dessous) | deux lignes au ticket · la cuisine ne voit pas le lien avec le plat |
| Le vendre en `bar_product` | — | ⛔ FAUX : compte en portée Bar (cf. §19.2) |

**Recommandation V1 : le plat séparé.** Ce n'est pas un pis-aller — une portion vendue seule EST un
article distinct. Ce qui manque est du confort de saisie et du groupement en cuisine, pas de
l'exactitude.

**Ce qu'il faudrait vraiment** : un article rattaché à une ligne de plat, avec son prix et sa
recette, qui part en cuisine AVEC le plat. Chantier comparable à 3B.1 — table, RPC, saisie au panier,
affichage groupé.

> ### ⭐ LE CONTOURNEMENT S'EST RENFORCÉ — mise à jour du 08/08/2026
>
> `is_sellable` (migration 20260808220000, certifiée) lève la limite qui rendait le plat séparé
> bancal. Avant elle, « Boule d'akassa » devait être **soit** un plat-base produisant un lot,
> **soit** un article de vente — les deux rôles ne cohabitaient pas proprement.
>
> Un seul plat porte désormais les trois rôles :
>
> | Réglage | Ce qu'il apporte |
> |---|---|
> | coché « préparé d'avance » | produit son lot (§16.8) |
> | composant d'« Akassa Poisson » | prélève dans ce lot |
> | `is_sellable = true` | vendable seul, en supplément |
>
> ⭐ **Conséquence** : une boule commandée en supplément prélève dans **le même bac** que celles
> servies dans les assiettes. C'est physiquement juste — le cuisinier puise au même endroit — et le
> coût suit sans double-comptage (cf. correction `batch`, 20260808200000).
>
> ⚠️ Ce qui reste imparfait, et c'est du **confort**, jamais de l'exactitude :
>   · deux lignes au ticket (« Akassa Poisson 1500 » + « Boule d'akassa 200 ») ;
>   · la cuisine ne voit pas le lien entre les deux entrées de la file.
>
> ### ⏸ POURQUOI LE CHANTIER COMPLET N'EST PAS LANCÉ
>
> Il achète du confort de saisie, pas de la justesse. Le lancer avant d'avoir mesuré la gêne réelle
> serait optimiser à l'aveugle — le §16.8 a déjà coûté une correction pour avoir modélisé sans
> terrain (« vente immédiate, aucun passage cuisine »).
>
> **Deux questions à trancher AU SERVICE, pas ici** :
>   1. les serveurs trouvent-ils la seconde ligne pénible, ou naturelle ?
>   2. le cuisinier confond-il les deux entrées, ou fait-il le lien seul ?
>
> Selon les réponses, la correction peut se réduire à un **groupement visuel en cuisine** — sans
> table ni RPC, à une fraction du coût annoncé.

### 19.2 ⛔ Le §12.4.c est FAUX pour un article servi en salle

> « L'akassa n'est pas servi au bar, c'est au restau. Ou bien on le fait passer par la cuisine avec
> comme seul ingrédient lui-même ? »

Le §12.4.c pose qu'un article acheté prêt et revendu en l'état « est un `bar_product`, pas un plat ».
**C'est vrai pour des beignets vendus au comptoir. C'est faux dès que l'article est servi en salle** :
la ventilation Bar/Restau (§9) repose sur `item_type`, qui vaut `'dish'` uniquement si l'article vit
dans `dishes`. Un akassa acheté compterait donc en **Bar** — et le CA restauration serait sous-évalué
d'autant.

⭐ **La solution de l'exploitant est meilleure que celle du plan** : un plat dont la recette compte
**une seule ligne**.

```
ingredient  « Akassa prêt »       unité = boule, acheté 100 F
dish        « Boule d'akassa »    prix 150 F, régime on_order
recette     1 boule, yield_factor 1
```

À `ready`, le FEFO décrémente une boule et fige `computed_cost` à 100 F — marge exacte de 50 F.
L'article compte en **portée Restau**, l'approvisionnement passe par l'écran Ingrédients au prix
réellement payé, et le stock hérite de la **péremption** des lots d'ingrédients.

> ### ⚠️ PORTÉE DE CE MONTAGE — précisée le 08/08/2026
>
> Ce `on_order` à ligne unique vaut pour un accompagnement **TOUJOURS acheté prêt**, jamais produit.
>
> ⛔ **Dès que le bar le PRODUIT, même occasionnellement, ce montage devient faux** : le plat doit
> être un **plat-base `batch`** (coché « préparé d'avance »), et l'origine se déclare sur le LOT via
> `source = 'produced' | 'purchased'` (§19.3, migration 20260808140000). Les deux origines
> coexistent dans une seule file FIFO — c'est l'arbitrage du §19.3.
>
> Garder le montage `on_order` dans ce cas décompterait les ingrédients à chaque portion servie,
> alors que le lot a déjà consommé la matière : **double-comptage**.
>
> ⭐ Distinction pratique : « est-ce que je le fabrique parfois ? » Non → `on_order` à ligne unique.
> Oui → plat-base `batch`, quelle que soit la fréquence.

⚠️ `preparation_time_min` reste NULL : il ne calibre que les alertes de retard, un article sans délai
n'en déclenche aucune.

⚠️ **Coût assumé** : l'article passe quand même par la file de production (« Commencer » puis
« Prêt ») alors qu'on le pose simplement dans l'assiette. C'est ce passage qui décrémente le stock et
fige le coût — deux clics pour la traçabilité.

**→ Le §12.4.c doit être corrigé** : le critère n'est pas « acheté ou produit », c'est **« servi en
salle ou vendu au comptoir »**.

### 19.3 ⚠️ Lot APPROVISIONNÉ — un plat-base parfois acheté, parfois produit

> « Si dans ce même restau par moment on produit de l'akassa, ça fera deux recettes pour un même plat
> ou bien on crée deux plats ? »

Le cas : un maquis **produit** son akassa certains jours (maïs, eau, travail) et **l'achète** d'autres
jours. Même article vendu, deux économies.

`produce_batch` consomme TOUJOURS la recette du plat-base. Un lot acheté n'a pas de recette à
consommer — il a un **prix payé**.

| Contournement | Verdict |
|---|---|
| Deux plats (« maison » / « acheté ») | ✅ coûts exacts, mais statistiques scindées et deux lignes au menu |
| Un plat, recette réécrite selon le jour | ⛔ **DANGEREUX** — un oubli un jour d'achat donne un coût faux, sans aucun signal |

**Recommandation V1 : deux plats.** L'inconvénient est mesurable et même informatif — le promoteur
verra ce que chaque mode lui coûte.

⭐ **Ce qu'il faudrait** : un paramètre optionnel sur `produce_batch` pour déclarer un lot à coût
DIRECT, court-circuitant le FEFO. « J'ai acheté 40 boules à 100 F. » Une migration, un champ dans le
formulaire de production. C'est le plus petit des trois chantiers et le plus rentable.

#### ✅ Le FIFO n'a PAS besoin de distinguer l'origine

> « Doit-on faire du FIFO, chacun décrémentant en fonction de sa nature ? »

**Non — une seule file, et c'est déjà ce que fait le code** (`ORDER BY produced_at ASC`).

La raison est physique : l'akassa acheté à 8h et celui produit à 14h sont dans le **même bac**. Le
cuisinier sert le plus ancien. Chaque assiette prend le coût de SON lot — 100 F ou 60 F — donc le
coût reste exact des deux côtés.

⚠️ Séparer les files supposerait un critère de choix (servir le produit d'abord ? l'acheté ?). Aucun
n'a de sens métier. **Le trou est en amont, à la création du lot acheté — jamais au prélèvement.**

---

## 20. Sources externes consultées

- [Slant POS — ingredient usage tracking](https://blog.slantco.com/how-pos-systems-help-track-ingredient-usage-and-profitability/)
- [Restaurant365 — food inventory management](https://www.restaurant365.com/blog/food-inventory-management/)
- [Toast — KDS overview](https://doc.toasttab.com/doc/platformguide/platformKDSOverview.html)
- [Lightspeed — KDS 2.0](https://k-series-support.lightspeedhq.com/hc/en-us/articles/22708154090267-Using-the-Kitchen-Display-System-2-0)
- [Galley — food costing framework](https://www.galleysolutions.com/blog/food-costing-framework)
- [meez — recipe costing](https://www.getmeez.com/blog/a-chefs-guide-to-accurate-recipe-costing)
- [Plan comptable OHADA — classe 6](https://plan-comptable-ohada.com/nouvelle-norme-2016/classe/6.html)
- [Compte 603 — variation des stocks](https://www.comptabilisation.fr/compte.php?compta_n=603&nom=Variations-des-stocks-approvisionnements-et-marchandises-&i=376)
