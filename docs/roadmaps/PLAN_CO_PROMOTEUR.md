# Plan de cadrage - Rôle co-promoteur

> **Statut** : cadrage validé par le fondateur (01/09/2026). Aucune ligne de code écrite.
> **Prérequis** : aucun. Le chantier est indépendant de la prévision IA et de la restauration.
> **Modèle d'implémentation** : le rôle `cuisinier` (02/08/2026, 4 migrations) - même séquence, même rigueur.

---

## 1. Le besoin réel (source : fondateur, 01/09/2026)

Deux motifs distincts, exprimés par des bars en production :

1. **Continuité opérationnelle** - un associé doit pouvoir enregistrer et effectuer des
   opérations aujourd'hui réservées au promoteur **pendant que celui-ci est absent, en
   situation d'urgence**. Sans cela le bar est bloqué.
2. **Suivi de gestion** - les co-promoteurs ont besoin de suivre le fonctionnement et la
   gestion du bar (comptabilité, analytiques, exploitation).

> **Conséquence de cadrage** : c'est un besoin de **délégation avec action**, pas de simple
> consultation. Le bot WhatsApp analyste ne couvre PAS ce besoin : il lit, il n'agit pas.
> Cette distinction est ce qui justifie le chantier.

---

## 2. Décisions actées (fondateur, 01/09/2026)

| # | Question | Décision |
|---|---|---|
| 1 | Statut vs promoteur principal | **Principal + associés**. Un promoteur reste propriétaire de référence (abonnement, facturation, suppression du bar). `bars.owner_id` est CONSERVÉ tel quel. |
| 2 | Accès financier | **Complet** - comptabilité SYSCOHADA, Z de caisse, marges, apports de capital. |
| 3 | Salaires (`canManageSalaries`) | **Oui, comme le promoteur** - cohérent avec le motif d'urgence (payer le personnel en l'absence du promoteur). |
| 4 | Invitation | **Par le SuperAdmin uniquement** - cohérent avec la règle existante (création de bars réservée au SuperAdmin). Le promoteur en fait la demande. |
| 5 | Traçabilité | **Journal dédié visible du promoteur** - il retrouve à son retour ce que l'associé a fait en son absence. |
| 6 | Multi-bar | **OUI, `canSwitchBars` activé dès la phase 2** - cas rare mais réel. Bascule limitée aux bars où il est membre. |
| 7 | Permanence | **Rôle PERMANENT** - pas d'activation/désactivation temporaire liée aux absences. Choix explicite de simplicité. |
| 8 | Nombre de co-promoteurs | **Aucune limite propre au rôle** (souvent peu nombreux en pratique). Ils **consomment un siège** du plan comme tout membre, sur le précédent du cuisinier (31/07/2026). Le quota du plan reste la seule borne. |

---

## 3. Résultat d'audit : le socle est déjà prêt

Audit mené le 01/09/2026 sur le code en dépôt. Trois constats qui réduisent fortement
l'ampleur estimée du chantier par rapport à la roadmap (`PRESENTATION_TECHNIQUE.md` §14.2,
qui annonçait un impact sur « le modèle d'ownership, le RBAC, les RLS »).

### 3.1 L'accès est accordé par disjonction, et `is_bar_member` ne filtre pas par rôle

> ⚠️ **CORRIGÉ le 01/09/2026 par la certification** (`docs/audits/CERTIFICATION_PLAN_CO_PROMOTEUR_2026-09-01.md`, §A3).
> Ce paragraphe affirmait initialement qu'**aucune** RLS ne dépendait de `owner_id`.
> C'était **faux** : une policy (`Bar owners can update bars`, `009:238`) et **20 RPC**
> l'utilisent. L'erreur venait d'un grep ligne-à-ligne incapable de voir une policy
> multiligne. La conclusion tient, mais pour une autre raison - la voici.

Les guards d'accès sont des **disjonctions** :

