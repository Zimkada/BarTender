# Certification du PLAN_CO_PROMOTEUR - 01/09/2026

> **Méthode** : chaque affirmation du plan a été confrontée au code, avec pour objectif
> de la **faire tomber**, pas de la confirmer. Les recherches monoligne ont été refaites
> en multiligne (une policy SQL s'étale sur plusieurs lignes - c'est précisément ce qui
> avait masqué le défaut n°1).
>
> **Verdict global** : le plan est **globalement valide mais INCOMPLET**. Son affirmation
> centrale est vraie au sens strict et trompeuse au sens pratique. **5 angles morts**
> sont documentés ci-dessous, dont **2 bloquants** qui auraient produit un rôle
> non fonctionnel s'ils n'avaient pas été trouvés avant implémentation.

---

## Synthèse

| # | Angle mort | Gravité | Effet si non traité |
|---|---|---|---|
| **A1** | Navigation pilotée par listes de rôles littérales | **BLOQUANT** | Le co-promoteur se connecte et voit un **menu vide** |
| **A2** | Whitelists littérales de rôles dans les RPC | **BLOQUANT** | Le co-promoteur ne peut **pas créer de vente** (`create_sale` refuse) |
| **A3** | 20 RPC + 1 policy RLS utilisent `owner_id` dans leur guard | Majeur (démenti partiel du §3.1) | Aucun - les guards sont des disjonctions incluant `is_bar_member`. Mais l'affirmation du plan doit être corrigée. |
| **A4** | Bot WhatsApp analyste : allowlist « échoue fermé sur tout rôle futur » | Moyen | Le co-promoteur ne peut pas utiliser le bot analyste |
| **A5** | CHECK `users.role` (001) + `training_versions` + `wa_leads` | Moyen | INSERT en échec sur contrainte selon la table |

**Corrigé par ailleurs** : l'index unique partiel demandé en §4.1 du plan **existe déjà**
(deux fois). Le plan prescrivait un travail inutile.

---

## A1 - BLOQUANT : la navigation est pilotée par des listes de rôles littérales

### Constat

`MobileNavigation.tsx` et `MobileSidebar.tsx` construisent le menu à partir de tableaux
de rôles en dur, pas à partir des permissions :

```typescript
// src/components/MobileSidebar.tsx:187
{ id: 'inventory', label: 'Inventaire', roles: ['promoteur', 'gerant'], path: '/inventory' },
// src/components/MobileSidebar.tsx:219
{ id: 'teamManagement', label: 'Mon équipe', roles: ['promoteur', 'gerant'], path: '/team' },
// ... ~20 entrées de ce type dans les deux fichiers
```

### Pourquoi le plan l'a manqué

Le §4.5 annonçait un balayage exhaustif « en phase pré-0 », mais **sans identifier ce cas
comme bloquant**. Le plan mentionnait `ROLE_PERMISSIONS` et les « unions inline » de
`src/types/index.ts:9-11` sans mesurer que la navigation en dépend entièrement.

### Effet réel

Un co-promoteur ajouté en base avec toutes les bonnes permissions se connecterait et
verrait **un menu vide** : aucune entrée ne le liste. L'application serait inutilisable
alors que le RBAC serait correct. Défaut invisible en revue SQL, immédiat en test réel.

### Point positif à conserver

`ProtectedRoute` (`src/components/ProtectedRoute.tsx:33-42`) fonctionne **par permission**
(`permission?: keyof RolePermissions`), pas par rôle. Les routes suivront donc
automatiquement `ROLE_PERMISSIONS` sans modification. Le problème est **circonscrit à
l'affichage de la navigation** - ce qui le rend simple à corriger une fois identifié.

### Correction requise

Ajouter `'co_promoteur'` à chaque entrée de menu où `'promoteur'` figure, dans
`MobileNavigation.tsx` ET `MobileSidebar.tsx`. Vérifier aussi `BarSelector.tsx` (§4.6 du
plan) et `TeamPerformanceTable.tsx:33` (filtre `role === 'gerant' || role === 'promoteur'`).

---

## A2 - BLOQUANT : whitelists littérales de rôles dans les RPC

### Constat

Plusieurs RPC critiques valident le rôle de l'appelant contre une liste en dur et
**échouent fermé** sur tout rôle inconnu :

