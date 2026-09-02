# Suivi d'exécution - chantier co-promoteur

> Journal des 8 étapes. Mis à jour après chaque post-vol certifié.
> Plan : `docs/roadmaps/PLAN_CO_PROMOTEUR.md` · Inventaire : `PREZERO_CO_PROMOTEUR_INVENTAIRE.md`

| # | Étape | Statut | Date |
|---|---|---|---|
| **1** | CHECK `bar_members` + `training_versions` | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **3** | RPC `add_co_promoteur` + `remove_co_promoteur` | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **4a** | 🛡️ 3 policies RESTRICTIVES (écriture `co_promoteur` = SuperAdmin seul) | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **4b** | RLS métier — **48 policies** élargies sur 17 tables | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **5** | RPC cuisine + achats — **8 fonctions** (pas 12) | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **6** | Bot WhatsApp : 2 RPC + CHECK `wa_bar_links.role_snapshot` | ⏸️ **REPORTÉ** (non urgent, décision 01/09/2026) | - |
| **7** | ⛔ `create_sale_idempotent` — encaissement | ✅ **EN PROD - CERTIFIÉ** | 01/09/2026 |
| **8** | Front (types, RBAC, navigation, libellés, guides) | ✅ **CODE ÉCRIT** — 1124 tests OK, à déployer | 01/09/2026 |

> L'étape 2 a été fusionnée dans l'étape 1 (même migration).

---

## Étape 1/8 - CERTIFIÉE le 01/09/2026

**Migration** : `20260901090000_add_co_promoteur_role_checks.sql`

**Pré-vol** — 2 contraintes trouvées (une par table), aucune avec `co_promoteur` ;
répartition `serveur` 59, `gerant` 18, `promoteur` 11, `cuisinier` 1, `super_admin` 1 ;
0 `co_promoteur` préexistant dans les 2 tables.

**Post-vol** — les 2 contraintes contiennent `co_promoteur` :

```
bar_members_role_check      → super_admin, promoteur, co_promoteur, gerant, serveur, cuisinier
training_versions_role_check→ promoteur, co_promoteur, gerant, serveur, cuisinier
```

Répartition **strictement identique** au pré-vol (59/18/11/1/1). Aucune donnée altérée.

**Décision de revue appliquée** : `wa_bar_links.role_snapshot` a été **retirée** de cette
migration et reportée à l'étape 6. Motif : c'est une défense en profondeur (c'est elle qui
rend un rôle non autorisé impossible à lier, indépendamment des RPC) - la desserrer 5
étapes avant que les RPC du bot bougent n'apportait rien.

**État du rôle après l'étape 1** : légal en base, **totalement inexploitable**.
Un co-promoteur créé maintenant ne pourrait pas encaisser
(`create_sale_idempotent` le rejette), n'aurait aucun droit au-delà d'un membre simple,
et verrait un menu vide.

> ⛔ **NE PAS créer de co-promoteur réel avant la fin de l'étape 8.**

---

## Étape 3/8 - CERTIFIÉE le 01/09/2026

**Migration** : `20260901100000_add_co_promoteur_rpc.sql`

**Créé** : `add_co_promoteur` (SuperAdmin seul) et `remove_co_promoteur`
(SuperAdmin, propriétaire, ou promoteur du bar — **jamais** un autre co-promoteur).

**Post-vol certifié** :

| Vérification | Résultat |
|---|---|
| Signatures | `uuid, uuid` · `secdef=true` · `search_path=public, extensions` |
| 🛡️ Privilèges | **`anon=false`, `auth=true`** sur les 2 fonctions |
| Garde SuperAdmin | refus correct : « Seul un super administrateur peut nommer… » |
| 🛡️ Verrou de gouvernance | `add_bar_member_v2` en prod = `p_role NOT IN ('gerant','serveur','cuisinier')` → **`co_promoteur` absent, verrou confirmé** |
| Effet de bord | 0 ligne `co_promoteur` créée par les tests |

