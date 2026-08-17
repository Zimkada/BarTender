-- ═══════════════════════════════════════════════════════════════════════
-- IMPUTATION DU PLAT AU SERVEUR DU BON — §20, lot 2
-- 17/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ LE DÉFAUT, remonté par le fondateur et VÉRIFIÉ.
--
-- `serve_kitchen_item` code en dur `v_actor := auth.uid()` comme vendeur :
--
--     v_sale := public.create_sale_idempotent(
--       p_bar_id, v_items, p_payment_method, v_actor, v_key, ...
--
-- En MODE SIMPLIFIÉ, l'utilisateur connecté est TOUJOURS le gérant. Un plat
-- servi lui est donc imputé, alors qu'une boisson de la MÊME commande part
-- sur le serveur choisi au panier (`sale.server_id`).
--
-- ⚠️ CE N'EST PAS COSMÉTIQUE. « Mon équipe » lit `sale.sold_by` comme source
-- d'imputation (useTeamPerformance.ts:59 — « Source of truth: soldBy is the
-- business attribution »). Or le gérant N'ENCAISSE PAS lui-même : les serveurs
-- sont au contact du client, seuls ceux qui commandent au comptoir paient au
-- gérant. Le CA par serveur sert donc à savoir COMBIEN RECOUVRER CHEZ CHACUN
-- en fin de journée. Un serveur qui écoule 20 bières et 15 plats se voyait
-- créditer des seules bières — le montant réclamé était faux.
--
-- ⭐ Comptabilité globale, marge et stock N'ÉTAIENT PAS affectés : seule
-- l'imputation individuelle l'était.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐⭐ POURQUOI LIRE LE BON, ET NON AJOUTER UN PARAMÈTRE            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ La première conception ajoutait `p_server_id` + un sélecteur « qui a
-- servi ? » au moment du service. ÉCARTÉE à la validation, pour trois raisons
-- vérifiées dans le code :
--
--   1. L'INFORMATION EXISTE DÉJÀ. Dès qu'un panier contient un plat,
--      `Cart.tsx` crée un BON IMPLICITE qui porte `tickets.server_id` (le
--      serveur choisi au panier). Redemander au service, c'est poser deux fois
--      la même question.
--
--   2. DEUX RÉPONSES POSSIBLES POUR UNE SEULE COMMANDE. Choisir « Paul » au
--      panier puis « Awa » au service enverrait les boissons à Paul et le plat
--      à Awa — une commande, deux imputations, et un recouvrement faux que
--      personne ne pourrait diagnostiquer. Le §16.7 exige UNE addition.
--
--   3. AUCUNE VALIDATION D'APPARTENANCE NÉCESSAIRE. Un `p_server_id` venu du
--      client aurait dû être vérifié (`serve_kitchen_item` n'est PAS gardée
--      par `can_write_kitchen` : le serveur doit pouvoir servir). Lu depuis
--      `tickets.server_id`, il vient d'une ligne en base rattachée par clé
--      étrangère — la question ne se pose plus.
--
-- ⭐ TOUT PLAT A NÉCESSAIREMENT UN BON : `kitchen_orders.ticket_id` est
-- NOT NULL. L'héritage a donc toujours une source, sans cas dégénéré.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐ LE MODE COMPLET EST PROTÉGÉ PAR LA DONNÉE, PAS PAR UN `IF`     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⚠️ J'ai d'abord cru qu'il fallait conditionner au mode simplifié. C'est
-- INUTILE, et la vérification est le point le plus important de cette
-- migration :
--
--   `Cart.tsx:96` déclare `let serverId: string | undefined` et ne le peuple
--   QUE dans la branche `if (isSimplifiedMode && assignedTo && ...)`. En mode
--   complet il reste `undefined` → le bon est créé avec `server_id = NULL` →
--   le COALESCE ci-dessous retombe sur `v_actor`, c'est-à-dire celui qui sert.
--
-- ⭐ Le comportement du MODE COMPLET est donc INCHANGÉ AU BIT PRÈS, sans
-- aucune condition sur le mode. C'est plus robuste qu'un `IF` : la donnée
-- elle-même porte la distinction, et personne ne peut « simplifier » la
-- condition par mégarde.
--
-- ⛔ `served_by` RESTE `v_actor`, et ce n'est pas un oubli. C'est un FAIT
-- MATÉRIEL — qui a appuyé sur le bouton — distinct de l'imputation
-- commerciale. En mode simplifié c'est bien le gérant qui a servi ; y écrire
-- le serveur serait consigner quelque chose de faux et perdre la traçabilité.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ LE MOTIF EXACT est présent, UNE SEULE FOIS.
--   SELECT proname,
--          (pg_get_functiondef(oid) LIKE '%p_payment_method, v_actor, v_key%')
--            AS motif_present
--   FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : 1 ligne, motif_present = true
--
--   -- 2. ⚠ Aucune SURCHARGE : la substitution viserait la mauvaise.
--   SELECT count(*) FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : 1
--
--   -- 3. Combien de bons SANS serveur (ils retomberont sur le gérant) ?
--   SELECT count(*) FILTER (WHERE server_id IS NULL) AS sans_serveur,
--          count(*)                                  AS total
--   FROM public.tickets WHERE status <> 'paid';
--   -- INFORMATIF : ces bons imputeront au gérant tant qu'un plat n'y est pas
--   -- ajouté depuis le panier (cf. correction client, §20 lot 2).

