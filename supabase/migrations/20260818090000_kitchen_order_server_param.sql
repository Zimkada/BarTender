-- ═══════════════════════════════════════════════════════════════════════
-- LE BON ADOPTE LE SERVEUR CHOISI, ET NON L'APPELANT — §20, lot 2 bis
-- 18/08/2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ CORRECTION DE MA PROPRE MIGRATION DU 17/08 (20260817100000).
--
-- Elle comblait un bon sans serveur avec `auth.uid()` :
--
--     server_id = COALESCE(server_id, auth.uid())
--
-- ⚠️ EN MODE SIMPLIFIÉ, `auth.uid()` EST LE GÉRANT, PAS LE SERVEUR CHOISI.
-- Sur un bon EXISTANT à `server_id = NULL` repris par le gérant après avoir
-- sélectionné « Paul » au panier, le bon adoptait le GÉRANT. La boisson de la
-- même commande partait sur Paul (`addSale` reçoit `serverId`), le plat sur le
-- gérant. Une commande, deux imputations — précisément ce que la migration du
-- 17/08 prétendait fermer.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐ CE QUE LE COMBLEMENT `auth.uid()` CASSAIT EN PLUS              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ Le dégât ne s'arrêtait pas à l'imputation du plat. `CartDrawer:130`
-- filtre les bons par serveur :
--
--     filter(t => !t.serverId || t.serverId === effectiveServerId)
--
-- Un bon legacy à NULL est VISIBLE DE TOUS. Une fois `server_id` posé au
-- gérant, il QUITTE la liste de Paul — et `CartDrawer:113` vide la sélection
-- si le gérant rebascule sur Paul. Les boissons suivantes du même bon
-- devenaient impossibles à lui rattacher.
--
-- ⚠️ NUANCE, relevée à la contre-analyse et exacte : le comblement
-- n'AGGRAVAIT PAS l'imputation. Sans lui, `serve_kitchen_item` faisait
-- `COALESCE(t.server_id, v_actor)` et imputait DÉJÀ au gérant. Le bloc B
-- n'ajoutait qu'un dégât de PARCOURS, pas d'attribution.
-- ⭐ Conséquence sur l'ordre des corrections : retirer le comblement ne répare
-- RIEN de l'imputation, il arrête seulement de nuire. Seul le volet CLIENT
-- (transmission de `p_server_id`) la répare.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⭐ POURQUOI ÉCRIRE LE SERVEUR DANS LE BON, ET NON L'IGNORER       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- On pourrait n'imputer que le plat sans toucher au bon. ÉCARTÉ : le bon
-- resterait à NULL, donc chaque boisson ajoutée ensuite serait attribuée par
-- `addSale` tandis que le plat le serait par le ticket — DEUX SOURCES
-- d'attribution sur un même bon. C'est le « une commande, deux imputations »
-- que le §16.7 interdit (une addition, une seule).
--
-- ⭐ Écrire le serveur AU MOMENT OÙ IL EST CONNU unifie le bon pour toute sa
-- suite, boissons comprises.
--
-- ⛔ `COALESCE(server_id, p_server_id)` — on n'ÉCRASE JAMAIS un serveur déjà
-- posé. Un bon appartient à son serveur d'origine ; le réattribuer en silence
-- fausserait le recouvrement dans l'autre sens.
--
-- ⛔ SI `p_server_id` EST NULL, ON NE COMBLE PAS. Un bon sans serveur visible
-- de tous est MOINS nuisible qu'un bon figé à tort — c'est la leçon du 17/08.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⛔⛔ LA VALIDATION D'APPARTENANCE REDEVIENT NÉCESSAIRE            │
-- └─────────────────────────────────────────────────────────────────┘
--
-- La migration du 17/08 argumentait qu'aucune validation n'était requise,
-- puisque le serveur venait de `tickets.server_id` — une ligne en base
-- rattachée par FK. C'était vrai POUR `serve_kitchen_item`, qui reste sans
-- paramètre client et continue de lire le bon.
--
-- ⚠️ Ça ne l'est PLUS ici : `p_server_id` vient du CLIENT. Et
-- `create_kitchen_order` ne porte QUE `is_bar_member` — vérifié le 18/08, elle
-- n'a NI garde de rôle, NI `can_write_kitchen`. Sans contrôle, n'importe quel
-- membre pourrait rattacher un bon à un identifiant arbitraire, y compris hors
-- de son bar : le CA d'un serveur deviendrait falsifiable.
--
-- ⭐ REFUS et non repli silencieux : une attribution demandée puis ignorée
-- produirait un chiffre faux que personne ne verrait.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ La migration du 17/08 est bien appliquée (on corrige SON motif).
--   SELECT pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, auth.uid())%'
--            AS comblement_17_08_present
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--   -- ⚠️ Si FALSE, NE PAS APPLIQUER : soit le 17/08 n'a pas tourné, soit la
--   --    fonction a dérivé. Le garde-fou lèvera de toute façon.
--
--   -- 2. ⚠ Aucune SURCHARGE.
--   SELECT count(*) FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : 1
--
--   -- 3. Combien de bons ouverts SANS serveur (ils resteront à NULL) ?
--   SELECT count(*) FILTER (WHERE server_id IS NULL) AS sans_serveur,
--          count(*)                                  AS total
--   FROM public.tickets WHERE status <> 'paid';
--   -- INFORMATIF : ces bons adopteront leur serveur au prochain plat envoyé
--   -- depuis le panier, et RESTERONT visibles de tous d'ici là.

