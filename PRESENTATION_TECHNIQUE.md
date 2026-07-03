# BarTender — Support de présentation technique

> POS (Point of Sale) multi-tenant SaaS pour la gestion de bars en Afrique de l'Ouest (Bénin).
> Application **offline-first**, conforme à la norme comptable **SYSCOHADA**, déployée en **PWA**.
>
> Public cible de cette présentation : **développeurs experts** (revue d'architecture) et **investisseurs** (maturité produit + différenciation marché).

---

## 1. Pitch en une diapositive

**Le problème.** La gestion des bars en Afrique de l'Ouest est encore **100 % manuelle (non digitalisée)** : cahiers, mémoire, calculs de tête. Cela génère des **conflits de confiance récurrents** dans toute la chaîne — entre promoteur et gérants, et entre gérants et serveurs (caisses qui ne tombent pas juste, points de vente divergents, stocks qui « disparaissent », ventes non tracées). À cela s'ajoute une obligation légale de comptabilité SYSCOHADA mal outillée.

**La solution.** Un POS mobile qui **digitalise et trace** chaque vente, stock, retour et consignation, attribue les opérations au bon acteur (fin des litiges), génère la comptabilité légale (Z de caisse, Livre Journal), et isole strictement chaque bar (multi-tenant).

**La promesse produit.** « Votre bar sur votre téléphone + zéro conflit gérant/serveurs + des commandes qui suivent les ventes. »

**La réponse au terrain (différenciateur technique).** Sur le terrain, le réseau est instable — une digitalisation qui « tombe » dès qu'il n'y a plus de connexion serait inutilisable. C'est pourquoi l'app est **offline-first réelle** (file de synchronisation persistante + idempotence serveur), pas un simple cache : une vente faite hors-ligne n'est **jamais perdue** et **jamais dupliquée**. L'offline-first n'est pas la proposition de valeur n°1 — c'est ce qui rend la digitalisation **fiable** là où elle doit servir. *Important : l'offline plein est accordé aux rôles de pilotage (gérant/promoteur) et en **mode simplifié** (kiosque central) ; pour un serveur en compte individuel, l'offline est volontairement dégradé — voir §5.0.*

---

## 2. L'application en chiffres (état du code)

| Métrique | Valeur |
|---|---|
| Lignes de TypeScript/TSX | **~106 500** |
| Pages | **24** |
| Composants React | **189** |
| Hooks custom | **71** |
| Services applicatifs | **45** |
| Migrations SQL versionnées | **348** |
| Fonctions/RPC PostgreSQL | **165** |
| Politiques RLS (Row-Level Security) | **293** |
| Fichiers de tests | **35** (unitaires + intégration) |
| Stories Storybook | **14** |

> Lecture pour investisseurs : ce n'est pas un MVP. C'est une base de code mature, structurée, testée, avec une dette technique activement remboursée (cf. §10).

---

## 3. Stack technique

| Couche | Technologie | Choix justifié |
|---|---|---|
| Frontend | React 18.3 + TypeScript 5.5 (strict) | Typage fort, écosystème mature |
| Build | Vite 5.4 | Build rapide, code-splitting natif |
| State serveur | TanStack React Query 5.90 | Cache, invalidation ciblée, retry intelligent |
| State client | React Context API | Actions + état réellement global uniquement |
| Backend | Supabase (PostgreSQL + Auth + Realtime + RLS) | Backend complet, RLS = sécurité au niveau DB |
| UI | Tailwind CSS 3.4 + Radix UI + Framer Motion | Design system cohérent + accessibilité |
| Offline | IndexedDB + BroadcastChannel | Persistance locale + sync cross-onglets |
| Tests | Vitest 4 + Playwright + Storybook | Unitaire, e2e, régression visuelle |
| Monitoring | Sentry | Capture d'erreurs en production (via wrapper) |
| Déploiement | Vercel (PWA) | `https://bar-tender-ten.vercel.app` |

---

## 4. Architecture d'ensemble

### 4.1 Shell minimal + layouts

`App.tsx` ne rend **aucune UI** (`return null`) — il initialise uniquement les services de fond (`NetworkManager`, `SyncManager`). Toute l'UI vit dans des **layouts par type d'expérience** :

```
/auth/*   → AuthLayout   (public : login, mot de passe oublié, reset)
/admin/*  → AdminLayout  (super_admin uniquement : sidebar fixe)
/*        → RootLayout   (utilisateurs bar : Header + navigation mobile)
```

Les **guards de redirection** sont dans les layouts (pas dans chaque route), et le RBAC fin est appliqué par route via `<ProtectedRoute permission="...">`.

### 4.2 Chaîne de Providers (composition explicite)

```
QueryClientProvider → Toaster → NotificationsProvider → AuthProvider
  → BarProvider → ThemeProvider → OnboardingProvider → GuideProvider
    → StockProvider → StockBridgeProvider → AppProvider → ErrorBoundary
      → App (services) + RouterProvider (UI)
```

### 4.3 Architecture des hooks en 3 couches (« Pillar 3 »)

Refactorisation clé qui a éliminé un *God Object* (un `AppProvider` qui stockait toutes les données et provoquait des re-renders globaux).

```
hooks/
├── queries/      # Lecture pure (React Query)        — 13 hooks
├── mutations/    # Écriture (React Query mutations)   —  7 hooks
└── pivots/       # Orchestrateurs (lecture + offline + optimistic)
```

Les **4 Pivot Hooks** sont le cœur du système : ils combinent l'état serveur, la file offline et les données optimistes pour exposer des données prêtes à l'emploi.

| Pivot Hook | Responsabilité |
|---|---|
| `useUnifiedStock` | Produits + stocks |
| `useUnifiedSales` | Ventes |
| `useUnifiedReturns` | Retours |
| `useUnifiedExpenses` | Dépenses |

**Règle architecturale stricte** : `AppContext` = **actions** (mutations). Les **données** = Pivot Hooks. Cela élimine la duplication de données et les re-renders globaux.

---

## 5. La réponse au terrain : architecture offline-first

> L'offline-first est ce qui rend la **digitalisation fiable** malgré un réseau instable — pas la proposition de valeur n°1, mais la pièce d'ingénierie la plus aboutie de l'application. À mettre en avant devant des experts.

### 5.0 Condition d'activation (à présenter honnêtement)

> ⚠️ L'offline-first n'est **pas une garantie universelle pour tous les utilisateurs** — il est conditionné par le rôle et le mode de fonctionnement du bar. C'est un choix de conception délibéré (intégrité du CA), pas une limite subie.

Règle métier réelle (`useCanWorkOffline.ts`) — le mode hors-ligne **plein** est accordé **si et seulement si** :

- **le rôle est gérant / promoteur / super_admin** (l'appareil de pilotage), **OU**
- **le bar est en mode simplifié** (l'appareil est un kiosque central, typiquement la tablette du gérant qui saisit les ventes et les attribue aux serveurs d'une liste).

Dans ces deux cas, une vente passée hors-ligne est **validée d'office** (statut `validated`) pour qu'elle ne disparaisse jamais du CA global après synchronisation.

**Cas limite assumé — un serveur (compte individuel) en mode complet, hors-ligne** : la vente est tout de même mise en file locale, mais en statut **`pending`** (à valider par le gérant) et l'UI affiche un **avertissement explicite** (« le gérant ne recevra cette demande qu'après synchronisation »). L'offline y est donc **dégradé**, pas garanti — par design, pour ne pas injecter du CA non supervisé.

**À retenir pour la présentation** : l'offline-first brille surtout en **mode simplifié** (un seul point de saisie central) et pour les **rôles de pilotage**. C'est cohérent avec la cible (petits bars où le gérant tient la caisse). Ne pas le vendre comme « tout le monde vend hors-ligne sans condition ».

### 5.1 Les trois services de fond

| Service | LOC | Rôle |
|---|---|---|
| `NetworkManager` | 435 | Détection réseau avec *grace period* (évite les faux positifs de déconnexion) |
| `offlineQueue` | 646 | File de synchronisation persistante sur **IndexedDB** |
| `SyncManager` | 1244 | Rejeu automatique de la file au retour réseau (singleton pub/sub) |

### 5.2 File de synchronisation priorisée

Quand le réseau revient sur une connexion lente (2G/3G), les opérations critiques passent en premier :

```
Priorité 3 (Critique) : CREATE_SALE, PAY_TICKET, CREATE_TICKET   → perdre une vente = perdre de l'argent
Priorité 2 (Normal)   : retours, dépenses, approvisionnements, consignations
Priorité 1 (Basse)    : catalogue, configuration, mappings
```

### 5.3 Garanties de robustesse (les détails qui comptent)

- **Idempotence serveur** : chaque vente porte une `idempotency_key` (UUID), avec un **index unique** en base. Un retry réseau ne crée jamais de doublon — la garantie est au niveau PostgreSQL, pas dans le client.
- **IDs stables pré-générés** : les UUID sont générés *avant* les appels, garantissant la traçabilité même hors-ligne et entre étapes d'une opération multi-étapes.
- **Anti-« trou de CA »** : un tampon (`recentlySyncedKeys`, TTL 5 min) évite que le chiffre d'affaires affiché ne « clignote » juste après une synchro, avant que le serveur n'indexe les agrégats.
- **Translation d'IDs** : un store IndexedDB dédié mappe les IDs locaux/temporaires vers les IDs serveur définitifs.
- **Sync cross-onglets** : `BroadcastChannel` synchronise l'état entre plusieurs onglets ouverts.
- **Timeout adaptatif** : 15 s sur mobile / connexion lente, 5 s sur desktop.
- **Retry avec backoff exponentiel** + rollback best-effort pour les opérations atomiques en 2 étapes.

### 5.4 Schéma du flux de données

```
1. Action utilisateur  → Optimistic UI (état local immédiat)
2. Hors-ligne ?        → opération mise en file (IndexedDB) avec clé d'idempotence
3. Retour réseau       → SyncManager rejoue la file par priorité + retry/backoff
4. Realtime Supabase   → invalidation ciblée du cache React Query
```

---

## 6. Sécurité & multi-tenant

> Argument fort à la fois pour les experts (rigueur) et les investisseurs (confiance, conformité).

- **293 politiques RLS** : la sécurité est appliquée **au niveau de la base de données**, pas seulement dans le frontend. Même une requête malveillante ne peut pas franchir l'isolation tenant.
- **Isolation tenant** : toute requête est filtrée par `bar_id`. Aucune requête cross-tenant. L'appartenance est déterminée par la table `bar_members`.
- **RPC `SECURITY DEFINER`** avec vérification explicite de rôle (ex. `is_super_admin()`) et `search_path` figé — protection contre l'escalade de privilèges.
- **Audit logging** : tables d'audit dédiées (`audit_logs`, `bar_audit_log`, `user_audit_log`, `return_audit_log`, `global_catalog_audit_log`…) + service `AuditLogger`. Détection des violations RLS (`rls_violations_log`).
- **Monitoring via wrapper** : Sentry n'est jamais appelé directement. Session Replay désactivé (données financières sensibles). Source maps en mode `hidden`.

### Modèle RBAC (4 rôles hiérarchiques)

| Rôle | Niveau | Périmètre |
|---|---|---|
| `super_admin` | 1 | Tout + dashboard admin, gestion promoteurs, stats globales, abonnements |
| `promoteur` | 2 | Gère ses bars, crée des bars, configure tout, comptabilité, salaires |
| `gerant` | 3 | Stocks, analytiques, dépenses (sans comptabilité ni salaires) |
| `serveur` | 4 | Ventes et retours uniquement |

Permissions déclaratives centralisées (`getPermissionsByRole`), appliquées à **trois niveaux** : routes (`ProtectedRoute`), composants (`hasPermission` / `usePermissions`), et base de données (RLS).

---

## 7. Profondeur fonctionnelle (24 pages)

**Opérations bar**
- POS / vente rapide (`QuickSaleFlow`), panier, validation/rejet de ventes
- Inventaire avec **CUMP** (Coût Unitaire Moyen Pondéré recalculé à chaque entrée stock)
- Retours et **échange de produit** (« Magic Swap » : retour + vente liée atomiques avec rollback)
- **Consignation** (mise de côté avec expiration configurable, réclamation, forfait)
- Approvisionnements + bons de commande (`purchase_orders`)

**Pilotage**
- Dashboard temps réel (subscriptions Realtime Supabase → invalidation ciblée du cache), analytiques, statistiques par bar
- **Aide à la commande / prévision statistique** (`ForecastingAIPage`) : moyenne journalière des ventes sur 30 jours (vue matérialisée `product_sales_stats`) → suggestion de quantité à commander par couverture en jours, avec niveau d'urgence. Moteur **statistique** aujourd'hui ; **menu volontairement désactivé** en attendant l'accumulation de données réelles (couche IA = prochain chantier, cf. **§14.1 Roadmap**). Pas d'IA générative / LLM à ce stade.
- Promotions (activation/expiration automatiques via RPC `auto_activate_scheduled_promotions` / `auto_expire_promotions`, stats avec profit)

**Comptabilité légale (SYSCOHADA)**
- Module dédié (`services/accounting/syscohada.service.ts`)
- **Z de caisse** (rapport de clôture), Livre Journal
- Dépenses, salaires, apports de capital, soldes initiaux
- Identifiants légaux (RCCM, IFU/NINEA) pour l'en-tête du journal

**Administration (super_admin)**
- Gestion des bars, des utilisateurs, du catalogue global
- Journaux d'audit, dashboard sécurité
- **Suivi des abonnements** (paiements manuels Mobile Money/espèces, échéances, MRR)

**Onboarding & formation**
- Parcours d'onboarding guidé, système de guides versionnés (`guide_progress`, `training_versions`)

---

## 8. Spécificités métier (preuve de connaissance terrain)

> Ces détails montrent à un investisseur que le produit est conçu *pour* le marché, pas adapté après coup.

- **Devise** : Franc CFA (XOF), formaté via un service dédié testé (`BeninCurrencyService`).
- **Journée comptable décalée** : les bars ferment après minuit. Une vente à 2 h du matin appartient à la **veille comptable**. Les calculs utilisent `businessDate` (et non `createdAt`) — RPC `calculate_business_date` côté serveur, helpers testés côté client.
- **Mode simplifié vs complet** : un bar peut fonctionner avec comptes serveurs individuels, ou en mode simplifié où le gérant attribue les ventes à une liste de serveurs.
- **Conformité régionale** : RCCM, IFU/NINEA, jours fériés Bénin intégrés.

---

## 9. Performance & optimisation des coûts (egress)

> Sujet à valeur double : performance technique **et** maîtrise des coûts d'infrastructure (marge unitaire).

- **Optimisation egress active** (commits récents) : bornage des fenêtres de fetch (ventes du jour pour Retours/Consignations, période analysée + précédente pour Analytics, garde-fou `dataTier` resserré de 6 mois à 60 jours). Objectif : limiter le volume de données transférées depuis Supabase = **coût d'infra maîtrisé** à mesure que le nombre de bars croît.
- **`CACHE_STRATEGY` par type de donnée** : ventes/stock 5 min, dashboard 2 min, produits 30 min, catégories/settings 24 h.
- **Clés de requête hiérarchiques** (`QUERY_KEYS`) → invalidation ciblée plutôt que globale.
- **Retry React Query intelligent** : jamais de retry sur 401/403/404/AbortError ; max 2 tentatives.
- **Code-splitting + `lazyWithRetry`** : retry automatique des chunks (backoff 1 s → 3 s → 10 s) sur connexion instable.
- **PWA / Workbox** : stratégies de cache adaptées au type de ressource (`NetworkOnly` pour l'auth, `NetworkFirst` pour l'API, `CacheFirst` pour les assets, `StaleWhileRevalidate` pour les chunks JS/CSS).
- **CSS critique inline** + virtualisation des listes longues (`react-window`) + versioning de build (`version.json`) pour la détection de mise à jour PWA.

---

## 10. Qualité, tests & ingénierie

- **Tests d'intégration ciblés sur les flux critiques** : `offline-resilience`, `sales-sync`, `batching-sync`, `stock-lifecycle`, `rbac-filtering`, `syncManager.rescue`, `syncManager.backgroundSync`.
- **Tests unitaires** sur la logique métier sensible : calculs de revenus, dates comptables, normalisation produits, SYSCOHADA, devise, plans/permissions.
- **Dette technique remboursée méthodiquement** : campagne « Sprint A→K » d'élimination des `any` TypeScript (≈ 0 erreur TS en production), chaque `any` restant étant justifié et documenté.
- **Design system documenté** dans Storybook (Button, Input, Select, Modal… avec variants).
- **Discipline de migration DB** : 348 migrations versionnées, conventions documentées, RPC atomiques.
- **Readiness de migration backend** : wrappers d'abstraction auth/storage déjà en place + runbook (`docs/MIGRATION_RUNBOOK.md`) — pas de lock-in dur sur le fournisseur.

---

## 11. Modèle économique (pour les investisseurs)

Segmentation **par taille d'équipe** (toutes les fonctionnalités incluses dans tous les plans — anti-lock-in, conformité légale garantie pour tous) :

| Plan | Prix / mois | Équipe max | Positionnement |
|---|---|---|---|
| **Starter** | 9 000 XOF (300 FCFA/j) | 3 | Sas commercial, force l'upsell au 4ᵉ membre |
| **Pro** | 15 000 XOF (500 FCFA/j) | 8 | Tier vedette (cœur de cible) |
| **Max** | 30 000 XOF (1 000 FCFA/j) | 20 | Gros bars / réseaux |

- **Suivi d'abonnement intégré** côté admin : paiements manuels (Mobile Money / espèces), statut source-de-vérité **serveur** (RPC `get_subscription_overview`), historique append-only, calcul du **MRR**.
- **Stratégie de scaling** : 3 → 30 bars en 9 mois (fondateur solo). ICP : bars à 80–300 tickets/jour.

---

## 12. Points forts à marteler en présentation

**Pour les experts dev**
1. Offline-first *réel* : idempotence garantie en base + file persistante priorisée, pas un cache naïf.
2. Sécurité défense en profondeur : 293 politiques RLS, RBAC à 3 niveaux, audit complet.
3. Architecture de hooks en 3 couches qui a tué un God Object — séparation nette données/actions.
4. Discipline d'ingénierie : 348 migrations, ~0 `any` non justifié, tests d'intégration sur les flux critiques.

**Pour les investisseurs**
1. Marché non digitalisé : on remplace cahiers et mémoire par un POS qui **trace tout et supprime les conflits** promoteur/gérant/serveurs — la douleur n°1 du secteur.
2. Produit mature (~106k LOC), pas un prototype — risque d'exécution technique faible.
3. Conçu pour le terrain (journée comptable décalée, XOF, SYSCOHADA, réseau instable → offline-first).
4. Conformité légale SYSCOHADA = barrière à l'entrée + argument de vente réglementaire.
5. Coût d'infra activement optimisé (egress) = marge unitaire défendable au scaling.
6. Modèle de revenus instrumenté (MRR, suivi d'abonnement intégré).

---

## 13. Annexe — schéma de données (extrait)

**47 tables applicatives** (hors tables de backup/scratch), dont les piliers :
`bars`, `bar_members`, `users`, `bar_products`, `global_products`, `global_categories`, `bar_categories`, `sales`, `sale_promotions`, `returns`, `consignments`, `supplies`, `purchase_orders` / `purchase_order_items`, `stock_adjustments`, `expenses`, `salaries`, `capital_contributions`, `accounting_transactions`, `promotions`, `tickets`, `subscription_payments`, `ai_insights`, `audit_logs` (+ tables d'audit dédiées).

**RPC notables** : `create_sale_idempotent`, `create_sale_with_promotions`, `create_sales_batch`, `cancel_sale`, `setup_promoter_bar`, `record_subscription_payment`, `get_subscription_overview`, `create_consignment` / `claim_consignment` / `forfeit_consignment`, `calculate_business_date`, `check_plan_member_limit`.

---

## 14. Roadmap produit (chantiers séquencés)

> Ces trois chantiers sont **volontairement séquencés**, pas des manques. La séquence est dictée par une dépendance logique (la donnée d'abord, l'IA ensuite) et par la demande terrain.

### 14.1 Prévision IA (prochain chantier)

- **État actuel** : la fonctionnalité est **volontairement désactivée** — l'entrée de menu « Prévisions et IA » est commentée dans `MobileNavigation` **et** `MobileSidebar`. La **route et la page existent déjà** (`/forecasting`, protégée par permission + feature flag), avec aujourd'hui un moteur **statistique** opérationnel.
- **Pourquoi attendre** : une vraie couche IA exige d'abord d'**accumuler des données de bars en situation réelle sur une période significative**. Brancher un modèle sur un historique vide produirait des prédictions sans valeur. La décision de retirer le menu est donc un choix de **crédibilité produit**, pas une lacune.
- **Cible technique** : brancher l'**API Claude (Anthropic)** sur l'historique de ventes accumulé (les tables `ai_insights` / `ai_conversations` sont déjà provisionnées en base). Le moteur statistique actuel sert de **socle de référence** (baseline) pour mesurer l'apport réel de l'IA.
- **Lecture investisseurs** : la donnée propriétaire accumulée (ventes réelles multi-bars) devient un **actif différenciant** — c'est elle qui rend l'IA défendable, pas l'inverse.

### 14.2 Co-promoteur (bars avec associés)

- Certains bars sont détenus par **plusieurs associés**. Le modèle actuel repose sur un `owner_id` unique par bar.
- Le chantier introduira un **partage de propriété** (plusieurs promoteurs sur un même bar), avec impacts sur le RBAC, les politiques RLS et le partage de capital. Note : la table `capital_contributions` (apports de capital) est **déjà en place**, ce qui prépare le terrain.

### 14.3 Module restauration

- Une partie des bars font **aussi de la restauration**. Le modèle actuel gère un stock de **produits finis revendus tels quels** (avec CUMP).
- Le chantier ajoutera la dimension **cuisine** (plats, recettes, transformation d'ingrédients), au-delà de la simple revente — extension naturelle du moteur de stock existant.

> **Synthèse roadmap** : 1) collecter la donnée → 2) IA branchée sur cette donnée (API Claude) ; en parallèle, 3) co-promoteur et 4) restauration en réponse à des segments clients identifiés. Chaque chantier s'appuie sur des fondations **déjà présentes** dans le code (route forecasting, `capital_contributions`, moteur de stock).

