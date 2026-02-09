/**
 * useUnifiedStock.ts - Smart Hook (Mission Elite)
 * Unifie le stock physique (Supabase), les consignations et les ventes offline (IndexedDB).
 * Indépendant de tout Context global.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useProducts, useSupplies, useConsignments, useCategories, stockKeys } from '../queries/useStockQueries';
import { useStockMutations } from '../mutations/useStockMutations';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { calculateAvailableStock } from '../../utils/calculations';
import { toDbProduct, toDbProductForCreation } from '../../utils/productMapper';
import type { Product, ProductStockInfo, Supply, Expense } from '../../types';

export type CreateExpenseCallback = (expense: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;

export interface CreateConsignmentData {
    saleId: string;
    productId: string;
    productName: string;
    productVolume?: string;
    quantity: number;
    totalAmount: number;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    expiresAt: Date | string;
    expirationDays?: number;
    originalSeller: string;
    serverId?: string;
    businessDate: string;
}

export const useUnifiedStock = (barId: string | undefined) => {
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();

    // 1. Queries de base (React Query)
    const { data: products = [], isLoading: isLoadingProducts } = useProducts(barId);
    const { data: supplies = [], isLoading: isLoadingSupplies } = useSupplies(barId);
    const { data: consignments = [], isLoading: isLoadingConsignments } = useConsignments(barId);
    const { data: categories = [], isLoading: isLoadingCategories } = useCategories(barId);

    // 2. Mutations
    const mutations = useStockMutations();

    // ===== MUTATIONS WRAPPERS (Compatibilité & Audit) =====

    const addProduct = useCallback((productData: Omit<Product, 'id' | 'createdAt'>) => {
        if (!barId || !session) return;
        const dbProduct = toDbProductForCreation(productData, barId);
        mutations.createProduct.mutate(dbProduct);
    }, [barId, mutations, session]);

    const addProducts = useCallback((productsData: Omit<Product, 'id' | 'createdAt'>[]) => {
        if (!barId || !session) return;
        // Pour l'instant, on boucle car useStockMutations n'a pas encore de batch rpc unifié
        // Mais on l'expose au context pour la compatibilité
        productsData.forEach(p => addProduct(p));
    }, [barId, session, addProduct]);

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
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOfflineSales();
                queryClient.invalidateQueries({ queryKey: stockKeys.products(barId || '') });
            }
        };

        window.addEventListener('stock-synced', handleSync);
        window.addEventListener('sales-synced', handleSync);
        window.addEventListener('queue-updated', handleSync);

        return () => {
            window.removeEventListener('stock-synced', handleSync);
            window.removeEventListener('sales-synced', handleSync);
            window.removeEventListener('queue-updated', handleSync);
        };
    }, [barId, refetchOfflineSales, queryClient]);

    /**
     * 🔴 Hash-based Memoization (Mission Elite)
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

        products.forEach(p => {
            infoMap[p.id] = { productId: p.id, physicalStock: p.stock, consignedStock: 0, availableStock: p.stock };
        });

        consignments.forEach(c => {
            if (c.status === 'active' && infoMap[c.productId]) {
                infoMap[c.productId].consignedStock += c.quantity;
            }
        });

        offlineSales.forEach(sale => {
            if (sale.idempotency_key && recentlySyncedKeys.has(sale.idempotency_key)) return;
            sale.items.forEach(item => {
                if (infoMap[item.product_id]) {
                    infoMap[item.product_id].availableStock -= item.quantity;
                }
            });
        });

        Object.values(infoMap).forEach(info => {
            info.availableStock = calculateAvailableStock(info.availableStock, info.consignedStock);
        });

        return infoMap;
    }, [stockHash]);

    // 4. Helpers (Memoized)
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

    // ===== LOGIQUE DE CONSIGNATION =====

    const createConsignment = useCallback((data: CreateConsignmentData) => {
        if (!barId || !session) return Promise.reject('No bar or session');

        const consignmentData = {
            saleId: data.saleId,
            productId: data.productId,
            productName: data.productName,
            productVolume: data.productVolume,
            quantity: data.quantity,
            totalAmount: data.totalAmount,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            notes: data.notes,
            expiresAt: typeof data.expiresAt === 'string' ? new Date(data.expiresAt) : data.expiresAt,
            expirationDays: data.expirationDays || 7,
            originalSeller: data.originalSeller,
            serverId: data.serverId,
            businessDate: data.businessDate,
        };

        return new Promise((resolve, reject) => {
            mutations.createConsignment.mutate(consignmentData, {
                onSuccess: (data) => resolve(data),
                onError: (err) => reject(err)
            });
        });
    }, [barId, session, mutations]);

    const claimConsignment = useCallback((consignmentId: string) => {
        const consignment = consignments.find(c => c.id === consignmentId);
        if (!consignment || !session) return false;

        mutations.claimConsignment.mutate({
            id: consignmentId,
            productId: consignment.productId,
            quantity: consignment.quantity,
            claimedBy: session.userId
        });
        return true;
    }, [consignments, session, mutations]);

    const forfeitConsignment = useCallback((consignmentId: string) => {
        const consignment = consignments.find(c => c.id === consignmentId);
        if (!consignment) return false;

        mutations.forfeitConsignment.mutate({
            id: consignmentId,
            productId: consignment.productId,
            quantity: consignment.quantity
        });
        return true;
    }, [consignments, mutations]);

    const checkAndExpireConsignments = useCallback(() => {
        const now = new Date();
        const expiredActiveConsignments = consignments.filter(c =>
            c.status === 'active' && new Date(c.expiresAt) < now
        );

        if (expiredActiveConsignments.length > 0) {
            const expiredIds = expiredActiveConsignments.map(c => c.id);
            mutations.expireConsignments.mutate(expiredIds);
        }
    }, [consignments, mutations.expireConsignments]);

    // ===== SUPPLY & VALIDATION =====

    const processSupply = useCallback((
        supplyData: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId' | 'createdBy'>,
        onExpenseCreated: CreateExpenseCallback
    ) => {
        if (!barId || !session) return null;

        const totalCost = (supplyData.quantity / supplyData.lotSize) * supplyData.lotPrice;

        const dbSupplyData = {
            bar_id: barId,
            product_id: supplyData.productId,
            quantity: supplyData.quantity,
            lot_size: supplyData.lotSize,
            lot_price: supplyData.lotPrice,
            total_cost: totalCost,
            created_by: session.userId,
            supplier: supplyData.supplier
        };

        mutations.addSupply.mutate(dbSupplyData, {
            onSuccess: (newSupply: any) => {
                onExpenseCreated({
                    category: 'supply',
                    amount: totalCost,
                    description: `Approvisionnement (${supplyData.quantity} unités)`,
                    relatedSupplyId: newSupply.id,
                    createdBy: session.userId,
                    date: new Date()
                });
            }
        });

        return null;
    }, [barId, session, mutations]);

    const processSaleValidation = useCallback((
        saleItems: Array<{ product: { id: string; name: string }; quantity: number }>,
        onSuccess: () => void,
        onError: (message: string) => void
    ) => {
        for (const item of saleItems) {
            const stockInfo = getProductStockInfo(item.product.id);
            if (!stockInfo) {
                onError(`Produit ${item.product.name} introuvable`);
                return false;
            }
            if (stockInfo.availableStock < item.quantity) {
                onError(`Stock insuffisant pour ${item.product.name} (disponible: ${stockInfo.availableStock})`);
                return false;
            }
        }

        mutations.validateSale.mutate(saleItems, {
            onSuccess: () => onSuccess(),
            onError: (error: any) => onError(error.message || 'Erreur lors de la validation')
        });

        return true;
    }, [getProductStockInfo, mutations]);
    // Fin du bloc logique

    return {
        products,
        categories,
        consignments,
        supplies,
        allProductsStockInfo,
        getProductStockInfo,
        getAverageCostPerUnit,
        addProduct,
        addProducts,
        updateProduct,
        deleteProduct,
        increasePhysicalStock,
        decreasePhysicalStock,
        checkAndExpireConsignments,
        processSupply,
        processSaleValidation,
        createConsignment,
        claimConsignment,
        forfeitConsignment,
        isLoading: isLoadingProducts || isLoadingSupplies || isLoadingConsignments || isLoadingCategories,
        mutations
    };
};
