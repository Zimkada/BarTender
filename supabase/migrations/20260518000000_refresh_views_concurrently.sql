-- Migration: REFRESH MATERIALIZED VIEW CONCURRENTLY pour éviter les locks exclusifs
--
-- Contexte : sur plan Supabase Pro, le job pg_cron refresh-materialized-views-hc
-- s'exécutait toutes les 5 min. Le REFRESH MATERIALIZED VIEW (sans CONCURRENTLY)
-- pose un AccessExclusiveLock sur chaque vue pendant ~1.5s, bloquant toutes les
-- requêtes utilisateur qui les lisent. Sous charge, les connexions s'accumulent
-- dans le pool Supavisor → saturation → PGRST003 "Timed out acquiring connection".
--
-- Incident observé : 18 mai 2026, ~21h16, login impossible pendant ~30 min,
-- résolu par restart du projet Supabase.
--
-- Solution : REFRESH CONCURRENTLY → pas de lock exclusif, les utilisateurs
-- continuent de lire pendant le refresh. Nécessite un index UNIQUE sur chaque
-- vue (déjà vérifié : les 6 vues refresh ont toutes un index unique).
--
-- Coût : REFRESH CONCURRENTLY est plus coûteux en CPU (compare le snapshot
-- ancien et le nouveau pour faire un diff), mais ce coût est largement compensé
-- par l'absence de blocage utilisateur.
--
-- Après cette migration, on pourra repasser le cron à */5 ou plus fréquent
-- sans risque de saturation du pool.

CREATE OR REPLACE FUNCTION public.refresh_materialized_view_with_logging(
  p_view_name TEXT,
  p_triggered_by TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_row_count INTEGER;
  v_view_name_mat TEXT;
BEGIN
  -- Guard 1 : rejeter les valeurs nulles/vides
  IF p_view_name IS NULL OR trim(p_view_name) = '' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: p_view_name ne peut pas être null ou vide';
  END IF;

  -- Guard 2 : rejeter les noms déjà suffixés en _mat pour éviter le double _mat_mat
  IF right(p_view_name, 4) = '_mat' THEN
    RAISE EXCEPTION
      'refresh_materialized_view_with_logging: passer le nom de base sans suffixe _mat (reçu: %)',
      p_view_name;
  END IF;

  v_view_name_mat := p_view_name || '_mat';

  -- 'running' : aligné avec CHECK ('running','success','failed','timeout') de 20251227221000
  INSERT INTO materialized_view_refresh_log (view_name, status, triggered_by)
  VALUES (p_view_name, 'running', p_triggered_by)
  RETURNING id INTO v_log_id;

  v_start_time := clock_timestamp();

  BEGIN
    -- CONCURRENTLY : pas de lock exclusif sur la vue pendant le refresh.
    -- Les requêtes utilisateurs continuent de lire la version actuelle pendant
    -- que la nouvelle version est construite en parallèle, puis swap atomique.
    -- Requiert un index UNIQUE sur chaque vue (vérifié pour les 6 vues
    -- rafraîchies par refresh_all_materialized_views).
    --
    -- Fallback : si CONCURRENTLY échoue (vue sans index unique, autre erreur),
    -- on retombe sur REFRESH classique pour préserver la fonctionnalité.
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', v_view_name_mat);
    EXCEPTION
      WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
        -- Fallback : la vue n'a pas d'index unique → REFRESH classique
        RAISE NOTICE '[%] CONCURRENTLY non supporté, fallback REFRESH classique', p_view_name;
        EXECUTE format('REFRESH MATERIALIZED VIEW %I', v_view_name_mat);
    END;

    v_end_time := clock_timestamp();
    v_duration_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
    EXECUTE format('SELECT COUNT(*) FROM %I', v_view_name_mat) INTO v_row_count;

    -- 'success' : aligné avec la contrainte
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = v_end_time,
      duration_ms          = v_duration_ms,
      row_count            = v_row_count,
      status               = 'success'
    WHERE id = v_log_id;

    RAISE NOTICE '[%] Refresh completed in % ms (% rows)', p_view_name, v_duration_ms, v_row_count;

  EXCEPTION WHEN OTHERS THEN
    UPDATE materialized_view_refresh_log
    SET
      refresh_completed_at = clock_timestamp(),
      status               = 'failed',
      error_message        = SQLERRM
    WHERE id = v_log_id;

    RAISE WARNING '[%] Refresh failed: %', p_view_name, SQLERRM;
  END;

  RETURN v_log_id;
END;
$function$;

COMMENT ON FUNCTION public.refresh_materialized_view_with_logging IS
'Rafraîchit une vue matérialisée avec CONCURRENTLY (pas de lock exclusif) et
log les métriques. Fallback automatique vers REFRESH classique si la vue n''a
pas d''index unique. Activé suite à l''incident PGRST003 du 18 mai 2026.';
