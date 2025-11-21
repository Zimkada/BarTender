import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Return = Database['public']['Tables']['returns']['Row'];
type ReturnInsert = Database['public']['Tables']['returns']['Insert'];

export class ReturnsService {
    /**
     * Créer un retour
     */
    static async createReturn(data: ReturnInsert): Promise<Return> {
        try {
            const { data: newReturn, error } = await supabase
                .from('returns')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newReturn;
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer les retours d'un bar
     */
    static async getReturns(barId: string): Promise<Return[]> {
        try {
            const { data, error } = await supabase
                .from('returns')
                .select('*')
                .eq('bar_id', barId)
                .order('returned_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Mettre à jour un retour
     */
    static async updateReturn(id: string, updates: Partial<Return>): Promise<Return> {
        try {
            const { data, error } = await supabase
                .from('returns')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Supprimer un retour
     */
    static async deleteReturn(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('returns')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
