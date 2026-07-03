# Audit BarTender Pro — Global & Authentification

> **Date** : 13 juin 2026
> **Périmètre** : 3 bars en production, plan Supabase Pro
> **Auteur** : Audit technique (Claude Fable 5)
> **Contexte** : business réel (marketing + rentabilité pertinents)
>
> Ce document regroupe deux audits menés successivement :
> 1. **Audit global** — coûts Supabase, logique métier, architecture, gouvernance
> 2. **Audit authentification** — login, reset mot de passe, création utilisateurs, RPC/RLS

---

# PARTIE 1 — AUDIT GLOBAL

## Synthèse

L'application est **techniquement très solide pour son échelle** : offline-first robuste, RLS
systématique, idempotence des ventes, audit trail, comptabilité SYSCOHADA. Le vrai sujet n'est
pas la qualité du code mais l'**adéquation coût/charge** : le plan Supabase Pro (~25 $/mois) est
dimensionné très au-dessus de la charge réelle. Priorité : **mesurer avant de décider**, finir
2 optimisations restantes, puis trancher Free vs Pro en connaissance de cause.

---

## 1. Coûts Supabase — la priorité

### Ce qui est payé réellement (mesures réelles, 2 bars, 17 MAU)

| Poste | Consommé | Quota Pro | Verdict |
|---|---|---|---|
| Egress | ~16 GB/mois (avant optim) | 250 GB | 6,4 % |
| Realtime messages | 15 821/mois | 5 M | 0,3 % |
| Realtime connexions pic | 6 | 500 | 1,2 % |
| Compute | Micro 24/7 (745 h) | crédit 10 $ inclus | couvert |
| MAU / Storage / Edge | négligeables | — | ✅ |

**Constat** : aucun dépassement facturé. Le coût Supabase = l'abonnement Pro fixe (~25 $/mois).
Deux façons de le réduire : descendre en Free (0 $), ou rester en Pro et le traiter comme coût
fixe partagé (≈ 5 000 XOF/bar/mois à 3 bars).

### Action immédiate n°1 — remplir le suivi des mesures (15 min, gratuit)

`docs/audits/OPTIMISATION_SUIVI_MESURES.md` a été créé le 7 juin pour valider les gains projetés
(-60/70 % egress, -85 % compute)… et **toutes les cases J+3/J+7 sont vides**. Avant toute décision :
1. Relever l'egress journalier moyen post-7-juin (dashboard Supabase).
2. Exécuter la requête SQL de relevé compute fournie dans ce document.
3. Vérifier que `top_products_by_period` a disparu du log de refresh.

### Décision Free vs Pro — cadre honnête

**Passe en Free sans problème** : MAU, realtime, storage, edge functions.

**3 vrais obstacles** :
1. **Egress 5 GB/mois en Free.** Post-optimisation ~2-3 GB/bar/mois → **~6-9 GB pour 3 bars,
   au-dessus du quota**. En Free, le dépassement est **bloquant** (pas facturé) → risque de coupure
   pour des bars actifs chaque soir.
2. **Pas de backups quotidiens auto en Free.** Inacceptable pour de la compta réelle *sans
   mitigation*. Mitigation gratuite : `pg_dump` nocturne via GitHub Actions → à faire **même en Pro**
   (les backups Pro ne sont gardés que 7 jours).
3. **Refresh des vues matérialisées sans pg_cron.** Deux fallbacks déjà codés : triggers directs
   débouncés (`20260226130000`, revertée depuis) et cron Vercel (`api/cron/refresh-views.ts`).
   ⚠️ Ce fichier est **obsolète** (rafraîchit encore `top_products_by_period`, vue morte) et Vercel
   Hobby limite à 1 cron/jour → le fallback réaliste en Free = ré-appliquer les triggers directs.

**Recommandation** : rester en Pro **tant que les mesures ne confirment pas un egress < 4 GB/mois
pour 3 bars**. Si après les optimisations restantes on mesure ~1 GB/bar/mois, le passage en Free
devient défendable — backups GitHub Actions obligatoires d'abord.

**Vérifications dashboard (5 min, tous cas)** :
- *Spend cap* activé (plafond garanti à 25 $).
- **Un seul projet actif** dans l'organisation (chaque projet hosted au-delà du 1er consomme du
  compute au-delà du crédit 10 $ — attention au dossier `BarTender_Copie`, le dev doit passer par
  `supabase start` en local).
- PITR désactivé (add-on payant inutile à cette échelle).

### Optimisations restantes (gains réels, indépendants du plan)

