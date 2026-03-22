import { useQuery } from '@tanstack/react-query';
import { ReturnsService, type DBReturn } from '../../services/supabase/returns.service';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';
import type { Return } from '../../types';

export const returnKeys = {
    all: ['returns'] as const,
    list: (barId: string) => [...returnKeys.all, 'list', barId] as const,
};

export const useReturns = (barId: string | undefined, options?: { startDate?: string; endDate?: string; refetchInterval?: number | false }) => {
    const isEnabled = !!barId;

    // SmartSync pour returns: coupe le polling quand Realtime/Broadcast est actif
    const smartSync = useSmartSync({
        table: 'returns',
        event: '*',
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [returnKeys.list(barId || '')],
    });

    return useQuery({
        queryKey: [...returnKeys.list(barId || ''), { startDate: options?.startDate, endDate: options?.endDate }],
        networkMode: 'always', // 🛡️ Fix V11.6: Accès offline aux retours
        placeholderData: (previousData: any) => previousData, // 🛡️ Fix V11.6: Anti-flash
        queryFn: async (): Promise<Return[]> => {
            if (!barId) return [];
            const dbReturns = await ReturnsService.getReturns(
                barId,
                options?.startDate,
                options?.endDate
            );

            return mapReturnData(dbReturns);
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
        refetchInterval: options?.refetchInterval !== undefined
            ? options.refetchInterval
            : (smartSync.isSynced ? false : 30000),
    });
};

/**
 * Mappe les retours DB vers le type Return du frontend
 */
export const mapReturnData = (dbReturns: DBReturn[]): Return[] => {
    return dbReturns.map((r: DBReturn): Return => ({
        id: r.id,
        barId: r.bar_id,
        saleId: r.sale_id,
        productId: r.product_id,
        productName: r.product_name,
        productVolume: r.product_volume,
        quantitySold: r.quantity_sold,
        quantityReturned: r.quantity_returned,
        reason: r.reason as any,
        returnedBy: r.returned_by,
        serverId: r.server_id || undefined,
        server_id: r.server_id || undefined,
        returnedAt: new Date(r.returned_at),
        // ✅ FIX V12: Robust String-based Business Date (anti-timezone shift)
        businessDate: r.business_date || r.returned_at.split('T')[0],
        business_date: r.business_date || undefined,
        refundAmount: Number(r.refund_amount) || 0,
        isRefunded: r.is_refunded || false,
        status: (r.status as 'pending' | 'approved' | 'rejected' | 'restocked') || 'pending',
        autoRestock: r.auto_restock || false,
        manualRestockRequired: r.manual_restock_required || false,
        restockedAt: r.restocked_at ? new Date(r.restocked_at) : undefined,
        notes: r.notes || undefined,
        customRefund: r.custom_refund || undefined,
        customRestock: r.custom_restock || undefined,
        originalSeller: r.original_seller || undefined,
        operatingModeAtCreation: r.operating_mode_at_creation as 'full' | 'simplified' | undefined,
        validatedBy: r.validated_by || undefined,
        rejectedBy: r.rejected_by || undefined,
        validated_by: r.validated_by || undefined,
        rejected_by: r.rejected_by || undefined,
        linkedSaleId: r.linked_sale_id || undefined,
    }));
};
