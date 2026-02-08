import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

// 🛡️ Fix V12: Strict Typing for Returns
export type DBReturn = Database['public']['Tables']['returns']['Row'];

type ReturnInsert = Database['public']['Tables']['returns']['Insert'];
type ReturnUpdate = Database['public']['Tables']['returns']['Update'];

export class ReturnsService {
    /**
     * Créer un retour
     */
    static async createReturn(data: ReturnInsert): Promise<DBReturn> {
        try {
            const { data: newReturn, error } = await supabase
                .from('returns')
                .insert(data)
                .select()
                .single();

            if (error) throw error;
            return newReturn as DBReturn;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer les retours d'un bar
     * Optionnellement filtrer par serverId (pour voir uniquement ses retours)
     */
    static async getReturns(
        barId: string,
        startDate?: Date | string,
        endDate?: Date | string,
        serverId?: string,
        _operatingMode?: 'full' | 'simplified'
    ): Promise<DBReturn[]> {
        try {
            // Helper pour formater la date au format YYYY-MM-DD attendu par PostgreSQL
            const formatToYYYYMMDD = (date: Date | string): string => {
                if (typeof date === 'string') return date; // Si c'est déjà une chaîne, on la retourne
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            let query = supabase
                .from('returns')
                .select('*')
                .eq('bar_id', barId)
                .order('returned_at', { ascending: false });

            if (startDate) {
                query = query.gte('business_date', formatToYYYYMMDD(startDate));
            }

            if (endDate) {
                query = query.lte('business_date', formatToYYYYMMDD(endDate));
            }

            const { data: allReturns, error } = await query;

            if (error) throw error;

            // ✨ MODE SWITCHING FIX: Filter by server with client-side OR logic
            // Apply server filter in JavaScript to ensure proper AND/OR precedence
            // Source of truth: returned_by is who created the return, server_id is the server
            let data = (allReturns || []) as DBReturn[];
            if (serverId && allReturns) {
                data = (allReturns as DBReturn[]).filter((returnItem) =>
                    returnItem.returned_by === serverId || returnItem.server_id === serverId
                );
            }

            return data;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer tous les retours de TOUS les bars (pour Super Admin)
     */
    static async getAllReturns(
        startDate?: Date | string,
        endDate?: Date | string
    ): Promise<DBReturn[]> {
        try {
            let query = supabase
                .from('returns')
                .select('*')
                .order('returned_at', { ascending: false });

            const formatToYYYYMMDD = (date: Date | string): string => {
                if (typeof date === 'string') return date;
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            if (startDate) {
                query = query.gte('business_date', formatToYYYYMMDD(startDate));
            }

            if (endDate) {
                query = query.lte('business_date', formatToYYYYMMDD(endDate));
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Mettre à jour un retour
     */
    static async updateReturn(id: string, updates: ReturnUpdate): Promise<DBReturn> {
        try {
            const { data, error } = await supabase
                .from('returns')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data as DBReturn;
        } catch (error) {
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
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
