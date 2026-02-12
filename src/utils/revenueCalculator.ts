import { filterByBusinessDateRange } from './businessDateHelpers';
import { getSaleDate, isConfirmedReturn } from './saleHelpers';
import {
    type ValidatedCalculableSale,
    type ValidatedReturn,
    type ValidatedOfflineSale,
    CalculableSaleSchema,
    ReturnSchema,
    MinimalOfflineSaleSchema
} from './revenueSchemas';

export interface RecentlySyncedItem {
    total: number;
    timestamp: number;
    payload?: unknown; // Optionnel, non utilisé dans les calculs de revenus
}

export interface RevenueCalculatorOptions {
    sales: unknown[]; // We accept unknown and validate inside with Zod
    returns: unknown[];
    offlineSales: unknown[];
    recentlySyncedKeys: Map<string, RecentlySyncedItem>;
    startDate: string; // 'YYYY-MM-DD' - Required
    endDate: string;   // 'YYYY-MM-DD' - Required
    closeHour?: number;
    isServerRole: boolean;
    currentUserId?: string;
}

export type StrictRevenueCalculatorOptions = Omit<RevenueCalculatorOptions, 'sales' | 'returns' | 'offlineSales'> & {
    sales: ValidatedCalculableSale[];
    returns: ValidatedReturn[];
    offlineSales: ValidatedOfflineSale[];
};

export interface CalculatedStats {
    netRevenue: number;
    grossRevenue: number;
    refundsTotal: number;
    saleCount: number;
    averageSale: number;
}

/**
 * 🛡️ Validation Wrapper (Phase 5C)
 * Filters out invalid data to prevent calculation errors.
 */
function validateInputs(
    sales: unknown[],
    returns: unknown[],
    offlineSales: unknown[]
): { validSales: ValidatedCalculableSale[], validReturns: ValidatedReturn[], validOfflineSales: ValidatedOfflineSale[] } {
    const validSales: ValidatedCalculableSale[] = [];
    const validReturns: ValidatedReturn[] = [];
    const validOfflineSales: ValidatedOfflineSale[] = [];

    // Optimize: Loop once per array
    sales.forEach(sale => {
        // Use CalculableSaleSchema for leniency (supports partial objects from optimized SQL)
        const result = CalculableSaleSchema.safeParse(sale);
        if (result.success) {
            validSales.push(result.data);
        } else {
            const saleId = typeof sale === 'object' && sale !== null && 'id' in sale
                ? String((sale as Record<string, unknown>).id)
                : 'unknown';
            // Log validation failures for debugging (only in dev)
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[RevenueCalculator] Invalid sale ${saleId}:`,
                    result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
                );
            }
        }
    });

    returns.forEach(ret => {
        const result = ReturnSchema.safeParse(ret);
        if (result.success) {
            validReturns.push(result.data);
        } else {
            const retId = typeof ret === 'object' && ret !== null && 'id' in ret
                ? String((ret as Record<string, unknown>).id)
                : 'unknown';
            console.warn('[RevenueCalculator] Invalid return dropped:', retId, result.error.issues);
        }
    });

    offlineSales.forEach(os => {
        const result = MinimalOfflineSaleSchema.safeParse(os);
        if (result.success) {
            validOfflineSales.push(result.data);
        } else {
            console.warn('[RevenueCalculator] Invalid offline sale dropped:', result.error.issues);
        }
    });

    return { validSales, validReturns, validOfflineSales };
}

/**
 * Pure function to calculate revenue stats.
 * Expects validated data.
 */
export const calculateRevenueStatsPure = ({
    sales,
    returns,
    offlineSales,
    recentlySyncedKeys,
    startDate,
    endDate,
    closeHour = 6,
    isServerRole,
    currentUserId
}: StrictRevenueCalculatorOptions): CalculatedStats => {

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
        ? offlineSales.filter(s => s.soldBy === currentUserId)
        : offlineSales;

    const deduplicatedOfflineQueue = filteredOfflineSales.filter(sale => {
        const key = sale.idempotencyKey;
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
    let baseReturns = returns.filter(isConfirmedReturn);

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

/**
 * Main entry point: Validates inputs then calculates.
 */
export const calculateRevenueStats = (options: RevenueCalculatorOptions): CalculatedStats => {
    const { validSales, validReturns, validOfflineSales } = validateInputs(
        options.sales,
        options.returns,
        options.offlineSales
    );

    return calculateRevenueStatsPure({
        ...options,
        sales: validSales,
        returns: validReturns,
        offlineSales: validOfflineSales
    });
};