BEGIN;

DO $do$
DECLARE
  v_def     TEXT;
  v_oid     OID;
  v_comment TEXT;
  v_count   INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Fonction serve_kitchen_item introuvable.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'SURCHARGES de serve_kitchen_item (% versions) : traiter à la main.', v_count;
  END IF;

  SELECT oid, pg_get_functiondef(oid) INTO v_oid, v_def
  FROM pg_proc
  WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;

  /**
   * ⭐ IDEMPOTENCE — une fonction déjà corrigée est ignorée, pas refusée.
   * Le SQL Editor n'empêche personne de relancer une migration.
   */
  IF position('v_seller' IN v_def) > 0 THEN
    RAISE NOTICE 'serve_kitchen_item : déjà corrigée, ignorée';
    RETURN;
  END IF;

  /**
   * ⛔⛔ GARDE-FOU. Si le motif a changé, on REFUSE plutôt que de laisser une
   * imputation silencieusement fausse. Une fonction qu'on croit corrigée et
   * qui ne l'est pas est le pire des deux mondes.
   */
  IF position('p_payment_method, v_actor, v_key' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Motif d''appel INTROUVABLE dans serve_kitchen_item — la fonction a dérivé, substitution refusée.';
  END IF;

  /**
   * ⭐ SUBSTITUTION EN DEUX TEMPS, chacune sur un motif unique :
   *   1. Déclarer `v_seller` à côté de `v_actor` (jamais à sa place).
   *   2. Ne remplacer que le 4ᵉ argument de `create_sale_idempotent`.
   *
   * ⚠️ `v_actor` reste utilisé pour `served_by` — d'où une variable NOUVELLE
   * plutôt qu'une réaffectation : écraser `v_actor` aurait AUSSI changé
   * `served_by`, et consigné un fait faux.
   */
  v_def := replace(
    v_def,
    'v_actor   UUID := auth.uid();',
    'v_actor   UUID := auth.uid();' || chr(10) ||
    '  -- ⭐ §20 — imputation commerciale, distincte de `v_actor` (fait matériel).' || chr(10) ||
    '  v_seller  UUID;'
  );

  /**
   * ⭐ La lecture se fait APRÈS le SELECT de `v_item` (qui expose `ticket_id`)
   * et APRÈS la sortie idempotente : un rejeu sur un plat déjà servi doit
   * continuer de retourner son `sale_id` sans rien relire.
   *
   * ⚠️ Ancrage sur le commentaire de la délégation — motif unique et stable.
   */
  v_def := replace(
    v_def,
    '  v_sale := public.create_sale_idempotent(',
    '  -- ⭐⭐ §20 — LE PLAT HÉRITE DU SERVEUR DE SON BON.' || chr(10) ||
    '  -- En mode simplifié, `tickets.server_id` porte le serveur choisi au' || chr(10) ||
    '  -- panier : boissons et plats d''une même commande partent donc TOUJOURS' || chr(10) ||
    '  -- sur le même serveur, sans que le gérant ait à le redire.' || chr(10) ||
    '  -- ⚠️ En mode COMPLET, `server_id` est NULL (Cart.tsx ne le peuple qu''en' || chr(10) ||
    '  -- simplifié) : le COALESCE retombe sur `v_actor` et le comportement est' || chr(10) ||
    '  -- inchangé au bit près.' || chr(10) ||
    '  SELECT COALESCE(t.server_id, v_actor) INTO v_seller' || chr(10) ||
    '  FROM public.tickets t WHERE t.id = v_item.ticket_id;' || chr(10) ||
    '' || chr(10) ||
    '  -- ⛔ `p_sold_by` est NOT NULL : un bon introuvable ne doit pas faire' || chr(10) ||
    '  -- échouer la vente d''un plat déjà produit et consommé.' || chr(10) ||
    '  v_seller := COALESCE(v_seller, v_actor);' || chr(10) ||
    '' || chr(10) ||
    '  v_sale := public.create_sale_idempotent('
  );

  -- ⭐ SEUL le 4ᵉ argument change. `served_by = v_actor` reste intact.
  v_def := replace(
    v_def,
    'p_bar_id, v_items, p_payment_method, v_actor, v_key,',
    'p_bar_id, v_items, p_payment_method, v_seller, v_key,'
  );

  -- ⭐ Sauvegarde AVANT : `pg_get_functiondef` ne restitue PAS les COMMENT.
  v_comment := obj_description(v_oid, 'pg_proc');

  EXECUTE v_def;

  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                   'serve_kitchen_item',
                   pg_get_function_identity_arguments(v_oid), v_comment);
  END IF;

  /**
   * ⛔⛔ `CREATE OR REPLACE` PERD LES GRANTS — leçon des vagues 1-4 du
   * durcissement RPC. Sans ces lignes, servir un plat deviendrait impossible.
   *
   * ⛔⛔ `service_role` FAIT PARTIE DES GRANTS À RE-POSER — défaut trouvé à la
   * revue du 17/08/2026, et je l'avais MANQUÉ deux fois.
   *
   * `serve_kitchen_item` porte un `GRANT ... TO service_role` depuis sa
   * création (20260804130000:724). Re-poser le seul `authenticated` le
   * DÉTRUIT : la file offline et les tâches de fond ne pourraient plus servir
   * un plat, et l'échec serait différé — il ne se verrait qu'au retour en
   * ligne, loin de la migration qui l'a causé.
   *
   * ⚠️ Mes post-vols précédents vérifiaient `authenticated` et `anon`, JAMAIS
   * `service_role` : le contrôle était incomplet, donc il passait au vert.
   * Celui de cette migration le teste (cf. POST-VOL n°3).
   */
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
                 'serve_kitchen_item', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                 'serve_kitchen_item', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                 'serve_kitchen_item', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                 'serve_kitchen_item', pg_get_function_identity_arguments(v_oid));

  RAISE NOTICE 'serve_kitchen_item : imputation branchée sur tickets.server_id';
