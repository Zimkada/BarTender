-- =====================================================
-- MIGRATION 20251216050000: Add RLS to global_products
-- Date: 2025-12-16 05:00:00
-- Description: Fix critical RLS bypass on global_products table
-- =====================================================

-- Enable RLS on global_products
ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;

-- Policy 1: Authenticated users can view (READ) global products
CREATE POLICY "Authenticated users can view global products"
ON global_products FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Super admins can insert (CREATE) global products
CREATE POLICY "Super admins can insert global products"
ON global_products FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

-- Policy 3: Super admins can update (MODIFY) global products
CREATE POLICY "Super admins can update global products"
ON global_products FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Policy 4: Super admins can delete global products
CREATE POLICY "Super admins can delete global products"
ON global_products FOR DELETE
TO authenticated
USING (is_super_admin());

-- Comment for documentation
COMMENT ON TABLE global_products IS 'Global product catalog with RLS protection. Super admins only can modify. All authenticated users can view.';
