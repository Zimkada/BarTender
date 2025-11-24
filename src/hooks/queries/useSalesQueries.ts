import { useQuery } from '@tanstack/react-query';
import { SalesService } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';

export const salesKeys = {
    all: ['sales'] as const,
    list: (barId: string) => [...salesKeys.all, 'list', barId] as const,
    detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
    stats: (barId: string) => [...salesKeys.all, 'stats', barId] as const,
};

export const useSales = (barId: string | undefined) => {
    return useQuery({
        queryKey: salesKeys.list(barId || ''),
        queryFn: async (): Promise<Sale[]> => {
            if (!barId) return [];
            const dbSales = await SalesService.getBarSales(barId);

            return dbSales.map(s => ({
                id: s.id,
                barId: s.bar_id,
                items: s.items as unknown as SaleItem[],
                subtotal: s.subtotal,
                discount: s.discount_total,
                total: s.total,
                currency: 'XOF', // Valeur par défaut
                paymentMethod: s.payment_method as 'cash' | 'mobile_money' | 'card' | 'credit',
                status: (s.status as 'pending' | 'validated' | 'rejected') || 'pending',
                createdBy: s.sold_by,
                createdAt: new Date(s.created_at),
                validatedBy: s.validated_by || undefined,
                validatedAt: s.validated_at ? new Date(s.validated_at) : undefined,
                rejectedBy: undefined,
                rejectedAt: undefined,
                customerName: s.customer_name || undefined,
                customerPhone: s.customer_phone || undefined,
                notes: s.notes || undefined,
                serverId: s.sold_by,
            }));
        },
        enabled: !!barId,
    });
};
