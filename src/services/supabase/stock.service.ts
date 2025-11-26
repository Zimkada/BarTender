import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Supply = Database['public']['Tables']['supplies']['Row'];
type SupplyInsert = Database['public']['Tables']['supplies']['Insert'];
type Consignment = Database['public']['Tables']['consignments']['Row'];
type ConsignmentInsert = Database['public']['Tables']['consignments']['Insert'];

export class StockService {
    // =====================================================
    // APPROVISIONNEMENTS (SUPPLIES)
    // =====================================================

    static async getSupplies(barId: string): Promise<Supply[]> {
        try {
            const { data, error } = await supabase
                .from('supplies')
                .select('*, bar_product:bar_products(display_name)')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error: any) {
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
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    // =====================================================
    // CONSIGNATIONS (CONSIGNMENTS)
    // =====================================================

    static async getConsignments(barId: string): Promise<Consignment[]> {
        try {
            const { data, error } = await supabase
                .from('consignments')
                .select('*')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error: any) {
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
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    static async updateConsignmentStatus(
        id: string,
        status: 'active' | 'returned' | 'sold',
        updates: Partial<Consignment> = {}
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
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
