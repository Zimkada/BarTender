import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../lib/supabase';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService, DBReturn } from '../services/supabase/returns.service';
import { isConfirmedReturn } from '../utils/saleHelpers';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { statsKeys } from './queries/useStatsQueries';
import { CACHE_STRATEGY } from '../lib/cache-strategy';
import { syncManager } from '../services/SyncManager';

import { useUnifiedSales } from './pivots/useUnifiedSales';
import { useUnifiedReturns } from './pivots/useUnifiedReturns';

/** Ventilation d'un jour pour les vues comptables. */
export interface RevenueDayBreakdown {
    sale_date: string;
    gross_revenue: number;
    net_revenue: number;
    refunds_total: number;
    cash_revenue: number;
    mobile_revenue: number;
    card_revenue: number;
    sale_count: number;
}

export interface RevenueStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    cashRevenue: number;
    mobileRevenue: number;
    cardRevenue: number;
    days: RevenueDayBreakdown[];
    isLoading: boolean;
    isOffline: boolean;
    source: 'sql' | 'local';
    lastUpdated: Date | undefined;
}

type SalesSummaryRow = {
    total: number | null;
    sold_by: string;
    business_date: string;
    idempotency_key: string | null;
    payment_method: string | null;
};

type RevenueSaleEntry = {
    total: number;
    payment_method?: string | null;
    business_date: string;
};

type RefundLike = {
    business_date?: string | null;
    returned_at?: string | null;
    refund_amount?: number | null;
};

type RecentSyncPayload = {
    business_date?: string;
    payment_method?: string;
    sold_by?: string;
};

type RecentSyncEntry = {
    total: number;
    timestamp: number;
    payload: RecentSyncPayload;
};

interface InternalStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    averageSale: number;
    cashRevenue: number;
    mobileRevenue: number;
    cardRevenue: number;
    days: RevenueDayBreakdown[];
    isStale: boolean;
}

type PaymentBucket = 'cash' | 'mobile' | 'card';

function toPaymentBucket(method: string | null | undefined): PaymentBucket {
    if (!method) return 'cash';
    const normalized = method.toLowerCase();
    if (normalized === 'cash') return 'cash';
    if (normalized === 'mobile_money' || normalized === 'mobile') return 'mobile';
    return 'card';
}

function isDateInRange(date: string | null | undefined, startDate: string, endDate: string): boolean {
    if (!date) return false;
    return date >= startDate && date <= endDate;
}

function getDateFromUnknown(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value.split('T')[0];
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return '';
}

function sumByPaymentMethod(sales: RevenueSaleEntry[]): { cash: number; mobile: number; card: number } {
    const result = { cash: 0, mobile: 0, card: 0 };
    for (const sale of sales) {
        result[toPaymentBucket(sale.payment_method)] += sale.total || 0;
    }
    return result;
}

function buildRefundsByDate(returns: RefundLike[]): Map<string, number> {
    const refundsByDate = new Map<string, number>();

    for (const ret of returns) {
        const date = ret.business_date || (ret.returned_at ? ret.returned_at.split('T')[0] : '');
        if (!date) continue;
        refundsByDate.set(date, (refundsByDate.get(date) || 0) + Number(ret.refund_amount || 0));
    }

    return refundsByDate;
}

function aggregateDays(sales: RevenueSaleEntry[], refundsByDate: Map<string, number>): RevenueDayBreakdown[] {
    const grouped = new Map<string, { gross: number; cash: number; mobile: number; card: number; count: number }>();

    for (const sale of sales) {
        if (!sale.business_date) continue;

        const entry = grouped.get(sale.business_date) || { gross: 0, cash: 0, mobile: 0, card: 0, count: 0 };
        entry.gross += sale.total || 0;
        entry.count += 1;
        entry[toPaymentBucket(sale.payment_method)] += sale.total || 0;
        grouped.set(sale.business_date, entry);
    }

    for (const date of refundsByDate.keys()) {
        if (!grouped.has(date)) {
            grouped.set(date, { gross: 0, cash: 0, mobile: 0, card: 0, count: 0 });
        }
    }

    return Array.from(grouped.entries())
        .map(([date, entry]) => {
            const refunds = refundsByDate.get(date) || 0;
            return {
                sale_date: date,
                gross_revenue: entry.gross,
                net_revenue: entry.gross - refunds,
                refunds_total: refunds,
                cash_revenue: entry.cash,
                mobile_revenue: entry.mobile,
                card_revenue: entry.card,
                sale_count: entry.count,
            };
        })
        .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
}

