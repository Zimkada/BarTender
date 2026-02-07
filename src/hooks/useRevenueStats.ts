import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { SalesService, type OfflineSale } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { getCurrentBusinessDateString, filterByBusinessDateRange } from '../utils/businessDateHelpers';
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

interface InternalStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    averageSale: number;
    isStale: boolean;
}

export function useRevenueStats(options: { startDate?: string; endDate?: string; enabled?: boolean } = {}): RevenueStats {
    const { currentBar } = useBarContext();
    const { sales, returns } = useAppContext();
    const { currentSession } = useAuth();

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
        if (!sales || !returns) return { netRevenue: 0, grossRevenue: 0, refundsTotal: 0, saleCount: 0, averageSale: 0, isStale: true };

        const closeHour = currentBar?.closingHour ?? 6;

        // On utilise soit les ventes passées en paramètre (frais), soit le state (si dispo)
        const offlineSource = customOfflineSales || offlineQueueSales;

        // ✨ Filter by server if role is serveur
        let baseSales = sales.filter(s => s.status === 'validated');

        if (isServerRole) {
            // Source of truth: soldBy is the business attribution
            baseSales = baseSales.filter(s =>
                s.soldBy === currentSession?.userId
            );
        }

        // Filter sales by business date range
        const filteredSales = filterByBusinessDateRange(
            baseSales,
            startDate,
            endDate,
            closeHour
        );

        // 🛡️ Buffer de Transition (Phase 11.3): Bridge le gap post-sync
        const recentlySyncedMap = syncManager.getRecentlySyncedKeys();
        let transitionRevenue = 0;
        let transitionCount = 0;

        recentlySyncedMap.forEach((data, key) => {
            // Si la vente n'est pas encore dans la liste serveur officielle (sales)
            // On l'ajoute au CA de transition pour éviter le "trou"
            // 🛡️ UNIFICATION (V11.6): Déduplication fiable via idempotencyKey
            const alreadyInServerSales = sales.some((s: any) =>
                s.idempotencyKey === key
            );
            if (!alreadyInServerSales) {
                transitionRevenue += data.total;
                transitionCount += 1;
            }
        });

        // 🛡️ Déduplication (Offline Queue vs Buffer)
        const deduplicatedOfflineQueue = offlineSource.filter(sale => {
            const key = sale.idempotency_key;
            return !key || !recentlySyncedMap.has(key);
        });

        const offlineRevenue = deduplicatedOfflineQueue.reduce((sum: number, sale: any) => sum + (sale.total || 0), 0); // 🛡️ Fix V11.6: Guard anti-NaN
        const grossRevenue = filteredSales.reduce((sum: number, sale: any) => sum + (sale.total || 0), 0) + offlineRevenue + transitionRevenue;
        const saleCount = filteredSales.length + deduplicatedOfflineQueue.length + transitionCount;

        // ✨ Filter returns by server if applicable
        let baseReturns = returns.filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'));
        if (isServerRole) {
            // Source of truth: serverId is the server who made the original sale
            // Servers see returns on their sales regardless of who created the return
            baseReturns = baseReturns.filter(r =>
                r.serverId === currentSession?.userId
            );
        }

        // Filter returns by business date range
        const filteredReturns = filterByBusinessDateRange(
            baseReturns,
            startDate,
            endDate,
            closeHour
        );

        const refundsTotal = filteredReturns.reduce((sum, r) => sum + r.refundAmount, 0);
        const netRevenue = grossRevenue - refundsTotal;

        return {
            netRevenue,
            grossRevenue,
            refundsTotal,
            saleCount,
            averageSale: saleCount > 0 ? grossRevenue / saleCount : 0,
            isStale: true
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
                const { data, error } = await supabase
                    .from('sales')
                    .select('total, status, sold_by, business_date, idempotency_key')
                    .eq('bar_id', currentBarId)
                    .eq('status', 'validated')
                    .gte('business_date', dStart?.toISOString().split('T')[0] || '')
                    .lte('business_date', dEnd?.toISOString().split('T')[0] || '');

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
            const serverRevenue = serverRawData?.reduce((sum: number, sale: any) => sum + (sale.total || 0), 0) || 0;
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
                const alreadyIndexed = serverRawData?.some((s: any) =>
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

            const filteredReturns = returnsData
                .filter((r: any) => r.is_refunded && (r.status === 'approved' || r.status === 'restocked'));

            const refundsTotal = filteredReturns.reduce((sum: number, r: any) => sum + Number(r.refund_amount), 0);
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
    useEffect(() => {
        const handleQueueUpdate = () => {
            console.log('[useRevenueStats] Queue updated, refetching...');
            refetch();

            // Re-fetch local cache for placeholder too
            const dStart = startDate ? new Date(startDate) : undefined;
            const dEnd = endDate ? new Date(endDate) : undefined;
            SalesService.getOfflineSales(currentBarId, dStart, dEnd).then(sales => {
                const filtered = isServerRole
                    ? sales.filter(s => s.sold_by === currentSession?.userId)
                    : sales;
                setOfflineQueueSales(filtered);
            });
        };

        const handleSyncCompleted = () => {
            console.log('[useRevenueStats] Sync completed, refetching stats...');
            refetch(); // 🛡️ Rafraîchir les stats serveur après sync
        };

        window.addEventListener('queue-updated', handleQueueUpdate);
        window.addEventListener('sync-completed', handleSyncCompleted);
        return () => {
            window.removeEventListener('queue-updated', handleQueueUpdate);
            window.removeEventListener('sync-completed', handleSyncCompleted);
        };
    }, [refetch, startDate, endDate, currentBarId, isServerRole, currentSession?.userId]);

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
