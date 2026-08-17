# Plan — La restauration en mode simplifié (§20)

> **Statut** : document de référence, aucune ligne implémentée au 14/08/2026.
> **Prérequis livré** : la case « Cet établissement fait aussi de la restauration »
> (commit `15dd32f`), aujourd'hui **grisée en mode simplifié** — c'est ce plan qui la
> débloque.
> **Complète** : `PLAN_MODULE_RESTAURATION.md` §13.4 et sa sous-section « Question
> rouverte ».

---

## 0. Ce que ce chantier n'est pas

⛔ **Aucun bouton nouveau.** Le sélecteur `Mode complet / Mode simplifié` existe déjà
dans Paramètres → Fonctionnement et **ne bouge pas**. Décision du fondateur
(14/08/2026) : *« ce sera le seul bouton qui activera le mode simplifié ou complet »*.
Le mode est une propriété du bar **entier**, boissons et cuisine ensemble — pas un
réglage cuisine distinct.

⛔ **Aucun second régime métier.** Un plat en mode simplifié passe par les **mêmes**
statuts, appelle les **mêmes** RPC et écrit les **mêmes** lignes qu'en mode complet.
Seule l'UI condense. C'est la contrainte structurante de tout le chantier — voir §2.

⛔ **Aucun rôle cuisinier en mode simplifié.** Ce serait contradictoire avec la
définition du mode. Le gérant a déjà toutes les permissions cuisine (§1.2).

⭐ **Et le code le garantit déjà**, à deux niveaux — vérifié le 14/08/2026 :

