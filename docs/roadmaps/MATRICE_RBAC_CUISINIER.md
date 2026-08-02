# Matrice RBAC - Rôle `cuisinier`

> **Livrable de la phase Pré-0** ([PLAN_MODULE_RESTAURATION.md](PLAN_MODULE_RESTAURATION.md) §13.16).
> Statut : inventaire exhaustif. **Aucun code applicatif n'est modifié par ce document.**
>
> Rôle de ce fichier : outil de migration et de vérification. Chaque point d'impact recensé ici
> reçoit une décision explicite « le cuisinier est-il concerné ? ». La phase 0 consiste à appliquer
> ces décisions, pas à les reprendre.
>
> **Ordre imposé par §13.16** : les décisions par rôle brut listées en §6 doivent être remplacées par
> des permissions **avant** l'ajout du rôle `cuisinier`. Ajouter le rôle d'abord transformerait chaque
> test de rôle existant en bug silencieux.

Date de relevé : 31/07/2026. Branche : `feature/module-restauration`.

---

## 1. Chiffres relevés - mesure réelle vs plan

| Point d'impact | §12.5 annonçait | Mesuré | Écart |
|---|---|---|---|
| Fichiers `src/` contenant le littéral `'serveur'` | 56 | **57** (dont 11 tests/stories) | conforme |
| Fichiers `src/` contenant `role === 'serveur'` | - | **18** (28 occurrences) | dont 1 en code commenté |
| Dont **décisions d'autorisation réelles** | - | **⭐ 15** | le sous-ensemble qui compte (§5.1) |
| Occurrences `role !== 'serveur'` littérales | « toutes » | **1** ([bars.service.ts:628](../../src/services/supabase/bars.service.ts#L628)) | ⭐ voir §5 |
| Migrations avec `CHECK (role IN ...)` sur `bar_members` | 17 | **1 seule contrainte réelle** (+ 1 sur une table annexe) | ⭐ voir §4 |
| Migrations testant le rôle en dur (RLS / guard / RPC) | - | **21** | le vrai périmètre SQL |
| Permissions booléennes de `RolePermissions` | 30 | **30** (26 requises + 4 optionnelles) | conforme |

⚠ **Deux corrections importantes au plan**, détaillées plus bas :

1. Le §12.5 annonce « 17 migrations avec `CHECK (role IN ...)` ». Le relevé montre qu'il n'existe
   qu'**une seule contrainte `CHECK` sur `bar_members.role`**
   ([001_initial_schema.sql:76](../../supabase/migrations/001_initial_schema.sql#L76)). Les 16 autres
   occurrences sont des `role IN (...)` **de filtrage** dans des RLS ou des RPC, pas des contraintes.
   La distinction change le travail de la phase 0 : **une** migration `ALTER ... DROP/ADD CONSTRAINT`
   au lieu de 17, mais **21** points de filtrage à requalifier un par un.

2. Le §12.5 dit « tout `role !== 'serveur'` existant devient potentiellement faux ». Le littéral
   n'apparaît qu'une fois. Le motif réellement dangereux est la **négation implicite** :
   `const isServer = role === 'serveur'` suivi d'un `if (isServer) {...} else {...}`, où la branche
   `else` signifie « gérant ou promoteur » et accueillerait silencieusement un cuisinier. C'est ce
   motif, porteur de **15 décisions d'autorisation réelles**, qui constitue le risque. Voir §5.

---

## 2. Les 30 permissions de `RolePermissions` × rôles

Source : [src/types/index.ts:611-784](../../src/types/index.ts#L611-L784).
Colonne `cuisinier` = valeur **à définir** en phase 0 (le rôle n'existe pas encore).

| # | Permission | super_admin | promoteur | gerant | serveur | **cuisinier** | Justification |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| | **Gestion utilisateurs** | | | | | | |
| 1 | `canManageUsers` | ✅ | ✅ | ❌ | ❌ | **❌** | Métier de production, pas d'encadrement |
| 2 | `canCreateManagers` | ✅ | ✅ | ❌ | ❌ | **❌** | Idem |
| 3 | `canCreateServers` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem |
| | **Produits (boissons)** | | | | | | |
| 4 | `canAddProducts` | ✅ | ✅ | ✅ | ❌ | **❌** | Le catalogue boissons n'est pas son périmètre |
| 5 | `canEditProducts` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem |
| 6 | `canDeleteProducts` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem |
| | **Inventaire (bar)** | | | | | | |
| 7 | `canManageInventory` | ✅ | ✅ | ✅ | ❌ | **❌** | ⚠ Stock **boissons**. Le stock ingrédients passe par `canManageIngredientStock` (§3), volontairement disjoint |
| 8 | `canViewInventory` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem - le cuisinier voit ses ingrédients, pas les casiers |
| | **Ventes** | | | | | | |
| 9 | `canSell` | ✅ | ✅ | ✅ | ✅ | **❌** | ⭐ **Décision structurante** (§12.5 : « **sans** `canSell` »). Le cuisinier ne vend jamais : la vente naît du `serve` par le serveur (§6.1 du plan) |
| 10 | `canCancelSales` | ✅ | ✅ | ❌ | ❌ | **❌** | Annuler une vente = acte financier |
| 11 | `canViewAllSales` | ✅ | ✅ | ✅ | ❌ | **❌** | Pas d'accès au CA |
| 12 | `canViewOwnSales` | ✅ | ✅ | ✅ | ✅ | **❌** | ⚠ Un cuisinier n'a **aucune** vente propre (il ne vend pas). `true` créerait un écran vide et trompeur |
| | **Analytics** | | | | | | |
| 13 | `canViewAnalytics` | ✅ | ✅ | ✅ | ❌ | **❌** | Les indicateurs cuisine passent par ses propres écrans |
| 14 | `canExportData` | ✅ | ✅ | ✅ | ❌ | **❌** | - |
| 15 | `canViewForecasting` | ✅ | ✅ | ✅ | ❌ | **❌** | - |
| | **Comptabilité** | | | | | | |
| 16 | `canViewAccounting` | ✅ | ✅ | ❌ | ❌ | **❌** | ⭐ Test RBAC obligatoire (§12.5 livrable 3) |
| 17 | `canManageExpenses` | ✅ | ✅ | ❌ | ❌ | **❌** | ⚠ Les **appros ingrédients** ne passent PAS par là : permission dédiée (§3) |
| 18 | `canManageSalaries` | ✅ | ✅ | ❌ | ❌ | **❌** | - |
| | **Consignations** | | | | | | |
| 19 | `canCreateConsignment` | ✅ | ✅ | ✅ | ❌ | **❌** | Mécanisme boissons, hors périmètre cuisine |
| 20 | `canClaimConsignment` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem |
| 21 | `canViewConsignments` | ✅ | ✅ | ✅ | ❌ | **❌** | Idem |
| | **Promotions** | | | | | | |
| 22 | `canManagePromotions` | ✅ | ✅ | ✅ | ❌ | **❌** | Décision commerciale (§15.2 : les plats se ciblent explicitement) |
| | **Paramètres** | | | | | | |
| 23 | `canManageSettings` | ✅ | ✅ | ✅ | ❌ | **❌** | - |
| 24 | `canManageBarInfo` | ✅ | ✅ | ✅ | ❌ | **❌** | - |
| | **Multi-bar** | | | | | | |
| 25 | `canCreateBars` | ✅ | ✅ | ❌ | ❌ | **❌** | - |
| 26 | `canSwitchBars` | ✅ | ✅ | ❌ | ❌ | **❌** | Un cuisinier est attaché à une cuisine |
| | **Super Admin (optionnelles)** | | | | | | |
| 27 | `canAccessAdminDashboard?` | ✅ | - | - | - | **❌ (omis)** | Voir décision Q3 §7 |
| 28 | `canManagePromoteurs?` | ✅ | - | - | - | **❌ (omis)** | Idem |
| 29 | `canViewGlobalStats?` | ✅ | - | - | - | **❌ (omis)** | Idem |
| 30 | `canSuspendBars?` | ✅ | - | - | - | **❌ (omis)** | Idem |

**Lecture** : sur les 30 permissions existantes, le cuisinier est à `false` sur les **26 requises** et
n'a **aucune** des 4 optionnelles. Un cuisinier n'est donc pas un serveur enrichi ni un gérant
diminué : c'est un rôle **disjoint**, dont tous les droits viennent de permissions **nouvelles**.

C'est la confirmation concrète du §12.5 : « il est transversal, au même niveau que `serveur` (4), avec
des permissions disjointes ».

---

## 3. Permissions **nouvelles** — ✅ CRÉÉES (31/07/2026)

Les 8 permissions sont **implémentées** dans [`types/index.ts`](../../src/types/index.ts#L648) et
couvertes par le filet ([35 permissions × 4 rôles](../../src/tests/integration/rbac-role-baseline.integration.test.ts)),
plus 5 invariants sémantiques dédiés. Purement additif : aucun code ne les consulte encore, donc
aucun comportement modifié (601 tests verts).

⚠ La colonne `cuisinier` reste **théorique** — le rôle n'existe pas encore.

| Permission | super_admin | promoteur | gerant | serveur | cuisinier | Portée |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `canViewKitchenOrders` | ✅ | ✅ | ✅ | ✅ | ✅ | Voir la file cuisine. ⚠ Le **serveur** l'a : il doit voir ce qui est `ready` pour le retirer (§6.1 `serve`) |
| `canUpdateKitchenOrderStatus` | ✅ | ✅ | ✅ | ❌ | ✅ | `accept` / `start` / `mark_ready`. Le serveur ne fait **pas** avancer la production |
| `canServeKitchenItem` | ✅ | ✅ | ✅ | ✅ | ❌ | ⭐ `serve` crée la **vente** (§6.1). Le cuisinier ne l'a pas - cohérent avec `canSell: false` |
| `canManageRecipes` | ✅ | ✅ | ✅ | ❌ | ✅ | Plats, `dish_ingredients`, sous-recettes (§13.8) |
| `canManageIngredientStock` | ✅ | ✅ | ✅ | ❌ | ✅ | Appros, lots FEFO (§16.13), inventaire physique (§16.5) |
| `canCancelKitchenOrderItem` | ✅ | ✅ | ✅ | ❌ | ⚠ **partiel** | ⭐ Le cuisinier annule **avant** `ready` uniquement. Après `ready`, la matière est consommée → **gérant seul** (§6.1). Une seule permission ne peut pas exprimer cette borne : **le RPC doit trancher sur le statut**, pas la permission |
| `canRefundPrepaidKitchenItem` | ✅ | ✅ | ✅ | ❌ | ❌ | Imposé par §13.1 : « gérant / promoteur seulement en V1 ». Sortie de caisse |
| `canViewKitchenCosts` | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠ Marge et coût matière = information de gestion. Le cuisinier voit les **quantités**, pas les **montants** |

⭐ **Point d'attention sur `canCancelKitchenOrderItem`** : c'est le seul droit dont la borne est
**temporelle** (dépend du statut de la ligne). Le tenter par permission seule produirait soit un
cuisinier qui annule un plat déjà consommé, soit un cuisinier qui ne peut rien annuler. La règle
§6.1 - « `cancel` par le cuisinier interdit après `ready` » - doit être **appliquée par le RPC**
`cancel_kitchen_order_item`, avec la permission comme premier filtre seulement.

---

## 4. Inventaire SQL - `supabase/migrations/`

### 4.1 La seule vraie contrainte `CHECK` sur `bar_members.role`

| Fichier | Ligne | Contenu | Cuisinier concerné ? |
|---|---|---|---|
| [001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql#L76) | 76 | `role TEXT NOT NULL CHECK (role IN ('super_admin','promoteur','gerant','serveur'))` | ⭐ **OUI - bloquant**. Sans `ALTER`, tout `INSERT` d'un cuisinier échoue |

**C'est le seul point qui empêche physiquement l'existence d'un cuisinier.** Une migration
`ALTER TABLE public.bar_members DROP CONSTRAINT ... ADD CONSTRAINT ... CHECK (role IN (..., 'cuisinier'))`
suffit. Rétrocompatible : aucune ligne existante ne porte cette valeur.

⚠ **Hors `migrations/` - script de setup non couvert par l'inventaire initial** :
[`supabase/scripts/complete_setup.sql:68`](../../supabase/scripts/complete_setup.sql#L68) reproduit la
même contrainte (`DROP SCHEMA public CASCADE` + recréation complète). Il n'est **pas** joué en
production - c'est un script de reset pour environnement neuf - mais il diverge dès la migration 2
appliquée. **Décision : à mettre à jour en phase 0**, sinon toute base recréée depuis ce script
refusera les cuisiniers. Non bloquant, facile à oublier.

### 4.2 Seconde contrainte `CHECK` - table annexe

| Fichier | Ligne | Contenu | Cuisinier concerné ? |
|---|---|---|---|
| [20260127030000_add_onboarding_completion_and_versioning.sql](../../supabase/migrations/20260127030000_add_onboarding_completion_and_versioning.sql#L27) | 27 | `role TEXT NOT NULL CHECK (role IN ('promoteur','gerant','serveur'))` | ⭐ **OUI**. Un cuisinier qui se connecte déclenche l'onboarding → `INSERT` rejeté. À étendre **ou** à exclure explicitement de l'onboarding |

⚠ Ce point est **facile à manquer** : il ne casse pas à la création du compte mais au **premier
login** du cuisinier. À couvrir par un test.

### 4.3 Filtrages `role IN (...)` - RLS, RPC et guards (21 points)

Ce ne sont pas des contraintes : ce sont des **décisions d'autorisation**. Chacune doit être
requalifiée.

#### a) Filtrages « administration du bar » - cuisinier NON concerné

| Fichier | Ligne(s) | Filtre | Décision |
|---|---|---|---|
| [002_rls_policies.sql](../../supabase/migrations/002_rls_policies.sql#L75) | 75 | `role IN ('super_admin','promoteur')` | ❌ Non - administration |
| [004_custom_auth_complete.sql](../../supabase/migrations/004_custom_auth_complete.sql#L213) | 213 | idem | ❌ Non |
| [009_migrate_to_supabase_auth.sql](../../supabase/migrations/009_migrate_to_supabase_auth.sql#L207) | 207 | idem | ❌ Non |
| [016_fix_infinite_recursion.sql](../../supabase/migrations/016_fix_infinite_recursion.sql#L43) | 43 | idem | ❌ Non |
| [059_create_promotions_and_events.sql](../../supabase/migrations/059_create_promotions_and_events.sql#L287-L328) | 287, 328 | `role IN ('admin','owner','promoteur')` | ❌ Non - promotions (§15.2) |
| [20260203000000_add_cancelled_status_to_sales.sql](../../supabase/migrations/20260203000000_add_cancelled_status_to_sales.sql#L98) | 98 | `role IN ('promoteur','super_admin')` | ❌ Non - annulation de vente |
| [20260716000001_subscription_rpcs_trial_exempt_fedapay.sql](../../supabase/migrations/20260716000001_subscription_rpcs_trial_exempt_fedapay.sql#L380) | 380 | `role IN ('promoteur','gerant')` | ❌ Non - abonnement |
| [20260717000000_prepare_subscription_checkout_rpc.sql](../../supabase/migrations/20260717000000_prepare_subscription_checkout_rpc.sql#L65) | 65 | idem | ❌ Non |
| [20260726000000_cumulative_billing_and_free_months.sql](../../supabase/migrations/20260726000000_cumulative_billing_and_free_months.sql#L191) | 191 | idem | ❌ Non |
| [20260726000001_expose_months_overdue_in_views.sql](../../supabase/migrations/20260726000001_expose_months_overdue_in_views.sql#L52) | 52 | idem | ❌ Non |
| [20260719000000_create_whatsapp_agent_tables.sql](../../supabase/migrations/20260719000000_create_whatsapp_agent_tables.sql#L92) | 92 | `role IN ('promoteur','gerant','autre','inconnu')` | ❌ Non - **rôle déclaratif d'un lead WhatsApp**, sans rapport avec `bar_members` |

#### b) Filtrages « mode simplifié / création de vente » - ⭐ cuisinier concerné par **omission**

Ces politiques autorisent `('gerant','promoteur','super_admin')`. Le cuisinier en est **exclu de
fait**, ce qui est le comportement voulu (il ne vend pas). **Aucune modification requise** - mais
l'exclusion doit être **intentionnelle et testée**, pas subie.

| Fichier | Ligne(s) | Décision |
|---|---|---|
| [20251224130300_add_simplified_mode_sale_creation_policy.sql](../../supabase/migrations/20251224130300_add_simplified_mode_sale_creation_policy.sql#L58) | 58, 90, 101 | ✅ Exclusion correcte - **à couvrir par un test** |
| [20260103_fix_sold_by_in_simplified_mode.sql](../../supabase/migrations/20260103_fix_sold_by_in_simplified_mode.sql#L35) | 35, 52, 68, 86 | ✅ Exclusion correcte |
| [20260223180000_fix_simplified_mode_rls_and_rpc.sql](../../supabase/migrations/20260223180000_fix_simplified_mode_rls_and_rpc.sql#L21) | 21, 31 | ✅ Exclusion correcte |
| [20260102_remove_managers_from_server_name_mappings.sql](../../supabase/migrations/20260102_remove_managers_from_server_name_mappings.sql#L25) | 25 | ✅ Exclut déjà les non-serveurs des mappings. Cuisinier exclu **correctement** |

#### c) ⛔ Filtrages qui deviennent **faux** avec un cuisinier

| Fichier | Ligne | Contenu | Problème |
|---|---|---|---|
| [20260104184500_add_existing_member_rpcs.sql](../../supabase/migrations/20260104184500_add_existing_member_rpcs.sql#L54) | 54 | `bm.role IN ('gerant','serveur') -- Only operational staff` | ⭐ **Le commentaire dit « personnel opérationnel »**. Un cuisinier **est** du personnel opérationnel mais serait invisible dans la recherche de membres existants → impossible de le rattacher à un 2ᵉ bar. **À étendre** |
| [20260104184500_add_existing_member_rpcs.sql](../../supabase/migrations/20260104184500_add_existing_member_rpcs.sql#L80) | 80 | `p_role TEXT DEFAULT 'serveur'` | ⚠ Défaut silencieux : un appel sans `p_role` crée un serveur. Inoffensif aujourd'hui, piège demain. **À valider explicitement** |
| [20260402000000_enforce_plan_member_limit.sql](../../supabase/migrations/20260402000000_enforce_plan_member_limit.sql#L201) | 201 | `p_role TEXT DEFAULT 'serveur'` | ⚠ Idem |
| [20260227100000_harden_member_management_security.sql](../../supabase/migrations/20260227100000_harden_member_management_security.sql#L12) | 12, 215 | `valider p_role IN ('gerant','serveur')` | ⛔ **BLOQUANT** - `add_bar_member_v2` **rejette** `'cuisinier'`. Voir §4.4 |

#### d) Compteurs de plafond de membres - ✅ TRANCHÉ : le cuisinier consomme un siège

**Décision (31/07/2026) : oui, sans exception.** Un siège gratuit créerait une incitation à déclarer
des serveurs en cuisiniers. Le §12.1 note par ailleurs que le plafond a été levé comme blocage - il
n'y a donc aucune pression à créer une exception.

⭐ **Aucune modification requise : c'est déjà le comportement natif.**
`check_plan_member_limit` compte sans filtrer par rôle :

```sql
SELECT COUNT(*) INTO v_active_count
FROM public.bar_members
WHERE bar_id = p_bar_id AND is_active = TRUE;   -- aucun filtre sur role
```

Tout membre actif consomme un siège, quel que soit son rôle. Un cuisinier sera compté dès son
insertion, sans ligne de code à écrire.

⚠ **La fonction a été remplacée trois fois - seule la dernière version fait foi :**

| Migration | `starter` | Statut |
|---|:-:|---|
| [20260402000000](../../supabase/migrations/20260402000000_enforce_plan_member_limit.sql#L46) | 2 | ⛔ périmée |
| [20260524000000](../../supabase/migrations/20260524000000_update_plan_member_limits.sql#L47) | 3 | ⛔ périmée |
| ✅ [**20260727000000**](../../supabase/migrations/20260727000000_update_plan_member_limits_to_4.sql#L43) | **4** | **en vigueur** |

Plafonds actuels : **starter 4, pro 8, enterprise 20** - conformes à
[plans.ts](../../src/config/plans.ts#L59) et au §12.1 du plan. ⚠ `check_plan_member_limit` étant un
`CREATE OR REPLACE` répété, **toute lecture d'une migration isolée donne une valeur fausse**. Se
référer à la plus récente, ou à `plans.ts` qui est la source lisible.

**Trois conséquences :**

1. ✅ **La restauration tient dans `starter`** - conformément au §12.1, qui a explicitement levé ce
   point comme faux blocage : promoteur + cuisinier + serveur = **3** (une place libre) ; avec un
   gérant = **4** (exactement le plafond). Aucune restriction commerciale à prévoir pour le module
   cuisine.
2. **Le garde-fou anti-double-comptage existe déjà**
   ([lignes 22-30](../../supabase/migrations/20260727000000_update_plan_member_limits_to_4.sql#L22-L30)) :
   un membre déjà actif ne repasse pas le check. Requalifier un serveur en cuisinier **ne consommera
   pas** un second siège - comportement correct, à conserver.
3. **`is_active = FALSE` libère le siège.** Un cuisinier saisonnier désactivé rend sa place. Cohérent
   avec les autres rôles, rien à changer.

⚠ **Point d'UX déjà noté au §12.1** : le message de limite atteinte doit rester actionnable
(« votre plan Starter permet 4 personnes, passez à Pro ») - il sera désormais rencontré en tentant
d'ajouter un cuisinier, un chemin nouveau.

**À couvrir par un test** : « ajouter un cuisinier sur un bar au plafond échoue avec le message de
limite de plan ». La décision étant portée par le comportement natif et non par du code dédié, le
test est le seul élément qui empêchera une régression future d'introduire une exemption par
inadvertance.

### 4.4 ⛔ Les deux points durs SQL nommés par le §12.5

#### `create_sale_idempotent` - ✅ CORRIGÉ (migration Pré-0 écrite le 31/07/2026)

⚠ **Correction de périmètre** : ce RPC a été redéfini par **9 migrations** successives
(`CREATE OR REPLACE`). La version en vigueur n'est **pas** celle de mars citée ci-dessous mais
[20260704073000_restore_strict_price_guard.sql](../../supabase/migrations/20260704073000_restore_strict_price_guard.sql),
qui ajoute le garde-fou prix et le stock check. Même piège que les plafonds de plan (§4.3d) : lire
une migration isolée donne un corps périmé.

→ Correctif livré : [20260731120000_whitelist_create_sale_roles.sql](../../supabase/migrations/20260731120000_whitelist_create_sale_roles.sql),
écrit depuis le corps du 04/07 (diff vérifié : **+8 lignes de guard, 245 lignes identiques**).
**Non encore appliqué** - à exécuter à la main dans le SQL Editor, pré-vol et post-vol inclus.

Guard d'origine, conservé ci-dessous pour mémoire :

```sql
IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN
    RAISE EXCEPTION 'Access denied: serveur role cannot create sales in simplified mode';
END IF;
```

**Analyse.** Le guard ne bloque que le couple (`simplified`, `serveur`). Un cuisinier appelant ce RPC
en **mode complet** passerait donc **sans aucun contrôle** et créerait une vente. C'est une
**escalade de privilège** directe : le cuisinier n'a pas `canSell`, mais rien en base ne l'en empêche.

⚠ Aggravant : §13.4 impose que la restauration exige le **mode complet**. Un bar avec cuisine est donc
**toujours** dans la branche non couverte par ce guard. Le trou n'est pas un cas limite, c'est le cas
nominal.

→ Réponse complète en **Q2 (§7)**.

#### RLS `bar_members` UPDATE - [20260218000000](../../supabase/migrations/20260218000000_harden_bar_members_role_update_rls.sql#L33)

```sql
WITH CHECK (
  is_super_admin() OR
  get_user_role(bar_id) = 'promoteur' OR
  (get_user_role(bar_id) = 'gerant' AND role = 'serveur')
)
```

**Analyse.** Un gérant ne peut poser que `role = 'serveur'`. Il ne pourra donc **jamais** promouvoir
ni rétrograder un cuisinier, même si on l'y autorise ailleurs. La clause est une **liste blanche à un
seul élément**, ce qui est exactement le motif que §13.16 demande de nettoyer.

→ Réponse complète en **Q1 (§7)**.

---

## 5. Inventaire frontend - `src/` (19 tests de rôle décisionnels)

Les 57 fichiers contenant `'serveur'` se répartissent en trois familles. **Seule la première porte un
risque.**

### 5.1 ⛔ Décisions par rôle brut - le vrai périmètre (15 décisions réelles)

Motif : `role === 'serveur'` utilisé pour **décider**. La branche `else` signifie implicitement
« gérant ou promoteur » et **accueillerait un cuisinier**.

| # | Fichier | Ligne | Décision prise | Cuisinier concerné ? | Remplacement |
|---|---|---|---|:-:|---|
| 1 | [useSalesMutations.ts](../../src/hooks/mutations/useSalesMutations.ts#L318) | 318 | Message d'alerte offline différencié | ⚠ **Cosmétique** - un cuisinier ne vend pas, ne l'atteint jamais | - |
| 2 | [QuickSaleFlow.tsx](../../src/components/QuickSaleFlow.tsx#L225) | 225 | ⭐ **Statut de la vente : `pending` vs `validated`** | ⛔ **OUI - critique**. Un cuisinier tomberait dans `else` → vente **`validated`** directement | `canSell` + `canValidateSales` |
| 3 | [QuickSaleFlow.tsx](../../src/components/QuickSaleFlow.tsx#L301) | 301 | Blocage écran en mode simplifié | ⚠ Voir §13.4 (cuisine ⟹ mode complet) | `canSell` |
| 4 | [Cart.tsx](../../src/components/Cart.tsx#L82) | 82 | Blocage vente offline | ⛔ **OUI** - un cuisinier hérite du droit de vendre offline | `canSell` |
| 5 | [Cart.tsx](../../src/components/Cart.tsx#L147) | 147 | Affichage du panier | ⛔ **OUI** | `canSell` |
| 6 | [AppProvider.tsx](../../src/context/AppProvider.tsx#L135) | 135 | Blocage `addToCart` mode simplifié | ⛔ **OUI** - `addToCart` autorisé au cuisinier | `canSell` |
| 7 | [useTickets.ts](../../src/hooks/queries/useTickets.ts#L106) | 106 | Filtrage des tickets par serveur | ⛔ **OUI** - un cuisinier verrait **tous** les tickets du bar | `canViewAllSales` |
| 8 | [useDashboardAnalytics.ts](../../src/hooks/useDashboardAnalytics.ts#L49) | 49 | Périmètre analytics (`serverId` ou global) | ⛔ **OUI** - fuite : analytics **globales** au cuisinier | `canViewAllSales` |
| 9 | [useRevenueStats.ts](../../src/hooks/useRevenueStats.ts#L274) | 274 | Périmètre du CA | ⛔ **OUI** - fuite de CA | `canViewAllSales` |
| 10 | [useSalesFilters.ts](../../src/features/Sales/SalesHistory/hooks/useSalesFilters.ts#L37) | 37, 81 | Filtrage historique | ⛔ **OUI** - historique complet visible | `canViewAllSales` |
| 11 | [SalesHistoryPage.tsx](../../src/pages/SalesHistoryPage.tsx#L170) | 170 | Périmètre historique | ⛔ **OUI** | `canViewAllSales` |
| 12 | [useUnifiedReturns.ts](../../src/hooks/pivots/useUnifiedReturns.ts#L196) | 196 | Filtrage des retours | ⛔ **OUI** | `canViewAllSales` |
| 13 | [ReturnsPage.tsx](../../src/pages/ReturnsPage.tsx#L91) | 91, 196 | Lecture seule vs édition | ⛔ **OUI** - droits d'édition des retours | `canCancelSales` |
| 13b | [ReturnsPage.tsx](../../src/pages/ReturnsPage.tsx#L542) | 542 | Choix du `guideId` | ✅ Cosmétique - **pas** une autorisation | - |
| 14 | [ConsignmentPage.tsx](../../src/pages/ConsignmentPage.tsx#L35) | 35, 134, 366 | Lecture seule vs édition | ⛔ **OUI** | `canCreateConsignment` |
| 14b | [ConsignmentPage.tsx](../../src/pages/ConsignmentPage.tsx#L53) | 53 | Choix du `guideId` | ✅ Cosmétique - **pas** une autorisation | - |
| 15 | [ProductHistoryModal.tsx](../../src/components/inventory/ProductHistoryModal.tsx#L215) | 215 | Masquage de données | ⛔ **OUI** | `canViewInventory` |
| 16 | [SettingsPage.tsx](../../src/pages/SettingsPage.tsx#L325) | 325 | Restriction de réglages | ⛔ **OUI** | `canManageSettings` |
| 17 | [SettingsPage.tsx](../../src/pages/SettingsPage.tsx#L56) | 56 | `['gerant','serveur'].includes(role)` | ⛔ **OUI** - liste blanche, exclut le cuisinier **par accident** | permission explicite |
| 18 | [useInventoryActions.ts](../../src/hooks/useInventoryActions.ts#L94) | 94 | `['gerant','serveur'].includes(role)` | ⛔ **OUI** - idem | `canManageInventory` |
| 19 | [TeamPerformanceTable.tsx](../../src/components/analytics/TeamPerformanceTable.tsx#L31) | 31 | Filtre `role === 'serveur'` | ✅ **Légitime** - compte les serveurs, pas une autorisation. À conserver |
| 20 | [DashboardPage.tsx](../../src/pages/DashboardPage.tsx#L32) | 32 | Choix du guide d'onboarding | ⚠ Cosmétique - prévoir un guide cuisinier |
| 21 | [bars.service.ts](../../src/services/supabase/bars.service.ts#L628) | 628 | ⭐ **Le seul `role !== 'serveur'`** : `if (role !== 'gerant' && role !== 'serveur')` → rejet | ⛔ **BLOQUANT** - rejette `'cuisinier'` côté client. À étendre |

⭐ **Le motif de fuite dominant** : sur les 19 points, **7** (n° 7 à 12, plus 8-9) décident du
**périmètre de lecture des données financières** via `isServerRole ? mine : all`. Un cuisinier
tomberait systématiquement dans `all`. C'est la conséquence la plus lourde de l'ajout naïf du rôle :
**le cuisinier verrait le chiffre d'affaires complet du bar**, alors que la matrice §2 lui refuse
`canViewAllSales` **et** `canViewAccounting`.

### 5.1bis ⛔⛔ DÉFAUT DE PÉRIMÈTRE — la liste blanche positive, non inventoriée

> Découvert le 31/07/2026 lors de la certification des points 3-4 du nettoyage. **L'inventaire §5.1
> était incomplet.**

Le §5.1 n'a cherché que le motif `role === 'serveur'` (négation implicite). Il existe un **second
motif, symétrique et tout aussi dangereux** : la **liste blanche positive** de rôles.

```typescript
// useSalesMutations.ts:233 — NON inventorié en §5.1
const isManagerOrAdmin = role === 'super_admin' || role === 'promoteur' || role === 'gerant';
const finalStatus = (isManagerOrAdmin || isSimplifiedMode) ? 'validated' : (saleData.status || 'pending');
```

⚠ **Pourquoi c'est différent de §5.1** : ce motif est **sûr à l'ajout d'un rôle** (un cuisinier n'est
pas dans la liste → il tombe dans `pending`, comportement voulu). Il ne crée donc **pas** de faille.
Mais il **contourne la couche de permissions** : deux endroits décident du même statut de vente selon
deux mécanismes différents.

⛔ **Conséquence concrète et immédiate** : `QuickSaleFlow` passe `status` à `createSale`, mais
[useSalesMutations.ts:237](../../src/hooks/mutations/useSalesMutations.ts#L237) **le recalcule et
l'écrase**. Le nettoyage du §6 zone 5 est donc **partiellement inopérant** tant que ce point n'est
pas traité — `canValidateSales` ne pilote réellement que le chemin `AppProvider.addSale`.

#### Points recensés (liste blanche positive décidant d'un statut ou d'un droit)

| Fichier | Ligne | Décision | Cuisinier |
|---|---|---|:-:|
| [useSalesMutations.ts](../../src/hooks/mutations/useSalesMutations.ts#L233) | 233, 237 | ⭐ **Statut de vente — écrase celui de QuickSaleFlow** | ✅ sûr (exclu) mais **doit passer par `canValidateSales`** |
| [AppProvider.tsx](../../src/context/AppProvider.tsx#L303) | 303 | Statut de vente (`addSale`) | ✅ sûr, à aligner |
| [AppProvider.tsx](../../src/context/AppProvider.tsx#L358) | 358 | Statut de vente | ✅ sûr, à aligner |
| [AppProvider.tsx](../../src/context/AppProvider.tsx#L392) | 392 | Statut de retour (`approved`) | ✅ sûr, à aligner |
| [AppProvider.tsx](../../src/context/AppProvider.tsx#L414) | 414 | Statut de vente liée | ✅ sûr, à aligner |
| [AppProvider.tsx](../../src/context/AppProvider.tsx#L450) | 450, 470 | Droit `updateReturn` / `deleteReturn` — ⚠ déjà mixte (`hasPermission \|\| role`) | ✅ sûr, à simplifier |
| [PurchaseOrdersTab.tsx](../../src/components/inventory/PurchaseOrdersTab.tsx#L79) | 79-81 | Droit de gestion des commandes | ✅ sûr, à aligner |
| [ExpenseManager.tsx](../../src/components/ExpenseManager.tsx#L78) | 78 | Droit d'appro | ✅ sûr, à aligner |
| [SettingsPage.tsx](../../src/pages/SettingsPage.tsx#L51) | 51 | Vue promoteur | ✅ sûr, à aligner |
| [SubscriptionReminder.tsx](../../src/components/SubscriptionReminder.tsx#L30) | 30 | Affichage rappel d'abonnement | ✅ sûr |
| [ProductHistoryModal.tsx](../../src/components/inventory/ProductHistoryModal.tsx#L55) | 55 | Droit `canManageSupplies` — aligné sur un RPC serveur | ⚠ à vérifier contre le RPC |

**Hors périmètre** (légitimes, à conserver) : `RootLayout`/`AdminLayout`/`Header`/`ThemeContext`/
`BarContext` testent `super_admin` pour du **routage et du thème**, pas des droits métier.
`TeamManagementPage`/`BarCard`/`ServerMappingsManager` filtrent ou libellent des rôles — ce sont des
données, pas des autorisations.

#### ✅ Décision — TOUS traités (31/07/2026)

Sur demande explicite du fondateur (« je veux un travail parfait »), les points ont été corrigés au
lieu d'être laissés en dette. Permission retenue pour chacun, choisie sur **profil identique** à la
liste blanche remplacée (vérifié par extraction de `ROLE_PERMISSIONS`) :

| Fichier | Permission retenue | Profil |
|---|---|---|
| `useSalesMutations.ts` | `canValidateSales` | ⭐ écrasait le statut de QuickSaleFlow |
| `AppProvider` ×2 (ventes) | `canValidateSales` | super_admin+promoteur+gerant |
| `AppProvider` ×2 (retours) | `canManageInventory` | idem — déjà la permission des retours |
| `AppProvider` `updateReturn`/`deleteReturn` | `canManageInventory` seule | `\|\| role` redondant supprimé |
| `PurchaseOrdersTab` | `canManageInventory` | idem |
| `ExpenseManager`, `ProductHistoryModal` | `canManageExpenses` | super_admin+promoteur **seulement** |
| `SettingsPage` (onglet bar) | `canCreateBars` | super_admin+promoteur (pas `canManageBarInfo`, que le gérant a aussi) |
| `SettingsPage` (garde d'accès) | `canManageSettings` | ⭐ garde de sécurité, manqué par §5.1 |
| `ConsignmentPage` ×3 | `canCreateConsignment` / `canViewAllSales` | selon droit vs périmètre |
| `ReturnsPage` ×2 | `canManageInventory` / `canViewAllSales` | idem |
| `BonStrip`, `FaireLePointModal` | `canViewAllSales` | affichage du nom des collègues |
| `Header` ×2 (BarSelector) | `canSwitchBars` | super_admin n'atteint pas ce Header (AdminLayout) |

⚠ **Un troisième balayage a été nécessaire.** La recherche par motif (`role === 'serveur'`, puis
liste blanche positive) restait incomplète : un balayage **exhaustif ligne à ligne** de tout `src/`
a révélé 8 points supplémentaires (`ConsignmentPage`, `ReturnsPage`, `BonStrip`,
`FaireLePointModal`, garde `SettingsPage`). **Leçon : chercher un motif ne prouve rien sur les
autres — seul un balayage exhaustif conclut.**

#### Conservés volontairement — tests de rôle légitimes

| Fichier | Raison |
|---|---|
| `RootLayout`, `AdminLayout` | **Routage** : `super_admin` → `/admin`. Pas une autorisation métier |
| `Header`, `MobileSidebar` (super_admin) | **Thème et libellés** de la vue admin |
| `ThemeContext`, `themeHelpers` | **Thème** forcé indigo pour super_admin |
| `BarContext` ×2 | **Chargement** des bars : super_admin voit tout |
| `MobileSidebar:185` (`isGrouped`) | **Ergonomie** : groupement du menu, pas un droit |
| `SubscriptionReminder` | **Ciblage d'appel réseau**, exclut super_admin — aucune permission n'a ce profil |
| `ConsignmentPage:55`, `ReturnsPage:545`, `SalesHistoryPage:65` | Choix de `guideId` — cosmétique |
| `useSalesMutations:322` | Message d'alerte offline — cosmétique |
| `TeamPerformanceTable`, `BarCard`, `ServerMappingsManager` | Filtres/libellés de **données**, pas des droits |

### 5.2 ✅ Usages sans risque - littéral de donnée (11 fichiers)

Guides, stories, tests, libellés d'affichage, valeurs par défaut de `useState`, types
d'énumération. Aucune décision d'autorisation.

[serveur-guides.ts](../../src/data/guides/serveur-guides.ts), [owner-guides.ts](../../src/data/guides/owner-guides.ts),
[RoleSwitcher.stories.tsx](../../src/components/ui/RoleSwitcher.stories.tsx),
[useCanWorkOffline.test.ts](../../src/hooks/useCanWorkOffline.test.ts),
[rbac-filtering.integration.test.tsx](../../src/tests/integration/rbac-filtering.integration.test.tsx),
[BarCard.test.tsx](../../src/components/BarCard.test.tsx), [themeHelpers.test.ts](../../src/theme/themeHelpers.test.ts),
[bars.service.test.ts](../../src/services/supabase/bars.service.test.ts),
[auth.service.test.ts](../../src/services/supabase/auth.service.test.ts),
[usePlan.test.ts](../../src/hooks/usePlan.test.ts), [TrainingTab.tsx](../../src/components/TrainingTab.tsx).

⚠ Sans risque **fonctionnel**, mais les tests RBAC (§8) devront être **étendus** au cuisinier.

### 5.3 ⚠ Types et listes de rôles - à étendre mécaniquement (10 points)

| Fichier | Ligne | Contenu |
|---|---|---|
| [src/types/index.ts](../../src/types/index.ts#L4) | 4 | `export type UserRole = 'super_admin' \| 'promoteur' \| 'gerant' \| 'serveur'` ⭐ **source de vérité** |
| [src/types/guide.ts](../../src/types/guide.ts#L6) | 6 | Duplication du type |
| [OnboardingContext.tsx](../../src/context/OnboardingContext.tsx#L36) | 36 | 3ᵉ duplication (+ alias `owner`/`manager`/`bartender`) |
| [validation.ts](../../src/utils/validation.ts#L93) | 93 | `validRoles = [...]` - **rejetterait un cuisinier** |
| [auth.service.ts](../../src/services/supabase/auth.service.ts#L13) | 13, 59, 352 | Unions inline |
| [bars.service.ts](../../src/services/supabase/bars.service.ts#L727) | 727 | Union inline |
| [MobileSidebar.tsx](../../src/components/MobileSidebar.tsx#L50) | 50, 158-169 | Union + listes `roles:` par entrée de menu |
| [MobileNavigation.tsx](../../src/components/MobileNavigation.tsx#L21) | 21, 59-95 | Idem |
| [admin.service.ts](../../src/services/supabase/admin.service.ts#L52) | 52 | `roleFilter` |
| [UsersManagementPage.tsx](../../src/pages/admin/UsersManagementPage.tsx#L40) | 40, 166, 169 | Filtre admin |

⚠ **`UserRole` est dupliqué 3 fois.** Ajouter `'cuisinier'` à un seul endroit produit une
incohérence que `strict: true` ne détectera pas partout (les unions inline des services sont
structurellement distinctes). **Recommandation : consolider avant d'étendre.**

⭐ **Point positif** : `MobileSidebar` et `MobileNavigation` déclarent un tableau `roles:` par entrée
de menu. L'ajout de `'cuisinier'` y est **additif et sûr** - un rôle absent d'un tableau ne voit pas
l'entrée. C'est le seul endroit du code où le motif « liste blanche » joue en notre faveur.

---

## 6. Décisions par rôle brut à remplacer AVANT l'ajout du rôle (§13.16)

Ordre imposé. Ces remplacements ne changent **aucun comportement** pour les 4 rôles actuels - ils
sont vérifiables par les tests existants.

### Zone critique 1 - `create_sale_idempotent` (SQL)

Remplacer la liste noire par une **liste blanche**, qui est le seul motif sûr à l'ajout d'un rôle :

```sql
-- ❌ Avant : liste noire - tout nouveau rôle passe
IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN

-- ✅ Après : liste blanche - tout nouveau rôle est refusé par défaut
IF v_caller_role NOT IN ('serveur','gerant','promoteur','super_admin') THEN
    RAISE EXCEPTION 'Access denied: role % cannot create sales', v_caller_role;
END IF;
IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN
```

Comportement inchangé pour les 4 rôles actuels. ⚠ `CREATE OR REPLACE` perd les grants (§13.15) :
re-`REVOKE`/`GRANT` + post-vol `has_function_privilege`.

### Zone critique 2 - RLS `bar_members` UPDATE (SQL)

```sql
-- ✅ Après : le gérant gère les rôles opérationnels, énumérés explicitement
(get_user_role(bar_id) = 'gerant' AND role IN ('serveur','cuisinier'))
```

⚠ Cette clause est la **seule** dont le nettoyage exige de nommer `'cuisinier'` : elle ne peut donc
être appliquée qu'**en même temps** que la migration `CHECK` (§4.1), pas avant.

### Zone critique 3 - `bars.service.ts:628` (client)

Liste blanche déjà correcte dans sa forme, à étendre au moment de l'ajout du rôle.

### Zone critique 4 - Les 7 filtres de périmètre financier (client)

⭐ **Le nettoyage à plus fort effet de levier.** Remplacer partout :

⚠ **Correction (31/07/2026)** : `usePermissions` **n'existe pas** dans le code, malgré sa
documentation dans les deux `CLAUDE.md` (`const { canAccess, isRole } = usePermissions()`). Aucun
fichier ne le définit. Le mécanisme réel est **`hasPermission`**, exposé par `useAuth` :

```
ROLE_PERMISSIONS[role]  →  getPermissionsByRole()  →  session.permissions  →  hasPermission()
   types/index.ts:665       types/index.ts:795        AuthContext.tsx:72      AuthContext.tsx:369
```

⛔ Ne pas écrire le nettoyage avec `usePermissions` : il faudrait d'abord créer le hook. Utiliser
`hasPermission`, déjà disponible partout via `useAuth`.

```typescript
// ❌ Avant : la branche else = « tout voir »
const isServerRole = currentSession?.role === 'serveur';
const scope = isServerRole ? currentUserId : undefined;

// ✅ Après : le droit de tout voir est explicite
const { hasPermission } = useAuth();
const scope = hasPermission('canViewAllSales') ? undefined : currentUserId;
```

Fichiers : `useTickets.ts`, `useDashboardAnalytics.ts`, `useRevenueStats.ts`, `useSalesFilters.ts`,
`SalesHistoryPage.tsx`, `useUnifiedReturns.ts`, `ProductHistoryModal.tsx`.

Comportement identique pour les 4 rôles (`canViewAllSales` est `false` pour le seul `serveur`) - donc
vérifiable par [rbac-filtering.integration.test.tsx](../../src/tests/integration/rbac-filtering.integration.test.tsx)
avant/après, sans modifier le test.

### Zone critique 5 - `QuickSaleFlow.tsx:225` (client)

```typescript
// ❌ Avant : un cuisinier créerait une vente 'validated'
status: (currentSession.role === 'serveur') ? 'pending' : 'validated',

// ✅ Après
status: hasPermission('canValidateSales') ? 'validated' : 'pending',
```

⚠ `canValidateSales` **n'existe pas** aujourd'hui : à créer (`true` pour gerant/promoteur/super_admin,
`false` pour serveur) - dérivable sans changement de comportement.

### Zone critique 6 - `useCanWorkOffline.ts:24`

```typescript
const isManagerRole = ['gerant','promoteur','super_admin'].includes(role || '');
```

✅ **Liste blanche - déjà sûre.** Un cuisinier sera `false` par défaut. Décision : **conforme et
voulue** (§13.5 : `mark_ready` et `serve` exigent le réseau). À documenter, ne pas modifier.

---

## 7. Réponses aux 4 questions ouvertes du §12.5

### Q1 - Un gérant peut-il créer un cuisinier ?

**Oui.** Le gérant est responsable de l'exploitation quotidienne ; exiger le promoteur pour recruter un
cuisinier bloquerait le service. Le §12.5 l'anticipait (« probablement oui »).

**Trois modifications concordantes, sinon la décision est inopérante :**

1. RLS [20260218000000](../../supabase/migrations/20260218000000_harden_bar_members_role_update_rls.sql#L33) :
   `(get_user_role(bar_id) = 'gerant' AND role IN ('serveur','cuisinier'))`
2. RPC `add_bar_member_v2` ([20260227100000](../../supabase/migrations/20260227100000_harden_member_management_security.sql#L12)) :
   validation `p_role IN ('gerant','serveur','cuisinier')`
3. Client [bars.service.ts:628](../../src/services/supabase/bars.service.ts#L628) : même extension

⚠ **L'escalade reste bloquée** : le garde-fou anti-escalade
([20260227100000:215](../../supabase/migrations/20260227100000_harden_member_management_security.sql#L215),
`IF v_target_role IN ('promoteur','super_admin')`) est **inchangé**. Un gérant ne peut donc pas
transformer un cuisinier en promoteur. Le cuisinier étant au niveau 4 comme le serveur, l'autoriser
n'ouvre **aucun** chemin d'élévation.

**Permission portant la décision** : `canCreateServers` est mal nommée pour cet usage. Deux options -
réutiliser `canCreateServers` (le gérant l'a déjà, coût nul) ou créer `canCreateKitchenStaff`.
**Recommandation : réutiliser `canCreateServers`**, en la renommant mentalement « créer du personnel
opérationnel ». Créer une permission dont la valeur serait identique à une existante pour les 5 rôles
n'apporte rien qu'un point de désynchronisation.

### Q2 - Que fait le guard `create_sale` pour un cuisinier ?

**Il doit refuser, en toutes circonstances.** Le cuisinier n'a pas `canSell` (§2, permission n° 9) : la
vente naît du `serve` effectué par le **serveur** (§6.1).

**État actuel : le guard ne le ferait pas.** Il ne teste que (`simplified`, `serveur`). En mode
complet - **le seul mode où la cuisine existe** (§13.4) - un cuisinier appelant le RPC créerait une
vente valide. Ce n'est pas un cas limite : c'est le cas nominal d'un bar avec restauration.

**Correctif** : liste blanche (§6, zone 1), appliqué **avant** l'ajout du rôle. Ainsi, le jour où
`'cuisinier'` devient une valeur légale, le RPC le refuse **déjà**, sans migration supplémentaire.
C'est précisément ce que §13.16 veut obtenir en imposant l'ordre.

⚠ **Le bypass `service_role` reste ouvert** (SyncManager, migrations, tests). C'est voulu et
inchangé - mais cela signifie que le guard ne protège pas contre une opération rejouée depuis la file
offline. Cohérent avec §13.5, qui interdit `serve` hors ligne.

### Q3 - Les 30 permissions doivent-elles toutes être définies ?

**Les 26 requises : oui, explicitement à `false`.** Les 4 optionnelles (`canAccessAdminDashboard?`,
`canManagePromoteurs?`, `canViewGlobalStats?`, `canSuspendBars?`) : **non - à omettre**, comme le font
déjà `promoteur`, `gerant` et `serveur`.

**Raison technique** : `RolePermissions` déclare les 26 premières comme **non optionnelles**.
`ROLE_PERMISSIONS` étant typé `Record<UserRole, RolePermissions>`, TypeScript en `strict` **refusera
de compiler** une entrée `cuisinier` incomplète. La contrainte est donc déjà appliquée par le
compilateur - il n'y a pas de discipline à inventer, seulement à ne pas la contourner.

⚠ **Piège à éviter** : ne **jamais** écrire `...ROLE_PERMISSIONS.serveur` puis surcharger. Un
cuisinier hériterait de `canSell: true` et `canViewOwnSales: true` - exactement les deux permissions
que §2 lui refuse. Les 26 valeurs doivent être **écrites une par une**, et c'est aussi ce qui rend la
revue possible.

Les **8 permissions nouvelles** (§3) doivent en revanche être définies pour **les 5 rôles**, sans
quoi l'ajout d'un champ requis casse la compilation des 4 entrées existantes - ce qui est le
comportement souhaité : le compilateur force à trancher pour chaque rôle.

### Q4 - Quels `role !== 'serveur'` deviennent faux ?

**Reformulation nécessaire.** Le littéral `role !== 'serveur'` n'existe qu'**une fois**
([bars.service.ts:628](../../src/services/supabase/bars.service.ts#L628), sous la forme
`role !== 'gerant' && role !== 'serveur'`) - et celui-là est une **liste blanche**, donc sûr : il
rejette le cuisinier, ce qui est un blocage à lever, pas une faille.

**Le motif dangereux est la négation implicite** : `isServerRole ? A : B`, où `B` vaut « gérant ou
promoteur ». Sur les 28 occurrences réparties dans 18 fichiers, **15 sont des décisions
d'autorisation** dont la branche `else` devient fausse (les autres sont des `guideId`, des libellés,
un filtre statistique et une ligne commentée).

**Classement par gravité :**

| Gravité | Nombre | Points | Conséquence si non traité |
|---|:-:|---|---|
| ⛔ **Fuite de données financières** | 7 | n° 7, 8, 9, 10, 11, 12, 13 (§5.1) | Le cuisinier voit **le CA complet**, l'historique de toutes les ventes, tous les tickets. Contredit `canViewAllSales: false` et `canViewAccounting: false` |
| ⛔ **Escalade fonctionnelle** | 4 + SQL | n° 2, 4, 5, 6 (§5.1) + guard `create_sale` (Q2) | Le cuisinier peut **vendre**, et sa vente naît **`validated`** - sans passer par la validation gérant |
| ⚠ **Droits d'édition indus** | 4 | n° 14, 15, 16, 17, 18 (§5.1) | Édition des consignations, réglages, inventaire, masquage de données |
| ⚠ **Blocages à lever** | 4 | n° 21, `validation.ts:93`, §4.2, `complete_setup.sql` (§4.1) | Le cuisinier ne peut pas être créé / ne peut pas se connecter |
| ✅ Sans risque | 5 | n° 1, 3, 19, 20 + n° 13b/14b | Guides, libellés, filtre statistique, code commenté |

⭐ **Réponse courte à la question du plan** : la crainte du §12.5 est **fondée mais mal localisée**.
Le risque ne vient pas de la négation explicite (1 occurrence, inoffensive) mais du ternaire de
périmètre (`isServerRole ? mine : all`), qui est le motif dominant du code de lecture des données
financières. C'est là que doit porter l'effort de la phase Pré-0.

---

## 8. Tests obligatoires (§12.5 livrable 3, §13.15)

| Test | Objet | Fichier cible |
|---|---|---|
| Permissions du cuisinier | Les 26 requises à `false` + les 8 nouvelles conformes à §3 | nouveau `rbac-cuisinier.test.ts` |
| ⛔ Le cuisinier **ne peut pas vendre** | `canSell: false` **et** `create_sale_idempotent` rejette | test + smoke-test SQL via UI |
| ⛔ Le cuisinier **ne peut pas valider** une vente | `canValidateSales: false` | idem |
| ⛔ Le cuisinier **ne lit pas** la comptabilité | `canViewAccounting: false` | idem |
| ⭐ Le cuisinier ne voit **que ses données** | Les 7 filtres de §6 zone 4 renvoient un périmètre restreint | extension de `rbac-filtering.integration.test.tsx` |
| Non-régression des 4 rôles | Comportement **identique** avant/après le nettoyage §6 | tests existants, inchangés |
| Gérant crée un cuisinier | Q1 - RLS + RPC + client | test d'intégration |
| Gérant **ne peut pas** promouvoir | Anti-escalade toujours actif | test d'intégration |
| Login d'un cuisinier | §4.2 - onboarding ne rejette pas | test d'intégration |
| ⭐ Le cuisinier **consomme un siège** | Ajout sur un bar au plafond → échec « limite de membres » (§4.3d) | test d'intégration |
| Requalification serveur → cuisinier | **Ne consomme pas** un 2ᵉ siège (garde-fou `v_already_member`) | test d'intégration |

⚠ **Le test de non-régression est le plus important** : tout le nettoyage §6 repose sur l'affirmation
« comportement inchangé pour les 4 rôles actuels ». Cette affirmation doit être **vérifiée**, pas
supposée.

---

## 9. Procédure de migration SQL (§13.15)

Migrations à l'unité, nommage `YYYYMMDDHHMMSS_description_slug.sql`, template
[MIGRATION_TEMPLATE.sql](../migrations/MIGRATION_TEMPLATE.sql).

⚠ **Exécution à la main dans le SQL Editor Supabase** - jamais `db push`.

### Ordre imposé

| # | Migration | Contenu | Phase |
|---|---|---|---|
| 1 | ⏸ [`20260731120000_whitelist_create_sale_roles.sql`](../../supabase/migrations/20260731120000_whitelist_create_sale_roles.sql) — **écrite, pré-vol validé, EN ATTENTE** | Liste blanche dans `create_sale_idempotent` (§6 zone 1) | **Pré-0** |

### ✅ Migration 1 — APPLIQUÉE EN PRODUCTION le 02/08/2026

Reportée du 31/07 (vendredi soir = plein service), appliquée **dimanche matin, bars fermés**.

**Pré-vol** (31/07, contrôle n° 4 re-joué le 02/08) :

| # | Contrôle | Résultat |
|---|---|---|
| 1 | Versions de la fonction | 1 seule (`oid` 195621), `prosecdef = true` |
| 2 | Privilèges AVANT | `anon=false`, `authenticated=true`, `service_role=true` |
| 3 | ⭐ Corps déployé | **Identique à `20260704073000`** — confirme la bonne base de départ |
| 4 | Rôles actifs | `promoteur`, `serveur`, `super_admin`, `gerant` |

**Post-vol** — les 4 contrôles conformes :

| # | Contrôle | Résultat |
|---|---|---|
| 1 | ⭐ **Grants après `CREATE OR REPLACE`** | `anon=false`, `auth=true`, `svc=true` — **identiques au pré-vol** |
| 2 | Version unique + sécurité | `nb_versions=1`, `prosecdef=true`, `search_path=public, extensions` |
| 3 | Guard déployé | `guard_ok = true` — la liste blanche est bien celle qui tourne |
| 4 | Rôles actifs | inchangés — aucune vente légitime ne peut être refusée |

⭐ **Le contrôle n° 1 était le point critique** : `CREATE OR REPLACE` perd les grants dans cette base
(`proacl NULL` = exécutable par `anon`). Le bloc `REVOKE`/`GRANT` de la migration a compensé — pas de
brèche.

⏭ **Reste** : smoke-tests par l'UI (checklist en bas du fichier de migration). Le guard n'est **pas**
observable depuis le SQL Editor — `auth.uid()` y vaut `NULL`, le bloc entier est court-circuité.

**Rollback si besoin** : rejouer
[20260704073000_restore_strict_price_guard.sql](../../supabase/migrations/20260704073000_restore_strict_price_guard.sql).
| 2 | `..._extend_bar_members_role_check.sql` | `CHECK` + `'cuisinier'` (§4.1) | 0 |
| 3 | `..._extend_onboarding_role_check.sql` | `CHECK` onboarding (§4.2) | 0 |
| 4 | `..._allow_gerant_manage_kitchen_staff.sql` | RLS `bar_members` (Q1) | 0 |
| 5 | `..._extend_add_bar_member_v2_roles.sql` | `add_bar_member_v2` + RPC de recherche (§4.3c) | 0 |

⭐ La migration 1 est en **Pré-0** : elle ne mentionne pas `'cuisinier'` et ne change rien au
comportement actuel. C'est l'application littérale de l'ordre imposé par §13.16 - le RPC est durci
**avant** que le rôle n'existe.

### Pré-vol (avant chaque migration)

```sql
-- Existence et signature des fonctions touchées
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_sale_idempotent','add_bar_member_v2','get_user_role');

-- Privilèges AVANT (à comparer au post-vol)
SELECT p.proname,
       has_function_privilege('anon',        p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_sale_idempotent';

-- Contrainte CHECK courante
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c';

-- Vérifier qu'aucune donnée n'utilise déjà la valeur (doit renvoyer 0)
SELECT count(*) FROM public.bar_members WHERE role = 'cuisinier';
```

### Post-vol (après chaque migration)

```sql
-- ⚠ CREATE OR REPLACE perd les grants : vérifier qu'ils sont identiques au pré-vol
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_role,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_sale_idempotent','add_bar_member_v2');

-- La contrainte accepte bien la nouvelle valeur
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.bar_members'::regclass AND contype = 'c';

-- RLS toujours active
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('bar_members','sales');
```

⚠ **`auth.uid()` vaut `NULL` dans le SQL Editor** : les guards « membre actif du bar » ne peuvent pas
y être testés. Le smoke-test des guards se fait **par l'UI**, avec un compte réel de chaque rôle.

---

## 10. Synthèse - ce que la phase Pré-0 doit produire

**Nettoyage à comportement constant** (aucune mention de `'cuisinier'`) :

| # | Élément | Statut |
|---|---|:-:|
| 0 | **Tests de non-régression** sur les 4 rôles - [`rbac-role-baseline.integration.test.ts`](../../src/tests/integration/rbac-role-baseline.integration.test.ts) | ✅ **fait** (26 tests, filet vérifié par injection de régression) |
| 1 | `create_sale_idempotent` : liste noire → liste blanche | ✅ **écrite**, à appliquer en SQL Editor |
| 2 | Les 7 filtres de périmètre financier → `hasPermission('canViewAllSales')` | ⬜ à faire |
| 3 | `QuickSaleFlow.tsx:225` : introduction de `canValidateSales` | ⬜ à faire |
| 4 | `Cart.tsx`, `AppProvider.tsx` : `canSell` au lieu du rôle brut | ⬜ à faire |
| 5 | Consolidation des **3 déclarations** de `UserRole` | ⏭️ **SORTI de la Pré-0** (décision 31/07/2026) - voir ci-dessous |

#### ⏭️ Consolidation de `UserRole` — sortie du périmètre Pré-0

**Décision (31/07/2026)** : ne **pas** consolider maintenant. En phase 0, ajouter `'cuisinier'` aux
**3 déclarations**, puis traiter la consolidation comme un chantier distinct.

**Raison** : [`OnboardingContext.tsx:36`](../../src/context/OnboardingContext.tsx#L36) déclare
`UserRole` avec des **alias legacy** (`owner`, `manager`, `bartender`) sans rapport avec la
restauration. Les démêler sortirait du « comportement constant » qui définit la Pré-0 et mélangerait
deux chantiers de risques différents.

**Les 3 points à modifier en phase 0** (ajout simple de `'cuisinier'`) :

| Fichier | Ligne | Nature |
|---|---|---|
| [types/index.ts](../../src/types/index.ts#L4) | 4 | ⭐ Source de vérité — `ROLE_PERMISSIONS` en dépend |
| [types/guide.ts](../../src/types/guide.ts#L6) | 6 | Duplication stricte |
| [OnboardingContext.tsx](../../src/context/OnboardingContext.tsx#L36) | 36 | Duplication + alias legacy |
| [utils/validation.ts](../../src/utils/validation.ts#L93) | 93 | ⚠ `validRoles` — **rejetterait un cuisinier** |

⚠ **Le compilateur ne détectera PAS l'oubli** des déclarations 2 et 3 : ce sont des unions inline
structurellement indépendantes. Seule `types/index.ts` déclenche l'erreur (via `ROLE_PERMISSIONS`).
**Les 4 points doivent donc être modifiés ensemble, à la main**, et couverts par un test.

⭐ Le filet (n° 0) a été écrit **en premier**, volontairement : il rend vérifiable l'affirmation
« comportement inchangé » sur laquelle repose tout le reste. Il contient aussi un garde-fou qui
**échoue à l'ajout de `'cuisinier'`** dans `ROLE_PERMISSIONS` - signal de bascule Pré-0 → phase 0.

---

## 11. ✅ CLÔTURE DE LA PHASE PRÉ-0 (31/07/2026)

**La Pré-0 est terminée côté code.** Un seul reliquat : la migration 1, reportée à lundi 03/08.

### Livré

| Livrable | Détail |
|---|---|
| **Ce document** | Matrice rôle × permission × route × RPC, 3 fois certifiée |
| **Filet de non-régression** | [`rbac-role-baseline.integration.test.ts`](../../src/tests/integration/rbac-role-baseline.integration.test.ts) — 27 tests, vérifié par injection de régression |
| **20 conversions rôle → permission** | 13 fichiers, comportement constant (§5.1, §5.1bis) |
| **`canValidateSales`** | Permission créée, valeurs dérivées de l'existant |
| **Migration liste blanche** | Écrite, pré-vol validé, ⏸ à exécuter lundi |

**Vérifications finales** : 596 tests verts (43 fichiers) · 0 erreur TS dans les fichiers modifiés
(total projet 123 → 114) · ESLint identique à l'état initial.

### Ce que la Pré-0 ne livre PAS

⚠ **Aucune fonctionnalité.** Le rôle `cuisinier` n'existe pas, les 8 permissions cuisine non plus,
et rien du module restauration (ingrédients, plats, machine d'état, écrans) n'est commencé. La Pré-0
est un **socle de sécurité**, pas un incrément produit.

### ⭐ Leçon méthodologique — à retenir pour la phase 0

L'inventaire a dû être repris **trois fois** :

1. Recherche du motif `role === 'serveur'` → 15 points
2. Certification → découverte de la **liste blanche positive** (`role === 'gerant' || ...`), 11 points
3. Balayage **exhaustif ligne à ligne** de `src/` → 8 points supplémentaires, dont un **garde de
   sécurité** ([SettingsPage](../../src/pages/SettingsPage.tsx#L327))

**Chercher un motif ne prouve rien sur les autres.** Pour la phase 0, partir directement d'un
balayage exhaustif plutôt que d'une recherche par motif.

### Critère de sortie — atteint

Ajouter `'cuisinier'` à `UserRole` provoque **une erreur de compilation** (entrée manquante dans
`ROLE_PERMISSIONS`) et **aucun** changement de comportement silencieux : plus aucune décision
d'autorisation ne repose sur un test de rôle brut.

⚠ **Sauf les 4 points de §10** (`validRoles`, unions inline) que le compilateur **ne détecte pas** —
d'où leur inscription explicite.

---

## 12. Travaux de phase 0 réalisables sans les tables (31/07/2026)

En attendant la migration de lundi, deux éléments **indépendants du SQL** ont été livrés.

### ✅ Les 8 permissions cuisine — §3

Implémentées dans [`types/index.ts`](../../src/types/index.ts#L648), définies pour les 4 rôles.
**Purement additif** : aucun code ne les consulte encore.

⚠ Le seul profil non trivial est le **serveur** : `canViewKitchenOrders` + `canServeKitchenItem`
uniquement. Il est à l'**interface salle/cuisine** — il voit ce qui est `ready` et le sert (ce qui
crée la vente, §6.1), mais ne fait pas avancer la production. C'est la symétrie exacte du futur
cuisinier, qui produira sans vendre.

⚠ **Choix signalé** : `canViewKitchenCosts = true` pour le **gérant**, alors que
`canViewAccounting = false`. Volontaire — le §8 établit que la marge matière est un outil de
pilotage opérationnel, « probablement l'argument de vente le plus fort » du module. Figé par un test
dédié pour ne pas être « corrigé » par erreur plus tard.

Filet étendu : **35 permissions × 4 rôles** + 5 invariants sémantiques cuisine.

### ✅ `isTicketClosed` — §13.6

[`src/utils/ticketStatus.ts`](../../src/utils/ticketStatus.ts) + 11 tests couvrant les 4
combinaisons du §6.3 et la rétrocompatibilité (`fulfillment_status` absent ou `null`).

**Compatibilité vérifiée** : le helper accepte `Ticket` (camelCase) **et** `TicketRow` (snake_case)
sans cast — contrôlé par compilation.

⚠ **Point vérifié** : `ticket.status === 'paid'` n'apparaît **nulle part en lecture** dans `src/`.
La discipline du §13.6 est donc instaurable **maintenant**, avant que les usages ne se multiplient —
c'est précisément ce que le plan recommandait.

⛔ **Reste à faire quand la colonne existera** :
[`tickets.service.ts:170`](../../src/services/supabase/tickets.service.ts#L170) filtre par
`.eq('status', 'open')` → un bon **prépayé avec des plats en cuisine disparaîtrait de la liste**.
À remplacer par `status = 'open' OR fulfillment_status = 'pending'`. Impossible avant la migration
(la colonne n'existe pas), mais le helper est prêt.

---

## 13. ✅ PHASE 0 — les 4 migrations SQL APPLIQUÉES (02/08/2026)

Appliquées dimanche matin, bars fermés, post-vols certifiés une par une.

| # | Migration | Objet | Post-vol |
|---|---|---|:-:|
| 1 | [20260802090000](../../supabase/migrations/20260802090000_add_cuisinier_role_check.sql) | `CHECK` sur `bar_members.role` | ✅ |
| 2 | [20260802090100](../../supabase/migrations/20260802090100_add_cuisinier_to_training_versions.sql) | `CHECK` sur `training_versions` | ✅ |
| 3 | [20260802090200](../../supabase/migrations/20260802090200_allow_gerant_manage_cuisinier_rls.sql) | RLS — le gérant gère un cuisinier | ✅ |
| 4 | [20260802090300](../../supabase/migrations/20260802090300_add_bar_member_v2_accept_cuisinier.sql) | RPC `add_bar_member_v2` | ✅ |

**Résultats certifiés** : contrainte à 5 valeurs · données inchangées (16/11/54/1 avant et après) ·
policy UPDATE unique avec `ARRAY['serveur','cuisinier']` dans **les deux** clauses · RPC avec
privilèges intacts (`anon=false, auth=true, svc=false`) et les 4 gardes préservées dans le corps.

### ⛔⛔ ÉCART FICHIER / PRODUCTION — 3ᵉ occurrence du même piège

Le pré-vol de la migration 3 a révélé que **la policy déployée n'était pas celle du fichier**
[20260218000000](../../supabase/migrations/20260218000000_harden_bar_members_role_update_rls.sql) :

| | `USING` |
|---|---|
| Fichier | `is_super_admin() OR get_user_role(bar_id) IN ('promoteur','gerant')` |
| **Production** | `is_super_admin() OR promoteur OR (gerant AND role = 'serveur')` |

La prod était **plus restrictive**. Reprendre le fichier aurait **élargi les droits de ciblage du
gérant** sans que personne ne le voie. La migration a été réécrite depuis l'état réel.

⭐ **Troisième fois que ce piège se présente** : `create_sale_idempotent` (9 versions successives),
les plafonds de plan (3 versions), et maintenant cette policy. **LA BASE FAIT FOI, PAS LE FICHIER.**
Le pré-vol qui archive l'existant n'est pas une formalité — c'est ce qui a évité la régression.

### ⚠ Le `USING` compte autant que le `WITH CHECK`

`USING` filtre la ligne **avant** modification, `WITH CHECK` la valide **après**. Sans `'cuisinier'`
dans le `USING`, un gérant aurait pu en **créer** un mais **jamais le modifier ensuite** (rétrograder,
désactiver) — cul-de-sac fonctionnel invisible si l'on ne vérifie que le `WITH CHECK`.

### Constat annexe

La policy INSERT `"Managers can add members"` autorise déjà le gérant **sans filtre sur le rôle
cible**. Seule la contrainte `CHECK` l'empêchait d'insérer un cuisinier. Aucune modification requise.

### État actuel : la base accepte, le code ignore

⚠ Un cuisinier est désormais **légal en base** et **créable via le RPC**, mais **inexploitable
depuis l'app** : `UserRole` (TypeScript) ne connaît pas la valeur et
[`validation.ts:93`](../../src/utils/validation.ts#L93) la rejetterait.

C'est l'ordre voulu — la base ouvre avant le code.

### ✅ Côté TypeScript — le rôle `cuisinier` EXISTE (02/08/2026)

| Élément | Fichier |
|---|---|
| `UserRole` étendu ×3 | [types/index.ts](../../src/types/index.ts#L4) · [types/guide.ts](../../src/types/guide.ts#L6) · [OnboardingContext.tsx](../../src/context/OnboardingContext.tsx#L36) |
| Liste blanche runtime | [validation.ts:93](../../src/utils/validation.ts#L93) |
| `ROLE_PERMISSIONS.cuisinier` | 35 permissions **écrites une par une** |
| `MenuItem.roles` aligné sur `UserRole` | [MobileSidebar.tsx](../../src/components/MobileSidebar.tsx#L50) |
| Tests §8 | 11 nouveaux — **623 tests verts** |

**Vérifications** : 114 erreurs TS avant et après (baseline exacte) · ESLint 8/8 identique ·
filet re-testé par injection (`canSell: true` → 3 tests échouent, dont l'invariant « tous ses droits
sont des permissions cuisine »).

⭐ **Le garde-fou d'extension a fonctionné** : il a échoué à l'ajout du rôle, forçant à étendre la
table de vérité plutôt qu'à hériter du serveur. Mis à jour pour le prochain rôle (5 attendus).

⚠ **Les 3 duplications ont bien dû être modifiées à la main.** Le compilateur n'a signalé que
`types/index.ts` (via `ROLE_PERMISSIONS`) — confirmant §10 : les unions inline de `guide.ts` et
`OnboardingContext` sont structurellement indépendantes, et `validRoles` est un simple tableau de
chaînes.

⚠ **Onboarding** : `cuisinier` tombe dans le `default` de `getStepSequence` — parcours minimal
(WELCOME → ROLE_DETECTED → COMPLETE), non bloquant. Un parcours dédié est un chantier produit.

⚠ **Menus** : le motif « liste blanche » de `MobileSidebar`/`MobileNavigation` joue en notre faveur —
le cuisinier ne voit **aucune entrée** tant qu'on ne l'y ajoute pas explicitement. Sûr par défaut.

### Prochaine étape

1. `has_restaurant` sur les bars (+ §13.4 : restauration ⟹ mode complet obligatoire)
2. Tests d'intégration : un gérant crée un cuisinier via l'UI (les 4 migrations sont en prod)
3. Puis **phase 1** — `ingredients`, lots FEFO, écran d'appro

**Ce que la phase Pré-0 ne fait pas** : ajouter le rôle, les 8 permissions, ou toucher aux écrans
cuisine. Tout cela est la phase 0.

⭐ **Le critère de sortie de la phase Pré-0** : à la fin, ajouter `'cuisinier'` au type `UserRole` doit
provoquer une **erreur de compilation** (entrée manquante dans `ROLE_PERMISSIONS`) et **aucun**
changement de comportement silencieux. Tant qu'un `role === 'serveur'` décisionnel subsiste dans les
zones de §6, ce critère n'est pas atteint.