END
$do$;

/**
 * ⛔⛔ LE BON SANS SERVEUR — cas limite trouvé À LA VALIDATION du plan, et
 * c'est le scénario RÉEL du client qui a demandé ce chantier.
 *
 * Un bar qui BASCULE du mode complet au simplifié en cours de service (« il y
 * a des périodes où seul le gérant utilise le téléphone ») laisse derrière lui
 * des bons créés en mode complet, donc `server_id = NULL`. Le sélecteur de
 * bons les laisse VOLONTAIREMENT visibles à tous (CartDrawer.tsx:130 — « bons
 * sans server_id (legacy) sont visibles à tous »).
 *
 * ⚠️ SANS CETTE CORRECTION, le défaut réapparaît exactement là : le gérant
 * choisit « Paul », sélectionne un bon ancien, ajoute une bière et un plat.
 * La bière part sur Paul (`sale.server_id`), le plat retombe sur le gérant
 * (ticket NULL → `v_actor`). Une commande, deux imputations.
 *
 * ⭐ ON CORRIGE LA DONNÉE À LA SOURCE plutôt que de la contourner à chaque
 * service : quand un plat rejoint un bon qui n'a pas de serveur, le bon
 * l'adopte. Bénéficie AUSSI aux boissons ajoutées ensuite au même bon.
 *
 * ⛔ `COALESCE(server_id, auth.uid())` — on n'ÉCRASE JAMAIS un serveur déjà
 * posé : la valeur existante gagne toujours, et seul un `NULL` est comblé. Un
 * bon appartient à son serveur d'origine ; le réattribuer en silence
 * fausserait le recouvrement dans l'autre sens.
 *
 * ⚠️ POURQUOI ICI ET NON CÔTÉ CLIENT : `tickets` n'a AUCUNE policy RLS
 * d'UPDATE (vérifié — seule `tickets_bar_members_select` existe). Un
 * `supabase.from('tickets').update(...)` serait rejeté en silence. Ce RPC est
 * SECURITY DEFINER et met DÉJÀ le ticket à jour (`fulfillment_status`) : c'est
 * le seul endroit où l'écriture est à la fois possible et légitime.
 */
