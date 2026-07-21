-- MIGRATION: Suivi du consentement légal (CGU/CGV + Politique de confidentialité)
-- DATE: 2026-07-20
-- AUTHOR: BarTender
--
-- PROBLEM: L'application dispose désormais d'une Politique de confidentialité et de
--          CGU/CGV (POLITIQUE_CONFIDENTIALITE.md, CGU_CGV.md), mais aucune trace du
--          consentement des utilisateurs n'est conservée. Un document juridique n'est
--          opposable que si l'utilisateur l'a explicitement accepté, à une date certaine
--          et pour une version identifiée. Sans horodatage en base, l'acceptation n'a
--          aucune valeur probatoire.
-- IMPACT:  Conformité juridique (Loi béninoise n°2017-20 / RGPD). Tous les utilisateurs.
--          Aucune donnée métier affectée.
-- SOLUTION: 3 colonnes sur users (dates d'acceptation + version acceptée) + une RPC
--           self-service accept_legal_terms() par laquelle un utilisateur enregistre SON
--           PROPRE consentement (jamais celui d'un tiers). Deux points de capture :
--           1. NOUVEAUX comptes : case à cocher à la première connexion (LoginScreen,
--              flux first_login = true).
--           2. Comptes EXISTANTS + futures révisions : modal bloquant (LegalConsentGate
--              dans RootLayout) déclenché quand consent_version < CURRENT_CONSENT_VERSION.
--           Pas de self-service d'inscription dans BarTender (cf. CLAUDE.md) : ces deux
--           chemins couvrent 100% de la population.
--
-- BREAKING_CHANGE: NO (additif — colonnes nullable, RPC nouvelle)
-- TABLES_MODIFIED: users (+3 colonnes)
-- RLS_CHANGES: aucun (la RPC est SECURITY DEFINER, guard auth.uid() = self uniquement)
-- IDEMPOTENT: OUI (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE réexécutables)
-- À EXÉCUTER À LA MAIN dans le SQL Editor Supabase.

-- =====================================================
-- PRÉ-VOL (informatif, à exécuter avant)
-- =====================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users'
--   AND column_name IN ('privacy_accepted_at', 'terms_accepted_at', 'consent_version');
-- -- Attendu : 0 ligne (colonnes n'existent pas encore)
--
-- SELECT proname FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace AND proname = 'accept_legal_terms';
-- -- Attendu : 0 ligne (fonction n'existe pas encore)

BEGIN;

-- =====================================================
-- 1. COLONNES DE CONSENTEMENT SUR users
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.privacy_accepted_at IS
  'Date d''acceptation de la Politique de confidentialité par l''utilisateur (NULL = jamais acceptée).';
COMMENT ON COLUMN public.users.terms_accepted_at IS
  'Date d''acceptation des CGU/CGV par l''utilisateur (NULL = jamais acceptées).';
COMMENT ON COLUMN public.users.consent_version IS
  'Version des documents légaux acceptée (0 = aucun consentement). À incrémenter lors d''une révision substantielle nécessitant un nouvel accord.';

-- =====================================================
-- 2. RPC self-service : accept_legal_terms
-- =====================================================
-- L'utilisateur enregistre SON PROPRE consentement. Le guard auth.uid() empêche
-- d'enregistrer le consentement d'un tiers, même via l'API directe. p_version permet
-- de tracer quelle édition des documents a été acceptée.

DROP FUNCTION IF EXISTS public.accept_legal_terms(INTEGER);

CREATE OR REPLACE FUNCTION public.accept_legal_terms(
    p_version INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_uid UUID;
BEGIN
    -- 🛡️ Un utilisateur ne peut consentir que pour lui-même.
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Access denied: authentication required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.users
    SET privacy_accepted_at = now(),
        terms_accepted_at   = now(),
        consent_version     = GREATEST(consent_version, p_version),
        updated_at          = now()
    WHERE id = v_uid;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_legal_terms(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_terms(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.accept_legal_terms(INTEGER) IS
  'Enregistre le consentement de l''utilisateur courant (auth.uid()) aux CGU/CGV et à la Politique de confidentialité. Guard : self uniquement. Appelée à la première connexion.';

-- =====================================================
-- 3. COMPTES EXISTANTS : PAS D'ACCEPTATION TACITE
-- =====================================================
-- Décision produit : on veut un consentement EXPLICITE de tous les utilisateurs,
-- pas une acceptation tacite. Les comptes existants (first_login déjà à false, donc
-- ne repassant jamais par l'écran de première connexion) sont laissés à
-- consent_version = 0. Le garde-fou applicatif (LegalConsentGate, dans RootLayout)
-- détecte consent_version < CURRENT_CONSENT_VERSION et affiche un modal bloquant au
-- prochain accès, où l'utilisateur coche et enregistre son consentement via
-- accept_legal_terms(). Aucun UPDATE de données ici : le DEFAULT 0 de la colonne
-- suffit à déclencher le garde-fou pour tout le monde.
--
-- Les NOUVEAUX comptes (créés après déploiement) passent par first_login = true et
-- consentent via la case à cocher de LoginScreen — le modal ne s'affiche donc pas
-- deux fois pour eux.

COMMIT;

-- =====================================================
-- POST-VOL (informatif, à exécuter après)
-- =====================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users'
--   AND column_name IN ('privacy_accepted_at', 'terms_accepted_at', 'consent_version');
-- -- Attendu : 3 lignes
--
-- SELECT has_function_privilege('anon', 'public.accept_legal_terms(integer)', 'EXECUTE') AS anon_blocked;
-- -- Attendu : false
--
-- SELECT has_function_privilege('authenticated', 'public.accept_legal_terms(integer)', 'EXECUTE') AS auth_ok;
-- -- Attendu : true
--
-- Smoke-test : le guard auth.uid() bloque le SQL Editor (auth.uid() = NULL) → tester via UI
-- en se connectant avec un compte neuf (première connexion), cocher la case, valider :
-- SELECT id, privacy_accepted_at, terms_accepted_at, consent_version FROM users WHERE id = '<uid>';
-- -- Attendu : les 2 dates renseignées, consent_version = 1.

-- ROLLBACK (si besoin) :
-- DROP FUNCTION IF EXISTS public.accept_legal_terms(INTEGER);
-- ALTER TABLE public.users
--   DROP COLUMN IF EXISTS privacy_accepted_at,
--   DROP COLUMN IF EXISTS terms_accepted_at,
--   DROP COLUMN IF EXISTS consent_version;