**Défaut corrigé en revue avant exécution** — `add_co_promoteur` refuse désormais de
promouvoir un **serveur** : le trigger `trg_sync_server_mapping` fait un **DELETE** (pas
une désactivation) de `server_name_mappings` sur la branche `role <> 'serveur'`, ce qui
aurait **anonymisé rétroactivement ses bons de commande ouverts**, silencieusement.
Chemin imposé : serveur → gérant (page Équipe) → co-promoteur.

**Test différé** (impossible depuis le SQL Editor, `auth.uid()` y est NULL) : l'ajout réel
qui RÉUSSIT, depuis l'UI connectée en super_admin. À faire **après l'étape 8** seulement.

> ⚠️ Le test (b) initial a répondu « Authentification requise » : `add_bar_member_v2`
> s'arrête sur `auth.uid()` NULL **avant** la validation du rôle. Ce n'était donc pas une
> preuve du verrou — d'où la vérification par lecture de `pg_get_functiondef` en base.
> **Leçon** : un refus ne prouve rien tant qu'on n'a pas vérifié SUR QUELLE garde il porte.

---

## 🛡️ HORS CHANTIER - 2 failles de sécurité corrigées le 01/09/2026

Découvertes **en préparant l'étape 4**, sans rapport avec le co-promoteur (préexistantes).
Détail : mémoire `project_rls_helpers_failles`.

| Migration | Faille | Statut |
|---|---|---|
| `20260901110000` | `Promoteurs can add bar members` (INSERT) utilisait `is_promoteur_or_admin()` **sans filtre `bar_id`** → tout promoteur pouvait s'insérer dans **n'importe quel bar** d'un autre client | ✅ **CERTIFIÉ** |
| `20260901120000` | `is_impersonating()` lisait `user_metadata.impersonation`, **modifiable par l'utilisateur** → tout compte pouvait s'auto-attribuer le privilège sur **37 policies** | ✅ **CERTIFIÉ** |

**Post-vol** : 1 seule policy INSERT restante (avec `get_user_role(bar_id)`) · 0 policy
`bar_members` dépendant encore de `is_promoteur_or_admin` · `is_impersonating()` renvoie
`false` et ne lit plus le JWT · **37 policies intactes** (identique au pré-vol).

> ⭐ **Aucune des deux failles n'avait été exploitée** : 0 promoteur membre d'un bar dont
> il n'est pas propriétaire, 0 compte portant le drapeau `impersonation`.

**Contexte technique à retenir** : `authenticated` a `INSERT/UPDATE/DELETE` sur
`bar_members` — les RLS sont la seule barrière. Et les policies PostgreSQL sont
**permissives** (combinées par OR) : une seule policy trop large suffit à tout ouvrir.
Aucune policy `AS RESTRICTIVE` n'existe dans le projet.

**Reste à auditer** : `is_promoteur_or_admin()` subsiste dans
`users / Admins can create users` (INSERT) — un promoteur peut-il créer un utilisateur
arbitraire ? Et `is_super_admin()` (mémoire `project_is_super_admin_fragile`).

---

## Étape 4a/8 - CERTIFIÉE le 01/09/2026 — ✅ fenêtre refermée

**Migration** : `20260901130000_restrict_co_promoteur_writes.sql`

**3 policies RESTRICTIVES** (les premières du projet) sur `bar_members` :
`co_promoteur_insert_superadmin_only`, `..._update_...`, `..._delete_...`.
Chacune porte `role <> 'co_promoteur' OR is_super_admin()`.

**Post-vol** : 3 policies `RESTRICTIVE` (DELETE/INSERT/UPDATE) · **P=7 R=3 Rlecture=0**.

**Pourquoi restrictives** : les policies permissives se combinent par **OR** — durcir
`bar_members_update_policy` seule aurait laissé le chemin INSERT ouvert. Une restrictive
se combine par **AND** : rien ne peut la contourner, y compris une future policy
permissive ajoutée sur cette table.

