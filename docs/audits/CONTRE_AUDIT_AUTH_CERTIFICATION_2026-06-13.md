# Contre-audit de certification — Authentification BarTender Pro

> **Date** : 13 juin 2026
> **Objet** : Vérification indépendante de l'audit auth du `AUDIT_GLOBAL_ET_AUTH_2026-06-13.md`
> **Audit initial** : produit avec Claude Opus 4.8
> **Contre-audit** : produit avec Claude Fable 5 (relecture des sources réelles, sans se fier aux
> conclusions précédentes)
> **Méthode** : chaque finding re-vérifié ligne par ligne dans le code ET les migrations SQL.
> Recherche active de faux positifs (findings exagérés) ET de faux négatifs (trous manqués).

---

## Verdict global

| Statut | Compte |
|---|---|
| Findings **confirmés** | 5 / 6 |
| Findings **confirmés et aggravés** (réalité pire) | 3 |
| Findings **nuancés / mécanisme corrigé** | 1 (#1) |
| Findings **partiellement infirmés** | 1 (#5 — une des RPC est en fait protégée) |
| **Faux négatifs découverts** (manqués par l'audit Opus) | **2 majeurs** |

**Conclusion** : l'audit initial était globalement juste et utile, mais il a **sous-estimé la
gravité de la partie RPC/SQL**. Le contre-audit révèle une **classe entière de fonctions admin
ouvertes** (pas seulement 2-3 cas isolés), issue d'une décision de design explicite. **La priorité
de sécurité réelle est plus haute que ce que l'audit Opus indiquait.**

---

## 1. Findings re-certifiés (de l'audit initial)

### ✅ Finding #1 — Domaine email `@bartender.local` — CONFIRMÉ, mécanisme corrigé

**Statut audit Opus** : 🔴 critique — « le re-login échoue, l'utilisateur voit une erreur ».
**Verdict contre-audit** : **CONFIRMÉ comme bug réel**, mais le **mécanisme décrit était inexact**.

Preuve renforcée : `@bartender.app` est utilisé à **6 endroits** (login `:74`, TeamManagement
`:149` et `:350`, validation admin UsersManagement `:84`, guide `owner-guides.ts:1404/1409`).
**Une seule ligne — `LoginScreen.tsx:153` — utilise `@bartender.local`.** Sans équivoque un bug.

**Correction du mécanisme** (apport du contre-audit) :
1. `changePassword()` appelle `supabase.auth.updateUser({ password })` → **la session courante
   reste valide**, et `AuthContext.changePassword` fait déjà `setCurrentSession({firstLogin:false})`.
2. Le `login(loginEmail, newPassword)` ligne 156 est donc **redondant** (l'utilisateur est déjà
   connecté). Il vise `nom@bartender.local` (inexistant) → `signInWithPassword` échoue →
   `result.user` est `undefined`.
3. Impact réel : le bloc `if (result.user)` ne s'exécute pas → **`navigate('/onboarding')` n'a
   jamais lieu**. L'utilisateur change son mot de passe puis **reste bloqué sur l'écran**, sans
   message d'erreur (le `catch` ne se déclenche pas, `login` retourne un objet sans throw).
4. **Risque aggravant** : selon la version du SDK, un `signInWithPassword` échoué peut invalider la
   session courante → l'utilisateur pourrait être **déconnecté** juste après son changement de mdp.

**Correction recommandée** : non seulement `:153` → `@bartender.app`, mais **supprimer carrément le
re-login redondant** (lignes 149-156) et remplacer par un `navigate('/onboarding')` direct, puisque
la session est déjà valide après `changePassword`.

---

### ✅ Finding #2 — Longueur de mot de passe incohérente — CONFIRMÉ ET AGGRAVÉ

**Statut audit Opus** : 🔴 — « trois valeurs : 4 / 6 / 6 ».
**Verdict contre-audit** : **CONFIRMÉ, mais il y a CINQ seuils, pas trois**, et une incohérence
**documentation ↔ code** non détectée par l'audit Opus.

| Source | Seuil | Nature |
|---|---|---|
| `LoginScreen.tsx:135` (1er changement) | **4** | code exécuté |
| `validation.ts:35` (schéma signup `validateUserData`) | **4** | code (mais jamais appelé — voir ci-dessous) |
| `ResetPasswordScreen.tsx:39` (reset email) | 6 | code exécuté |
| `AdminSetPasswordModal.tsx:35` + edge function `:47` | 6 | code exécuté |
| `owner-guides.ts:1408 / 2032` | **8** + complexité | **documentation affichée à l'utilisateur** |

**Faux négatif de l'audit Opus** : le **guide intégré promet « minimum 8 caractères, majuscules,
minuscules, chiffres, signes »** — une politique que **le code n'applique nulle part**. L'app ment
à l'utilisateur sur ses propres règles. De plus, **aucune fonction `validatePasswordStrength`
n'existe** dans le code (recherche exhaustive négative), alors que le guide la décrit comme un
« encadré bleu à 4 critères ».

**Correction recommandée** : créer une constante unique `PASSWORD_MIN_LENGTH` + un validateur
partagé `validatePassword()`, l'appeler dans les 4 flux, et **soit** aligner le code sur la promesse
du guide (8 + complexité), **soit** corriger le guide pour refléter le code (6 simple). Ne pas
laisser code et documentation diverger.

---

### ✅ Finding #3 — Gymnastique SIGNED_IN/SIGNED_OUT — CONFIRMÉ

**Verdict** : confirmé tel quel. Le risque de session zombie (SIGNED_OUT ignoré tant que
`localStorage.auth_user` existe, `AuthContext.tsx:120-128`) est réel. L'hypothèse « vestige d'une
ancienne implémentation client-side » est plausible : la création de compte passe entièrement par
l'edge function `create-bar-member` (client admin séparé). **À tester avant suppression** — pas de
correction aveugle. Gravité 🟠 maintenue.

---

### ✅ Finding #4 — `complete_first_login` best-effort — CONFIRMÉ

**Verdict** : confirmé. `auth.service.ts:905-913`, l'échec du RPC est un simple `console.warn` sans
retry. En réseau 2G/3G, `first_login` peut rester bloqué à `true` → re-demande du changement de mdp
à chaque connexion (masqué localement par le localStorage `:916`, pas après vidage cache / autre
appareil). Gravité 🟠 maintenue.

**Lien avec #1** : ces deux findings se composent. Un utilisateur dont `complete_first_login` échoue
ET qui retombe sur le flux `:153` cassé est doublement bloqué.

---

### ⚠️ Finding #5 — RPC admin sans guard — PARTIELLEMENT INFIRMÉ ET AGGRAVÉ

C'est le finding le plus important à recadrer. L'audit Opus disait prudemment « je n'ai pas vu de
migration corrigeant `get_dashboard_stats` et `get_paginated_bars` ». Le contre-audit a tracé
**l'état final réel** de chaque RPC. Résultat différencié :

| RPC | SECURITY DEFINER | Guard interne | RLS de secours | Verdict réel |
|---|---|---|---|---|
| `get_paginated_users` | ✅ | ✅ `is_super_admin()` | — | ✅ **Sûre** |
| `setup_promoter_bar` | ✅ | ✅ `is_super_admin()` | — | ✅ **Sûre** |
| `get_paginated_audit_logs` | ✅ | ❌ (commentaire « let RLS handle it ») | ⚠️ policy RLS `is_super_admin()` sur `audit_logs` | ⚠️ **À vérifier** (voir note) |
| `get_dashboard_stats` | ✅ | ❌ | ❌ (agrège, pas de table protégeable) | 🔴 **OUVERTE** |
| `get_paginated_bars` | ✅ | ❌ | ❌ (SECURITY DEFINER bypasse la RLS) | 🔴 **OUVERTE** |
| `get_unique_bars` | ✅ | ❌ | ❌ | 🔴 **OUVERTE** |

**Ce que l'audit Opus a infirmé** : `get_paginated_audit_logs` n'est **pas** simplement ouverte —
elle s'appuie sur une policy RLS `is_super_admin()` réellement créée (`20260109000507`).

**⚠️ Nuance critique non tranchable sans la prod** : une fonction `SECURITY DEFINER` dont le
*owner* est un superuser PostgreSQL **bypasse la RLS** dans son corps. Si c'est le cas ici, le
commentaire « let RLS handle it » serait **faux** et `get_paginated_audit_logs` serait grand ouverte
(tout l'historique d'audit lisible par n'importe qui — d'autant qu'elle est **`GRANT`ée à `anon`**,
lignes 72-74 !). **À vérifier impérativement en prod** :
```sql
SELECT proname, proowner::regrole, prosecdef FROM pg_proc
WHERE proname = 'get_paginated_audit_logs';
-- Si proowner = postgres/superuser → RLS bypassée → FUITE
```

**Ce que l'audit Opus a aggravé sans le savoir** : `get_paginated_bars` n'est pas « peut-être
encore protégée par la RLS ». La migration `20260109000524` lui a **explicitement ajouté
SECURITY DEFINER** (donc retiré la protection RLS) **sans ajouter de guard de rôle**, avec un
commentaire faux : *« Safe because these are admin-only functions with proper validation »* — **il
n'y a aucune validation dans le corps**. Un serveur authentifié peut lire **tous les bars de la
plateforme** (noms, adresses, téléphones, `owner_id`, `settings` incluant plan + dates d'abonnement).

**Gravité réelle** : 🔴 (et non 🟠 comme classé par l'audit Opus).

---

### ✅ Finding #6 — `is_super_admin()` accordée à `anon` — CONFIRMÉ

**Verdict** : confirmé (`20260112000003:39`). Pas d'escalade directe (`auth.uid()` NULL → `false`),
mais surface inutile. Le contre-audit révèle que ce **`GRANT ... TO anon` est un pattern répété**
(aussi sur `get_paginated_audit_logs`) — symptôme du même relâchement systémique. Gravité 🟠.

---

## 2. Faux négatifs découverts par le contre-audit (manqués par l'audit Opus)

### 🔴 NOUVEAU #7 — `get_user_bars(p_user_id)` : lecture des bars d'autrui

`20251213_final_remove_rpc_auth_checks.sql` — la fonction `get_user_bars(p_user_id UUID)` :
- prend un **userId arbitraire en paramètre**,
- est `SECURITY DEFINER`, `GRANT`ée à `authenticated`,
- **n'a aucun check** (ni `auth.uid() = p_user_id`, ni guard de rôle).

→ N'importe quel utilisateur authentifié peut passer l'UUID d'un autre et **lister ses bars**
(adresses, téléphones, settings). Même classe de faille que `get_paginated_bars`.

### 🔴 NOUVEAU #8 — Pattern systémique « Remove auth checks — let RLS handle it »

Le vrai problème n'est pas 2-3 RPC isolées : c'est une **décision de design explicite** du
13 décembre 2025 (`20251213_final_remove_rpc_auth_checks.sql`, titre littéral *« FINAL: Remove auth
checks from RPCs — let RLS handle it »*) qui a retiré les checks d'auth d'une famille de fonctions
en pariant sur la RLS. Le pari ne tient **que si** : (a) la table cible a une RLS, ET (b) la
fonction n'est pas SECURITY DEFINER owned-by-superuser (sinon la RLS est bypassée). Plusieurs
fonctions violent l'une ou l'autre condition.

**Action de fond recommandée** : audit exhaustif en prod de toutes les fonctions
`SECURITY DEFINER` + `GRANT authenticated/anon` sans guard interne :
```sql
SELECT p.proname, p.proowner::regrole, p.prosecdef,
       pg_get_functiondef(p.oid) LIKE '%is_super_admin%' AS has_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY has_guard, proname;
```
Pour chaque ligne `has_guard = false` exposant des données multi-tenant : ajouter un guard
`auth.uid()`/`is_super_admin()` explicite. **Ne pas se fier à la RLS pour une fonction
SECURITY DEFINER.**

---

## 3. Plan d'action révisé (priorités recalibrées)

| # | Action | Gravité réelle | Effort |
|---|---|---|---|
| 5+7+8 | **Auditer en prod toutes les RPC SECURITY DEFINER sans guard** (requête fournie) + ajouter guards `is_super_admin()`/`auth.uid()` sur `get_paginated_bars`, `get_unique_bars`, `get_dashboard_stats`, `get_user_bars` | 🔴 **fuite multi-tenant active** | ½ j |
| 5b | Vérifier owner de `get_paginated_audit_logs` + retirer son `GRANT ... TO anon` | 🔴 potentiel | 15 min |
| 1 | `LoginScreen.tsx:153` → supprimer le re-login redondant, `navigate('/onboarding')` direct | 🔴 casse onboarding | 15 min |
| 2 | Constante + validateur mdp partagés ; aligner code ↔ guide | 🔴 faille + mensonge UX | 1-2 h |
| 6 | Retirer `GRANT is_super_admin() TO anon` | 🟠 | 5 min |
| 3 | Tester puis simplifier SIGNED_IN/OUT | 🟠 anti-zombie | ½ j |
| 4 | `complete_first_login` idempotent/retriable | 🟠 | 1-2 h |
| — | (mineurs #7-8 audit Opus : logs verbeux, MFA mort, reload) | 🟡 | variable |

**Changement majeur vs audit Opus** : la priorité n°1 n'est plus le bug `@bartender.local` (réel
mais mono-utilisateur), c'est **la fuite de données multi-tenant via les RPC SECURITY DEFINER sans
guard** (#5+#7+#8), qui expose les données de tous les bars à tout utilisateur authentifié — voire
anonyme pour l'audit log si l'hypothèse owner-superuser se confirme.

---

## 4. Ce que le contre-audit confirme de positif

L'audit Opus n'avait pas tort sur le fond : Supabase Auth natif, RLS sur les tables
transactionnelles, anti-spoof `auth.uid()` dans `add_bar_member_v2`/`remove_bar_member_v2`,
isolation par rôle sur ventes/retours/tickets — tout cela est réel et bien fait. Le angle mort
était **les RPC de lecture admin**, où un historique de migrations « fix permission denied » a
résolu des bugs de droits super_admin en **ouvrant les fonctions trop largement** plutôt qu'en
ajoutant des guards ciblés.

---

# ADDENDUM — Certification par accès prod (23 juin 2026, Claude Opus 4.8)

> Vérification des points « à vérifier en prod » via `pg_proc` + `aclexplode` sur la base réelle.
> Tranche définitivement les findings non résolvables depuis le code seul.

## Faits tranchés par la prod

1. **Owner de TOUTES les fonctions = `postgres`.** Conséquence définitive : tout `SECURITY DEFINER`
   **bypasse la RLS**. Le pari « let RLS handle it » est donc **systématiquement faux** pour les RPC
   `SECURITY DEFINER` (audit logs inclus). La nuance « à vérifier » du finding #5b est résolue : **fuite réelle**.

2. **`get_paginated_audit_logs` ET `get_paginated_catalog_logs_for_admin`** : `SECURITY DEFINER` +
   `GRANT … TO anon` + RLS bypassée → **historiques d'audit lisibles sans authentification**. Le
   second (`20260109000506`) fait en plus `GRANT SELECT/INSERT ON TABLE … TO anon` directement.

3. **Correction d'un faux positif de ma part (Opus, tour précédent)** : `get_paginated_users` est
   en réalité **gardée** (`is_super_admin()` présent en prod). Une migration postérieure à
   `20251215_fix_get_paginated_users_jsonb.sql` a ré-ajouté le guard. **Fable 5 avait raison** de la
   classer sûre. Seul l'état de prod fait foi — pas la dernière migration trouvée par nom de fichier.

## Failles inédites (manquées par les DEUX rapports)

- 🔴 **`validate_and_get_impersonate_data`** (`20251212_create_impersonate_token_rpc.sql`) : aucun
  guard super_admin, prend `p_super_admin_id`/`p_impersonated_user_id`/`p_bar_id` arbitraires,
  **retourne email + rôle de l'utilisateur cible** et **écrit un faux log d'impersonation** au nom
  d'un super_admin fourni par l'appelant. `GRANT authenticated`. La fuite ciblée la plus grave.
- 🔴 **`get_paginated_catalog_logs_for_admin`** : jumeau anon de l'audit log (cf. point 2).
- 🟠 **`get_all_bar_members`, `get_user_bars(p_user_id)`** : énumération cross-tenant via paramètre arbitraire.

## Origine des défauts (analyse de régression — pour ne RIEN recasser)

Les guards n'ont pas été retirés par négligence ; chaque retrait corrigeait un vrai bug. MAIS :

| Cause historique | Migration | Verdict |
|---|---|---|
| Récursion infinie RLS sur `bar_members` | `016_fix_infinite_recursion` | ✅ `SECURITY DEFINER` sur helpers = **correct, ne pas toucher** |
| super_admin absent de `bar_members` (system bar) → RLS le bloque | `20260109000503` a **réparé `is_super_admin()`** (lit `auth.users`) | ✅ depuis cette date, la RLS marche pour super_admin → les contournements `SECURITY DEFINER`+`anon` sur les RPC sont **redondants ET dangereux** |
| « test if RPC works » | `20251213_debug_rpc_auth.sql` (`-- Always allow for now`) | ❌ contournement **DEBUG figé par erreur** dans `final_remove_rpc_auth_checks` |

**Conséquence rassurante** : ré-ajouter `IF NOT is_super_admin() THEN RAISE EXCEPTION` sur les RPC
admin **ne recasse pas** l'accès super_admin (il passe le guard) ni l'usage normal des bars (l'app
appelle toujours avec les bons paramètres). Le guard ne bloque que l'appel manuel cross-tenant —
usage qu'aucun flux légitime ne fait. **Risque de régression quasi nul.**

## Fonctions à NE PAS toucher (déjà protégées — vérifié corps)

- `get_bar_members` : check inliné `bar_member OR owner OR impersonation` (`20251231`).
- `get_bar_sales_cursor`, `get_consignments_paginated`, `get_supplies_paginated`, `is_bar_member` : `uses_authuid` + scope membre.
- `is_user_super_admin(p_user_id)` : appelée par Edge Functions en `service_role` (pas de `auth.uid()` dispo) — légitime.
- Tous les helpers `SECURITY DEFINER` (`is_super_admin`, `get_user_role`, `is_promoteur_or_admin`…).

## Plan de remédiation par vagues (3 bars en prod — conservateur)

| Vague | Cible | Action | Risque |
|---|---|---|---|
| **1** | `get_paginated_audit_logs`, `get_paginated_catalog_logs_for_admin`, `validate_and_get_impersonate_data` | Retirer `GRANT anon` + guard `is_super_admin()` ; revoke SELECT/INSERT table catalog à anon | ~nul (ferme du non-authentifié) |
| **2** | `get_paginated_bars`, `get_unique_bars`, `get_dashboard_stats`, `get_user_bars(p_user_id)`, `get_all_bar_members` | guard `is_super_admin()` / `auth.uid() = p_user_id` | faible (super_admin passe) |
| **3** | `get_top_products_*`, `get_bar_*_stats`, `get_bar_promotion_stats_*` | guard `is_bar_member(p_bar_id) OR is_super_admin()` | faible |
| — | mutations métier (`create_sale_*`, stock, tickets, consignations) | analyse dédiée ultérieure (écriture, hors scope auth) | à évaluer |

---

*Contre-audit réalisé le 13 juin 2026 avec Claude Fable 5. Addendum de certification prod le
23 juin 2026 avec Claude Opus 4.8 (accès base réelle).*
