-- =====================================================
-- PROBLEM : l'extension de wa-webhook qui intercepte un code de
--   verification a 6 chiffres (avant de charger wa_conversations, isolation
--   stricte du canal commercial - §4/§9 de l'etude) appelle
--   verify_wa_bar_link_code() sans aucune deduplication par wamid. Meta
--   retente un webhook si la reponse HTTP n'arrive pas a temps (delai
--   reseau, cold start) - un retry sur le MEME message (meme wamid) avec
--   un code incorrect deciderait attempts_remaining une seconde fois pour
--   une seule frappe reelle de l'utilisateur, consommant une tentative sur
--   seulement 5 disponibles sans raison.
--
--   Le flux commercial existant (wa_conversations) a deja ce probleme
--   resolu via une dedup sur conv.messages (wa-webhook/index.ts:467),
--   mais ce mecanisme ne s'applique pas ici : le chemin d'interception du
--   code est concu pour ne JAMAIS toucher wa_conversations tant que le cas
--   n'est pas ecarte (principe d'isolation deja acte). Il faut donc un
--   mecanisme de dedup independant, dans le perimetre wa_bar_links.
--
-- IMPACT : wa_bar_links reste vide en prod (le flux d'opt-in n'a pas
--   encore ete branche a une Edge Function/UI reelle utilisee par un
--   vrai utilisateur) - cette migration ne modifie aucune donnee. Ajoute
--   une colonne nullable + un parametre supplementaire sur
--   verify_wa_bar_link_code. IMPORTANT : la fonction est explicitement
--   DROP puis recreee (pas un simple CREATE OR REPLACE) - une signature
--   modifiee (2 -> 3 arguments) via CREATE OR REPLACE seul creerait une
--   surcharge au lieu de remplacer la fonction, incident deja vecu sur ce
--   projet (voir DROP explicite ci-dessous, avec reference precise).
--   p_wamid a DEFAULT NULL : tout futur appelant qui omettrait ce
--   parametre garde le comportement d'avant cette migration (pas de
--   dedup possible sans identifiant - voir garde explicite dans le corps
--   de la fonction).
--
-- SOLUTION : colonne wa_bar_links.last_processed_wamid, comparee et mise
--   a jour par verify_wa_bar_link_code() elle-meme, sous le meme
--   SELECT ... FOR UPDATE deja en place (verrouillage de ligne existant,
--   pas de nouveau verrou necessaire). Si p_wamid correspond au dernier
--   wamid deja traite pour cette ligne, la fonction retourne le MEME
--   statut que la premiere fois SANS reappliquer d'effet de bord
--   (decrement de tentative, marquage verified_at, suppression de ligne) -
--   memorise le dernier statut retourne dans une colonne dediee pour
--   pouvoir le rejouer a l'identique en cas de retry.
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

-- --- 1. Colonnes de dedup ---
ALTER TABLE public.wa_bar_links
  ADD COLUMN last_processed_wamid TEXT,
  ADD COLUMN last_processed_status TEXT;

COMMENT ON COLUMN public.wa_bar_links.last_processed_wamid IS
'Identifiant du dernier message WhatsApp (wamid) traite par verify_wa_bar_link_code() pour cette '
'demande en attente. Permet de rejouer le meme statut sans reappliquer d''effet de bord '
'(decrement de tentative, marquage verified_at) si Meta retente le webhook sur le meme message. '
'NULL tant qu''aucune tentative de verification n''a ete faite sur cette demande.';

COMMENT ON COLUMN public.wa_bar_links.last_processed_status IS
'Statut retourne par verify_wa_bar_link_code() lors du dernier traitement de last_processed_wamid '
'- rejoue tel quel en cas de retry Meta sur le meme wamid, jamais recalcule.';

