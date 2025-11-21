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
                saleId: r.sale_id || '', // New field
                productId: r.product_id,
                quantity: r.quantity,
                reason: r.reason || '',
                status: 'pending', // Default status as DB model might be simplified
                refundAmount: 0, // Not in DB yet?
                isRefunded: false,
                returnedBy: r.returned_by,
                returnedAt: new Date(r.returned_at),
                processedBy: undefined,
                processedAt: undefined,
            }));
        },
        enabled: !!barId,
    });
};
