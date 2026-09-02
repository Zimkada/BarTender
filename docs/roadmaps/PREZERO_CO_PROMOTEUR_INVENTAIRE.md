# Pré-0 co-promoteur - Inventaire exhaustif

> **Date** : 01/09/2026. Balayage automatisé + classement manuel.
> **Périmètre** : 481 fichiers `src/` scannés (hors tests et stories), 100 % des migrations.
> **Résultat** : 213 occurrences front dans 34 fichiers, 67 occurrences SQL classées.
>
> ✅ **PRÉ-VOL EXÉCUTÉ EN PROD le 01/09/2026.** Les résultats sont intégrés ci-dessous et
> **priment** sur l'inventaire tiré des fichiers. Voir §0 pour les écarts constatés.

---

## §0 - RÉSULTATS DU PRÉ-VOL PROD (01/09/2026)

### Écart n°1 - `users` et `user_onboarding` n'ont PAS de CHECK sur le rôle ✅

La certification (§A5) signalait deux contraintes potentiellement bloquantes. **Elles
n'existent pas en base** : seules 4 contraintes CHECK mentionnent un rôle.

| Table | CHECK réel en prod | Action |
|---|---|---|
| `bar_members` | `super_admin, promoteur, gerant, serveur, cuisinier` | **DROP + ADD** |
| `training_versions` | `promoteur, gerant, serveur, cuisinier` | **DROP + ADD** |
| `wa_bar_links.role_snapshot` | `promoteur, gerant, serveur` | **DROP + ADD** si décision bot |
| `wa_leads.role` | prospects | hors périmètre |

> Les CHECK de `001_initial_schema.sql:76` (`users`) et `20260127030000:27`
> (`user_onboarding`) **ne sont plus en vigueur** - supprimés en cours de route sans
> trace dans les fichiers. **2 migrations économisées.**

### Écart n°2 - aucun doublon, index confirmé ✅

Aucune ligne `2-DOUBLON` : le risque `get_user_role()` ne se matérialise pas aujourd'hui.

Index réels sur `bar_members` :
- `idx_bar_members_bar_user_unique` sur `(bar_id, user_id) WHERE user_id IS NOT NULL`
- `idx_unique_bar_member_virtual` sur `(bar_id, virtual_server_name)`

> ⚠️ `idx_unique_bar_member_user` (cité par la certification depuis `20260116000000`)
> **n'existe pas** sous ce nom en prod. Un seul index couvre le couple - la prescription
> « promouvoir = UPDATE, jamais INSERT » reste valide et repose sur
> `idx_bar_members_bar_user_unique`.

### Écart n°3 - la charge RPC est PLUS LOURDE : 14 whitelists en prod

Liste réelle des RPC en **échec fermé** (rejettent tout rôle non listé) :

| RPC | Domaine | Traiter ? |
|---|---|---|
| `create_sale_idempotent` | ⛔ **VENTE** | **OUI - hors service** |
| `add_bar_member_v2` | Membres | OUI (§4.4) |
| `cancel_kitchen_item` | Cuisine | si restauration |
| `close_batch` | Cuisine | si restauration |
| `consume_ingredients_fefo` | Cuisine | si restauration |
| `discard_ingredient_lot` | Cuisine | si restauration |
| `receive_ingredient_supply` | Cuisine | si restauration |
| `recover_cancelled_dish` | Cuisine | si restauration |
| `record_lot_counts` | Cuisine | si restauration |
| `replace_dish_price_options` | Cuisine | si restauration |
| `replace_ingredient_sizes` | Cuisine | si restauration |
| `set_price_option_size` | Cuisine | si restauration |
| `convert_purchase_order_to_supplies` | **Achats** | **OUI** (hors cuisine) |
| `request_wa_bar_link` | Bot | si décision bot |