1. **Supprimer le refresh post-mutation de `daily_sales_summary`**
   (`useSalesMutations.ts:122-134`). Le commentaire dit lui-même qu'il existait « sur free tier
   (pas de pg_cron) » — or on est en Pro avec cron */30. Les mesures montrent 518 refreshs/jour sur
   cette vue (le cron n'en explique que ~48). Le dashboard temps réel lit les tables brutes ; seule
   la compta lit cette vue, fraîcheur 30 min suffisante (bouton refresh manuel déjà présent).
   Remplacer par une simple invalidation React Query.
2. **Borner `useUnifiedReturns` (fenêtre 6 mois)** — seule piste écartée le 7 juin (solde cumulé
   dans AccountingOverview). À traiter en passant des dates explicites. Dernier fetch croissant
   dans le temps.
3. **DROP des vues mortes** : `top_products_by_period` n'est plus rafraîchie mais l'objet existe.
   Mettre à jour ou supprimer `api/cron/refresh-views.ts`.

---

## 2. Logique métier — solide, 4 points de vigilance

Cœur métier bien pensé : journée comptable `businessDate` + heure de clôture par bar, deux modes
(`full` validation gérant / `simplified` attribution par mapping de noms), ventes idempotentes
(`idempotencyKey` + RPC), CUMP recalculé par trigger, anti-survente serveur, retours « Magic Swap »
tracés, consignations atomiques, SYSCOHADA + Z de caisse.

1. **[KI-003] `ADD_SUPPLY` non synchronisé offline** (`KNOWN_ISSUES.md`) — seul cas documenté de
   **perte de données possible**. Un appro saisi hors-ligne n'est jamais synchronisé. Scénario réel
   en 2G/3G. Priorité au-dessus de KI-001 (qui est conservateur et bénin).
2. **Prix des plans dupliqués TS/SQL** : `plans.ts` et le `CASE` en dur du RPC
   `get_subscription_overview` doivent être modifiés aux deux endroits. Mitigation : stocker le prix
   dans `bars.settings` à l'assignation, ou une table `plans` en DB source unique.
3. **`dataTier` vestigial** : les 3 plans sont tous `'balanced'` et tous les appelants passent des
   dates explicites depuis le 7 juin. `'lite'`/`'enterprise'` = code mort à simplifier.
4. **Test rouge permanent** (`offline-resilience.integration.test.tsx`, mock `salesKeys.list`
   incomplet) depuis le 7 juin — désensibilise aux vraies régressions. 30 min pour le réparer.

---

## 3. Architecture — excellente, surdimensionnement assumé à connaître

**Forces** : chaîne de sync 3 niveaux (BroadcastChannel gratuit → Realtime → polling adaptatif
coupé quand realtime connecté), `RealtimeService` avec ref-counting + watchdog heartbeat +
reconnexion étagée 2G, architecture queries/mutations/pivots qui a tué le God Context.

**Points d'attention** :
- **Deux copies de `database.types.ts`** (`src/lib/` et `src/types/`) **déjà divergentes**
  (`refresh_expenses_summary` retourne `undefined` dans l'une, `string` dans l'autre). À consolider
  via `npm run gen:types`.
- **~280 migrations** dont des dizaines de cycles fix/refix/rollback. Générer un **baseline squashé**
  (`supabase db dump`) et archiver l'historique pour pouvoir reconstruire un env from scratch.
- **Hygiène du dépôt** : `.history/`, `dist/`, `dev-dist/`, `test-results/`, `playwright-report/`,
  dossier `false/`, `vite.config.ts.timestamp-*.mjs`, `eslint_report.json`, raccourci « Musique »,
  PowerPoint versionnés. Nettoyer + compléter `.gitignore`.
- **Surdimensionnement contextuel** : impersonation admin, monitoring RLS, dashboard sécurité,
  feature flags, quotas serveur… construit et fonctionnel, **ne rien casser** mais **ne plus
  investir** : chaque heure va au métier (ventes/stock/compta) ou aux coûts.

---

## 4. Gouvernance

1. **Continuité (bus factor = 1)** : unique dev + super_admin + opérateur. Document de reprise
   (accès Supabase/Vercel/Sentry/domaine + procédure restauration backup) stocké hors machine, +
   idéalement un 2ᵉ compte super_admin de secours.
2. **Backups testés** : faire **un test de restauration réel** une fois, quel que soit le plan.
3. **Propriété des données** : convenir par écrit (même informel) que chaque promoteur peut
   récupérer les données de son bar (export Excel existant) et ce qu'il advient si quelqu'un quitte.

---

## 5. Plan d'action global priorisé

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | Remplir `OPTIMISATION_SUIVI_MESURES.md` (mesures réelles) | 15 min | Débloque décision Free/Pro |
| 2 | Backup externe auto (`pg_dump` nocturne GitHub Actions) + 1 test restauration | 2-3 h | Protège la compta |
| 3 | Vérifier dashboard : spend cap ON, un seul projet, PITR off | 5 min | Évite surcoût caché |
| 4 | Supprimer refresh post-mutation dans `useSalesMutations` | 1 h | ~-40 % compute refresh |
| 5 | Fixer KI-003 (`syncAddSupply`) | ½ j | Élimine perte de données |
| 6 | Borner `useUnifiedReturns` | ½ j | Dernier egress croissant |
| 7 | Décision Free vs Pro sur base des mesures | discussion | 0 ou 15 000 XOF/mois |
| 8 | Hygiène : consolider `database.types.ts`, réparer test rouge, nettoyer dépôt, DROP vues mortes | 1 j | Maintenabilité |
| 9 | Doc de continuité + accord propriété des données | 2 h | Gouvernance |

---

# PARTIE 2 — AUDIT AUTHENTIFICATION

## Synthèse

Architecture auth **fondamentalement saine** : Supabase Auth natif (JWT + refresh auto), RLS
systématique, historique de durcissement SQL sérieux. Mais **un bug fonctionnel casse le flux
"première connexion"**, **trois incohérences de politique de mot de passe**, et **un point de
sécurité résiduel** dans la chaîne admin.

---

## 🔴 Critique — bugs fonctionnels qui cassent un flux

### 1. Domaine d'email incohérent entre login et 1er changement de mot de passe

Trois domaines placeholder pour le même concept "utilisateur sans vrai email" :

- `LoginScreen.tsx:74` — login normal : `${email}@bartender.app`
- `LoginScreen.tsx:153` — re-login après 1er changement de mdp : `${email}@bartender.local` ❌
- `AuthContext.tsx:385` (commenté) — ancien code : `@bartender.local`

**Conséquence** : un serveur se connecte avec son username (→ `nom@bartender.app`), change son mot
de passe à la 1ʳᵉ connexion, le changement réussit… puis le **re-login auto échoue** car il tente
`nom@bartender.local` (pas son email réel). L'utilisateur voit une erreur juste après avoir
"réussi". La migration `20251215200000` confirme que le domaine canonique est `@bartender.app`.

**Fix** : `LoginScreen.tsx:153` → `@bartender.app`. **Changement d'1 ligne qui débloque tout
l'onboarding employé.**

### 2. Longueur minimale de mot de passe : trois valeurs

| Endroit | Min exigé |
|---|---|
| `LoginScreen.tsx:135` (1er changement) | **4** ❌ |
| `ResetPasswordScreen.tsx:39` (reset email) | 6 |
| `AdminSetPasswordModal.tsx:35` + edge function `:47` | 6 |

Le `4` du flux 1ʳᵉ connexion est une faille : c'est le mot de passe que l'employé gardera.

**Fix** : aligner sur 6 partout (min Supabase par défaut). Centraliser dans une constante +
validateur partagés.

---

## 🟠 Important — sécurité et robustesse

### 3. Gymnastique SIGNED_IN/SIGNED_OUT fragile (risque session zombie)

`AuthContext.tsx:103-128` : pour éviter le hijacking quand un promoteur crée un employé (Supabase
émet un `SIGNED_IN` pour le nouvel utilisateur), le code compare l'event à
`AuthService.getCurrentUser()` (localStorage).

- **SIGNED_OUT ignoré tant que `localStorage.auth_user` existe** (ligne 120-128) : une
  déconnexion *légitime* côté serveur (token révoqué) laisse l'app en session "zombie" jusqu'au
  prochain heartbeat.
- Cette protection est **probablement un vestige** : la création de compte passe désormais
  entièrement par l'edge function `create-bar-member` (client admin séparé, n'altère pas la session
  du navigateur). Voir `auth.service.ts:349-407`. **À tester puis simplifier** — supprimerait le
  risque de zombie.

