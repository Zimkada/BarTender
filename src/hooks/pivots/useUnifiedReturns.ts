/**
 * useUnifiedReturns.ts - Smart Hook (Pilier 3: Cleanup AppProvider)
 * Unifie les retours Online (Supabase) et Offline (IndexedDB).
 * Gère la fusion avec hash memoization et event-driven reactivity.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReturns, returnKeys } from '../queries/useReturnsQueries';
import { useAuth } from '../../context/AuthContext';
import { useBarContext } from '../../context/BarContext';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { filterByBusinessDateRange, getCurrentBusinessDateString } from '../../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../../constants/businessDay';
import { useRealtimeReturns } from '../useRealtimeReturns';
import type { Return } from '../../types';

/**
 * Type pour les retours unifiés (online + offline)
 */
export interface UnifiedReturn extends Omit<Return, 'returnedAt' | 'businessDate'> {
    returned_at: string;
    business_date: string;
    isOptimistic?: boolean;
    // Compatibilité
    returnedAt: Date | string;
    businessDate: Date | string;
}

export const useUnifiedReturns = (barId: string | undefined, closingHour?: number) => {
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();
    const { currentBar } = useBarContext();

    // 🚀 Real-time synchronization for returns (cross-device + cross-tab)
    useRealtimeReturns({ barId: barId || '', enabled: !!barId });

    // 🔴 LOGIQUE DE TIERING (Certification Sécurité)
    const returnsOptions = useMemo((): { startDate?: string; refetchInterval: false } => {
        if (!currentBar?.settings?.dataTier || currentBar.settings.dataTier === 'lite') {
            return { refetchInterval: false };
        }

        const now = new Date();
        if (currentBar.settings.dataTier === 'balanced') {
            now.setMonth(now.getMonth() - 6);
        } else if (currentBar.settings.dataTier === 'enterprise') {
            now.setDate(now.getDate() - 30);
        }

        return {
            startDate: now.toISOString().split('T')[0],
            refetchInterval: false
        };
    }, [currentBar?.settings?.dataTier]);

    // 1. Retours Online (via React Query) avec options de tiering
    const { data: onlineReturns = [], isLoading: isLoadingOnline } = useReturns(barId, returnsOptions);

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
                .filter(op => op.type === 'CREATE_RETURN')
                .map(op => {
                    const payload = op.payload as any;
                    const returnedAt = new Date(op.timestamp).toISOString();

                    const unifiedReturn: UnifiedReturn = {
                        id: op.id,
                        barId: payload.bar_id || (barId as string),
                        saleId: payload.sale_id,
                        productId: payload.product_id,
                        productName: payload.product_name,
                        productVolume: payload.product_volume || '',
                        quantitySold: payload.quantity_sold,
                        quantityReturned: payload.quantity_returned,
                        reason: payload.reason as any,
                        returnedBy: payload.returned_by,
                        serverId: payload.server_id,
                        returned_at: returnedAt,
                        returnedAt: returnedAt, // Standardized
                        business_date: payload.business_date || returnedAt.split('T')[0],
                        businessDate: payload.business_date || returnedAt.split('T')[0], // Standardized
                        refundAmount: payload.refund_amount,
                        isRefunded: payload.is_refunded,
                        status: (payload.status || 'pending') as any,
                        autoRestock: payload.auto_restock || false,
                        manualRestockRequired: payload.manual_restock_required || false,
                        notes: payload.notes || undefined,
                        customRefund: payload.custom_refund,
                        customRestock: payload.custom_restock,
                        originalSeller: payload.original_seller,
                        operatingModeAtCreation: payload.operating_mode_at_creation,
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
            online: onlineReturns.map(r => `${r.id}-${r.quantityReturned}-${r.status}`),
            offline: offlineReturns.map(r => `${r.id}-${r.status}`)
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
        const returnsWithDates = unifiedReturns.map((r): Return => {
            if ('isOptimistic' in r) {
                // Return instance in unified list is either online (mapped) or offline (raw payload)
                return {
                    ...r,
                    returnedAt: new Date(r.returned_at),
                    businessDate: r.business_date ? new Date(r.business_date) : new Date(r.returned_at)
                } as Return;
            }
            return r as Return;
        });

        const todayReturnsList = filterByBusinessDateRange(
            returnsWithDates,
            todayStr,
            todayStr,
            closeHour
        );

        if (session?.role === 'serveur') {
            // Server sees only their own returns (mode switching support)
            return todayReturnsList.filter(r =>
                r.returnedBy === session.userId ||
                r.serverId === session.userId ||
                (r as any).validatedBy === session.userId ||
                (r as any).rejectedBy === session.userId ||
                (r as any).validated_by === session.userId ||
                (r as any).rejected_by === session.userId
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
