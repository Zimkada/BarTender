/**
 * Product Mapper Utility
 * Centralizes all camelCase ↔ snake_case conversions
 * Ensures type-safe and consistent field mapping across the application
 */

import type { Product } from '../types';

/**
 * Maps frontend Product (camelCase) to database format (snake_case)
 * @param updates - Partial product data in camelCase format
 * @param excludeStock - If true (default), excludes stock field (security: prevents direct stock manipulation)
 * @returns Object ready for Supabase UPDATE/INSERT with snake_case field names
 */
export function toDbProduct(
  updates: Partial<Product>,
  excludeStock: boolean = true
): Record<string, any> {
  const dbUpdates: Record<string, any> = {};

  // Map only defined fields to avoid overwriting with undefined values
  if (updates.name !== undefined) {
    dbUpdates.local_name = updates.name;
  }

  if (updates.categoryId !== undefined) {
    dbUpdates.local_category_id = updates.categoryId;
  }

  if (updates.image !== undefined) {
    dbUpdates.local_image = updates.image;
  }

  if (updates.volume !== undefined) {
    dbUpdates.volume = updates.volume;
  }

  if (updates.price !== undefined) {
    dbUpdates.price = updates.price;
  }

  if (updates.alertThreshold !== undefined) {
    dbUpdates.alert_threshold = updates.alertThreshold;
  }

  if (updates.globalProductId !== undefined) {
    dbUpdates.global_product_id = updates.globalProductId;
    // ⚠️ CRITICAL: When globalProductId changes, auto-calculate is_custom_product
    // This prevents the edge case where user changes product type during edit
    // Only set is_custom_product if it wasn't explicitly provided
    if (updates.isCustomProduct === undefined) {
      dbUpdates.is_custom_product = !updates.globalProductId; // false if linked, true if custom
    }
  }

  if (updates.isCustomProduct !== undefined) {
    dbUpdates.is_custom_product = updates.isCustomProduct;
  }

  // ⚠️ SECURITY: Stock modification is controlled separately
  // Never allow stock changes through this mapper for product edits
  // Stock changes must go through: sales, supplies, or dedicated adjustment endpoints
  if (updates.stock !== undefined && !excludeStock) {
    dbUpdates.stock = updates.stock;
  }

  return dbUpdates;
}

/**
 * Maps database format (snake_case) to frontend Product (camelCase)
 * @param dbProduct - Raw database record with snake_case field names
 * @returns Product object with camelCase field names
 */
export function toFrontendProduct(dbProduct: Record<string, any>): Product {
  return {
    id: dbProduct.id,
    barId: dbProduct.bar_id,
    // Use display_name if available (computed column), else local_name, else name from global
    name: dbProduct.display_name || dbProduct.local_name || dbProduct.name || 'Sans nom',
    // Volume: check local first, then global via relation, then fallback
    volume: dbProduct.volume || dbProduct.global_product?.volume || dbProduct.product_volume || '',
    price: dbProduct.price,
    stock: dbProduct.stock ?? 0,
    // Category: local_category_id is the foreign key
    categoryId: dbProduct.local_category_id || '',
    // Image: check multiple sources for fallback chain
    image:
      dbProduct.display_image ||
      dbProduct.local_image ||
      dbProduct.official_image ||
      undefined,
    alertThreshold: dbProduct.alert_threshold ?? 0,
    createdAt: new Date(dbProduct.created_at || Date.now()),
    // Optional fields
    ...(dbProduct.global_product_id && { globalProductId: dbProduct.global_product_id }),
    ...(dbProduct.is_custom_product !== undefined && { isCustomProduct: dbProduct.is_custom_product }),
    ...(dbProduct.current_average_cost && { currentAverageCost: dbProduct.current_average_cost }),
  };
}

/**
 * Creates a complete database record for product creation
 * Used by addProduct() to ensure all fields are properly mapped
 * @param productData - Frontend product data in camelCase
 * @param barId - The bar this product belongs to
 * @returns Complete bar_products record ready for INSERT
 */
export function toDbProductForCreation(
  productData: Omit<Product, 'id' | 'createdAt'>,
  barId: string
): Record<string, any> {
  // Determine if this is a custom product:
  // - If globalProductId is defined → custom = false (linked to catalog)
  // - If globalProductId is null/undefined → custom = true (custom product)
  const isCustom = !productData.globalProductId;

  return {
    bar_id: barId,
    local_name: productData.name,
    local_image: productData.image || null,
    local_category_id: productData.categoryId || null,
    price: productData.price,
    stock: productData.stock ?? 0,
    alert_threshold: productData.alertThreshold ?? 10,
    global_product_id: productData.globalProductId || null,
    // CRITICAL: is_custom_product reflects whether it's linked to global catalog
    // If globalProductId exists → false (linked), else → true (custom)
    is_custom_product: productData.isCustomProduct !== undefined ? productData.isCustomProduct : isCustom,
    volume: productData.volume || '',
  };
}
