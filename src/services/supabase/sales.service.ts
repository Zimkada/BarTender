import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { ProductsService } from './products.service';

type Sale = Database['public']['Tables']['sales']['Row'];
type SaleInsert = Database['public']['Tables']['sales']['Insert'];

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface CreateSaleData {
  bar_id: string;
  items: SaleItem[];
  payment_method: 'cash' | 'mobile_money' | 'card' | 'credit';
  sold_by: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
}

export interface SaleWithDetails extends Sale {
  seller_name: string;
  validator_name?: string | null;
  items_count: number;
}

/**
 * Service de gestion des ventes
 */
export class SalesService {
  /**
   * Créer une nouvelle vente
   * Statut initial: 'pending' (nécessite validation gérant)
   */
  static async createSale(data: CreateSaleData & { status?: 'pending' | 'validated' }): Promise<Sale> {
    try {
      console.log('[SalesService] Creating sale with data:', {
        sold_by: data.sold_by,
        bar_id: data.bar_id,
        items_count: data.items.length,
        items: data.items
      });

      // 1. Calculer les totaux
      const subtotal = data.items.reduce((sum, item) => {
        console.log('[SalesService] Item:', item, 'total_price:', item.total_price);
        return sum + (item.total_price || 0);
      }, 0);

      console.log('[SalesService] Calculated subtotal:', subtotal);
      const discount_total = 0; // TODO: Calculer avec les promotions
      const total = subtotal - discount_total;

      // 2. Déterminer le statut et les champs de validation
      const status = data.status || 'pending';
      const validationFields = status === 'validated' ? {
        validated_by: data.sold_by,
        validated_at: new Date().toISOString(),
      } : {};

      // 3. Créer la vente
      const { data: newSale, error: saleError } = await supabase
        .from('sales')
        .insert({
          bar_id: data.bar_id,
          items: data.items as any,
          subtotal,
          discount_total,
          total,
          payment_method: data.payment_method,
          status,
          created_by: data.sold_by,
          sold_by: data.sold_by,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          notes: data.notes,
          ...validationFields
        })
        .select()
        .single();

      if (saleError || !newSale) {
        console.error('[SalesService] Sale creation error:', saleError);
        throw new Error('Erreur lors de la création de la vente');
      }

      console.log('[SalesService] Sale created successfully with sold_by:', data.sold_by);

      // 3. Décrémenter le stock pour chaque produit
      for (const item of data.items) {
        await ProductsService.decrementStock(item.product_id, item.quantity);
      }

      return newSale;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Valider une vente (gérant/promoteur uniquement)
   */
  static async validateSale(saleId: string, validatedBy: string): Promise<Sale> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .update({
          status: 'validated',
          validated_by: validatedBy,
          validated_at: new Date().toISOString(),
        })
        .eq('id', saleId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la validation de la vente');
      }

      // TODO: Créer une transaction comptable

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Rejeter une vente (gérant/promoteur uniquement)
   * Restaure le stock
   */
  static async rejectSale(saleId: string, validatedBy: string): Promise<Sale> {
    try {
      // 1. Récupérer la vente pour restaurer le stock
      const { data: sale } = await supabase
        .from('sales')
        .select('items')
        .eq('id', saleId)
        .single();

      if (!sale) {
        throw new Error('Vente introuvable');
      }

      // 2. Restaurer le stock
      const items = sale.items as SaleItem[];
      for (const item of items) {
        await ProductsService.incrementStock(item.product_id, item.quantity);
      }

      // 3. Marquer la vente comme rejetée
      const { data, error } = await supabase
        .from('sales')
        .update({
          status: 'rejected',
          validated_by: validatedBy,
          validated_at: new Date().toISOString(),
        })
        .eq('id', saleId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors du rejet de la vente');
      }

      return data;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer toutes les ventes d'un bar
   */
  static async getBarSales(
    barId: string,
    options?: {
      status?: 'pending' | 'validated' | 'rejected';
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<SaleWithDetails[]> {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          seller:users!sales_created_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('bar_id', barId)
        .order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.startDate) {
        query = query.gte('created_at', options.startDate);
      }

      if (options?.endDate) {
        query = query.lte('created_at', options.endDate);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des ventes');
      }

      return (data || []).map((sale: any) => ({
        ...sale,
        seller_name: sale.seller?.name || 'Inconnu',
        validator_name: sale.validator?.name || null,
        items_count: (sale.items as SaleItem[]).length,
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer une vente par ID
   */
  static async getSaleById(saleId: string): Promise<SaleWithDetails | null> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          seller:users!sales_created_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('id', saleId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        ...data,
        seller_name: (data.seller as any)?.name || 'Inconnu',
        validator_name: (data.validator as any)?.name || null,
        items_count: (data.items as SaleItem[]).length,
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les ventes en attente de validation
   */
  static async getPendingSales(barId: string): Promise<SaleWithDetails[]> {
    return this.getBarSales(barId, { status: 'pending' });
  }

  /**
   * Récupérer les ventes validées
   */
  static async getValidatedSales(
    barId: string,
    startDate?: string,
    endDate?: string
  ): Promise<SaleWithDetails[]> {
    return this.getBarSales(barId, { status: 'validated', startDate, endDate });
  }

  /**
   * Récupérer les statistiques de vente d'un bar
   */
  static async getSalesStats(
    barId: string,
    period: 'today' | 'week' | 'month' | 'all' = 'today'
  ): Promise<{
    totalSales: number;
    totalRevenue: number;
    pendingSales: number;
    averageSale: number;
  }> {
    try {
      // Calculer la date de début selon la période
      let startDate: Date | null = null;
      const now = new Date();

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'all':
          startDate = null;
          break;
      }

      // Ventes validées
      let validatedQuery = supabase
        .from('sales')
        .select('total')
        .eq('bar_id', barId)
        .eq('status', 'validated');

      if (startDate) {
        validatedQuery = validatedQuery.gte('created_at', startDate.toISOString());
      }

      const { data: validatedSales } = await validatedQuery;

      const totalRevenue = (validatedSales || []).reduce((sum, sale) => sum + (sale.total || 0), 0);
      const totalSales = validatedSales?.length || 0;
      const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

      // Ventes en attente
      const { count: pendingCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('status', 'pending');

      return {
        totalSales,
        totalRevenue,
        pendingSales: pendingCount || 0,
        averageSale,
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les ventes par utilisateur (serveur)
   */
  static async getSalesByUser(
    barId: string,
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<SaleWithDetails[]> {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          seller:users!sales_created_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('bar_id', barId)
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des ventes');
      }

      return (data || []).map((sale: any) => ({
        ...sale,
        seller_name: sale.seller?.name || 'Inconnu',
        validator_name: sale.validator?.name || null,
        items_count: (sale.items as SaleItem[]).length,
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer le top des produits vendus
   */
  static async getTopProducts(
    barId: string,
    limit: number = 10,
    startDate?: string,
    endDate?: string
  ): Promise<Array<{ product_name: string; quantity: number; revenue: number }>> {
    try {
      let query = supabase
        .from('sales')
        .select('items')
        .eq('bar_id', barId)
        .eq('status', 'validated');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data: sales } = await query;

      if (!sales) {
        return [];
      }

      // Agréger les produits vendus
      const productMap = new Map<string, { quantity: number; revenue: number }>();

      sales.forEach((sale) => {
        const items = sale.items as SaleItem[];
        items.forEach((item) => {
          const existing = productMap.get(item.product_name) || { quantity: 0, revenue: 0 };
          productMap.set(item.product_name, {
            quantity: existing.quantity + item.quantity,
            revenue: existing.revenue + item.total_price,
          });
        });
      });

      // Convertir en array et trier
      const topProducts = Array.from(productMap.entries())
        .map(([product_name, stats]) => ({
          product_name,
          ...stats,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);

      return topProducts;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Supprimer une vente (admin uniquement)
   * Restaure le stock si la vente était pending
   */
  static async deleteSale(saleId: string): Promise<void> {
    try {
      // 1. Récupérer la vente
      const { data: sale } = await supabase
        .from('sales')
        .select('items, status')
        .eq('id', saleId)
        .single();

      if (!sale) {
        throw new Error('Vente introuvable');
      }

      // 2. Restaurer le stock si la vente était pending
      if (sale.status === 'pending') {
        const items = sale.items as SaleItem[];
        for (const item of items) {
          await ProductsService.incrementStock(item.product_id, item.quantity);
        }
      }

      // 3. Supprimer la vente
      const { error } = await supabase.from('sales').delete().eq('id', saleId);

      if (error) {
        throw new Error('Erreur lors de la suppression de la vente');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
