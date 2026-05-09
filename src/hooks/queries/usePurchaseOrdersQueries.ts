import { useQuery } from '@tanstack/react-query';
import { PurchaseOrdersService } from '../../services/supabase/purchaseOrders.service';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

export const purchaseOrderKeys = {
    all: ['purchase-orders'] as const,
    list: (barId: string) => [...purchaseOrderKeys.all, 'list', barId] as const,
    detail: (orderId: string) => [...purchaseOrderKeys.all, 'detail', orderId] as const,
};

export function usePurchaseOrders(barId: string | undefined) {
    return useQuery({
        queryKey: purchaseOrderKeys.list(barId ?? ''),
        queryFn: () => PurchaseOrdersService.getOrders(barId!),
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        gcTime: CACHE_STRATEGY.products.gcTime,
    });
}

export function usePurchaseOrder(orderId: string | undefined) {
    return useQuery({
        queryKey: purchaseOrderKeys.detail(orderId ?? ''),
        queryFn: () => PurchaseOrdersService.getOrder(orderId!),
        enabled: !!orderId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        gcTime: CACHE_STRATEGY.products.gcTime,
    });
}
