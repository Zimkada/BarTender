import { useQuery } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { CategoriesService } from '../../services/supabase/categories.service';
import { StockService } from '../../services/supabase/stock.service';
import { useAuth } from '../../context/AuthContext';
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
    const { isImpersonating, currentSession } = useAuth();
    return useQuery({
        queryKey: stockKeys.products(barId || ''),
        queryFn: async (): Promise<Product[]> => {
            if (!barId) return [];
            const dbProducts = await ProductsService.getBarProducts(barId, isImpersonating ? currentSession?.userId : undefined);

            return dbProducts.map(p => ({
                id: p.id,
                barId: p.bar_id,
                name: p.display_name,
                volume: p.global_product?.volume || 'N/A',
                price: p.price,
                stock: p.stock ?? 0,
                categoryId: p.local_category_id || '',
                image: p.display_image || undefined,
                alertThreshold: p.alert_threshold ?? 0,
                createdAt: new Date(p.created_at || Date.now()),
            }));
        },
        enabled: !!barId,
    });
};

export const useSupplies = (barId: string | undefined) => {
    return useQuery({
        queryKey: stockKeys.supplies(barId || ''),
        queryFn: async (): Promise<Supply[]> => {
            if (!barId) return [];
            const dbSupplies = await StockService.getSupplies(barId);

            return dbSupplies.map(s => ({
                id: s.id,
                barId: s.bar_id,
                productId: s.product_id,
                quantity: s.quantity,
                lotSize: 1, // Valeur par défaut car non stockée en base explicitement (calculée dans unit_cost)
                lotPrice: s.unit_cost, // Approximation
                supplier: s.supplier_name || 'Inconnu',
                date: new Date(s.supplied_at || s.created_at || Date.now()),
                totalCost: s.total_cost,
                createdBy: s.supplied_by,
                productName: (s.bar_product as any)?.display_name || 'Produit inconnu',
            }));
        },
        enabled: !!barId,
    });
};

export const useConsignments = (barId: string | undefined) => {
    return useQuery({
        queryKey: stockKeys.consignments(barId || ''),
        queryFn: async (): Promise<Consignment[]> => {
            if (!barId) return [];
            const dbConsignments = await StockService.getConsignments(barId);

            return dbConsignments.map(c => {
                // Mapping du statut DB vers App
                let status: Consignment['status'] = 'active';
                if (c.status === 'sold') status = 'claimed';
                if (c.status === 'returned') status = 'forfeited';
                // 'expired' n'est pas un statut DB explicite mais calculé ou mis à jour

                // Calcul date expiration (défaut +7j si non stocké)
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
        enabled: !!barId,
    });
};

export const useCategories = (barId: string | undefined) => {
    return useQuery({
        queryKey: stockKeys.categories(barId || ''),
        queryFn: async (): Promise<Category[]> => {
            if (!barId) return [];
            const enrichedCategories = await CategoriesService.getCategories(barId);

            return enrichedCategories.map(c => {
                // Derive display name and color
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
        enabled: !!barId,
    });
};

// Hook dérivé pour les produits en rupture
export const useLowStockProducts = (barId: string | undefined) => {
    const { data: products, isLoading } = useProducts(barId);

    const lowStockProducts = products?.filter(p => p.stock <= (p.alertThreshold || 0)) || [];

    return {
        data: lowStockProducts,
        isLoading,
        count: lowStockProducts.length
    };
};
