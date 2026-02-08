import { supabase, handleSupabaseError } from '../../lib/supabase';
import { StockAdjustment, AdjustmentReason } from '../../types';
import type { Database } from '../../lib/database.types';

type DBStockAdjustment = Database['public']['Tables']['stock_adjustments']['Row'];

/**
 * Map database snake_case to frontend camelCase
 */
function mapToFrontend(dbAdjustment: DBStockAdjustment): StockAdjustment {
  return {
    id: dbAdjustment.id,
    barId: dbAdjustment.bar_id,
    productId: dbAdjustment.product_id,
    oldStock: dbAdjustment.old_stock,
    newStock: dbAdjustment.new_stock,
    delta: dbAdjustment.delta,
    reason: dbAdjustment.reason as AdjustmentReason,
    notes: dbAdjustment.notes ?? undefined,
    adjustedBy: dbAdjustment.adjusted_by,
    adjustedAt: new Date(dbAdjustment.adjusted_at),
    createdAt: new Date(dbAdjustment.created_at)
  };
}

export const StockAdjustmentsService = {
  /**
   * Create a new stock adjustment via RPC
   * Atomically: INSERT adjustment + UPDATE product stock
   * Server-side validation: promoteur only, valid reason, notes if needed
   */
  async createAdjustment(data: {
    barId: string;
    productId: string;
    delta: number; // +10 or -5
    reason: string;
    notes?: string;
  }): Promise<StockAdjustment> {
    try {
      const { data: adjustment, error } = await supabase.rpc(
        'create_stock_adjustment',
        {
          p_bar_id: data.barId,
          p_product_id: data.productId,
          p_delta: data.delta,
          p_reason: data.reason,
          p_notes: data.notes ?? undefined
        }
      ).single();

      if (error) throw error;
      return mapToFrontend(adjustment as DBStockAdjustment);
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Get adjustment history for a specific product
   */
  async getProductAdjustments(productId: string): Promise<StockAdjustment[]> {
    try {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('*')
        .eq('product_id', productId)
        .order('adjusted_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(adj => mapToFrontend(adj));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Get all adjustments for a bar (admin/reporting)
   */
  async getBarAdjustments(barId: string): Promise<StockAdjustment[]> {
    try {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('*')
        .eq('bar_id', barId)
        .order('adjusted_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(adj => mapToFrontend(adj));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
};
