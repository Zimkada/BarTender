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
}
