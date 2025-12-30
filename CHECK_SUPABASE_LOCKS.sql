-- Script à exécuter dans Supabase SQL Editor
-- Pour identifier les transactions bloquées et les tuer

-- 1. Voir toutes les requêtes actives qui prennent > 5 secondes
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - pg_stat_activity.query_start > interval '5 seconds'
ORDER BY duration DESC;

-- 2. Voir les verrous actifs (locks)
SELECT
  l.pid,
  l.mode,
  l.granted,
  a.query,
  now() - a.query_start AS duration
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted
ORDER BY duration DESC;

-- 3. Tuer une transaction bloquée (remplacer <PID> par le numéro trouvé)
-- SELECT pg_terminate_backend(<PID>);

-- 4. Vérifier les connexions actives
SELECT
  count(*) as connections,
  state
FROM pg_stat_activity
GROUP BY state;

-- 5. Voir spécifiquement les requêtes sur bar_products
SELECT
  pid,
  state,
  now() - query_start AS duration,
  query
FROM pg_stat_activity
WHERE query LIKE '%bar_products%'
  AND state != 'idle';
