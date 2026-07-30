# Plan — Module Restauration

> **Statut** : réflexion de cadrage, aucune implémentation.
> **Date** : 30/07/2026
> **Décisions structurantes** :
> 1. Intégrer au socle existant, ne pas réécrire d'application (§2).
> 2. Le plat est une entité **autonome** (`dishes`), pas un `bar_product` (§4.4).
> 3. La vente d'un plat naît au **retrait par le serveur** et naît **validée** (§7).

---

## 1. Point de départ

Avant cette réflexion, la restauration n'existait que par bribes dans le dépôt, jamais comme
chantier cadré :

| Source | Contenu |
|---|---|
| [.agents/workflows/syscohada_analysis.md](../../.agents/workflows/syscohada_analysis.md) | Section 2 « Le To-Be : Restauration » + section 3.C « Préparation ». La plus substantielle. |
| [PRESENTATION_TECHNIQUE.md](../../PRESENTATION_TECHNIQUE.md) §14.3 | 4 lignes : constat marché + périmètre + posture roadmap |
| [whatsapp-agent/knowledge/prospects.md](../../whatsapp-agent/knowledge/prospects.md) | Consigne commerciale : ne rien promettre sur la cuisine |

Balayage exhaustif effectué : 128 fichiers `.md` du dépôt principal + 65 du dossier
`BarTender_Copie`. Aucun document dédié. Le sujet n'avait jamais été abordé que lorsqu'il
croisait un autre travail.

**Seule trace concrète dans le code** : le plan de comptes est granulaire
(`7011` Ventes de Boissons, `6011` Achats de Boissons dans
[syscohada.types.ts](../../src/services/accounting/syscohada.types.ts)), et non un `701`
générique. Investissement minime, bien choisi : il évite une migration comptable le jour du
lancement.

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
C'est l'inverse : le CUMP valorise un ingrédient **sans modification**, et le décrément
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

Bon découpage : un **nouveau** RPC pour la vente de plat (création de la vente + consommation des
N ingrédients, atomique), à côté de l'existant qu'on ne touche pas. C'est aussi ce qui permet de
tester le module sans risquer une régression sur le cœur du produit.

> C'est la raison technique qui a fait pencher pour `dishes` autonome (§4.4) : avec l'héritage, il
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

---

## 4. Modèle de données

### Principe : le plat est vendable, pas stocké

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
  current_stock          -- en usage_unit (source de vérité)
  current_average_cost   -- CUMP par usage_unit
  is_transversal         -- sel, huile : non décrémenté par recette
  min_stock_alert

dishes
  id, bar_id, name, category_id, price
  is_available           -- le cuisinier coupe un plat
  preparation_time_min   -- calibre les seuils d'alerte de retard
  photo_url

dish_ingredients                     -- LA recette
  dish_id, ingredient_id
  quantity               -- en usage_unit
  is_optional
  yield_factor           -- pertes de préparation (épluchage, parage)

ingredient_supplies                  -- miroir de supplies
  id, bar_id, ingredient_id, quantity, unit_cost, total_cost
  supplier, business_date, created_by

kitchen_orders                       -- extension du ticket, PAS un doublon
  id, ticket_id
  status                 -- pending | accepted | preparing | ready | served | cancelled
  accepted_by, accepted_at, ready_at, served_at
  priority, notes, reminder_count

kitchen_order_items
  id, kitchen_order_id, dish_id, quantity
  status                 -- statut par ligne
  modifiers              -- JSONB : « sans piment »
  unit_price, computed_cost
```

### Points non négociables

**`computed_cost` figé à la commande.** Recalculer la marge d'un plat de mars avec le CUMP de
juillet rendrait tout l'historique de marge faux. C'est la leçon déjà apprise sur le CUMP des
boissons.

**Séparation `purchase_unit` / `usage_unit`.** Le promoteur achète un sac de riz de 25 kg, la
recette consomme 300 g. Sans conversion explicite : soit des recettes en « fractions de sac »
(illisible), soit un appro pénible. Confirmé par les pratiques professionnelles de costing
(AP cost converti en unités de recette + yield pour les pertes).

**Ingrédients transversaux exclus des recettes.** Modéliser l'huile et le sel au gramme est une
fausse précision : saisie alourdie, résultat inexploitable. Traitement : `is_transversal = true`,
stock simple avec alerte de seuil, imputés en charge indirecte cuisine — pas dans le coût matière
du plat. Le gaz est une charge de cuisine (`6052`), pas un ingrédient.

**Stock d'ingrédients non bloquant.** Ne jamais empêcher un plat de sortir parce que le stock
théorique dit 0 : en cuisine réelle, le cuisinier voit ce qu'il a. Alerte, jamais blocage —
l'inverse du stock de boissons.

### 4.4 Le plat est une entité autonome — décision tranchée

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

4. ⭐ **Les promotions ciblent par `target_product_ids UUID[]`, SANS clé étrangère**
   ([059_create_promotions_and_events.sql](../../supabase/migrations/059_create_promotions_and_events.sql)).
   **C'est le fait décisif** : le moteur travaille sur des UUID nus, donc il peut cibler des plats
   venant d'une autre table. La promotion sur les plats ne nécessite **pas** que le plat soit un
   `bar_product`. L'argument « menu du jour à prix réduit », qui semblait imposer l'héritage,
   reposait sur une hypothèse fausse.

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
| Promotions | Gratuit | **Gratuit aussi** (UUID[] sans FK) |
| Price guard | Gratuit | À étendre (une requête) |
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

```
        TICKET (addition unique — table 5)
                    │
        ┌───────────┴───────────┐
        │                       │
   LIGNES BOISSONS         LIGNES PLATS
   create_sale immédiat    kitchen_order (pending)
   stock décrémenté        → cuisinier : accepted → preparing → ready
   ✅ chemin actuel        → serveur retire : served
      INTACT              → vente créée + ingrédients décrémentés
        └───────────┬───────────┘
                    │
             pay_ticket (existant)
             une seule addition, un seul encaissement
