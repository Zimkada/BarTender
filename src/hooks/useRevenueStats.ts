import { useCallback, useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { SalesService, type OfflineSale } from '../services/supabase/sales.service';
import { ReturnsService, DBReturn } from '../services/supabase/returns.service';
import { isConfirmedReturn } from '../utils/saleHelpers';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { calculateRevenueStats } from '../utils/revenueCalculator';
import { statsKeys } from './queries/useStatsQueries';
import { CACHE_STRATEGY } from '../lib/cache-strategy';
import { syncManager } from '../services/SyncManager';

interface RevenueStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    isLoading: boolean;
    isOffline: boolean;
    source: 'sql' | 'local';
    lastUpdated: Date | undefined;
}

type SalesSummaryRow = {
    total: number | null;
    status: string;
    sold_by: string;
    business_date: string;
    idempotency_key: string | null;
};

interface InternalStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    averageSale: number;
    isStale: boolean;
}

import { useUnifiedSales } from './pivots/useUnifiedSales';
import { useUnifiedReturns } from './pivots/useUnifiedReturns';

export function useRevenueStats(options: { startDate?: string; endDate?: string; enabled?: boolean } = {}): RevenueStats {
    const { currentBar } = useBarContext();
    const { currentSession } = useAuth();
    const { sales } = useUnifiedSales(currentBar?.id);
    const { returns } = useUnifiedReturns(currentBar?.id, currentBar?.closingHour);

    const currentBarId = currentBar?.id || '';
    const isServerRole = currentSession?.role === 'serveur';
    const { operatingMode } = useBarContext();

    // Dates par défaut = Aujourd'hui (Commercial)
    const todayStr = getCurrentBusinessDateString(currentBar?.closingHour);
    const {
        startDate = todayStr,
        endDate = todayStr,
        enabled = true
    } = options;

    // 📊 Offline Cache (Phase 10: Sprint B)
    // On garde une copie locale de la queue pour calculateLocalStats (placeholder aware)
    const [offlineQueueSales, setOfflineQueueSales] = useState<OfflineSale[]>([]);

    useEffect(() => {
        const dStart = startDate ? new Date(startDate) : undefined;
        const dEnd = endDate ? new Date(endDate) : undefined;
        SalesService.getOfflineSales(currentBarId, dStart, dEnd).then(sales => {
            // Filtrage serveur ici aussi pour le placeholder
            const filtered = isServerRole
                ? sales.filter(s => s.sold_by === currentSession?.userId)
                : sales;
            setOfflineQueueSales(filtered);
        });
    }, [currentBarId, startDate, endDate, isServerRole, currentSession?.userId]);

    const calculateLocalStats = useCallback((customOfflineSales?: OfflineSale[]): InternalStats => {
        const closeHour = currentBar?.closingHour ?? 6;

        // On utilise soit les ventes passées en paramètre (frais), soit le state (si dispo)
        const offlineSource = customOfflineSales || offlineQueueSales;
        const recentlySyncedMap = syncManager.getRecentlySyncedKeys();

        const stats = calculateRevenueStats({
            sales,
            returns,
            offlineSales: offlineSource,
            recentlySyncedKeys: recentlySyncedMap,
            startDate,
            endDate,
            closeHour,
            isServerRole,
            currentUserId: currentSession?.userId
        });

        return {
            ...stats,
            isStale: true // Always true for local recalc
        };
    }, [sales, returns, startDate, endDate, currentBar?.closingHour, isServerRole, currentSession?.userId, offlineQueueSales]);

    // Standard query for fetching revenue stats
    const { data: stats, isLoading, error, refetch } = useQuery<InternalStats>({
        queryKey: statsKeys.summary(currentBarId, startDate, endDate, operatingMode, isServerRole),
        networkMode: 'always', // ⭐ Force execution even when offline
        queryFn: async () => {
            const serverId = isServerRole ? currentSession?.userId : undefined;

            // 1. Fetch Server Stats, Offline Sales (Parallel)
            const dStart = startDate ? new Date(startDate) : undefined;
            const dEnd = endDate ? new Date(endDate) : undefined;

            let serverRawData;
            try {
                // 🛡️ RÉCUPÉRATION DIRECTE (V11.5): On récupère les lignes pour sommer nous-mêmes
                let query = supabase
                    .from('sales')
                    .select('total, status, sold_by, business_date, idempotency_key')
                    .eq('bar_id', currentBarId)
                    .eq('status', 'validated')
                    .gte('business_date', dStart?.toISOString().split('T')[0] || '')
                    .lte('business_date', dEnd?.toISOString().split('T')[0] || '');

                if (isServerRole && currentSession?.userId) {
                    query = query.or(`sold_by.eq.${currentSession.userId},server_id.eq.${currentSession.userId}`);
                }

                const { data, error } = await query;

                if (error) throw error;
                serverRawData = data;
            } catch (err) {
                console.warn('[useRevenueStats] Server fetch failed, fetching fresh offline data...', err);
                const freshOfflineSales = await SalesService.getOfflineSales(currentBarId, dStart, dEnd);
                const filtered = isServerRole
                    ? freshOfflineSales.filter(s => s.sold_by === currentSession?.userId)
                    : freshOfflineSales;
                return calculateLocalStats(filtered);
            }

            // 🛡️ CALCUL SOUVERAIN (V11.5): On fait la somme nous-mêmes (Anti-Lag)
            const serverRevenue = (serverRawData as SalesSummaryRow[] | null)?.reduce((sum: number, sale) => sum + (sale.total || 0), 0) || 0;
            const serverCount = serverRawData?.length || 0;

            const offlineSales = await SalesService.getOfflineSales(currentBarId, dStart, dEnd);
            const recentlySyncedMap = syncManager.getRecentlySyncedKeys();

            // 2. Déduplication (Phase 8) + Filtrage Serveur (Phase 10)
            const deduplicatedOfflineSales = offlineSales
                .filter(sale => {
                    const idempotencyKey = sale.idempotency_key;
                    return !idempotencyKey || !recentlySyncedMap.has(idempotencyKey);
                })
                .filter(sale => {
                    if (!isServerRole) return true;
                    return sale.sold_by === currentSession?.userId;
                });

            // 🛡️ 3. Transition Buffer (Phase 11.3): Gérer les ventes en cours d'indexation
            let transitionRevenue = 0;
            let transitionCount = 0;

            recentlySyncedMap.forEach((data, key) => {
                // On vérifie le dédoublonnage contre serverRawData (plus fiable que AppContext)
                const alreadyIndexed = (serverRawData as SalesSummaryRow[] | null)?.some((s) =>
                    s.idempotency_key === key
                );
                if (!alreadyIndexed) {
                    transitionRevenue += data.total;
                    transitionCount += 1;
                }
            });

            // 4. Calculs fusionnés
            const offlineRevenue = deduplicatedOfflineSales.reduce((sum, sale) => sum + sale.total, 0);
            const grossRevenue = serverRevenue + offlineRevenue + transitionRevenue;
            const saleCount = serverCount + deduplicatedOfflineSales.length + transitionCount;

            // 4. Refunds (Server side)
            const returnsData = await ReturnsService.getReturns(currentBarId, startDate, endDate, serverId, operatingMode)
                .catch(() => []);

            const filteredReturns = (returnsData as DBReturn[])
                .filter(isConfirmedReturn);

            const refundsTotal = filteredReturns.reduce((sum: number, r) => sum + Number(r.refund_amount), 0);
            const netRevenue = grossRevenue - refundsTotal;

            return {
                netRevenue,
                grossRevenue,
                refundsTotal,
                saleCount,
                averageSale: saleCount > 0 ? grossRevenue / saleCount : 0,
                isStale: !serverRawData
            };
        },
        enabled: enabled && !!currentBarId,
        placeholderData: (previousData) => previousData || calculateLocalStats(),
        staleTime: CACHE_STRATEGY.dailyStats.staleTime,
        gcTime: CACHE_STRATEGY.dailyStats.gcTime,
    });

    // 🚀 Réactivité Instantanée (Phase 10)
    // S'abonner aux mises à jour de la queue pour invalider les stats immédiatement
    const refetchRef = useRef(refetch);
    useEffect(() => { refetchRef.current = refetch; }, [refetch]);

    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const handleQueueUpdate = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                console.log('[useRevenueStats] Queue updated, refetching...');
                refetchRef.current();

                // Re-fetch local cache for placeholder too
                const dStart = startDate ? new Date(startDate) : undefined;
                const dEnd = endDate ? new Date(endDate) : undefined;
                SalesService.getOfflineSales(currentBarId, dStart, dEnd).then(sales => {
                    const filtered = isServerRole
                        ? sales.filter(s => s.sold_by === currentSession?.userId)
                        : sales;
                    setOfflineQueueSales(filtered);
                });
            }, 150);
        };

        const handleSyncCompleted = () => {
            console.log('[useRevenueStats] Sync completed, refetching stats...');
            refetchRef.current(); // 🛡️ Rafraîchir les stats serveur après sync
        };

        window.addEventListener('queue-updated', handleQueueUpdate);
        window.addEventListener('sync-completed', handleSyncCompleted);
        return () => {
            clearTimeout(timeout);
            window.removeEventListener('queue-updated', handleQueueUpdate);
            window.removeEventListener('sync-completed', handleSyncCompleted);
        };
    }, [startDate, endDate, currentBarId, isServerRole, currentSession?.userId]); // ✅ refetch retiré des dépendances critiques

    return {
        netRevenue: stats?.netRevenue ?? 0,
        grossRevenue: stats?.grossRevenue ?? 0,
        refundsTotal: stats?.refundsTotal ?? 0,
        saleCount: stats?.saleCount ?? 0, // Using totalSales from proxy as saleCount
        isLoading,
        isOffline: !!error || !!stats?.isStale,
        source: (error || stats?.isStale) ? 'local' : 'sql',
        lastUpdated: new Date(),
    };
}