| RPC | Migration | Whitelist |
|---|---|---|
| `create_sale` | `20260804100000_create_sale_accept_dishes.sql:187` | `('super_admin','promoteur','gerant','serveur')` |
| `receive_ingredient_supply` | `20260802150000:193` | `('super_admin','promoteur','gerant','cuisinier')` |
| `consume_ingredients_fefo` | `20260802160000:241` | idem |
| `discard_ingredient_lot` | `20260802170000:147` | idem |
| `kitchen_supply_expense` | `20260809230000:218` | idem |
| kitchen write guard | `20260811150000:146` | idem |

```sql
-- 20260804100000_create_sale_accept_dishes.sql:187
IF v_caller_role NOT IN ('super_admin', 'promoteur', 'gerant', 'serveur') THEN
    RAISE EXCEPTION 'Access denied: role % is not allowed to create sales', v_caller_role;
```

### Effet réel

Le co-promoteur a `canSell: true` (hérité du gérant) mais **`create_sale` le rejetterait**.
Il pourrait voir le panier et pas encaisser. C'est le défaut le plus grave de la liste :
il touche le flux vital de l'application.

### Avertissement opérationnel

`create_sale` est sous la garde de la mémoire `project_migration_whitelist_pending` :
**ne jamais toucher ce RPC pendant le service**. La migration devra être planifiée hors
heures d'ouverture, avec le pré-vol/post-vol de privilèges décrit dans
`20260731120000_whitelist_create_sale_roles.sql` (anon=false, authenticated=true,
service_role=true) - `CREATE OR REPLACE` perd les grants
(mémoire `project_rpc_security_hardening`).

### Décision de périmètre à prendre

Le co-promoteur doit-il apparaître dans les whitelists **cuisine** ? Le promoteur y est.
Par cohérence avec « gérant augmenté » et l'accès complet à la gestion : oui, si le bar
a la restauration active. À trancher explicitement plutôt que par omission.

---

## A3 - MAJEUR : le §3.1 du plan est vrai au sens strict, trompeur au sens pratique

### Ce que le plan affirmait

> « **AUCUNE** politique RLS ne dépend de `owner_id` [...] **zéro** politique le référence
> dans un `USING` ou un `WITH CHECK`. »

### Ce que montre la recherche multiligne

**Une policy le référence bien** :

```sql
-- 002_rls_policies.sql:119, redéfinie en 004 puis 009_migrate_to_supabase_auth.sql:238
CREATE POLICY "Bar owners can update bars" ON bars FOR UPDATE
  USING (
    is_super_admin() OR
    owner_id = auth.uid() OR
    get_user_role(id) IN ('promoteur', 'gerant')
  );
```

Et surtout, **20 RPC** utilisent `owner_id` dans leur guard d'accès :
`get_bar_admin_stats`, `get_bar_products`, `get_bar_members`, `get_top_products_aggregated`,
`get_bar_daily_stats`, `get_bar_period_stats`, `get_bar_server_performance`,
`admin_generate_bar_report`, `check_user_can_manage_members`, `setup_promoter_bar`,
`prepare_subscription_checkout`, `get_subscription_overview`, etc.

### Pourquoi l'erreur s'est produite

La recherche initiale filtrait `grep | grep -i "policy\|using"` **ligne par ligne**. Une
policy SQL s'étale sur plusieurs lignes : `USING (` et `owner_id` ne sont pas sur la même.
Le motif ne pouvait structurellement pas la trouver.

> **Leçon transposable** : pour chercher une policy ou une fonction SQL, toujours extraire
> le **bloc complet** (regex multiligne `CREATE POLICY.*?;`), jamais grep ligne à ligne.
> C'est la version SQL de la leçon « balayage exhaustif > recherche par motif »
> (mémoire `project_restauration_pre0_done`).

### Pourquoi la conclusion du plan tient malgré tout

Les guards sont des **disjonctions** :

```sql
IF NOT ( is_bar_member(p_bar_id)
         OR EXISTS (... b.owner_id = auth.uid())
         OR is_super_admin() ) THEN RAISE EXCEPTION ...
```

Et `is_bar_member()` (`009_migrate_to_supabase_auth.sql`) **ne filtre pas par rôle** :

```sql
SELECT EXISTS (SELECT 1 FROM bar_members
  WHERE user_id = auth.uid() AND bar_id = bar_id_param AND is_active = true);
```

Le co-promoteur, membre actif, satisfait la première branche. **Les 20 RPC et la policy
fonctionneront sans modification.** La conclusion opérationnelle du plan - `owner_id` est
conservé, pas de refonte de l'ownership - **reste valide**.

### Correction à porter au plan

