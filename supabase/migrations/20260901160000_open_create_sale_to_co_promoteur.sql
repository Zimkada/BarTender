-- ===================================================================
-- ⛔⛔ MIGRATION CRITIQUE : create_sale_idempotent — encaissement
-- DATE: 2026-09-01
-- AUTHOR: AI Assistant
-- PHASE: Étape 7/8 du chantier co-promoteur
-- ORDRE: 7/8 — EN DERNIER des migrations SQL, délibérément.
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ ⛔ HORS HEURES DE SERVICE UNIQUEMENT                             │
-- └─────────────────────────────────────────────────────────────────┘

-- C'est LE RPC des ventes. Un échec ici interrompt l'encaissement de TOUS les
-- bars. Il est traité en dernier pour que tout le reste soit stable avant d'y
-- toucher (mémoire `project_migration_whitelist_pending` : « jamais ce RPC
-- pendant le service »).
--
-- ⭐ Fenêtre confirmée par le fondateur le 01/09/2026 : peu de service en cours.
--
-- La transaction est courte (un CREATE OR REPLACE + 3 grants). En cas d'échec,
-- le BEGIN/COMMIT annule tout : le RPC reste dans son état actuel, les ventes
-- continuent. Il n'existe pas d'état intermédiaire où l'encaissement serait
-- à moitié cassé.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ OBJET                                                           │
-- └─────────────────────────────────────────────────────────────────┘

-- Sans cette migration, un co-promoteur **ne peut pas encaisser** : il a
-- `canSell: true` (hérité du gérant) mais le RPC le rejette, car sa liste
-- blanche échoue FERMÉ sur tout rôle non listé.
--
-- C'est le défaut BLOQUANT n°2 trouvé par la certification du plan — celui qui
-- aurait laissé un co-promoteur voir le panier sans pouvoir encaisser.

-- ⭐ RELEVÉ EN PROD le 01/09/2026 (pg_get_functiondef, pas les fichiers) :
--
--   Signature  : 13 arguments, **UNE SEULE version** (aucune surcharge)
--   Attributs  : SECURITY DEFINER · search_path = public, extensions
--   Propriétaire : postgres
--   Whitelist  : IN ('super_admin', 'promoteur', 'gerant', 'serveur')
--   Occurrences du motif `'promoteur', 'gerant'` : **1 seule**
--     ⭐ Vérifié explicitement — leçon de l'étape 5, où 4 fonctions portaient
--       deux formes du motif et où des règles qui se chevauchaient auraient
--       produit un résultat juste PAR ACCIDENT.
--   Privilèges : anon=false · authenticated=true · **service_role=TRUE**
--     ⚠️ CORRIGÉ EN REVUE (skill code-review) — l'analyse initiale était FAUSSE.
--       J'avais écrit que le SyncManager rejoue sous `service_role`. **C'est
--       inexact** : `src/lib/supabase.ts:21` crée le client avec la clé ANON,
--       et une session authentifiée en fait un appelant `authenticated`. Aucun
--       `service_role` n'existe côté front (vérifié : SyncManager, offlineQueue,
--       lib/supabase). Il n'est utilisé que par les Edge Functions.
--
--     ⭐ CONSÉQUENCE — PLUS GRAVE que ce que je décrivais :
--       le rejeu offline PASSE PAR LE GUARD DE RÔLE (`auth.role() <> 'service_role'`
--       est VRAI pour lui). Sans cette migration, les ventes hors-ligne d'un
--       co-promoteur échoueraient **AU REJEU** — donc en différé, après coup,
--       potentiellement sans que personne ne le voie sur le moment.
--
--     `svc=true` est néanmoins CONSERVÉ à l'identique : c'est l'état relevé en
--     prod, et le modifier sortirait du périmètre de cette migration.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ CE QUI N'EST PAS TOUCHÉ                                         │
-- └─────────────────────────────────────────────────────────────────┘

-- ⭐ La 2e règle du RPC — mode simplifié — ne cible QUE le serveur :
--
--     IF v_operating_mode = 'simplified' AND v_caller_role = 'serveur' THEN
--         RAISE EXCEPTION 'serveur role cannot create sales in simplified mode';
--
--   Le co-promoteur n'y figure pas et n'a pas à y figurer : il encaissera dans
--   les DEUX modes, exactement comme le gérant aujourd'hui. Aucune substitution
--   ne la touche (le motif ciblé est `'promoteur', 'gerant'`).
--
-- ⭐ Idempotence, calcul du total, décrément de stock, journalisation : tout le
--   corps est conservé AU CARACTÈRE PRÈS. On ne substitue QUE la liste blanche.

-- BREAKING_CHANGE: NO — un rôle de plus dans une liste blanche. Aucun rôle
--   existant ne perd l'accès. Aucun co_promoteur n'existe encore : l'effet réel
--   est nul jusqu'à la première nomination (après l'étape 8).

