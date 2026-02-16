import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { SyncOperationCreateSale } from '../../types/sync';
import { ProductsService } from './products.service';
import { auditLogger } from '../../services/AuditLogger';
import { networkManager } from '../NetworkManager';
import { offlineQueue } from '../offlineQueue';
import { generateUUID } from '../../utils/crypto';
import { toSupabaseJson } from '../../lib/supabase-rpc.types';

export type DBSale = Database['public']['Tables']['sales']['Row'] & {
  idempotency_key?: string;
  ticket_id?: string;
  source_return_id?: string;
  seller?: { name: string };
  validator?: { name: string };
};
type Sale = Database['public']['Tables']['sales']['Row'];
type SaleItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  original_unit_price?: number;
  discount_amount?: number;
  promotion_id?: string;
  promotion_name?: string;
};

export interface CreateSaleData {
  bar_id: string;
  items: SaleItem[];
  payment_method: 'cash' | 'mobile_money' | 'card' | 'credit' | 'ticket';
  sold_by: string;
  server_id?: string;
  validated_by?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  business_date?: string;
  ticket_id?: string;
  source_return_id?: string;
}

export interface OfflineSale {
  id: string;
  bar_id: string;
  total: number;
  subtotal?: number; // Sous-total avant remises
  discount_total?: number; // Total des remises appliquées
  currency?: string; // Devise (XAF, XOF, etc.)
  status: string;
  payment_method: string;
  sold_by: string;
  soldBy?: string; // Alias camelCase pour compatibilité
  created_by?: string; // Créateur (généralement identique à sold_by)
  server_id?: string | null;
  serverId?: string | null; // Alias camelCase
  business_date?: string | null;
  businessDate?: string | null; // Alias camelCase
  created_at: string;
  createdAt?: string; // Alias camelCase
  idempotency_key?: string;
  items: SaleItem[]; // 🛡️ CRITIQUE: Nécessaire pour totalItems calculation
  ticket_id?: string | null;
  ticketId?: string | null; // Alias camelCase
  isOptimistic: boolean;
}

