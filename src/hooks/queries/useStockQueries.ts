import { useQuery } from '@tanstack/react-query';
import { ProductsService } from '../../services/supabase/products.service';
import { CategoriesService } from '../../services/supabase/categories.service';
import { StockService } from '../../services/supabase/stock.service';
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
    return useQuery({
        queryKey: stockKeys.products(barId || ''),
        queryFn: async (): Promise<Product[]> => {
            if (!barId) return [];
            const dbProducts = await ProductsService.getBarProducts(barId);

            return dbProducts.map(p => ({
                id: p.id,
                barId: p.bar_id,
                name: p.display_name,
                volume: p.global_product?.volume || 'N/A',
                price: p.price,
                stock: p.stock,
                categoryId: p.local_category_id || '',
                image: p.display_image || undefined,
                alertThreshold: p.alert_threshold,
                createdAt: new Date(p.created_at),
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
                date: new Date(s.supplied_at || s.created_at),
                totalCost: s.total_cost,
                createdBy: s.supplied_by,
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
                const createdAt = new Date(c.consigned_at || c.created_at);
                const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

                return {
                    id: c.id,
                    barId: c.bar_id,
                    saleId: '', // Non lié directement dans le modèle actuel simplifié
                    productId: c.product_id,
                    productName: 'Produit', // Idéalement join avec products
                    productVolume: '',
                    quantity: c.quantity_out,
                    totalAmount: c.quantity_out * c.unit_price,
                    createdAt: createdAt,
                    expiresAt: expiresAt,
                    claimedAt: c.returned_at ? new Date(c.returned_at) : undefined,
                    status: status,
                    createdBy: c.consigned_by,
                    customerName: c.customer_name,
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

            return enrichedCategories.map(c => ({
                id: c.id,
                barId: c.bar_id,
                name: c.display_name,
                color: c.display_color,
                createdAt: new Date(c.created_at),
            }));
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
