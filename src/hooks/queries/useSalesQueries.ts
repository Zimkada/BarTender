
import { useQuery } from '@tanstack/react-query';
import { SalesService, type DBSale } from '../../services/supabase/sales.service';
import type { Sale, SaleItem } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';
import { z } from 'zod';

// 🛡️ Fix V12: Runtime Validation
const SaleItemSchema = z.object({
    product_id: z.string(),
    product_name: z.string(),
    quantity: z.number(),
    unit_price: z.number(),
    total_price: z.number(),
    // Optional legacy fields
    original_unit_price: z.number().optional(),
    discount_amount: z.number().optional(),
    promotion_id: z.string().optional(),
}).passthrough(); // Allow extra fields without crashing

const DBSaleItemsSchema = z.array(SaleItemSchema);

export const salesKeys = {
    all: ['sales'] as const,
    list: (barId: string) => [...salesKeys.all, 'list', barId] as const,
    detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
    stats: (barId: string) => [...salesKeys.all, 'stats', barId] as const,
};

export const useSales = (barId: string | undefined, options?: { startDate?: string; endDate?: string; searchTerm?: string }) => {
    const isEnabled = !!barId;

    // 🔧 PHASE 1-2: SmartSync pour sales (INSERT car nouvelles ventes)
    const smartSync = useSmartSync({
        table: 'sales',
        event: '*', // 🚀 FIX: Écouter TOUS les changements (UPDATE pour validation, DELETE, INSERT)
        barId: barId || undefined,
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [
            salesKeys.list(barId || ''),
            salesKeys.stats(barId || '')
        ]
    });

    return useQuery({
        queryKey: [...salesKeys.list(barId || ''), options] as any,
        networkMode: 'always', // 🛡️ CRITIQUE: Permet l'accès au cache même offline
        queryFn: async (): Promise<Sale[]> => {
            if (!barId) return [];
            const dbSales = await SalesService.getBarSales(barId, options);
            // Plus besoin de cast complexe, getBarSales retourne DBSale[]
            return mapSalesData(dbSales);
        },
        enabled: isEnabled,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
        gcTime: CACHE_STRATEGY.salesAndStock.gcTime,
        refetchInterval: smartSync.isSynced ? false : 30000, // 🚀 Hybride: Realtime ou polling 30s
        placeholderData: (previousData: Sale[] | undefined) => previousData, // 🛡️ Fix V12: Typage strict
    });
};

// Helper to map DB sales to frontend type
// 🛡️ Fix V12: Typed input instead of any[]
export const mapSalesData = (dbSales: DBSale[]): Sale[] => {
    return dbSales.map(s => {
        // 🛡️ Validation Runtime des items (Critical Path)
        // On sécurise les items mal formés qui pourraient crasher l'UI
        let items: SaleItem[] = [];
        try {
            // On accepte que s.items soit n'importe quoi venant de la DB (jsonb)
            // et on le parse/valide avec Zod
            items = DBSaleItemsSchema.parse(s.items) as unknown as SaleItem[];
        } catch (e) {
            console.warn(`[mapSalesData] Invalid items for sale ${s.id}`, e);
            items = []; // Fallback safe
        }

        return {
            id: s.id,
            barId: s.bar_id,
            items: items,
            subtotal: s.subtotal,
            discount: s.discount_total || 0, // Handle null
            total: s.total,
            currency: 'XOF',
            paymentMethod: (s.payment_method as 'cash' | 'mobile_money' | 'card' | 'credit') || 'cash',
            status: (s.status as 'pending' | 'validated' | 'rejected') || 'pending',
            createdBy: s.created_by || 'unknown',  // ✨ FIX: Audit trail - qui a cliqué créer
            soldBy: s.sold_by || 'unknown',        // ✨ FIX: Attribution métier - qui reçoit le crédit
            createdAt: new Date(s.created_at!), // created_at can be null in types but likely not in DB for sales
            validatedBy: s.validated_by || undefined,
            validatedAt: s.validated_at ? new Date(s.validated_at) : undefined,
            rejectedBy: s.rejected_by || undefined,
            rejectedAt: s.rejected_at ? new Date(s.rejected_at) : undefined,
            businessDate: s.business_date ? new Date(s.business_date) : new Date(),
            customerName: s.customer_name || undefined,
            customerPhone: s.customer_phone || undefined,
            notes: s.notes || undefined,
            serverId: s.server_id || undefined,
            // 🛡️ Fix V12: Safe access thanks to DBSale
            ticketId: s.ticket_id || undefined,
            idempotencyKey: s.idempotency_key || undefined,
            sourceReturnId: s.source_return_id || undefined,
        };
    });
};
