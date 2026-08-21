-- =====================================================
-- PROBLEM : wa_bar_links (schema pose le 21/08/2026) reste vide en
--   production - aucun code n'alimente encore le flux d'opt-in decrit au
--   §4 de l'etude (ETUDE_AGENT_ANALYSTE.md). Il manque le mecanisme qui
--   permet a un promoteur/gerant, depuis l'app authentifiee, de declarer
--   son numero WhatsApp pour un bar et de prouver qu'il le controle
--   reellement (§4 point 2 : preuve de possession, code de verification
--   envoye sur WhatsApp).
--
-- IMPACT : wa_bar_links et wa_conversations sont deja en production, mais
--   cette migration n'ecrit aucune donnee dans l'une ou l'autre - elle
--   ajoute 3 colonnes ephemeres a wa_bar_links (utilisees uniquement
--   pendant la fenetre de verification) et 2 nouvelles fonctions RPC.
--   Aucune ligne existante affectee (wa_bar_links est vide, confirme au
--   pre-vol).
--
-- SOLUTION :
--   1. 3 colonnes sur wa_bar_links : verification_code (6 chiffres,
--      genere par la RPC, jamais par l'appelant), code_expires_at
--      (10 min de validite), attempts_remaining (5 tentatives max).
--   2. request_wa_bar_link(p_bar_id, p_phone_wa_id) : appelee par la
--      future Edge Function request-wa-bar-link, SOUS LA SESSION DU
--      PROMOTEUR APPELANT (pas service_role) - auth.uid() garanti par le
--      contexte d'appel, jamais transmis en parametre (meme principe
--      que le reste de l'etude : ne jamais faire confiance a un
--      identifiant fourni par l'appelant quand le contexte peut le
--      garantir lui-meme). Verifie is_bar_member(p_bar_id) EXPLICITEMENT
--      (defaut trouve en certifiant create-bar-member comme modele - voir
--      §9 de l'etude, "verifie explicitement is_bar_member(bar_id), pas
--      seulement le role general de l'appelant"). Genere un code a 6
--      chiffres, upsert la ligne wa_bar_links (ON CONFLICT sur la
--      contrainte UNIQUE(phone_wa_id, bar_id), qui n'est PAS un index
--      partiel donc ON CONFLICT matche sans clause WHERE - lecon deja
--      tiree sur ce projet, project_rpc_sql_lessons.md, verifiee
--      applicable ici avant d'ecrire le ON CONFLICT).
--      Comportements valides avec l'utilisateur avant ecriture :
--        - Lien deja verifie -> refus silencieux, statut 'deja_verifie',
--          aucune ecriture.
--        - Lien en attente (non expire) -> nouveau code genere, ancien
--          invalide (un seul code valide a la fois par (numero, bar)).
--        - Rate-limit 60s entre 2 demandes -> statut 'trop_tot' si
--          redemande trop rapprochee (deduit de code_expires_at, pas de
--          colonne updated_at ajoutee : wa_bar_links n'en a pas).
--   3. verify_wa_bar_link_code(p_phone_wa_id, p_code) : appelee par
--      wa-webhook (service_role). Cherche la demande en attente pour ce
--      numero (n'importe quel bar - un numero ne peut avoir qu'UNE seule
--      demande en attente a la fois, contrainte posee ci-dessous),
--      verifie code + expiration, decremente les tentatives en cas
--      d'echec, marque verified_at = now() en cas de succes (declenche
--      le trigger d'auto-activation deja en place, 20260821100000).
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

-- --- 1. Colonnes ephemeres de verification ---
ALTER TABLE public.wa_bar_links
  ADD COLUMN verification_code TEXT,
  ADD COLUMN code_expires_at TIMESTAMPTZ,
  ADD COLUMN attempts_remaining INT;

COMMENT ON COLUMN public.wa_bar_links.verification_code IS
'Code a 6 chiffres genere par request_wa_bar_link(), envoye sur WhatsApp par la future Edge '
'Function request-wa-bar-link. NULL une fois verified_at renseigne (pas de raison de le garder '
'apres verification reussie). Jamais fourni par l''appelant - toujours genere serveur.';

COMMENT ON COLUMN public.wa_bar_links.code_expires_at IS
'Expiration du verification_code (10 minutes apres generation). Sert aussi de reference pour le '
'rate-limit de request_wa_bar_link (pas de colonne updated_at dediee sur cette table).';

COMMENT ON COLUMN public.wa_bar_links.attempts_remaining IS
'Tentatives restantes pour verifier verification_code (5 au depart). Atteint 0 -> la demande est '
'invalidee, le promoteur doit relancer une nouvelle demande depuis l''app (request_wa_bar_link).';

-- --- 2. Un seul numero ne peut avoir qu'UNE demande en attente a la fois ---
-- Sans cette contrainte, verify_wa_bar_link_code(phone, code) ne saurait
-- pas quelle ligne (bar_id) cibler si un meme numero avait 2+ demandes
-- en attente simultanees pour des bars differents - c'est exactement le
-- meme principe que is_active_link (§8/§9 : jamais de choix ambigu
-- silencieux). Un lien deja verifie n'est PAS concerne par cette
-- contrainte (verified_at IS NULL uniquement) : un numero peut avoir
-- plusieurs liens VERIFIES (multi-bar, §4bis), juste pas plusieurs
-- demandes EN ATTENTE simultanees.
CREATE UNIQUE INDEX idx_wa_bar_links_one_pending_per_phone
  ON public.wa_bar_links (phone_wa_id)
  WHERE verified_at IS NULL;

-- =====================================================
-- request_wa_bar_link : cree/renouvelle une demande de verification.
-- SECURITY DEFINER pour pouvoir ecrire wa_bar_links (verrouillee
-- service_role uniquement, §4 point 4), mais s'appuie sur auth.uid()
-- du contexte d'appel - jamais un parametre p_user_id fourni par
-- l'appelant (meme principe que le reste de l'etude : ne jamais faire
-- transiter une identite par un parametre quand le contexte peut la
-- garantir lui-meme).
-- =====================================================

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

  -- Verification EXPLICITE de l'appartenance au bar precis cible - pas
  -- seulement le role general de l'appelant (defaut trouve en certifiant
  -- create-bar-member comme modele, §9 de l'etude). is_bar_member() est
  -- auth.uid()-based (024_fix_all_permissions.sql:10) - fonctionne ici
  -- car cette fonction est appelee sous la session du promoteur, jamais
  -- sous service_role brut.
  IF NOT public.is_bar_member(p_bar_id) THEN
    RETURN QUERY SELECT 'non_membre_du_bar'::TEXT;
    RETURN;
  END IF;

  SELECT role INTO v_role
  FROM public.bar_members
  WHERE user_id = v_caller_id AND bar_id = p_bar_id AND is_active = true;

  -- Coherent avec l'allowlist de resolve_wa_bar_link (20260822090001,
  -- version harmonisee sans super_admin) : ne pas creer un lien pour un
  -- role qui ne sera de toute facon jamais resolu - premiere ligne de
  -- defense, resolve_wa_bar_link reste la deuxieme, independante de
  -- celle-ci.
  --
  -- CORRECTIF (code review multi-angle, 22/08/2026) : 'super_admin' a ete
  -- retire de cette allowlist. Il figurait dans l'allowlist de
  -- resolve_wa_bar_link (20260821110000) car "sans effet pratique tant
  -- qu'un super_admin n'a pas de ligne bar_members" - mais ICI, si un
  -- super_admin a reellement une ligne bar_members (role='super_admin',
  -- is_active=true), v_role vaudrait 'super_admin' et l'INSERT plus bas
  -- tenterait role_snapshot='super_admin', qui VIOLE le CHECK constraint
  -- de role_snapshot (CHECK IN ('promoteur','gerant','serveur') -
  -- 20260821090000:56, jamais mis a jour pour super_admin). Bug reel
  -- trouve en code review, pas seulement theorique : contrairement a
  -- resolve_wa_bar_link (lecture seule, jamais d'ecriture), cette
  -- fonction ECRIT role_snapshot - le CHECK constraint aurait leve une
  -- erreur brute au lieu d'un refus propre, exactement le meme mode
  -- d'echec que le bug v_role NULL deja corrige ci-dessus mais pour une
  -- autre valeur.
  --
  -- v_role IS NULL traite explicitement (pas seulement via NOT IN) :
  -- "x NOT IN (liste)" avec x NULL evalue a NULL, pas TRUE - un IF sur
  -- NULL ne se declenche jamais en PL/pgSQL, ce qui aurait laisse passer
  -- une race rare (is_bar_member() vrai un instant, puis plus de ligne
  -- bar_members correspondante avant ce SELECT) avec v_role NULL inserre
  -- dans role_snapshot (CHECK NOT NULL) - erreur confuse plutot qu'un
  -- refus propre.
  IF v_role IS NULL OR v_role NOT IN ('promoteur', 'gerant') THEN
    RETURN QUERY SELECT 'role_non_eligible'::TEXT;
    RETURN;
  END IF;

  -- Verrou consultatif AVANT toute lecture/ecriture sur ce numero - meme
  -- cle que le trigger d'auto-activation et change_active_wa_bar_link
  -- (20260821100000), pour serialiser TOUS les chemins qui touchent
  -- wa_bar_links pour un phone_wa_id donne. Corrige une race trouvee en
  -- code review : sans lui, 2 appels concurrents pour le meme
  -- (phone, bar) pouvaient lire le meme etat, passer tous les deux le
  -- rate-limit, et ecrire chacun un code different - celui qui commite
  -- en dernier gagne silencieusement, l'autre appelant montre un code
  -- au promoteur qui ne correspond plus a celui stocke en base.
  PERFORM pg_advisory_xact_lock(hashtext('wa_bar_links:' || p_phone_wa_id));

  -- CORRECTIF (code review multi-angle, 22/08/2026) : verification
  -- EXPLICITE d'une demande en attente sur un AUTRE bar, avant l'INSERT -
  -- ne pas compter sur ON CONFLICT pour ce cas. ON CONFLICT (phone_wa_id,
  -- bar_id) ne cible QUE la contrainte UNIQUE(phone_wa_id, bar_id) - il
  -- ne protege PAS contre une violation de idx_wa_bar_links_one_pending_per_phone
  -- (predicat different : phone_wa_id seul, WHERE verified_at IS NULL).
  -- Un promoteur multi-bar (§4bis, cas explicitement supporte par ce
  -- schema) qui a deja une demande en attente pour phone X + bar A, puis
  -- demande un lien pour phone X + bar B (bar_id different, donc PAS un
  -- conflit sur (phone_wa_id, bar_id)) aurait fait lever une
  -- unique_violation brute et non geree sur l'autre index. Bug reel
  -- trouve en code review, confirme par relecture directe des 2 index.
  IF EXISTS (
    SELECT 1 FROM public.wa_bar_links
    WHERE phone_wa_id = p_phone_wa_id AND bar_id != p_bar_id AND verified_at IS NULL
  ) THEN
    RETURN QUERY SELECT 'demande_en_attente_autre_bar'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.wa_bar_links
  WHERE phone_wa_id = p_phone_wa_id AND bar_id = p_bar_id
  FOR UPDATE;

  -- CORRECTIF (code review multi-angle, 22/08/2026) : ajout de
  -- "AND v_existing.revoked_at IS NULL". Sans cette condition, un lien
  -- REVOQUE (revoked_at NOT NULL) mais dont verified_at n'a jamais ete
  -- efface (aucune revocation ne le fait - §8 : "sans perdre l'historique
  -- du lien") etait a tort signale 'deja_verifie', bloquant
  -- DEFINITIVEMENT toute re-demande legitime pour ce (phone, bar) apres
  -- une seule revocation (depart d'un employe, changement de numero -
  -- des cas que le schema est explicitement concu pour supporter, §8).
  IF FOUND AND v_existing.verified_at IS NOT NULL AND v_existing.revoked_at IS NULL THEN
    RETURN QUERY SELECT 'deja_verifie'::TEXT;
    RETURN;
  END IF;

  -- Rate-limit 60s : deduit de code_expires_at (pas de colonne updated_at
  -- dediee). Si une demande existe et que son code a ete genere il y a
  -- moins de 60s (code_expires_at - 10 minutes de validite = instant de
  -- generation), refuser la redemande.
  IF FOUND AND v_existing.code_expires_at IS NOT NULL
     AND (v_existing.code_expires_at - INTERVAL '10 minutes') > (now() - INTERVAL '60 seconds') THEN
    RETURN QUERY SELECT 'trop_tot'::TEXT;
    RETURN;
  END IF;

  v_new_code := lpad(floor(random() * 900000 + 100000)::TEXT, 6, '0');

  -- CORRECTIF (code review multi-angle, 22/08/2026) : re-demande sur un
  -- lien revoque doit reinitialiser TOUTES les colonnes d'identite
  -- (user_id, role_snapshot, created_by, revoked_at), pas seulement les
  -- 3 colonnes ephemeres - sinon un lien re-demande par un autre
  -- utilisateur que celui qui l'avait cree initialement garderait
  -- silencieusement l'ancienne identite en cas de conflit.
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
    revoked_at = NULL;

  RETURN QUERY SELECT 'code_genere:' || v_new_code;
END;
$$;

COMMENT ON FUNCTION public.request_wa_bar_link(UUID, TEXT) IS
'Cree ou renouvelle une demande de verification de numero WhatsApp pour un bar. Appelee par la '
'future Edge Function request-wa-bar-link SOUS LA SESSION DU PROMOTEUR APPELANT (jamais '
'service_role) - auth.uid() garanti par le contexte, jamais transmis en parametre. Verifie '
'is_bar_member(p_bar_id) explicitement (pas seulement le role general). Allowlist '
'(promoteur, gerant) - PAS super_admin : ecrire role_snapshot=''super_admin'' violerait son '
'CHECK constraint (promoteur/gerant/serveur uniquement). Coherent avec resolve_wa_bar_link '
'(20260822090001), qui exclut aussi super_admin de sa propre allowlist pour la meme raison. '
'Retourne un statut : non_authentifie, non_membre_du_bar, role_non_eligible, '
'demande_en_attente_autre_bar, deja_verifie, trop_tot, ou code_genere:<le code a envoyer sur '
'WhatsApp>. Le code n''est jamais retourne en clair sauf dans ce dernier cas - a la charge de '
'l''appelant de l''envoyer immediatement sur WhatsApp et de ne jamais le logger.';

REVOKE ALL ON FUNCTION public.request_wa_bar_link(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_wa_bar_link(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_wa_bar_link(UUID, TEXT) TO authenticated;

-- =====================================================
-- verify_wa_bar_link_code : verifie le code recu sur WhatsApp. Appelee
-- par wa-webhook (service_role) - jamais par l'app.
-- =====================================================

CREATE OR REPLACE FUNCTION public.verify_wa_bar_link_code(p_phone_wa_id TEXT, p_code TEXT)
RETURNS TABLE (status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_link RECORD;
BEGIN
  -- SELECT INTO sans LIMIT 1 est sur ici car idx_wa_bar_links_one_pending_per_phone
  -- (cree ci-dessus) garantit structurellement au plus UNE ligne
  -- verified_at IS NULL par phone_wa_id - si cet index venait a manquer,
  -- ce SELECT prendrait silencieusement la premiere ligne trouvee au lieu
  -- de lever une erreur (comportement standard de SELECT INTO en
  -- PL/pgSQL sur plusieurs lignes).
  SELECT * INTO v_link
  FROM public.wa_bar_links
  WHERE phone_wa_id = p_phone_wa_id AND verified_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'aucune_demande_en_attente'::TEXT;
    RETURN;
  END IF;

  IF v_link.code_expires_at < now() THEN
    DELETE FROM public.wa_bar_links WHERE id = v_link.id;
    RETURN QUERY SELECT 'code_expire'::TEXT;
    RETURN;
  END IF;

  IF v_link.attempts_remaining <= 0 THEN
    DELETE FROM public.wa_bar_links WHERE id = v_link.id;
    RETURN QUERY SELECT 'trop_de_tentatives'::TEXT;
    RETURN;
  END IF;

  -- CORRECTIF (code review multi-angle, 22/08/2026) : p_code normalise
  -- (trim + retrait des espaces internes eventuels) avant comparaison.
  -- Un code recu en texte libre sur WhatsApp peut arriver avec un espace
  -- de tete/fin (autocorrect, retour a la ligne du client WhatsApp) -
  -- sans normalisation, un code par ailleurs correct est refuse et brule
  -- une tentative sur seulement 5 disponibles, pour une simple difference
  -- de formatage sans rapport avec la validite du code.
  IF v_link.verification_code != regexp_replace(trim(p_code), '\s+', '', 'g') THEN
    UPDATE public.wa_bar_links
    SET attempts_remaining = attempts_remaining - 1
    WHERE id = v_link.id;
    RETURN QUERY SELECT 'code_incorrect'::TEXT;
    RETURN;
  END IF;

  -- Meme logique d'auto-activation que le trigger d'INSERT (20260821100000) :
  -- si aucun autre lien n'est deja actif pour ce numero, celui-ci le
  -- devient. Meme verrou consultatif partage (meme cle, meme convention)
  -- pour se serialiser avec change_active_wa_bar_link et le trigger.
  --
  -- CORRECTIF (code review multi-angle, 22/08/2026) : le verrou
  -- consultatif est desormais acquis AVANT l'UPDATE qui marque
  -- verified_at, pas apres - la version precedente ecrivait verified_at
  -- (visible aux autres transactions apres commit) puis acquerrait
  -- seulement ensuite le verrou consultatif, laissant une fenetre ou
  -- change_active_wa_bar_link aurait pu evaluer is_active_link sur un
  -- etat "verifie mais pas encore evalue pour auto-activation". Les 2
  -- UPDATE (verified_at+cleanup, puis is_active_link) sont aussi
  -- fusionnes en une seule instruction - reduit le temps total sous le
  -- verrou de ligne FOR UPDATE deja tenu depuis le debut de la fonction.
  PERFORM pg_advisory_xact_lock(hashtext('wa_bar_links:' || p_phone_wa_id));

  UPDATE public.wa_bar_links
  SET
    verified_at = now(),
    verification_code = NULL,
    code_expires_at = NULL,
    attempts_remaining = NULL,
    is_active_link = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.wa_bar_links
        WHERE phone_wa_id = p_phone_wa_id AND is_active_link = true
      ) THEN true
      ELSE is_active_link
    END
  WHERE id = v_link.id;

  RETURN QUERY SELECT 'verifie'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT) IS
'Verifie un code de 6 chiffres recu sur WhatsApp contre une demande en attente. Appelee depuis '
'wa-webhook (service_role) uniquement. Decremente attempts_remaining a chaque echec, supprime la '
'demande a expiration ou apres 5 tentatives (le promoteur doit relancer depuis l''app). Succes : '
'marque verified_at, nettoie les colonnes ephemeres, active le lien si aucun autre n''est deja '
'actif pour ce numero (meme logique que le trigger d''auto-activation sur INSERT, '
'20260821100000, qui ne se declenche pas ici puisque c''est un UPDATE).';

REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT) TO service_role;

-- --- Post-vol ---
DO $$
DECLARE
  v_count_after BIGINT;
  v_index_exists BOOLEAN;
  v_auth_request BOOLEAN;
  v_anon_request BOOLEAN;
  v_service_verify BOOLEAN;
  v_anon_verify BOOLEAN;
  v_auth_verify BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_bar_links;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'wa_bar_links' AND indexname = 'idx_wa_bar_links_one_pending_per_phone'
  ) INTO v_index_exists;

  SELECT has_function_privilege('authenticated', 'public.request_wa_bar_link(uuid,text)', 'EXECUTE') INTO v_auth_request;
  SELECT has_function_privilege('anon', 'public.request_wa_bar_link(uuid,text)', 'EXECUTE') INTO v_anon_request;

  SELECT has_function_privilege('service_role', 'public.verify_wa_bar_link_code(text,text)', 'EXECUTE') INTO v_service_verify;
  SELECT has_function_privilege('anon', 'public.verify_wa_bar_link_code(text,text)', 'EXECUTE') INTO v_anon_verify;
  SELECT has_function_privilege('authenticated', 'public.verify_wa_bar_link_code(text,text)', 'EXECUTE') INTO v_auth_verify;

  RAISE NOTICE 'POST-VOL: % lien(s) dans wa_bar_links apres migration (attendu 0).', v_count_after;
  RAISE NOTICE 'POST-VOL: index un-seul-en-attente present ? % (attendu true).', v_index_exists;
  RAISE NOTICE 'request_wa_bar_link -- authenticated: % (attendu true), anon: % (attendu false)', v_auth_request, v_anon_request;
  RAISE NOTICE 'verify_wa_bar_link_code -- service_role: % (attendu true), anon: % (attendu false), authenticated: % (attendu false)',
    v_service_verify, v_anon_verify, v_auth_verify;

  IF v_count_after <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lien(s) inattendu(s) - cette migration ne doit rien ecrire.', v_count_after;
  END IF;
  IF NOT v_index_exists THEN
    RAISE EXCEPTION 'ECHEC: index idx_wa_bar_links_one_pending_per_phone absent.';
  END IF;
  IF NOT v_auth_request OR v_anon_request THEN
    RAISE EXCEPTION 'ECHEC: privileges incorrects sur request_wa_bar_link.';
  END IF;
  IF NOT v_service_verify OR v_anon_verify OR v_auth_verify THEN
    RAISE EXCEPTION 'ECHEC: privileges incorrects sur verify_wa_bar_link_code.';
  END IF;

  RAISE NOTICE '✅ Flux d''opt-in (request_wa_bar_link + verify_wa_bar_link_code) en place, privileges conformes.';
END $$;

COMMIT;