**Deux défauts corrigés en revue avant exécution** :
- `FOR ALL` couvrait **SELECT** → les lignes `co_promoteur` auraient été invisibles à tout
  non-SuperAdmin : page Équipe cassée, et le co-promoteur ne voyant pas sa propre ligne,
  `get_user_role()` / `is_bar_member()` cassés pour lui → session compromise.
  Corrigé en **3 policies par commande** (`Rlecture=0` le certifie).
- `TO authenticated` → une restrictive ne restreint QUE les rôles cités ; tout autre rôle
  disposant des GRANT y échappait. Clause retirée.

**Garde du pré-vol renforcée** (skill code-review) : elle testait que la contrainte CHECK
*contient la chaîne* `co_promoteur`, pas qu'elle **accepte** la valeur — une contrainte
`role <> 'co_promoteur'` l'aurait satisfaite. Remplacée par un INSERT sonde annulé.

> ⚠️ `admin_manage_bar_member` (cité par les fichiers, `DELETE FROM bar_members` brut)
> **n'existe pas en production** — 5e divergence fichiers/prod de ce chantier.

---

## ~~⚠️ FENÊTRE OUVERTE depuis l'étape 1~~ — REFERMÉE le 01/09/2026 (étape 4a)

`bar_members_update_policy` (`20260227100000`) autorise
`get_user_role(bar_id) = 'promoteur'` à modifier **n'importe quelle ligne vers n'importe
quel rôle** - aucune restriction sur la valeur cible :

```sql
USING (is_super_admin() OR get_user_role(bar_id) = 'promoteur' OR
       (get_user_role(bar_id) = 'gerant' AND role = 'serveur'))
```

Avant l'étape 1, sans danger : `co_promoteur` violait le CHECK. **Depuis l'étape 1, le
CHECK l'accepte** → un promoteur peut, par un UPDATE direct via l'API REST, promouvoir
son gérant en `co_promoteur` sans passer par le SuperAdmin. Cela **contourne la
décision n°4** (invitation par SuperAdmin uniquement).

**Risque réel : faible** (appel API délibéré requis, rôle inexploitable jusqu'à l'étape 8)
mais la fenêtre est réellement ouverte.

**Correctif - étape 4, obligatoire** : restreindre le `WITH CHECK` pour que seul
`is_super_admin()` puisse produire une ligne de rôle `co_promoteur`. Le promoteur garde
tous ses autres droits d'UPDATE.

> C'est aussi pourquoi « ne pas créer de co-promoteur avant la fin de l'étape 8 » n'est
> pas qu'une précaution de confort.

---

## Étape 4b/8 - CERTIFIÉE le 01/09/2026

**Migration** : `20260901140000_open_rls_to_co_promoteur.sql` — **48 policies** élargies
sur **17 tables**, par réécriture générique (boucle sur `pg_policies` + substitution
textuelle du motif de rôle), et non à la main.

**Post-vol** : 48 ouvertes · 4 exclusions à `false` · gating `check_bar_has_feature`
**inchangé à 14** · `promoteur` toujours dans **52** policies (rien perdu) · commentaires
sur `sales` préservés.

**Ce que le co-promoteur obtient** : comptabilité, salaires, dépenses, apports de capital,
balances initiales (tous **sous condition de plan**, gating intact), annulation de vente
validée avec sa traçabilité (`cancelled_by`, `cancel_reason`), ajustements de stock, plus
tous les droits du gérant (produits, catégories, consignations, achats, retours,
approvisionnements, promotions).

**4 exclusions volontaires** : `bars|create bars` (canCreateBars=false),
`users|Admins can create users` (utilise `is_promoteur_or_admin()`, faille connue),
`bar_events` et `promotions|ALL` (motif legacy `admin`/`owner`, rôles inexistants).

### Trois défauts corrigés avant/pendant l'exécution

1. **Skill code-review — garde trop faible** : elle testait « l'expression contient
   `co_promoteur` » ; une clause à plusieurs prédicats passait dès qu'UN seul était
   élargi, les autres restant silencieusement fermés. Renforcée.
