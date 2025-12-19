import { ProductsService } from '../../services/supabase/products.service';
import { CategoriesService } from '../../services/supabase/categories.service';
import { StockService } from '../../services/supabase/stock.service';
import { useApiQuery, useApiQuerySimple } from './useApiQuery';
import { useProxyQuery } from './useProxyQuery';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';
import type { Product, Supply, Consignment, Category } from '../../types';

// Clés de requête pour l'invalidation
export const stockKeys = {
    all: ['stock'] as const,
    products: (barId: string) => [...stockKeys.all, 'products', barId] as const,
    supplies: (barId: string) => [...stockKeys.all, 'supplies', barId] as const,
    consignments: (barId: string) => [...stockKeys.all, 'consignments', barId] as const,
    categories: (barId: string) => [...stockKeys.all, 'categories', barId] as const,
};

export const useProducts = (barId: string | undefined) => {
    // Utiliser useProxyQuery pour supporter l'impersonnation Super Admin
    return useProxyQuery(
        stockKeys.products(barId || ''),
        // 1. Fetcher Standard
        async () => {
            if (!barId) return [];
            // Note: Le paramètre impersonatingUserId n'est plus nécessaire ici car géré par le proxy
            // Si l'ancienne auth impersonation est encore utilisée ailleurs, on laisse undefined
            const dbProducts = await ProductsService.getBarProducts(barId);

            return mapProducts(dbProducts);
        },
        // 2. Fetcher Proxy (Super Admin As User)
        async (userId, barIdArg) => {
            const dbProducts = await ProxyAdminService.getBarProductsAsProxy(userId, barIdArg);
            return mapProducts(dbProducts);
        },
        { enabled: !!barId }
    );
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
    return useApiQuerySimple(
        stockKeys.supplies(barId || ''),
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
                productName: (s.bar_product as any)?.display_name || 'Produit inconnu',
            }));
        },
        { enabled: !!barId }
    );
};

export const useConsignments = (barId: string | undefined) => {
    return useApiQuerySimple(
        stockKeys.consignments(barId || ''),
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
                    businessDate: c.business_date ? new Date(c.business_date) : undefined,
                    status: status,
                    createdBy: c.created_by,
                    customerName: c.customer_name || undefined,
                    customerPhone: c.customer_phone || undefined,
                    notes: c.notes || undefined,
                };
            });
        },
        { enabled: !!barId }
    );
};

export const useCategories = (barId: string | undefined) => {
    return useApiQuerySimple(
        stockKeys.categories(barId || ''),
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
        { enabled: !!barId }
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