```sql
IF NOT ( is_bar_member(p_bar_id)
         OR EXISTS (SELECT 1 FROM bars b WHERE b.id = p_bar_id AND b.owner_id = auth.uid())
         OR is_super_admin() ) THEN RAISE EXCEPTION ...
```

Et `is_bar_member()` (`009_migrate_to_supabase_auth.sql`) **ne filtre pas par rôle** :
elle teste l'appartenance active, sans distinction. Un nouveau rôle membre hérite donc de
l'accès **sans modification** des 20 RPC ni de la policy.

`is_promoteur_or_admin()` filtre bien sur `role IN ('super_admin','promoteur')` mais ne
sert qu'à la **création de bars** - hors périmètre (`canCreateBars: false`). Vérifié.

> **Conséquence majeure** : le chantier n'est PAS une refonte de l'ownership. Le socle
> multi-membres existe déjà et sait gérer N membres par bar. Ajouter un co-promoteur
> revient à ajouter un 5e rôle dans un système conçu pour cela.

`owner_id` conserve son unique rôle réel : désigner le propriétaire de référence pour
l'abonnement et la facturation. La décision n°1 le laisse intact.

### 3.2 Le périmètre exact tient en 9 permissions

Diff `ROLE_PERMISSIONS.promoteur` vs `.gerant` (`src/types/index.ts:753+`) - les seules
permissions qui les séparent :

| Permission | Co-promoteur | Motif |
|---|---|---|
| `canCancelSales` | **OUI** | Urgence : annuler une vente erronée |
| `canManageExpenses` | **OUI** | Urgence : saisir une dépense (livraison, réparation) |
| `canManageUsers` | **OUI** | Urgence : gérer l'équipe |
| `canCreateManagers` | **OUI** | Urgence : remplacer un gérant défaillant |
| `canViewAccounting` | **OUI** | Suivi de gestion (décision n°2) |
| `canManageSalaries` | **OUI** | Décision n°3 |
| `canCreateBars` | **NON** | Patrimoine du promoteur, hors exploitation d'un bar |
| `canSwitchBars` | **OUI** | Décision n°6 - cas rare mais réel, bascule limitée aux bars où il est membre |

**Définition du rôle** : `co_promoteur` = `gerant` + les 7 permissions ci-dessus.
Il n'est PAS un `promoteur` diminué : il est un gérant augmenté des pouvoirs d'urgence et
de suivi. Cette formulation évite l'ambiguïté sur `canCreateBars`.

### 3.3 Le rôle `cuisinier` fournit le modèle d'implémentation

Séquence réelle appliquée le 02/08/2026, à rejouer à l'identique :

| Migration | Objet |
|---|---|
| `20260802090000_add_cuisinier_role_check.sql` | DROP + ADD du CHECK `bar_members_role_check` |
| `20260802090100_add_cuisinier_to_training_versions.sql` | CHECK sur `training_versions.role` |
| `20260802090200_allow_gerant_manage_cuisinier_rls.sql` | RLS de gestion de membres |
| `20260802090300_add_bar_member_v2_accept_cuisinier.sql` | RPC d'ajout de membre |

---

## 4. Points durs identifiés

### 4.1 `get_user_role()` : `LIMIT 1` sans `ORDER BY` - RISQUE

```sql
-- 024_fix_all_permissions.sql (définition en vigueur)
SELECT role FROM bar_members
WHERE user_id = auth.uid() AND bar_id = bar_id_param AND is_active = true
LIMIT 1;   -- <<< non déterministe si 2 lignes actives
```

Si un utilisateur possède deux lignes actives pour le même bar, le rôle retourné est
**non déterministe**. Aujourd'hui le risque est théorique ; il devient concret si un
gérant est promu co-promoteur sans désactivation de l'ancienne ligne.

**Action requise AVANT la migration de rôle** :

> ⚠️ **CORRIGÉ par la certification (§« Ce que la certification INFIRME »)** : l'index
> unique demandé ici **existe déjà, deux fois** (`idx_unique_bar_member_user`,
> `20260116000000:61` et `idx_bar_members_bar_user_unique`, `20260219000000:16`).
> Ne pas le recréer.