function buildRevenueStatsFromEntries(
    sales: RevenueSaleEntry[],
    refundsByDate: Map<string, number>,
    isStale: boolean
): InternalStats {
    const grossRevenue = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const saleCount = sales.length;
    const refundsTotal = Array.from(refundsByDate.values()).reduce((sum, amount) => sum + amount, 0);
    const netRevenue = grossRevenue - refundsTotal;
    const paymentTotals = sumByPaymentMethod(sales);

    return {
        netRevenue,
        grossRevenue,
        refundsTotal,
        saleCount,
        averageSale: saleCount > 0 ? grossRevenue / saleCount : 0,
        cashRevenue: paymentTotals.cash,
        mobileRevenue: paymentTotals.mobile,
        cardRevenue: paymentTotals.card,
        days: aggregateDays(sales, refundsByDate),
        isStale
    };
}

function buildTransitionSales(
    recentlySyncedMap: Map<string, RecentSyncEntry>,
    allIndexedKeys: Set<string>,
    startDate: string,
    endDate: string,
    isServerRole: boolean,
    currentUserId?: string
): RevenueSaleEntry[] {
    const transitionSales: RevenueSaleEntry[] = [];

    recentlySyncedMap.forEach((entry, key) => {
        if (allIndexedKeys.has(key)) return;

        const businessDate = entry.payload.business_date;
        if (!isDateInRange(businessDate, startDate, endDate)) return;

        if (isServerRole && entry.payload.sold_by !== currentUserId) return;

        transitionSales.push({
            total: entry.total || 0,
            payment_method: entry.payload.payment_method,
            business_date: businessDate || ''
        });
    });

    return transitionSales;
}

