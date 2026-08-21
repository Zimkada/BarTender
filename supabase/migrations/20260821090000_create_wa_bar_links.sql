-- =====================================================
-- PROBLEM : l'agent WhatsApp analyste (chantier futur, voir
--   whatsapp-agent/ETUDE_AGENT_ANALYSTE.md) doit relier un numero
--   WhatsApp entrant a un bar_id de facon infaillible avant de pouvoir
--   exposer des tools de donnees reelles (§4 de l'etude). Rien n'existe
--   aujourd'hui pour ca : users.phone n'a aucune contrainte UNIQUE (voir
--   §2.1) et ne doit jamais servir d'identifiant d'autorisation.
--
-- IMPACT : aucune ligne de code d'agent n'existe encore. Cette migration
--   pose UNIQUEMENT le schema du lien (Option A du §4, opt-in explicite).
--   Aucun webhook, aucun tool, aucune Edge Function ne lit ou n'ecrit
--   cette table pour l'instant - la table est prete a etre utilisee des
--   que le flux d'opt-in cote app (a construire) l'alimentera. Cette
--   table N'A PAS de RLS "authenticated peut lire son propre lien" pour
--   l'instant : elle n'est ecrite/lue que par du code serveur authentifie
--   (jamais par le webhook lui-meme sur simple declaration, §4 point 4).
--
-- SOLUTION : table wa_bar_links(phone_wa_id, user_id, bar_id, role_snapshot),
--   UNIQUE(phone_wa_id, bar_id) - jamais UNIQUE sur phone_wa_id seul, pour
--   permettre un promoteur multi-bar (voir §4bis, correction du 19/08/2026
--   suite a une revue externe qui avait trouve une contradiction bloquante
--   sur ce point precis dans une version anterieure de l'etude).
-- =====================================================

BEGIN;

CREATE TABLE public.wa_bar_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Numero WhatsApp au format Meta (ex: "22955282525", sans "+", confirme
  -- en production sur wa-webhook - voir §2.1 de l'etude). Pas de contrainte
  -- de format ici : la normalisation est la responsabilite du code qui
  -- ecrit cette table (flux d'opt-in), pas de la base.
  phone_wa_id TEXT NOT NULL,

  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bar_id UUID NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,

  -- Photo du role au moment de la creation du lien, pour audit uniquement.
  -- Le controle d'acces reel au moment de chaque message doit TOUJOURS
  -- revalider bar_members.is_active + role en direct (voir §8 : "que se
  -- passe-t-il si le lien est revoque ?" - jamais se fier a ce role figé).
  role_snapshot TEXT NOT NULL CHECK (role_snapshot IN ('promoteur', 'gerant', 'serveur')),

  -- Preuve de possession du numero (§4 point 2) : le code de verification
  -- envoye sur WhatsApp et confirme avant que ce lien ne devienne actif.
  verified_at TIMESTAMPTZ,

  -- Cree par qui (toujours une session auth.uid() reelle, jamais le
  -- webhook - §4 point 4 : "chaque ecriture de ce lien passe par une
  -- vraie session, c'est l'app, pas le bot, qui grave le lien").
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Revocation explicite (depart d'un employe, changement de numero) sans
  -- perdre l'historique du lien. Un lien revoque est ignore par toute
  -- resolution d'identite - voir la fonction resolve_wa_bar_link ci-dessous.
  revoked_at TIMESTAMPTZ,

  -- §4bis : jamais UNIQUE(phone_wa_id) seul - un promoteur peut lier
  -- plusieurs bars au meme numero.
  UNIQUE(phone_wa_id, bar_id)
);

COMMENT ON TABLE public.wa_bar_links IS
'Lien numero WhatsApp -> bar pour l''agent analyste (chantier futur, non implemente). '
'Ecrit uniquement par du code serveur avec une vraie session auth.uid() - jamais par le webhook wa-webhook lui-meme. '
'Voir whatsapp-agent/ETUDE_AGENT_ANALYSTE.md §4/§4bis.';

CREATE INDEX idx_wa_bar_links_phone ON public.wa_bar_links (phone_wa_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_wa_bar_links_user ON public.wa_bar_links (user_id);
CREATE INDEX idx_wa_bar_links_bar ON public.wa_bar_links (bar_id);

-- RLS activee mais sans policy pour authenticated/anon pour l'instant :
-- table accessible uniquement via service_role (Edge Functions serveur),
-- qui a BYPASSRLS sur Supabase (confirme par 20260518000001_fix_refresh_log_select_policy.sql,
-- meme mecanisme deja documente sur ce projet) - donc RLS activee sans
-- policy ne bloque PAS service_role. Attention : le meme fichier documente
-- que 'postgres' (role du SQL Editor manuel) n'a PAS forcement BYPASSRLS -
-- une requete SELECT manuelle sur wa_bar_links depuis le SQL Editor peut
-- donc retourner 0 ligne meme quand des lignes existent, si jamais executee
-- sous un role sans BYPASSRLS. A garder en tete pour le debug manuel futur.
-- Revoir cette posture au moment d'ecrire le flux d'opt-in cote app (etape 1
-- du sequencement, §10) : il faudra alors une policy authenticated permettant
-- a un utilisateur de lire/creer SES PROPRES liens (user_id = auth.uid()),
-- jamais ceux des autres.
ALTER TABLE public.wa_bar_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_bar_links FROM PUBLIC;
REVOKE ALL ON public.wa_bar_links FROM anon;
REVOKE ALL ON public.wa_bar_links FROM authenticated;
GRANT ALL ON public.wa_bar_links TO service_role;

-- =====================================================
-- Fonction de resolution d'identite : point d'entree UNIQUE utilise par
-- le futur webhook pour resoudre (numero -> bar_id autorise). Centralise
-- ici la revalidation de bar_members.is_active a CHAQUE appel (§8, "un
-- lien ne doit jamais etre traite comme une autorisation permanente").
-- SECURITY DEFINER + search_path fixe : convention du projet pour toute
-- fonction accedant a plusieurs tables sous un role qui n'est pas
-- forcement authenticated (ici service_role uniquement, cf REVOKE ci-dessous).
-- =====================================================

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
    AND bm.is_active = true;
END;
$$;

COMMENT ON FUNCTION public.resolve_wa_bar_link(TEXT) IS
'Point d''entree UNIQUE pour resoudre un numero WhatsApp en (bar_id, role), avec revalidation '
'bar_members.is_active a chaque appel (pas seulement a la creation du lien). '
'A appeler depuis wa-webhook (service_role) uniquement - jamais exposee a authenticated/anon : '
'le numero WhatsApp n''est pas une preuve d''identite verifiable par RLS classique.';

REVOKE ALL ON FUNCTION public.resolve_wa_bar_link(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_wa_bar_link(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_wa_bar_link(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_wa_bar_link(TEXT) TO service_role;

-- =====================================================
-- Post-vol : verification des privileges attendus.
-- =====================================================

DO $$
DECLARE
  v_anon_table BOOLEAN;
  v_auth_table BOOLEAN;
  v_service_table BOOLEAN;
  v_anon_fn BOOLEAN;
  v_auth_fn BOOLEAN;
  v_service_fn BOOLEAN;
BEGIN
  SELECT has_table_privilege('anon', 'public.wa_bar_links', 'SELECT') INTO v_anon_table;
  SELECT has_table_privilege('authenticated', 'public.wa_bar_links', 'SELECT') INTO v_auth_table;
  SELECT has_table_privilege('service_role', 'public.wa_bar_links', 'SELECT') INTO v_service_table;

  SELECT has_function_privilege('anon', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_anon_fn;
  SELECT has_function_privilege('authenticated', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_auth_fn;
  SELECT has_function_privilege('service_role', 'public.resolve_wa_bar_link(text)', 'EXECUTE') INTO v_service_fn;

  RAISE NOTICE 'wa_bar_links -- anon SELECT: % (attendu false), authenticated SELECT: % (attendu false), service_role SELECT: % (attendu true)',
    v_anon_table, v_auth_table, v_service_table;
  RAISE NOTICE 'resolve_wa_bar_link -- anon EXECUTE: % (attendu false), authenticated EXECUTE: % (attendu false), service_role EXECUTE: % (attendu true)',
    v_anon_fn, v_auth_fn, v_service_fn;

  IF v_anon_table OR v_auth_table THEN
    RAISE EXCEPTION 'ECHEC: wa_bar_links accessible par anon ou authenticated - doit rester service_role uniquement.';
  END IF;
  IF NOT v_service_table THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut pas lire wa_bar_links.';
  END IF;
  IF v_anon_fn OR v_auth_fn THEN
    RAISE EXCEPTION 'ECHEC: resolve_wa_bar_link executable par anon ou authenticated - doit rester service_role uniquement.';
  END IF;
  IF NOT v_service_fn THEN
    RAISE EXCEPTION 'ECHEC: service_role ne peut pas executer resolve_wa_bar_link.';
  END IF;

  RAISE NOTICE '✅ wa_bar_links + resolve_wa_bar_link : privileges conformes (service_role uniquement).';
END $$;

COMMIT;
