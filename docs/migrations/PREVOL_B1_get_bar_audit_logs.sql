-- ===================================================================
-- PRE-VOL - Chantier B1 (get_bar_audit_logs)
-- A executer manuellement dans le SQL Editor Supabase AVANT d'ecrire
-- la migration definitive. Objectif : relever l'etat REEL en prod
-- (signatures, gardes, colonnes) plutot que de supposer.
-- ===================================================================

-- 1) Signature et corps exacts de get_user_role (au moins 431 usages,
--    piege connu : LIMIT 1 sans ORDER BY, cf. memoire project_is_super_admin_fragile)
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'get_user_role'
  AND pronamespace = 'public'::regnamespace;

-- 2) Signature et corps exacts de is_super_admin
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'is_super_admin'
  AND pronamespace = 'public'::regnamespace;

-- 3) Signature et corps exacts de get_paginated_audit_logs
--    (modele de reference : pagination, colonnes retournees, filtre)
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'get_paginated_audit_logs'
  AND pronamespace = 'public'::regnamespace;

-- 4) Y a-t-il deja une fonction get_bar_audit_logs (collision de nom) ?
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'get_bar_audit_logs'
  AND pronamespace = 'public'::regnamespace;

-- 5) Colonnes reelles de audit_logs (le plan §2.3 en liste 13, a confirmer)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'audit_logs'
ORDER BY ordinal_position;

-- 6) RLS actif sur audit_logs ? (si une policy existe deja, le SECURITY DEFINER
--    du nouveau RPC doit rester coherent avec elle, pas la dupliquer a contre-sens)
SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.audit_logs'::regclass;

-- 7) Privileges actuels sur get_paginated_audit_logs (pour repliquer le meme
--    schema REVOKE/GRANT sur le nouveau RPC)
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'get_paginated_audit_logs';
