-- =====================================================
-- FIX — get_bar_members : REVOKE PUBLIC (oubli de la Vague 1)
-- =====================================================
-- Date : 2026-06-24
--
-- Constat (audit de cohérence post-incident get_bar_products) :
--   get_bar_members a bien reçu son guard membre/owner en Vague 1 (corps vérifié en
--   prod : branche impersonation retirée, RAISE Unauthorized si ni membre ni owner).
--   MAIS elle est restée exécutable par anon (anon_peut = true) : la Vague 1 faisait
--   seulement GRANT TO authenticated, sans REVOKE FROM PUBLIC. EXECUTE est accordé à
--   PUBLIC par défaut à la création → anon en hérite (leçon apprise après, sur les
--   audit logs).
--
-- Impact réel limité : un appel anon passe la permission PUBLIC mais est bloqué par le
--   guard interne (auth.uid() NULL → RAISE Unauthorized). Pas de fuite de données
--   effective, mais surface inutile à fermer (défense en profondeur + cohérence).
--
-- Correctif minimal : REVOKE seulement. Le corps est déjà correct, on ne le recrée pas.
-- =====================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_bar_members(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bar_members(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_bar_members(uuid, uuid) TO authenticated;

COMMIT;