DO $do$
DECLARE
  v_def     TEXT;
  v_oid     OID;
  v_comment TEXT;
  v_count   INTEGER;
BEGIN
  /**
   * ⛔ GARDE DE SURCHARGE — en miroir du bloc A. Ajoutée à la revue : sans
   * elle, `SELECT ... INTO` sur deux signatures homonymes en prendrait une
   * ARBITRAIREMENT, et la migration corrigerait peut-être la mauvaise.
   *
   * ⚠️ `create_kitchen_order` n'a qu'une signature aujourd'hui
   * (UUID, UUID, JSONB, TEXT, TEXT — vérifié sur tout l'historique). Le
   * contrôle protège l'avenir, pas le présent : une migration ne doit pas
   * dépendre d'un état qu'on a constaté une fois.
   */
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Fonction create_kitchen_order introuvable.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'SURCHARGES de create_kitchen_order (% versions) : la substitution viserait la mauvaise. Traiter à la main.', v_count;
  END IF;

  SELECT oid, pg_get_functiondef(oid) INTO v_oid, v_def
  FROM pg_proc
  WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;

  -- ⭐ IDEMPOTENCE — un rejeu ne doit rien casser.
  IF position('server_id = COALESCE(server_id, auth.uid())' IN v_def) > 0 THEN
    RAISE NOTICE 'create_kitchen_order : déjà corrigée, ignorée';
    RETURN;
  END IF;

  -- ⛔ Garde-fou : motif absent = refus, jamais de passage silencieux.
  IF position('SET fulfillment_status = ''pending''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Motif UPDATE tickets INTROUVABLE dans create_kitchen_order — substitution refusée.';
  END IF;

  /**
   * ⭐ `auth.uid()` et NON un paramètre : en mode simplifié, l'appelant EST le
   * gérant, et c'est lui qui a désigné le serveur au panier. Mais le bon
   * n'ayant pas de serveur, le repli correct est l'appelant lui-même — jamais
   * une valeur venue du client, qui serait invérifiable ici.
   *
   * ⚠️ Sous `service_role` (file offline), `auth.uid()` est NULL : le COALESCE
   * laisse alors le bon inchangé, ce qui est le comportement voulu.
   */
  v_def := replace(
    v_def,
    'SET fulfillment_status = ''pending''',
    'SET fulfillment_status = ''pending'',' || chr(10) ||
    '      -- ⭐ §20 — un bon sans serveur ADOPTE celui qui envoie les plats.' || chr(10) ||
    '      --    Jamais d''écrasement : `COALESCE` préserve un serveur déjà posé.' || chr(10) ||
    '      server_id = COALESCE(server_id, auth.uid())'
  );

  v_comment := obj_description(v_oid, 'pg_proc');

  EXECUTE v_def;

  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                   'create_kitchen_order',
                   pg_get_function_identity_arguments(v_oid), v_comment);
  END IF;

  -- ⛔⛔ `service_role` COMPRIS : `create_kitchen_order` le porte depuis sa
  --    création (20260804130000:721). L'omettre couperait l'envoi en cuisine
  --    depuis la file offline — un échec DIFFÉRÉ, visible seulement au retour
  --    en ligne, très loin de la migration qui l'aurait causé.
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
                 'create_kitchen_order', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                 'create_kitchen_order', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                 'create_kitchen_order', pg_get_function_identity_arguments(v_oid));
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                 'create_kitchen_order', pg_get_function_identity_arguments(v_oid));

  RAISE NOTICE 'create_kitchen_order : un bon sans serveur adopte l''envoyeur';
