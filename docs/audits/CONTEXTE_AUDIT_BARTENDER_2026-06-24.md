# Dossier de contexte — BarTender (à joindre au prompt d'audit)

> Ce document donne l'architecture réelle et l'état d'un durcissement sécurité récent.
> **Ne le tiens pas pour argent comptant** : vérifie ses affirmations. Il sert à t'éviter de
> re-signaler ce qui est déjà traité, et à t'orienter vers les zones où des pièges ont déjà
> été trouvés — pour que tu creuses **plus loin**, pas que tu refasses le même chemin.

---

## 1. Architecture réelle

### Frontend
- `App.tsx` ne rend aucune UI (`return null`) — il initialise seulement `networkManager` et
  `syncManager`. Toute l'UI est dans les layouts + `RouterProvider`.
- **3 groupes de routes** (`createBrowserRouter`, `src/routes/index.tsx`) :
  - `/auth/*` → `AuthLayout` (public : login, forgot/reset password)
  - `/admin/*` → `AdminLayout` (`super_admin` uniquement)
  - `/*` → `RootLayout` (utilisateurs bar)
- **Guards de redirection dans les layouts**, pas dans les routes. `RootLayout` : redirige
  `super_admin` → `/admin`. `AuthLayout` : redirige tout authentifié → `/` (sauf
  `PASSWORD_RECOVERY`). ⚠️ Cette redirection dans `AuthLayout` court-circuite l'écran de
  « première connexion » de `LoginScreen` (voir §3).
- **Providers imbriqués** (`main.tsx`) : QueryClient → Toaster → Notifications → Auth → Bar →
  Theme → Onboarding → Guide → Stock → StockBridge → App → ErrorBoundary.
- **Architecture hooks 3 couches** : `hooks/queries/` (lecture React Query),
  `hooks/mutations/` (écriture), `hooks/pivots/` (orchestrateurs : `useUnifiedStock`,
  `useUnifiedSales`, `useUnifiedReturns`, `useUnifiedExpenses` — combinent server state +
  offline queue + optimistic). **Règle** : `AppContext` = actions/mutations uniquement ; les
  données = pivot hooks. Vérifie que cette séparation tient réellement.

### Backend Supabase
- **Toutes les fonctions `SECURITY DEFINER` ont pour owner `postgres`** → elles bypassent la
  RLS. C'est le fait central de sécurité : « let RLS handle it » est faux pour ces fonctions.
- Helpers d'auth `SECURITY DEFINER` (nécessaires pour éviter la récursion RLS sur
  `bar_members`) : `is_super_admin()` (lit `auth.users.is_super_admin`), `is_bar_member(uuid)`,
  `get_user_role(uuid)`, `is_promoteur_or_admin()`. **Ne pas casser ces helpers** — ils sont le
  socle de la RLS.
- ~130 fonctions au total ; beaucoup de RPC de lecture/écriture métier prenant `bar_id` en
  paramètre.

### Offline-first
- Optimistic UI → si offline, opération mise en queue IndexedDB (`offlineQueue.ts`) →
  `SyncManager.ts` rejoue au retour réseau. Idempotence via clés UUID pré-générées.
- Persistance React Query dans localStorage pour les données critiques (sales/stock/products).
- `hook useRobustOperation` : timeout + retry + gestion « late success » (backend réussit après
  timeout UI).

---

## 2. Invariants métier à vérifier

- **Journée comptable décalée** : `businessDate` (pas `createdAt`) pour tout agrégat. Fermeture
  après minuit (`closing_hour`, souvent 6h). Une vente à 2h = jour précédent.
- **CUMP** (coût unitaire moyen pondéré) : recalculé à chaque entrée stock, valorise
  l'inventaire.
- **Idempotence des ventes** : clé UUID pour éviter les doublons sur retry réseau.
- **Isolation** : jamais de query cross-tenant ; `bar_members` détermine l'accès d'un user à un
  bar ; le `super_admin` n'est PAS toujours dans `bar_members` (architecture "system bar") — la
  RLS doit le gérer via `is_super_admin()` qui lit `auth.users`.
- **`bar_products`** : invariant `is_custom_product`/`global_product_id` ; une corruption
  héritée (enrichissement catalogue ancien) a déjà bloqué la modification de prix — vérifie la
  cohérence de ce mapping.
- **provideExchange (Magic Swap)** : échange produit lors d'un retour = opération 2-étapes
  (créer retour → créer vente liée), IDs stables pré-générés, rollback best-effort. Zone à
  race conditions.

---

## 3. État du durcissement sécurité RPC (récent — NE PAS re-signaler ces points comme non-faits)

Un durcissement en 3 vagues a été appliqué en prod. **Considère ces points comme traités, mais
VÉRIFIE qu'ils tiennent réellement et cherche ce qui a été MANQUÉ autour :**

- **Fuites `anon` fermées** : `get_paginated_audit_logs`, `get_paginated_catalog_logs_for_admin`
  (étaient lisibles sans authentification) → guard `is_super_admin()` + `REVOKE FROM PUBLIC`.
