-- Migration: Ajouter verrous SQL transactionnels + timeouts à create_sale_with_promotions
-- Description: Protection anti-conflit stock + protection saturation DB
-- Compatibilité: Supabase Free + Pro
-- Date: 2025-12-26

BEGIN;

-- =====================================================
-- STEP 1: Update create_sale_with_promotions avec verrous SQL
-- =====================================================

DROP FUNCTION IF EXISTS public.create_sale_with_promotions(UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE) CASCADE;

CREATE FUNCTION public.create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_server_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'validated',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale sales;
  v_business_date DATE;
  v_total_amount DECIMAL := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_unit_price DECIMAL;
  v_product_stock INT;
  v_rows_affected INTEGER;
BEGIN
  -- ✅ NOUVEAU: Protection contre blocages prolongés (saturation DB)
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '3s';

  -- Validate inputs
  IF p_bar_id IS NULL OR p_sold_by IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters: bar_id, sold_by, items';
  END IF;

  -- Determine business date
  v_business_date := COALESCE(p_business_date, CURRENT_DATE);

  -- Process each item and calculate totals
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Invalid item format in sale items';
    END IF;

    -- Accumulate total
    v_total_amount := v_total_amount + (v_unit_price * v_quantity);
  END LOOP;

  -- Create the sale record
  INSERT INTO public.sales (
    bar_id,
    items,
    subtotal,
    discount_total,
    total,
    payment_method,
    status,
    sold_by,
    validated_by,
    validated_at,
    applied_promotions,
    server_id,
    created_by,
    customer_name,
    customer_phone,
    notes,
    business_date,
    created_at
  ) VALUES (
    p_bar_id,
    p_items,
    v_total_amount,
    0,
    v_total_amount,
    p_payment_method,
    p_status,
    p_sold_by,
    CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
    CASE WHEN p_status = 'validated' THEN CURRENT_TIMESTAMP ELSE NULL END,
    '[]'::JSONB,
    p_server_id,
    p_sold_by,
    p_customer_name,
    p_customer_phone,
    p_notes,
    v_business_date,
    CURRENT_TIMESTAMP
  )
  RETURNING * INTO v_sale;

  -- ✅ NOUVEAU: Décrémenter stock avec verrou atomique
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    -- UPDATE atomique avec vérification stock
    UPDATE public.bar_products
    SET stock = stock - v_quantity
    WHERE id = v_product_id 
      AND bar_id = p_bar_id
      AND stock >= v_quantity;  -- ✅ Condition critique anti-conflit

    -- ✅ Vérifier si la mise à jour a réussi
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
      -- Vérifier si c'est un problème de stock ou produit inexistant
      SELECT stock INTO v_product_stock
      FROM public.bar_products
      WHERE id = v_product_id AND bar_id = p_bar_id;

      IF v_product_stock IS NULL THEN
        RAISE EXCEPTION 'Produit % introuvable dans le bar %', v_product_id, p_bar_id;
      ELSE
        RAISE EXCEPTION 'Stock insuffisant pour le produit % (stock actuel: %, demandé: %)', 
          v_product_id, v_product_stock, v_quantity;
      END IF;
    END IF;
  END LOOP;

  -- Return the complete sales row
  RETURN v_sale;

EXCEPTION 
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Timeout: Impossible d''acquérir le verrou sur le stock (DB saturée)';
  WHEN query_canceled THEN
    RAISE EXCEPTION 'Timeout: Requête annulée après 3s (DB saturée)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erreur lors de la création de la vente: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_promotions(UUID, JSONB, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE) IS 
'Créer une vente avec protection anti-conflit stock (verrou SQL atomique) et timeouts anti-saturation DB';

COMMIT;
