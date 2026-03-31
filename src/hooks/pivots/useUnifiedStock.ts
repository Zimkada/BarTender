/**
 * useUnifiedStock.ts - Smart Hook (Mission Elite)
 * Unifie le stock physique (Supabase), les consignations et les ventes offline (IndexedDB).
 * Indépendant de tout Context global.
 */

import { useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutationState } from '@tanstack/react-query'; // 🛡️ Fix Bug #11
import { useAuth } from '../../context/AuthContext';
import { useProducts, useSupplies, useConsignments, useCategories } from '../queries/useStockQueries';
import { useStockMutations } from '../mutations/useStockMutations';
import { offlineQueue } from '../../services/offlineQueue';
import { syncManager } from '../../services/SyncManager';
import { supabase } from '../../lib/supabase';
import { calculateAvailableStock } from '../../utils/calculations';
import { getErrorMessage } from '../../utils/errorHandler';
import { useNotifications } from '../../components/Notifications';
import { toDbProduct, toDbProductForCreation } from '../../utils/productMapper';
import { getDisplayCost, type DisplayCost } from '../../utils/costResolution';
import type { Product, ProductStockInfo, Supply, Expense, BarSettings } from '../../types';

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

export interface UnifiedStockOptions {
    skipSupplies?: boolean;
}