- **RPC plateforme gardées** : `get_paginated_bars`, `get_unique_bars`, `get_dashboard_stats` →
  guard `is_super_admin()`.
- **RPC stats scopées bar gardées** : `get_bar_admin_stats`, `get_top_products_aggregated`,
  `get_top_products_by_server`, `get_bar_promotion_stats_with_profit`,
  `get_bar_global_promotion_stats_with_profit` → guard `is_bar_member OR owner OR is_super_admin`.
- **`get_bar_products` / `get_bar_members`** : guard membre/owner, `REVOKE FROM PUBLIC`.
- **Supprimées** : `validate_and_get_impersonate_data`, `get_user_bars(uuid)` (énumération
  cross-tenant), Edge Function `sign-impersonate-token`.

### Pièges DÉJÀ rencontrés (cherche s'il en reste des similaires ailleurs)
1. **`REVOKE FROM anon` seul ne suffit pas** : `EXECUTE` vient de `PUBLIC` par défaut → il faut
   `REVOKE FROM PUBLIC`. → Y a-t-il d'autres fonctions encore ouvertes via PUBLIC ?
2. **Surcharge fantôme** : une migration a recréé `get_bar_products(uuid,uuid,int,int)` à côté
   de la version active `(...,boolean)` → ambiguïté `42725` → app cassée. → Cherche d'autres
   fonctions à surcharges multiples.
3. **Migration non appliquée / divergente** : plusieurs migrations n'avaient PAS l'effet attendu
   en prod (guard réécrit par une migration postérieure, REVOKE oublié). → **Confronte
   systématiquement fichiers vs `pg_proc` réel.**
4. **Conversion `sql`→`plpgsql`** a introduit 3 bugs successifs sur les mêmes fonctions :
   ambiguïté de colonne (`42702`), mismatch de type `RETURN QUERY` (`42804` : `NOW()` timestamptz
   vs colonne sans tz), perte de `search_path`. → Vérifie TOUTES les fonctions plpgsql à
   `RETURNS TABLE` pour ces 3 classes de bug.

### Findings connus NON traités (tu peux les confirmer/approfondir, mais ils sont déjà identifiés)
- **`is_super_admin() TO anon`** : volontairement GRANT à `anon` car appelé par ~300 policies
  RLS `USING(... OR is_super_admin())`. Le révoquer pourrait casser l'évaluation de policy pour
  `anon`. → Évalue le vrai risque et la bonne approche.
