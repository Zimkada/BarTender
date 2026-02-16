import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Supply = Database['public']['Tables']['supplies']['Row'];
type SupplyInsert = Database['public']['Tables']['supplies']['Insert'];
type Consignment = Database['public']['Tables']['consignments']['Row'];
type ConsignmentInsert = Database['public']['Tables']['consignments']['Insert'];
type ConsignmentUpdate = Database['public']['Tables']['consignments']['Update'];
type StockAdjustment = Database['public']['Tables']['stock_adjustments']['Row'];

type JoinedSale = Database['public']['Tables']['sales']['Row'] & {
    users: { name: string } | null;
};

type JoinedConsignment = Database['public']['Tables']['consignments']['Row'] & {
    users: { name: string } | null;
};

type JoinedAdjustment = StockAdjustment & {
    users: { name: string } | null;
};

export class StockService {
    // =====================================================
    // APPROVISIONNEMENTS (SUPPLIES)
    // =====================================================

    static async getSupplies(
        barId: string,
        options?: {
            limit?: number;
            offset?: number;
        }
    ): Promise<Supply[]> {
        try {
            let query = supabase
                .from('supplies')
                .select('*, bar_product:bar_products(display_name)')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (options?.limit) {
                query = query.limit(options.limit);
            }

            if (options?.offset) {
                query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    static async createSupply(data: SupplyInsert): Promise<Supply> {
        try {
            const { data: newSupply, error } = await supabase
                .from('supplies')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newSupply;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    static async createSupplyAndUpdateProduct(params: {
        p_bar_id: string;
        p_product_id: string;
        p_quantity: number;
        p_lot_price: number;
        p_lot_size: number;
        p_supplier: string;
        p_created_by: string;
    }) {
        try {
            const { data, error } = await supabase.rpc('create_supply_and_update_product', params);

            if (error) {
                throw error;
            }
            return data;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    // =====================================================
    // CONSIGNATIONS (CONSIGNMENTS)
    // =====================================================

    static async getConsignments(
        barId: string,
        options?: {
            limit?: number;
            offset?: number;
        }
    ): Promise<Consignment[]> {
        try {
            let query = supabase
                .from('consignments')
                .select('*')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (options?.limit) {
                query = query.limit(options.limit);
            }

            if (options?.offset) {
                query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    static async createConsignment(data: ConsignmentInsert): Promise<Consignment> {
        try {
            const { data: newConsignment, error } = await supabase
                .from('consignments')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newConsignment;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    static async updateConsignmentStatus(
        id: string,
        status: 'active' | 'claimed' | 'expired' | 'forfeited',
        updates: ConsignmentUpdate = {}
    ): Promise<Consignment> {
        try {
            const { data, error } = await supabase
                .from('consignments')
                .update({ status, ...updates })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    // =====================================================
    // BATCH OPERATIONS FOR ONBOARDING
    // =====================================================

    /**
     * Upsert batch d'approvisionnements pour un bar
     * Utilisé par onboarding pour initialiser le stock de multiple produits
     * Support du onConflict pour éviter les doublons (bar_id, product_id, supplied_at)
     */
    static async batchUpsertSupplies(
        barId: string,
        supplies: Array<{ productId: string; quantity: number; suppliedBy: string }>
    ): Promise<Supply[]> {
        try {
            const suppliesRecords = supplies.map(s => ({
                bar_id: barId,
                product_id: s.productId,
                quantity: s.quantity,
                unit_cost: 0,
                total_cost: 0,
                notes: 'Initial stock setup',
                supplied_by: s.suppliedBy,
            }));

            const { data, error } = await supabase
                .from('supplies')
                .upsert(suppliesRecords as SupplyInsert[], { onConflict: 'bar_id,product_id,supplied_at' })
                .select();

            if (error || !data) {
                throw new Error('Erreur lors de l\'initialisation du stock');
            }

            return data;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    // =====================================================
    // PRODUCT HISTORY (TIMELINE)
    // =====================================================

    /**
     * Aggregates all movements for a specific product to build a timeline
     */
    static async getProductHistory(
        barId: string,
        productId: string,
        options: {
            limit?: number;
            startDate?: Date;
            endDate?: Date;
        } = {}
    ): Promise<any[]> {
        try {
            const { limit = 50, startDate, endDate } = options;

            // Helper to format date as YYYY-MM-DD
            const toYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];

            // 1. Fetch all sources in parallel
            const [sales, supplies, consignments, adjustments] = await Promise.all([
                // A. Sales (Use business_date and containment filter)
                (() => {
                    let q = supabase
                        .from('sales')
                        .select('*, users!sales_sold_by_fkey(name)')
                        .eq('bar_id', barId)
                        .filter('items', 'cs', `[{"product_id": "${productId}"}]`)
                        .order('created_at', { ascending: false });

                    if (startDate) q = q.gte('business_date', toYYYYMMDD(startDate));
                    if (endDate) q = q.lte('business_date', toYYYYMMDD(endDate));

                    // Fetch enough to sort correctly with other sources
                    return q.limit(limit * 2);
                })(),

                // B. Supplies (Use created_at)
                (() => {
                    let q = supabase
                        .from('supplies')
                        .select('*')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('created_at', { ascending: false });

                    if (startDate) q = q.gte('created_at', startDate.toISOString());
                    if (endDate) q = q.lte('created_at', endDate.toISOString());
                    return q.limit(limit);
                })(),

                // C. Consignments (Use business_date)
                (() => {
                    let q = supabase
                        .from('consignments')
                        .select('*, users!consignments_created_by_fkey(name)')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('created_at', { ascending: false });

                    if (startDate) q = q.gte('business_date', toYYYYMMDD(startDate));
                    if (endDate) q = q.lte('business_date', toYYYYMMDD(endDate));
                    return q.limit(limit);
                })(),

                // D. Adjustments (Use adjusted_at)
                (() => {
                    let q = supabase
                        .from('stock_adjustments')
                        .select('*, users!stock_adjustments_adjusted_by_fkey(name)')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('adjusted_at', { ascending: false });

                    if (startDate) q = q.gte('adjusted_at', startDate.toISOString());
                    if (endDate) q = q.lte('adjusted_at', endDate.toISOString());
                    return q.limit(limit);
                })()
            ]);

            if (sales.error) throw sales.error;
            if (supplies.error) throw supplies.error;
            if (consignments.error) throw consignments.error;
            if (adjustments.error) throw adjustments.error;

            // 2. Normalize Data
            const timeline = [
                // Sales - Filtered in JS for reliability
                ...(sales.data as JoinedSale[] || [])
                    .filter(s => (s.items as any[] || []).some(i => i.product_id === productId))
                    .flatMap(s => {
                        const items = s.items as any[];
                        const item = items.find(i => i.product_id === productId);
                        if (!item) return [];

                        return [{
                            id: s.id,
                            type: 'sale' as const,
                            date: new Date(s.created_at || ''),
                            delta: -item.quantity,
                            label: s.status === 'pending' ? 'Vente (En attente)' : 'Vente',
                            user: s.users?.name || 'Inconnu',
                            details: `Ticket #${s.ticket_id || '??'}`,
                            price: item.unit_price,
                            notes: s.business_date,
                            status: s.status // 🔥 Added status field
                        }];
                    }),

                // Supplies
                ...(supplies.data as Supply[] || []).map(s => ({
                    id: s.id,
                    type: 'supply' as const,
                    date: new Date(s.created_at || ''),
                    delta: s.quantity,
                    label: 'Approvisionnement',
                    user: s.supplied_by || 'Admin', // String column, no join
                    details: s.supplier_name || 'Fournisseur Inconnu',
                    price: s.unit_cost,
                    notes: `Total: ${s.total_cost}`
                })),

                // Consignments
                ...(consignments.data as JoinedConsignment[] || []).map(c => ({
                    id: c.id,
                    type: 'consignment' as const,
                    date: new Date(c.created_at || ''),
                    delta: -c.quantity,
                    label: `Consignation (${c.status})`,
                    user: c.users?.name || 'Inconnu',
                    details: c.customer_name || 'Client',
                    price: 0,
                    notes: c.status
                })),

                // Adjustments
                ...(adjustments.data as JoinedAdjustment[] || []).map(a => ({
                    id: a.id,
                    type: 'adjustment' as const,
                    date: new Date(a.adjusted_at || ''),
                    delta: a.delta,
                    label: `Ajustement (${a.reason})`,
                    user: a.users?.name || 'Inconnu',
                    details: a.reason,
                    price: 0,
                    notes: a.notes
                }))
            ];

            // 3. Sort by Date Descending
            return timeline.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);

        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
