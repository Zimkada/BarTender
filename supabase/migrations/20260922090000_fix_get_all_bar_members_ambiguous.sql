-- ===================================================================
-- MIGRATION: corriger l'ambiguite de colonnes dans get_all_bar_members
-- DATE: 2026-09-22
-- AUTHOR: AI Assistant
-- ===================================================================

-- PROBLEME - constate en usage reel le 22/09/2026 : la page Gestion des bars
--   affiche "0 membre" sur toutes les cartes, et le panneau co-promoteur
--   annonce "aucun gerant actif" sur TOUS les bars - alors que la base
--   contient 11 gerants actifs repartis sur 11 bars.
--
--   L'appel REST retourne 400 :
--     column reference "user_id" is ambiguous
--
--   Cause : le garde super_admin ajoute par 20260227100000 (FIX 6) ecrit
--
--     SELECT 1 FROM bar_members
--     WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = TRUE
--
--   sans qualifier les colonnes. Or cette fonction est un RETURNS TABLE dont
--   la liste de sortie declare justement `user_id`, `role` et `is_active`.
--   PostgreSQL ne peut pas trancher entre la colonne de bar_members et le
--   parametre de sortie homonyme, et leve l'erreur A L'EXECUTION - pas a la
--   creation, ce qui explique que la migration de fevrier soit passee sans
--   rien signaler.
--
--   ⚠️ Le garde lui-meme est CORRECT sur le fond (EXISTS, filtre is_active).
--   Seule sa redaction est fautive. On ne touche ni a sa logique, ni au
--   reste du corps de la fonction.

-- IMPACT : la fonction etait TOTALEMENT inutilisable depuis le 27/02/2026.
--   Aucune donnee corrompue - elle echouait avant toute lecture.

-- BREAKING_CHANGE: NO - restaure un comportement casse, n'en change aucun.

-- ROLLBACK_STRATEGY: reappliquer 20260227100000 (FIX 6) tel quel, ce qui
--   readmettrait le bug. Aucune donnee a restaurer.

-- TABLES_MODIFIED: aucune · FUNCTIONS_MODIFIED: get_all_bar_members
-- RLS_CHANGES: aucune

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PRE-VOL                                                          │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Confirmer que la definition en prod porte bien le garde non qualifie :
--
-- SELECT pg_get_functiondef(oid) FROM pg_proc
-- WHERE proname = 'get_all_bar_members' AND pronamespace = 'public'::regnamespace;
-- -- Attendu : "WHERE user_id = auth.uid()" SANS prefixe de table.
--
-- 2) Relever les privileges AVANT (CREATE OR REPLACE les perd) :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public' AND routine_name = 'get_all_bar_members';
-- -- Attendu : authenticated + service_role (poses par 20260110000001).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ MIGRATION                                                        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION get_all_bar_members()
RETURNS TABLE (
  id             UUID,
  user_id        UUID,
  bar_id         UUID,
  role           TEXT,
  assigned_by    UUID,
  joined_at      TIMESTAMPTZ,
  is_active      BOOLEAN,
  user_id_inner  UUID,
  username       TEXT,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  avatar_url     TEXT,
  user_is_active BOOLEAN,
  first_login    BOOLEAN,
  created_at     TIMESTAMPTZ,
  last_login_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard : reserve aux super_admin uniquement.
  -- ⭐ Colonnes QUALIFIEES par l'alias `guard` : sans lui, user_id / role /
  --    is_active sont ambigus face aux colonnes de sortie homonymes du
  --    RETURNS TABLE ci-dessus, et la fonction echoue a l'execution.
  IF NOT EXISTS (
    SELECT 1 FROM bar_members guard
    WHERE guard.user_id = auth.uid()
      AND guard.role = 'super_admin'
      AND guard.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Permission refusée: Super Admin requis pour accéder à l''annuaire global';
  END IF;

  RETURN QUERY
  SELECT
    bm.id,
    bm.user_id,
    bm.bar_id,
    bm.role,
    bm.assigned_by,
    bm.joined_at,
    bm.is_active,
    u.id,
    u.username,
    u.name,
    u.phone,
    u.email,
    u.avatar_url,
    u.is_active,
    u.first_login,
    u.created_at,
    u.last_login_at
  FROM bar_members bm
  JOIN users u ON bm.user_id = u.id;
END;
$$;

-- CREATE OR REPLACE perd les GRANTs - toujours les reposer explicitement
-- (lecon vagues 1-4, project_rpc_security_hardening).
REVOKE ALL ON FUNCTION get_all_bar_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_all_bar_members() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_bar_members() TO service_role;

-- Le COMMENT survit au CREATE OR REPLACE, mais il decrivait un garde dont la
-- redaction vient de changer : on le remet a jour plutot que de laisser une
-- documentation qui ne correspond plus au corps.
COMMENT ON FUNCTION get_all_bar_members IS
  'Annuaire global tous bars. Réservé super_admin (guard interne auth.uid()). '
  'GRANT authenticated conservé pour compat PostgREST, guard SQL bloque les non-super_admin. '
  'FIX 22/09/2026 : colonnes du guard qualifiées (alias `guard`) — sans cela user_id/role/'
  'is_active étaient ambigus face aux colonnes homonymes du RETURNS TABLE, et la fonction '
  'échouait à l''exécution depuis le 27/02/2026.';

-- ⚠️ INDISPENSABLE : PostgREST met le schema en cache et continuerait a servir
-- l'ancienne definition sans ce signal. La migration de fevrier le faisait
-- aussi (20260227100000:345) - l'omettre laisserait le bug visible cote API
-- alors qu'il est corrige en base.
NOTIFY pgrst, 'reload schema';

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ POST-VOL                                                         │
-- └─────────────────────────────────────────────────────────────────┘
--
-- 1) Privileges reposes :
--
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public' AND routine_name = 'get_all_bar_members';
-- -- Attendu : authenticated + service_role. PAS anon, PAS PUBLIC.
--
-- 2) Le garde fonctionne toujours (SQL Editor => auth.uid() NULL => refus) :
--
-- SELECT * FROM get_all_bar_members() LIMIT 1;
-- -- Attendu : ERROR 'Permission refusée: Super Admin requis...'
-- -- ⛔ SURTOUT PAS 'column reference "user_id" is ambiguous' : ce message
-- --    signifierait que l'ambiguite subsiste.
--
-- 3) Test fonctionnel DEPUIS L'APPLICATION (le SQL Editor n'a pas de session
--    utilisateur) : connecte en SuperAdmin, la page Gestion des bars doit
--    afficher le vrai nombre de membres sur chaque carte, et le panneau
--    Co-promoteurs doit lister les gerants actifs du bar.
