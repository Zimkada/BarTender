-- =====================================================
-- MIGRATION 028: Fix Product Insert & RLS Definitively
-- Date: 21 Novembre 2025
-- Description: Simplifies RLS for products and ensures volume column exists.
-- =====================================================

-- 1. Ensure VOLUME column exists (Fix for "nothing added")
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_products' AND column_name = 'volume') THEN
        ALTER TABLE bar_products ADD COLUMN volume TEXT;
    END IF;
END $$;

-- 2. Create a specific SECURITY DEFINER function for permission check
-- This bypasses any RLS recursion or complexity on bar_members
CREATE OR REPLACE FUNCTION check_product_create_permission(target_bar_id UUID) 
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get role directly from table (bypassing RLS due to SECURITY DEFINER)
    SELECT role INTO user_role
    FROM bar_members
    WHERE user_id = auth.uid()
    AND bar_id = target_bar_id
    AND is_active = true;

    -- Check if role is allowed
    IF user_role IN ('promoteur', 'gerant', 'super_admin') THEN
        RETURN true;
    END IF;

    -- Also allow if super_admin (global check)
    IF EXISTS (SELECT 1 FROM bar_members WHERE user_id = auth.uid() AND role = 'super_admin') THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Reset RLS Policies for bar_products
ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can create bar products" ON bar_products;
DROP POLICY IF EXISTS "Bar members can view bar products" ON bar_products;
DROP POLICY IF EXISTS "Managers can update bar products" ON bar_products;
DROP POLICY IF EXISTS "Managers can delete bar products" ON bar_products;

-- 4. Create Simple, Robust Policies

-- VIEW: All members can view
CREATE POLICY "Bar members can view bar products"
ON bar_products FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM bar_members 
        WHERE user_id = auth.uid() 
        AND bar_id = bar_products.bar_id
    )
);

-- INSERT: Use the helper function
CREATE POLICY "Managers can create bar products"
ON bar_products FOR INSERT
WITH CHECK (
    check_product_create_permission(bar_id)
);

-- UPDATE: Use the helper function
CREATE POLICY "Managers can update bar products"
ON bar_products FOR UPDATE
USING (
    check_product_create_permission(bar_id)
);

-- DELETE: Use the helper function
CREATE POLICY "Managers can delete bar products"
ON bar_products FOR DELETE
USING (
    check_product_create_permission(bar_id)
);

-- 5. Re-Grant Table Permissions (Just to be absolutely sure)
GRANT ALL ON TABLE bar_products TO authenticated;
GRANT ALL ON TABLE bar_members TO authenticated;

-- 6. Reload Schema
NOTIFY pgrst, 'reload schema';