Reformuler le §3.1 : non pas « aucune RLS ne dépend de `owner_id` », mais **« l'accès est
systématiquement accordé par disjonction `is_bar_member OR owner OR super_admin`, et
`is_bar_member` ne filtre pas par rôle - un nouveau rôle membre hérite donc de l'accès
sans modification »**. C'est plus faible comme affirmation, et c'est la vraie raison pour
laquelle le chantier est léger.

### Vérification complémentaire requise

`is_promoteur_or_admin()` filtre bien sur `role IN ('super_admin','promoteur')`
(`009:207`) - mais elle n'est utilisée que pour la **création de bars**
(`002_rls_policies.sql:102,116` ; `005_add_bar_members_rls.sql:19`). Hors périmètre du
co-promoteur (`canCreateBars: false`). **Aucun impact** - vérifié, pas supposé.

---

## A4 - MOYEN : le bot WhatsApp analyste exclut par construction tout rôle futur

### Constat

```sql
-- 20260821110000_resolve_wa_bar_link_role_filter.sql:87
AND bm.role IN ('super_admin', 'promoteur', 'gerant');
```

Le commentaire de la fonction est explicite :

> « Allowlist explicite (super_admin, promoteur, gerant) - échoue FERME sur tout role non
> liste (serveur, cuisinier, **ou futur**) - defense en profondeur »

Le co-promoteur **est** ce « rôle futur ». Il serait silencieusement exclu du bot analyste.

### Analyse

Ce n'est **pas un bug** : c'est un choix de sécurité délibéré et correct (échouer fermé).
Mais c'est un angle mort du plan, qui ne mentionne nulle part le bot WhatsApp.

L'ironie mérite d'être relevée : le transcript du 28/08 avait identifié le co-promoteur
comme dépendance roadmap du bot analyste (« la résolution d'identité devra être revue si
construite avant le co-promoteur »). Cette dépendance a été notée à l'époque **puis perdue**
- elle n'a pas été reportée dans le plan.

### Décision produit requise

Un co-promoteur doit-il pouvoir interroger le bot analyste sur son bar ? Compte tenu de
la décision n°2 (accès financier complet) et du motif « suivi de gestion », **la réponse
cohérente est oui**. Migration à prévoir (une ligne), avec la note
`20260822090001_resolve_wa_bar_link_remove_super_admin.sql` en tête : le `super_admin` a
été retiré de cette liste ensuite - vérifier l'état réel en prod avant d'écrire
(mémoire `feedback_prod_state_over_migration_files`).

---

## A5 - MOYEN : contraintes CHECK au-delà de `bar_members`

Le plan citait `bar_members_role_check` et `training_versions`. Balayage complet des
`CHECK (role IN ...)` :

| Table | Migration | Contenu actuel | Action |
|---|---|---|---|
| `bar_members` | `20260802090000:129` | `super_admin, promoteur, gerant, serveur, cuisinier` | **DROP + ADD** (prévu) |
| `training_versions` | `20260802090100:120` | `promoteur, gerant, serveur, cuisinier` | **DROP + ADD** (prévu) |
| `users` | `001_initial_schema.sql:76` | `super_admin, promoteur, gerant, serveur` | ⚠️ **NON PRÉVU** - jamais mis à jour pour `cuisinier` dans les migrations |
| `user_onboarding` | `20260127030000:27` | `promoteur, gerant, serveur` | ⚠️ **NON PRÉVU** - idem |
| `wa_leads` | `20260719000000:92` | `promoteur, gerant, autre, inconnu` | Hors périmètre (prospects, pas membres) |

### Point d'attention critique sur `users` et `user_onboarding`

Ces deux CHECK n'ont **jamais été mis à jour pour `cuisinier`** dans les fichiers de
migration. Trois hypothèses : (a) ils ont été modifiés à la main en SQL Editor, (b) la
colonne `role` n'y est plus utilisée, (c) le rôle cuisinier ne transite pas par ces tables.

> **À vérifier en base, pas dans les fichiers** - c'est exactement le cas d'école de la
> mémoire `feedback_prod_state_over_migration_files` (3 cas avérés où les migrations ne
> reflétaient pas la prod). Pré-vol obligatoire :
> ```sql
> SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
> FROM pg_constraint
> WHERE contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%promoteur%';
> ```
> Cette requête liste **toutes** les contraintes réellement en vigueur qui mentionnent un
> rôle - la seule source de vérité.

---

## Ce que la certification CONFIRME (vérifié, non supposé)