- **Écran "première connexion" jamais atteint** : `AuthLayout` redirige l'utilisateur authentifié
  vers `/` dès que `login()` pose la session, AVANT que `LoginScreen` affiche l'écran de
  changement de mdp forcé. `first_login` reste donc un champ sans effet fonctionnel. Décision
  produit : forçage abandonné (l'employé change son mdp via Profil). → Signale si tu vois un
  meilleur design, mais ce n'est pas un bug bloquant.
- **Résidus impersonation** : `impersonatingUserId` (toujours `undefined`) traîne dans
  `useApiQuery`/`auth.service`/`products.service` + param `p_impersonating_user_id` encore dans
  la signature de certaines RPC. Inerte mais à nettoyer.

### ⚠️ Le pattern « surcharge RPC fantôme » s'est reproduit une 2ᵉ fois (confirme sa fréquence)
Un incident distinct (postérieur à la Vague 3, hors périmètre RPC de lecture) a cassé `reject_sale`
en prod : une migration a ajouté un paramètre `p_note` via `CREATE OR REPLACE`, créant une
**surcharge** au lieu de remplacer la fonction ; le client omettant `p_note` (valeur `undefined`
strippée par le SDK) déclenchait un appel 2-arguments ambigu
(`PGRST300 Could not choose the best candidate function`). Un audit `pg_proc` a trouvé **6
fonctions en doublon** au total dans la base — toutes n'ont pas nécessairement de bug actif, mais
le pattern (migration qui change une signature sans `DROP` préalable → coexistence de versions) a
maintenant été observé sur `get_bar_products` ET une fonction de vente. **Traite ceci comme un
signal fort : audite systématiquement `COUNT(*) FROM pg_proc GROUP BY proname HAVING COUNT(*)>1`
pour TOUTE la base, pas seulement les fonctions déjà citées dans ce document.**

---

## 4. Domaines fonctionnels à auditer en profondeur (exactitude, pas seulement sécurité)

Au-delà de la sécurité d'accès, les axes suivants doivent être vérifiés pour l'**exactitude des
données** et la **fiabilité fonctionnelle** — c'est aussi important qu'une faille d'isolation,
car une erreur silencieuse de calcul détruit la confiance dans l'outil (l'utilisateur ne sait
pas qu'il a un chiffre faux).

### Flux d'approvisionnement (supplies)
- Fichiers clés : `src/services/supabase/purchaseOrders.service.ts`, migrations
  `20251218120000_create_supply_and_update_cump.sql`,
  `20260507000000_supply_reversal_and_metadata_edit.sql`,
  `20260509000001_fix_expenses_summary_reverse_supply.sql`,
  `20260225000000_delete_orphaned_supply_expenses.sql` (le nom suggère un bug déjà rencontré de
  dépenses orphelines liées aux supplies — vérifie si le problème racine est vraiment corrigé ou
  seulement nettoyé une fois).
- Vérifie : la réception d'un approvisionnement recalcule-t-elle correctement le CUMP ? Un
  **reversal** (annulation d'appro) restaure-t-il le stock ET le CUMP à leur état exact
  d'avant, ou seulement le stock (désync silencieuse du coût moyen) ? Un appro partiellement
  reçu (commande d'achat convertie en plusieurs livraisons) est-il cohérent avec le stock final ?
  Ordre d'achat (`purchaseOrders`) → conversion en supplies (`convert_purchase_order_to_supplies`)
  : perte/duplication possible ?

### Exactitude des données Inventaire & Comptabilité
- **Inventaire** : le stock affiché correspond-il à `ventes - retours + supplies +/-
  ajustements` de façon exacte et auditable ? Cherche les doubles comptages (ex. un retour qui
  restocke ET dont la vente liée décrémente à nouveau), les ajustements manuels
  (`stock-adjustments.service.ts`) qui ne laissent pas de trace cohérente avec le CUMP.
- **Comptabilité SYSCOHADA** : pas de service dédié identifié (`src/services/supabase/` n'a pas
  de fichier `accounting`/`syscohada`) — les chiffres sont vraisemblablement calculés côté
  hooks/composants à partir de `sales`/`expenses`/`supplies`. Vérifie où et comment le "Z de
  caisse" est généré : est-ce une RPC serveur (source de vérité unique) ou un calcul recomposé
  côté client à chaque affichage (risque de divergence entre deux écrans, ou entre deux
  utilisateurs qui rafraîchissent à des instants différents) ? Les totaux respectent-ils
  `businessDate` partout, y compris dans les exports ?
- Cherche les écrans qui **recalculent localement** des totaux déjà calculés côté serveur (risque
  de divergence silencieuse si la logique diffère même légèrement, ex. arrondi, fuseau horaire,
  inclusion/exclusion des ventes `pending`).

### Fiabilité des promotions
- Fichier clé : `src/services/supabase/promotions.service.ts` + RPC
  `get_bar_promotion_stats_with_profit` / `get_bar_global_promotion_stats_with_profit` /
  `create_sale_with_promotions` / `increment_promotion_uses` / `auto_activate_scheduled_promotions`
  / `auto_expire_promotions`.
- Vérifie : une promotion expirée pendant qu'un client la consulte peut-elle encore s'appliquer
  au moment du paiement (race condition validation/expiration) ? Le cumul de plusieurs promotions
  sur une même vente est-il possible/voulu, et le calcul de marge/ROI le gère-t-il correctement ?
  Un produit désactivé ou dont le prix change pendant qu'une promo est active fausse-t-il le
  `discount_amount`/`product_cost_total` enregistré ? `auto_expire_promotions` /
  `auto_activate_scheduled_promotions` sont-elles déclenchées de façon fiable (cron ? trigger ?
  à la demande ?) — un décalage de leur exécution peut laisser une promo visible mais invalide, ou
  l'inverse.

---

## 5. Où concentrer ton second regard (ce qu'on suspecte ne PAS avoir couvert)

Le durcissement s'est concentré sur les **RPC de lecture**. Zones probablement moins auditées,
à creuser en priorité :
- **RPC de MUTATION** (`create_sale*`, `decrement_stock`, `increment_stock`, `cancel_sale`,
  `validate_sale`, `reject_sale`, `create_supply_and_update_product`, `claim_consignment`,
  `pay_ticket`, `assign_bar_member`, etc.) : ont-elles un guard vérifiant que l'appelant a le
  droit d'écrire dans CE bar ? Une écriture cross-tenant est plus grave qu'une lecture.
- **Concurrence stock** : deux ventes simultanées du dernier article → stock négatif ? verrou ?
- **Sync offline** : rejeu de queue après reconnexion → doublons de ventes ? cohérence CUMP ?
- **Realtime** : les subscriptions filtrent-elles bien par `bar_id` ? Un client peut-il
  s'abonner aux changements d'un autre bar ?
- **RLS des TABLES** (pas seulement des RPC) : accès directs `supabase.from('table')` côté
  client — la RLS de chaque table est-elle réellement étanche par `bar_id` ?
- **Egress / scalabilité** : requêtes non bornées (analytics, historiques) qui exploseront le
  coût Supabase et la latence à 30+ bars.
- **Approvisionnement, inventaire, comptabilité, promotions** : voir §4 ci-dessus — axes
  fonctionnels d'exactitude des données, pas seulement de sécurité d'accès.

---

*Contexte arrêté au 24/06/2026 (mis à jour avec l'incident `reject_sale` du 03/07/2026 et
l'élargissement du périmètre fonctionnel). L'auditeur doit confronter chaque affirmation à
l'état réel du code et du staging — ce document peut lui-même contenir des inexactitudes ou
être périmé.*