| Niveau | Garde | Effet |
|---|---|---|
| Client | [`AppProvider.tsx:211`](../../src/context/AppProvider.tsx#L211) — `isSimplifiedMode && isServerRole` | Refuse `addDish` à qui n'a pas `canValidateSales` |
| Serveur | [`whitelist_create_sale_roles.sql:216`](../../supabase/migrations/20260731120000_whitelist_create_sale_roles.sql#L216) | `RAISE EXCEPTION` si `simplified` + rôle `serveur` |

⚠️ **Nuance à connaître** : la garde client s'appuie sur `canValidateSales`, que le
**cuisinier n'a pas** (`false`). Elle le bloque donc lui aussi. Sans conséquence
aujourd'hui — le mode simplifié exclut ce rôle — mais si un bar-resto se retrouvait avec
un compte cuisinier ET le mode simplifié, ce compte ne pourrait pas prendre de commande.
Comportement correct, à ne pas « corriger » par mégarde.

⚠️ La garde SQL, elle, ne vise que `'serveur'` en dur : un cuisinier passerait
`create_sale_idempotent` en mode simplifié. Inatteignable via l'UI (la garde client le
bloque avant), et sans effet réel puisque `canSell` est `false` pour ce rôle — mais
c'est une asymétrie à connaître avant de toucher à l'un des deux niveaux.

Le seul bouton introduit par ce plan est « Plat servi », **dans l'écran Service**, une
fois par plat (lot 4).

---

## 1. Pourquoi c'est possible aujourd'hui, et ça ne l'était pas le 02/08

### 1.1 La décision d'origine

Le §13.4 tranchait : *« un bar en mode simplifié ne peut pas activer la restauration »*,
au motif qu'*« un cuisinier a besoin d'un compte pour faire avancer les statuts de
production »*.

### 1.2 Ce que cette décision n'avait pas pris en compte

**Le gérant possède déjà la totalité des permissions cuisine** — vérifié dans
[`types/index.ts:863-870`](../../src/types/index.ts#L863-L870) :

| Permission | gérant |
|---|---|
| `canUpdateKitchenOrderStatus` | ✅ |
| `canServeKitchenItem` | ✅ |
| `canManageRecipes` | ✅ |
| `canManageIngredientStock` | ✅ |
| `canCancelKitchenOrderItem` | ✅ |

Et `can_write_kitchen`, branché sur 13 RPC d'écriture le 11/08, inclut `gerant`.

⭐ **Conclusion** : un gérant seul peut déjà piloter toute la machine d'état, côté
permissions **comme** côté SQL. Le blocage n'est pas technique — c'est un garde-fou UI
posé quand la question n'était pas tranchée. En mode simplifié il n'y a pas de
cuisinier : **c'est le gérant qui cuisine**, et les transitions ne sont donc pas
inventées, elles sont constatées par la seule personne présente.

### 1.3 Le modèle à suivre : le mode simplifié des boissons

| Mécanisme | Implémentation | Fichier |
|---|---|---|
| Le gérant seul opère | `shouldHide = isSimplifiedMode && isServerRole` | [`Cart.tsx:301`](../../src/components/Cart.tsx#L301) |
| Il **attribue** un acteur nommé | Sélecteur au checkout, `serversList` | [`CartFooter.tsx:123`](../../src/components/cart/CartFooter.tsx#L123) |
| Le nom est résolu en identifiant | `ServerMappingsService.getUserIdForServerName` | [`Cart.tsx:142`](../../src/components/Cart.tsx#L142) |

Principe : **un seul opérateur authentifié, plusieurs acteurs nommés**. La vente reste
une vraie vente, avec un vrai vendeur attribué. Rien n'est dégradé.

---

## 2. La contrainte structurante

> **Le mode simplifié est une condensation d'UI, jamais un second chemin métier.**

Le §13.4 avançait trois objections. Deux se dissolvent, une reste entière :

| Objection d'origine | Statut |
|---|---|
| « Le gérant inventerait les transitions » | ⭐ **Levée** — le plan identifiait lui-même le cas légitime : le gérant qui prend la commande, cuisine et sert. Les transitions sont constatées, pas déclarées. |
| « Cela double les chemins à tester » | ⭐ **Levée par conception** — aucun RPC nouveau, aucune transition nouvelle. Voir lot 4. |
| « Les métriques supposent des transitions constatées » | ⚠️ **ENTIÈRE** — c'est le risque résiduel réel. Voir lot 3. |

⛔ **Ne jamais fusionner les trois transitions en un RPC unique.** Ce serait précisément
le second chemin métier que l'objection n°2 vise, et il ferait diverger le décrément
FEFO — donc toute la chaîne de marge (§8).

---

## 3. Les quatre lots

### Lot 1 — Lever le verrou ✅ LIVRÉ le 16/08/2026

> **État** : implémenté et testé. 1075 tests passent, build OK.
> `hasRestaurant` ne dépend plus du mode ; `isSimplifiedKitchen` est exposé par
> `BarContext` ; la garde temporaire de `SettingsPage` est retirée ; les 3 tests
> concernés sont **retournés** (pas supprimés), et 2 tests d'invariance ajoutés
> (bar pur en simplifié, bascule aller-retour).
>
> ⚠️ **Reste à faire dans ce lot** : réviser le §13.4 de
> `PLAN_MODULE_RESTAURATION.md`, qui affirme encore l'inverse du code.

**Fichier** : [`BarContext.tsx:115`](../../src/context/BarContext.tsx#L115)

```typescript
// AVANT
const hasRestaurant = settings?.hasRestaurant === true && operatingMode === 'full';

// APRÈS
const hasRestaurant = settings?.hasRestaurant === true;
const isSimplifiedKitchen = hasRestaurant && operatingMode === 'simplified';
```

⭐ **Le CALCUL vit en un seul point.** Vérifié le 14/08 : `settings.hasRestaurant` n'est
lu directement que dans `BarContext` (la dérivation) et dans `SettingsPage` (les états
`temp*` du réglage). Partout ailleurs, on consomme la valeur **dérivée** exposée par le
contexte.

⚠️ **À ne pas lire comme « peu de code en dépend ».** Une douzaine de fichiers
consomment `hasRestaurant` — routes, menus, queries cuisine, Dashboard, Comptabilité,
ScopeSwitcher. Modifier cette dérivation change le comportement de TOUS. Ce qui est
petit, c'est la surface d'édition ; la portée, elle, est large — d'où les tests
d'invariance ci-dessous.

**Ce qui doit suivre dans le même lot :**

1. ⚠️ **Retourner** [`BarContext.test.ts:350`](../../src/context/BarContext.test.ts#L350)
   (« §13.4 — drapeau true MAIS mode simplifié → hasRestaurant = false »). Il devient
   l'assertion inverse. **Retourné, jamais supprimé** — c'est la trace du changement de
   décision.
2. ⚠️ **Retourner** les deux tests marqués de
   [`settingsHasRestaurant.test.tsx`](../../src/tests/unit/settingsHasRestaurant.test.tsx)
   (garde `restaurantUnavailable`).
3. ⚠️ **Retirer** la garde `restaurantUnavailable` de `SettingsPage` et son libellé
   « Indisponible en mode simplifié » — la case cesse d'être grisée.
4. ⛔ **Réviser le §13.4** du plan module. Il affirme aujourd'hui l'inverse du code.
   **Ne pas l'effacer** : le transformer en « décision révisée le __/08/2026 », avec le
   raisonnement qui a changé (§1.2 de ce document). Laisser plan et code en désaccord
   est exactement ce qui a produit l'incohérence `replace_dish_price_options` — une
   garde écrite le 10/08 qui contredisait la matrice sans que personne ne le voie.

**Risque** : faible. Réversible en une ligne.
**Test d'invariance à re-passer** : les bars purs (`hasRestaurant` absent) ne doivent
rien voir changer — c'est la contrainte de plus haut niveau du chantier (§3 du plan
module).

---

### Lot 2 — Attribuer le vendeur sur un plat

**Le seul vrai obstacle technique du chantier.**

**Fichier** : `serve_kitchen_item`, dernière définition dans
[`20260804130000_kitchen_state_machine_rpcs.sql:540`](../../supabase/migrations/20260804130000_kitchen_state_machine_rpcs.sql#L540)

```sql
-- AUJOURD'HUI : le vendeur est CODÉ EN DUR sur l'utilisateur connecté
v_sale := public.create_sale_idempotent(
  p_bar_id, v_items, p_payment_method, v_actor, v_key, ...
);
```

**Conséquence en mode simplifié** : tous les plats seraient attribués au gérant, pendant
que les boissons du même service iraient au serveur nommé. Incohérence visible dans
« Mon équipe » et le Z de caisse.

#### ⛔⛔ DEUX CHAMPS, PAS UN — l'erreur que ce plan a d'abord commise

Une première version de ce document proposait un simple `COALESCE(p_server_id, v_actor)`
sur le 4ᵉ argument. **C'était faux**, et le défaut aurait été SILENCIEUX : la vente se
crée, le plat se sert, seule l'attribution est fausse.

`create_sale_idempotent` porte **deux paramètres distincts**
([`20260804100000:117-129`](../../supabase/migrations/20260804100000_create_sale_accept_dishes.sql#L117)) :

| Position | Paramètre | Nature |
|---|---|---|
| 4ᵉ | `p_sold_by` | ⛔ **`NOT NULL`** — `RAISE EXCEPTION` si absent (ligne 167) |
| 6ᵉ | `p_server_id` | Optionnel, `DEFAULT NULL` |

⭐ **C'est `sold_by` qui porte l'attribution métier**, pas `server_id`. Vérifié dans
[`useTeamPerformance.ts:59`](../../src/hooks/useTeamPerformance.ts#L59) :
`// Source of truth: soldBy is the business attribution`.

⭐ **Le chemin des boissons peuple les DEUX**, et c'est le contrat à reproduire à
l'identique ([`useSalesMutations.ts:229`](../../src/hooks/mutations/useSalesMutations.ts#L229)) :

```typescript
const soldByValue = isSimplifiedMode && saleData.serverId
    ? saleData.serverId              // le serveur nommé DEVIENT le vendeur
    : (currentSession?.userId || '');
// ... puis, en plus :
server_id: saleData.serverId || undefined,
```

**Correction** — paramètre optionnel **en fin de signature**, et les deux positions
renseignées :

```sql
CREATE OR REPLACE FUNCTION public.serve_kitchen_item(
  p_bar_id          UUID,
  p_item_id         UUID,
  p_payment_method  TEXT DEFAULT 'cash',
  p_idempotency_key TEXT DEFAULT NULL,
  p_business_date   DATE DEFAULT NULL,
  p_server_id       UUID DEFAULT NULL   -- ⭐ NOUVEAU, en FIN de liste
)
...
  /**
   * ⛔⛔ VALIDER L'APPARTENANCE AVANT D'ATTRIBUER — défaut de SÉCURITÉ relevé
   * à la revue du plan, et il n'est pas théorique.
   *
   * `serve_kitchen_item` est l'une des DEUX fonctions volontairement NON
   * gardées par `can_write_kitchen` : le serveur doit pouvoir servir. Sans ce
   * contrôle, n'importe quel membre pourrait attribuer une vente à un
   * identifiant ARBITRAIRE - y compris hors de son bar. Le CA d'un serveur
   * deviendrait falsifiable depuis la console du navigateur.
   *
   * ⚠️ REFUS et non repli silencieux sur `v_actor` : une attribution demandée
   * puis ignorée produirait un chiffre faux que personne ne verrait.
   */
  IF p_server_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bar_members
    WHERE user_id = p_server_id
      AND bar_id  = p_bar_id
      AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Serveur inconnu dans ce bar'
    );
  END IF;

  v_sale := public.create_sale_idempotent(
    p_bar_id, v_items, p_payment_method,
    -- ⛔ 4ᵉ : `p_sold_by` est NOT NULL. Le COALESCE n'est PAS cosmétique —
    --    sans lui, un appel sans serveur nommé lèverait une exception.
    COALESCE(p_server_id, v_actor),
    v_key,
    -- ⭐ 6ᵉ : `p_server_id`, aujourd'hui passé à NULL en dur. C'est la
    --    position que la première version de ce plan avait OUBLIÉE.
    p_server_id,
    'validated', NULL, NULL, NULL, p_business_date, v_item.ticket_id, NULL
  );
```

⚠️ **Placer ce contrôle AVANT le garde d'idempotence n'aurait aucun sens** : un rejeu sur
un plat déjà `served` doit continuer de retourner son `sale_id` sans revalider quoi que
ce soit. Le contrôle vient donc APRÈS la sortie idempotente, juste avant l'écriture.

⭐ `create_sale_idempotent` **n'a besoin d'aucune modification** : les deux paramètres
existent déjà. Seul `serve_kitchen_item` change.

⭐ Optionnel en fin de liste : le mode complet continue sans modification. Motif déjà
employé pour `produce_batch` (§19.3).

**Points de vigilance :**

- ⛔ `serve_kitchen_item` **crée les ventes** : fonction la plus sensible du module.
  Migration par **substitution ciblée** (relecture `pg_get_functiondef` + remplacement
  de la seule ligne), méthode validée par `20260811170000`. Ne pas réécrire le corps à
  la main.
- ⛔ **Re-poser `REVOKE`/`GRANT`** après `CREATE OR REPLACE` — leçon des vagues 1-4.
- ⚠️ C'est l'une des **deux fonctions volontairement non gardées** par
  `can_write_kitchen` (le serveur doit pouvoir servir). Ne pas y ajouter de garde de
  rôle au passage.
- ⛔ La validation d'appartenance de `p_server_id` est **dans le SQL ci-dessus**, pas
  seulement dans cette liste — c'est un contrôle de sécurité, pas une bonne pratique.
- ⛔ **Vérifier l'attribution dans « Mon équipe »** après implémentation, pas seulement
  que la vente existe. C'est le seul endroit où l'erreur ci-dessus se serait vue.

**Côté client** : `serveItem` ([`useKitchenMutations.ts:251`](../../src/hooks/mutations/useKitchenMutations.ts#L251))
prend un champ `serverId?` optionnel, alimenté par le sélecteur existant.

---

### Lot 3 — Protéger la métrique de temps

⛔ **Ne pas différer ce lot** : c'est lui qui empêche le module d'afficher un chiffre
faux d'apparence crédible. Il précède volontairement l'écran condensé (lot 4) — il coûte
peu, n'a aucune dépendance, et si l'écran s'étire on ne veut pas qu'un bar tourne avec
une métrique qui ment.

**Le calcul réel**, vérifié dans
[`20260807210000_metrics_include_batch_losses.sql:441`](../../supabase/migrations/20260807210000_metrics_include_batch_losses.sql#L441) :

```sql
ROUND(AVG(EXTRACT(EPOCH FROM (koi.ready_at - koi.created_at)) / 60)
      FILTER (WHERE koi.ready_at IS NOT NULL)::NUMERIC, 1) AS avg_prep_min
```

⚠️ **Nuance importante** : la mesure part de `created_at` (envoi en cuisine), **pas** de
`accepted_at`. En mode simplifié, l'écart mesuré reste donc le temps réel entre la
commande et le geste du gérant — il n'est pas nul, contrairement à ce qu'un enchaînement
instantané des trois transitions laisserait croire.

⭐ **Mais il ne mesure plus la même chose** : en mode complet c'est une durée de
préparation constatée par le cuisinier ; en mode simplifié, le délai avant que le gérant
ne pense à valider. Deux grandeurs différentes sous le même libellé, dans le même écran.

**Décision à prendre** (à trancher avant implémentation) :

| Option | Coût | Précision |
|---|---|---|
| **A** — Afficher « non mesuré en mode simplifié » | Faible | Honnête, perd la donnée |
| **B** — Libellé distinct (« délai de validation ») | Faible | Garde la donnée, dit ce qu'elle est |
| **C** — Colonne `recorded_mode` sur `kitchen_order_items` | Élevé (schéma + RPC) | Permet de distinguer a posteriori |

**Recommandation : B**, puis C si le besoin d'analyse se confirme.

⭐ **Les trois autres métriques du §8 restent pleinement valides** : coût matière, marge
et pertes dérivent du décrément FEFO réel, pas de l'horodatage.

---

### Lot 4 — L'écran Service condensé

**Fichier** : [`KitchenServicePage.tsx`](../../src/pages/KitchenServicePage.tsx)

L'écran affiche aujourd'hui **trois colonnes** — `À faire` / `En cours` / `Prêt` —
conçues pour trois acteurs distincts. En mode simplifié il n'y en a qu'un.

**Cible** : une liste unique, **un bouton par plat**, qui enchaîne côté client les RPC
existants :

```
accept_kitchen_item → mark_kitchen_item_ready → serve_kitchen_item
```

Le gérant déclare « ce plat est parti » — vrai des trois étapes à la fois, puisqu'il les
a toutes faites. Le décrément FEFO et le coût matière figé se produisent **exactement**
comme en mode complet : c'est ce qui préserve la fiabilité de la marge.

⚠️⚠️ **CES TROIS APPELS NE SONT PAS ATOMIQUES.** Un échec après `mark_ready` laisse un
plat `ready` non servi, **matière déjà décomptée**.

⭐⭐ **LE RETRY EST SÛR — les trois RPC sont IDEMPOTENTS.** Vérifié le 14/08/2026, et
c'est ce qui rend le bouton unique acceptable :

| RPC | Garde d'idempotence | Verrou |
|---|---|---|
| `accept_kitchen_item` | `status NOT IN ('pending','accepted')` → refus ; `already_forced` | `FOR UPDATE` |
| `mark_kitchen_item_ready` | ⭐ `consumed_at IS NOT NULL` → `idempotent_replay: true` | `FOR UPDATE` |
| `serve_kitchen_item` | `status = 'served'` → retourne le `sale_id` existant | `FOR UPDATE OF koi` |

⭐ Le garde de `mark_ready` porte ce commentaire en base : *« le garde le plus important
de cette fonction — le double-clic d'un cuisinier pressé est le cas NOMINAL, pas
l'exception »*. Un second clic **ne consomme donc pas le stock une seconde fois** : la
fonction sort avant toute écriture et renvoie le coût déjà figé.

**Conséquence pour le lot 4** : après un échec partiel, réappuyer sur « Plat servi »
rejoue la séquence sans risque — les étapes déjà faites sont ignorées, seule la
manquante s'exécute. C'est la propriété qui autorise un bouton unique là où trois
colonnes existaient.

- **Récupérable et non silencieux** : le plat reste dans la liste avec son bouton.
- ⚠️ Le message d'erreur doit dire **où en est le plat** (« préparé, reste à servir »),
  sinon le gérant croit devoir tout recommencer.
- ⛔ **Ne PAS fusionner en un RPC** pour résoudre ce point — voir §2. L'idempotence rend
  la fusion inutile.

**Ne pas oublier** : `mark_ready` peut légitimement échouer (`BATCH_EMPTY` sur un lot
épuisé, `FEFO_FAILED`). Le message doit rester lisible et proposer l'alternative, comme
en mode complet.

**Menus** : aucune modification. Le filtrage par rôle de
[`MobileSidebar.tsx:192-201`](../../src/components/MobileSidebar.tsx#L192-L201) fait
déjà le travail — en mode simplifié seul le gérant est connecté. Vérifié.

---

## 4. Ordre d'implémentation

| # | Lot | Dépendance | Réversibilité |
|---|---|---|---|
| 1 | Lever le verrou + tests retournés + §13.4 révisé | — | 1 ligne |
| 2 | `p_server_id` sur `serve_kitchen_item` | Aucune (parallélisable) | Migration |
| 3 | Neutraliser / requalifier `avg_prep_min` | Aucune | Affichage |
| 4 | Écran Service condensé | Lots 1 et 2 | UI |

⭐ **La numérotation du §3 SUIT cet ordre** — un document qui présente deux ordres
différents invite l'erreur. Les lots se lisent et s'exécutent 1, 2, 3, 4.

**Point de non-retour** : tant que le lot 1 n'est pas fait, rien du mode simplifié n'est
observable — la case reste grisée.

⚠️ **Le lot 2 est parallélisable** (migration SQL, aucune dépendance UI), mais le lot 4
en dépend : sans lui, l'écran condensé servirait des plats attribués au gérant.

---

## 5. Réserves et points ouverts

### 5.1 Signal terrain — MESURÉ ET CONFIRMÉ (16/08/2026)

⭐⭐ **La condition posée par le §13.4 est levée.** Relevé sur la base de production :

| Mode | Restauration | Bars |
|---|---|---|
| `full` | oui | 1 |
| `full` | non déclarée | 5 |
| `simplified` | non déclarée | 5 |

**11 bars actifs, dont 45 % en mode simplifié** — tous exclus d'un module déjà construit.

⚠️ Les 5 bars simplifiés affichent 0 plat, mais **cette absence ne prouve rien** : la
case n'existait pas dans l'UI et le verrou l'aurait refusée. Chercher la trace d'un
besoin qu'aucune interface ne permettait d'exprimer n'a pas de sens.

⭐⭐ **CONFIRMATION CLIENT (« Bar Restau Le Marché », 16/08/2026)** — c'est le signal
qui a tranché :

> *« C'est bar + restaurant. En plus il y a des périodes où seul le gérant utilise le
> téléphone, donc le mode simplifié même pour cuisine est important (le gérant gère
> tout). Mais il faut permettre le switch vers le mode complet à tout moment. »*

Trois enseignements, dont le troisième change la conception :

1. Le besoin est **réel**, pas hypothétique — l'établissement fait bien de la
   restauration ;
2. Le cas nominal du mode simplifié est **exactement** celui décrit au §1.2 : le gérant
   fait tout, donc les transitions sont constatées et non inventées ;
3. ⭐ **LE BAR ALTERNE ENTRE LES DEUX MODES** selon les soirs. La restauration ne peut
   donc PAS être une propriété de l'un des deux modes : elle doit survivre à la bascule,
   dans les deux sens, à tout moment. C'est ce qui justifie `hasRestaurant` **indépendant**
   du mode, et `isSimplifiedKitchen` comme simple dérivé d'affichage.

⚠️ **Conséquence vérifiée le 16/08** : ni la machine d'état cuisine
(`kitchen_order_items`, les 5 RPC de transition) ni aucun écran cuisine ne lisent
`operatingMode`. Une bascule en plein service ne casse donc rien — les plats en cours
poursuivent leur cycle à l'identique. Cette propriété doit être **préservée** par les
lots 2 à 4.

### 5.1bis Ancien libellé — le signal terrain n'était pas mesuré

Le §13.4 conditionnait explicitement la réouverture de cette question à un signal
terrain : *« si une part significative des bars-restos s'avère être en mode simplifié,
cet arbitrage remonte en priorité »*.

**Ce signal n'a pas été relevé.** La requête :

```sql
SELECT settings->>'operatingMode' AS mode,
       (settings->>'hasRestaurant' = 'true') AS resto,
       count(*)
FROM public.bars WHERE is_active = TRUE
GROUP BY 1, 2 ORDER BY 1, 2;
```

Si le besoin vient d'un ou deux prospects, ce chantier est de la conquête — à séquencer.
S'il vient d'une part réelle du parc, il devient prioritaire. **Ce n'est pas la même
décision**, et elle appartient au fondateur.

### 5.2 Le mode simplifié ne dispense pas du serveur nommé

Un bar-resto en mode simplifié a souvent **quand même** des serveurs en salle, sans
compte. Le lot 2 le permet, mais il faut décider si le sélecteur de serveur est
**obligatoire** sur un plat comme il l'est sur une vente de boisson
([`CartDrawer.tsx:156`](../../src/components/cart/CartDrawer.tsx#L156) refuse le checkout
sans serveur choisi). Cohérence à trancher au lot 4.

⚠️ **La question porte sur QUI, pas sur SI.** `p_sold_by` étant `NOT NULL`, une vente a
toujours un attributaire : sans serveur choisi, ce sera le **gérant** (via le `COALESCE`
du lot 2). Le choix est donc entre « attribuer au gérant par défaut » et « exiger un
serveur », pas entre « attribuer » et « ne pas attribuer ».

### 5.3 Ce que ce plan ne couvre pas

- La **production de lots** (`produce_batch`) en mode simplifié : le gérant y a déjà
  accès, aucun changement nécessaire. À vérifier au smoke-test.
- Le **plan de test terrain** : à écrire au moment du lot 4, avec un vrai bar-resto.

---

## 6. Définition de terminé

- [ ] Un bar en mode simplifié avec `hasRestaurant` voit les trois écrans cuisine
- [ ] La case « restauration » n'est plus grisée, et la garde temporaire est retirée
- [ ] Un plat servi en mode simplifié crée une vente attribuée au **serveur nommé**
- [ ] ⛔ **L'attribution est vérifiée dans « Mon équipe »**, pas seulement l'existence de
      la vente. `useTeamPerformance` lit `soldBy` : un plat servi doit remonter sur le bon
      serveur, à côté de ses boissons. C'est le SEUL endroit où une erreur d'attribution
      se voit — elle est invisible dans l'écran Service comme dans l'Historique.
- [ ] ⛔ **`serve_kitchen_item` REFUSE un `p_server_id` étranger au bar** — testé par
      appel RPC direct, pas seulement via l'UI. C'est la garde qui empêche un serveur de
      s'attribuer le CA d'un autre.
- [ ] Un double-clic sur « Plat servi » ne consomme pas le stock deux fois
      (idempotence des trois RPC, §lot 4)
- [ ] Le décrément FEFO et le coût matière sont identiques aux deux modes
- [ ] `avg_prep_min` ne peut pas être lu comme une durée de préparation constatée
- [ ] ⛔ **Invariance des bars purs intacte** : aucun écran, aucune requête, aucun octet
      d'egress supplémentaire pour un bar sans `hasRestaurant`
- [ ] §13.4 du plan module révisé, pas effacé
- [ ] Smoke-test avec un compte **gérant** sur un bar en mode simplifié
