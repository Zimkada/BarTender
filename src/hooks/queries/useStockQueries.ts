import { useQuery } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { CategoriesService } from '../../services/supabase/categories.service';
import { StockService } from '../../services/supabase/stock.service';
import { useApiQuerySimple } from './useApiQuery';
import type { Product, Supply, Consignment, Category } from '../../types';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';

// Clés de requête pour l'invalidation
export const stockKeys = {
    all: ['stock'] as const,
    products: (barId: string) => [...stockKeys.all, 'products', barId] as const,
    supplies: (barId: string) => [...stockKeys.all, 'supplies', barId] as const,
    consignments: (barId: string) => [...stockKeys.all, 'consignments', barId] as const,
    categories: (barId: string) => [...stockKeys.all, 'categories', barId] as const,
};

export const useProducts = (barId: string | undefined) => {
    // 🔧 PHASE 1-2: SmartSync branché - Hybride Broadcast + Realtime + Polling adaptatif
    const smartSync = useSmartSync({
        table: 'bar_products',
        event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
        barId: barId || undefined,
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        refetchInterval: 30000,
        queryKeysToInvalidate: [stockKeys.products(barId || '')] // 🚀 FIX: Invalidate specific stock keys
    });

    // Standard query for fetching products
    return useQuery({
        queryKey: stockKeys.products(barId || '') as any,
        queryFn: async () => {
            if (!barId) return [];
            const dbProducts = await ProductsService.getBarProducts(barId);
            return mapProducts(dbProducts);
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        gcTime: CACHE_STRATEGY.products.gcTime,
        networkMode: 'always', // 🛡️ CRITIQUE: Permet l'accès au cache stock offline
        refetchInterval: smartSync.isSynced ? false : 30000, // 🚀 Hybride: Realtime si connecté, sinon polling 30s
    });
};

// Helper pour mapper les produits
const mapProducts = (dbProducts: any[]): Product[] => {
    return dbProducts.map(p => ({
        id: p.id,
        barId: p.bar_id,
        name: p.display_name || p.local_name || p.name, // Fallback chain
        volume: p.volume || p.global_product?.volume || p.product_volume || '', // ✨ Fixed: Check local volume first
        price: p.price,
        stock: p.stock ?? 0,
        categoryId: p.local_category_id || '',
        image: p.display_image || p.local_image || p.official_image || undefined,
        alertThreshold: p.alert_threshold ?? 0,
        createdAt: new Date(p.created_at || Date.now()),
        currentAverageCost: p.current_average_cost ?? 0, // ✨ Added CUMP field
    }));
};

export const useSupplies = (barId: string | undefined) => {
    // 🔧 PHASE 1-2: SmartSync pour supplies
    const smartSync = useSmartSync({
        table: 'supplies',
        event: 'INSERT',
        barId: barId || undefined,
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        refetchInterval: 60000,
        queryKeysToInvalidate: [
            stockKeys.supplies(barId || '') as any,
            stockKeys.products(barId || '') as any
        ]
    });

    return useApiQuerySimple(
        stockKeys.supplies(barId || '') as any,
        async (): Promise<Supply[]> => {
            if (!barId) return [];
            const dbSupplies = await StockService.getSupplies(barId);

            return dbSupplies.map(s => ({
                id: s.id,
                barId: s.bar_id,
                productId: s.product_id,
                quantity: s.quantity,
                lotSize: 1,
                lotPrice: s.unit_cost,
                supplier: s.supplier_name || 'Inconnu',
                date: new Date(s.supplied_at || s.created_at || Date.now()),
                totalCost: s.total_cost,
                createdBy: s.supplied_by,
                productName: (s as any).bar_product?.display_name || 'Produit inconnu',
            }));
        },
        {
            enabled: !!barId,
            staleTime: CACHE_STRATEGY.products.staleTime,
            gcTime: CACHE_STRATEGY.products.gcTime,
            networkMode: 'always', // 🛡️ CRITIQUE
            refetchInterval: smartSync.isSynced ? false : 60000, // 🚀 Hybride: Realtime ou polling 60s
        }
    );
};

export const useConsignments = (barId: string | undefined) => {
    // 🔧 PHASE 1-2: SmartSync pour consignations
    const smartSync = useSmartSync({
        table: 'consignments',
        event: '*', // INSERT, UPDATE, DELETE (pour claim/forfeit)
        barId: barId || undefined,
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.products.staleTime,
        refetchInterval: 60000,
        queryKeysToInvalidate: [
            stockKeys.consignments(barId || '') as any,
            stockKeys.products(barId || '') as any // Les consignations impactent le calcul du stock dispo
        ]
    });

    return useApiQuerySimple(
        stockKeys.consignments(barId || '') as any,
        async (): Promise<Consignment[]> => {
            if (!barId) return [];
            const dbConsignments = await StockService.getConsignments(barId);

            return dbConsignments.map(c => {
                let status: Consignment['status'] = c.status as any || 'active';
                // Direct mapping - statuses are already correct in DB
                if (c.status === 'claimed') status = 'claimed';
                if (c.status === 'forfeited') status = 'forfeited';
                if (c.status === 'expired') status = 'expired';

                const createdAt = new Date(c.created_at || Date.now());
                const expiresAt = new Date(c.expires_at || createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

                return {
                    id: c.id,
                    barId: c.bar_id,
                    saleId: c.sale_id,
                    productId: c.product_id,
                    productName: c.product_name,
                    productVolume: c.product_volume,
                    quantity: c.quantity,
                    totalAmount: c.total_amount,
                    createdAt: createdAt,
                    expiresAt: expiresAt,
                    claimedAt: c.claimed_at ? new Date(c.claimed_at) : undefined,
                    businessDate: c.business_date ? new Date(c.business_date) : new Date(),
                    status: status,
                    createdBy: c.created_by,
                    serverId: c.server_id || undefined,
                    originalSeller: c.original_seller || undefined,
                    customerName: c.customer_name || undefined,
                    customerPhone: c.customer_phone || undefined,
                    notes: c.notes || undefined,
                };
            });
        },
        {
            enabled: !!barId,
            staleTime: CACHE_STRATEGY.products.staleTime,
            gcTime: CACHE_STRATEGY.products.gcTime,
            networkMode: 'always', // 🛡️ CRITIQUE
            refetchInterval: smartSync.isSynced ? false : 60000,
        }
    );
};

export const useCategories = (barId: string | undefined) => {
    return useApiQuerySimple(
        stockKeys.categories(barId || '') as any,
        async (): Promise<Category[]> => {
            if (!barId) return [];
            const enrichedCategories = await CategoriesService.getCategories(barId);

            return enrichedCategories.map(c => {
                const name = c.custom_name || c.global_category?.name || 'Sans nom';
                const color = c.custom_color || c.global_category?.color || '#3B82F6';

                return {
                    id: c.id,
                    barId: c.bar_id,
                    name: name,
                    color: color,
                    createdAt: new Date(c.created_at || Date.now()),
                };
            });
        },
        {
            enabled: !!barId,
            staleTime: CACHE_STRATEGY.categories.staleTime,
            gcTime: CACHE_STRATEGY.categories.gcTime,
        }
    );
};

export const useLowStockProducts = (barId: string | undefined) => {
    const { data: products, isLoading } = useProducts(barId);

    const lowStockProducts = products?.filter(p => p.stock <= (p.alertThreshold || 0)) || [];

    return {
        data: lowStockProducts,
        isLoading,
        count: lowStockProducts.length
    };
};
