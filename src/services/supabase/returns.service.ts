import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { networkManager } from '../NetworkManager';
import { offlineQueue } from '../offlineQueue';
import { generateUUID } from '../../utils/crypto';

// 🛡️ Fix V12: Strict Typing for Returns
export type DBReturn = Database['public']['Tables']['returns']['Row'] & {
    validated_by?: string | null;
    rejected_by?: string | null;
    server_id?: string | null;
    linked_sale_id?: string | null;
};

type ReturnInsert = Database['public']['Tables']['returns']['Insert'];

export class ReturnsService {
    /**
     * Créer un retour
     */
    static async createReturn(data: ReturnInsert): Promise<DBReturn> {
        const { shouldShowBanner: isOffline } = networkManager.getDecision();
        const finalId = data.id || generateUUID();
        const returnWithId = { ...data, id: finalId };

        console.log('[ReturnsService] entering createReturn', {
            id: finalId,
            bar_id: data.bar_id,
            sale_id: data.sale_id,
            product_id: data.product_id,
            isOffline
        });

        try {
            if (isOffline) {
                console.log('[ReturnsService] Offline detected, queuing operation');
                await offlineQueue.addOperation('CREATE_RETURN', returnWithId, data.bar_id, data.returned_by || '');
                return returnWithId as DBReturn;
            }

            const { data: newReturn, error } = await supabase
                .from('returns')
                .insert(returnWithId)
                .select()
                .single();

            if (error) {
                console.error('[ReturnsService] Supabase error creating return:', error);
                // Si erreur réseau masquée par Supabase, on fallback quand même
                if (error.message === 'Failed to fetch' || !navigator.onLine) {
                    await offlineQueue.addOperation('CREATE_RETURN', returnWithId, data.bar_id, data.returned_by || '');
                    return returnWithId as DBReturn;
                }
                throw error;
            }

            console.log('[ReturnsService] successfully created return:', newReturn.id);
            return newReturn as DBReturn;
        } catch (error) {
            console.error('[ReturnsService] caught error in createReturn:', error);
            // Fallback global de dernier recours pour la résilience
            if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('Network'))) {
                await offlineQueue.addOperation('CREATE_RETURN', returnWithId, data.bar_id, data.returned_by || '');
                return returnWithId as DBReturn;
            }
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

            console.log('[ReturnsService] fetching returns for bar:', barId, {
                startDate: startDate ? formatToYYYYMMDD(startDate) : 'none',
                endDate: endDate ? formatToYYYYMMDD(endDate) : 'none'
            });

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
                    returnItem.returned_by === serverId ||
                    returnItem.server_id === serverId ||
                    returnItem.validated_by === serverId ||
                    returnItem.rejected_by === serverId
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
    static async updateReturn(id: string, updates: any): Promise<DBReturn> {
        try {
            // 🛡️ Map camelCase to snake_case for Supabase compatibility
            // Mandatory cleanup: delete original keys to avoid "column not found" errors
            const mappedUpdates: any = { ...updates };

            if ('restockedAt' in updates) {
                mappedUpdates.restocked_at = updates.restockedAt;
                delete mappedUpdates.restockedAt;
            }
            if ('validatedBy' in updates) {
                mappedUpdates.validated_by = updates.validatedBy;
                delete mappedUpdates.validatedBy;
            }
            if ('rejectedBy' in updates) {
                mappedUpdates.rejected_by = updates.rejectedBy;
                delete mappedUpdates.rejectedBy;
            }
            if ('businessDate' in updates) {
                mappedUpdates.business_date = updates.businessDate;
                delete mappedUpdates.businessDate;
            }
            if ('isRefunded' in updates) {
                mappedUpdates.is_refunded = updates.isRefunded;
                delete mappedUpdates.isRefunded;
            }

            const { data, error } = await supabase
                .from('returns')
                .update(mappedUpdates)
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