### 4. `complete_first_login` best-effort — `first_login` peut rester bloqué

`auth.service.ts:905-913` : après changement de mdp, le RPC qui passe `first_login` à `false` est en
`console.warn` si erreur, sans retry. Échec réseau (2G/3G) → mdp changé mais l'utilisateur **se
reverra demander de le changer à chaque connexion** (le localStorage masque sur l'appareil courant,
pas après vidage cache / autre appareil).

**Fix** : rendre l'appel idempotent + re-tentable.

### 5. RPC admin historiquement non sécurisées — vérifier l'état réel en prod

La 1ʳᵉ version de `get_dashboard_stats` / `get_paginated_bars` / `get_paginated_audit_logs`
(`20251211174059`) était **sans `SECURITY DEFINER` ni guard de rôle**. Les migrations suivantes
ont corrigé `get_paginated_users` et `setup_promoter_bar` (15/12), mais **aucune migration vue
corrigeant explicitement `get_dashboard_stats` et `get_paginated_bars`** (lecture CA global + liste
des bars).

**Action — auditer la prod** :
```sql
SELECT p.proname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'get_%' OR p.proname LIKE 'admin_%')
ORDER BY p.proname;
```
Puis vérifier que chacune contient un `IF NOT is_super_admin() THEN RAISE EXCEPTION`.

