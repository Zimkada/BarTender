-- =====================================================
-- PROBLEM : le correctif du 22/08/2026 sur verify_wa_bar_link_code
--   (20260822090002) retire les DELETE des branches code_expire et
--   trop_de_tentatives, pour permettre la relecture de dedup sur un
--   retry Meta tardif (bug reel corrige - une ligne supprimee ne pouvait
--   jamais rejouer son dernier statut). Consequence secondaire non
--   anticipee au moment de ce premier correctif : la ligne reste
--   desormais indefiniment verified_at IS NULL apres expiration ou
--   epuisement des tentatives, au lieu d'etre supprimee.
--
--   request_wa_bar_link() (20260822090000) bloque une nouvelle demande
--   sur un AUTRE bar tant qu'une ligne verified_at IS NULL existe pour ce
--   numero (statut demande_en_attente_autre_bar) - une protection
--   legitime PENDANT la fenetre de verification active (10 minutes), mais
--   qui devient un blocage PERMANENT une fois cette meme ligne devenue
--   inerte (code expire ou tentatives epuisees) sans jamais etre
--   supprimee. Un promoteur qui a laisse une demande expirer sur le Bar A
--   ne pourrait plus JAMAIS demander de lien pour le Bar B avec ce meme
--   numero, sauf a relancer explicitement une demande sur le Bar A pour
--   reinitialiser cette ligne via ON CONFLICT.
--
-- IMPACT : wa_bar_links reste vide en prod - cette migration ne modifie
--   aucune donnee, uniquement le corps de request_wa_bar_link (CREATE OR
--   REPLACE, meme signature exacte (UUID, TEXT) - contrairement a
--   verify_wa_bar_link_code, aucun DROP necessaire ici, le nombre de
--   parametres ne change pas).
--
-- SOLUTION : le controle "demande en attente sur un autre bar" doit
--   ignorer une ligne dont le code est deja expire OU dont les tentatives
--   sont deja epuisees - une telle ligne n'est plus une "vraie" demande
--   active au sens metier, meme si verified_at reste NULL par
--   construction (20260822090002). Ajout de
--   "AND code_expires_at >= now() AND attempts_remaining > 0" au controle
--   existant.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.request_wa_bar_link(p_bar_id UUID, p_phone_wa_id TEXT)
RETURNS TABLE (status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role TEXT;
  v_existing RECORD;
  v_new_code TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN QUERY SELECT 'non_authentifie'::TEXT;
    RETURN;
  END IF;

  IF NOT public.is_bar_member(p_bar_id) THEN
    RETURN QUERY SELECT 'non_membre_du_bar'::TEXT;
    RETURN;
  END IF;

  SELECT role INTO v_role
  FROM public.bar_members
  WHERE user_id = v_caller_id AND bar_id = p_bar_id AND is_active = true;

  IF v_role IS NULL OR v_role NOT IN ('promoteur', 'gerant') THEN
    RETURN QUERY SELECT 'role_non_eligible'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wa_bar_links:' || p_phone_wa_id));

  -- CORRECTIF (trouve en corrigeant verify_wa_bar_link_code, 22/08/2026) :
  -- une ligne verified_at IS NULL dont le code est deja expire OU dont
  -- les tentatives sont deja epuisees n'est plus une VRAIE demande
  -- active - depuis 20260822090002, verify_wa_bar_link_code() ne
  -- supprime plus ces lignes (pour permettre la relecture de dedup sur
  -- un retry Meta tardif), donc sans cette condition supplementaire,
  -- une demande abandonnee sur un bar bloquerait INDEFINIMENT toute
  -- nouvelle demande sur un AUTRE bar pour ce meme numero - alors que
  -- l'intention est de bloquer seulement PENDANT la fenetre de
  -- verification active (10 minutes), pas pour toujours.
  IF EXISTS (
    SELECT 1 FROM public.wa_bar_links
    WHERE phone_wa_id = p_phone_wa_id
      AND bar_id != p_bar_id
      AND verified_at IS NULL
      AND code_expires_at >= now()
      AND attempts_remaining > 0
  ) THEN
    RETURN QUERY SELECT 'demande_en_attente_autre_bar'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.wa_bar_links
  WHERE phone_wa_id = p_phone_wa_id AND bar_id = p_bar_id
  FOR UPDATE;

  IF FOUND AND v_existing.verified_at IS NOT NULL AND v_existing.revoked_at IS NULL THEN
    RETURN QUERY SELECT 'deja_verifie'::TEXT;
    RETURN;
  END IF;

  -- Rate-limit 60s : deduit de code_expires_at (pas de colonne updated_at
  -- dediee). Si une demande existe et que son code a ete genere il y a
  -- moins de 60s (code_expires_at - 10 minutes de validite = instant de
  -- generation), refuser la redemande.
  --
  -- Cette condition reste correcte meme pour une ligne devenue inerte
  -- (code expire ou tentatives epuisees, plus supprimee depuis
  -- 20260822090002) : si l'ancien code a ete genere il y a plus de 60s
  -- (ce qui est garanti vrai des qu'il a eu le temps d'expirer, 10
  -- minutes de validite > 60s), cette condition est fausse et la
  -- redemande est autorisee - aucun changement de comportement
  -- necessaire ici.
  IF FOUND AND v_existing.code_expires_at IS NOT NULL
     AND (v_existing.code_expires_at - INTERVAL '10 minutes') > (now() - INTERVAL '60 seconds') THEN
    RETURN QUERY SELECT 'trop_tot'::TEXT;
    RETURN;
  END IF;

  v_new_code := lpad(floor(random() * 900000 + 100000)::TEXT, 6, '0');

  -- Re-demande sur un lien revoque OU une ligne inerte (code expire /
  -- tentatives epuisees, plus supprimee) reinitialise TOUTES les
  -- colonnes ephemeres ET d'identite ET de dedup (last_processed_wamid,
  -- last_processed_status) - sinon un wamid trace lors du cycle
  -- precedent pourrait etre relu a tort contre le nouveau cycle de
  -- verification (bug distinct signale en code review, non corrige ici
  -- par choix : necessiterait un "numero de cycle" pour etre resolu
  -- proprement, disproportionne pour ce chantier tant que wa_bar_links
  -- reste vide en prod - reinitialiser ces colonnes ici reduit deja
  -- fortement la fenetre d'exposition a ce bug residuel).
  INSERT INTO public.wa_bar_links (
    phone_wa_id, user_id, bar_id, role_snapshot,
    verification_code, code_expires_at, attempts_remaining, created_by
  )
  VALUES (
    p_phone_wa_id, v_caller_id, p_bar_id, v_role,
    v_new_code, now() + INTERVAL '10 minutes', 5, v_caller_id
  )
  ON CONFLICT (phone_wa_id, bar_id) DO UPDATE SET
    user_id = v_caller_id,
    role_snapshot = v_role,
    verification_code = v_new_code,
    code_expires_at = now() + INTERVAL '10 minutes',
    attempts_remaining = 5,
    created_by = v_caller_id,
    verified_at = NULL,
    revoked_at = NULL,
    last_processed_wamid = NULL,
    last_processed_status = NULL;

  RETURN QUERY SELECT 'code_genere:' || v_new_code;
END;
$$;

COMMENT ON FUNCTION public.request_wa_bar_link(UUID, TEXT) IS
'Cree ou renouvelle une demande de verification de numero WhatsApp pour un bar. Appelee par la '
'future Edge Function request-wa-bar-link SOUS LA SESSION DU PROMOTEUR APPELANT (jamais '
'service_role) - auth.uid() garanti par le contexte, jamais transmis en parametre. Verifie '
'is_bar_member(p_bar_id) explicitement (pas seulement le role general). Allowlist '
'(promoteur, gerant) - PAS super_admin : ecrire role_snapshot=''super_admin'' violerait son '
'CHECK constraint (promoteur/gerant/serveur uniquement). Le controle demande_en_attente_autre_bar '
'ignore desormais une ligne dont le code est expire ou les tentatives epuisees (20260822090003) - '
'une telle ligne n''est plus une VRAIE demande active depuis que verify_wa_bar_link_code ne la '
'supprime plus (20260822090002, pour permettre la relecture de dedup). Retourne un statut : '
'non_authentifie, non_membre_du_bar, role_non_eligible, demande_en_attente_autre_bar, deja_verifie, '
'trop_tot, ou code_genere:<le code a envoyer sur WhatsApp>. Le code n''est jamais retourne en '
'clair sauf dans ce dernier cas - a la charge de l''appelant de l''envoyer immediatement sur '
'WhatsApp et de ne jamais le logger.';

-- Pas de nouveau GRANT/REVOKE : signature INCHANGEE (UUID, TEXT) - un
-- simple CREATE OR REPLACE sur la meme signature exacte preserve les
-- privileges existants (contrairement au cas verify_wa_bar_link_code,
-- 20260822090002, ou le nombre de parametres changeait). Re-verifie au
-- post-vol par prudence, meme discipline que toutes les migrations
-- precedentes de ce chantier.

DO $$
DECLARE
  v_count_after BIGINT;
  v_auth_fn BOOLEAN;
  v_anon_fn BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_bar_links;

  SELECT has_function_privilege('authenticated', 'public.request_wa_bar_link(uuid,text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('anon', 'public.request_wa_bar_link(uuid,text)', 'EXECUTE') INTO v_anon_fn;

  RAISE NOTICE 'POST-VOL: % lien(s) dans wa_bar_links apres migration (attendu 0).', v_count_after;
  RAISE NOTICE 'request_wa_bar_link -- authenticated: % (attendu true), anon: % (attendu false)', v_auth_fn, v_anon_fn;

  IF v_count_after <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lien(s) inattendu(s) - cette migration ne doit rien ecrire.', v_count_after;
  END IF;
  IF NOT v_auth_fn OR v_anon_fn THEN
    RAISE EXCEPTION 'ECHEC: privileges incorrects sur request_wa_bar_link apres le CREATE OR REPLACE.';
  END IF;

  RAISE NOTICE '✅ request_wa_bar_link ignore desormais une demande sur un autre bar dont le code est expire/epuise.';
END $$;

COMMIT;