END
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ L'imputation lit bien le bon
--   SELECT pg_get_functiondef(oid) LIKE '%COALESCE(t.server_id, v_actor)%' AS herite_du_bon,
--          pg_get_functiondef(oid) LIKE '%p_payment_method, v_seller, v_key%' AS vendeur_branche
--   FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true
--
--   -- 2. ⛔⛔ `served_by` N'A PAS BOUGÉ — le fait matériel reste le gérant
--   SELECT pg_get_functiondef(oid) LIKE '%served_by = v_actor%' AS served_by_intact
--   FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 3. ⛔⛔ LES GRANTS ONT SURVÉCU — LE CONTRÔLE LE PLUS IMPORTANT.
--   --
--   -- ⚠️ `service_role` EST TESTÉ ICI, et il ne l'était pas dans mes post-vols
--   --    précédents. C'est cette omission qui a laissé passer la perte du
--   --    grant : le contrôle regardait `authenticated` et `anon`, donc il
--   --    passait au vert alors que la file offline était coupée.
--   SELECT proname,
--          has_function_privilege('authenticated',
--            format('public.%I(%s)', proname,
--                   pg_get_function_identity_arguments(oid)), 'EXECUTE') AS auth_peut,
--          has_function_privilege('service_role',
--            format('public.%I(%s)', proname,
--                   pg_get_function_identity_arguments(oid)), 'EXECUTE') AS service_peut,
--          has_function_privilege('anon',
--            format('public.%I(%s)', proname,
--                   pg_get_function_identity_arguments(oid)), 'EXECUTE') AS anon_peut
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('serve_kitchen_item','create_kitchen_order')
--   ORDER BY proname;
--   -- ATTENDU : 2 lignes — auth_peut = true, service_peut = true, anon_peut = false
--
--   -- 3bis. ⚠️ LE BON SANS SERVEUR est bien comblé par `create_kitchen_order`
--   SELECT pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, auth.uid())%'
--            AS bon_adopte_envoyeur
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
-- ⚠️⚠️ SMOKE-TEST OBLIGATOIRE — ces contrôles prouvent que la fonction est
-- CORRIGÉE, pas qu'elle RÉPOND.
--
--   · MODE SIMPLIFIÉ — commande mixte (1 bière + 1 plat), serveur « Paul » :
--     la vente de la bière ET celle du plat doivent porter `sold_by` = Paul.
--     C'est LE test du lot : « Mon équipe » doit créditer Paul des deux.
--   · MODE COMPLET — un serveur sert un plat : `sold_by` = LUI, inchangé.
--   · Vérifier dans « Mon équipe », pas seulement en base : c'est l'écran qui
--     porte le montant à recouvrer.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⚠️⚠️ CONTRÔLE SÉPARÉ — LA MIGRATION DU 11/08 A LE MÊME DÉFAUT     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- `20260811170000_apply_kitchen_write_guard.sql` re-posait `authenticated`
-- SANS `service_role`, sur 13 fonctions. Au moins SIX portaient un
-- `GRANT ... TO service_role` d'origine (20260804130000:709-724).
--
-- ⚠️ Elle est DÉJÀ APPLIQUÉE en production : ce contrôle n'est pas préventif,
-- il MESURE un dégât possible. À passer INDÉPENDAMMENT de cette migration.
--
--   SELECT proname,
--          has_function_privilege('service_role',
--            format('public.%I(%s)', proname,
--                   pg_get_function_identity_arguments(oid)), 'EXECUTE') AS service_peut
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('upsert_dish','produce_batch','close_batch',
--                     'accept_kitchen_item','mark_kitchen_item_ready',
--                     'force_item_on_order','record_batch_loss',
--                     'record_ingredient_lot_loss','upsert_ingredient',
--                     'replace_dish_recipe','replace_dish_components',
--                     'set_dish_active','set_ingredient_active')
--   ORDER BY proname;
--
--   -- ⛔ Toute ligne à FALSE dont la fonction avait le grant d'origine doit
--   --    être RÉPARÉE par un simple :
--   --    GRANT EXECUTE ON FUNCTION public.<nom>(<signature>) TO service_role;
--   -- ⭐ Réparation SANS RISQUE : un GRANT ne touche ni le corps ni les
--   --    données, et il est idempotent.
