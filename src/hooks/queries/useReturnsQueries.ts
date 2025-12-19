import { useQuery } from '@tanstack/react-query';
import { ReturnsService } from '../../services/supabase/returns.service';
import type { Return } from '../../types';

export const returnKeys = {
    all: ['returns'] as const,
    list: (barId: string) => [...returnKeys.all, 'list', barId] as const,
};

export const useReturns = (barId: string | undefined) => {
    return useQuery({
        queryKey: returnKeys.list(barId || ''),
        queryFn: async (): Promise<Return[]> => {
            if (!barId) return [];
            const dbReturns = await ReturnsService.getReturns(barId);

            return dbReturns.map(r => ({
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
                returnedAt: new Date(r.returned_at),
                businessDate: r.business_date ? new Date(r.business_date) : new Date(r.returned_at),
                refundAmount: Number(r.refund_amount) || 0,
                isRefunded: r.is_refunded || false,
                status: (r.status as any) || 'pending',
                autoRestock: r.auto_restock || false,
                manualRestockRequired: r.manual_restock_required || false,
                restockedAt: r.restocked_at ? new Date(r.restocked_at) : undefined,
                notes: r.notes || undefined,
                customRefund: r.custom_refund || undefined,
                customRestock: r.custom_restock || undefined,
                originalSeller: r.original_seller || undefined,
            }));
        },
        enabled: !!barId,
    });
};
