/**
 * useUnifiedReturns.ts - Smart Hook (Pilier 3: Cleanup AppProvider)
 * Unifie les retours Online (Supabase) et Offline (IndexedDB).
 * Gère la fusion avec hash memoization et event-driven reactivity.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReturns, returnKeys } from '../queries/useReturnsQueries';
import { useAuth } from '../../context/AuthContext';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { filterByBusinessDateRange, getCurrentBusinessDateString } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../constants/businessDay';
import type { Return } from '../../types';

/**
 * Type pour les retours unifiés (online + offline)
 */
interface UnifiedReturn extends Omit<Return, 'returnedAt' | 'businessDate'> {
    returned_at: string;
    business_date: string;
    isOptimistic?: boolean;
}

export const useUnifiedReturns = (barId: string | undefined, closingHour?: number) => {
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();

    // 1. Retours Online (via React Query)
    const { data: onlineReturns = [], isLoading: isLoadingOnline } = useReturns(barId, { refetchInterval: false });

    // 2. Retours Offline (via IndexedDB)
    const { data: offlineReturns = [], refetch: refetchOffline, isLoading: isLoadingOffline } = useQuery({
        queryKey: ['offline-returns-list', barId],
        networkMode: 'always',
        queryFn: async (): Promise<UnifiedReturn[]> => {
            if (!barId) return [];
            const ops = await offlineQueue.getOperations({
                status: 'pending',
                barId
            });

            return ops
                .filter(op => op.type === 'ADD_RETURN')
                .map(op => {
                    const payload = op.payload;
                    const returnedAt = new Date(op.timestamp).toISOString();

                    const unifiedReturn: UnifiedReturn = {
                        id: op.id,
                        barId: payload.barId || barId,
                        saleId: payload.saleId,
                        productId: payload.productId,
                        productName: payload.productName,
                        productVolume: payload.productVolume || '',
                        quantitySold: payload.quantitySold,
                        quantityReturned: payload.quantityReturned,
                        reason: payload.reason,
                        returnedBy: payload.returnedBy,
                        serverId: payload.serverId,
                        returned_at: returnedAt,
                        business_date: payload.businessDate || returnedAt.split('T')[0],
                        refundAmount: payload.refundAmount,
                        isRefunded: payload.isRefunded,
                        status: payload.status || 'pending',
                        autoRestock: payload.autoRestock || false,
                        manualRestockRequired: payload.manualRestockRequired || false,
                        notes: payload.notes,
                        customRefund: payload.customRefund,
                        customRestock: payload.customRestock,
                        originalSeller: payload.originalSeller,
                        operatingModeAtCreation: payload.operatingModeAtCreation,
                        isOptimistic: true
                    };

                    return unifiedReturn;
                });
        },
        enabled: !!barId
    });

    // 🚀 Réactivité : Écoute des événements typés
    useEffect(() => {
        const handleSync = (e: any) => {
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOffline();
                queryClient.invalidateQueries({ queryKey: returnKeys.list(barId || '') });
            }
        };

        window.addEventListener('returns-synced', handleSync);
        window.addEventListener('queue-updated', handleSync);

        return () => {
            window.removeEventListener('returns-synced', handleSync);
            window.removeEventListener('queue-updated', handleSync);
        };
    }, [barId, refetchOffline, queryClient]);

    /**
     * 🔴 Hash-Based Memoization (Mission Elite)
     * Stabilise la référence via un hash du contenu réel
     */
    const returnsHash = useMemo(() => {
        return JSON.stringify({
            online: onlineReturns.map(r => `${r.id}-${r.quantityReturned}`),
            offline: offlineReturns.map(r => r.id)
        });
    }, [onlineReturns, offlineReturns]);

    /**
     * 🔴 FUSION & DÉDOUBLONNAGE (Cœur du Smart Hook)
     */
    const unifiedReturns = useMemo(() => {
        const recentlySyncedKeys = syncManager.getRecentlySyncedKeys();

        // Filtrer les retours offline qui sont déjà arrivés sur le serveur
        const filteredOffline = offlineReturns.filter(r => {
            // Pour les returns, on n'a pas d'idempotency_key, donc on utilise l'ID
            return !recentlySyncedKeys.has(r.id);
        });

        // Fusionner et trier par date décroissante
        const combined = [...filteredOffline, ...onlineReturns];

        return combined.sort((a, b) => {
            const dateA = (a as any).returned_at || (a as Return).returnedAt;
            const dateB = (b as any).returned_at || (b as Return).returnedAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [returnsHash]); // ← Dépendance STABLE via le hash

    /**
     * 📊 HELPER: Today's Returns (filtered by business date + role)
     */
    const getTodayReturns = useCallback(() => {
        const closeHour = closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
        const todayStr = getCurrentBusinessDateString(closeHour);

        // Adapter les dates pour filterByBusinessDateRange
        const returnsWithDates = unifiedReturns.map(r => ({
            ...r,
            returnedAt: (r as any).returned_at
                ? new Date((r as any).returned_at)
                : (r as Return).returnedAt,
            businessDate: (r as any).business_date
                ? new Date((r as any).business_date)
                : (r as Return).businessDate
        }));

        const todayReturnsList = filterByBusinessDateRange(
            returnsWithDates,
            todayStr,
            todayStr,
            closeHour
        );

        if (session?.role === 'serveur') {
            // Server sees only their own returns (mode switching support)
            return todayReturnsList.filter(r =>
                r.returnedBy === session.userId || r.serverId === session.userId
            );
        }

        return todayReturnsList;
    }, [unifiedReturns, session, closingHour]);

    /**
     * 📊 HELPER: Returns by Sale
     */
    const getReturnsBySale = useCallback((saleId: string) => {
        return unifiedReturns.filter(r => r.saleId === saleId);
    }, [unifiedReturns]);

    /**
     * 📊 HELPER: Pending Returns
     */
    const getPendingReturns = useCallback(() => {
        return unifiedReturns.filter(r => r.status === 'pending');
    }, [unifiedReturns]);

    return {
        returns: unifiedReturns,
        getTodayReturns,
        getReturnsBySale,
        getPendingReturns,
        isLoading: isLoadingOnline || isLoadingOffline,
        refetch: () => {
            refetchOffline();
            queryClient.invalidateQueries({ queryKey: returnKeys.all });
        }
    };
};
