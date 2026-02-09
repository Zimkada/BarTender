/**
 * useUnifiedStock.ts - Smart Hook (Mission Elite)
 * Unifie le stock physique (Supabase), les consignations et les ventes offline (IndexedDB).
 * Indépendant de tout Context global.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { useProducts, useSupplies, useConsignments, stockKeys } from '../queries/useStockQueries';
import { useStockMutations } from '../mutations/useStockMutations';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { calculateAvailableStock } from '../../utils/calculations';
import { auditLogger } from '../../services/AuditLogger';
import { toDbProduct, toDbProductForCreation } from '../../utils/productMapper';
import type { Product, ProductStockInfo } from '../../types';

export const useUnifiedStock = (barId: string | undefined) => {
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();

    // 1. Queries de base (React Query)
    const { data: products = [], isLoading: isLoadingProducts } = useProducts(barId);
    const { data: supplies = [], isLoading: isLoadingSupplies } = useSupplies(barId);
    const { data: consignments = [], isLoading: isLoadingConsignments } = useConsignments(barId);

    // 2. Mutations
    const mutations = useStockMutations();

    // ===== MUTATIONS WRAPPERS (Compatibilité & Audit) =====

    const addProduct = useCallback((productData: Omit<Product, 'id' | 'createdAt'>) => {
        if (!barId || !session) return;

        const dbProduct = toDbProductForCreation(productData, barId);

        mutations.createProduct.mutate(dbProduct, {
            onSuccess: (data) => {
                auditLogger.log({
                    event: 'PRODUCT_CREATED',
                    severity: 'info',
                    userId: session.userId,
                    userName: session.userName,
                    userRole: session.role,
                    barId: barId,
                    description: `Création produit: ${data.local_name}`,
                    relatedEntityId: data.id,
                    relatedEntityType: 'product',
                });
            }
        });
    }, [barId, mutations, session]);

    const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
        const dbUpdates = toDbProduct(updates, true);
        mutations.updateProduct.mutate({ id, updates: dbUpdates });
    }, [mutations]);

    const deleteProduct = useCallback((id: string) => {
        mutations.deleteProduct.mutate(id);
    }, [mutations]);

    const adjustStock = useCallback((productId: string, delta: number, reason: string) => {
        mutations.adjustStock.mutate({ productId, delta, reason });
    }, [mutations]);

    // Help for migration: map adjustStock to increase/decrease
    const increasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'restock') => {
        adjustStock(productId, quantity, reason);
        return true;
    }, [adjustStock]);

    const decreasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'manual_decrease') => {
        adjustStock(productId, -quantity, reason);
        return true;
    }, [adjustStock]);

    // 3. Query des ventes offline (Spécifique pour déduction de stock)
    const { data: offlineSales = [], refetch: refetchOfflineSales } = useQuery({
        queryKey: ['offline-sales-for-stock', barId],
        networkMode: 'always',
        queryFn: async () => {
            if (!barId) return [];
            const ops = await offlineQueue.getOperations({
                status: 'pending',
                barId: barId
            });
            return ops
                .filter(op => op.type === 'CREATE_SALE')
                .map(op => op.payload);
        },
        enabled: !!barId,
        staleTime: 5000,
    });

    // 🚀 Réactivité : Écoute des événements typés Pilier 0
    useEffect(() => {
        const handleSync = (e: any) => {
            // Si une synchro de stock ou de vente finit, on rafraîchit
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOfflineSales();
                // Optionnel: On peut aussi invalider les queries stock
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId || '') });
            }
        };

        window.addEventListener('stock-synced', handleSync);
        window.addEventListener('sales-synced', handleSync);
        window.addEventListener('queue-updated', handleSync); // Toujours utile si on ajoute une vente offline

        return () => {
            window.removeEventListener('stock-synced', handleSync);
            window.removeEventListener('sales-synced', handleSync);
            window.removeEventListener('queue-updated', handleSync);
        };
    }, [barId, refetchOfflineSales, queryClient]);

    /**
     * 🔴 Hash-based Memoization (Mission Elite)
     * On crée un hash des IDs et du contenu critique pour stabiliser la référence de allProductsStockInfo
     */
    const stockHash = useMemo(() => {
        return JSON.stringify({
            p: products.map(p => `${p.id}-${p.stock}`),
            c: consignments.filter(c => c.status === 'active').map(c => `${c.id}-${c.quantity}`),
            o: offlineSales.map(s => s.idempotency_key)
        });
    }, [products, consignments, offlineSales]);

    const allProductsStockInfo = useMemo(() => {
        const infoMap: Record<string, ProductStockInfo> = {};
        const recentlySyncedKeys = syncManager.getRecentlySyncedKeys();

        // 1. Physique
        products.forEach(p => {
            infoMap[p.id] = {
                productId: p.id,
                physicalStock: p.stock,
                consignedStock: 0,
                availableStock: p.stock
            };
        });

        // 2. Consignations
        consignments.forEach(c => {
            if (c.status === 'active' && infoMap[c.productId]) {
                infoMap[c.productId].consignedStock += c.quantity;
            }
        });

        // 3. Offline
        offlineSales.forEach(sale => {
            if (sale.idempotency_key && recentlySyncedKeys.has(sale.idempotency_key)) return;

            sale.items.forEach(item => {
                if (infoMap[item.product_id]) {
                    infoMap[item.product_id].availableStock -= item.quantity;
                }
            });
        });

        // 4. Final calculation
        Object.values(infoMap).forEach(info => {
            info.availableStock = calculateAvailableStock(info.availableStock, info.consignedStock);
        });

        return infoMap;
    }, [stockHash]); // 🛡️ Dépendance STABLE via le hash

    // Helpers
    const getProductStockInfo = useCallback((productId: string) => {
        return allProductsStockInfo[productId] || null;
    }, [allProductsStockInfo]);

    const getAverageCostPerUnit = useCallback((productId: string): number => {
        const productSupplies = supplies.filter(s => s.productId === productId);
        if (productSupplies.length === 0) return 0;
        const totalCost = productSupplies.reduce((sum, s) => sum + s.totalCost, 0);
        const totalQuantity = productSupplies.reduce((sum, s) => sum + s.quantity, 0);
        return totalQuantity > 0 ? totalCost / totalQuantity : 0;
    }, [supplies]);

    return {
        products,
        consignments,
        supplies,
        allProductsStockInfo,
        getProductStockInfo,
        getAverageCostPerUnit,
        addProduct,
        updateProduct,
        deleteProduct,
        increasePhysicalStock,
        decreasePhysicalStock,
        isLoading: isLoadingProducts || isLoadingSupplies || isLoadingConsignments,
        mutations
    };
};