export class SalesService {
  /**
   * Wrapper with timeout for Supabase calls
   */
  private static withTimeout<T>(promise: Promise<T> | any, ms: number = 5000): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms)
    );
    // Supabase queries are PromiseLike
    const actualPromise = promise instanceof Promise ? promise : Promise.resolve(promise);
    return Promise.race([actualPromise, timeout]) as Promise<T>;
  }

  /**
   * Créer une nouvelle vente avec stratégie de résilience offline/online
   */
  static async createSale(
    data: CreateSaleData & { status?: 'pending' | 'validated' },
    options?: {
      canWorkOffline?: boolean;
      userId?: string;
    }
  ): Promise<Sale | OfflineSale> {
    console.log('[SalesService] entering createSale', {
      isOffline: networkManager.getDecision().shouldShowBanner,
      canWorkOffline: options?.canWorkOffline,
      data_sold_by: data.sold_by
    });

    const status = data.status || 'pending';
    const { shouldShowBanner: isOffline } = networkManager.getDecision();

    const idempotencyKey = generateUUID();

    try {
      if (isOffline && options?.canWorkOffline) {
        console.log('[SalesService] NetworkManager says OFFLINE. Triggering immediate fallback');
        return await this.fallbackToOfflineQueue(data, status, idempotencyKey, options);
      }

      console.log('[SalesService] Attempting online RPC (create_sale_idempotent)...');

      // ✅ Timeout avec cleanup pour éviter les memory leaks
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const rpcPromise = supabase.rpc(
        'create_sale_idempotent',
        {
          p_bar_id: data.bar_id,
          p_items: toSupabaseJson(data.items),
          p_payment_method: data.payment_method,
          p_sold_by: data.sold_by,
          p_idempotency_key: idempotencyKey,
          p_server_id: data.server_id ?? undefined,
          p_status: status,
          p_customer_name: data.customer_name ?? undefined,
          p_customer_phone: data.customer_phone ?? undefined,
          p_notes: data.notes ?? undefined,
          p_business_date: data.business_date ?? undefined,
          p_ticket_id: data.ticket_id ?? undefined,
          p_source_return_id: data.source_return_id ?? undefined
        }
      ).single();

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('TIMEOUT_EXCEEDED'));
        }, 5000);
      });

      try {
        const result = await Promise.race([rpcPromise, timeoutPromise]);
        console.log('[SalesService] Race result received');

        // ✅ Cleanup du timeout si la requête réussit
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        // Type guard pour vérifier la structure du résultat Supabase
        if (result && typeof result === 'object' && 'error' in result && result.error) {
          console.error('[SalesService] RPC error detail:', result.error);
          throw result.error;
        }

        // Extraction type-safe de data (Supabase renvoie { data, error })
        if (result && typeof result === 'object' && 'data' in result) {
          return result.data as Sale;
        }

        return result as Sale;

      } catch (err) {
        // ✅ Cleanup du timeout en cas d'erreur
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn('[SalesService] Online failure:', errorMessage);

        if (errorMessage === 'TIMEOUT_EXCEEDED' || errorMessage === 'Failed to fetch' || !navigator.onLine) {
          if (options?.canWorkOffline) {
            console.log('[SalesService] Failing OVER to offline queue');
            return await this.fallbackToOfflineQueue(data, status, idempotencyKey, options);
          }
        }
        throw err;
      }
    } catch (error) {
      console.error('[SalesService] Global failure in createSale:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  private static async fallbackToOfflineQueue(
    data: CreateSaleData,
    status: string,
    idempotencyKey: string,
    options?: { userId?: string }
  ): Promise<OfflineSale> {
    console.log('[SalesService] Fallback: calling offlineQueue.addOperation');
    const queuedOperation = await offlineQueue.addOperation(
      'CREATE_SALE',
      {
        bar_id: data.bar_id,
        items: data.items,
        payment_method: data.payment_method,
        sold_by: data.sold_by,
        server_id: data.server_id || null,
        status,
        customer_name: data.customer_name || null,
        customer_phone: data.customer_phone || null,
        notes: data.notes || null,
        business_date: data.business_date || null,
        ticket_id: data.ticket_id || null,
        idempotency_key: idempotencyKey,
        source_return_id: data.source_return_id || null, // ✨ Fix : Traçabilité Échange
      },
      data.bar_id,
      options?.userId || data.sold_by
    );

    console.log('[SalesService] Fallback success. Operation ID:', queuedOperation.id);

    const subtotal = data.items.reduce((sum, item) => sum + item.total_price, 0);

    return {
      id: queuedOperation.id,
      bar_id: data.bar_id,
      items: data.items,
      subtotal,
      discount_total: 0, // Pas de remise pour les ventes offline (pour l'instant)
      total: subtotal, // Total = subtotal - discount
      currency: 'XAF', // Devise par défaut
      status,
      sold_by: data.sold_by,
      created_by: data.sold_by, // Créateur = vendeur
      created_at: new Date().toISOString(),
      payment_method: data.payment_method,
      business_date: data.business_date || new Date().toISOString().split('T')[0],
      server_id: data.server_id || null,
      ticket_id: data.ticket_id || null,
      idempotency_key: idempotencyKey,
      isOptimistic: true,
    };
  }

  static async validateSale(id: string, validatedBy: string): Promise<void> {
    try {
      // ✅ Expert Fix: Use atomic RPC to ensure both status update AND stock decrement succeed
      const { error } = await supabase.rpc('validate_sale' as any, {
        p_sale_id: id,
        p_validated_by: validatedBy
      });

      if (error) throw error;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  static async rejectSale(id: string, rejectedBy: string): Promise<void> {
    try {
      // ✅ Expert Fix: Use atomic RPC to handle both status update AND
      // conditional stock restoration (only if it was validated)
      const { error } = await supabase.rpc('reject_sale' as any, {
        p_sale_id: id,
        p_rejected_by: rejectedBy
      });

      if (error) throw error;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  static async cancelSale(saleId: string, cancelledBy: string, reason: string): Promise<void> {
    try {

      // Fetch barId for audit log
      const { data: saleData } = await supabase.from('sales').select('bar_id').eq('id', saleId).single();
      const barId = saleData?.bar_id || 'unknown';

      // ✅ Expert Fix: Atomic RPC for Cancellation
      const { data, error } = await supabase.rpc('cancel_sale' as any, {
        p_sale_id: saleId,
        p_cancelled_by: cancelledBy,
        p_reason: reason
      });

      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.message);

      // Audit logs are handled after success
      await auditLogger.log({
        event: 'SALE_CANCELLED',
        severity: 'warning',
        barId: barId,
        description: `Vente annulée - Raison: ${reason}`,
        relatedEntityId: saleId,
        relatedEntityType: 'sale',
        metadata: { reason }
      });
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  static async deleteSale(saleId: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', saleId);

    if (error) throw new Error(handleSupabaseError(error));
  }

  // --- Read Methods (Restored) ---

  static async getSalesByTicketId(ticketId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(handleSupabaseError(error));
    return data || [];
  }

  static async getBarSales(barId: string, options?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    searchTerm?: string; // ✨ NOUVEAU: Recherche textuelle
    limit?: number;
    offset?: number;
  }): Promise<DBSale[]> {
    let query = supabase
      .from('sales')
      .select(`
        *,
        seller:users!sales_sold_by_fkey (name),
        validator:users!sales_validated_by_fkey (name)
      `)
      .eq('bar_id', barId)
      .order('business_date', { ascending: false });

    if (options?.status) query = query.eq('status', options.status);
    if (options?.startDate) query = query.gte('business_date', options.startDate);
    if (options?.endDate) query = query.lte('business_date', options.endDate);

    // ✨ NOUVEAU: Recherche textuelle (Failover)
    if (options?.searchTerm) {
      const term = `%${options.searchTerm}%`;
      // Recherche sur ID, nom du client ou notes
      query = query.or(`id.ilike.${term},customer_name.ilike.${term},notes.ilike.${term}`);
    }

    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

    const { data, error } = await query;
    if (error) throw new Error(handleSupabaseError(error));
    // 🛡️ Fix V12: Strict typing
    return data as unknown as DBSale[];
  }

  static async getSaleById(saleId: string): Promise<Sale & {
    items_count?: number;
    seller_name?: string;
    validator_name?: string;
  }> {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        seller:users!sales_sold_by_fkey (name),
        validator:users!sales_validated_by_fkey (name)
      `)
      .eq('id', saleId)
      .single();

    if (error || !data) throw new Error(handleSupabaseError(error || 'Vente introuvable'));

    // Type enrichi avec les relations
    const enrichedData = data as typeof data & {
      seller?: { name: string } | null;
      validator?: { name: string } | null;
    };

    // Calculer items_count pour l'affichage
    const items = Array.isArray(enrichedData.items) ? enrichedData.items : [];
    const items_count = items.reduce((acc: number, item) => {
      const quantity = typeof item === 'object' && item !== null && 'quantity' in item
        ? Number(item.quantity) || 0
        : 0;
      return acc + quantity;
    }, 0);

    return {
      ...(enrichedData as Sale),
      items_count,
      seller_name: enrichedData.seller?.name,
      validator_name: enrichedData.validator?.name
    } as Sale & {
      items_count?: number;
      seller_name?: string;
      validator_name?: string;
    };
  }

  static async getBarSalesCursorPaginated(
    barId: string,
    options: { limit: number; cursorDate?: string; cursorId?: string }
  ): Promise<any[]> {
    // Phase 3.4.2: Use the new efficient RPC
    const { data, error } = await supabase.rpc('get_bar_sales_cursor', {
      p_bar_id: barId,
      p_limit: options.limit,
      p_cursor_date: options.cursorDate || undefined,
      p_cursor_id: options.cursorId || undefined
    });

    if (error) throw new Error(handleSupabaseError(error));
    return data || [];
  }

  static async getSalesStats(
    barId: string,
    startDate?: Date,
    endDate?: Date,
    serverId?: string
  ): Promise<{
    totalRevenue: number;
    totalSales: number;
    averageSale: number;
  }> {
    // Calcul simple pour les besoins courants (dashboard)
    // Pour l'admin, on utilise admin_as_get_sales_stats via une autre route si besoin
    let query = supabase
      .from('sales')
      .select('total, status, sold_by')
      .eq('bar_id', barId)
      .eq('status', 'validated');

    if (startDate) query = query.gte('business_date', startDate.toISOString().split('T')[0]);
    if (endDate) query = query.lte('business_date', endDate.toISOString().split('T')[0]);
    if (serverId) query = query.eq('sold_by', serverId);

    const result = await this.withTimeout<{
      data: Array<{ total: number; status: string; sold_by: string }> | null;
      error: unknown;
    }>(query);
    const { data, error } = result;
    if (error) throw new Error(handleSupabaseError(error));

    // Agrégations
    const totalRevenue = data?.reduce((sum: number, sale: { total: number }) => sum + (sale.total || 0), 0) || 0;
    const totalSales = data?.length || 0;
    const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

    return { totalRevenue, totalSales, averageSale };
  }

  // --- Offline Data Access (Vision Rayons X) ---

  static async getOfflineSales(barId: string, startDate?: Date, endDate?: Date): Promise<OfflineSale[]> {
    try {
      // 1. Récupérer toutes les opé de type 'CREATE_SALE' en attente ou en cours
      const operations = await offlineQueue.getOperations({ barId });

      const startStr = startDate ? startDate.toISOString().split('T')[0] : null;
      const endStr = endDate ? endDate.toISOString().split('T')[0] : null;

      const pendingSales = operations
        .filter((op): op is SyncOperationCreateSale => op.type === 'CREATE_SALE' && (op.status === 'pending' || op.status === 'syncing'))
        .filter(op => {
          if (!startStr || !endStr) return true;
          const saleDate = op.payload.business_date || new Date(op.timestamp).toISOString().split('T')[0];
          return saleDate >= startStr && saleDate <= endStr;
        })
        .map(op => this.mapOperationToOfflineSale(op, barId));

      return pendingSales;
    } catch (error) {
      console.warn('[SalesService] Failed to fetch offline sales', error);
      return [];
    }
  }

  static async getOfflineSalesByTicketId(ticketId: string): Promise<OfflineSale[]> {
    try {
      const operations = await offlineQueue.getOperations();
      return operations
        .filter((op): op is SyncOperationCreateSale => op.type === 'CREATE_SALE' && op.payload.ticket_id === ticketId && (op.status === 'pending' || op.status === 'syncing'))
        .map(op => this.mapOperationToOfflineSale(op, op.payload.bar_id));
    } catch (error) {
      console.warn('[SalesService] Failed to fetch offline sales for ticket', error);
      return [];
    }
  }

  private static mapOperationToOfflineSale(op: SyncOperationCreateSale, barId: string): OfflineSale {
    const total = op.payload.items.reduce((sum: number, item: SaleItem) => {
      const itemTotal = item.total_price || (item.unit_price * item.quantity) || 0;
      return sum + itemTotal;
    }, 0);
    const createdAtStr = new Date(op.timestamp).toISOString();

    // 🛡️ DUAL-CASING STRATEGY (Phase 15)
    // Garantir que les propriétés clés sont accessibles via les deux conventions
    // pour éviter les bugs de filtrage dans les hooks (useTickets vs useDashboardAnalytics)
    return {
      id: op.id, // ID temporaire
      bar_id: barId,
      total,
      status: 'validated', // On les considère validées pour les stats car le user a "vendu"
      payment_method: op.payload.payment_method,

      // Dual-casing SoldBy
      sold_by: op.payload.sold_by,
      soldBy: op.payload.sold_by,

      // Dual-casing ServerId
      server_id: op.payload.server_id,
      serverId: op.payload.server_id,

      // Dual-casing BusinessDate
      business_date: op.payload.business_date,
      businessDate: op.payload.business_date,

      // Dual-casing TicketId
      ticket_id: op.payload.ticket_id,
      ticketId: op.payload.ticket_id,

      created_at: createdAtStr,
      createdAt: createdAtStr,

      idempotency_key: op.payload.idempotency_key, // 🛡️ Lock Flash: Crucial pour la déduplication
      items: op.payload.items, // 🛡️ CRITIQUE: Items nécessaires pour calculs
      isOptimistic: true // Flag pour l'UI
    };
  }
}
