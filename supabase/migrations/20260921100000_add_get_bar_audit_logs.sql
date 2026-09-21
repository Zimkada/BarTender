-- ===================================================================
-- MIGRATION: RPC de lecture du journal d'audit, scope a un bar
-- DATE: 2026-09-21
-- AUTHOR: AI Assistant
-- PHASE: Co-promoteur Phase 2 - Chantier B1 (docs/roadmaps/PLAN_CO_PROMOTEUR_PHASE2.md §4.1)
-- ===================================================================

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ BUSINESS CONTEXT                                                │
-- └─────────────────────────────────────────────────────────────────┘
--
-- PROBLEME : le seul RPC de lecture de `audit_logs` est
--   `get_paginated_audit_logs`, verrouille `is_super_admin()` (garde en
--   tete de fonction ET RLS "Super admins can view audit logs" derriere).
--   Un promoteur ou un co-promoteur n'a donc AUCUN moyen de voir ce qui a
--   ete fait sur son propre bar - y compris par lui-meme via l'autre role.
--   C'est le manque n°5 identifie en Phase 2 (§1 du plan) : le journal
--   conditionne l'acceptabilite du role entre associes.
--
-- POURQUOI un RPC dedie plutot qu'elargir get_paginated_audit_logs (§4.1
--   du plan) : ce dernier est un journal GLOBAL (tous bars, filtres libres,
--   utilise par AuditLogsPage en admin). Y injecter un filtre bar_id
--   conditionnel selon l'appelant aurait complique un chemin deja utilise
--   par le SuperAdmin - le genre de complexite qui a produit les failles
--   d'isolation corrigees le 01/09/2026 (20260901110000). Un RPC separe,
--   dont le WHERE bar_id n'est JAMAIS optionnel, est plus simple a relire.
--
-- DECISION (plan §5, Q1 et Q3, tranchees le 21/09/2026) :
--   * Journal GLOBAL au bar, filtrable par role via p_role_filter -
--     pas un mode exclusif "co-promoteur seulement".
--   * Acces : SuperAdmin, promoteur du bar, co-promoteur du bar. PAS le
--     gerant - coherent avec canViewAccounting/canManageSalaries, deja
--     hors perimetre gerant dans ROLE_PERMISSIONS.
--
-- ⛔ CE QUE CETTE MIGRATION NE FAIT PAS :
--   Ne touche NI `get_paginated_audit_logs`, NI la RLS existante sur
--   `audit_logs`. Cette derniere reste restreinte aux super_admins - sans
--   effet ici puisque ce RPC est SECURITY DEFINER (contourne la RLS par
--   construction, exactement comme get_paginated_audit_logs le fait deja).
--   Le garde applicatif en tete de fonction est donc la SEULE protection ;
--   il doit rester strict et etre le premier test post-vol.

-- IMPACT: aucune donnee modifiee. Une seule fonction creee.

-- BREAKING_CHANGE: NO - creation pure, aucun appelant existant.

-- ROLLBACK_STRATEGY:
--   DROP FUNCTION IF EXISTS public.get_bar_audit_logs(UUID, INTEGER, INTEGER, TEXT);
--   DROP INDEX IF EXISTS public.idx_audit_logs_bar_timestamp;

