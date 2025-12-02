-- Migration 069: Add business_date parameter to create_sale_with_promotions
-- Description: Permet au frontend de calculer et envoyer business_date pour le mode offline-first
-- Le trigger BEFORE INSERT reste actif comme filet de sécurité

-- Supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS create_sale_with_promotions(UUID, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, TEXT);

-- Créer la nouvelle fonction avec le paramètre business_date
CREATE OR REPLACE FUNCTION create_sale_with_promotions(
  p_bar_id UUID,
  p_items JSONB,
  p_payment_method TEXT,
  p_sold_by UUID,
  p_status TEXT DEFAULT 'pending',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_business_date DATE DEFAULT NULL  -- ✅ NOUVEAU: Paramètre optionnel pour offline-first
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale sales;
  v_item JSONB;
  v_subtotal DECIMAL := 0;
  v_discount_total DECIMAL := 0;
  v_total DECIMAL := 0;
  v_original_price DECIMAL;
  v_final_price DECIMAL;
  v_discount DECIMAL;
  v_business_date DATE;
  v_closing_hour INTEGER;
BEGIN
  -- ✅ NOUVEAU: Calculer business_date avec priorité au frontend
  IF p_business_date IS NOT NULL THEN
    -- Priorité 1: Utiliser la valeur envoyée par le frontend (mode offline)
    v_business_date := p_business_date;
  ELSE
    -- Priorité 2: Calculer côté backend (fallback si frontend n'envoie rien)
    SELECT closing_hour INTO v_closing_hour
    FROM bars
    WHERE id = p_bar_id;
    
    -- Valeur par défaut si closing_hour non trouvé
    IF v_closing_hour IS NULL THEN
      v_closing_hour := 6;
    END IF;
    
    -- Calculer business_date (même logique que le trigger)
    v_business_date := DATE(NOW() - (v_closing_hour || ' hours')::INTERVAL);
  END IF;

  -- 1. Calculer les totaux à partir des items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Prix original (avant promo)
    v_original_price := COALESCE(
      (v_item->>'original_unit_price')::DECIMAL,
      (v_item->>'unit_price')::DECIMAL
    ) * (v_item->>'quantity')::INT;
    
    -- Prix final (après promo)
    v_final_price := (v_item->>'total_price')::DECIMAL;
    
    -- Réduction
    v_discount := COALESCE((v_item->>'discount_amount')::DECIMAL, 0);
    
    v_subtotal := v_subtotal + v_original_price;
    v_discount_total := v_discount_total + v_discount;
  END LOOP;
  
  v_total := v_subtotal - v_discount_total;
  
  -- 2. Créer la vente avec business_date explicite
  INSERT INTO sales (
    bar_id,
    items,
    subtotal,
    discount_total,
    total,
    payment_method,
    status,
    sold_by,
    created_by,
    customer_name,
    customer_phone,
    notes,
    validated_by,
    validated_at,
    business_date  -- ✅ NOUVEAU: Inséré explicitement
  ) VALUES (
    p_bar_id,
    p_items,
    v_subtotal,
    v_discount_total,
    v_total,
    p_payment_method,
    p_status,
    p_sold_by,
    p_sold_by,
    p_customer_name,
    p_customer_phone,
    p_notes,
    CASE WHEN p_status = 'validated' THEN p_sold_by ELSE NULL END,
    CASE WHEN p_status = 'validated' THEN NOW() ELSE NULL END,
    v_business_date  -- ✅ NOUVEAU: Valeur calculée (frontend ou backend)
  )
  RETURNING * INTO v_sale;
  
  -- 3. Enregistrer les applications de promotions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'promotion_id') IS NOT NULL 
       AND (v_item->>'promotion_id') != 'null'
       AND COALESCE((v_item->>'discount_amount')::DECIMAL, 0) > 0 
    THEN
      -- Insérer l'application
      INSERT INTO promotion_applications (
        bar_id,
        promotion_id,
        sale_id,
        product_id,
        quantity_sold,
        original_price,
        discounted_price,
        discount_amount,
        applied_by
      ) VALUES (
        p_bar_id,
        (v_item->>'promotion_id')::UUID,
        v_sale.id,
        (v_item->>'product_id')::UUID,
        (v_item->>'quantity')::INT,
        COALESCE(
          (v_item->>'original_unit_price')::DECIMAL,
          (v_item->>'unit_price')::DECIMAL
        ) * (v_item->>'quantity')::INT,
        (v_item->>'total_price')::DECIMAL,
        (v_item->>'discount_amount')::DECIMAL,
        p_sold_by
      );
      
      -- Incrémenter le compteur d'utilisations
      UPDATE promotions 
      SET current_uses = current_uses + 1
      WHERE id = (v_item->>'promotion_id')::UUID;
    END IF;
  END LOOP;
  
  -- 4. Décrémenter le stock pour chaque produit
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE bar_products
    SET stock = stock - (v_item->>'quantity')::INT
    WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;
  
  RETURN v_sale;
EXCEPTION
  WHEN OTHERS THEN
    -- En cas d'erreur, PostgreSQL fait automatiquement un ROLLBACK
    RAISE EXCEPTION 'Erreur création vente: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION create_sale_with_promotions IS 
'Crée une vente de manière atomique avec enregistrement des promotions appliquées.
Toutes les opérations (vente, promotions, stock) réussissent ou échouent ensemble.

MIGRATION 069: Ajout du paramètre p_business_date pour supporter l''architecture offline-first.
- Si p_business_date est fourni (frontend), il est utilisé directement
- Sinon, il est calculé côté backend (fallback)
- Le trigger BEFORE INSERT reste actif comme filet de sécurité';

GRANT EXECUTE ON FUNCTION create_sale_with_promotions TO authenticated;

-- ✅ NOTE IMPORTANTE:
-- Le trigger trg_sales_business_date (migration 067) reste actif.
-- Il recalculera business_date si elle est NULL, mais ne modifiera pas une valeur existante.
-- Cela garantit la cohérence même si le frontend envoie une valeur incorrecte.