2. **Faux positif à l'exécution** : la garde renforcée neutralisait `'co_promoteur'::text`
   puis cherchait `'promoteur'::text` — **or le second est une SOUS-CHAÎNE du premier**.
   Le couple légitime déclenchait l'alarme. Corrigé en neutralisant d'abord les 5 formes
   de couples valides.
3. **Décompte erroné (50 au lieu de 52)** : mon relevé comptait les **lignes affichées**
   par le SQL Editor, qui tronque. ⛔ **Pour un volume, toujours `count(*)`, jamais un
   comptage visuel.** Le pré-vol a arrêté avant l'écriture.

> Le skill a aussi corrigé : non-idempotence (2e passage annonçait une « divergence »),
> noms de rôles non échappés (`quote_ident`), perte des `COMMENT ON POLICY` au DROP/CREATE.

---

## Étape 5/8 - CERTIFIÉE le 01/09/2026

**Migration** : `20260901150000_open_kitchen_rpcs_to_co_promoteur.sql`

**Post-vol** : 8 fonctions ouvertes · privilèges cuisine préservés
(`anon=false auth=true svc=FALSE`) · ⭐ `convert_purchase_order_to_supplies`
passé à **`anon=false`** (anomalie corrigée), `svc=true` conservé.

### Le périmètre réel était 8, pas 12

Le relevé en prod (`pg_get_functiondef`) a corrigé l'inventaire tiré des fichiers :

- **3 RPC hors périmètre** — leur `NOT IN` filtre des **statuts**, pas des rôles :
  `cancel_kitchen_item` (motifs d'annulation), `close_batch` (statuts de lot),
  et le `NOT IN` de `convert_purchase_order_to_supplies` (statuts de commande —
  son contrôle de rôle est ailleurs, en forme `IN` positive).
- **1 RPC inexistant en prod** : `kitchen_supply_expense` — 6e divergence
  fichiers/prod du chantier.

### 🛡️ Anomalie de sécurité corrigée au passage

`convert_purchase_order_to_supplies` était exécutable par **`anon`** — seul des 11
relevés — alors qu'il ÉCRIT dans le stock. **Non exploitable** (son garde interne
rejette `auth.uid() = NULL`), mais ce garde devenait le seul rempart. `REVOKE` appliqué.

### Défaut corrigé avant exécution : règles de substitution qui se chevauchent

La 1re version avait 4 règles calquées sur les listes complètes. Or
`'super_admin','promoteur','gerant'` est une **sous-chaîne** de
`'super_admin','promoteur','gerant','cuisinier'` — et 4 fonctions portaient les deux
formes. Le résultat aurait été correct **par accident**, grâce à l'ordre d'application.

Corrigé : **2 règles** ciblant le couple minimal `'promoteur'` + `'gerant'`, qui ne peut
se chevaucher avec lui-même. Plus un garde anti-double-insertion.