-- TABLES_MODIFIED: aucune (audit_logs recoit un INDEX, aucune donnee touchee)
-- FUNCTIONS_CREATED: get_bar_audit_logs · INDEXES_CREATED: idx_audit_logs_bar_timestamp
-- RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL - deja execute manuellement le 21/09/2026                │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Relevé prod (docs/migrations/PREVOL_B1_get_bar_audit_logs.sql) :
--   1) get_user_role(bar_id_param uuid) -> un seul parametre nomme
--      bar_id_param, LIMIT 1 SANS ORDER BY (dette connue, cf. memoire
--      project_is_super_admin_fragile - hors perimetre de cette migration).
--   2) is_super_admin() -> sans parametre, confirme.
--   3) get_paginated_audit_logs -> modele repris ici : RETURNS TABLE(logs
--      json, total_count bigint), CTE filtered_logs partagee entre la page
--      et le total, garde en toute premiere ligne du corps.
--   4) Aucune fonction get_bar_audit_logs preexistante - pas de collision.
--   5) Colonnes de audit_logs confirmees : id, timestamp, event, severity,
--      user_id, user_name, user_role, bar_id, bar_name, ip_address,
--      user_agent, description, metadata, related_entity_id,
--      related_entity_type.
--   6) RLS : SELECT restreint aux super_admins (auth_user_id(), pas
--      auth.uid() - fonction distincte, deja existante, non touchee ici) ;
--      INSERT ouvert a tous (`System can create audit logs`, WITH CHECK
--      true) - c'est le chemin de AuditLogger.log(), non concerne ici.
--   7) Privileges sur get_paginated_audit_logs : EXECUTE a postgres et
--      authenticated uniquement, PAS anon, PAS PUBLIC. Repris a l'identique.
--
-- Second releve (21/09/2026), suite aux corrections issues du code review :
--   8) ⚠️ Index reels sur audit_logs : audit_logs_pkey (PK sur id),
--      idx_audit_logs_proxy_events et idx_audit_logs_super_admin (tous deux
--      PARTIELS). Les 4 index de 001_initial_schema.sql:564-567 sont ABSENTS
--      de la prod - 7e divergence fichiers/prod du projet. Aucun index ne
--      couvre un filtre bar_id : d'ou la creation ci-dessous.
--   9) Volume : 8 335 lignes / 3056 kB. Petit -> CREATE INDEX sans
--      CONCURRENTLY sans risque (verrou de quelques dizaines de ms).
--  10) PRIMARY KEY (id) confirmee -> le departage de pagination par id DESC
--      est fiable (il lui faut une colonne unique).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ MIGRATION                                                        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_bar_audit_logs(
  p_bar_id UUID,
  p_page INTEGER,
  p_limit INTEGER,
  p_role_filter TEXT DEFAULT NULL
)
RETURNS TABLE(logs json, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
-- 'public', 'extensions' : meme figement que les 4 RPC freres du 01/09
-- (20260901100000). PAS 'auth' : auth.uid() est qualifie explicitement par
-- son schema, il n'a donc pas besoin d'y figurer - add_co_promoteur le
-- prouve en prod depuis le 01/09. Un corps plpgsql n'etant pas resolu au
-- CREATE, un futur appel a une fonction d'extension passerait la migration
-- et n'echouerait qu'au premier appel reel : d'ou 'extensions' des maintenant.
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- 🛡️ p_bar_id est OBLIGATOIRE et se retrouve tel quel dans le WHERE plus
  --    bas : c'est l'isolation multi-tenant. Un p_bar_id NULL qui laisserait
  --    passer serait exactement la faille corrigee par 20260901110000, d'ou
  --    ce refus explicite plutot qu'un WHERE qui ne filtrerait rien.
  IF p_bar_id IS NULL THEN
    RAISE EXCEPTION 'p_bar_id is required' USING ERRCODE = '22004';
  END IF;

  -- ⚠️ is_super_admin() porte la dette connue du LIMIT 1 sans ORDER BY ni
  --    filtre bar_id (memoire project_is_super_admin_fragile, 431 usages).
  --    Elle n'est PAS corrigee ici - la corriger au passage d'un autre
  --    chantier est exactement ce que la lecon du 01/09 interdit. Elle reste
  --    deterministe tant que l'unique super_admin n'a qu'une ligne active.
  --
  -- ⭐ En revanche get_user_role() n'est deliberement PAS utilisee ici, alors
  --    qu'elle l'est partout ailleurs : son `LIMIT 1` sans ORDER BY choisit
  --    une ligne ARBITRAIRE quand un couple (user, bar) en a plusieurs
  --    actives. Un promoteur conservant une ligne `gerant` active obsolete
  --    se verrait refuser l'acces a son propre journal, par intermittence et
  --    sans message comprehensible. L'EXISTS ci-dessous est juste quel que
  --    soit le nombre de lignes, et reste LOCAL a cette fonction : aucune
  --    fonction partagee n'est modifiee au passage (lecon du 01/09 respectee).
  IF NOT (
    is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.bar_members bm
      WHERE bm.user_id = auth.uid()
        AND bm.bar_id = p_bar_id
        AND bm.is_active = true
        AND bm.role = ANY (ARRAY['promoteur', 'co_promoteur'])
    )
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- 🛡️ Bornage de la pagination. get_paginated_audit_logs ne le fait pas,
  --    mais il est verrouille super_admin : un OFFSET negatif y reste une
  --    erreur d'exploitation. Ici l'appelant est un promoteur, donc une
  --    entree hors bornes doit etre refusee proprement, et p_limit plafonne
  --    pour qu'un seul appel ne puisse pas tirer tout l'historique du bar.
  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'p_page must be >= 1' USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 200' USING ERRCODE = '22023';
  END IF;

  -- ⚠️ p_role_filter est une VALEUR de la colonne user_role (ex:
  --    'co_promoteur'), pas un role d'ACCES - a ne pas confondre avec le
  --    garde ci-dessus. NULL ou '' = pas de filtre (comportement par
  --    defaut du plan §5 Q1 : journal global filtrable, pas un mode exclusif).
  --
  --    Valeur bornee a la liste reelle des roles : une chaine libre erronee
  --    renverrait 0 ligne SANS erreur, et l'utilisateur conclurait a un
  --    journal vide plutot qu'a un filtre invalide.
  IF p_role_filter IS NOT NULL
     AND p_role_filter <> ''
     AND p_role_filter <> ALL (ARRAY['super_admin', 'promoteur', 'co_promoteur', 'gerant', 'serveur', 'cuisinier']) THEN
    RAISE EXCEPTION 'Invalid p_role_filter: %', p_role_filter USING ERRCODE = '22023';
  END IF;

  -- ⚠️ json_agg retourne NULL (pas '[]') quand la page est vide - bar sans
  --    activite, ou p_page au-dela du dernier resultat. Le consommateur doit
  --    traiter `logs IS NULL` comme une liste vide ; c'est le meme contrat
  --    que get_paginated_audit_logs, dont le front existant s'accommode deja.
  RETURN QUERY
  WITH filtered_logs AS (
    SELECT *
    FROM public.audit_logs
    WHERE bar_id = p_bar_id
      AND (p_role_filter IS NULL OR p_role_filter = '' OR user_role = p_role_filter)
  )
  -- ⚠️ Le departage par id est INDISPENSABLE, pas cosmetique : `timestamp`
  --    n'est pas unique (DEFAULT NOW() est transaction-scoped, donc plusieurs
  --    entrees ecrites dans la meme transaction partagent la valeur exacte).
  --    Sans lui, Postgres peut ordonner ces ex-aequo differemment entre la
  --    page 1 et la page 2 : une entree apparait deux fois, une autre jamais.
  --    C'est la completude meme du journal qui en depend.
  SELECT
    (SELECT json_agg(fl.* ORDER BY fl."timestamp" DESC, fl.id DESC) FROM (
      SELECT * FROM filtered_logs
      ORDER BY "timestamp" DESC, id DESC
      LIMIT p_limit
      OFFSET (p_page - 1) * p_limit
    ) fl) AS logs,
    (SELECT COUNT(*) FROM filtered_logs) AS total_count;