> **Le nom réel du RPC de vente est `create_sale_idempotent`**, pas `create_sale`. Deux
> RPC nouveaux apparaissent que le grep sur fichiers n'avait pas isolés :
> `convert_purchase_order_to_supplies` (achats - **à traiter quoi qu'il arrive**) et
> `close_batch`.

À examiner (filtre `role IN`, pas d'échec fermé) : `can_write_kitchen`,
`check_product_create_permission`, `get_my_subscription_status`, `is_promoteur_or_admin`,
`prepare_subscription_checkout`, `remove_bar_member_v2`, `resolve_wa_bar_link`.

### Écart n°4 - allowlist du bot : 2 rôles, pas 3

`resolve_wa_bar_link` en prod : `bm.role IN ('promoteur', 'gerant')`. `super_admin` a bien
été retiré (`20260822090001`). L'inventaire fichiers annonçait 3 rôles - **la prod prime**.

### Écart n°5 - les RLS sont MOINS lourdes que prévu ✅

Sur ~50 policies mentionnant un rôle, la majorité utilise déjà
`get_user_role(bar_id) IN ('promoteur','gerant')` : le co-promoteur **doit y être ajouté**,
mais le motif est uniforme et mécanique.

**Policies réservées au promoteur SEUL** (le vrai travail, ~15) :

| Table | Policies | Décision |
|---|---|---|
| `expenses` | view / create / update / delete | **AJOUTER** (décision n°3) |
| `salaries` | view / insert / update / delete | **AJOUTER** (décision n°3) |
| `accounting_transactions` | view | **AJOUTER** (décision n°2) |
| `capital_contributions` | view / insert / update / delete | **AJOUTER** (décision n°2) |
| `initial_balances` | view / insert / update / delete | **AJOUTER** (décision n°2) |
| `sales / Promoteurs can cancel validated sales` | update | **AJOUTER** (`canCancelSales`) |
| `stock_adjustments` | insert | **AJOUTER** |
| `bar_members / Promoteurs can delete bar members` | delete | **AJOUTER** (`canManageUsers`) |
| `bars / Bar owners can update bars` | update | déjà `IN (promoteur, gerant)` - ajouter |
| `bars / Promoteurs can create bars` | insert | ⛔ **NE PAS TOUCHER** (`canCreateBars: false`) |
| `users / Admins can create users` | insert | ⛔ **NE PAS TOUCHER** (`is_promoteur_or_admin`) |

> ⚠️ **Doublons de policies détectés** : `expenses` porte à la fois
> « Managers can manage expenses » (`ALL`, promoteur+gerant) et « Promoteurs can … »
> (promoteur seul). Idem `expense_categories_custom`. Les policies étant **permissives**
> (OR entre elles), le gérant a déjà l'accès via la première. **Ne pas chercher à
> rationaliser** : ajouter le co-promoteur là où le promoteur figure, sans toucher au
> reste (règle : pas de refactoring autour d'un ajout).

> 🛡️ **`bar_members_update_policy`** mérite un examen à part : elle autorise le gérant à
> modifier uniquement les rôles `serveur`/`cuisinier`. Question de sécurité à trancher :
> **un co-promoteur peut-il nommer un autre co-promoteur ?** La décision n°4 (invitation
> par SuperAdmin uniquement) implique **NON** - la policy ne doit donc PAS lui ouvrir
> l'écriture du rôle `co_promoteur`, sous peine de contourner la gouvernance.

### Répartition des rôles en prod (contexte)

`serveur` 59 (20 actifs) · `gerant` 18 (10 actifs) · `promoteur` 11 (11 actifs) ·
`cuisinier` 1 · `super_admin` 1. Aucun rôle inattendu.

---

## Correction d'estimation

| Source | Annonçait | Réel |
|---|---|---|
| Plan §4.5 | « 44 fichiers src » | **34 fichiers**, 213 occurrences |
| Certification §A2 | 6 whitelists RPC | **14 whitelists** |
| Certification §A5 | 5 contraintes CHECK | **7** (+ `wa_bar_links.role_snapshot`) |

La charge SQL est **plus lourde** qu'annoncé ; la charge front est **plus légère** et très
concentrée (62 % dans un seul fichier de contenu).

---

## PARTIE 1 - FRONT (213 occurrences, 34 fichiers)

### Catégorie A - BLOQUANT : navigation (24 occurrences)

Sans ces lignes, **le co-promoteur voit un menu vide**.

| Fichier | Lignes | Action |
|---|---|---|
| `MobileSidebar.tsx` | 183-224 (17 entrées) | Ajouter `'co_promoteur'` partout où `'promoteur'` figure |
| `MobileNavigation.tsx` | 75, 83, 90, 97, 104, 111 | idem |
| `MobileSidebar.tsx` | 253 | `isGrouped` - ajouter au test |

⚠️ Cas particulier `MobileSidebar.tsx:224` :
```typescript
{ id: 'accounting', label: 'Comptabilité', roles: ['promoteur'], path: '/accounting' }
```
Seule entrée **exclusive au promoteur**. Le co-promoteur a `canViewAccounting: true`
(décision n°2) : **doit être ajouté**, sinon incohérence entre la permission et le menu.

### Catégorie B - Logique métier / affichage conditionnel (12 occurrences)

| Fichier:ligne | Code | Décision |
|---|---|---|
| `OfflineBanner.tsx:88` | `['gerant','promoteur','super_admin'].includes(...)` | **AJOUTER** - accès offline complet (mémoire `feedback_offline_conditionne_mode`) |
| `SubscriptionReminder.tsx:35` | `role === 'promoteur' \|\| role === 'gerant'` | **AJOUTER** - doit voir l'échéance |
| `OnboardingBanner.tsx:32` | `canConfigure` | **AJOUTER** |
| `TeamPerformanceTable.tsx:33` | filtre `gerant \|\| promoteur` | **AJOUTER** |
| `BarCard.tsx:19` | `members.find(m => m.role === 'promoteur')` | **NE PAS TOUCHER** - cherche le promoteur principal pour l'affichage admin |
| `UserCard.tsx:112` | `roles.includes('promoteur') && onAddBar` | **NE PAS TOUCHER** - `canCreateBars: false` |
| `BarContext.tsx:566` | `newRole = 'promoteur'` (owner) | **NE PAS TOUCHER** - branche owner, cf. plan §4.2 |
| `AppProvider.tsx:554` | commentaire (permission seule) | Aucune action |
| `ProductHistoryModal.tsx:54` | commentaire | Vérifier le RPC associé (partie 2) |
| `OnboardingFlow.tsx:158`, `TrainingFlow.tsx:60` | `role = 'promoteur'` | **NE PAS TOUCHER** - déduction owner |

### Catégorie C - Libellés d'affichage (6 occurrences)

`Header.tsx:86,96` (icône + label), `TrainingTab.tsx:87`, `RoleSwitcher.tsx:31,49`,
`RoleDetectedStep.tsx:18`, `OnboardingContext.tsx:138`.

**Action** : ajouter un `case 'co_promoteur'` avec libellé « Co-promoteur » et une icône.
Sans quoi le rôle s'affichera en brut ou vide. Non bloquant, mais visible.

### Catégorie D - Types (5 occurrences)

`types/index.ts:17`, `types/guide.ts:11`, `utils/validation.ts:95`,
`OnboardingContext.tsx:45`, `services/supabase/auth.service.ts:13,59`,
`bars.service.ts:727`.

**Action** : ajouter `'co_promoteur'` à chaque union. ⚠️ `types/index.ts:9-11` avertit que
le compilateur ne détecte QUE les oublis dans `ROLE_PERMISSIONS` - les unions inline
passent silencieusement. **Les traiter à la main, une par une.**

### Catégorie E - Guides d'onboarding (140 occurrences - 66 % du total)

`data/guides/owner-guides.ts` (133), `kitchen-guides.ts` (7), `accounting-guides.ts` (1).

Consommés par `useGuideSuggestions.ts:36-53` via `targetRoles` / `visibleFor`.

> **Ce n'est PAS de la sécurité** : c'est du contenu de formation. Aucun risque
> d'escalade de privilège. Le co-promoteur verrait simplement **aucune visite guidée**.

**Décision recommandée - ne PAS éditer 140 lignes.** Ajouter une seule entrée dans
`useGuideSuggestions.ts` faisant hériter le co-promoteur des guides du promoteur :

```typescript
co_promoteur: [...OWNER_GUIDES, ...KITCHEN_GUIDES.filter(g => g.targetRoles.includes('promoteur'))],
```

Reste à vérifier que `visibleFor` (filtrage intra-guide, `useGuideTrigger.ts:38`) suit -
sinon un mapping y sera nécessaire. **C'est le seul endroit où une abstraction est
justifiée** ; ailleurs, l'édition explicite reste préférable.

### Catégorie F - Services (10 occurrences)

`auth.service.ts:204,564,810,820`, `onboarding.service.ts:49,107,287`,
`whatsappAgent.service.ts:54`.

- `auth.service.ts:810,820` : tests de privilège → **à examiner une par une**
- `auth.service.ts:564` : `.eq('role','promoteur')` → cherche le promoteur principal,
  **ne pas toucher a priori**
- `onboarding.service.ts` : `userRole: 'promoteur'` en dur → contexte à vérifier

---

## PARTIE 2 - SQL

### A. WHITELISTS À ÉCHEC FERMÉ - 14 occurrences - BLOQUANT

Ces RPC **rejettent tout rôle non listé**. Le co-promoteur y est invisible.

| RPC / migration | Ligne | Whitelist | Décision |
|---|---|---|---|
| `create_sale` (`20260804100000`) | 187 | `super_admin, promoteur, gerant, serveur` | ⛔ **OUI - hors service** |
| `kitchen_state_machine_rpcs` (`20260804130000`) | 650 | `super_admin, promoteur, gerant` | OUI si restauration |
| `recover_cancelled_dish` (`20260810090000`) | 224 | idem | OUI si restauration |
| `replace_dish_price_options` (`20260810160000`) | 80 | idem | OUI si restauration |
| `size_reconciliation_rpc` (`20260811110000`) | 86, 196, 304 | idem (**3 fois**) | OUI si restauration |
| `receive_ingredient_supply` (`20260802150000`) | 193 | `+cuisinier` | OUI si restauration |
| `consume_ingredients_fefo` (`20260802160000`) | 241 | idem | OUI si restauration |
| `discard_ingredient_lot` (`20260802170000`) | 147 | idem | OUI si restauration |
| `kitchen_supply_expense` (`20260809230000`) | 218 | idem | OUI si restauration |
| `wa_bar_link_opt_in` (`20260822090000`) | 167 | `promoteur, gerant` | Décision bot (§4.9) |
| `request_wa_bar_link...` (`20260822090003`) | 65 | idem | Décision bot |

> ⛔ **`create_sale` : jamais pendant le service.** Pré-vol/post-vol de privilèges
> obligatoire (`anon=false, authenticated=true, service_role=true`) - `CREATE OR REPLACE`
> perd les grants (mémoire `project_rpc_security_hardening`).

> ⚠️ **Toujours repartir de `pg_get_functiondef` en base**, jamais du fichier : plusieurs
> de ces RPC ont été redéfinis (`create_sale` l'a été au moins 3 fois).

### B. CONTRAINTES CHECK - 7 occurrences

| Table | Migration:ligne | Contenu | Action |
|---|---|---|---|
| `bar_members` | `20260802090000:129` | `+cuisinier` | **DROP + ADD** |
| `training_versions` | `20260802090100:120` | `+cuisinier` | **DROP + ADD** |
| `users` | `001_initial_schema.sql:76` | **sans** `cuisinier` | ⚠️ vérifier en base |
| `user_onboarding` | `20260127030000:27` | **sans** `cuisinier` | ⚠️ vérifier en base |
| `wa_bar_links.role_snapshot` | `20260821090000:56` | `promoteur, gerant, serveur` | ⚠️ **NOUVEAU** - non vu par la certification |
| `wa_leads.role` | `20260719000000:92` | prospects | hors périmètre |

> **`wa_bar_links.role_snapshot`** est une trouvaille du balayage : si le co-promoteur est
> autorisé sur le bot (§4.9), l'INSERT du lien **violerait cette contrainte**. Les deux
> décisions sont liées - les traiter ensemble.

### C. FILTRES `role IN` / `role =` - 45 occurrences

Majoritairement des policies RLS et des helpers. À traiter en phase 3, une par une.
Cas déjà qualifiés : `is_promoteur_or_admin` (création de bars → **ne pas toucher**),
`resolve_wa_bar_link` (décision bot), `check_user_can_manage_members` (§4.4).

---

## Décisions de périmètre - TRANCHÉES (01/09/2026)

| Question | Décision | Conséquence |
|---|---|---|
| Restauration | **OUI, comme le promoteur** | Les 11 RPC cuisine sont dans le périmètre. Motif : le gérant a déjà ces droits ; un co-promoteur plus limité qu'un gérant serait incohérent. |
| Bot WhatsApp analyste | **OUI** | `resolve_wa_bar_link` + `request_wa_bar_link` + CHECK `wa_bar_links.role_snapshot` (3 objets liés, à migrer ensemble). |

**Périmètre final : les 14 whitelists sont toutes à traiter.**

---

## Ordre d'exécution - ARRÊTÉ

| # | Étape | Contenu | Risque |
|---|---|---|---|
| **1** | CHECK `bar_members` | DROP + ADD avec `co_promoteur`. Rien ne peut créer le rôle avant. | Faible |
| **2** | CHECK `training_versions` | Fusionné avec l'étape 1 (migration `20260901090000`). | Faible |
| **3** | RPC d'ajout | `add_bar_member_v2` (whitelist) + RPC dédié `add_co_promoteur` réservé `super_admin` (décision n°4). | Moyen |
| **4** | RLS | ~15 policies promoteur-seul + les `IN ('promoteur','gerant')`. ⛔ Ne PAS toucher `bars/create` ni `users/create`. 🛡️ `bar_members_update_policy` : ne pas ouvrir l'écriture du rôle `co_promoteur`. | Moyen |
| **5** | RPC cuisine + achats | 11 RPC cuisine + `convert_purchase_order_to_supplies`. | Moyen |
| **6** | Bot WhatsApp - **3 objets ensemble** | `resolve_wa_bar_link` + `request_wa_bar_link` + ⚠️ **CHECK `wa_bar_links.role_snapshot`** (déplacé de l'étape 1 par la revue du 01/09 : c'est une **défense en profondeur**, c'est elle qui rendait `super_admin` structurellement impossible à lier - ne pas la desserrer avant que les RPC bougent). | Faible |
| **7** | ⛔ **`create_sale_idempotent`** | **HORS SERVICE UNIQUEMENT.** Pré-vol + post-vol de privilèges (`anon=false, authenticated=true, service_role=true`) - `CREATE OR REPLACE` perd les grants. | **ÉLEVÉ** |
| **8** | Front | Types → `ROLE_PERMISSIONS` → navigation → libellés → `useGuideSuggestions`. | Faible |

> **`create_sale_idempotent` est volontairement en dernier** : c'est le seul dont l'échec
> interrompt le service. Tout le reste doit être stable avant d'y toucher
> (mémoire `project_migration_whitelist_pending`).

> **Règle transversale** : pour chaque RPC, repartir de `pg_get_functiondef` en base,
> jamais du fichier de migration - plusieurs ont été redéfinis plusieurs fois.