---

## 15. Note de certification (vérification source)

> Chaque affirmation chiffrée ou technique de ce document a été **confrontée au code source**, pas reprise de la documentation. Méthodologie et réserves ci-dessous, par honnêteté intellectuelle devant un public d'experts.

**Vérifié dans le code (sourcé)**
- Métriques (LOC, pages, hooks, services, migrations, RPC, RLS, tests, stories) : comptées directement sur le dépôt.
- **Idempotence des ventes** : `idx_sales_idempotency_key` est bien un **index UNIQUE** réel (`20260205170000`), RPC `create_sale_idempotent` présente.
- **File offline priorisée** : table `SYNC_PRIORITY` réelle dans `offlineQueue.ts` (CREATE_SALE = priorité 3).
- **TypeScript strict** : `"strict": true` confirmé dans `tsconfig.app.json` et `tsconfig.node.json`.
- **SYSCOHADA** : Z de caisse + numérotation fiscale réels dans `services/accounting/syscohada.service.ts` (+ tests).
- **CUMP** : `currentAverageCost` / `cump` réel dans `costResolution.ts`.
- **Realtime** : `postgres_changes` + `.channel()` réellement branchés dans `RealtimeService.ts`.
- **47 tables applicatives** (les 3 entrées `bar_products_backup_`, `ignore`, `saute` sont du bruit de migration, exclues).

