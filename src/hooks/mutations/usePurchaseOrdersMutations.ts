import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PurchaseOrdersService } from '../../services/supabase/purchaseOrders.service';
import { purchaseOrderKeys } from '../queries/usePurchaseOrdersQueries';
import { stockKeys } from '../queries/useStockQueries';
import type { OrderDraftItem } from '../useOrderDraft';

export function usePurchaseOrdersMutations(barId: string | undefined) {
    const queryClient = useQueryClient();

    const invalidateOrders = () => {
        if (barId) {
            queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.list(barId) });
        }
    };

    const invalidateStock = () => {
        if (barId) {
            queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
            queryClient.invalidateQueries({ queryKey: stockKeys.supplies(barId) });
        }
    };

    const createOrder = useMutation({
        mutationFn: (params: { items: OrderDraftItem[]; notes?: string; createdBy: string }) =>
            PurchaseOrdersService.createOrder({
                barId: barId!,
                createdBy: params.createdBy,
                items: params.items,
                notes: params.notes,
            }),
        onSuccess: invalidateOrders,
        retry: false,
    });

    const markAsOrdered = useMutation({
        mutationFn: (orderId: string) => PurchaseOrdersService.markAsOrdered(orderId),
        onSuccess: invalidateOrders,
        retry: false,
    });

    const cancelOrder = useMutation({
        mutationFn: (orderId: string) => PurchaseOrdersService.cancelOrder(orderId),
        onSuccess: invalidateOrders,
        retry: false,
    });

    const convertToSupplies = useMutation({
        mutationFn: (params: {
            orderId: string;
            userId: string;
            receivedItems: { itemId: string; receivedQuantity: number }[];
        }) => PurchaseOrdersService.convertToSupplies(params),
        onSuccess: (_data, variables) => {
            invalidateOrders();
            invalidateStock();
            // Also invalidate the specific order detail
            queryClient.invalidateQueries({
                queryKey: purchaseOrderKeys.detail(variables.orderId),
            });
        },
        retry: false,
    });

    const closePartialOrder = useMutation({
        mutationFn: (params: { orderId: string; reason?: string }) =>
            PurchaseOrdersService.closePartialOrder(params),
        onSuccess: (_data, variables) => {
            invalidateOrders();
            queryClient.invalidateQueries({
                queryKey: purchaseOrderKeys.detail(variables.orderId),
            });
        },
        retry: false,
    });

    return { createOrder, markAsOrdered, cancelOrder, convertToSupplies, closePartialOrder };
}