export function useRevenueStats(options: { startDate?: string; endDate?: string; enabled?: boolean } = {}): RevenueStats {
    const queryClient = useQueryClient();
    const { currentBar, operatingMode } = useBarContext();
    const { currentSession } = useAuth();
    const { sales } = useUnifiedSales(currentBar?.id, { includeItems: false });
    const { returns } = useUnifiedReturns(currentBar?.id, currentBar?.closingHour);

    const currentBarId = currentBar?.id || '';
    const isServerRole = currentSession?.role === 'serveur';

    const todayStr = getCurrentBusinessDateString(currentBar?.closingHour);
    const {
        startDate = todayStr,
        endDate = todayStr,
        enabled = true
    } = options;

    const calculateLocalStats = useCallback((): InternalStats => {
        const recentlySyncedMap = syncManager.getRecentlySyncedKeys() as Map<string, RecentSyncEntry>;

        const filteredSales: RevenueSaleEntry[] = sales
            .filter((sale: any) => sale.status === 'validated')
            .filter((sale: any) => isDateInRange(
                getDateFromUnknown(sale.business_date || sale.businessDate),
                startDate,
                endDate
            ))
            .filter((sale: any) => !isServerRole || sale.soldBy === currentSession?.userId || sale.sold_by === currentSession?.userId || sale.serverId === currentSession?.userId || sale.server_id === currentSession?.userId)
            .map((sale: any) => ({
                total: Number(sale.total || 0),
                payment_method: sale.paymentMethod || sale.payment_method,
                business_date: getDateFromUnknown(sale.business_date || sale.businessDate),
            }))
            .filter(sale => Boolean(sale.business_date));

        const indexedKeys = new Set(
            sales
                .map((sale: any) => sale.idempotency_key)
                .filter((key: string | undefined): key is string => Boolean(key))
        );

        const transitionSales = buildTransitionSales(
            recentlySyncedMap,
            indexedKeys,
            startDate,
            endDate,
            isServerRole,
            currentSession?.userId
        );

        const filteredReturns: RefundLike[] = returns
            .filter(isConfirmedReturn)
            .filter((ret: any) => isDateInRange(
                getDateFromUnknown(ret.business_date || ret.businessDate),
                startDate,
                endDate
            ))
            .filter((ret: any) =>
                !isServerRole ||
                ret.returnedBy === currentSession?.userId ||
                ret.returned_by === currentSession?.userId ||
                ret.serverId === currentSession?.userId ||
                ret.server_id === currentSession?.userId ||
                ret.validatedBy === currentSession?.userId ||
                ret.validated_by === currentSession?.userId ||
                ret.rejectedBy === currentSession?.userId ||
                ret.rejected_by === currentSession?.userId
            )
            .map((ret: any) => ({
                business_date: getDateFromUnknown(ret.business_date || ret.businessDate) || null,
                returned_at: ret.returnedAt || ret.returned_at || null,
                refund_amount: ret.refundAmount || ret.refund_amount || 0,
            }));

        return buildRevenueStatsFromEntries(
            [...filteredSales, ...transitionSales],
            buildRefundsByDate(filteredReturns),
            true
        );
    }, [sales, returns, startDate, endDate, isServerRole, currentSession?.userId]);

    const { data: stats, isLoading, error } = useQuery<InternalStats>({
        queryKey: statsKeys.summary(currentBarId, startDate, endDate, operatingMode, isServerRole, currentSession?.userId),
        networkMode: 'always',
        queryFn: async () => {
            const serverId = isServerRole ? currentSession?.userId : undefined;
            const dStart = startDate ? new Date(startDate) : undefined;
            const dEnd = endDate ? new Date(endDate) : undefined;

            let serverRawData: SalesSummaryRow[] | null = null;
            try {
                let query = supabase
                    .from('sales')
                    .select('total, sold_by, business_date, idempotency_key, payment_method')
                    .eq('bar_id', currentBarId)
                    .eq('status', 'validated')
                    .gte('business_date', dStart?.toISOString().split('T')[0] || '')
                    .lte('business_date', dEnd?.toISOString().split('T')[0] || '');

                if (isServerRole && currentSession?.userId) {
                    query = query.or(`sold_by.eq.${currentSession.userId},server_id.eq.${currentSession.userId}`);
                }

                const { data, error: queryError } = await query;
                if (queryError) throw queryError;
                serverRawData = (data as SalesSummaryRow[]) || [];
            } catch (err) {
                console.warn('[useRevenueStats] Server fetch failed, using local fallback...', err);
                return calculateLocalStats();
            }

            const offlineSales = await SalesService.getOfflineSales(currentBarId, dStart, dEnd);
            const recentlySyncedMap = syncManager.getRecentlySyncedKeys() as Map<string, RecentSyncEntry>;

            const deduplicatedOfflineSales = offlineSales
                .filter(sale => !sale.idempotency_key || !recentlySyncedMap.has(sale.idempotency_key))
                .filter(sale => !isServerRole || sale.sold_by === currentSession?.userId);

            const syncedKeys = Array.from(recentlySyncedMap.keys());
            const allIndexedKeys = new Set<string>();
            if (syncedKeys.length > 0) {
                const { data: allIndexed } = await supabase
                    .from('sales')
                    .select('idempotency_key')
                    .eq('bar_id', currentBarId)
                    .in('idempotency_key', syncedKeys);

                (allIndexed || []).forEach((sale: { idempotency_key: string | null }) => {
                    if (sale.idempotency_key) allIndexedKeys.add(sale.idempotency_key);
                });
            }

            const transitionSales = buildTransitionSales(
                recentlySyncedMap,
                allIndexedKeys,
                startDate,
                endDate,
                isServerRole,
                currentSession?.userId
            );

            const returnsData = await ReturnsService.getReturns(currentBarId, startDate, endDate, serverId, operatingMode)
                .catch(() => []);

            const filteredReturns = (returnsData as DBReturn[]).filter(isConfirmedReturn);

            const allSalesForStats: RevenueSaleEntry[] = [
                ...serverRawData.map(sale => ({
                    total: Number(sale.total || 0),
                    payment_method: sale.payment_method,
                    business_date: sale.business_date,
                })),
                ...deduplicatedOfflineSales.map(sale => ({
                    total: Number(sale.total || 0),
                    payment_method: sale.payment_method,
                    business_date: sale.business_date || '',
                })),
                ...transitionSales,
            ].filter(sale => Boolean(sale.business_date));

            return buildRevenueStatsFromEntries(
                allSalesForStats,
                buildRefundsByDate(filteredReturns),
                false
            );
        },
        enabled: enabled && !!currentBarId,
        placeholderData: (previousData) => previousData || calculateLocalStats(),
        staleTime: CACHE_STRATEGY.dailyStats.staleTime,
        gcTime: CACHE_STRATEGY.dailyStats.gcTime,
    });

    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const handleQueueUpdate = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: statsKeys.all(currentBarId) });
            }, 150);
        };

        const handleSyncCompleted = () => {
            queryClient.invalidateQueries({ queryKey: statsKeys.all(currentBarId) });
        };

        window.addEventListener('queue-updated', handleQueueUpdate);
        window.addEventListener('sync-completed', handleSyncCompleted);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener('queue-updated', handleQueueUpdate);
            window.removeEventListener('sync-completed', handleSyncCompleted);
        };
    }, [startDate, endDate, currentBarId, isServerRole, currentSession?.userId, queryClient]);

    const lastUpdated = useMemo(() => new Date(), [stats?.netRevenue, stats?.grossRevenue, stats?.saleCount, stats?.days]);

    return {
        netRevenue: stats?.netRevenue ?? 0,
        grossRevenue: stats?.grossRevenue ?? 0,
        refundsTotal: stats?.refundsTotal ?? 0,
        saleCount: stats?.saleCount ?? 0,
        cashRevenue: stats?.cashRevenue ?? 0,
        mobileRevenue: stats?.mobileRevenue ?? 0,
        cardRevenue: stats?.cardRevenue ?? 0,
        days: stats?.days ?? [],
        isLoading,
        isOffline: !!error || !!stats?.isStale,
        source: (error || stats?.isStale) ? 'local' : 'sql',
        lastUpdated,
    };
}