**Point de vigilance — le forecasting est une étape roadmap, pas de l'IA (encore)**
- La page **`ForecastingAIPage`** porte « AI » dans son nom, mais le moteur (`forecasting.service.ts`) est aujourd'hui **purement statistique** : moyenne journalière de ventes sur 30 j → suggestion de réassort par couverture. **Aucun appel LLM dans `src/`** (vérifié : pas d'`anthropic`, `openai`, `chat/completions`, etc.).
- **C'est un choix assumé** : le menu est volontairement désactivé (commenté dans les deux composants de nav) en attendant l'accumulation de données réelles ; la vraie couche IA (API Claude) est le prochain chantier (§14.1).
- **Recommandation de présentation** : présenter l'existant comme « **aide à la décision de commande basée sur l'historique de ventes** » (solide et vrai), et l'IA comme **roadmap claire avec dépendance data explicite**. Devant des experts, cette honnêteté + la séquence « donnée d'abord, IA ensuite » renforce la crédibilité ; un « AI » présenté comme déjà livré la détruirait.

**Conclusion de certification.** Le document est fidèle au code. Le seul écart entre le nommage (`ForecastingAIPage`) et la réalité technique est désormais explicité et repositionné en roadmap (§14). Aucun autre angle mort sur les claims techniques centraux (offline, sécurité, multi-tenant, comptabilité, perf/egress).

---

*Document généré pour préparation de présentation, certifié contre le code source. Les chiffres reflètent l'état du dépôt au 2026-06-07.*
