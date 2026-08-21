-- =====================================================
-- PROBLEM : wa_bar_links (migration 20260821090000, deja en prod) permet
--   a un promoteur de lier plusieurs bars au meme numero WhatsApp
--   (UNIQUE(phone_wa_id, bar_id), jamais UNIQUE(phone_wa_id) seul - §4bis).
--   Mais rien ne dit au webhook QUEL bar une conversation entrante vise
--   quand un numero a 2+ liens verifies. L'etude (§8, §9) interdit
--   explicitement un choix silencieux du premier lien trouve - il faut un
--   mecanisme de resolution explicite et deterministe.
--
-- IMPACT : wa_bar_links est deja en prod mais VIDE (aucun code ne
--   l'alimente encore, le flux d'opt-in n'existe pas). Cette migration
--   ajoute une colonne et une contrainte AVANT que la premiere ligne
--   ne soit ecrite - aucune donnee a migrer, aucun risque de regression
--   sur des liens existants (il n'y en a aucun).
--
-- SOLUTION : colonne is_active_link BOOLEAN NOT NULL DEFAULT false sur
--   wa_bar_links, avec un index unique partiel garantissant AU PLUS UN
--   lien actif par phone_wa_id (jamais deux bars actifs simultanement
--   pour le meme numero - la ligne de defense qui empeche tout choix
--   ambigu au niveau webhook). Decision produit (validee) : le PREMIER
--   lien verifie d'un numero devient automatiquement actif (cas mono-bar,
--   le plus frequent, fonctionne sans etape supplementaire) ; tout lien
--   verifie suivant reste inactif jusqu'a un choix explicite du promoteur
--   (bascule = desactiver l'ancien lien actif + activer le nouveau, dans
--   une seule transaction - fonction change_active_wa_bar_link ci-dessous).
--   Nommee is_active_link (et non is_active, deja pris par
--   bar_members.is_active dans une tout autre signification - appartenance
--   au bar, pas selection de bar dans une conversation WhatsApp) pour
--   eviter toute confusion entre les deux concepts.
-- =====================================================

BEGIN;

-- --- Pre-vol : confirmer que la table est encore vide (aucune migration
--     de donnees necessaire, le flux d'opt-in n'existe pas encore) ---
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.wa_bar_links;
  RAISE NOTICE 'PRE-VOL: % lien(s) existant(s) dans wa_bar_links avant migration (attendu 0, table pas encore alimentee).', v_count;
END $$;

-- --- 1. Ajouter la colonne ---
ALTER TABLE public.wa_bar_links
  ADD COLUMN is_active_link BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wa_bar_links.is_active_link IS
'Bar actuellement actif pour ce numero dans le flux conversationnel WhatsApp analyste. '
'Au plus UN lien actif par phone_wa_id (index unique partiel ci-dessous) - jamais deux bars '
'actifs simultanement, pour ne jamais laisser le webhook choisir silencieusement lequel charger. '
'Sans rapport avec bar_members.is_active (appartenance au bar, concept different). '
'Voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §8/§9.';

-- --- 2. Au plus un lien actif par numero ---
CREATE UNIQUE INDEX idx_wa_bar_links_one_active_per_phone
  ON public.wa_bar_links (phone_wa_id)
  WHERE is_active_link = true;

-- =====================================================
-- Fonction de bascule : desactive l'ancien lien actif (s'il existe) et
-- active le nouveau, dans une seule transaction - jamais deux etapes
-- separees qui laisseraient une fenetre sans lien actif ou avec deux
-- liens actifs en cas d'echec partiel.
-- =====================================================

