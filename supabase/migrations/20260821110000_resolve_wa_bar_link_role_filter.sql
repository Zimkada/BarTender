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
-- IMPACT : wa_bar_links reste vide en prod (aucun code ne l'alimente
--   encore) - cette migration ne modifie aucune donnee, uniquement le
--   corps de la fonction. Zero risque de regression sur un lien existant
--   (il n'y en a aucun). CREATE OR REPLACE avec meme signature : les
--   privileges (service_role uniquement) devraient survivre, re-verifies
--   au post-vol par prudence (meme discipline que les migrations
--   precedentes sur ce projet).
--
-- SOLUTION : ajouter AND bm.role != 'serveur' au WHERE de
--   resolve_wa_bar_link(). Un lien cree pour un serveur (si jamais le
--   futur flux d'opt-in ne le bloquait pas des la creation - defense de
--   premiere ligne, cf request-wa-bar-link a venir) ne serait alors
--   jamais resolu positivement, quel que soit son etat (verifie, actif,
--   membre actif du bar) - deuxieme ligne de defense independante de la
--   premiere.
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
    AND bm.role != 'serveur';
END;
$$;

COMMENT ON FUNCTION public.resolve_wa_bar_link(TEXT) IS
'Point d''entree UNIQUE pour resoudre un numero WhatsApp en (bar_id, role) - ne renvoie QUE le '
'lien actif (is_active_link = true), au plus une ligne par numero, jamais un choix ambigu entre '
'plusieurs bars lies. Exclut explicitement le role serveur (defense en profondeur - §5 de '
'l''etude : le filtrage doit se faire ici, pas seulement en esperant qu''un lien serveur n''ait '
'jamais ete cree). Revalide bar_members.is_active ET bar_members.role a chaque appel (pas '
'seulement a la creation du lien). A appeler depuis wa-webhook (service_role) uniquement - '
'jamais exposee a authenticated/anon : le numero WhatsApp n''est pas une preuve d''identite '
'verifiable par RLS classique.';

-- Pas de nouveau GRANT/REVOKE : signature inchangee, privileges deja
-- poses (20260821090000) devraient survivre - re-verifies ci-dessous.

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

  RAISE NOTICE '✅ resolve_wa_bar_link filtre desormais explicitement le role serveur (defense en profondeur, §5 de l''etude).';
END $$;

COMMIT;
