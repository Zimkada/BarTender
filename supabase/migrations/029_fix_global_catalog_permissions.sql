-- =====================================================
-- MIGRATION 029: Fix Global Catalog Permissions (Consolidated)
-- Date: 21 Novembre 2025
-- Description: Definitive RLS policies for global_categories and global_products
-- =====================================================

-- 1. Enable RLS (Safety check)
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;

-- 2. Clean up ALL existing policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can view global categories" ON global_categories;
DROP POLICY IF EXISTS "Everyone can view global categories" ON global_categories;
DROP POLICY IF EXISTS "Super admins can manage global categories" ON global_categories;
DROP POLICY IF EXISTS "Everyone can view global products" ON global_products;
DROP POLICY IF EXISTS "Super admins can create global products" ON global_products;
DROP POLICY IF EXISTS "Super admins can update global products" ON global_products;
DROP POLICY IF EXISTS "Super admins can delete global products" ON global_products;

-- 3. GLOBAL CATEGORIES POLICIES
-- =============================

-- READ: All authenticated users can view categories (needed for mapping)
CREATE POLICY "Authenticated users can view global categories"
ON global_categories FOR SELECT
TO authenticated
USING (true);

-- WRITE: Only Super Admin can manage
CREATE POLICY "Super admins can insert global categories"
ON global_categories FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update global categories"
ON global_categories FOR UPDATE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Super admins can delete global categories"
ON global_categories FOR DELETE
TO authenticated
USING (is_super_admin());

-- 4. GLOBAL PRODUCTS POLICIES
-- ===========================

-- READ: All authenticated users can view products (needed for import)
CREATE POLICY "Authenticated users can view global products"
ON global_products FOR SELECT
TO authenticated
USING (true);

-- WRITE: Only Super Admin can manage
CREATE POLICY "Super admins can insert global products"
ON global_products FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update global products"
ON global_products FOR UPDATE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Super admins can delete global products"
ON global_products FOR DELETE
TO authenticated
USING (is_super_admin());

-- 5. Reload schema cache to apply changes immediately
NOTIFY pgrst, 'reload schema';