export const useUnifiedStock = (barId: string | undefined, options: UnifiedStockOptions = {}) => {
    const { skipSupplies = false } = options;
    const queryClient = useQueryClient();
    const { currentSession: session } = useAuth();
    const { showNotification } = useNotifications();

    // 1. Queries de base (React Query)
    const { data: products = [], isLoading: isLoadingProducts } = useProducts(barId, { enabled: !!session });

    // 🛡️ Expert Fix: Lazy load supplies history
    const { data: supplies = [], isLoading: isLoadingSupplies } = useSupplies(barId, { enabled: !skipSupplies && !!session });

    const { data: consignments = [], isLoading: isLoadingConsignments } = useConsignments(barId, { enabled: !!session });
    const { data: categories = [], isLoading: isLoadingCategories } = useCategories(barId, { enabled: !!session });

    // 2. Mutations
    const mutations = useStockMutations();

    // 🛡️ Expert Fix Bug #11: Capture In-Flight Mutations (Optimistic Stock)
    // On doit matcher l'interface CreateSaleVariables définie dans useSalesMutations
    type InFlightSaleVars = {
        items: Array<{ product_id?: string; productId?: string; quantity: number }>;
        idempotencyKey?: string;
    } | undefined;

    const inFlightMutations = useMutationState({
        filters: { mutationKey: ['create-sale', barId], status: 'pending' },
        select: (mutation) => mutation.state.variables as InFlightSaleVars
    });

    // ===== MUTATIONS WRAPPERS (Compatibilité & Audit) =====

    const addProduct = useCallback((productData: Omit<Product, 'id' | 'createdAt'>) => {
        if (!barId || !session) return Promise.reject('Missing barId or session');
        const dbProduct = toDbProductForCreation(productData, barId);
        return mutations.createProduct.mutateAsync(dbProduct);
    }, [barId, mutations, session]);

    const addProducts = useCallback((productsData: Omit<Product, 'id' | 'createdAt'>[]) => {
        if (!barId || !session) return;
        // Pour l'instant, on boucle car useStockMutations n'a pas encore de batch rpc unifié
        // Mais on l'expose au context pour la compatibilité
        productsData.forEach(p => addProduct(p));
    }, [barId, session, addProduct]);

    const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
        const dbUpdates = toDbProduct(updates, true);
        return mutations.updateProduct.mutateAsync({ id, updates: dbUpdates });
    }, [mutations]);

    const deleteProduct = useCallback((id: string) => {
        return mutations.deleteProduct.mutateAsync(id);
    }, [mutations]);

    const adjustStock = useCallback((productId: string, delta: number, reason: string) => {
        return mutations.adjustStock.mutateAsync({ productId, delta, reason });
    }, [mutations]);

    // Help for migration: map adjustStock to increase/decrease
    const increasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'restock') => {
        return adjustStock(productId, quantity, reason);
    }, [adjustStock]);

    const decreasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'manual_decrease') => {
        return adjustStock(productId, -quantity, reason);
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
                .filter((op: any) => op.type === 'CREATE_SALE')
                .map((op: any) => op.payload);
        },
        enabled: !!barId && !!session,
        staleTime: 30000,
    });

    // 🛡️ Expert Fix (Certification): Fetch server-side pending sales
    // These are sales that were synced but not yet validated.
    // They must be deducted from availableStock to prevent overselling.
    const { data: serverPendingSales = [] } = useQuery({
        queryKey: ['server-pending-sales-for-stock', barId],
        queryFn: async () => {
            if (!barId) return [];
            const { data, error } = await supabase
                .from('sales')
                .select('id, items, idempotency_key')
                .eq('bar_id', barId)
                .eq('status', 'pending');
            if (error) throw error;
            return data || [];
        },
        enabled: !!barId && !!session,
        staleTime: 30000, // 30s: compromis fraîcheur multi-device vs fréquence refetch
    });

    // 🚀 Réactivité : Écoute des événements typés Pilier 0
    useEffect(() => {
        const handleSync = (e: any) => {
            if (e.detail?.barId === barId || !e.detail?.barId) {
                refetchOfflineSales();
                // Products invalidation is now handled automatically by useSmartSync inside useProducts
                // queryClient.invalidateQueries({ queryKey: stockKeys.products(barId || '') });
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
            o: offlineSales.map((s: any) => s.idempotency_key),
            s: serverPendingSales.map((s: any) => s.id)
        });
    }, [products, consignments, offlineSales, serverPendingSales]);

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

        // Track used inventory keys to avoid double-counting (offline vs synced vs mutating)
        const accountedIdempotencyKeys = new Set<string>();

        // 1. Deduct Offline Sales
        offlineSales.forEach((sale: any) => {
            if (sale.idempotency_key) {
                // Skip si la vente a déjà été synchronisée (le stock DB reflète déjà cette vente).
                // Scénario: sync terminé mais la queue offline n'a pas encore été nettoyée.
                if (recentlySyncedKeys.has(sale.idempotency_key)) {
                    accountedIdempotencyKeys.add(sale.idempotency_key);
                    return;
                }
                accountedIdempotencyKeys.add(sale.idempotency_key);
            }

            sale.items.forEach((item: any) => {
                if (infoMap[item.product_id]) {
                    infoMap[item.product_id].availableStock -= item.quantity;
                }
            });
        });

        // 🛡️ 1.5. Deduct Recently Synced Sales (The "Flash Hole" Bridge)
        // These are sales that were just synced but might not be in serverPendingSales yet.
        recentlySyncedKeys.forEach((synced) => {
            // On ignore si l'opération est encore dans offlineSales (déjà déduit au point 1)
            // Ou si elle est déjà dans accountedIdempotencyKeys
            const key = synced.payload.idempotency_key;
            if (!key || accountedIdempotencyKeys.has(key)) return;

            accountedIdempotencyKeys.add(key);

            synced.payload.items.forEach((item: any) => {
                if (infoMap[item.product_id]) {
                    infoMap[item.product_id].availableStock -= item.quantity;
                }
            });
        });

        // 2. Deduct In-Flight Mutations (Optimistic)
        // 🛡️ Anti-Double Counting Strategy: Only deduct if NOT already in offlineSales
        inFlightMutations.forEach((mutationPayload) => {
            if (!mutationPayload?.items) return;

            // Si la clé est déjà comptée (donc présente dans offlineSales), on ignore la mutation
            if (mutationPayload.idempotencyKey && accountedIdempotencyKeys.has(mutationPayload.idempotencyKey)) {
                return;
            }

            // Sinon, c'est une vraie "in-flight" mutation (entre le clic et l'écriture IDB/réseau)
            mutationPayload.items.forEach((item) => {
                const pid = item.product_id || item.productId;
                if (pid && infoMap[pid]) {
                    infoMap[pid].availableStock -= item.quantity;
                }
            });
        });

        // 3. Deduct Server Pending Sales (The missing gap)
        serverPendingSales.forEach((sale: any) => {
            // Avoid double counting if it's still in the offline queue (unlikely but possible during sync)
            if (sale.idempotency_key && accountedIdempotencyKeys.has(sale.idempotency_key)) return;

            const items = sale.items as any[];
            items.forEach((item: any) => {
                if (infoMap[item.product_id]) {
                    infoMap[item.product_id].availableStock -= item.quantity;
                }
            });
        });

        // Final calculation
        Object.values(infoMap).forEach(info => {
            info.availableStock = calculateAvailableStock(info.availableStock, info.consignedStock);
        });

        return infoMap;
    }, [stockHash, inFlightMutations]); // ⚡ dependency on mutations triggers re-calc

    // 4. Helpers (Memoized)
    const getProductStockInfo = useCallback((productId: string) => {
        return allProductsStockInfo[productId] || null;
    }, [allProductsStockInfo]);

    // 🛡️ Maps O(1) pré-indexées pour getAverageCostPerUnit
    const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
    const suppliesByProductMap = useMemo(() => {
        const map = new Map<string, typeof supplies>();
        for (const s of supplies) {
            const existing = map.get(s.productId);
            if (existing) { existing.push(s); } else { map.set(s.productId, [s]); }
        }
        return map;
    }, [supplies]);

    const getAverageCostPerUnit = useCallback((productId: string): number => {
        const product = productMap.get(productId);
        const productSupplies = suppliesByProductMap.get(productId);
        if (!productSupplies || productSupplies.length === 0) return product?.currentAverageCost || 0;

        const totalCost = productSupplies.reduce((sum, s) => sum + s.totalCost, 0);
        const totalQuantity = productSupplies.reduce((sum, s) => sum + s.quantity, 0);
        return totalQuantity > 0 ? totalCost / totalQuantity : (product?.currentAverageCost || 0);
    }, [productMap, suppliesByProductMap]);

    /**
     * getDisplayCostForProduct — exposeur pratique de costResolution.ts
     * Résout le coût à afficher en UI selon le setting du bar.
     * NE remplace PAS getAverageCostPerUnit (qui reste pour les calculs métier).
     */
    const getDisplayCostForProduct = useCallback((productId: string, barSettings?: BarSettings | null): DisplayCost => {
        const product = productMap.get(productId);
        if (!product) return { cost: 0, source: 'none' };
        return getDisplayCost(product, barSettings);
    }, [productMap]);

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

        return mutations.createConsignment.mutateAsync(consignmentData);
    }, [barId, session, mutations]);

    const claimConsignment = useCallback((consignmentId: string) => {
        const consignment = consignments.find(c => c.id === consignmentId);
        if (!consignment || !session) return false;

        return mutations.claimConsignment.mutateAsync({
            id: consignmentId,
            productId: consignment.productId,
            quantity: consignment.quantity,
            claimedBy: session.userId
        });
    }, [consignments, session, mutations]);

    const forfeitConsignment = useCallback((consignmentId: string) => {
        const consignment = consignments.find(c => c.id === consignmentId);
        if (!consignment) return false;

        return mutations.forfeitConsignment.mutateAsync({
            id: consignmentId,
            productId: consignment.productId,
            quantity: consignment.quantity
        });
    }, [consignments, mutations]);

    const checkAndExpireConsignments = useCallback(() => {
        const now = new Date();
        const expiredActiveConsignments = consignments.filter(c =>
            c.status === 'active' && new Date(c.expiresAt) < now
        );

        if (expiredActiveConsignments.length > 0) {
            const expiredIds = expiredActiveConsignments.map(c => c.id);
            return mutations.expireConsignments.mutateAsync(expiredIds);
        }
    }, [consignments, mutations.expireConsignments]);

    // ===== SUPPLY & VALIDATION =====

    const processSupply = useCallback((
        supplyData: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId' | 'createdBy'>,
        onExpenseCreated: CreateExpenseCallback
    ) => {
        if (!barId || !session) return null;

        const totalCost = supplyData.lotSize > 0
            ? (supplyData.quantity / supplyData.lotSize) * supplyData.lotPrice
            : 0;

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

        return mutations.addSupply.mutateAsync(dbSupplyData).then((newSupply: any) => {
            onExpenseCreated({
                category: 'supply',
                amount: totalCost,
                description: `Approvisionnement (${supplyData.quantity} unités)`,
                relatedSupplyId: newSupply.id,
                createdBy: session.userId,
                date: new Date()
            });
            return newSupply;
        });
    }, [barId, session, mutations]);

    const processSaleValidation = useCallback(async (
        saleItems: Array<{ product: { id: string; name: string }; quantity: number }>,
        options: { saleId?: string; onSuccess: () => void; onError: (msg: string) => void }
    ) => {
        for (const item of saleItems) {
            const stockInfo = getProductStockInfo(item.product.id);
            if (!stockInfo) {
                options.onError(`Produit ${item.product.name} introuvable`);
                return false;
            }
            if (stockInfo.availableStock < item.quantity) {
                options.onError(`Stock insuffisant pour ${item.product.name} (disponible: ${stockInfo.availableStock})`);
                return false;
            }
        }

        // 🛡️ Expert Fix: Validate the sale using saleId (required by mutation)
        if (!options.saleId) {
            throw new Error('ID de la vente manquant pour la validation');
        }

        return mutations.validateSale.mutateAsync({
            id: options.saleId,
            validatedBy: session?.userId || ''
        }).then(() => {
            showNotification('success', 'Stock validé et vente confirmée');
            options.onSuccess(); // Keep original onSuccess for external logic
        })
            .catch((error) => {
                options.onError(getErrorMessage(error) || 'Erreur lors de la validation');
                throw error;
            });
    }, [getProductStockInfo, mutations, session, showNotification]);
    // Fin du bloc logique

    return {
        products,
        categories,
        consignments,
        supplies,
        allProductsStockInfo,
        getProductStockInfo,
        getAverageCostPerUnit,
        getDisplayCostForProduct,
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
