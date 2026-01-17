-- =====================================================
-- MIGRATION: Auto-complete existing bars using business logic
-- Description: Utilise la fonction check_bar_setup_complete() existante
--              pour marquer automatiquement les bars qui ont tous les prérequis
--              Pas de date arbitraire, juste de la validation métier
-- Date: 2026-01-17
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Auto-compléter les bars qui passent les critères
-- =====================================================
-- Utilise la fonction check_bar_setup_complete() qui vérifie:
-- 1. Détails du bar (name, address, businessDayCloseHour)
-- 2. Au moins 1 produit actif
-- 3. Au moins 1 entrée stock

UPDATE bars
SET
  is_setup_complete = true,
  setup_completed_at = COALESCE(setup_completed_at, NOW())
WHERE
  -- Pas déjà marqué complet
  is_setup_complete = false
  -- Passe tous les critères métier
  AND check_bar_setup_complete(id) = true;

-- =====================================================
-- STEP 2: Rapport détaillé
-- =====================================================
DO $$
DECLARE
  v_total_bars int;
  v_completed_bars int;
  v_incomplete_bars int;
  v_just_completed int;
  rec RECORD;
BEGIN
  -- Statistiques globales
  SELECT COUNT(*) INTO v_total_bars FROM bars;

  SELECT COUNT(*) INTO v_completed_bars
  FROM bars WHERE is_setup_complete = true;

  SELECT COUNT(*) INTO v_incomplete_bars
  FROM bars WHERE is_setup_complete = false;

  SELECT COUNT(*) INTO v_just_completed
  FROM bars
  WHERE is_setup_complete = true
  AND setup_completed_at >= NOW() - INTERVAL '1 minute';

  RAISE NOTICE '✅ Auto-completion terminée';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Statistiques:';
  RAISE NOTICE '- Total bars: %', v_total_bars;
  RAISE NOTICE '- Bars complétés: %', v_completed_bars;
  RAISE NOTICE '- Bars incomplets: %', v_incomplete_bars;
  RAISE NOTICE '- Bars auto-complétés maintenant: %', v_just_completed;
  RAISE NOTICE '';

  -- Détails des bars incomplets (pour debugging)
  IF v_incomplete_bars > 0 THEN
    RAISE NOTICE '⚠️ Bars encore incomplets:';
    FOR rec IN
      SELECT
        id,
        name,
        created_at,
        (name IS NOT NULL AND name != '') as has_name,
        (address IS NOT NULL AND address != '') as has_address,
        ((settings->>'businessDayCloseHour') IS NOT NULL) as has_closing_hour,
        EXISTS(SELECT 1 FROM bar_products WHERE bar_id = bars.id AND is_active = true LIMIT 1) as has_products,
        EXISTS(SELECT 1 FROM supplies WHERE bar_id = bars.id LIMIT 1) as has_stock
      FROM bars
      WHERE is_setup_complete = false
      LIMIT 5
    LOOP
      RAISE NOTICE '';
      RAISE NOTICE '  Bar: % (ID: %)', rec.name, rec.id;
      RAISE NOTICE '    Créé le: %', rec.created_at;
      RAISE NOTICE '    ✓ Nom: %', rec.has_name;
      RAISE NOTICE '    ✓ Adresse: %', rec.has_address;
      RAISE NOTICE '    ✓ Heure fermeture: %', rec.has_closing_hour;
      RAISE NOTICE '    ✓ Produits: %', rec.has_products;
      RAISE NOTICE '    ✓ Stock: %', rec.has_stock;
    END LOOP;

    IF v_incomplete_bars > 5 THEN
      RAISE NOTICE '';
      RAISE NOTICE '  ... et % autre(s) bar(s) incomplet(s)', v_incomplete_bars - 5;
    END IF;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✨ Les triggers automatiques vont maintenant gérer les futurs bars';
END $$;

COMMIT;
