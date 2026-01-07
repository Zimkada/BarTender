-- ==============================================================================
-- MIGRATION: Sécuriser admin_bars_list avec RLS super_admin
-- DATE: 2026-01-07
-- OBJECTIF: Empêcher l'accès non autorisé à la liste complète des bars
-- ==============================================================================
--
-- PROBLÈME:
-- La vue admin_bars_list est accessible à tous les utilisateurs authentifiés
-- sans filtre RLS, permettant à n'importe qui de voir tous les bars (noms,
-- adresses, téléphones des propriétaires) via un appel API direct.
--
-- IMPACT SÉCURITÉ:
-- - Fuite de données métier (liste des bars concurrents)
-- - Violation RGPD (owner_phone, owner_name exposés)
-- - Contournement du check frontend role === 'super_admin'
--
-- SOLUTION:
-- Ajouter un filtre WHERE EXISTS vérifiant que l'utilisateur connecté
-- est super_admin. Le code frontend vérifie déjà ce rôle, donc aucun
-- impact sur le fonctionnement normal. Le fallback getAllBarsLegacy()
-- reste fonctionnel.
-- ==============================================================================

BEGIN;

-- Recréer la vue avec restriction super_admin
CREATE OR REPLACE VIEW public.admin_bars_list AS
SELECT
  b.id,
  b.name,
  b.address,
  b.phone,
  b.owner_id,
  b.is_active,
  b.created_at,
  b.closing_hour,
  b.settings,
  -- Owner information (aggregated since owner_id is unique)
  MAX(u.name) AS owner_name,
  MAX(u.phone) AS owner_phone,
  -- Active member count
  COUNT(DISTINCT bm.user_id) FILTER (WHERE bm.is_active = true) AS member_count
FROM
  public.bars b
  LEFT JOIN public.users u ON u.id = b.owner_id
  LEFT JOIN public.bar_members bm ON bm.bar_id = b.id
WHERE
  b.is_active = true
  -- ✅ SÉCURITÉ: Restreindre aux super_admins uniquement
  AND EXISTS (
    SELECT 1
    FROM public.bar_members
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  )
GROUP BY
  b.id;

-- Les permissions restent inchangées
GRANT SELECT ON public.admin_bars_list TO authenticated;

-- Ajouter un commentaire explicatif
COMMENT ON VIEW public.admin_bars_list IS
'Vue sécurisée pour admin bars listing (super_admin uniquement).
Combines bars + owners + member count.
Remplace N+1 queries dans BarsService.getAllBars().
SÉCURITÉ: Filtre WHERE EXISTS empêche accès non autorisé via API directe.';

COMMIT;

-- ==============================================================================
-- VÉRIFICATION POST-MIGRATION
-- ==============================================================================
/*
-- Test 1: Vérifier qu'un super_admin peut accéder (remplacer UUID par un vrai)
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-super-admin"}';
SELECT COUNT(*) FROM admin_bars_list;
-- Doit retourner le nombre total de bars

-- Test 2: Vérifier qu'un utilisateur normal ne peut pas accéder
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-manager"}';
SELECT COUNT(*) FROM admin_bars_list;
-- Doit retourner 0

-- Test 3: Vérifier que le fallback frontend fonctionne
-- Si la vue retourne 0 rows et error.code !== '42P01',
-- BarsService.getAllBarsLegacy() sera appelé automatiquement
*/
