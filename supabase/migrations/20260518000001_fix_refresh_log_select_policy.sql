-- Migration: Corriger la policy SELECT de materialized_view_refresh_log
--
-- Contexte : la table materialized_view_refresh_log a une seule policy SELECT
-- réservée aux super_admin (auth.uid() doit être super_admin). Mais la fonction
-- refresh_all_materialized_views() — bien que SECURITY DEFINER — utilise un
-- SELECT pour récupérer le status après chaque refresh :
--
--   SELECT status INTO v_actual_status
--   FROM materialized_view_refresh_log
--   WHERE id = v_log_id;
--
-- Quand cette fonction est appelée depuis SQL Editor (rôle 'postgres' sans
-- BYPASSRLS dans Supabase) ou depuis l'app par un non-super_admin, auth.uid()
-- ne matche pas la policy → SELECT retourne 0 ligne → COALESCE(v_actual_status,
-- 'failed') → la fonction renvoie 'failed' à tort alors que le refresh a
-- réellement réussi (l'INSERT et l'UPDATE eux passent grâce aux policies INSERT/
-- UPDATE qui ont qual=null/true).
--
-- pg_cron, lui, tourne sous supabase_admin qui a BYPASSRLS → fonctionne en
-- production. Le bug n'apparaît qu'en debug manuel ou si la fonction est
-- appelée depuis l'app.
--
-- Solution : ajouter une policy SELECT qui autorise toute fonction interne à
-- relire les entrées récentes du log (1 heure). C'est cohérent avec :
--   1. Les policies INSERT/UPDATE qui sont déjà ouvertes à 'public'
--   2. L'usage : on lit le log juste après l'INSERT, donc 1h suffit largement
--   3. Sécurité : la fenêtre limitée évite qu'un user lambda lise l'historique
--      complet (réservé aux super_admin via la policy existante)

-- Policy permettant aux fonctions internes (et à tout caller authentifié) de
-- relire les entrées du log dans la dernière heure
CREATE POLICY "Allow function callers to read recent refresh logs"
ON public.materialized_view_refresh_log
FOR SELECT
TO public
USING (refresh_started_at > NOW() - INTERVAL '1 hour');

COMMENT ON POLICY "Allow function callers to read recent refresh logs"
ON public.materialized_view_refresh_log IS
'Permet aux fonctions SECURITY DEFINER (refresh_all_materialized_views, etc.)
de relire les entrées récentes du log pour récupérer le status après INSERT.
Sans cette policy, ces fonctions retournent à tort ''failed'' quand appelées
depuis un contexte non-super_admin (SQL Editor, app utilisateur). La fenêtre
1h limite l''exposition de l''historique complet, réservé aux super_admins.';