BEGIN;

DO $do$
DECLARE
  v_def     TEXT;
  v_oid     OID;
  v_comment TEXT;
  v_count   INTEGER;
  v_args    TEXT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Fonction create_kitchen_order introuvable.';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'SURCHARGES de create_kitchen_order (% versions) : traiter à la main.', v_count;
  END IF;

  SELECT oid, pg_get_functiondef(oid) INTO v_oid, v_def
  FROM pg_proc
  WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;

  -- ⭐ IDEMPOTENCE — un rejeu ne doit rien casser.
  IF position('p_server_id' IN v_def) > 0 THEN
    RAISE NOTICE 'create_kitchen_order : déjà corrigée, ignorée';
    RETURN;
  END IF;

  /**
   * ⛔⛔ GARDE-FOU. On corrige le motif POSÉ PAR LA MIGRATION DU 17/08. S'il
   * est absent, soit elle n'a pas tourné, soit la fonction a dérivé : on
   * REFUSE plutôt que de laisser une imputation silencieusement fausse.
   */
  IF position('server_id = COALESCE(server_id, auth.uid())' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Comblement du 17/08 INTROUVABLE dans create_kitchen_order — appliquer 20260817100000 d''abord, ou vérifier une dérivation.';
  END IF;

  /**
   * ⭐ 1. LE PARAMÈTRE, EN FIN DE SIGNATURE.
   *
   * ⚠️ `DEFAULT NULL` et dernière position : tout appelant existant continue
   * de fonctionner sans modification. Motif déjà employé pour `produce_batch`
   * (§19.3) et pour `serve_kitchen_item`.
   */
  v_def := replace(
    v_def,
    'p_notes        TEXT DEFAULT NULL' || chr(10) || ')',
    'p_notes        TEXT DEFAULT NULL,' || chr(10) ||
    '  -- ⭐ §20 — le serveur CHOISI au panier, pour un bon qui n''en a pas.' || chr(10) ||
    '  --    Optionnel : sans lui, le bon reste à NULL (visible de tous).' || chr(10) ||
    '  p_server_id    UUID DEFAULT NULL' || chr(10) || ')'
  );

  /**
   * ⭐ 2. LA VALIDATION D'APPARTENANCE, avant toute écriture.
   *
   * ⚠️ Ancrée sur le premier contrôle de la fonction — `is_bar_member` — donc
   * exécutée AVANT l'insertion des lignes. Un serveur inconnu doit faire
   * échouer la commande, pas la créer puis mal l'attribuer.
   */
  v_def := replace(
    v_def,
    'RETURN jsonb_build_object(''success'', false, ''error'', ''Accès refusé à ce bar'');' || chr(10) || '  END IF;',
    'RETURN jsonb_build_object(''success'', false, ''error'', ''Accès refusé à ce bar'');' || chr(10) ||
    '  END IF;' || chr(10) ||
    '' || chr(10) ||
    '  -- ⛔⛔ §20 — `p_server_id` VIENT DU CLIENT : il doit être membre ACTIF' || chr(10) ||
    '  -- de CE bar. Cette fonction ne porte que `is_bar_member`, aucune garde' || chr(10) ||
    '  -- de rôle : sans ce contrôle, le CA d''un serveur serait falsifiable' || chr(10) ||
    '  -- depuis la console du navigateur.' || chr(10) ||
    '  -- ⭐ REFUS et non repli silencieux : une attribution demandée puis' || chr(10) ||
    '  -- ignorée produirait un chiffre faux que personne ne verrait.' || chr(10) ||
    '  IF p_server_id IS NOT NULL AND NOT EXISTS (' || chr(10) ||
    '    SELECT 1 FROM public.bar_members' || chr(10) ||
    '    WHERE user_id = p_server_id' || chr(10) ||
    '      AND bar_id  = p_bar_id' || chr(10) ||
    '      AND is_active = TRUE' || chr(10) ||
    '  ) THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''success'', false, ''error'', ''Serveur inconnu dans ce bar'');' || chr(10) ||
    '  END IF;'
  );

  /**
   * ⭐ 3. LE COMBLEMENT, désormais sur le serveur TRANSMIS.
   *
   * ⛔ `p_server_id` et NON `auth.uid()` : c'est tout l'objet de cette
   * migration. En mode simplifié l'appelant est le gérant, jamais le serveur.
   * ⛔ `COALESCE(server_id, ...)` conservé : un serveur déjà posé gagne
   * toujours. `p_server_id` NULL ⟹ le bon reste à NULL, visible de tous.
   */
  v_def := replace(
    v_def,
    'server_id = COALESCE(server_id, auth.uid())',
    'server_id = COALESCE(server_id, p_server_id)'
  );

  v_comment := obj_description(v_oid, 'pg_proc');
  v_args    := pg_get_function_identity_arguments(v_oid);

  EXECUTE v_def;

  /**
   * ⚠️ LA SIGNATURE A CHANGÉ : `v_args` (relevé AVANT) ne décrit plus la
   * fonction. On relit l'OID de la NOUVELLE version pour les COMMENT et les
   * GRANT — sans quoi ils viseraient l'ancienne signature, qui n'existe plus.
   */
  SELECT oid, pg_get_function_identity_arguments(oid) INTO v_oid, v_args
  FROM pg_proc
  WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;

  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
                   'create_kitchen_order', v_args, v_comment);
  END IF;

  /**
   * ⛔⛔ `service_role` COMPRIS — leçon du 17/08 : `create_kitchen_order` le
   * porte depuis sa création (20260804130000:721). L'omettre couperait
   * l'envoi en cuisine depuis les tâches de fond.
   */
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', 'create_kitchen_order', v_args);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', 'create_kitchen_order', v_args);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', 'create_kitchen_order', v_args);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', 'create_kitchen_order', v_args);

  RAISE NOTICE 'create_kitchen_order : le bon adopte le serveur TRANSMIS (%)', v_args;
