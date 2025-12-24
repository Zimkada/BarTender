
import { SalesService } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

export const salesKeys = {
    all: ['sales'] as const,
    list: (barId: string) => [...salesKeys.all, 'list', barId] as const,
    detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
    stats: (barId: string) => [...salesKeys.all, 'stats', barId] as const,
};

import { useProxyQuery } from './useProxyQuery';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';

export const useSales = (barId: string | undefined) => {
    return useProxyQuery(
        salesKeys.list(barId || ''),
        // Standard Fetcher
        async (): Promise<Sale[]> => {
            if (!barId) return [];
            const dbSales = await SalesService.getBarSales(barId);
            return mapSalesData(dbSales);
        },
        // Proxy Fetcher
        async (userId, _barId): Promise<Sale[]> => {
            if (!barId) return [];
            const dbSales = await ProxyAdminService.getBarSalesAsProxy(userId, barId);
            return mapSalesData(dbSales);
        },
        {
            enabled: !!barId,
            staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
            gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
            refetchInterval: 2000, // Poll every 2 seconds for real-time sales updates
        }
    );
};

// Helper to map DB sales to frontend type
const mapSalesData = (dbSales: any[]): Sale[] => {
    return dbSales.map(s => ({
        id: s.id,
        barId: s.bar_id,
        items: s.items as unknown as SaleItem[],
        subtotal: s.subtotal,
        discount: s.discount_total,
        total: s.total,
        currency: 'XOF',
        paymentMethod: s.payment_method as 'cash' | 'mobile_money' | 'card' | 'credit',
        status: (s.status as 'pending' | 'validated' | 'rejected') || 'pending',
        createdBy: s.sold_by,
        createdAt: new Date(s.created_at!),
        validatedBy: s.validated_by || undefined,
        validatedAt: s.validated_at ? new Date(s.validated_at) : undefined,
        rejectedBy: undefined,
        rejectedAt: undefined,
        businessDate: (s as any).business_date ? new Date((s as any).business_date) : undefined,
        customerName: s.customer_name || undefined,
        customerPhone: s.customer_phone || undefined,
        notes: s.notes || undefined,
        // 🔴 BUG #5 FIX: Use server_id instead of sold_by for filtering
        // - Full mode: server_id = sold_by (same person)
        // - Simplified mode: server_id = assigned server, sold_by = gérant
        serverId: s.server_id || s.sold_by, // Fallback to sold_by if server_id is NULL
    }));
};
