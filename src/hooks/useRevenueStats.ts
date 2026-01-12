import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { getCurrentBusinessDateString, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { statsKeys } from './queries/useStatsQueries';
import { CACHE_STRATEGY } from '../lib/cache-strategy';

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

    const calculateLocalStats = useCallback(() => {
        if (!sales || !returns) return { netRevenue: 0, grossRevenue: 0, refundsTotal: 0, saleCount: 0 };

        const closeHour = currentBar?.closingHour ?? 6;

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

        const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
        const saleCount = filteredSales.length;

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

        return { netRevenue, grossRevenue, refundsTotal, saleCount };
    }, [sales, returns, startDate, endDate, currentBar?.closingHour, isServerRole, operatingMode, currentSession?.userId]);

    // Standard query for fetching revenue stats
    const { data: stats, isLoading, error } = useQuery({
        queryKey: statsKeys.summary(currentBarId, startDate, endDate),
        queryFn: async () => {
            // ✨ Pass serverId if server role to filter their stats
            const serverId = isServerRole ? currentSession?.userId : undefined;
            const stats = await SalesService.getSalesStats(currentBarId, startDate, endDate, serverId);

            // ✨ Also filter returns by server if applicable (pass serverId to filter at DB level)
            const returnServerId = isServerRole ? currentSession?.userId : undefined;
            const returnsData = await ReturnsService.getReturns(currentBarId, startDate, endDate, returnServerId, operatingMode);

            const filteredReturns = returnsData
                .filter((r: any) => r.is_refunded && (r.status === 'approved' || r.status === 'restocked'));

            const refundsTotal = filteredReturns.reduce((sum: number, r: any) => sum + Number(r.refund_amount), 0);

            return {
                netRevenue: stats.totalRevenue - refundsTotal,
                grossRevenue: stats.totalRevenue,
                refundsTotal,
                saleCount: stats.totalSales
            };
        },
        enabled: enabled && !!currentBarId,
        placeholderData: calculateLocalStats,
        staleTime: CACHE_STRATEGY.dailyStats.staleTime,
        gcTime: CACHE_STRATEGY.dailyStats.gcTime,
    });

    return {
        netRevenue: stats?.netRevenue ?? 0,
        grossRevenue: stats?.grossRevenue ?? 0,
        refundsTotal: stats?.refundsTotal ?? 0,
        saleCount: stats?.saleCount ?? 0, // Using totalSales from proxy as saleCount
        isLoading,
        isOffline: !!error,
        source: error ? 'local' : 'sql',
        lastUpdated: new Date(),
    };
}
