import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { getCurrentBusinessDateString, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { statsKeys } from './queries/useStatsQueries';
import { useProxyQuery } from './queries/useProxyQuery';
import { ProxyAdminService } from '../services/supabase/proxy-admin.service';
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
    const operatingMode = currentBar?.settings?.operatingMode || 'full';

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
            // ✨ MODE SWITCHING FIX: A server should see ALL their sales regardless of mode
            // Check BOTH serverId (simplified mode) AND createdBy (full mode)
            baseSales = baseSales.filter(s =>
                s.serverId === currentSession?.userId || s.createdBy === currentSession?.userId
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
            // ✨ MODE SWITCHING FIX: A server should see ALL their returns regardless of mode
            // Check BOTH serverId (simplified mode) AND returnedBy (full mode)
            baseReturns = baseReturns.filter(r =>
                r.serverId === currentSession?.userId || r.returnedBy === currentSession?.userId
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

    // Use Proxy Query to handle impersonation automatically
    const { data: stats, isLoading, error } = useProxyQuery(
        statsKeys.summary(currentBarId, startDate, endDate),
        // 1. Standard Fetcher (Normal User) - Requires 2 calls (Sales + Returns)
        async () => {
            // ✨ Pass serverId if server role to filter their stats
            const serverId = isServerRole ? currentSession?.userId : undefined;
            const stats = await SalesService.getSalesStats(currentBarId, startDate, endDate, serverId);

            console.log('[useRevenueStats] Fetched stats from DB:', {
                isServerRole,
                serverId,
                operatingMode,
                startDate,
                endDate,
                stats,
            });

            // ✨ Also filter returns by server if applicable (pass serverId to filter at DB level)
            const returnServerId = isServerRole ? currentSession?.userId : undefined;
            const returnsData = await ReturnsService.getReturns(currentBarId, startDate, endDate, returnServerId, operatingMode);

            console.log('[useRevenueStats] Fetched returns from DB:', {
                isServerRole,
                returnServerId,
                operatingMode,
                totalReturns: returnsData.length,
                returns: returnsData.map((r: any) => ({
                    id: r.id,
                    server_id: r.server_id,
                    returned_by: r.returned_by,
                    is_refunded: r.is_refunded,
                    status: r.status,
                    refund_amount: r.refund_amount
                }))
            });

            const filteredReturns = returnsData
                .filter((r: any) => r.is_refunded && (r.status === 'approved' || r.status === 'restocked'));

            console.log('[useRevenueStats] Filtered returns:', {
                totalAfterFilter: filteredReturns.length,
                filteredReturns: filteredReturns.map((r: any) => ({
                    id: r.id,
                    refund_amount: r.refund_amount
                }))
            });

            const refundsTotal = filteredReturns.reduce((sum: number, r: any) => sum + Number(r.refund_amount), 0);

            console.log('[useRevenueStats] Final calculation:', {
                totalRevenue: stats.totalRevenue,
                refundsTotal,
                netRevenue: stats.totalRevenue - refundsTotal
            });

            return {
                netRevenue: stats.totalRevenue - refundsTotal,
                grossRevenue: stats.totalRevenue,
                refundsTotal,
                saleCount: stats.totalSales
            };
        },
        // 2. Proxy Fetcher (Impersonation) - Uses optimized single RPC
        async (userId: string, barId: string) => {
            return ProxyAdminService.getSalesStatsAsProxy(userId, barId, startDate, endDate);
        },
        // Options
        {
            enabled: enabled && !!currentBarId,
            placeholderData: calculateLocalStats,
            staleTime: CACHE_STRATEGY.dailyStats.staleTime,
            gcTime: CACHE_STRATEGY.dailyStats.gcTime,
        }
    );

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