-- ROLLBACK_STRATEGY:
--   Restaurer le corps depuis l'archive du pré-vol 2, puis rejouer les 3 grants
--   ci-dessous. ⚠ NE PAS SAUTER cette archive : c'est le RPC des ventes.

-- TABLES_MODIFIED: aucune · RLS_CHANGES: aucune
-- FUNCTIONS_MODIFIED: create_sale_idempotent (liste blanche uniquement)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRÉ-VOL — à exécuter AVANT                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) État complet (signature, attributs, whitelist, occurrences, surcharges) :
--    → voir le relevé du 01/09/2026 ci-dessus. Le refaire si le temps a passé.
--
-- 2) ⭐⭐ ARCHIVE DE ROLLBACK — OBLIGATOIRE, c'est le RPC des ventes :
--
--    SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND proname='create_sale_idempotent';
--    -- Sauvegarder hors base, dans un fichier local.
--
-- 3) Privilèges AVANT (référence exacte du post-vol) :
--
--    SELECT has_function_privilege('anon',          oid,'EXECUTE') AS anon,
--           has_function_privilege('authenticated', oid,'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  oid,'EXECUTE') AS svc
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname='create_sale_idempotent';
--    -- ATTENDU : false / true / TRUE

BEGIN;

DO $$
DECLARE
  v_oid        OID;
  v_def        TEXT;
  v_new        TEXT;
  v_occurrences INT;
  v_comment    TEXT;   -- 🛡️ F2 (skill) : CREATE OR REPLACE perd le COMMENT
BEGIN
  -- 🛡️ GARDE 1 — une seule version. Une surcharge signifierait qu'on ignore
  --   laquelle l'application appelle : on ne devine pas sur le RPC des ventes.
  SELECT count(*) INTO v_occurrences
  FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='create_sale_idempotent';

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'create_sale_idempotent : % version(s) trouvee(s), 1 attendue. '
      'Migration interrompue.', v_occurrences;
  END IF;

  SELECT oid INTO v_oid
  FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='create_sale_idempotent';

  v_def := pg_get_functiondef(v_oid);

  -- Idempotence : deja applique ?
  --   🛡️ F3 (skill code-review) — on NE retourne PAS sans verifier. Un
  --   rejeu apres une application manuelle partielle aurait annonce « deja
  --   applique » sans revalider la liste blanche.
  IF v_def ILIKE '%co_promoteur%' THEN
    IF v_def NOT ILIKE '%''super_admin''%' OR v_def NOT ILIKE '%''gerant''%'
       OR v_def NOT ILIKE '%''serveur''%' OR v_def NOT ILIKE '%simplified%' THEN
      RAISE EXCEPTION
        'create_sale_idempotent contient co_promoteur MAIS un element d''origine '
        'manque (role ou regle du mode simplifie). Etat incoherent — '
        'RESTAURER depuis l''archive avant toute autre action.';
    END IF;
    RAISE NOTICE '[7] create_sale_idempotent : deja ouvert et integre — DEJA APPLIQUEE.';
    RETURN;
  END IF;

  -- 🛡️ GARDE 2 — le motif doit apparaitre EXACTEMENT une fois.
  --   Leçon de l'étape 5 : une substitution globale sur un corps portant
  --   plusieurs occurrences toucherait AUSSI un eventuel controle plus strict
  --   ailleurs dans la fonction. Sur le RPC des ventes, on n'accepte pas ce flou.
  v_occurrences := (length(v_def) - length(replace(v_def, '''promoteur'', ''gerant''','')))
                   / length('''promoteur'', ''gerant''');

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'Motif ''promoteur'', ''gerant'' trouve % fois (1 attendue). Une substitution '
      'globale toucherait plusieurs endroits — migration interrompue, traiter a la main.',
      v_occurrences;
  END IF;

  -- Substitution unique, motif minimal non ambigu.
  v_new := replace(v_def, '''promoteur'', ''gerant''',
                          '''promoteur'', ''co_promoteur'', ''gerant''');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'Aucune substitution appliquee — migration interrompue.';
  END IF;

  -- 🛡️ F2 (skill code-review) — capturer le COMMENT AVANT de recreer.
  --   `EXECUTE pg_get_functiondef(...)` le PERD silencieusement. Precedent du
  --   depot : 20260817100000:196 le sauvegarde et le restaure explicitement.
  v_comment := obj_description(v_oid, 'pg_proc');

  EXECUTE v_new;

  -- Restauration du COMMENT (F2).
  IF v_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON FUNCTION public.create_sale_idempotent(%s) IS %L',
                   pg_get_function_identity_arguments(v_oid), v_comment);
  END IF;

  -- 🛡️ GARDE 3 — controle immediat du resultat.
  v_def := pg_get_functiondef(v_oid);

  IF v_def NOT ILIKE '%co_promoteur%' THEN
    RAISE EXCEPTION 'create_sale_idempotent recree SANS co_promoteur. Interrompu.';
  END IF;

  -- Les 4 roles d'origine doivent TOUS survivre.
  IF v_def NOT ILIKE '%''super_admin''%' OR v_def NOT ILIKE '%''gerant''%'
     OR v_def NOT ILIKE '%''serveur''%' THEN
    RAISE EXCEPTION
      'create_sale_idempotent : un role d''origine a disparu de la liste blanche. '
      'Interrompu — RESTAURER depuis l''archive du pre-vol.';
  END IF;

  -- ⭐ La regle du mode simplifie doit etre INTACTE (elle ne vise que serveur).
  IF v_def NOT ILIKE '%simplified%' THEN
    RAISE EXCEPTION
      'create_sale_idempotent : la regle du mode simplifie a disparu. '
      'Interrompu — RESTAURER depuis l''archive du pre-vol.';
  END IF;

  RAISE NOTICE '[7] create_sale_idempotent : ouvert au co_promoteur';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- RESTAURATION DES GRANTS — CREATE OR REPLACE les a perdus
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️ `service_role` est REQUIS ici (contrairement aux RPC cuisine) : le
--    SyncManager rejoue les ventes de la file offline sous ce rôle. L'oublier
--    casserait la synchronisation hors-ligne SANS message d'erreur visible.