END;
$function$;

-- ⭐ Index composite (bar_id, timestamp DESC) - AUCUN index n'aide cette
--    requete aujourd'hui.
--
--    ⚠️ 7e divergence fichiers/prod avérée (releve du 21/09/2026) :
--    001_initial_schema.sql:564-567 cree idx_audit_logs_bar,
--    idx_audit_logs_timestamp, idx_audit_logs_user et idx_audit_logs_event.
--    AUCUN des quatre n'existe en base. Ne pas se fier a ces lignes : les
--    seuls index reels sont audit_logs_pkey et deux index PARTIELS de
--    decembre (idx_audit_logs_proxy_events sur event LIKE 'PROXY_%',
--    idx_audit_logs_super_admin sur user_id WHERE user_role='super_admin'),
--    dont aucun ne couvre un filtre bar_id.
--
--    Donc aujourd'hui, filtrer sur bar_id = scan sequentiel complet, puis
--    tri - et la CTE etant referencee deux fois (page + COUNT(*)), deux fois
--    par appel. Supportable sur 8 335 lignes / 3 Mo (releve du 21/09), mais
--    le volet B2 va precisement mettre ventes / depenses / stock / retours a
--    ecrire dedans. Creer l'index maintenant coute moins cher que de
--    diagnostiquer un ralentissement dans trois mois - et le projet a deja
--    paye ce genre de dette avec le chantier Disk IO.
--
--    CONCURRENTLY volontairement ABSENT : il ne peut pas tourner dans un bloc
--    transactionnel, et le SQL Editor en ouvre un. A 3 Mo le verrou se compte
--    en dizaines de millisecondes ; si la table avait grossi, il faudrait le
--    passer a part, hors transaction.
CREATE INDEX IF NOT EXISTS idx_audit_logs_bar_timestamp
  ON public.audit_logs (bar_id, "timestamp" DESC);

