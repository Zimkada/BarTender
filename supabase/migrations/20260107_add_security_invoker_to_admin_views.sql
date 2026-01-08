-- ==============================================================================
-- MIGRATION: Ajouter security_invoker à admin_bars_list et admin_security_dashboard
-- DATE: 2026-01-07
-- OBJECTIF: Résoudre les alertes Supabase restantes
-- ==============================================================================
--
-- PROBLÈME:
-- Les vues admin_bars_list et admin_security_dashboard ont les bons filtres
-- mais n'ont pas security_invoker = true, ce qui déclenche les alertes Supabase.
--
-- SOLUTION:
-- Ajouter WITH (security_invoker = true) à ces 2 vues.
-- ==============================================================================

BEGIN;

-- 1. admin_bars_list
DROP VIEW IF EXISTS admin_bars_list CASCADE;
CREATE VIEW admin_bars_list
WITH (security_invoker = true)
AS
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
  MAX(u.name) AS owner_name,
  MAX(u.phone) AS owner_phone,
  COUNT(DISTINCT bm.user_id) FILTER (WHERE bm.is_active = true) AS member_count
FROM
  public.bars b
  LEFT JOIN public.users u ON u.id = b.owner_id
  LEFT JOIN public.bar_members bm ON bm.bar_id = b.id
WHERE
  b.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.bar_members
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  )
GROUP BY
  b.id;

GRANT SELECT ON public.admin_bars_list TO authenticated;

COMMENT ON VIEW public.admin_bars_list IS
'Vue sécurisée avec security_invoker=true pour admin bars listing (super_admin uniquement).
Combine bars + owners + member count.
SÉCURITÉ: RLS automatique + filtre manuel super_admin pour défense en profondeur.';

-- 2. admin_security_dashboard
DROP VIEW IF EXISTS admin_security_dashboard CASCADE;
CREATE VIEW admin_security_dashboard
WITH (security_invoker = true)
AS
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
  AND EXISTS (
    SELECT 1
    FROM public.bar_members
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  )
GROUP BY DATE_TRUNC('hour', created_at), table_name, operation
ORDER BY hour DESC, violation_count DESC;

GRANT SELECT ON admin_security_dashboard TO authenticated;

COMMENT ON VIEW admin_security_dashboard IS
'Dashboard de monitoring des violations RLS (super_admin uniquement) avec security_invoker=true.
Agrège les tentatives d''accès non autorisé par heure/table/opération.
SÉCURITÉ: RLS automatique + filtre manuel super_admin pour défense en profondeur.
SENSIBLE: Contient user_ids et patterns d''attaque - accès restreint obligatoire.';

COMMIT;

-- ==============================================================================
-- VÉRIFICATION POST-MIGRATION
-- ==============================================================================
/*
-- Vérifier que les vues ont bien security_invoker = true
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('admin_bars_list', 'admin_security_dashboard')
ORDER BY viewname;
*/