CREATE OR REPLACE FUNCTION public.change_active_wa_bar_link(p_phone_wa_id TEXT, p_bar_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_target_exists BOOLEAN;
BEGIN
  -- Le lien cible doit exister, etre verifie et non revoque - jamais
  -- activer un lien qui n'a pas prouve la possession du numero (§4 point 2)
  -- ni un lien revoque (§8, "un lien revoque est ignore par toute
  -- resolution d'identite").
  SELECT EXISTS (
    SELECT 1 FROM public.wa_bar_links
    WHERE phone_wa_id = p_phone_wa_id
      AND bar_id = p_bar_id
      AND verified_at IS NOT NULL
      AND revoked_at IS NULL
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RETURN false;
  END IF;

  UPDATE public.wa_bar_links
  SET is_active_link = false
  WHERE phone_wa_id = p_phone_wa_id
    AND is_active_link = true
    AND bar_id != p_bar_id;

  UPDATE public.wa_bar_links
  SET is_active_link = true
  WHERE phone_wa_id = p_phone_wa_id
    AND bar_id = p_bar_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.change_active_wa_bar_link(TEXT, UUID) IS
'Bascule le bar actif d''un numero WhatsApp : desactive l''ancien lien actif (s''il existe) et '
'active le nouveau, en une seule transaction. Retourne false si le lien cible n''existe pas, '
'n''est pas verifie, ou est revoque (jamais d''activation sur un lien non prouve). '
'A appeler depuis wa-webhook (service_role) uniquement, en reponse a un choix explicite du '
'promoteur dans la conversation - jamais automatiquement.';

REVOKE ALL ON FUNCTION public.change_active_wa_bar_link(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_active_wa_bar_link(TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.change_active_wa_bar_link(TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.change_active_wa_bar_link(TEXT, UUID) TO service_role;

-- --- Mise a jour de resolve_wa_bar_link : ne renvoie QUE le lien actif ---
-- Avant cette migration, resolve_wa_bar_link(phone) pouvait renvoyer
-- plusieurs lignes pour un numero multi-bar (une par lien verifie) -
-- sans is_active_link, aucune base pour choisir laquelle utiliser. Cette
-- nouvelle version filtre sur is_active_link = true : au plus une ligne
-- renvoyee, jamais un choix ambigu laisse au code appelant.
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
    AND bm.is_active = true;
END;
$$;

COMMENT ON FUNCTION public.resolve_wa_bar_link(TEXT) IS
'Point d''entree UNIQUE pour resoudre un numero WhatsApp en (bar_id, role) - ne renvoie QUE le '
'lien actif (is_active_link = true), au plus une ligne par numero, jamais un choix ambigu entre '
'plusieurs bars lies. Revalide bar_members.is_active a chaque appel (pas seulement a la creation '
'du lien). A appeler depuis wa-webhook (service_role) uniquement - jamais exposee a '
'authenticated/anon : le numero WhatsApp n''est pas une preuve d''identite verifiable par RLS classique.';

-- Pas de nouveau GRANT/REVOKE ici : ceux poses par la migration
-- precedente (20260821090000) devraient survivre a ce CREATE OR REPLACE
-- (meme signature, Postgres conserve les privileges existants dans ce cas).
-- Neanmoins re-verifies explicitement au post-vol ci-dessous, jamais
-- supposes - lecon deja tiree sur ce projet (voir
-- project_rpc_security_hardening : CREATE OR REPLACE peut, selon les cas,
-- perdre des grants ; toujours re-REVOKE/GRANT ou au minimum re-verifier
-- au post-vol, jamais faire confiance a la persistance implicite).

-- --- Post-vol ---
DO $$
DECLARE
  v_count_after BIGINT;
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
  v_service_fn_resolve BOOLEAN;
  v_anon_fn_change BOOLEAN;
  v_auth_fn_change BOOLEAN;
  v_service_fn_change BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_count_after FROM public.wa_bar_links;

  SELECT has_function_privilege('anon', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('service_role', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_service_fn_resolve;

  SELECT has_function_privilege('anon', 'public.change_active_wa_bar_link(text,uuid)', 'EXECUTE') INTO v_anon_fn_change;
  SELECT has_function_privilege('authenticated', 'public.change_active_wa_bar_link(text,uuid)', 'EXECUTE') INTO v_auth_fn_change;
  SELECT has_function_privilege('service_role', 'public.change_active_wa_bar_link(text,uuid)', 'EXECUTE') INTO v_service_fn_change;

  RAISE NOTICE 'POST-VOL: % lien(s) dans wa_bar_links apres migration (attendu 0, aucune donnee ecrite par cette migration).', v_count_after;
  RAISE NOTICE 'resolve_wa_bar_link -- anon: % (attendu false), authenticated: % (attendu false), service_role: % (attendu true)',
    v_anon_fn, v_auth_fn, v_service_fn_resolve;
  RAISE NOTICE 'change_active_wa_bar_link -- anon: % (attendu false), authenticated: % (attendu false), service_role: % (attendu true)',
    v_anon_fn_change, v_auth_fn_change, v_service_fn_change;

  IF v_count_after <> 0 THEN
    RAISE EXCEPTION 'ECHEC: % lien(s) inattendu(s) dans wa_bar_links - cette migration ne doit rien y ecrire.', v_count_after;
  END IF;
  IF v_anon_fn OR v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: resolve_wa_bar_link accessible par anon ou authenticated apres le CREATE OR REPLACE - doit rester service_role uniquement.';
  END IF;
  IF NOT v_service_fn_resolve THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut plus executer resolve_wa_bar_link apres le CREATE OR REPLACE.';
  END IF;
  IF v_anon_fn_change OR v_auth_fn_change THEN
    RAISE EXCEPTION 'ECHEC: change_active_wa_bar_link accessible par anon ou authenticated - doit rester service_role uniquement.';
  END IF;
  IF NOT v_service_fn_change THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut pas executer change_active_wa_bar_link.';
  END IF;

  RAISE NOTICE '✅ is_active_link + change_active_wa_bar_link + resolve_wa_bar_link filtree : conformes.';
END $$;

COMMIT;
