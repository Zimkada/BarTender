-- ==============================================================================
-- MIGRATION: Sécuriser admin_security_dashboard avec RLS super_admin
-- DATE: 2026-01-07
-- OBJECTIF: Empêcher l'accès non autorisé au dashboard de monitoring sécurité
-- ==============================================================================
--
-- PROBLÈME:
-- La vue admin_security_dashboard expose les violations RLS de TOUS les bars
-- à TOUS les utilisateurs authentifiés. Elle révèle :
-- - Les user_ids qui ont tenté d'accéder à des données non autorisées
-- - Les tables ciblées par les attaques
-- - Les patterns temporels des violations
--
-- IMPACT SÉCURITÉ:
-- - Fuite d'informations de threat intelligence
-- - Cartographie des vulnérabilités de l'application
-- - Violation de confidentialité (user_ids des attaquants exposés)
-- - Un attaquant peut identifier quelles tables sont mal protégées
--
-- SOLUTION:
-- Ajouter un filtre WHERE EXISTS vérifiant que l'utilisateur connecté
-- est super_admin. Seuls les administrateurs système doivent avoir
-- accès aux logs de sécurité globaux.
-- ==============================================================================

BEGIN;

-- Recréer la vue avec restriction super_admin
CREATE OR REPLACE VIEW admin_security_dashboard AS
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  table_name,
  operation,
  COUNT(*) AS violation_count,
  COUNT(DISTINCT user_id) AS unique_users,
  ARRAY_AGG(DISTINCT user_id) AS user_ids
FROM rls_violations_log
WHERE
  created_at > NOW() - INTERVAL '24 hours'
  -- ✅ SÉCURITÉ: Restreindre aux super_admins uniquement
  AND EXISTS (
    SELECT 1
    FROM public.bar_members
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  )
GROUP BY DATE_TRUNC('hour', created_at), table_name, operation
ORDER BY hour DESC, violation_count DESC;

-- Les permissions restent inchangées (mais la vue filtre elle-même)
GRANT SELECT ON admin_security_dashboard TO authenticated;

-- Ajouter un commentaire explicatif
COMMENT ON VIEW admin_security_dashboard IS
'Dashboard de monitoring des violations RLS (super_admin uniquement).
Agrège les tentatives d''accès non autorisé par heure/table/opération.
SÉCURITÉ: Filtre WHERE EXISTS empêche accès non autorisé aux logs de sécurité.
SENSIBLE: Contient user_ids et patterns d''attaque - accès restreint obligatoire.';

COMMIT;

-- ==============================================================================
-- VÉRIFICATION POST-MIGRATION
-- ==============================================================================
/*
-- Test 1: Vérifier qu'un super_admin peut accéder
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-super-admin"}';
SELECT COUNT(*) FROM admin_security_dashboard;
-- Doit retourner les violations des dernières 24h (si existantes)

-- Test 2: Vérifier qu'un utilisateur normal ne peut pas accéder
SET LOCAL "request.jwt.claims" = '{"sub": "uuid-manager"}';
SELECT COUNT(*) FROM admin_security_dashboard;
-- Doit retourner 0

-- Test 3: Vérifier le comportement si aucune violation récente
-- Si aucune violation dans les 24h, tous les utilisateurs (y compris super_admin)
-- verront 0 rows (comportement normal)
*/
