import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { ProductsService } from './products.service';

type Sale = Database['public']['Tables']['sales']['Row'];
type SaleInsert = Database['public']['Tables']['sales']['Insert'];

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;           // Prix unitaire FINAL (après promo)
  total_price: number;           // Prix total FINAL (après promo)

  // ✨ NOUVEAU : Champs pour traçabilité des promotions
  original_unit_price?: number;  // Prix unitaire AVANT promo
  discount_amount?: number;      // Montant de la réduction TOTALE
  promotion_id?: string;         // ID de la promotion appliquée
  promotion_name?: string;       // Nom de la promotion (pour affichage)
}

export interface CreateSaleData {
  bar_id: string;
  items: SaleItem[];
  payment_method: 'cash' | 'mobile_money' | 'card' | 'credit';
  sold_by: string;
  server_id?: string; // ✨ NOUVEAU: UUID du serveur assigné (mode switching support)
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  business_date?: string; // Ajouté pour le mode offline-first
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
   * Utilise une fonction RPC atomique pour garantir la cohérence des données
   * Statut initial: 'pending' (nécessite validation gérant)
   */
  static async createSale(data: CreateSaleData & { status?: 'pending' | 'validated' }): Promise<Sale> {
    try {
      const status = data.status || 'pending';

      // ✨ Utiliser la fonction RPC atomique pour créer la vente avec promotions
      const { data: newSale, error: rpcError } = await supabase.rpc(
        'create_sale_with_promotions',
        {
          p_bar_id: data.bar_id,
          p_items: data.items,
          p_payment_method: data.payment_method,
          p_sold_by: data.sold_by,
          p_server_id: data.server_id || null, // ✨ NOUVEAU: Mode switching support
          p_status: status,
          p_customer_name: data.customer_name || null,
          p_customer_phone: data.customer_phone || null,
          p_notes: data.notes || null,
          p_business_date: data.business_date || null // ✅ Passage du paramètre
        }
      ).single();

      if (rpcError) {
        throw new Error(`Erreur lors de la création de la vente: ${rpcError.message}`);
      }

      if (!newSale) {
        throw new Error('Erreur lors de la création de la vente: aucune donnée retournée');
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
          rejected_by: validatedBy,
          rejected_at: new Date().toISOString(),
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
      offset?: number; // ✨ Nouveau: support pagination offset
    }
  ): Promise<SaleWithDetails[]> {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          seller:users!sales_sold_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('bar_id', barId)
        .order('business_date', { ascending: false }); // ✅ Tri par business_date

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.startDate) {
        query = query.gte('business_date', options.startDate); // ✅ Filtre par business_date
      }

      if (options?.endDate) {
        query = query.lte('business_date', options.endDate); // ✅ Filtre par business_date
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1); // ✨ Pagination avec offset
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des ventes');
      }

