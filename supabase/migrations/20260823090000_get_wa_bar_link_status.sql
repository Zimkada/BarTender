-- =====================================================
-- PROBLEM : wa_bar_links est verrouillee service_role uniquement (REVOKE
--   anon/authenticated dans 20260821090000) - aucun chemin de lecture
--   pour l'UI SettingsPage qui doit afficher l'etat du lien WhatsApp
--   analyste du bar courant (absent / en attente de verification / verifie
--   et actif). C'est la derniere piece du flux d'opt-in avant qu'il soit
--   utilisable de bout en bout (voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md).
--
-- IMPACT : wa_bar_links reste vide en prod - cette migration ne modifie
--   aucune donnee, ajoute uniquement une fonction de lecture.
--
-- SOLUTION : RPC get_wa_bar_link_status(p_bar_id) plutot qu'une policy RLS
--   directe sur la table - verifie is_bar_member(p_bar_id) explicitement
--   (comme request_wa_bar_link), pas seulement user_id = auth.uid(), et ne
--   retourne QUE les colonnes necessaires a l'affichage (jamais
--   verification_code, meme si NULL une fois verifie - defense en
--   profondeur, la fonction ne doit jamais pouvoir exposer ce champ meme
--   si son usage evolue plus tard). Retourne au plus une ligne : le lien
--   NON revoque le plus recent pour ce bar (UNIQUE(phone_wa_id, bar_id) —
--   un bar peut historiquement avoir eu plusieurs numeros revoques, jamais
--   plus d'un lien actif non revoque a la fois par construction du flux
--   d'opt-in : ON CONFLICT(phone_wa_id, bar_id) reinitialise la meme ligne
--   plutot que d'en creer une nouvelle a chaque redemande sur ce couple).
-- =====================================================

BEGIN;

-- --- Pre-vol ---
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.wa_bar_links;
  RAISE NOTICE 'PRE-VOL: % lien(s) existant(s) dans wa_bar_links avant migration (attendu 0).', v_count;
END $$;

CREATE OR REPLACE FUNCTION public.get_wa_bar_link_status(p_bar_id UUID)
RETURNS TABLE (
  phone_wa_id TEXT,
  verified BOOLEAN,
  is_active_link BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Meme garde explicite que request_wa_bar_link (20260822090000) : verifie
  -- l'appartenance active au bar, pas seulement une session valide. Un
  -- utilisateur authentifie mais non membre de p_bar_id ne doit jamais
  -- pouvoir sonder l'existence d'un lien WhatsApp pour ce bar.
  IF NOT public.is_bar_member(p_bar_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.phone_wa_id,
    (l.verified_at IS NOT NULL),
    l.is_active_link,
    l.created_at
  FROM public.wa_bar_links l
  WHERE l.bar_id = p_bar_id
    AND l.revoked_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_wa_bar_link_status(UUID) IS
'Lecture seule de l''etat du lien WhatsApp analyste pour un bar - reserve a un membre actif '
'de ce bar (is_bar_member verifie en interne, pas seulement authenticated). Ne retourne JAMAIS '
'verification_code ni code_expires_at/attempts_remaining - uniquement les 4 champs necessaires '
'a l''affichage UI (SettingsPage). Retourne 0 ligne si aucun lien non revoque n''existe pour ce '
'bar, ou si l''appelant n''est pas membre actif. Voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md.';

REVOKE ALL ON FUNCTION public.get_wa_bar_link_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_wa_bar_link_status(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_wa_bar_link_status(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_count_after BIGINT;
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_bar_links;

  SELECT has_function_privilege('anon', 'public.get_wa_bar_link_status(uuid)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.get_wa_bar_link_status(uuid)', 'EXECUTE') INTO v_auth_fn;

  RAISE NOTICE 'POST-VOL: % lien(s) dans wa_bar_links apres migration (attendu 0).', v_count_after;
  RAISE NOTICE 'get_wa_bar_link_status -- anon: % (attendu false), authenticated: % (attendu true)', v_anon_fn, v_auth_fn;

  IF v_count_after <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lien(s) inattendu(s) - cette migration ne doit rien ecrire.', v_count_after;
  END IF;
  IF v_anon_fn THEN
    RAISE EXCEPTION 'ECHEC: get_wa_bar_link_status accessible par anon.';
  END IF;
  IF NOT v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: authenticated ne peut pas executer get_wa_bar_link_status.';
  END IF;

  RAISE NOTICE '✅ get_wa_bar_link_status disponible pour authenticated (filtre is_bar_member en interne).';
END $$;

COMMIT;