### 6. `is_super_admin()` accordée à `anon`

`20260112000003:39` : `GRANT EXECUTE ... TO anon`. Pour un anon `auth.uid()` est NULL → renvoie
`false` (pas d'escalade directe), mais surface inutile. **Retirer** le grant à `anon` sauf si une
policy s'en sert dans un flux pré-auth (a priori non).

---

## 🟡 Mineur — durcissement et hygiène

- **Logs verbeux en prod** : `auth.service.ts:368`, `verifyMfa:322`, edge `create-bar-member`
  loggent emails/IDs bruts. Mettre derrière un flag dev.
- **Reset password bien fait** : `ForgotPasswordScreen:55-59` message générique (anti-énumération)
  + rate-limit client 30 s. ✅ Le rate-limit client est cosmétique → vérifier que le rate-limit
  **serveur** Supabase Auth est actif.
- **`redirectTo` du reset** dépend de `VITE_APP_URL` (`auth.service.ts:1062`) → s'assurer que le
  domaine est dans l'allowlist "Redirect URLs" du dashboard, sinon lien rejeté silencieusement.
- **MFA partiel** : la vérification TOTP existe (`verifyMfa`) mais **pas d'écran d'enrôlement**
  (`mfa.enroll`). Le MFA n'est donc utilisable par personne en pratique. Décider : compléter
  l'enrôlement (au moins super_admin) ou retirer le code mort.
- **`ResetPasswordScreen` fait `window.location.reload()`** (ligne 59) au lieu de naviguer vers
  `/auth/login` — fonctionne mais brutal. Cosmétique.

---

## ✅ Ce qui est bien fait (ne pas casser)

- **Anti-spoof RPC** (`20260227100000`) : `auth.uid()` remplace `p_assigned_by_id` (forgeable). Les
  7 fixes couvrent auto-promotion gérant→promoteur, retrait de supérieur hiérarchique, lecture
  annuaire global.
- **Isolation RLS par rôle** (`20260210101000`) : un serveur ne voit que ses propres
  ventes/retours/tickets/consignations.
- **Edge `admin-update-password`** : vérifie token appelant + statut super_admin via RPC avant
  d'agir, avec audit log. Chaîne correcte.
- **Résilience offline du token** (`AuthContext.tsx:164-199`) : ne pas déconnecter sur token expiré
  en mode offline — bon choix pour réseau instable.

---

## Plan d'action auth priorisé

| # | Action | Gravité | Effort |
|---|---|---|---|
| 1 | `@bartender.local` → `@bartender.app` (`LoginScreen.tsx:153`) | 🔴 casse 1er login | 2 min |
| 2 | Aligner longueur min mdp à 6 partout (constante + validateur) | 🔴 faille | 1 h |
| 3 | Rendre `complete_first_login` retriable/idempotent | 🟠 | 1-2 h |
| 4 | Auditer en prod les RPC `get_*`/`admin_*` sans guard (requête fournie) | 🟠 fuite potentielle | 30 min |
| 5 | Retirer `GRANT is_super_admin() TO anon` | 🟠 | 5 min |
| 6 | Tester puis simplifier la gymnastique SIGNED_IN/SIGNED_OUT | 🟠 anti-zombie | ½ j |
| 7 | Retirer logs verbeux (emails/IDs) en prod | 🟡 | 30 min |
| 8 | Décider : compléter enrôlement MFA ou retirer code mort | 🟡 | variable |

---

*Audit réalisé le 13 juin 2026. Les estimations de coûts sont des ordres de grandeur basés sur les
mesures à 2 bars ; à recalibrer après collecte des données réelles post-déploiement.*