      return (data || []).map((sale: any) => ({
        ...sale,
        items: sale.items || [], // Ensure items is always an array
        seller_name: sale.seller?.name || 'Inconnu',
        validator_name: sale.validator?.name || null,
        items_count: (sale.items || []).length, // Also guard here
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer toutes les ventes de TOUS les bars (pour Super Admin)
   */
  static async getAllSales(
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
          seller:users!sales_sold_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .order('business_date', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.startDate) {
        query = query.gte('business_date', options.startDate);
      }
      if (options?.endDate) {
        query = query.lte('business_date', options.endDate);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération de toutes les ventes');
      }

      return (data || []).map((sale: any) => ({
        ...sale,
        items: sale.items || [],
        seller_name: sale.seller?.name || 'Inconnu',
        validator_name: sale.validator?.name || null,
        items_count: (sale.items || []).length,
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
          seller:users!sales_sold_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('id', saleId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        ...data,
        items: data.items || [], // Ensure items is always an array
        seller_name: (data.seller as any)?.name || 'Inconnu',
        validator_name: (data.validator as any)?.name || null,
        items_count: (data.items as SaleItem[] || []).length,
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
   * Optionnellement filtrer par serverId (pour voir uniquement ses ventes)
   */
  static async getSalesStats(
    barId: string,
    startDate?: string,
    endDate?: string,
    serverId?: string
  ): Promise<{
    totalSales: number;
    totalRevenue: number;
    pendingSales: number;
    averageSale: number;
  }> {
    try {
      // Ventes validées (Filtre sur business_date)
      let validatedQuery = supabase
        .from('sales')
        .select('id, total, server_id, created_by, business_date, status')
        .eq('bar_id', barId)
        .eq('status', 'validated');

      if (startDate) {
        validatedQuery = validatedQuery.gte('business_date', startDate);
      }

      if (endDate) {
        validatedQuery = validatedQuery.lte('business_date', endDate);
      }

      const { data: allValidatedSales } = await validatedQuery;

      // ✨ MODE SWITCHING FIX: Filter by server with client-side OR logic
      // Apply server filter in JavaScript to ensure proper AND/OR precedence
      // A server should see sales where they are EITHER the assigned server OR the seller
      let validatedSales = allValidatedSales || [];
      if (serverId) {
        validatedSales = validatedSales.filter((sale: any) =>
          sale.server_id === serverId || sale.sold_by === serverId
        );

        // 🔍 DEBUG: Log sales data for mode switching analysis
        console.log('[SalesService.getSalesStats] Query results:', {
          barId,
          serverId,
          startDate,
          endDate,
          totalBeforeFilter: allValidatedSales?.length || 0,
          totalAfterFilter: validatedSales.length,
          salesDetails: validatedSales.map((s: any) => ({
            id: s.id,
            total: s.total,
            server_id: s.server_id,
            created_by: s.created_by,
            business_date: s.business_date
          }))
        });
      }

      const totalRevenue = validatedSales.reduce((sum: number, sale: any) => sum + (sale.total || 0), 0);
      const totalSales = validatedSales.length;
      const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

      // 🔍 DEBUG: Log calculated totals
      if (serverId) {
        console.log('[SalesService.getSalesStats] Calculated totals:', {
          totalSales,
          totalRevenue,
          averageSale
        });
      }

      // Ventes en attente (Toujours temps réel, pas de filtre date nécessaire généralement, ou created_at)
      const { data: allPendingSales } = await supabase
        .from('sales')
        .select('id, server_id, created_by')
        .eq('bar_id', barId)
        .eq('status', 'pending');

      // ✨ MODE SWITCHING FIX: Filter by server with client-side OR logic
      let pendingCount = allPendingSales?.length || 0;
      if (serverId && allPendingSales) {
        const filteredPending = allPendingSales.filter((sale: any) =>
          sale.server_id === serverId || sale.created_by === serverId
        );
        pendingCount = filteredPending.length;
      }

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
          seller:users!sales_sold_by_fkey (name),
          validator:users!sales_validated_by_fkey (name)
        `)
        .eq('bar_id', barId)
        .eq('created_by', userId)
        .order('business_date', { ascending: false }); // Tri par business_date

      if (startDate) {
        query = query.gte('business_date', startDate); // Filtre par business_date
      }

      if (endDate) {
        query = query.lte('business_date', endDate); // Filtre par business_date
      }

      const { data, error } = await query;

      if (error) {
        throw new Error('Erreur lors de la récupération des ventes');
      }

      return (data || []).map((sale: any) => ({
        ...sale,
        seller_name: sale.seller?.name || 'Inconnu',
        validator_name: sale.validator?.name || null, // Accès correct
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
        query = query.gte('business_date', startDate);
      }

      if (endDate) {
        query = query.lte('business_date', endDate);
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
   * Récupérer les ventes paginées d'un bar via RPC (utilisé par les admins)
   * Utilise admin_as_get_bar_sales RPC pour contourner les RLS si nécessaire
   */
  static async getBarSalesPaginated(
    barId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<SaleWithDetails[]> {
    try {
      const { data, error } = await supabase.rpc('admin_as_get_bar_sales', {
        p_acting_as_user_id: null,
        p_bar_id: barId,
        p_limit: options?.limit || 50,
        p_offset: options?.offset || 0,
      });

      if (error) {
        console.error('[SalesService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des ventes paginées');
      }

      // data is JSONB array from RPC
      const sales = (data || []) as any[];
      return sales.map((sale: any) => ({
        ...sale,
        items: sale.items || [],
        seller_name: sale.seller_name || 'Inconnu',
        validator_name: sale.validator_name || null,
        items_count: (sale.items || []).length,
      }));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les ventes avec cursor pagination via RPC (utilisé par les admins)
   * Plus efficace que offset pour les gros datasets et données temps réel
   * Cursor utilise clé composite (business_date, id)
   */
  static async getBarSalesCursorPaginated(
    barId: string,
    options?: {
      limit?: number;
      cursorDate?: string; // ISO timestamp YYYY-MM-DD ou null pour première page
      cursorId?: string; // UUID ou null pour première page
    }
  ): Promise<SaleWithDetails[]> {
    try {
      const { data, error } = await supabase.rpc('admin_as_get_bar_sales_cursor', {
        p_acting_as_user_id: null,
        p_bar_id: barId,
        p_limit: options?.limit || 50,
        p_cursor_date: options?.cursorDate || null,
        p_cursor_id: options?.cursorId || null,
      });

      if (error) {
        console.error('[SalesService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des ventes avec cursor pagination');
      }

      // data est JSONB array depuis RPC, chaque item inclut info cursor
      const sales = (data || []) as any[];
      return sales.map((sale: any) => ({
        ...sale,
        items: sale.items || [],
        seller_name: sale.seller_name || 'Inconnu',
        validator_name: sale.validator_name || null,
        items_count: (sale.items || []).length,
      }));
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
