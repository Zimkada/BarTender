-- Migration: Optimiser trigger bar_activity (compteur incrémental vs COUNT)
-- Description: Éviter COUNT(*) coûteux à chaque insertion pour haute affluence
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-27

-- =====================================================
-- Optimisation trigger: Compteur incrémental
-- =====================================================

CREATE OR REPLACE FUNCTION update_bar_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_bar_record bar_activity%ROWTYPE;
  v_five_min_ago TIMESTAMPTZ := NOW() - INTERVAL '5 minutes';
  v_one_hour_ago TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
BEGIN
  -- Récupérer l'enregistrement existant
  SELECT * INTO v_bar_record
  FROM bar_activity
  WHERE bar_id = NEW.bar_id;

  IF v_bar_record IS NULL THEN
    -- Premier sale pour ce bar : initialiser
    INSERT INTO bar_activity (bar_id, sales_last_5min, sales_last_hour, last_sale_at)
    VALUES (
      NEW.bar_id,
      1,
      1,
      NEW.created_at
    );
  ELSE
    -- Bar existe déjà : incrémenter intelligemment
    -- Si le dernier update est récent (< 5min), on incrémente
    -- Sinon on recalcule (car les compteurs sont obsolètes)

    IF v_bar_record.updated_at >= v_five_min_ago THEN
      -- Update récent : simple incrément (rapide!)
      UPDATE bar_activity
      SET
        sales_last_5min = sales_last_5min + 1,
        sales_last_hour = sales_last_hour + 1,
        last_sale_at = NEW.created_at,
        updated_at = NOW()
      WHERE bar_id = NEW.bar_id;
    ELSE
      -- Update ancien : recalculer les compteurs (rare)
      UPDATE bar_activity
      SET
        sales_last_5min = (
          SELECT COUNT(*) FROM sales
          WHERE bar_id = NEW.bar_id
            AND created_at >= v_five_min_ago
            AND status = 'validated'
        ),
        sales_last_hour = (
          SELECT COUNT(*) FROM sales
          WHERE bar_id = NEW.bar_id
            AND created_at >= v_one_hour_ago
            AND status = 'validated'
        ),
        last_sale_at = NEW.created_at,
        updated_at = NOW()
      WHERE bar_id = NEW.bar_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Amélioration fonction cleanup (nettoyage périodique)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_bar_activity()
RETURNS TABLE(
  bars_updated INTEGER,
  execution_time_ms INTEGER
) AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_bars_updated INTEGER;
BEGIN
  v_start_time := clock_timestamp();

  -- Recalculer les compteurs pour tous les bars
  -- (appelé par pg_cron toutes les 5 minutes)
  UPDATE bar_activity
  SET
    sales_last_5min = (
      SELECT COUNT(*) FROM sales
      WHERE bar_id = bar_activity.bar_id
        AND created_at >= NOW() - INTERVAL '5 minutes'
        AND status = 'validated'
    ),
    sales_last_hour = (
      SELECT COUNT(*) FROM sales
      WHERE bar_id = bar_activity.bar_id
        AND created_at >= NOW() - INTERVAL '1 hour'
        AND status = 'validated'
    ),
    updated_at = NOW()
  WHERE updated_at < NOW() - INTERVAL '1 minute'; -- Uniquement les anciens

  GET DIAGNOSTICS v_bars_updated = ROW_COUNT;

  RETURN QUERY SELECT
    v_bars_updated,
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON FUNCTION update_bar_activity() IS
'Trigger optimisé: incrément rapide si update récent, recalcul si ancien (haute affluence compatible)';

COMMENT ON FUNCTION cleanup_bar_activity() IS
'Nettoyage périodique optimisé: recalcule seulement les bars avec update > 1min (appelé par pg_cron)';
