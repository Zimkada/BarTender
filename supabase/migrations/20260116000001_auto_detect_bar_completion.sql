-- =====================================================
-- MIGRATION: Auto-detect bar setup completion
-- Description: Marque automatiquement is_setup_complete = true
--              quand tous les prérequis sont remplis
-- =====================================================

BEGIN;

-- 1. FONCTION: Vérifie si un bar a tous les prérequis
CREATE OR REPLACE FUNCTION check_bar_setup_complete(p_bar_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_details boolean;
  v_has_products boolean;
  v_has_stock boolean;
BEGIN
  -- Vérifier détails du bar (closing_hour est dans settings.businessDayCloseHour)
  SELECT (name IS NOT NULL
      AND address IS NOT NULL
      AND (settings->>'businessDayCloseHour') IS NOT NULL)
  INTO v_has_details
  FROM bars
  WHERE id = p_bar_id;

  -- Vérifier au moins 1 produit
  SELECT EXISTS(SELECT 1 FROM bar_products WHERE bar_id = p_bar_id AND is_active = true LIMIT 1)
  INTO v_has_products;

  -- Vérifier au moins 1 entrée stock
  SELECT EXISTS(SELECT 1 FROM supplies WHERE bar_id = p_bar_id LIMIT 1)
  INTO v_has_stock;

  RETURN COALESCE(v_has_details, false)
     AND COALESCE(v_has_products, false)
     AND COALESCE(v_has_stock, false);
END;
$$;

-- 2. TRIGGER: Auto-complétion sur mise à jour bars
CREATE OR REPLACE FUNCTION trigger_auto_complete_bar_setup()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ne pas re-trigger si déjà marqué complet
  IF NEW.is_setup_complete = true THEN
    RETURN NEW;
  END IF;

  -- Vérifier si tous les prérequis sont remplis
  IF check_bar_setup_complete(NEW.id) THEN
    NEW.is_setup_complete := true;
    NEW.setup_completed_at := NOW();
    RAISE NOTICE 'Bar % auto-completed setup', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_complete_bar_setup ON bars;
CREATE TRIGGER auto_complete_bar_setup
  BEFORE UPDATE ON bars
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_complete_bar_setup();

-- 3. TRIGGER: Auto-complétion sur ajout produit
CREATE OR REPLACE FUNCTION trigger_check_bar_completion_on_product()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Tenter de marquer le bar comme complet si prérequis OK
  UPDATE bars
  SET is_setup_complete = true,
      setup_completed_at = NOW()
  WHERE id = NEW.bar_id
    AND is_setup_complete = false
    AND check_bar_setup_complete(NEW.bar_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_completion_on_product_insert ON bar_products;
CREATE TRIGGER check_completion_on_product_insert
  AFTER INSERT ON bar_products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_bar_completion_on_product();

-- 4. TRIGGER: Auto-complétion sur ajout stock
CREATE OR REPLACE FUNCTION trigger_check_bar_completion_on_supply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Tenter de marquer le bar comme complet si prérequis OK
  UPDATE bars
  SET is_setup_complete = true,
      setup_completed_at = NOW()
  WHERE id = NEW.bar_id
    AND is_setup_complete = false
    AND check_bar_setup_complete(NEW.bar_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_completion_on_supply_insert ON supplies;
CREATE TRIGGER check_completion_on_supply_insert
  AFTER INSERT ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_bar_completion_on_supply();

-- 5. MIGRATION: Marquer les bars existants déjà complets
UPDATE bars
SET is_setup_complete = true,
    setup_completed_at = NOW()
WHERE is_setup_complete = false
  AND check_bar_setup_complete(id);

COMMIT;

-- Rapport
DO $$
DECLARE
  v_auto_completed_count int;
BEGIN
  SELECT COUNT(*) INTO v_auto_completed_count
  FROM bars
  WHERE is_setup_complete = true AND setup_completed_at >= NOW() - INTERVAL '1 minute';

  RAISE NOTICE '✅ Auto-détection de complétion activée.';
  RAISE NOTICE '- % bar(s) existant(s) marqué(s) comme complet(s).', v_auto_completed_count;
  RAISE NOTICE '- Triggers installés : bars, bar_products, supplies.';
END $$;