REVOKE ALL ON FUNCTION public.create_sale_idempotent(
  uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sale_idempotent(
  uuid, jsonb, text, uuid, text, uuid, text, text, text, text, date, uuid, uuid
) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL — à exécuter IMMÉDIATEMENT APRÈS                       │
-- └─────────────────────────────────────────────────────────────────┘
--
-- ⛔ LE POINT 2 EST LE PLUS CRITIQUE DE TOUT LE CHANTIER : si `svc` n'est pas
--    `true`, la synchronisation hors-ligne est CASSÉE et le restera en silence
--    jusqu'à ce qu'un bar repasse en ligne avec des ventes en attente.
--
-- 1) La liste blanche connaît les 5 rôles :
--
--    SELECT substring(pg_get_functiondef(oid) from 'IN \([^)]*promoteur[^)]*\)')
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname='create_sale_idempotent';
--    -- ATTENDU : IN ('super_admin', 'promoteur', 'co_promoteur', 'gerant', 'serveur')
--    -- ⛔ Si un rôle manque : RESTAURER depuis l'archive immédiatement.
--
-- 2) ⛔ PRIVILÈGES — vérification vitale :
--
--    SELECT has_function_privilege('anon',          oid,'EXECUTE') AS anon,
--           has_function_privilege('authenticated', oid,'EXECUTE') AS auth_role,
--           has_function_privilege('service_role',  oid,'EXECUTE') AS svc
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname='create_sale_idempotent';
--    -- ATTENDU : anon=false · auth_role=TRUE · **svc=TRUE**
--
-- 3) Une seule version, attributs préservés :
--
--    SELECT count(*) AS versions,
--           bool_and(prosecdef) AS secdef,
--           bool_and(proconfig::text ILIKE '%search_path%') AS search_path_ok
--    FROM pg_proc WHERE pronamespace='public'::regnamespace
--      AND proname='create_sale_idempotent';
--    -- ATTENDU : versions=1 · secdef=true · search_path_ok=true
--
-- 4) ⭐⭐ TEST FONCTIONNEL RÉEL — À FAIRE TOUT DE SUITE, depuis l'UI :
--
--      · **encaisser une vente réelle** (le test qui compte)
--      · en mode complet ET en mode simplifié si les deux sont utilisés
--      · vérifier que la vente apparaît dans l'historique
--
--    ⭐ AJOUTÉ EN REVUE (skill) — **tester aussi le REJEU OFFLINE** :
--      couper le réseau, encaisser, rétablir, vérifier que la vente remonte.
--      Ce chemin passe par le MÊME guard de rôle (SyncManager appelle en
--      `authenticated`, pas en `service_role` — cf. §RELEVÉ). Une vente en
--      file d'attente qui échouerait au rejeu le ferait **en différé**, bien
--      après la manipulation : c'est le scénario le plus difficile à
--      diagnostiquer, donc celui qu'il faut couvrir maintenant.
--
--    ⛔ En cas d'échec : restaurer immédiatement depuis l'archive du pré-vol,
--       rejouer les 2 grants ci-dessus, et prévenir avant toute autre action.
--
-- ⚠ RAPPEL : le rôle reste INVISIBLE côté application — `UserRole` TypeScript
--    ne le connaît pas et la navigation l'ignore (étape 8). Un co-promoteur
--    créé maintenant verrait un MENU VIDE. Ne pas en créer avant l'étape 8.
