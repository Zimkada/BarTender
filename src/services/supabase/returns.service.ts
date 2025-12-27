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
     * Optionnellement filtrer par serverId (pour voir uniquement ses retours)
     */
    static async getReturns(
        barId: string,
        startDate?: Date | string,
        endDate?: Date | string,
        serverId?: string,
        operatingMode?: 'full' | 'simplified'
    ): Promise<Return[]> {
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
            // A server should see returns where they are EITHER the assigned server OR the one who processed it
            let data = allReturns || [];
            if (serverId && allReturns) {
                data = allReturns.filter((returnItem: any) =>
                    returnItem.server_id === serverId || returnItem.returned_by === serverId
                );

                // 🔍 DEBUG: Log returns data for mode switching analysis
                console.log('[ReturnsService.getReturns] Query results:', {
                    barId,
                    serverId,
                    startDate,
                    endDate,
                    totalBeforeFilter: allReturns.length,
                    totalAfterFilter: data.length,
                    returnsDetails: data.map((r: any) => ({
                        id: r.id,
                        server_id: r.server_id,
                        returned_by: r.returned_by,
                        refund_amount: r.refund_amount,
                        is_refunded: r.is_refunded,
                        status: r.status
                    }))
                });
            }

            return data;
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer tous les retours de TOUS les bars (pour Super Admin)
     */
    static async getAllReturns(
        startDate?: Date | string,
        endDate?: Date | string
    ): Promise<Return[]> {
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
        } catch (error: any) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Mettre à jour un retour
     */
    static async updateReturn(id: string, updates: Partial<Return>): Promise<Return> {
        try {
            // Map camelCase TypeScript field names to snake_case PostgreSQL column names
            const mappedUpdates: Record<string, any> = {};

            const fieldMapping: Record<string, string> = {
                barId: 'bar_id',
                saleId: 'sale_id',
                productId: 'product_id',
                productName: 'product_name',
                productVolume: 'product_volume',
                quantitySold: 'quantity_sold',
                quantityReturned: 'quantity_returned',
                returnedBy: 'returned_by',
                returnedAt: 'returned_at',
                businessDate: 'business_date',
                refundAmount: 'refund_amount',
                isRefunded: 'is_refunded',
                autoRestock: 'auto_restock',
                manualRestockRequired: 'manual_restock_required',
                restockedAt: 'restocked_at',
                customRefund: 'custom_refund',
                customRestock: 'custom_restock',
                originalSeller: 'original_seller',
            };

            // Convert camelCase keys to snake_case
            Object.entries(updates).forEach(([key, value]) => {
                const snakeKey = fieldMapping[key as keyof typeof fieldMapping] || key;
                mappedUpdates[snakeKey] = value;
            });

            const { data, error } = await supabase
                .from('returns')
                .update(mappedUpdates)
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