```

Le serveur ne voit qu'un écran avec onglets Boissons / Plats. La séparation est invisible pour
lui, réelle en dessous.

### Garde-fous

- `pay_ticket` doit refuser la fermeture s'il reste des `kitchen_order_items` non
  `served`/`cancelled` — sinon on encaisse un plat qui pourrait ne jamais sortir. Le RPC a déjà
  la bonne structure (`FOR UPDATE`, rejet des statuts invalides).
- Le total du ticket doit distinguer *encaissable maintenant* et *en préparation*.

---

## 6. Validation : le double constat remplace le contrôle a posteriori

### Deux validations de nature différente

| | Validation cuisine | Validation financière |
|---|---|---|
| Question | « Puis-je le faire ? » | « Cette vente est-elle légitime ? » |
| Qui | Cuisinier | Gérant / promoteur |
| Objet | `kitchen_order_item.status` | `sales.status` |
| Existe | Non (à créer) | Oui (`validate_sale`) |

### Le cuisinier valide la faisabilité

Il peut **refuser** un plat, mais uniquement **avant** `preparing`, avec un motif court. Puisque
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
Cuisinier a fini → ready              ⟵ le plat existe physiquement
SERVEUR RETIRE  → served              ⟵ ⭐ LA VENTE NAÎT ICI, status = 'validated'
                                         + ingrédients décrémentés (même transaction)
```

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
- La dérive du stock d'ingrédients par rapport au CA : vente et décrément devenant simultanés,
  il n'y a plus de fenêtre d'incohérence.

**Argument décisif :** sur un service de 40 couverts, faire valider chaque plat rendait l'écran
de validation inexploitable — donc « Valider tout » cliqué mécaniquement, ce qui **détruit** la
valeur du contrôle, y compris pour les boissons noyées dans le flot.

### Ce que le gérant garde

Il perd un veto sans objet, rien d'utile :
- **supervision temps réel** avec chrono et relance (§8) ;
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

## 7. Marge : trois niveaux

| Niveau | Formule | Usage |
|---|---|---|
| **Marge matière brute** | `prix − Σ(qté × CUMP ingrédient direct)` | Décision de prix, comparaison entre plats |
| **Coût matière réel** | via inventaire physique périodique | Détecte vol, gaspillage, portions trop généreuses |
| **Marge contributive** | marge matière − charges cuisine réparties | Rentabilité réelle du volet resto |

**L'écart entre théorique et réel est la métrique la plus précieuse du module** — standard du
secteur. Dans un bar où la cuisine est une zone de fuite non mesurée, c'est probablement
l'argument de vente le plus fort.

**Conséquence** : l'inventaire physique périodique des ingrédients est **obligatoire**, pas
optionnel. Sans lui le module ne mesure que du théorique, et la « marge précise » promise est
fausse.

---

## 8. Interfaces

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

**Filtrage côté client obligatoire** (`useMemo`), jamais 3 requêtes distinctes : l'egress a fait
l'objet de 3 vagues d'optimisation pour descendre à ~200 MB/j. Changer de portée doit être
instantané et gratuit en réseau.

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

## 9. Comptabilité

L'amorce existante paie. À ajouter dans
[syscohada.types.ts](../../src/services/accounting/syscohada.types.ts) :

```
'602'  Achats de matières premières   (ingrédients)
'6052' Combustibles                   (gaz)
'7021' Ventes de repas
'603'  Variation des stocks           ⭐ nouveau besoin
```

Le `603` est la vraie nouveauté : une activité de **transformation** doit constater la variation
de stock de matières premières en fin de période, ce qu'une pure revente peut esquiver. Le Z de
caisse séparera automatiquement `7011` boissons / `7021` repas.

> ⚠ **Réserve** : `7021` provient de l'analyse interne, **pas d'une source normative**. La
> recherche documentaire n'a pas confirmé ce code précis pour les ventes de repas en SYSCOHADA
> (seulement la série 70 et des sous-comptes de 602). **À valider par un comptable OHADA avant
> d'écrire du code.**

---

## 10. Offline

Position cohérente avec la doctrine du projet (dégradé assumé selon rôle et mode) :

