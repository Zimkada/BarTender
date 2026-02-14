import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Supply = Database['public']['Tables']['supplies']['Row'];
type SupplyInsert = Database['public']['Tables']['supplies']['Insert'];
type Consignment = Database['public']['Tables']['consignments']['Row'];
type ConsignmentInsert = Database['public']['Tables']['consignments']['Insert'];
type ConsignmentUpdate = Database['public']['Tables']['consignments']['Update'];

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

            // Helper to apply date filters
            const applyFilters = (query: any, dateField: string) => {
                if (startDate) query = query.gte(dateField, startDate.toISOString());
                if (endDate) query = query.lte(dateField, endDate.toISOString());
                // Only apply limit if NO date filter is set (or strict limit requested)
                // If user asks for a date range, we want ALL items in that range generally
                if (!startDate && !endDate) {
                    query = query.limit(limit);
                } else {
                    query = query.limit(1000); // Safety cap for date range
                }
                return query;
            };

            // 1. Fetch all sources in parallel
            const [sales, supplies, consignments, adjustments] = await Promise.all([
                // A. Sales (Items)
                applyFilters(
                    supabase
                        .from('sale_items')
                        .select('*, sale:sales!inner(business_date, created_at, ticket_id, sold_by, users!sales_sold_by_fkey(name))')
                        .eq('product_id', productId)
                        .eq('sale.bar_id', barId)
                        .order('created_at', { ascending: false }),
                    'sale.created_at'
                ),

                // B. Supplies
                applyFilters(
                    supabase
                        .from('supplies')
                        .select('*, users!supplies_created_by_fkey(name)')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('created_at', { ascending: false }),
                    'created_at'
                ),

                // C. Consignments
                applyFilters(
                    supabase
                        .from('consignments')
                        .select('*, users!consignments_created_by_fkey(name)')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('created_at', { ascending: false }),
                    'created_at'
                ),

                // D. Adjustments
                applyFilters(
                    supabase
                        .from('stock_adjustments')
                        .select('*, users!stock_adjustments_adjusted_by_fkey(name)')
                        .eq('product_id', productId)
                        .eq('bar_id', barId)
                        .order('adjusted_at', { ascending: false }),
                    'adjusted_at'
                )
            ]);

            if (sales.error) throw sales.error;
            if (supplies.error) throw supplies.error;
            if (consignments.error) throw consignments.error;
            if (adjustments.error) throw adjustments.error;

            // 2. Normalize Data
            const timeline = [
                // Sales
                ...(sales.data || []).map(s => ({
                    id: s.id,
                    type: 'sale',
                    date: new Date((s.sale as any).created_at),
                    delta: -s.quantity, // Sale decreases stock
                    label: 'Vente',
                    user: (s.sale as any).users?.name || 'Inconnu',
                    details: `Ticket #${(s.sale as any).ticket_id || '??'}`,
                    price: s.unit_price,
                    notes: (s.sale as any).business_date
                })),

                // Supplies
                ...(supplies.data || []).map(s => ({
                    id: s.id,
                    type: 'supply',
                    date: new Date(s.created_at),
                    delta: s.quantity, // Supply increases stock
                    label: 'Approvisionnement',
                    user: (s as any).users?.name || 'Inconnu',
                    details: s.supplier || 'Fournisseur Inconnu',
                    price: s.lot_price,
                    notes: `Coût: ${s.total_cost}`
                })),

                // Consignments
                ...(consignments.data || []).map(c => ({
                    id: c.id,
                    type: 'consignment',
                    date: new Date(c.created_at),
                    delta: -c.quantity, // Consignment decreases physical stock (moved to outside)
                    label: `Consignation (${c.status})`,
                    user: (c as any).users?.name || 'Inconnu',
                    details: c.customer_name || 'Client',
                    price: 0,
                    notes: c.status
                })),

                // Adjustments
                ...(adjustments.data || []).map(a => ({
                    id: a.id,
                    type: 'adjustment',
                    date: new Date(a.adjusted_at),
                    delta: a.delta,
                    label: `Ajustement (${a.reason})`,
                    user: (a as any).users?.name || 'Inconnu',
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