> ⚠️ **3e chevauchement de motifs du chantier** (après `'promoteur'` sous-chaîne de
> `'co_promoteur'` à l'étape 4b). **Règle** : sur une substitution textuelle, cibler le
> motif **minimal non ambigu**, jamais la chaîne complète.

---

## ⏸️ Étape 6 (bot WhatsApp) — REPORTÉE le 01/09/2026

Décision : le bot analyste n'est pas urgent — le co-promoteur suit la gestion via
l'application. **Le chantier passe directement à l'étape 7.**

⚠️ **Ne pas perdre de vue** : cette étape porte **3 objets liés**, à migrer ensemble
le jour où elle sera reprise :

1. `resolve_wa_bar_link` — allowlist réelle en prod : `('promoteur', 'gerant')`
   (⚠️ `super_admin` en a été retiré par `20260822090001` — la prod prime sur les fichiers)
2. `request_wa_bar_link` — `NOT IN ('promoteur', 'gerant')`
3. **CHECK `wa_bar_links.role_snapshot`** — `('promoteur','gerant','serveur')`,
   ⭐ **déplacé depuis l'étape 1** par la revue : c'est une **défense en profondeur**
   (c'est elle qui rendait `super_admin` structurellement impossible à lier).
   La desserrer sans ouvrir les RPC n'apporterait rien.

**Conséquence du report** : un co-promoteur ne pourra pas lier son numéro WhatsApp au
bot analyste. Comportement propre — `resolve_wa_bar_link` **échoue fermé** sur tout rôle
non listé, il n'y a donc pas d'état intermédiaire douteux.

---

## Étape 7/8 - CERTIFIÉE le 01/09/2026 — l'encaissement est ouvert

**Migration** : `20260901160000_open_create_sale_to_co_promoteur.sql`
Exécutée en fenêtre de faible service, confirmée par le fondateur.

**Post-vol** : `IN ('super_admin','promoteur','co_promoteur','gerant','serveur')` ·
`anon=false auth=true` **`svc=true`** · `versions=1 secdef=true mode_simplifie=true`
**`defauts=true`** (les `DEFAULT` des 13 arguments préservés — sans eux, l'app ne
pourrait plus appeler le RPC).

**La 2e règle du RPC est intacte** : `mode simplifié + serveur → refus`. Elle ne vise
que le serveur, le co-promoteur encaisse donc dans les deux modes, comme le gérant.

### ⭐ Défaut d'analyse corrigé par le skill code-review — le risque était PIRE

J'avais écrit que le **SyncManager rejoue les ventes offline sous `service_role`**, donc
hors du garde de rôle. **C'est FAUX** : `src/lib/supabase.ts:21` crée le client avec la
clé **anon**, et une session authentifiée en fait un appelant `authenticated`. Aucun
`service_role` n'existe côté front — il n'est utilisé que par les Edge Functions.

> **Conséquence réelle** : le rejeu offline PASSE par le garde de rôle. Sans cette
> migration, les ventes hors-ligne d'un co-promoteur auraient échoué **AU REJEU** — en
> différé, longtemps après la manipulation. Le scénario le plus difficile à diagnostiquer.
>
> ⛔ **À TESTER** : couper le réseau, encaisser, rétablir, vérifier que la vente remonte.
> Ce chemin n'est PAS couvert par un test d'encaissement en ligne.

**Deux autres défauts corrigés** : le `COMMENT ON FUNCTION` était perdu par
`EXECUTE pg_get_functiondef(...)` (précédent du dépôt : `20260817100000:196`) ; et le
retour d'idempotence précédait les contrôles d'intégrité — un rejeu après application
manuelle partielle aurait annoncé « déjà appliqué » sans revalider.

> ⚠️ **À VÉRIFIER sur l'étape 5** : elle réécrit 8 fonctions de la même façon et a
> probablement perdu leurs `COMMENT` aussi.

---

## Étape 8/8 - CODE ÉCRIT le 01/09/2026 — 1124 tests passent

**16 fichiers modifiés.** `npx vitest run` : **73 fichiers, 1124 tests, 0 échec**.
`tsc --noEmit` : aucune erreur dans les fichiers touchés.

### Ce qui a été fait

| Catégorie | Fichiers |
|---|---|
| **Types** (4 déclarations dupliquées) | `types/index.ts` (UserRole + ROLE_PERMISSIONS), `types/guide.ts`, `utils/validation.ts` (liste blanche RUNTIME), `context/OnboardingContext.tsx` |
| ⛔ **Navigation** (défaut bloquant) | `MobileNavigation.tsx` (6), `MobileSidebar.tsx` (17 + `isGrouped`) — **23 entrées de menu** |
| **Libellés** | `Header.tsx` (icône + label), `TrainingTab.tsx`, `RoleSwitcher.tsx` (label + couleur), `TeamManagementPage.tsx` (label + badge) |
| **Guides** | `useGuideSuggestions.ts` (1 entrée) + `guideStepFilter.ts` (**1 ligne** pour les 140 `visibleFor`) |
| **Métier** | `OfflineBanner`, `useCanWorkOffline`, `SubscriptionReminder`, `OnboardingBanner`, `TeamPerformanceTable`, `KitchenServicePage` |

### ⭐ Les 140 guides traités par 1 ligne, pas 140 éditions

`guideStepFilter.ts` centralise le filtrage : `role === 'co_promoteur' ? 'promoteur' : role`.
`visibleFor` est du **contenu de formation**, pas de la sécurité (celle-ci vit dans
`ROLE_PERMISSIONS`, les RLS et les RPC). Une équivalence centralisée ne peut pas diverger ;
140 lignes éditées à la main laisseraient forcément un trou.

### ⭐ 4 oublis rattrapés par le balayage final

Le balayage des occurrences restantes a trouvé ce que l'édition dirigée avait manqué :

1. **`useCanWorkOffline.ts:24`** — c'est LE hook qui décide de la capacité offline ;
   `OfflineBanner` n'affiche que la bannière. Le vrai comportement était dans le hook.
2. `KitchenServicePage.tsx:176` — annulation après `ready` (décision sanitaire).
3. `TeamManagementPage.tsx` — libellé + badge.
4. ⛔ **`TeamManagementPage.tsx:578,606`** — les gardes qui protègent le promoteur d'une
   modification depuis la page Équipe. **Le co-promoteur devait y être aussi** : sa gestion
   passe exclusivement par les RPC SuperAdmin, et un bouton actif aurait été TROMPEUR —
   l'action aurait échoué **silencieusement** (policies RESTRICTIVES → 0 ligne, aucune
   erreur). C'est exactement le piège documenté ci-dessous, rattrapé de justesse.

### Les 2 garde-fous du dépôt ont fait leur travail

- `rbac-role-baseline.integration.test.ts` — a échoué à l'ajout du rôle, forçant à étendre
  la table de vérité au lieu d'hériter silencieusement (2e fois après `cuisinier`).
- `userRoleSync.test.ts` — a vérifié la synchronisation des **4 déclarations dupliquées**,
  que le compilateur ne relie pas entre elles.

---

## Correctif RPC restants — CERTIFIÉ le 02/09/2026 (19 fonctions)

**Migration** : `20260901170000_open_remaining_rpcs_to_co_promoteur.sql` — **5 revues**.

**Post-vol** : 19 ouvertes (`non_ouvertes = NULL`) · privilèges conformes (15 à
`anon=true`, **4 durcies restées à `anon=false`** : can_write_kitchen,
cancel_kitchen_item, discard_ingredient_lot, get_my_subscription_status) ·
⭐ **balayage final = exactement les 10 exclusions volontaires, aucun nom inattendu**.

### ⛔ LE DÉFAUT DE MÉTHODE — 3 relevés faux d'affilée

L'étape 4b réécrivait `pg_policies` par boucle générique : **impression de complétude
qu'elle ne pouvait pas tenir**, une boucle sur les policies n'atteignant jamais les corps
de fonctions. Les 3 relevés successifs qui devaient combler ce trou ont tous **échantillonné**
le corps au lieu de l'analyser :

| Méthode | Défaut |
|---|---|
| `substring(... from 'NOT IN \(...\)')` | ne rend que la **1re** correspondance → `cancel_kitchen_item` exclue sur son `NOT IN` de MOTIFS, son garde de rôle étant 30 lignes plus bas |
| `substr(..., position('promoteur')-80, 180)` | tombe sur le 1er **commentaire** → `can_write_kitchen` classée « simple commentaire » alors qu'elle porte une liste blanche alimentant **20 points d'usage** |

⭐ **RELEVÉ FIABLE** (celui qui a enfin marché) — extraire les **lignes de CODE** :

```sql
CROSS JOIN LATERAL unnest(string_to_array(pg_get_functiondef(p.oid), chr(10)))
     WITH ORDINALITY AS l(ligne, n)
WHERE l.ligne ILIKE '%promoteur%'
  AND trim(l.ligne) NOT LIKE '--%' AND trim(l.ligne) NOT LIKE '*%'
  AND trim(l.ligne) NOT LIKE '/*%'
```

→ 37 fonctions mentionnent le mot · **28 ont un garde réel** · 9 en commentaire seul.
Sur les 28 : **19 traitées**, 9 exclues. (`trim()` absorbe les `` des corps en CRLF.)

### Ce que les 5 revues ont trouvé

1. **CRITIQUE** — la boucle de GRANT allait ouvrir `prepare_subscription_checkout` à
   `authenticated`. Elle est **service_role ONLY** et fait confiance à `p_caller_id`,
   un paramètre de l'appelant, PARCE QUE seule une Edge Function ayant validé le JWT
   peut l'invoquer. Tout compte connecté aurait pu lire le plan et les impayés de
   **n'importe quel bar**. Retirée du périmètre.
2. **Durcissement involontaire** — un `REVOKE ALL FROM PUBLIC` inconditionnel aurait
   durci 13 fonctions au passage. Or `anon` **hérite** de PUBLIC (162 fonctions/244 du
   schéma, mémoire `project_public_execute_162_fonctions`).
3. **Défaut inverse** — supprimer tout REVOKE **annulait** le durcissement des 4 qui en
   avaient un. → REVOKE **conditionnel**, chaque fonction retrouve son état d'origine.
4. **2 exclusions injustifiées** — `can_write_kitchen` (20 usages) et `cancel_sale`.
5. **Mes propres gardes reproduisaient le défaut** : ils testaient
   `pg_get_functiondef ILIKE '%co_promoteur%'` — la présence du **jeton dans le texte**,
   commentaires compris. Corrigés pour tester les **lignes de code**.
6. **Un fait inventé** — j'avais écrit que `discard_ingredient_lot` était un « faux
   positif silencieux » de l'étape 5. Vérification : elle n'y figurait simplement jamais.

> ⚠️ `check_product_create_permission` est `SECURITY DEFINER` **sans `SET search_path`** —
> seule des 19. La migration préserve cet état sans l'aggraver. À traiter dans une passe
> de durcissement dédiée, avec `is_promoteur_or_admin`.

---

## ⛔ CONTRAINTE POUR L'ÉTAPE 8 (front)

Les policies restrictives de l'étape 4a rendent tout **UPDATE direct** sur une ligne
`co_promoteur` **silencieux** : un `USING` qui échoue filtre la ligne au lieu de lever une
erreur → **0 ligne affectée, aucune exception**. Le client croit avoir réussi.

`AuthService.deactivateMember` / `activateMember`
([auth.service.ts:1031](../../src/services/supabase/auth.service.ts#L1031), `:1051`) sont
exactement ce motif (`.from('bar_members').update(...)` en direct). Ils sont **du code
mort aujourd'hui** — vérifié le 01/09/2026, aucun appelant — donc le piège est latent.

> **Règle** : toute écriture visant une ligne `co_promoteur` DOIT passer par
> `add_co_promoteur` / `remove_co_promoteur` (SECURITY DEFINER, hors RLS), jamais par un
> `.update()` direct. **Rien dans la base ne le fait respecter** — c'est une règle de code
> à tenir à l'étape 8.

Même vigilance pour `admin_manage_bar_member` (`20251215_admin_impersonation_extensions:77`),
qui fait un `DELETE FROM bar_members` brut : `SECURITY DEFINER`, non appelé dans `src/`,
mais à ne pas rebrancher sans vérifier son propriétaire.

---

## Rappels permanents

- **Toujours** repartir de `pg_get_functiondef` en base, jamais du fichier de migration :
  plusieurs RPC ont été redéfinis (le pré-vol du 01/09 l'a démontré 3 fois - nom réel
  `create_sale_idempotent`, allowlist bot à 2 rôles, contraintes fantômes sur `users`).
- **`CREATE OR REPLACE` perd les grants** → toujours re-REVOKE/GRANT + post-vol
  `has_function_privilege` (`anon=false, authenticated=true, service_role=true`).
- **`create_sale_idempotent` (étape 7) : hors heures de service uniquement.**
- 🛡️ `bar_members_update_policy` ne doit PAS ouvrir l'écriture du rôle `co_promoteur`
  (sinon la gouvernance « invitation par SuperAdmin seul » se contourne).
