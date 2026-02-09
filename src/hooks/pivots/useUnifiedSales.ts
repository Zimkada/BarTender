/**
 * useUnifiedSales.ts - Smart Hook (Mission Elite)
 * Unifie les ventes Online (Supabase) et Offline (IndexedDB).
 * Gère le dédoublonnage strict par idempotency_key.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSales, salesKeys } from '../queries/useSalesQueries';
import { useAuth } from '../../context/AuthContext';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { SalesService } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';

/**
 * Type pour les ventes unifiées (online + offline)
 * Inclut les champs en snake_case et camelCase pour compatibilité
 */
interface UnifiedSale extends Omit<Sale, 'createdAt' | 'validatedAt' | 'rejectedAt' | 'businessDate'> {
    created_at: string;
    business_date: string;
    idempotency_key: string;
    isOptimistic?: boolean;
    businessDate?: Date; // Facultatif pour compatibilité temporaire si besoin
}

export const useUnifiedSales = (barId: string | undefined) => {
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();

    // 1. Ventes Online (via React Query)
    const { data: onlineSales = [], isLoading: isLoadingOnline } = useSales(barId);

    // 2. Ventes Offline (via IndexedDB)
    const { data: offlineSales = [], refetch: refetchOffline, isLoading: isLoadingOffline } = useQuery({
        queryKey: ['offline-sales-list', barId],
        networkMode: 'always',
        queryFn: async (): Promise<UnifiedSale[]> => {
            if (!barId) return [];
            const ops = await offlineQueue.getOperations({
                status: 'pending',
                barId
            });

            return ops
                .filter(op => op.type === 'CREATE_SALE')
                .map(op => {
                    const payload = op.payload;
                    const subtotal = payload.items.reduce((sum, item) => sum + item.total_price, 0);
                    const createdAt = new Date(op.timestamp).toISOString();

                    const unifiedSale: UnifiedSale = {
                        id: op.id,
                        barId: payload.bar_id,
                        items: payload.items as SaleItem[],
                        total: subtotal,
                        currency: 'XAF',
                        status: payload.status as any,
                        soldBy: payload.sold_by,
                        createdBy: payload.sold_by,
                        created_at: createdAt,
                        business_date: payload.business_date || createdAt.split('T')[0],
                        idempotency_key: payload.idempotency_key,
                        paymentMethod: payload.payment_method as any,
                        isOptimistic: true
                    };

                    return unifiedSale;
                });
        },
        enabled: !!barId
    });

    // 🚀 Réactivité : Écoute des événements typés
    useEffect(() => {
        const handleSync = (e: any) => {
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOffline();
                queryClient.invalidateQueries({ queryKey: salesKeys.list(barId || '') });
                queryClient.invalidateQueries({ queryKey: salesKeys.stats(barId || '') });
            }
        };

        window.addEventListener('sales-synced', handleSync);
        window.addEventListener('queue-updated', handleSync);

        return () => {
            window.removeEventListener('sales-synced', handleSync);
            window.removeEventListener('queue-updated', handleSync);
        };
    }, [barId, refetchOffline, queryClient]);

    /**
     * 🔴 Hash-Based Memoization (Mission Elite)
     * Stabilise la référence via un hash du contenu réel
     */
    const salesHash = useMemo(() => {
        return JSON.stringify({
            online: onlineSales.map(s => `${s.id}-${s.total}`),
            offline: offlineSales.map(s => s.idempotency_key || s.id)
        });
    }, [onlineSales, offlineSales]);

    /**
     * 🔴 FUSION & DÉDOUBLONNAGE (Cœur du Smart Hook)
     */
    const unifiedSales = useMemo(() => {
        const recentlySyncedKeys = syncManager.getRecentlySyncedKeys();

        // Filtrer les ventes offline qui sont déjà arrivées sur le serveur (basé sur le tampon de 5min)
        const filteredOffline = offlineSales.filter(s => {
            if (!s.idempotency_key) return true;
            return !recentlySyncedKeys.has(s.idempotency_key);
        });

        // Fusionner et trier par date décroissante
        const combined = [...filteredOffline, ...onlineSales];

        return combined.sort((a: any, b: any) => {
            const dateA = a.created_at || a.createdAt;
            const dateB = b.created_at || b.createdAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [salesHash]); // ← Dépendance STABLE via le hash

    /**
     * 📊 STATISTIQUES CONSOLIDÉES
     */
    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];

        const todaySales = unifiedSales.filter((s: any) => {
            // Helper pour extraire la date YYYY-MM-DD
            const getDay = (date: any) => {
                if (!date) return '';
                if (typeof date === 'string') return date.split('T')[0];
                if (date instanceof Date) return date.toISOString().split('T')[0];
                return '';
            };

            const bDate = getDay(s.business_date || s.businessDate);
            const cDate = getDay(s.created_at || s.createdAt);

            return bDate === today || cDate === today;
        });

        const totalRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
        const count = todaySales.length;

        return {
            todayTotal: totalRevenue,
            todayCount: count,
            sales: todaySales
        };
    }, [unifiedSales]);

    // Mutations
    const addSale = useCallback(async (saleData: any) => {
        return SalesService.createSale(saleData, { canWorkOffline: true, userId: session?.userId });
    }, [session]);

    return {
        sales: unifiedSales,
        stats,
        isLoading: isLoadingOnline || isLoadingOffline,
        addSale,
        refetch: () => {
            refetchOffline();
            queryClient.invalidateQueries({ queryKey: salesKeys.all });
        }
    };
};
