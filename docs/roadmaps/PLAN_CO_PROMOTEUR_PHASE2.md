# Plan — Co-promoteur Phase 2 : nomination et traçabilité

> **Statut** : cadrage du 21/09/2026, établi sur relevé du code réel. Aucune ligne écrite.
> **Prérequis** : ✅ Phase 1 terminée — 10 migrations en prod (01/09/2026), front déployé.
> **Suivi phase 1** : `docs/migrations/SUIVI_CO_PROMOTEUR.md`

---

## 1. Pourquoi cette phase existe

La phase 1 a livré un rôle **fonctionnel mais pas exploitable** :

- ✅ Le co-promoteur a tous ses droits (base, RPC, policies, interface d'usage)
- ❌ **Personne ne peut le nommer depuis l'application** — décision n°4 non implémentée
- ❌ **Le promoteur ne voit rien de ce qui est fait en son absence** — décision n°5 non implémentée

Ces deux manques viennent du découpage de la phase 1 : l'étape 8 s'intitulait
« Front (types, RBAC, navigation, libellés, guides) » et a livré exactement ces
cinq choses. La nomination et le journal n'y figuraient pas, et n'ont jamais été
inscrits comme livrables ailleurs dans la séquence.

> ⚠️ **Conséquence actuelle** : chaque nomination passe par le SQL Editor. Tenable
> pour un bar pilote, pas au-delà. Et le journal conditionne l'acceptabilité même
> du rôle entre associés — c'est la raison pour laquelle la décision n°5 avait été
> prise.

---

## 2. Relevé du code réel (21/09/2026)

### 2.1 Ce qui existe et sert

| Brique | Fichier | État |
|---|---|---|
| RPC `add_co_promoteur(uuid, uuid)` | prod depuis `20260901100000` | ✅ SuperAdmin seul, 6 gardes |
| RPC `remove_co_promoteur(uuid, uuid)` | prod depuis `20260901100000` | ✅ SuperAdmin + propriétaire + promoteur |
| `AuditLogger.log()` | `src/services/AuditLogger.ts` | ✅ écrit dans `audit_logs` via `log_audit_event` |
| Types `AuditLogEvent` | `src/types/index.ts:1099` | ✅ couvre `SALE_CANCELLED`, `EXPENSE_CREATED`, `STOCK_ADJUSTED`, `MEMBER_ADDED`… |
| Page Équipe | `src/pages/TeamManagementPage.tsx` | ✅ liste les membres, changement de rôle existant |

### 2.2 ⛔ Trois pièges relevés — à ne pas reproduire

**Piège 1 — `BarAuditLogsViewer` lit la MAUVAISE table.**

`src/components/admin/BarAuditLogsViewer.tsx` accepte une prop `barId` et paraît
donc réutilisable tel quel. **Il ne l'est pas** : il appelle
`admin_get_bar_audit_logs`, qui lit `bar_audit_log` — une table alimentée par
des triggers sur la **gestion des bars** (CREATE/UPDATE/SUSPEND/ACTIVATE/DELETE).

Elle ne contient NI les ventes annulées, NI les dépenses, NI les ajustements de
stock. Le composant peut servir de **modèle visuel**, jamais de brique réutilisée.

**Piège 2 — DEUX systèmes d'audit coexistent.**

| RPC | Table | Garde | Contenu |
|---|---|---|---|
| `admin_get_bar_audit_logs` | `bar_audit_log` | `is_super_admin()` | gestion de bars |
| `get_paginated_audit_logs` | `audit_logs` | `is_super_admin()` | ⭐ **le vrai journal métier** |
| `log_audit_event` (écriture) | `audit_logs` | `authenticated` | alimenté par `AuditLogger` |

C'est `audit_logs` qu'il faut exposer au promoteur, pas `bar_audit_log`.

**Piège 3 — le changement de rôle existant NE PEUT PAS servir.**

`TeamManagementPage.tsx:229` porte déjà un `handleChangeRole`, mais typé
`(member, newRole: 'gerant' | 'serveur')` et câblé sur `BarsService.addMember` →
`add_bar_member_v2`. **Ce RPC refuse `co_promoteur` par conception** — c'est le
verrou applicatif de la décision n°4, vérifié en prod le 01/09 :

```
p_role NOT IN ('gerant', 'serveur', 'cuisinier')  →  'Rôle invalide'
```

⛔ **Ne PAS ouvrir `add_bar_member_v2` au rôle** pour réutiliser cette UI : cela
contournerait la gouvernance « nomination par le SuperAdmin ». La nomination doit
appeler `add_co_promoteur`, qui porte son propre garde `is_super_admin()`.

### 2.3 Colonnes disponibles dans `audit_logs`

`bar_id` · `bar_name` · `user_id` · `user_name` · `user_role` · `event` ·
`severity` · `description` · `metadata` · `related_entity_id` ·
`related_entity_type` · `timestamp` · `ip_address` · `user_agent`

⭐ `user_role` et `bar_id` sont présents : un filtre « actions des co-promoteurs
de MON bar » est réalisable sans changement de schéma.

⚠️ `user_role` est résolu **à l'écriture** par `internal_log_audit_event`. Il
enregistre donc le rôle **au moment de l'action** — ce qui est le comportement
voulu : un co-promoteur retiré plus tard garde ses actions attribuées au rôle
qu'il avait.

---

## 3. CHANTIER A — Nomination et retrait

### 3.1 Où le placer

**Recommandation : dans l'espace SuperAdmin**, pas dans la page Équipe du bar.

Motif : la page Équipe est accessible au promoteur et au gérant
(`canCreateServers`). Y placer une action réservée au SuperAdmin créerait un
bouton visible et inopérant pour la majorité de ses utilisateurs — exactement le
défaut que la phase 1 a corrigé quatre fois (bouton actif / RPC qui refuse).

Deux emplacements possibles, à trancher :
- `src/pages/admin/BarsManagementPage.tsx` — un panneau par bar (cohérent avec
  `BarAuditLogsModal` déjà présent à cet endroit)
- une entrée dédiée dans `AdminLayout`

### 3.2 Ce que l'écran doit faire

| Action | RPC | Qui |
|---|---|---|
| Lister les membres éligibles d'un bar | lecture `bar_members` | SuperAdmin |
| Nommer | `add_co_promoteur(p_bar_id, p_user_id)` | SuperAdmin seul |
| Retirer | `remove_co_promoteur(p_bar_id, p_user_id)` | SuperAdmin, propriétaire, promoteur |

### 3.3 ⛔ Contraintes déjà portées par le RPC — l'UI doit les refléter

`add_co_promoteur` refuse, dans cet ordre :

1. appelant non SuperAdmin ;
2. bar inexistant · utilisateur inexistant ;
3. **le propriétaire du bar** (`bars.owner_id`) — il est déjà promoteur ;
4. un `promoteur` ou `super_admin` actif ;
5. un `co_promoteur` déjà en place ;
6. ⭐ **un `serveur`** — motif détaillé ci-dessous ;
7. quota de membres du plan atteint (`check_plan_member_limit`).

> ⭐ **Le refus du serveur n'est pas arbitraire** : le trigger
> `trg_sync_server_mapping` fait un **DELETE** (pas une désactivation) de
> `server_name_mappings` sur sa branche `role <> 'serveur'`. Promouvoir un serveur
> **anonymiserait rétroactivement ses bons de commande ouverts**, silencieusement.
> Chemin imposé : serveur → gérant (page Équipe) → co-promoteur.
>
> **L'UI doit donc ne proposer QUE les gérants**, et expliquer pourquoi un
> serveur n'apparaît pas — sinon l'utilisateur croira à un bug.

### 3.4 ⚠️ Le piège de l'UPDATE silencieux

Les 3 policies RESTRICTIVES de l'étape 4a filtrent la ligne au lieu de refuser :
un `.update()` direct sur une ligne `co_promoteur` affecte **0 ligne SANS lever
d'erreur**. Le client croit avoir réussi.

⛔ **Toute écriture visant un co-promoteur DOIT passer par les RPC.** Ne jamais
utiliser `BarsService.addMember` ni un `.from('bar_members').update()` direct.

Rappel : `AuthService.deactivateMember` / `activateMember`
(`auth.service.ts:1031`, `:1051`) sont exactement ce motif. Elles sont du **code
mort** aujourd'hui — ne pas les rebrancher sur ce chemin.

### 3.5 Journalisation de la nomination elle-même

⚠️ `trg_audit_member_change` réagit à `INSERT OR DELETE`, **pas à UPDATE**. Or :
- `add_co_promoteur` promeut un gérant par **UPDATE** ;
- `remove_co_promoteur` **désactive** (`is_active = false`), donc UPDATE aussi.

**Aucune des deux opérations ne laisse de trace** dans l'audit existant.
→ Appeler `auditLogger.log()` explicitement depuis le service, avec
`event: 'MEMBER_ADDED'` (existant) et un `metadata` portant l'ancien rôle.

---

## 4. CHANTIER B — Traçabilité

### 4.1 Volet 1 — RPC de lecture pour le promoteur (migration)

Les deux RPC de lecture existants sont verrouillés `is_super_admin()`. Il en faut
un nouveau, ou un élargissement de `get_paginated_audit_logs`.

**Recommandation : un RPC dédié** plutôt qu'élargir l'existant.

Motif : `get_paginated_audit_logs` est un journal **global** (tous bars, filtres
libres). L'élargir supposerait d'y injecter un filtre `bar_id` conditionnel selon
l'appelant — la complexité exacte qui produit des failles d'isolation. Un RPC
séparé, borné à un seul bar, est plus simple à relire et à durcir.

```
get_bar_audit_logs(p_bar_id, p_limit, p_offset, p_role_filter DEFAULT NULL)
```

Garde attendu :
```sql
IF NOT (is_super_admin()
        OR get_user_role(p_bar_id) = ANY (ARRAY['promoteur','co_promoteur'])) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
END IF;
```

⛔ **Points de vigilance issus de la phase 1** :
- `SECURITY DEFINER` + `SET search_path = public, extensions`
- `REVOKE ALL FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated`
  (`CREATE OR REPLACE` perd les grants)
- Le filtre `bar_id` doit être **dans le WHERE**, jamais optionnel : c'est
  l'isolation multi-tenant. Un `p_bar_id IS NULL` qui retournerait tout serait
  exactement la faille corrigée par `20260901110000`.

### 4.2 Volet 2 — Alimenter le journal (le vrai travail)

**État actuel** — vérifié le 01/09 :

| Service | Appels `auditLogger` |
|---|---|
| `AuthContext.tsx` | ✅ connexions, déconnexions |
| `sales.service.ts` | ⚠️ 2 appels seulement |
| `expenses.service.ts` | ❌ **0** |
| `stock.service.ts` | ❌ **0** |
| `returns.service.ts` | ❌ **0** |

Ce sont **précisément les opérations d'urgence** pour lesquelles le rôle existe.
Sans elles, le journal serait vide de ce qui intéresse le promoteur.

Événements à câbler, tous **déjà déclarés** dans `AuditLogEvent` :

| Opération | Événement | Sévérité |
|---|---|---|
| Annulation de vente validée | `SALE_CANCELLED` | `critical` |
| Saisie de dépense | `EXPENSE_CREATED` | `info` |
| Suppression de dépense | `EXPENSE_DELETED` | `warning` |
| Ajustement de stock | `STOCK_ADJUSTED` | `warning` |
| Paiement de salaire | `SALARY_PAID` | `critical` |
| Traitement de retour | `RETURN_PROCESSED` | `info` |

⚠️ **Ne pas sur-journaliser.** Chaque `auditLogger.log()` est un appel RPC
supplémentaire. Se limiter aux opérations **sensibles ou irréversibles** — pas
les lectures, pas les ventes ordinaires (déjà couvertes, et à fort volume).

> ⭐ Ce volet **bénéficie à tous les rôles**, pas seulement au co-promoteur : un
> promoteur pourra aussi voir ce qu'a fait son gérant. C'est un gain qui dépasse
> le chantier.

### 4.3 Volet 3 — L'écran

Un onglet ou une page accessible au promoteur, filtrée sur son bar.

`BarAuditLogsViewer` sert de **modèle visuel** (badges par action, expansion des
métadonnées, pagination) mais doit être dupliqué, pas réutilisé — il lit la
mauvaise table (§2.2).

Filtre utile : « actions de mes co-promoteurs » via `user_role = 'co_promoteur'`.

---

## 5. Questions ouvertes — TRANCHÉES le 21/09/2026

| # | Question | Décision | Impact |
|---|---|---|---|
| 1 | Journal global vs centré co-promoteur | ✅ **Global au bar, filtrable** | Le RPC `get_bar_audit_logs` accepte un paramètre de filtre optionnel (`p_role_filter`), pas un mode exclusif. L'écran affiche tout par défaut, avec un filtre « co-promoteur seul » activable. |
| 2 | Emplacement de l'UI de nomination | ✅ **`BarsManagementPage`** | Cohérent avec `BarAuditLogsModal` déjà présent à cet endroit (§3.1). Pas d'entrée dédiée dans `AdminLayout`. |
| 3 | Le gérant voit-il le journal ? | ✅ **Non — promoteur et co-promoteur seuls** | Le garde SQL de `get_bar_audit_logs` (§4.1) est : `is_super_admin() OR get_user_role(p_bar_id) = ANY (ARRAY['promoteur','co_promoteur'])`. Cohérent avec `canViewAccounting`/`canManageSalaries`, déjà hors périmètre gérant. |
| 4 | Journaliser les lectures sensibles ? | ⬜ **Non tranché — hors phase 2** | Reporté : volume d'écriture incertain, utilité non démontrée. À revisiter seulement si un besoin réel apparaît. |

> **Démarrage retenu : Chantier A (nomination) en premier.** Aucune migration SQL,
> rend le rôle exploitable pour un bar pilote sans attendre le journal.

---

## 6. Séquence proposée

| # | Livrable | Dépend de | Risque |
|---|---|---|---|
| **A1** | Service + UI de nomination (SuperAdmin) | — | Faible — RPC déjà en prod |
| **A2** | Journalisation de la nomination/retrait | A1 | Faible |
| **B1** | Migration : RPC `get_bar_audit_logs` | — | **Moyen** — isolation multi-tenant |
| **B2** | Câblage `auditLogger` dans les 4 services | — | Faible, mais volumineux |
| **B3** | Écran journal pour le promoteur | B1 + B2 | Faible |

⭐ **A et B sont indépendants** : A1/A2 peuvent être livrés seuls, ce qui rend le
rôle immédiatement exploitable. B1 est la seule migration SQL de cette phase.

---

## 7. Réserve de méthode

La phase 1 a connu **6 relevés successifs partiellement faux**, tous pour la même
raison : ils échantillonnaient le code au lieu de l'analyser.

Règles retenues, applicables ici :
- Pour un décompte : `count(*)`, jamais un comptage visuel de lignes.
- Pour un garde SQL : extraire les **lignes de code** (hors `--`, `*`, `/*`),
  jamais un `substring` qui ne rend que la première correspondance.
- **La prod fait foi, pas les fichiers de migration** — 6 divergences avérées.

Et la réserve de fond, inchangée depuis le cadrage initial : **aucun co-promoteur
réel n'existe encore**. Ce plan reste non confronté à l'usage. Le premier
utilisateur en dira plus que la prochaine revue.
