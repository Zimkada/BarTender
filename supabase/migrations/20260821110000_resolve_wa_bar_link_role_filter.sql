-- =====================================================
-- PROBLEM : resolve_wa_bar_link() (deja en prod) filtre sur
--   bar_members.is_active mais jamais sur bar_members.role - alors que le
--   §5 de l'etude (ETUDE_AGENT_ANALYSTE.md) tranche explicitement : "un
--   numero resolu en serveur ne doit JAMAIS atteindre le mode analyste...
--   ce filtrage doit se faire AU MOMENT DE LA RESOLUTION D'IDENTITE, pas
--   en esperant que le prompt refuse poliment a un serveur curieux."
--   Trouve en certifiant les decisions du flux d'opt-in (21/08/2026,
--   avant d'ecrire request-wa-bar-link) : la fonction telle qu'ecrite ne
--   tient pas cette promesse - elle depend entierement d'une couche
--   appelante (future) pour refuser un lien serveur, ce qui n'est pas la
--   defense en profondeur que l'etude demande.
--
-- CORRECTIF DU 21/08/2026 (code review multi-angle) : la premiere version
--   de cette migration utilisait un denylist (AND bm.role != 'serveur'),
--   qui laisse passer silencieusement 'cuisinier' - un 5e role legal sur
--   bar_members.role depuis 20260802090000_add_cuisinier_role_check.sql,
--   avec EXACTEMENT le meme statut non-analyste que serveur
--   (ROLE_PERMISSIONS.cuisinier.canViewAnalytics = false ET
--   canViewForecasting = false, src/types/index.ts:950,952 - verifie
--   directement, pas suppose). Un denylist echoue OUVERT sur tout role
--   futur non nommement exclu - exactement l'inverse de la posture de
--   securite qu'un filtre de resolution d'identite doit avoir. Remplace
--   par un allowlist (echoue FERME par defaut) : seuls super_admin,
--   promoteur, gerant sont resolus. super_admin inclus par coherence
--   avec le guard existant is_bar_member(...) OR owner OR is_super_admin()
--   utilise sur les RPC de stats (§2.2 de l'etude) - sans effet pratique
--   ici tant qu'un super_admin n'a pas de ligne bar_members pour ce bar
--   precis (le JOIN INNER JOIN bar_members reste la condition dominante),
--   mais coherent si un super_admin est un jour ajoute a bar_members pour
--   un bar donne.
--
-- IMPACT : wa_bar_links reste vide en prod (aucun code ne l'alimente
--   encore) - cette migration ne modifie aucune donnee, uniquement le
--   corps de la fonction. Zero risque de regression sur un lien existant
--   (il n'y en a aucun). CREATE OR REPLACE avec meme signature : les
--   privileges (service_role uniquement) devraient survivre, re-verifies
--   au post-vol par prudence (meme discipline que les migrations
--   precedentes sur ce projet).
--
-- SOLUTION : remplacer AND bm.role != 'serveur' par
--   AND bm.role IN ('super_admin', 'promoteur', 'gerant') au WHERE de
--   resolve_wa_bar_link(). Un lien cree pour un role hors de cette liste
--   (serveur, cuisinier, ou tout role futur) ne sera jamais resolu
--   positivement, quel que soit son etat (verifie, actif, membre actif
--   du bar) - deuxieme ligne de defense independante du futur
--   request-wa-bar-link, qui doit lui aussi refuser la creation d'un
--   lien pour un role non eligible (premiere ligne de defense).
--
-- LIMITE ASSUMEE (non corrigee ici, notee pour la suite) : cette liste de
--   3 roles est une 4e copie manuelle de "qui a droit aux analytics",
--   en plus de ROLE_PERMISSIONS (TypeScript), du CHECK bar_members.role,
--   et du CHECK wa_bar_links.role_snapshot. Deriver dynamiquement d'une
--   source unique (ex: table de reference partagee avec le TypeScript)
--   serait plus robuste a long terme mais disproportionne pour ce
--   correctif ponctuel - a revisiter si un nouveau role est ajoute et
--   que cette liste doit etre retrouvee/mise a jour a la main une
--   nouvelle fois.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_wa_bar_link(p_phone_wa_id TEXT)
RETURNS TABLE (
  bar_id UUID,
  user_id UUID,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.bar_id,
    l.user_id,
    bm.role
  FROM public.wa_bar_links l
  JOIN public.bar_members bm ON bm.user_id = l.user_id AND bm.bar_id = l.bar_id
  WHERE l.phone_wa_id = p_phone_wa_id
    AND l.revoked_at IS NULL
    AND l.verified_at IS NOT NULL
    AND l.is_active_link = true
    AND bm.is_active = true
    AND bm.role IN ('super_admin', 'promoteur', 'gerant');
END;
$$;

COMMENT ON FUNCTION public.resolve_wa_bar_link(TEXT) IS
'Point d''entree UNIQUE pour resoudre un numero WhatsApp en (bar_id, role) - ne renvoie QUE le '
'lien actif (is_active_link = true), au plus une ligne par numero, jamais un choix ambigu entre '
'plusieurs bars lies. Allowlist explicite (super_admin, promoteur, gerant) - echoue FERME sur '
'tout role non liste (serveur, cuisinier, ou futur) - defense en profondeur, §5 de l''etude : '
'le filtrage doit se faire ici, pas seulement en esperant qu''un lien pour un role non eligible '
'n''ait jamais ete cree. Revalide bar_members.is_active ET bar_members.role a chaque appel (pas '
'seulement a la creation du lien). A appeler depuis wa-webhook (service_role) uniquement - '
'jamais exposee a authenticated/anon : le numero WhatsApp n''est pas une preuve d''identite '
'verifiable par RLS classique.';

-- Pas de nouveau GRANT/REVOKE : signature inchangee, privileges deja
-- poses (20260821090000) devraient survivre - re-verifies ci-dessous.

-- Test fonctionnel du PREDICAT de filtrage (trouve necessaire en code
-- review multi-angle : les post-vol precedents ne verifiaient que les
-- privileges d'execution, jamais que la logique du filtre elle-meme est
-- correcte - un typo comme "bm.role != 'server'" aurait pu passer
-- inaperçu). wa_bar_links etant vide, un test bout-en-bout via de vraies
-- lignes inserees demanderait de creer des lignes synthetiques dans
-- users/bars/bar_members (FK contraignantes, ON DELETE CASCADE risque
-- meme en rollback) - disproportionne pour ce correctif. Test plus
-- leger mais toujours fonctionnel : verifier directement le PREDICAT SQL
-- utilise par le filtre, pour les 5 valeurs reelles de bar_members.role,
-- sans toucher a aucune donnee.
--
-- LIMITE HONNETE de ce test : il verifie que LE PREDICAT ECRIT ICI
-- (variable v_allowed, juste en dessous) se comporte comme attendu - il
-- ne verifie PAS que la
-- fonction resolve_wa_bar_link ci-dessus utilise exactement ce meme
-- predicat (les deux pourraient diverger si l'un est modifie sans
-- l'autre dans une migration future). Un vrai test end-to-end (appel
-- reel de la fonction sur des lignes synthetiques) resterait la
-- verification la plus forte, mais le cout d'insertion synthetique
-- l'a ecarte ici - a reconsiderer si une infrastructure de test SQL
-- dediee existe un jour sur ce projet.
DO $$
DECLARE
  v_role TEXT;
  v_allowed BOOLEAN;
  v_expected BOOLEAN;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['super_admin', 'promoteur', 'gerant', 'serveur', 'cuisinier']
  LOOP
    v_allowed := v_role IN ('super_admin', 'promoteur', 'gerant');
    v_expected := v_role != 'serveur' AND v_role != 'cuisinier';
    RAISE NOTICE 'POST-VOL predicat -- role % : autorise = % (attendu %)', v_role, v_allowed, v_expected;
    IF v_allowed <> v_expected THEN
      RAISE EXCEPTION 'ECHEC: le predicat d''allowlist ne se comporte pas comme attendu pour le role %.', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE '✅ Predicat d''allowlist verifie fonctionnellement sur les 5 roles reels de bar_members.role.';
END $$;

DO $$
DECLARE
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
  v_service_fn BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('service_role', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_service_fn;

  RAISE NOTICE 'POST-VOL resolve_wa_bar_link -- anon: % (attendu false), authenticated: % (attendu false), service_role: % (attendu true)',
    v_anon_fn, v_auth_fn, v_service_fn;

  IF v_anon_fn OR v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: resolve_wa_bar_link accessible par anon ou authenticated apres le CREATE OR REPLACE.';
  END IF;
  IF NOT v_service_fn THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut plus executer resolve_wa_bar_link.';
  END IF;

  RAISE NOTICE '✅ resolve_wa_bar_link filtre desormais par allowlist (super_admin, promoteur, gerant) - echoue ferme sur tout autre role, y compris cuisinier (defense en profondeur, §5 de l''etude).';
END $$;

COMMIT;
