import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { getCurrentBusinessDateString, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { statsKeys } from './queries/useStatsQueries';

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

    const currentBarId = currentBar?.id || '';

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

        // Filter sales by business date range
        const filteredSales = filterByBusinessDateRange(
            sales.filter(s => s.status === 'validated'),
            startDate,
            endDate,
            closeHour
        );

        const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
        const saleCount = filteredSales.length;

        // Filter returns by business date range
        const filteredReturns = filterByBusinessDateRange(
            returns.filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked')),
            startDate,
            endDate,
            closeHour
        );

        const refundsTotal = filteredReturns.reduce((sum, r) => sum + r.refundAmount, 0);
        const netRevenue = grossRevenue - refundsTotal;

        return { netRevenue, grossRevenue, refundsTotal, saleCount };
    }, [sales, returns, startDate, endDate, currentBar?.closingHour]);

    const query = useQuery({
        queryKey: statsKeys.summary(currentBarId, startDate, endDate),
        queryFn: async () => {
            const stats = await SalesService.getSalesStats(currentBarId, startDate, endDate);

            const returnsData = await ReturnsService.getReturns(currentBarId, startDate, endDate);
            const refundsTotal = returnsData
                .filter((r: any) => r.is_refunded && (r.status === 'approved' || r.status === 'restocked'))
                .reduce((sum: number, r: any) => sum + Number(r.refund_amount), 0);

            return {
                netRevenue: stats.totalRevenue - refundsTotal,
                grossRevenue: stats.totalRevenue,
                refundsTotal,
                saleCount: stats.totalSales
            };
        },
        enabled: enabled && !!currentBarId,
        placeholderData: calculateLocalStats,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    return {
        netRevenue: query.data?.netRevenue ?? 0,
        grossRevenue: query.data?.grossRevenue ?? 0,
        refundsTotal: query.data?.refundsTotal ?? 0,
        saleCount: query.data?.saleCount ?? 0,
        isLoading: query.isLoading,
        isOffline: query.isError,
        source: query.isError ? 'local' : 'sql',
        lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined,
    };
}