-- CORRECTIF CRITIQUE (trouve en relisant cette migration avant commit,
-- avant meme execution) : CREATE OR REPLACE FUNCTION avec une liste de
-- parametres modifiee (2 -> 3 arguments) NE REMPLACE PAS la fonction
-- existante - il cree une SURCHARGE (overload). Ce projet a deja vecu cet
-- incident exact en production (20260703000000_drop_reject_sale_overload.sql :
-- "Could not choose the best candidate function... reject_sale" - PGRST300,
-- rejet de commande casse en prod, cause racine documentee noir sur blanc :
-- "CREATE OR REPLACE avec une liste d'arguments modifiee ne remplace PAS
-- la fonction — il cree une surcharge. Quand le client omet un parametre
-- optionnel... PostgREST ne peut plus departager les candidates"). Sans ce
-- DROP prealable, cette migration aurait laisse coexister
-- verify_wa_bar_link_code(text,text) ET verify_wa_bar_link_code(text,text,text)
-- - le futur appel de wa-webhook avec p_wamid casserait des le premier
-- retry PostgREST ambigu. DROP explicite de l'ancienne signature a 2
-- arguments avant de creer la nouvelle a 3, dans la meme transaction.
DROP FUNCTION IF EXISTS public.verify_wa_bar_link_code(TEXT, TEXT);

-- =====================================================
-- verify_wa_bar_link_code : ajout du parametre p_wamid (troisieme
-- parametre, avec DEFAULT NULL pour ne jamais casser un appelant existant
-- qui omettrait ce parametre - meme si aucun appelant reel n'existe
-- encore en dehors de wa-webhook, defense par prudence). Si p_wamid est
-- NULL, le comportement est IDENTIQUE a avant cette migration (pas de
-- dedup possible sans identifiant de message) - garde explicite au debut
-- du corps de la fonction.
-- =====================================================

CREATE OR REPLACE FUNCTION public.verify_wa_bar_link_code(p_phone_wa_id TEXT, p_code TEXT, p_wamid TEXT DEFAULT NULL)
RETURNS TABLE (status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_link RECORD;
BEGIN
  -- SELECT INTO sans LIMIT 1 est sur ici car idx_wa_bar_links_one_pending_per_phone
  -- (cree dans 20260822090000) garantit structurellement au plus UNE ligne
  -- verified_at IS NULL par phone_wa_id - si cet index venait a manquer,
  -- ce SELECT prendrait silencieusement la premiere ligne trouvee au lieu
  -- de lever une erreur (comportement standard de SELECT INTO en
  -- PL/pgSQL sur plusieurs lignes).
  SELECT * INTO v_link
  FROM public.wa_bar_links
  WHERE phone_wa_id = p_phone_wa_id AND verified_at IS NULL
  FOR UPDATE;

  -- CORRECTIF CRITIQUE (2e passe de code review multi-angle, 22/08/2026,
  -- bug confirme independamment par plusieurs angles) : le premier
  -- SELECT (verified_at IS NULL) ne retrouve plus la ligne une fois
  -- qu'elle a ete marquee 'verifie' - un retry Meta du meme wamid apres
  -- un succes tombait alors sur NOT FOUND -> 'aucune_demande_en_attente',
  -- ce que wa-webhook traite comme "pas une verification, laisser
  -- continuer vers Claude" - exactement l'inverse de l'objectif de
  -- cette migration. Repli : si la 1ere recherche echoue ET qu'un wamid
  -- est fourni, chercher une ligne (n'importe quel etat de verified_at)
  -- dont le last_processed_wamid correspond deja - c'est alors un pur
  -- retry d'un message deja traite avec succes (ou deja rejete par la
  -- dedup ci-dessous), a rejouer a l'identique.
  IF NOT FOUND THEN
    IF p_wamid IS NOT NULL THEN
      SELECT * INTO v_link
      FROM public.wa_bar_links
      WHERE phone_wa_id = p_phone_wa_id AND last_processed_wamid = p_wamid
      FOR UPDATE;
      IF FOUND THEN
        RETURN QUERY SELECT v_link.last_processed_status;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT 'aucune_demande_en_attente'::TEXT;
    RETURN;
  END IF;

  -- Si ce wamid a deja ete traite pour cette meme ligne (retry Meta sur
  -- le meme message), rejouer le statut deja retourne SANS reappliquer
  -- d'effet de bord (decrement de tentative, marquage verified_at).
  -- p_wamid IS NULL desactive ce filet (aucune dedup possible sans
  -- identifiant) - comportement identique a avant cette migration.
  IF p_wamid IS NOT NULL AND v_link.last_processed_wamid = p_wamid THEN
    RETURN QUERY SELECT v_link.last_processed_status;
    RETURN;
  END IF;

  -- CORRECTIF CRITIQUE (meme passe de code review) : ces 2 branches
  -- faisaient un DELETE de la ligne AVANT d'avoir jamais pu memoriser
  -- last_processed_wamid/last_processed_status - un retry Meta sur ce
  -- meme message tombait alors sur une ligne inexistante (NOT FOUND),
  -- retournait 'aucune_demande_en_attente', et wa-webhook laissait le
  -- message continuer vers Claude au lieu de rejouer le rejet. Fix :
  -- ne plus supprimer la ligne ici - la marquer inerte via
  -- last_processed_wamid/status (verification_code reste NULL apres
  -- expiration naturelle du filtre code_expires_at < now(), donc aucun
  -- code_incorrect ne peut plus se declencher dessus par erreur). Le
  -- nettoyage reel se fait naturellement au prochain request_wa_bar_link
  -- (ON CONFLICT reinitialise toutes les colonnes ephemeres) ou reste
  -- visible pour rejouer un retry tardif - jamais perdu silencieusement.
  IF v_link.code_expires_at < now() THEN
    UPDATE public.wa_bar_links
    SET last_processed_wamid = p_wamid, last_processed_status = 'code_expire'
    WHERE id = v_link.id;
    RETURN QUERY SELECT 'code_expire'::TEXT;
    RETURN;
  END IF;

  IF v_link.attempts_remaining <= 0 THEN
    UPDATE public.wa_bar_links
    SET last_processed_wamid = p_wamid, last_processed_status = 'trop_de_tentatives'
    WHERE id = v_link.id;
    RETURN QUERY SELECT 'trop_de_tentatives'::TEXT;
    RETURN;
  END IF;

  -- p_code normalise (trim + retrait des espaces internes eventuels) avant
  -- comparaison - un code recu en texte libre sur WhatsApp peut arriver
  -- avec un espace de tete/fin (autocorrect, retour a la ligne du client
  -- WhatsApp).
  IF v_link.verification_code != regexp_replace(trim(p_code), '\s+', '', 'g') THEN
    UPDATE public.wa_bar_links
    SET
      attempts_remaining = attempts_remaining - 1,
      last_processed_wamid = p_wamid,
      last_processed_status = 'code_incorrect'
    WHERE id = v_link.id;
    RETURN QUERY SELECT 'code_incorrect'::TEXT;
    RETURN;
  END IF;

  -- Meme logique d'auto-activation que le trigger d'INSERT (20260821100000) :
  -- si aucun autre lien n'est deja actif pour ce numero, celui-ci le
  -- devient. Meme verrou consultatif partage (meme cle, meme convention)
  -- pour se serialiser avec change_active_wa_bar_link et le trigger -
  -- acquis AVANT l'UPDATE qui marque verified_at (pas apres), pour que la
  -- serialisation couvre reellement cette transition d'etat.
  PERFORM pg_advisory_xact_lock(hashtext('wa_bar_links:' || p_phone_wa_id));

  UPDATE public.wa_bar_links
  SET
    verified_at = now(),
    verification_code = NULL,
    code_expires_at = NULL,
    attempts_remaining = NULL,
    last_processed_wamid = p_wamid,
    last_processed_status = 'verifie',
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

COMMENT ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT, TEXT) IS
'Verifie un code de 6 chiffres recu sur WhatsApp contre une demande en attente. Appelee depuis '
'wa-webhook (service_role) uniquement. p_wamid (optionnel, DEFAULT NULL) permet de rejouer le '
'meme statut sans effet de bord si Meta retente le webhook sur le meme message (dedup - '
'20260822090002), y compris pour les issues terminales code_expire/trop_de_tentatives/verifie : '
'la ligne n''est PLUS supprimee sur expiration/epuisement (contrairement a la version '
'precedente - bug corrige, une ligne supprimee ne pouvait jamais rejouer son dernier statut), '
'elle est marquee inerte et reste visible jusqu''a la prochaine demande via request_wa_bar_link '
'(ON CONFLICT reinitialise tout, voir 20260822090003 pour la consequence traitee sur '
'demande_en_attente_autre_bar). Decremente attempts_remaining a chaque echec reel. Succes : '
'marque verified_at, nettoie les colonnes ephemeres, active le lien si aucun autre n''est deja '
'actif pour ce numero.';

-- CORRECTIF (meme relecture que le DROP ci-dessus) : le DROP FUNCTION
-- explicite signifie que cette fonction est un NOUVEL OBJET (nouvel OID),
-- pas un CREATE OR REPLACE sur l'objet existant - contrairement au
-- commentaire initial de cette section ("les privileges devraient
-- survivre"), qui etait FAUX dans ce cas precis. Les privileges de
-- l'ancienne fonction disparaissent avec elle (DROP) - un GRANT explicite
-- est donc necessaire ici, pas optionnel.
REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_wa_bar_link_code(TEXT, TEXT, TEXT) TO service_role;

-- Recharger le cache de schema PostgREST (meme precaution que
-- 20260703000000_drop_reject_sale_overload.sql:87, apres un DROP+CREATE
-- de signature de fonction) - sans ca, PostgREST peut continuer a
-- resoudre les appels contre son cache de schema perime.
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_count_after BIGINT;
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
  v_service_fn BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_bar_links;

  SELECT has_function_privilege('anon', 'public.verify_wa_bar_link_code(text,text,text)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.verify_wa_bar_link_code(text,text,text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('service_role', 'public.verify_wa_bar_link_code(text,text,text)', 'EXECUTE') INTO v_service_fn;

  RAISE NOTICE 'POST-VOL: % lien(s) dans wa_bar_links apres migration (attendu 0).', v_count_after;
  RAISE NOTICE 'verify_wa_bar_link_code -- anon: % (attendu false), authenticated: % (attendu false), service_role: % (attendu true)',
    v_anon_fn, v_auth_fn, v_service_fn;

  IF v_count_after <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lien(s) inattendu(s) - cette migration ne doit rien ecrire.', v_count_after;
  END IF;
  IF v_anon_fn OR v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: verify_wa_bar_link_code accessible par anon ou authenticated.';
  END IF;
  IF NOT v_service_fn THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut plus executer verify_wa_bar_link_code.';
  END IF;

  RAISE NOTICE '✅ verify_wa_bar_link_code dedupe desormais par wamid (p_wamid optionnel, DEFAULT NULL).';
END $$;

COMMIT;