END
$do$;

/**
 * ⚠️ L'ANCIENNE SIGNATURE À 5 ARGUMENTS SURVIT — et il faut la supprimer.
 *
 * ⛔ `CREATE OR REPLACE` avec un paramètre EN PLUS ne remplace pas : il CRÉE
 * une seconde fonction. Les deux coexisteraient, et PostgreSQL lèverait
 * `function is not unique` sur un appel à 5 arguments — c'est-à-dire TOUS les
 * appels du client tant qu'il n'est pas déployé.
 *
 * ⭐ On supprime explicitement l'ancienne. `IF EXISTS` : sur un rejeu, elle
 * n'est plus là.
 */
DROP FUNCTION IF EXISTS public.create_kitchen_order(UUID, UUID, JSONB, TEXT, TEXT);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
--   -- 1. ⛔ UNE SEULE signature, à SIX arguments
--   SELECT count(*) AS versions,
--          max(pg_get_function_identity_arguments(oid)) AS signature
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : versions = 1, signature se terminant par « , p_server_id uuid »
--
--   -- 2. ⛔⛔ LE COMBLEMENT UTILISE LE PARAMÈTRE, PLUS `auth.uid()`
--   SELECT pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, p_server_id)%'
--            AS comble_avec_parametre,
--          pg_get_functiondef(oid) LIKE '%server_id = COALESCE(server_id, auth.uid())%'
--            AS ancien_comblement_restant
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / false
--
--   -- 3. ⛔ LA VALIDATION D'APPARTENANCE est présente
--   SELECT pg_get_functiondef(oid) LIKE '%Serveur inconnu dans ce bar%' AS valide_appartenance
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
--   -- 4. ⛔⛔ LES GRANTS, `service_role` COMPRIS (OID, jamais une signature
--   --    reconstruite : `has_function_privilege` n'accepte que les types).
--   SELECT has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_peut,
--          has_function_privilege('service_role',  oid, 'EXECUTE') AS service_peut,
--          has_function_privilege('anon',          oid, 'EXECUTE') AS anon_peut
--   FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true / true / false
--
--   -- 5. ⚠ `serve_kitchen_item` N'A PAS BOUGÉ — il lit toujours le bon, sans
--   --    paramètre client. C'est la partie du 17/08 qui tenait.
--   SELECT pg_get_functiondef(oid) LIKE '%COALESCE(t.server_id, v_actor)%' AS lit_toujours_le_bon
--   FROM pg_proc
--   WHERE proname = 'serve_kitchen_item' AND pronamespace = 'public'::regnamespace;
--   -- ATTENDU : true
--
-- ⛔⛔ ORDRE DE DÉPLOIEMENT — CONTRAINT, PAS SEULEMENT « POSSIBLE ».
--
--   ⭐ MIGRATION D'ABORD, CLIENT ENSUITE. Jamais l'inverse.
--
-- ⚠️ Une première rédaction de ce bloc disait que la migration « peut être
-- appliquée avant le client, sans fenêtre de casse ». C'était vrai, mais
-- INCOMPLET : le sens inverse casse. Relevé à la revue du 18/08, les DEUX
-- sens ayant été tracés.
--
-- SENS SÛR — migration appliquée, client pas encore déployé :
--   Le client envoie 5 clés. PostgREST résout par NOM de paramètre : l'appel
--   matche la fonction à 6 paramètres, `p_server_id` prend son DEFAULT NULL.
--   Le bon reste à NULL — comportement d'avant, sans erreur. ✅
--
-- SENS QUI CASSE — client déployé, migration PAS appliquée :
--   Le client envoie `p_server_id`. La fonction en base n'a que 5 paramètres :
--   PostgREST répond `PGRST202 — no function matches`. L'ENVOI EN CUISINE
--   ÉCHOUE INTÉGRALEMENT. ⛔
--
-- ⭐ PORTÉE RÉELLE DE CE RISQUE, vérifiée : `p_server_id: serverId ?? undefined`
--   et `JSON.stringify` SUPPRIME les clés `undefined`. En MODE COMPLET la clé
--   n'est donc jamais envoyée, et l'appel reste compatible même sans migration.
--   ⚠️ Le risque est circonscrit au MODE SIMPLIFIÉ — c'est-à-dire précisément
--   les bars que ce chantier sert. Un client déployé en premier casserait leur
--   envoi en cuisine, pas celui des autres.
--
-- ⭐ En cas de doute pendant le déploiement, le contrôle est immédiat :
--   SELECT count(*) FROM pg_proc
--   WHERE proname = 'create_kitchen_order' AND pronamespace = 'public'::regnamespace
--     AND pg_get_function_identity_arguments(oid) LIKE '%p_server_id%';
--   -- 1 = migration passée, le client peut partir.
--
-- ⚠️⚠️ SMOKE-TEST — le cas qui a motivé cette migration :
--   · MODE SIMPLIFIÉ, bon EXISTANT à `server_id = NULL`, serveur « Paul » :
--     ajouter 1 boisson + 1 plat. Les DEUX ventes doivent porter Paul, et le
--     bon doit rester visible dans la liste de Paul.
--   · Vérifier dans « Mon équipe » — c'est l'écran qui porte le recouvrement.
