import { filterByBusinessDateRange } from './businessDateHelpers';
import type { Sale, Return } from '../types';
// We'll define a minimal interface for OfflineSale to avoid circular deps with services if possible, 
// or import it. Since services might depend on types, and utils are low-level, importing from service might be okay.
// But to be cleaner, let's just definition what we need: idempotency_key, total, sold_by.
export interface MinimalOfflineSale {
    idempotency_key?: string;
    total: number;
    sold_by: string;
}

export interface RecentlySyncedItem {
    total: number;
    timestamp: number;
    payload: any;
}

export interface RevenueCalculatorOptions {
    sales: Sale[];
    returns: Return[];
    offlineSales: MinimalOfflineSale[];
    recentlySyncedKeys: Map<string, RecentlySyncedItem>;
    startDate: string; // 'YYYY-MM-DD' - Required
    endDate: string;   // 'YYYY-MM-DD' - Required
    closeHour?: number;
    isServerRole: boolean;
    currentUserId?: string;
}

export interface CalculatedStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    averageSale: number;
}

/**
 * Pure function to calculate revenue stats.
 * Extracted from useRevenueStats for testing and stability.
 */
export const calculateRevenueStats = ({
    sales,
    returns,
    offlineSales,
    recentlySyncedKeys,
    startDate,
    endDate,
    closeHour = 6,
    isServerRole,
    currentUserId
}: RevenueCalculatorOptions): CalculatedStats => {

    // 1. Filter sales by server role if applicable
    let baseSales = sales.filter(s => s.status === 'validated');
    if (isServerRole) {
        baseSales = baseSales.filter(s => s.soldBy === currentUserId);
    }

    // 2. Filter by business date range
    const filteredSales = filterByBusinessDateRange(
        baseSales,
        startDate,
        endDate,
        closeHour
    );

    // 3. Transition Buffer Calculation (Bridge the gap post-sync)
    let transitionRevenue = 0;
    let transitionCount = 0;

    recentlySyncedKeys.forEach((data, key) => {
        // 🛡️ UNIFICATION (V11.6): Reliable deduplication via idempotencyKey
        const alreadyInServerSales = sales.some((s) => s.idempotencyKey === key);

        if (!alreadyInServerSales) {
            transitionRevenue += data.total;
            transitionCount += 1;
        }
    });

    // 4. Offline Sales & Deduplication
    const filteredOfflineSales = isServerRole
        ? offlineSales.filter(s => s.sold_by === currentUserId)
        : offlineSales;

    const deduplicatedOfflineQueue = filteredOfflineSales.filter(sale => {
        const key = sale.idempotency_key;
        // If it has a key and that key is in the recently synced map, we filter it out 
        // because it's either already in 'sales' OR in 'transitionRevenue'
        return !key || !recentlySyncedKeys.has(key);
    });

    // 5. Calculate Totals (Safe sums)
    const offlineRevenue = deduplicatedOfflineQueue.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const serverRevenue = filteredSales.reduce((sum, sale) => sum + (sale.total || 0), 0);

    const grossRevenue = serverRevenue + offlineRevenue + transitionRevenue;
    const saleCount = filteredSales.length + deduplicatedOfflineQueue.length + transitionCount;

    // 6. Returns Calculation
    let baseReturns = returns.filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'));

    if (isServerRole) {
        // Source of truth: serverId is the server who made the original sale
        // we check r.serverId (or r.server_id alias if present in type, but interface has serverId)
        baseReturns = baseReturns.filter(r => r.serverId === currentUserId);
    }

    const filteredReturns = filterByBusinessDateRange(
        baseReturns,
        startDate,
        endDate,
        closeHour
    );

    const refundsTotal = filteredReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
    const netRevenue = grossRevenue - refundsTotal;

    return {
        netRevenue,
        grossRevenue,
        refundsTotal,
        saleCount,
        averageSale: saleCount > 0 ? grossRevenue / saleCount : 0
    };
};
