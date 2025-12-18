-- Migration: Create RPC to atomically create a supply and update product CUMP
-- Description: This function ensures that when a supply is created, the product's stock and CUMP are updated in a single transaction.
-- Author: Gemini
-- Date: 2025-12-18

CREATE OR REPLACE FUNCTION create_supply_and_update_product(
  p_bar_id UUID,
  p_product_id UUID,
  p_quantity INT,
  p_lot_price NUMERIC,
  p_lot_size INT,
  p_supplier TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_supply RECORD;
  product_current_stock INT;
  product_current_cost NUMERIC;
  new_unit_cost NUMERIC;
  new_average_cost NUMERIC;
  new_total_stock INT;
BEGIN
  -- 1. Get current product state
  SELECT
    stock,
    current_average_cost
  INTO
    product_current_stock,
    product_current_cost
  FROM public.bar_products
  WHERE id = p_product_id AND bar_id = p_bar_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found in bar %', p_product_id, p_bar_id;
  END IF;

  -- 2. Calculate new unit cost for this supply
  IF p_lot_size <= 0 THEN
    RAISE EXCEPTION 'Lot size must be greater than 0';
  END IF;
  new_unit_cost := p_lot_price / p_lot_size;

  -- 3. Calculate the new Weighted Average Cost (CUMP)
  new_total_stock := product_current_stock + p_quantity;

  IF new_total_stock <= 0 THEN
    -- This handles cases of negative adjustments, though this function is for adding supply.
    -- We keep the old cost if stock becomes zero or less.
    new_average_cost := product_current_cost;
  ELSE
    new_average_cost := (
      (product_current_stock::numeric * product_current_cost) + (p_quantity::numeric * new_unit_cost)
    ) / new_total_stock::numeric;
  END IF;

  -- 4. Insert the new supply record
  INSERT INTO public.supplies (bar_id, product_id, quantity, unit_cost, total_cost, supplier_name, created_by, supplied_at, supplied_by)
  VALUES (
    p_bar_id,
    p_product_id,
    p_quantity,
    new_unit_cost,
    (p_quantity * new_unit_cost), -- total cost for this supply
    p_supplier,
    p_created_by,
    NOW(),
    p_created_by
  )
  RETURNING * INTO new_supply;

  -- 5. Update the product with new stock and new CUMP
  UPDATE public.bar_products
  SET
    stock = new_total_stock,
    current_average_cost = new_average_cost,
    updated_at = NOW()
  WHERE id = p_product_id;

  -- 6. Return the created supply record as confirmation
  RETURN jsonb_build_object(
    'success', TRUE,
    'supply', to_jsonb(new_supply)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Grant permissions to the function
GRANT EXECUTE ON FUNCTION create_supply_and_update_product(UUID, UUID, INT, NUMERIC, INT, TEXT, UUID) TO authenticated;