1. Pré-vol : `SELECT bar_id, user_id, COUNT(*) FROM bar_members WHERE is_active GROUP BY 1,2 HAVING COUNT(*) > 1;` (attendu : 0 ligne)
2. L'index existant porte sur `(bar_id, user_id) WHERE user_id IS NOT NULL` - **sans
   `is_active`**. Deux lignes actives pour un même couple sont donc déjà impossibles : le
   non-déterminisme de `get_user_role()` est couvert. En revanche une ligne **désactivée**
   occupe la place.
3. Conséquence : promouvoir un gérant ou réactiver un ancien membre est un **UPDATE du
   rôle**, jamais un INSERT (sinon violation de l'index unique).
   - Si un `ON CONFLICT` est utilisé, il doit répéter le même `WHERE` que l'index partiel
     (mémoire `project_rpc_sql_lessons`).

### 4.2 `BarContext` : asymétrie owner / membre

`src/context/BarContext.tsx:565` force `newRole = 'promoteur'` quand
`bar.ownerId === currentSession.userId`, **avant** toute consultation de `bar_members`.
`isOwner()` (l.538) et `canAccessBar()` (l.545) suivent la même logique.

Le co-promoteur n'étant pas l'owner, il passera par la branche `bar_members` - le
comportement attendu. Mais cette asymétrie doit être traitée explicitement : c'est
typiquement là que se logent les bugs de permission.

### 4.3 Quota de membres par plan (décision n°8)

Limites **en vigueur** - `20260727000000_update_plan_member_limits_to_4.sql` (le Starter
est passé de 2 à 4 le 27/07/2026) et `src/config/plans.ts` :

| Plan | maxMembers | Prix |
|---|---|---|
| Starter | 4 | 9 000 XOF |
| Pro | 8 | 15 000 XOF |
| Max (`enterprise`) | 20 | 30 000 XOF |

**Décision** : aucune limite propre au rôle n'est écrite, mais le co-promoteur
**consomme un siège** comme tout membre actif - c'est exactement le précédent du
cuisinier (`20260802090300_add_bar_member_v2_accept_cuisinier.sql:188`, décision du
31/07/2026). Le quota du plan reste la seule borne.

> **Pourquoi ne pas exempter** : une exemption ouvrirait une faille de facturation -
> contourner le quota en nommant des « co-promoteurs » plutôt que des gérants. Et elle
> romprait la cohérence avec le cuisinier, déjà en production.

**Aucune migration de quota à écrire.** `check_plan_member_limit()` compte les membres
actifs sans distinction de rôle : elle traitera le co-promoteur correctement sans
modification. Vérifier seulement que le nouveau RPC d'ajout (§4.4) l'appelle bien.

Conséquence commerciale à assumer : un bar Starter ayant déjà un gérant et deux serveurs
devra passer en Pro pour ajouter un co-promoteur. C'est le fonctionnement normal du
modèle par sièges, pas un effet de bord du chantier.

### 4.4 `add_bar_member_v2` refuse tout rôle hors gerant/serveur

`20260402000000_enforce_plan_member_limit.sql:82` :
```sql
IF p_role NOT IN ('gerant', 'serveur') THEN ... 'Rôle invalide' ...
```
Et `check_user_can_manage_members` ne connaît que les actions `create_manager`,
`create_server`, `remove_member`, `update_role`.

La décision n°4 (invitation par le SuperAdmin uniquement) **simplifie ce point** : pas
besoin d'ouvrir `add_bar_member_v2` au co-promoteur. Prévoir un RPC dédié
`add_co_promoteur` réservé au `super_admin`, sur le modèle de `setup_promoter_bar`.

### 4.5 Surface de balayage

44 fichiers `src/` et 74 migrations contiennent le littéral `'promoteur'`. Ordre de
grandeur comparable au rôle `cuisinier` (56 fichiers).

> **Leçon du pré-0 restauration** (mémoire `project_restauration_pre0_done`) :
> **balayage exhaustif > recherche par motif**. Chaque occurrence de `'promoteur'` doit
> être examinée pour décider si elle devient `IN ('promoteur','co_promoteur')` ou reste
> réservée au promoteur seul. Ne PAS faire de remplacement automatisé.

Un point d'attention type : `src/types/index.ts:9-11` documente que le compilateur ne
détecte QUE les oublis dans `ROLE_PERMISSIONS` - les unions inline sont structurellement
indépendantes et passeront silencieusement.

### 4.6 Multi-bar (décision n°6) - côté SQL, rien à faire

`get_my_bars()` (`20260302_fix_get_my_bars_include_owned_bars.sql`) retourne déjà l'union
des bars où l'utilisateur est **membre actif** ET de ceux qu'il possède. Un co-promoteur
membre de trois bars les recevra donc tous les trois **sans aucune modification SQL**.

Le travail multi-bar est purement applicatif :
- `canSwitchBars: true` dans `ROLE_PERMISSIONS.co_promoteur` ;
- `BarSelector` (`src/components/BarSelector.tsx`) : vérifier sa condition d'affichage,
  aujourd'hui pensée pour le promoteur ;
- `switchBar()` (`BarContext.tsx:558+`) : le co-promoteur passe par la branche
  `bar_members` (§4.2) et doit récupérer `co_promoteur` comme rôle sur le bar cible -
  **et non conserver son rôle du bar précédent**. C'est le point à tester en priorité :
  un associé peut être co-promoteur d'un bar et simple gérant d'un autre.

> Ce dernier cas - rôles différents selon le bar - est le seul scénario multi-bar
> réellement nouveau. Il existe déjà en théorie (un gérant peut l'être sur 2 bars) mais
> devient bien plus probable avec le co-promoteur.

### 4.7 BLOQUANT - la navigation est pilotée par des listes de rôles littérales

> Trouvé par la certification du 01/09/2026 (§A1). **Sans cette correction, le co-promoteur
> se connecte et voit un MENU VIDE**, alors même que son RBAC serait correct.

`MobileNavigation.tsx` et `MobileSidebar.tsx` construisent le menu à partir de tableaux de
rôles en dur, pas à partir des permissions :

```typescript
// src/components/MobileSidebar.tsx:187
{ id: 'inventory', label: 'Inventaire', roles: ['promoteur', 'gerant'], path: '/inventory' },
```

Environ 20 entrées de ce type. À traiter dans les deux fichiers, plus
`TeamPerformanceTable.tsx:33` et `BarSelector.tsx`.

**Point positif** : `ProtectedRoute` (`src/components/ProtectedRoute.tsx:33-42`) fonctionne
**par permission**, pas par rôle. Les routes suivront `ROLE_PERMISSIONS` automatiquement -
le défaut est circonscrit à l'affichage du menu.

### 4.8 BLOQUANT - whitelists littérales de rôles dans les RPC

> Trouvé par la certification du 01/09/2026 (§A2). **Sans cette correction, le co-promoteur
> ne peut PAS créer de vente** : il a `canSell: true` mais `create_sale` le rejette.

| RPC | Migration | Whitelist actuelle |
|---|---|---|
| `create_sale` | `20260804100000:187` | `('super_admin','promoteur','gerant','serveur')` |
| `receive_ingredient_supply` | `20260802150000:193` | `(...,'cuisinier')` |
| `consume_ingredients_fefo` | `20260802160000:241` | idem |
| `discard_ingredient_lot` | `20260802170000:147` | idem |
| `kitchen_supply_expense` | `20260809230000:218` | idem |
| kitchen write guard | `20260811150000:146` | idem |

⛔ **`create_sale` ne doit JAMAIS être modifié pendant le service**
(mémoire `project_migration_whitelist_pending`). Migration hors heures d'ouverture, avec
pré-vol/post-vol de privilèges (`anon=false, authenticated=true, service_role=true`) :
`CREATE OR REPLACE` perd les grants (mémoire `project_rpc_security_hardening`).

**Décision de périmètre** : inclure le co-promoteur dans les whitelists **cuisine** ? Le
promoteur y est ; par cohérence avec « gérant augmenté », oui. À trancher explicitement.

### 4.9 Bot WhatsApp analyste - exclusion par construction

> Trouvé par la certification (§A4).

`resolve_wa_bar_link` filtre sur `bm.role IN ('super_admin','promoteur','gerant')`
(`20260821110000:87`) et son commentaire précise qu'elle « échoue FERME sur tout role non
liste (serveur, cuisinier, **ou futur**) ». Le co-promoteur est ce rôle futur : il serait
silencieusement exclu du bot.

Ce n'est pas un bug (échouer fermé est correct) mais une décision produit à prendre.
Compte tenu de la décision n°2 (accès financier complet) et du motif « suivi de gestion »,
la réponse cohérente est de l'inclure. ⚠️ `20260822090001` a retiré `super_admin` de cette
liste ensuite : **vérifier l'état réel en prod** avant d'écrire
(mémoire `feedback_prod_state_over_migration_files`).

### 4.10 Contraintes CHECK au-delà de `bar_members`

> Trouvé par la certification (§A5). Le §3.3 ne citait que `bar_members` et
> `training_versions`.

| Table | Migration | Contenu actuel | Action |
|---|---|---|---|
| `bar_members` | `20260802090000:129` | `super_admin, promoteur, gerant, serveur, cuisinier` | DROP + ADD |
| `training_versions` | `20260802090100:120` | `promoteur, gerant, serveur, cuisinier` | DROP + ADD |
| `users` | `001_initial_schema.sql:76` | `super_admin, promoteur, gerant, serveur` | ⚠️ jamais mis à jour pour `cuisinier` |
| `user_onboarding` | `20260127030000:27` | `promoteur, gerant, serveur` | ⚠️ idem |
| `wa_leads` | `20260719000000:92` | `promoteur, gerant, autre, inconnu` | hors périmètre (prospects) |

Les CHECK de `users` et `user_onboarding` n'ont **jamais été mis à jour pour `cuisinier`**
dans les fichiers de migration. Soit ils l'ont été à la main en SQL Editor, soit ces
colonnes ne sont plus utilisées.

> ⛔ **À vérifier en base, pas dans les fichiers** (mémoire
> `feedback_prod_state_over_migration_files`, 3 cas avérés). Pré-vol obligatoire, seule
> source de vérité :
> ```sql
> SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
> FROM pg_constraint
> WHERE contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%promoteur%';
> ```

### 4.11 Trigger de synchronisation du rôle vers le JWT

`sync_bar_member_role_to_auth_metadata` (`20251221_create_sync_role_trigger.sql`) propage
`bar_members.role` dans `auth.users.raw_app_meta_data`. Il ne filtre pas par valeur : il
devrait donc propager `co_promoteur` sans modification.

**Non testé** - à vérifier au premier ajout réel : un JWT portant un rôle inconnu pourrait
être rejeté ailleurs dans la chaîne.

---

## 5. Traçabilité (décision n°5)

`AuditLogger` existe déjà (`src/services/AuditLogger.ts`, RPC + table). Le chantier ajoute :
- des événements dédiés pour les actions sensibles du co-promoteur (annulation de vente,
  création d'utilisateur, saisie de dépense, opération sur salaires) ;
- un écran de consultation réservé au promoteur principal : « ce qui s'est passé en mon
  absence », filtré sur les actions des co-promoteurs du bar.

C'est ce qui rend la délégation acceptable entre associés - le point le plus important
pour l'adoption, au-delà de la technique.

---

## 6. Séquence d'implémentation proposée

| Phase | Contenu | Dépend de |
|---|---|---|
| **Pré-0** | Balayage exhaustif : 34 fichiers `src/` (213 occurrences hors tests) + 74 migrations. Pré-vol unicité `bar_members` (§4.1). **Élargi par la certification** : inventaire des whitelists de RPC (§4.8), pré-vol `pg_constraint` sur TOUTES les tables (§4.10), décision produit bot analyste (§4.9). | - |
| **1 - Socle DB** | CHECK `bar_members_role_check` + `training_versions`. Index unique partiel. RPC `add_co_promoteur` (super_admin) appelant `check_plan_member_limit()` (§4.3). | Pré-0 |
| **1bis - Whitelists RPC** | ⛔ **BLOQUANT** (§4.8) : `create_sale` **hors heures de service**, + RPC cuisine si périmètre retenu. Pré-vol/post-vol de privilèges obligatoire. | 1 |
| **2 - RBAC applicatif** | `UserRole`, `ROLE_PERMISSIONS`, `BarContext` (§4.2), garde-fous de type. **Inclut le multi-bar** : `canSwitchBars` + `BarSelector`, `getMyBars` vérifié pour un non-owner (§4.6). ⛔ **BLOQUANT** : navigation (§4.7) - `MobileNavigation` + `MobileSidebar`, sans quoi le menu est vide. | 1 |
| **3 - RLS** | Ouverture ciblée des policies `= 'promoteur'` -> `IN ('promoteur','co_promoteur')`, une par une, jamais en masse. | 2 |
| **4 - Traçabilité** | Événements d'audit + écran promoteur. | 2 |
| **5 - Onboarding** | Guide/training du rôle (`training_versions` accepte déjà un rôle). | 2 |

---

## 7. Ce que le chantier ne fait PAS

- Il ne touche pas à `bars.owner_id` (décision n°1).
- Il ne crée pas de partage de capital : `capital_contributions` existe déjà et n'est pas
  dans le périmètre. La roadmap le mentionnait ; le besoin exprimé est opérationnel, pas
  capitalistique.
- Il n'ouvre pas la création de bars (`canCreateBars` reste false).
- Il ne modifie pas le discours commercial : rien à promettre avant livraison.

---

## 8. Questions terrain - TOUTES TRANCHÉES (01/09/2026)

| Question | Réponse du fondateur | Effet sur le plan |
|---|---|---|
| Permanent ou limité aux absences ? | **Permanent** - « c'est plus simple » | Aucun mécanisme d'activation temporaire. Le rôle se comporte comme les autres. |
| Combien de co-promoteurs par bar ? | **Pas de limite propre**, « même s'il y en a souvent peu » | Le quota du plan suffit (§4.3). Aucun code de plafonnement à écrire. |
| Multi-bar ? | **Rare mais le besoin existe** | `canSwitchBars` = true dès la phase 2 (§3.2). |

Le choix du rôle permanent est le plus important des trois pour l'implémentation : un
accès temporaire aurait exigé un mécanisme d'activation/désactivation, sa fenêtre de
validité, et sa gestion en mode offline. Rien de tout cela n'est nécessaire.

> **Réserve de méthode.** Sur le module restauration, les 3 défauts les plus graves du
> chantier sont tous venus du terrain, aucun de la revue interne
> (mémoire `project_whatsapp_analyst_vision`). Le présent plan part d'un besoin réel
> remonté par des bars en production, et ses questions ouvertes ont été tranchées par le
> fondateur - c'est un point de départ bien plus solide que celui de la restauration.
>
> Il reste néanmoins **non confronté à un usage réel** : aucun co-promoteur n'existe
> aujourd'hui. Le risque résiduel se situe surtout sur l'écran de traçabilité (§5), dont
> l'utilité effective pour rassurer un promoteur absent ne se vérifiera qu'à l'usage.

---

## 9. Estimation

Le socle étant déjà multi-membres et aucune RLS ne dépendant de `owner_id`, l'essentiel
du coût n'est pas dans la conception mais dans le **balayage exhaustif** (§4.5) et dans la
**revue une-par-une des policies** (§6, phase 3). C'est un travail fastidieux et sans
surprise, comparable au pré-0 du rôle cuisinier.

Le seul livrable à vraie valeur ajoutée produit est l'**écran de traçabilité** (§5).
