import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Product, Bar, BarMember } from '../../types';

/**
 * ProxyAdminService
 * Handles all RPC calls for "Acting As" impersonation mode
 * These are specialized RPC functions that execute actions on behalf of another user
 * while maintaining audit trails and security checks
 */
export class ProxyAdminService {
  /**
   * Get bar products as a proxy admin impersonating another user
   */
  static async getBarProductsAsProxy(actingAsUserId: string, barId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('admin_as_get_bar_products', {
        p_acting_as_user_id: actingAsUserId,
        p_bar_id: barId,
      });

      if (error) {
        console.error('[ProxyAdminService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des produits');
      }

      return data || [];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Get bar members as a proxy admin impersonating another user
   */
  static async getBarMembersAsProxy(actingAsUserId: string, barId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('admin_as_get_bar_members', {
        p_acting_as_user_id: actingAsUserId,
        p_bar_id: barId,
      });

      if (error) {
        console.error('[ProxyAdminService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des membres');
      }

      return data || [];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Get bars for a user as a proxy admin
   */
  static async getUserBarsAsProxy(actingAsUserId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('admin_as_get_user_bars', {
        p_acting_as_user_id: actingAsUserId,
      });

      if (error) {
        console.error('[ProxyAdminService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des bars');
      }

      return data || [];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Create a sale as another user (proxy admin action)
   */
  static async createSaleAsProxy(
    actingAsUserId: string,
    barId: string,
    saleData: {
      items: any[];
      payment_method: string;
      status?: string;
      customer_name?: string;
      customer_phone?: string;
      notes?: string;
      business_date?: string;
    }
  ): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('admin_as_create_sale', {
        p_acting_as_user_id: actingAsUserId,
        p_bar_id: barId,
        p_items: saleData.items,
        p_payment_method: saleData.payment_method,
        p_status: saleData.status || 'pending',
        p_customer_name: saleData.customer_name || null,
        p_customer_phone: saleData.customer_phone || null,
        p_notes: saleData.notes || null,
        p_business_date: saleData.business_date ? new Date(saleData.business_date) : null,
      });

      if (error) {
        console.error('[ProxyAdminService] RPC error:', error);
        throw new Error('Erreur lors de la création de la vente');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Update stock as a proxy admin for another user
   */
  static async updateStockAsProxy(
    actingAsUserId: string,
    productId: string,
    quantityChange: number
  ): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('admin_as_update_stock', {
        p_acting_as_user_id: actingAsUserId,
        p_product_id: productId,
        p_quantity_change: quantityChange,
      });

      if (error) {
        console.error('[ProxyAdminService] RPC error:', error);
        throw new Error('Erreur lors de la mise à jour du stock');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
