import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { AuditLogger } from '../AuditLogger';

type BarUpdate = Database['public']['Tables']['bars']['Update'];

/**
 * Onboarding Service
 * Handles all database operations for the onboarding workflow
 * - Bar setup completion
 * - Manager/Staff assignment
 * - Product catalog & stock initialization
 * - Audit logging
 */
export class OnboardingService {
  /**
   * Launch bar: Mark setup as complete
   * Called from ReviewStep.tsx when owner clicks "Launch Bar"
   */
  static async launchBar(barId: string, ownerId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({
          is_setup_complete: true,
          setup_completed_at: new Date().toISOString(),
        } as BarUpdate)
        .eq('id', barId)
        .eq('owner_id', ownerId);

      if (error) {
        throw new Error(`Failed to launch bar: ${error.message}`);
      }

      // Log audit event
      await AuditLogger.log('ONBOARDING_COMPLETED', {
        bar_id: barId,
        user_id: ownerId,
        description: 'Owner completed onboarding setup and launched bar',
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Assign manager to bar
   * Called from AddManagersStep.tsx when adding manager
   */
  static async assignManager(
    userId: string,
    barId: string,
    assignedByUserId: string
  ): Promise<void> {
    try {
      const { error } = await supabase.from('bar_members').insert({
        user_id: userId,
        bar_id: barId,
        role: 'gérant',
        assigned_by: assignedByUserId,
        is_active: true,
      });

      if (error) {
        throw new Error(`Failed to assign manager: ${error.message}`);
      }

      // Log audit
      await AuditLogger.log('MANAGER_ASSIGNED', {
        bar_id: barId,
        manager_id: userId,
        assigned_by: assignedByUserId,
        description: `Manager ${userId} assigned to bar ${barId}`,
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Create server/bartender accounts
   * Called from SetupStaffStep.tsx when owner creates servers (full mode)
   */
  static async createServers(
    barId: string,
    serverNames: string[],
    createdByUserId: string
  ): Promise<void> {
    try {
      // Insert multiple server records as bar_members
      const serverRecords = serverNames.map((name) => ({
        bar_id: barId,
        user_id: `server_${barId}_${name}`, // Temp ID for mapping
        role: 'serveur' as const,
        assigned_by: createdByUserId,
        is_active: true,
        display_name: name, // Store name for reference
      }));

      const { error } = await supabase
        .from('bar_members')
        .insert(serverRecords as any);

      if (error) {
        throw new Error(`Failed to create servers: ${error.message}`);
      }

      // Log audit
      await AuditLogger.log('SERVERS_CREATED', {
        bar_id: barId,
        server_count: serverNames.length,
        server_names: serverNames,
        created_by: createdByUserId,
        description: `${serverNames.length} servers created for bar`,
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Add products to bar catalog
   * Called from AddProductsStep.tsx when selecting products
   */
  static async addProductsToBar(
    barId: string,
    products: Array<{ productId: string; localPrice: number }>,
    addedByUserId: string
  ): Promise<void> {
    try {
      const barProducts = products.map((p) => ({
        bar_id: barId,
        product_id: p.productId,
        local_price: p.localPrice,
        is_available: true,
      }));

      const { error } = await supabase
        .from('bar_products')
        .insert(barProducts as any);

      if (error) {
        throw new Error(`Failed to add products: ${error.message}`);
      }

      // Log audit
      await AuditLogger.log('PRODUCTS_ADDED', {
        bar_id: barId,
        product_count: products.length,
        added_by: addedByUserId,
        description: `${products.length} products added to bar catalog`,
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Initialize stock for products
   * Called from StockInitStep.tsx when owner sets initial inventory
   */
  static async initializeStock(
    barId: string,
    stocks: Record<string, number>, // productId -> quantity
    initializedByUserId: string
  ): Promise<void> {
    try {
      // Get all bar_products for this bar to get IDs
      const { data: barProducts, error: queryError } = await supabase
        .from('bar_products')
        .select('id, product_id')
        .eq('bar_id', barId);

      if (queryError || !barProducts) {
        throw new Error('Failed to fetch bar products');
      }

      // Create supplies records for each product
      const suppliesRecords = barProducts
        .filter((bp: any) => stocks[bp.product_id] !== undefined)
        .map((bp: any) => ({
          bar_id: barId,
          product_id: bp.product_id,
          quantity_received: stocks[bp.product_id],
          unit_cost: 0, // Would be set from product pricing
          source_type: 'initial_stock' as const,
          notes: 'Initial stock setup during onboarding',
          recorded_by: initializedByUserId,
        }));

      const { error } = await supabase.from('supplies').insert(suppliesRecords as any);

      if (error) {
        throw new Error(`Failed to initialize stock: ${error.message}`);
      }

      // Log audit
      await AuditLogger.log('STOCK_INITIALIZED', {
        bar_id: barId,
        product_count: suppliesRecords.length,
        initialized_by: initializedByUserId,
        description: 'Initial stock initialized during onboarding',
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Update bar operating mode
   * Can be called from BarDetailsStep or anytime before launch
   */
  static async updateBarMode(
    barId: string,
    mode: 'full' | 'simplifié',
    updatedByUserId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({
          operating_mode: mode,
        } as BarUpdate)
        .eq('id', barId)
        .eq('owner_id', updatedByUserId);

      if (error) {
        throw new Error(`Failed to update mode: ${error.message}`);
      }

      await AuditLogger.log('MODE_UPDATED', {
        bar_id: barId,
        mode,
        updated_by: updatedByUserId,
        description: `Operating mode changed to ${mode}`,
      });
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Verify bar is ready for sales
   * Checks all onboarding requirements
   */
  static async verifyBarReady(barId: string): Promise<{
    isReady: boolean;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];

      // Check 1: Bar details complete
      const { data: bar, error: barError } = await supabase
        .from('bars')
        .select('id, name, location, closing_hour, operating_mode, is_setup_complete')
        .eq('id', barId)
        .single();

      if (barError || !bar) {
        errors.push('Bar not found');
        return { isReady: false, errors };
      }

      if (!bar.name || !bar.location) {
        errors.push('Bar details incomplete');
      }

      if (bar.closing_hour === null) {
        errors.push('Closing hour not set');
      }

      // Check 2: At least 1 product
      const { data: products, error: productsError } = await supabase
        .from('bar_products')
        .select('id')
        .eq('bar_id', barId);

      if (productsError) {
        errors.push('Failed to check products');
      }

      if (!products || products.length === 0) {
        errors.push('No products added');
      }

      // Check 3: Stock exists for products (can be 0)
      if (products && products.length > 0) {
        const { count: stockCount, error: stockError } = await supabase
          .from('supplies')
          .select('*', { count: 'exact', head: true })
          .eq('bar_id', barId);

        if (stockError) {
          errors.push('Failed to check stock');
        }

        if (!stockCount || stockCount === 0) {
          errors.push('No stock initialized');
        }
      }

      return {
        isReady: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      return {
        isReady: false,
        errors: [handleSupabaseError(error)],
      };
    }
  }

  /**
   * Get onboarding progress for a bar
   * Useful for resuming or tracking
   */
  static async getOnboardingProgress(barId: string): Promise<{
    barName: string;
    isSetupComplete: boolean;
    completedAt: string | null;
    managerCount: number;
    serverCount: number;
    productCount: number;
    hasStock: boolean;
  }> {
    try {
      // Get bar info
      const { data: bar } = await supabase
        .from('bars')
        .select('name, is_setup_complete, setup_completed_at')
        .eq('id', barId)
        .single();

      // Get counts
      const { count: managerCount } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('role', 'gérant');

      const { count: serverCount } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('role', 'serveur');

      const { count: productCount } = await supabase
        .from('bar_products')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId);

      const { count: stockCount } = await supabase
        .from('supplies')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId);

      return {
        barName: bar?.name || 'Unknown',
        isSetupComplete: bar?.is_setup_complete || false,
        completedAt: bar?.setup_completed_at || null,
        managerCount: managerCount || 0,
        serverCount: serverCount || 0,
        productCount: productCount || 0,
        hasStock: (stockCount || 0) > 0,
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
