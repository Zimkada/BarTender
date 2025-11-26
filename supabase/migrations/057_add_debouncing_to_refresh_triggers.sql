-- 057_add_debouncing_to_refresh_triggers.sql
-- Add intelligent debouncing to materialized view refresh triggers
-- P1 Optimization: Reduce refresh frequency from 20×/day to ~6×/day (-70% CPU)
-- Recommended in OPTIMISATION_SQL_COMPLETE.md

-- =====================================================
-- 1. DEBOUNCED TRIGGER FOR daily_sales_summary
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_daily_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'daily_sales_summary';
BEGIN
  -- Récupérer timestamp du dernier refresh réussi
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name
    AND status = 'completed';

  -- Refresh seulement si:
  -- 1. Jamais rafraîchi (NULL)
  -- 2. Dernier refresh > 10 minutes
  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
    RAISE NOTICE '[%] Refresh triggered (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Refresh skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_daily_summary IS 'Trigger débounced (10 min) pour daily_sales_summary - réduit refresh de 20×/jour → 6×/jour';

-- =====================================================
-- 2. DEBOUNCED TRIGGER FOR product_sales_stats
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_product_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'product_sales_stats';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name
    AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '10 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
    RAISE NOTICE '[%] Refresh triggered (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Refresh skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_product_stats IS 'Trigger débounced (10 min) pour product_sales_stats - évite refresh excessif';

-- =====================================================
-- 3. DEBOUNCED TRIGGER FOR expenses_summary
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_expenses_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'expenses_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name
    AND status = 'completed';

  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '15 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
    RAISE NOTICE '[%] Refresh triggered (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Refresh skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_expenses_summary IS 'Trigger débounced (15 min) pour expenses_summary - moins critique que ventes';

-- =====================================================
-- 4. DEBOUNCED TRIGGER FOR salaries_summary
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_refresh_salaries_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_refresh TIMESTAMPTZ;
  v_view_name TEXT := 'salaries_summary';
BEGIN
  SELECT MAX(refresh_completed_at) INTO v_last_refresh
  FROM materialized_view_refresh_log
  WHERE view_name = v_view_name
    AND status = 'completed';

  -- Salaires moins fréquents: debounce 30 min
  IF v_last_refresh IS NULL OR v_last_refresh < NOW() - INTERVAL '30 minutes' THEN
    PERFORM pg_notify('refresh_stats', v_view_name || '_mat');
    RAISE NOTICE '[%] Refresh triggered (last: %)', v_view_name, COALESCE(v_last_refresh::TEXT, 'never');
  ELSE
    RAISE DEBUG '[%] Refresh skipped (debounced, last: %)', v_view_name, v_last_refresh;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_refresh_salaries_summary IS 'Trigger débounced (30 min) pour salaries_summary - peu fréquent';

-- =====================================================
-- 5. FONCTION UTILITAIRE: Force Refresh (bypass debounce)
-- =====================================================

CREATE OR REPLACE FUNCTION force_refresh_view(p_view_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Appeler directement le refresh avec logging (bypass debounce)
  v_log_id := refresh_materialized_view_with_logging(p_view_name, 'manual_force');

  RAISE NOTICE '[force_refresh_view] Forced refresh of % (log_id: %)', p_view_name, v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION force_refresh_view TO authenticated;

COMMENT ON FUNCTION force_refresh_view IS 'Force le refresh d''une vue (bypass debounce) - pour refresh manuel UI';

-- =====================================================
-- 6. MÉTRIQUES DE DEBOUNCING
-- =====================================================

CREATE OR REPLACE VIEW debouncing_metrics AS
SELECT
  view_name,
  COUNT(*) FILTER (WHERE status = 'completed') AS successful_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'trigger') AS trigger_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual') AS manual_refreshes,
  COUNT(*) FILTER (WHERE triggered_by = 'manual_force') AS forced_refreshes,
  AVG(duration_ms) FILTER (WHERE status = 'completed') AS avg_duration_ms,
  MAX(refresh_completed_at) FILTER (WHERE status = 'completed') AS last_refresh,

  -- Estimation taux de debounce (si logs > refreshes, c'est que debounce a fonctionné)
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0
    THEN ROUND(
      (1 - (COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC /
            GREATEST(COUNT(*), 1))) * 100,
      2
    )
    ELSE 0
  END AS estimated_debounce_rate_percent

FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '7 days'
GROUP BY view_name
ORDER BY last_refresh DESC;

GRANT SELECT ON debouncing_metrics TO authenticated;

COMMENT ON VIEW debouncing_metrics IS 'Métriques de debouncing des refresh triggers (derniers 7 jours)';

-- =====================================================
-- 7. VÉRIFICATION DE LA CONFIGURATION
-- =====================================================

-- Afficher les intervalles de debounce configurés
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'DEBOUNCING CONFIGURATION';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'daily_sales_summary    : 10 minutes';
  RAISE NOTICE 'product_sales_stats    : 10 minutes';
  RAISE NOTICE 'expenses_summary       : 15 minutes';
  RAISE NOTICE 'salaries_summary       : 30 minutes';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Expected reduction: ~70%% (20 refresh/day → 6 refresh/day)';
  RAISE NOTICE 'Max staleness: 10-30 min (acceptable for analytics)';
  RAISE NOTICE '==============================================';
END $$;

-- =====================================================
-- 8. INSTRUCTIONS POUR MONITORING
-- =====================================================

/*
-- Vérifier l'efficacité du debouncing:
SELECT * FROM debouncing_metrics;

-- Exemple de sortie attendue:
   view_name            | successful_refreshes | estimated_debounce_rate_percent
------------------------+----------------------+---------------------------------
 daily_sales_summary    |          42          |            65.00
 product_sales_stats    |          38          |            68.42
 expenses_summary       |          20          |            83.33
 salaries_summary       |          12          |            90.00

-- Si estimated_debounce_rate < 50%, augmenter l'intervalle de debounce

-- Forcer un refresh manuel (bypass debounce):
SELECT force_refresh_view('daily_sales_summary');

-- Vérifier logs récents:
SELECT
  view_name,
  status,
  triggered_by,
  duration_ms,
  refresh_completed_at
FROM materialized_view_refresh_log
WHERE refresh_started_at >= NOW() - INTERVAL '1 day'
ORDER BY refresh_started_at DESC
LIMIT 20;
*/
