
import { SalesService } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';

export const salesKeys = {
    all: ['sales'] as const,
    list: (barId: string) => [...salesKeys.all, 'list', barId] as const,
    detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
    stats: (barId: string) => [...salesKeys.all, 'stats', barId] as const,
};

import { useProxyQuery } from './useProxyQuery';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';

export const useSales = (barId: string | undefined) => {
    const isEnabled = !!barId;

    // 🔧 PHASE 1-2: SmartSync pour sales (INSERT car nouvelles ventes)
    const smartSync = useSmartSync({
        table: 'sales',
        event: 'INSERT',
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [
            salesKeys.list(barId || ''),
            salesKeys.stats(barId || '')
        ]
    });

    if (isEnabled) {
        console.log('[useSales] Query ENABLED for barId:', barId);
    } else {
        console.log('[useSales] Query DISABLED - barId is empty:', { barId, isEnabled });
    }

    return useProxyQuery(
        salesKeys.list(barId || '') as any,
        // Standard Fetcher
        async (): Promise<Sale[]> => {
            if (!barId) return [];
            console.log('[useSales] Fetching sales for barId:', barId);
            const dbSales = await SalesService.getBarSales(barId);
            console.log('[useSales] Fetched', dbSales.length, 'sales');
            return mapSalesData(dbSales);
        },
        // Proxy Fetcher
        async (userId, _barId): Promise<Sale[]> => {
            if (!barId) return [];
            console.log('[useSales] Fetching sales via proxy for barId:', barId, 'userId:', userId);
            const dbSales = await ProxyAdminService.getBarSalesAsProxy(userId, barId);
            console.log('[useSales] Fetched', dbSales.length, 'sales via proxy');
            return mapSalesData(dbSales);
        },
        {
            enabled: isEnabled,
            staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
            gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
            refetchInterval: smartSync.isSynced ? false : 30000, // 🚀 Hybride: Realtime ou polling 30s
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
        businessDate: (s as any).business_date ? new Date((s as any).business_date) : new Date(),
        customerName: s.customer_name || undefined,
        customerPhone: s.customer_phone || undefined,
        notes: s.notes || undefined,
        // ✨ Use server_id for filtering (migration should have populated all values)
        // - Full mode: server_id = sold_by (same person)
        // - Simplified mode: server_id = assigned server, sold_by = gérant
        serverId: s.server_id ?? undefined, // No fallback to sold_by
    }));
};