-- CREATE OR REPLACE perd les GRANTs a chaque execution - toujours
-- re-durcir explicitement (lecon vagues 1-4, project_rpc_security_hardening).
REVOKE ALL ON FUNCTION public.get_bar_audit_logs(UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bar_audit_logs(UUID, INTEGER, INTEGER, TEXT) TO authenticated;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL - a executer APRES                                      │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) La fonction existe avec la bonne signature et les bons privileges :
--
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        p.prosecdef AS security_definer
-- FROM pg_proc p
-- WHERE p.proname = 'get_bar_audit_logs' AND p.pronamespace = 'public'::regnamespace;
--
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public' AND routine_name = 'get_bar_audit_logs';
-- -- Attendu : authenticated (EXECUTE) uniquement. PAS anon, PAS PUBLIC.
--
-- 2) Smoke-test guard (SQL Editor => auth.uid() est NULL => ni super_admin
--    ni promoteur/co_promoteur => doit lever 'Access denied') :
--
-- SELECT * FROM get_bar_audit_logs('00000000-0000-0000-0000-000000000000'::uuid, 1, 20, NULL);
-- -- Attendu : ERROR 42501 Access denied (ou 22004 si l'UUID est refuse avant,
-- --    peu probable ici car p_bar_id n'est pas NULL dans ce test).
--
-- 3) Smoke-test p_bar_id NULL (doit etre bloque avant meme le garde de role) :
--
-- SELECT * FROM get_bar_audit_logs(NULL, 1, 20, NULL);
-- -- Attendu : ERROR 22004 p_bar_id is required
--
-- 3bis) Bornes de pagination et filtre de role. ⚠️ Ces trois tests ne sont
--    concluants QUE depuis une session authentifiee habilitee (promoteur /
--    co-promoteur / super_admin) : depuis le SQL Editor, le garde d'acces
--    leve 42501 AVANT de les atteindre, ce qui ne prouve rien sur eux.
--
-- SELECT * FROM get_bar_audit_logs('<bar reel>'::uuid, 0, 20, NULL);
-- -- Attendu : ERROR 22023 p_page must be >= 1
--
-- SELECT * FROM get_bar_audit_logs('<bar reel>'::uuid, 1, 5000, NULL);
-- -- Attendu : ERROR 22023 p_limit must be between 1 and 200
--
-- SELECT * FROM get_bar_audit_logs('<bar reel>'::uuid, 1, 20, 'pizzaiolo');
-- -- Attendu : ERROR 22023 Invalid p_role_filter: pizzaiolo
--
-- 3ter) L'index composite existe bien (et n'a pas ete avale par un
--    IF NOT EXISTS sur un homonyme preexistant d'une autre definition) :
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'audit_logs'
-- ORDER BY indexname;
-- -- Attendu : idx_audit_logs_bar_timestamp sur (bar_id, "timestamp" DESC).
--
-- 4) Test fonctionnel complet A FAIRE DEPUIS L'APPLICATION (pas le SQL Editor,
--    qui n'a pas de session utilisateur - cf. memoire
--    feedback_migrations_manual_sql_editor) : connecte en promoteur ou
--    co_promoteur d'un bar reel, verifier que l'appel retourne les logs de
--    CE bar uniquement, et qu'un p_role_filter='co_promoteur' restreint bien
--    le resultat aux lignes ecrites par un co_promoteur.