| Affirmation du plan | Statut |
|---|---|
| `owner_id` peut être conservé, pas de refonte de l'ownership | **CONFIRMÉ** (via A3 : disjonction + `is_bar_member` sans filtre de rôle) |
| Le diff promoteur/gérant tient en 9 permissions | **CONFIRMÉ** - extraction programmatique de `ROLE_PERMISSIONS` |
| Le rôle `cuisinier` fournit le modèle (4 migrations) | **CONFIRMÉ** - les 4 fichiers existent et suivent cette séquence |
| `get_my_bars()` gère le multi-bar sans modification | **CONFIRMÉ** - `20260302` retourne l'union membre-actif + owner |
| `check_plan_member_limit()` compte sans distinction de rôle | **CONFIRMÉ** - aucune migration de quota à écrire |
| Limites : Starter 4 / Pro 8 / Max 20 | **CONFIRMÉ** - `20260727000000` + `src/config/plans.ts:59,68,77` |
| Le cuisinier consomme un siège (précédent) | **CONFIRMÉ** - `20260802090300:188` |
| `ProtectedRoute` fonctionne par permission | **CONFIRMÉ** - limite l'impact de A1 aux menus |
| `get_user_role()` fait `LIMIT 1` sans `ORDER BY` | **CONFIRMÉ** - risque réel |

---

## Ce que la certification INFIRME

### L'index unique partiel demandé en §4.1 existe déjà - DEUX FOIS

```sql
-- 20260116000000_secure_onboarding_and_uniqueness.sql:61
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bar_member_user ...
-- 20260219000000_fix_bar_members_constraints_and_permissions.sql:16
CREATE UNIQUE INDEX IF NOT EXISTS idx_bar_members_bar_user_unique
  ON public.bar_members(bar_id, user_id) WHERE user_id IS NOT NULL;
```

Le plan prescrivait de le créer : **travail inutile**, à retirer.

**Mais la vigilance du §4.1 reste justifiée**, pour une raison différente de celle écrite :
l'index porte sur `(bar_id, user_id) WHERE user_id IS NOT NULL` - **il n'inclut pas
`is_active`**. Deux lignes pour le même couple sont donc impossibles, ce qui règle le
risque de non-déterminisme de `get_user_role()`. En revanche, une ligne désactivée
occupe la place : **réactiver un ancien membre est un UPDATE, jamais un INSERT** - ce qui
est précisément la prescription du plan, avec une justification corrigée.

---

## Angles morts résiduels ASSUMÉS (non levables par revue de code)

1. **Aucun co-promoteur n'existe.** Le plan repose sur un besoin réel exprimé, mais aucun
   usage réel ne l'a validé. Sur le module restauration, les 3 défauts les plus graves
   sont tous venus du terrain, aucun de la revue
   (mémoire `project_whatsapp_analyst_vision`). Le risque se concentre sur l'écran de
   traçabilité (§5), dont l'utilité ne se vérifiera qu'à l'usage.

2. **L'état réel de la prod n'est pas vérifié.** Toute cette certification lit des
   **fichiers de migration**. Trois cas avérés montrent qu'ils ne reflètent pas toujours
   la prod (mémoire `feedback_prod_state_over_migration_files`). Le pré-vol A5 est
   obligatoire avant toute migration.

3. **Le trigger `sync_bar_member_role_to_auth_metadata`** (`20251221`) propage le rôle
   dans `auth.users.app_metadata`. Il ne filtre pas par valeur - il devrait donc propager
   `co_promoteur` sans modification. **Non testé** : à vérifier au premier ajout réel,
   car un JWT portant un rôle inconnu pourrait être rejeté ailleurs.

---

## Conclusion

Le plan **n'était pas prêt pour l'implémentation**. Deux défauts bloquants (A1, A2)
auraient produit un rôle non fonctionnel : menu vide et impossibilité d'encaisser. Ils
sont invisibles en revue SQL et apparaissent au premier test réel.

Sa **conclusion structurante reste valide** : le socle est multi-membres, `owner_id` est
conservé, le chantier est l'ajout d'un 5e rôle. Mais la raison invoquée était fausse
(« aucune RLS ne dépend de `owner_id` ») ; la vraie raison est la disjonction
`is_bar_member OR owner` combinée à une `is_bar_member` qui ne filtre pas par rôle.

**Le pré-0 doit être élargi** : au balayage des littéraux `'promoteur'` s'ajoutent
l'inventaire des whitelists de RPC (A2), le pré-vol `pg_constraint` (A5), et la décision
produit sur le bot analyste (A4).
