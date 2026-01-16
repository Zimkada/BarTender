import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { GlobalProduct as GlobalProductType } from '../../types';

type GlobalProductRow = Database['public']['Tables']['global_products']['Row'];
type GlobalProductInsert = Database['public']['Tables']['global_products']['Insert'];
type BarProduct = Database['public']['Tables']['bar_products']['Row'];
type BarProductUpdate = Database['public']['Tables']['bar_products']['Update'];
type BarCategory = Database['public']['Tables']['bar_categories']['Row'];

export interface BarProductWithDetails extends BarProduct {
  global_product?: GlobalProductRow | null;
  category?: BarCategory | null;
  display_name: string;
  display_image: string | null;
}

export interface CreateBarProductData {
  bar_id: string;
  global_product_id?: string;
  local_name?: string;
  local_image?: string;
  local_category_id?: string;
  price: number;
  stock?: number;
  alert_threshold?: number;
  is_custom_product?: boolean;
  volume?: string;
}

/**
 * Service de gestion des produits
 * Gère à la fois le catalogue global et les produits par bar
 */
export class ProductsService {
  // =====================================================
  // CATALOGUE GLOBAL (Super Admin uniquement)
  // =====================================================

  /**
   * Créer un produit global (super_admin uniquement)
   */
  static async createGlobalProduct(data: GlobalProductInsert): Promise<GlobalProductType> {
    try {
      const { data: newProduct, error } = await supabase
        .from('global_products')
        .insert(data)
        .select()
        .single();

      if (error || !newProduct) {
        throw new Error('Erreur lors de la création du produit global');
      }

      // Map to GlobalProductType
      const result = newProduct as GlobalProductRow;
      return {
        id: result.id,
        name: result.name,
        brand: result.brand || undefined,
        manufacturer: result.manufacturer || undefined,
        volume: result.volume,
        volumeMl: result.volume_ml || undefined,
        category: result.category,
        subcategory: result.subcategory || undefined,
        officialImage: result.official_image || undefined,
        barcode: result.barcode || undefined,
        description: result.description || undefined,
        suggestedPriceMin: result.suggested_price_min || undefined,
        suggestedPriceMax: result.suggested_price_max || undefined,
        isActive: result.is_active ?? true,
        createdAt: new Date(result.created_at || Date.now())
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les produits globaux
   */
  static async getGlobalProducts(): Promise<GlobalProductType[]> {
    try {
      const { data, error } = await supabase
        .from('global_products')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        throw new Error('Erreur lors de la récupération des produits globaux');
      }

      return (data || []).map((p: GlobalProductRow) => ({
        id: p.id,
        name: p.name,
        brand: p.brand || undefined,
        manufacturer: p.manufacturer || undefined,
        volume: p.volume,
        volumeMl: p.volume_ml || undefined,
        category: p.category,
        subcategory: p.subcategory || undefined,
        officialImage: p.official_image || undefined,
        barcode: p.barcode || undefined,
        description: p.description || undefined,
        suggestedPriceMin: p.suggested_price_min || undefined,
        suggestedPriceMax: p.suggested_price_max || undefined,
        isActive: p.is_active ?? true,
        createdAt: new Date(p.created_at || Date.now())
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les produits globaux par catégorie
   */
  static async getGlobalProductsByCategory(category: string): Promise<GlobalProductType[]> {
    try {
      const { data, error } = await supabase
        .from('global_products')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        throw new Error('Erreur lors de la récupération des produits');
      }

      return (data || []).map((p: GlobalProductRow) => ({
        id: p.id,
        name: p.name,
        brand: p.brand || undefined,
        manufacturer: p.manufacturer || undefined,
        volume: p.volume,
        volumeMl: p.volume_ml || undefined,
        category: p.category,
        subcategory: p.subcategory || undefined,
        officialImage: p.official_image || undefined,
        barcode: p.barcode || undefined,
        description: p.description || undefined,
        suggestedPriceMin: p.suggested_price_min || undefined,
        suggestedPriceMax: p.suggested_price_max || undefined,
        isActive: p.is_active ?? true,
        createdAt: new Date(p.created_at || Date.now())
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un produit global
   */
  static async updateGlobalProduct(
    productId: string,
    updates: Partial<GlobalProductInsert>
  ): Promise<GlobalProductType> {
    try {
      const { data, error } = await supabase
        .from('global_products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour du produit global');
      }

      // Map to GlobalProductType
      const result = data as GlobalProductRow;
      return {
        id: result.id,
        name: result.name,
        brand: result.brand || undefined,
        manufacturer: result.manufacturer || undefined,
        volume: result.volume,
        volumeMl: result.volume_ml || undefined,
        category: result.category,
        subcategory: result.subcategory || undefined,
        officialImage: result.official_image || undefined,
        barcode: result.barcode || undefined,
        description: result.description || undefined,
        suggestedPriceMin: result.suggested_price_min || undefined,
        suggestedPriceMax: result.suggested_price_max || undefined,
        isActive: result.is_active ?? true,
        createdAt: new Date(result.created_at || Date.now())
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Supprimer un produit global (Super Admin) - Soft delete
   */
  static async deleteGlobalProduct(productId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('global_products')
        .update({ is_active: false })
        .eq('id', productId);

      if (error) {
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('restrict') || errorMessage.includes('constraint')) {
            throw new Error('Ce produit ne peut pas être supprimé car il est référencé ailleurs.');
        }
        throw new Error('Erreur lors de la suppression du produit global');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // =====================================================
  // PRODUITS PAR BAR
  // =====================================================

  /**
   * Créer un produit pour un bar
   * Peut être lié à un produit global OU être 100% custom
   */
  static async createBarProduct(data: CreateBarProductData): Promise<BarProduct> {
    try {
      // Validation: soit global_product_id, soit (is_custom_product + local_name)
      if (!data.global_product_id && !data.is_custom_product) {
        throw new Error('Le produit doit être lié au catalogue global ou être un produit custom');
      }

      if (data.is_custom_product && !data.local_name) {
        throw new Error('Un produit custom doit avoir un nom local');
      }

      const { data: newProduct, error } = await supabase
        .from('bar_products')
        .insert({
          bar_id: data.bar_id,
          global_product_id: data.global_product_id,
          local_name: data.local_name,
          local_image: data.local_image,
          local_category_id: data.local_category_id,
          price: data.price,
          stock: data.stock || 0,
          alert_threshold: data.alert_threshold || 10,
          is_custom_product: data.is_custom_product || false,
          is_active: true,
          volume: data.volume,
        })
        .select()
        .single();

      if (error || !newProduct) {
        throw new Error('Erreur lors de la création du produit');
      }

      return newProduct;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les produits d'un bar avec leurs détails
   * Utilise un RPC pour contourner les RLS lors de l'impersonation
   */
  static async getBarProducts(
    barId: string,
    impersonatingUserId?: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<BarProductWithDetails[]> {
    try {
      // Use RPC with optional impersonating_user_id parameter and pagination
      const { data: productsData, error: rpcError } = await supabase
        .rpc('get_bar_products', {
          p_bar_id: barId,
          p_impersonating_user_id: impersonatingUserId || null,
          p_limit: options?.limit || 500,
          p_offset: options?.offset || 0,
        });

      if (rpcError) {
        console.error('[ProductsService] RPC error:', rpcError);
        throw new Error('Erreur lors de la récupération des produits');
      }

      // Map RPC results to BarProductWithDetails format
      const enrichedProducts: BarProductWithDetails[] = (productsData || []).map((product: any) => ({
        ...product,
        display_name: product.display_name,
        display_image: product.local_image || product.official_image || null,
      }));

      return enrichedProducts;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les produits d'un bar par catégorie
   */
  static async getBarProductsByCategory(
    barId: string,
    categoryId: string
  ): Promise<BarProductWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from('bar_products')
        .select(`
          *,
          global_products (*),
          bar_categories (*)
        `)
        .eq('bar_id', barId)
        .eq('local_category_id', categoryId)
        .eq('is_active', true);

      if (error) {
        throw new Error('Erreur lors de la récupération des produits');
      }

      const enrichedProducts: BarProductWithDetails[] = (data || []).map((product: any) => {
        const globalProduct = product.global_products as GlobalProductRow | null;

        return {
          ...product,
          global_product: globalProduct,
          category: product.bar_categories,
          display_name: product.display_name,
          display_image: product.local_image || globalProduct?.official_image || null,
        };
      });

      return enrichedProducts;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer un produit par ID
   */
  static async getBarProductById(productId: string): Promise<BarProductWithDetails | null> {
    try {
      const { data, error } = await supabase
        .from('bar_products')
        .select(`
          *,
          global_products (*),
          bar_categories (*)
        `)
        .eq('id', productId)
        .single();

      if (error || !data) {
        return null;
      }

      const globalProduct = data.global_products as GlobalProductRow | null;

      return {
        ...data,
        global_product: globalProduct,
        category: data.bar_categories,
        display_name: data.display_name,
        display_image: data.local_image || globalProduct?.official_image || null,
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un produit de bar
   */
  static async updateBarProduct(
    productId: string,
    updates: BarProductUpdate
  ): Promise<BarProduct> {
    try {
      const { data, error } = await supabase
        .from('bar_products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour du produit');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour le stock d'un produit
   */
  static async updateStock(productId: string, quantity: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_products')
        .update({ stock: quantity })
        .eq('id', productId);

      if (error) {
        throw new Error('Erreur lors de la mise à jour du stock');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Incrémenter le stock d'un produit (approvisionnement)
   */
  static async incrementStock(productId: string, quantity: number): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_stock', {
        p_product_id: productId,
        p_quantity: quantity
      });

      if (error) {
        throw new Error('Erreur lors de l\'incrémentation du stock');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Décrémenter le stock d'un produit (vente)
   */
  static async decrementStock(productId: string, quantity: number): Promise<void> {
    try {
      const { error } = await supabase.rpc('decrement_stock', {
        p_product_id: productId,
        p_quantity: quantity
      });

      if (error) {
        console.error('Stock decrement error:', error);
        throw new Error(`Erreur lors de la décrémentation du stock: ${error.message} (${error.details || ''})`);
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Désactiver un produit (soft delete)
   */
  static async deactivateProduct(productId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_products')
        .update({ is_active: false })
        .eq('id', productId);

      if (error) {
        throw new Error('Erreur lors de la désactivation du produit');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Upsert batch de produits pour un bar
   * Utilisé par onboarding pour ajouter multiple produits en une seule opération
   * Support du onConflict pour éviter les doublons
   * Enrichit les display_name avec les noms réels depuis global_products
   */
  static async batchUpsertBarProducts(
    barId: string,
    products: Array<{ globalProductId: string; displayName: string; price: number }>
  ): Promise<BarProduct[]> {
    try {
      // 1. Fetch real product names from global_products
      const { data: globalProducts, error: fetchError } = await supabase
        .from('global_products')
        .select('id, name')
        .in('id', products.map(p => p.globalProductId));

      if (fetchError) {
        console.warn('Failed to fetch global product names, using fallback:', fetchError);
      }

      // 2. Create a map of globalProductId -> real name
      const productNameMap = new Map(
        (globalProducts || []).map(p => [p.id, p.name])
      );

      // 3. Map products with real names or fallback
      const barProducts = products.map(p => ({
        bar_id: barId,
        global_product_id: p.globalProductId,
        display_name: productNameMap.get(p.globalProductId) || p.displayName,
        price: p.price,
        is_active: true,
      }));

      // 4. Upsert with conflict resolution
      const { data, error } = await supabase
        .from('bar_products')
        .upsert(barProducts as BarProductInsert[], { onConflict: 'bar_id,global_product_id' })
        .select();

      if (error || !data) {
        throw new Error('Erreur lors de l\'ajout des produits');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les produits en rupture de stock
   */
  static async getLowStockProducts(barId: string): Promise<BarProductWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from('bar_products')
        .select(`
          *,
          global_products (*),
          bar_categories (*)
        `)
        .eq('bar_id', barId)
        .eq('is_active', true)
        .filter('stock', 'lte', 'alert_threshold');

      if (error) {
        throw new Error('Erreur lors de la récupération des produits en rupture');
      }

      const enrichedProducts: BarProductWithDetails[] = (data || []).map((product: any) => {
        const globalProduct = product.global_products as GlobalProductRow | null;

        return {
          ...product,
          global_product: globalProduct,
          category: product.bar_categories,
          display_name: product.display_name,
          display_image: product.local_image || globalProduct?.official_image || null,
        };
      });

      return enrichedProducts;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // =====================================================
  // CATÉGORIES PAR BAR
  // =====================================================

  /**
   * Créer une catégorie pour un bar
   */
  static async createBarCategory(data: {
    bar_id: string;
    name: string;
    color?: string;
    icon?: string;
    is_custom?: boolean;
  }): Promise<BarCategory> {
    try {
      const { data: newCategory, error } = await supabase
        .from('bar_categories')
        .insert({
          bar_id: data.bar_id,
          name: data.name,
          color: data.color || '#3B82F6',
          icon: data.icon,
          is_custom: data.is_custom || false,
        })
        .select()
        .single();

      if (error || !newCategory) {
        throw new Error('Erreur lors de la création de la catégorie');
      }

      return newCategory;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les catégories d'un bar
   */
  static async getBarCategories(barId: string): Promise<BarCategory[]> {
    try {
      const { data, error } = await supabase
        .from('bar_categories')
        .select('*')
        .eq('bar_id', barId)
        .order('order_index', { ascending: true });

      if (error) {
        throw new Error('Erreur lors de la récupération des catégories');
      }

      return data || [];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour une catégorie
   */
  static async updateBarCategory(
    categoryId: string,
    updates: { name?: string; color?: string; icon?: string; order_index?: number }
  ): Promise<BarCategory> {
    try {
      const { data, error } = await supabase
        .from('bar_categories')
        .update(updates)
        .eq('id', categoryId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour de la catégorie');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Supprimer une catégorie
   */
  static async deleteBarCategory(categoryId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_categories')
        .delete()
        .eq('id', categoryId);

      if (error) {
        throw new Error('Erreur lors de la suppression de la catégorie');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
