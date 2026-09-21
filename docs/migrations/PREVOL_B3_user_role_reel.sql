-- ===================================================================
-- VERIFICATION - valeurs reelles de audit_logs.user_role en prod
-- Chantier B3, suite au code review du 21/09/2026.
--
-- Enjeu : le filtre de role du journal (BarActivityJournal) est derive de
-- UserRole (6 valeurs). Si la colonne contient d'AUTRES valeurs, les lignes
-- correspondantes s'affichent sans libelle et surtout DISPARAISSENT des
-- que l'utilisateur applique un filtre - y compris le filtre
-- "Co-promoteur" qu'un promoteur utiliserait naturellement.
--
-- Suspicion precise : internal_log_audit_event resout user_role par
-- SELECT role FROM bar_members WHERE user_id = ... AND bar_id = ...,
-- et retombe sur 'system' si aucune ligne (20251220:60-61). Le SuperAdmin
-- n'etant membre d'aucun bar client, ses nominations de co-promoteur
-- seraient donc enregistrees en 'system'.
-- ===================================================================

-- 1) Toutes les valeurs reellement presentes, avec leur volume.
--    ⚠️ Repond a la question "quelles valeurs le filtre doit-il proposer",
--    qui ne se deduit PAS de UserRole.
SELECT user_role, count(*) AS lignes,
       min("timestamp") AS premiere,
       max("timestamp") AS derniere
FROM public.audit_logs
GROUP BY user_role
ORDER BY lignes DESC;

-- 2) Confirmation ciblee : les evenements de gestion de membres
--    (ceux qu'ecrit le chantier A) sortent-ils bien en 'system' ?
SELECT event, user_role, count(*) AS lignes
FROM public.audit_logs
WHERE event IN ('MEMBER_ADDED', 'MEMBER_REMOVED')
GROUP BY event, user_role
ORDER BY event, lignes DESC;

-- 3) Definition reelle en prod de la fonction qui resout user_role
--    (les fichiers de migration ont diverge 7 fois sur ce projet).
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'internal_log_audit_event'
  AND pronamespace = 'public'::regnamespace;