- **Prise de commande offline : oui** — ticket et `kitchen_order_items` dans la file, IDs
  pré-générés.
- **Consommation d'ingrédients : optimiste, réconciliée à la synchro.**
- **Jamais bloquant** sur le stock d'ingrédients.

Le RPC de consommation doit être atomique, `SECURITY DEFINER`, avec `FOR UPDATE` sur les lignes
d'ingrédients (races) et **idempotent** (clé sur `kitchen_order_item_id`) — indispensable en
offline.

Le CUMP existant sait déjà gérer le stock nul
([reverse_supply](../../supabase/migrations/20260703040000_vague4c_cump_single_source_of_truth.sql) :
« si nouveau_stock <= 0 : on conserve le CUMP courant »), mais un stock chroniquement négatif
produirait un coût matière faux, donc une marge fausse — d'où l'inventaire physique obligatoire
(§7).

---

## 11. Blocages

### 11.1 Plafond de membres — ✅ LEVÉ (non-blocage)

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

### 11.2 Modèle du plat — ✅ TRANCHÉ

`dishes` autonome. Analyse complète et coûts acceptés en **§4.4**.

### 11.3 Rôle `cuisinier` — seul point dur restant

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

---

## 12. Séquençage

| Phase | Contenu | Valeur livrée | Risque |
|---|---|---|---|
| **0** | Audit + ajout rôle `cuisinier` (§11.3) + `has_restaurant` + permissions | Rien de visible | **Élevé** — 56 fichiers, 17 migrations |
| **1** | `ingredients` + `ingredient_supplies` + CUMP + écran appro | Le promoteur suit ses achats cuisine, aujourd'hui invisibles | Faible — réutilise le CUMP |
| **2** | `dishes` + `dish_ingredients` + marge théorique | **Le promoteur découvre la marge réelle de ses plats** — souvent une révélation | Faible — lecture seule |
| **3** | Extension ticket + écran Service + statuts | Prise de commande opérationnelle | **Élevé** — touche au flux de vente |
| **4** | RPC de consommation + inventaire physique + écart théorique/réel | Détection gaspillage et fuites | Moyen |
| **5** | `ScopeSwitcher` + dashboard resto + comptes 602/6052/7021/603 | Vision consolidée bar + resto | Faible |

**Logique de cet ordre** : les phases 1 et 2 délivrent l'essentiel de la valeur perçue **sans
toucher au flux de vente**, qui est la partie la mieux durcie de l'app (idempotence, promotions,
price guard, offline). Un promoteur qui découvre en phase 2 que son plat vedette a 12 % de marge
a déjà rentabilisé le module. **Le module est vendable après la phase 2**, la prise de commande
pouvant suivre.

---

## 13. Points de vigilance

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

- `is_transversal` est **binaire alors que la réalité ne l'est pas** : exclure l'huile d'un plat
  frit peut sous-estimer sensiblement le coût matière. Un forfait par plat, ou un
  `is_transversal` par ingrédient **et par plat**, serait plus juste.
- **Les sous-recettes ont été écartées, ce qui se contredit** : dans la cuisine
  ouest-africaine, les sauces de base réutilisées sont la norme. Les reporter oblige à dupliquer
  les mêmes ingrédients dans 10 plats — précisément la saisie identifiée comme principal coût
  d'adoption. À reconsidérer.
- `7021` non confirmé par une source normative (§8).

---

## 14. Ce qui a été corrigé en cours de réflexion

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
| Plafond `maxMembers` non vu, puis qualifié de blocage imposant de réserver le module à Pro/Max | **Faux blocage** : un petit resto (promoteur + cuisinier + serveur, avec ou sans gérant) tient dans Starter. Erreur de généralisation depuis le cas le plus gros (§11.1) |
| « Le plat doit être un `bar_product` pour bénéficier des promotions » | **Faux** : les promotions ciblent des `UUID[]` **sans FK**. L'argument principal de l'héritage reposait sur une hypothèse non vérifiée → `dishes` autonome (§4.4) |

---

## 15. Sources externes consultées

- [Slant POS — ingredient usage tracking](https://blog.slantco.com/how-pos-systems-help-track-ingredient-usage-and-profitability/)
- [Restaurant365 — food inventory management](https://www.restaurant365.com/blog/food-inventory-management/)
- [Toast — KDS overview](https://doc.toasttab.com/doc/platformguide/platformKDSOverview.html)
- [Lightspeed — KDS 2.0](https://k-series-support.lightspeedhq.com/hc/en-us/articles/22708154090267-Using-the-Kitchen-Display-System-2-0)
- [Galley — food costing framework](https://www.galleysolutions.com/blog/food-costing-framework)
- [meez — recipe costing](https://www.getmeez.com/blog/a-chefs-guide-to-accurate-recipe-costing)
- [Plan comptable OHADA — classe 6](https://plan-comptable-ohada.com/nouvelle-norme-2016/classe/6.html)
- [Compte 603 — variation des stocks](https://www.comptabilisation.fr/compte.php?compta_n=603&nom=Variations-des-stocks-approvisionnements-et-marchandises-&i=376)
