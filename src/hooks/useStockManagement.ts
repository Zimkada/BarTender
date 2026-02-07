// hooks/useStockManagement.ts - Hook unifié (Refactored for React Query)
import { useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { calculateAvailableStock } from '../utils/calculations';
import { auditLogger } from '../services/AuditLogger';
import { toDbProduct, toDbProductForCreation } from '../utils/productMapper';
import { offlineQueue } from '../services/offlineQueue';
import { syncManager } from '../services/SyncManager';
import type { Product, ProductStockInfo, Supply, Expense } from '../types';

// React Query Hooks
import { useProducts, useSupplies, useConsignments } from './queries/useStockQueries';
import { useStockMutations } from './mutations/useStockMutations';

// Callback type for expense creation
export type CreateExpenseCallback = (expense: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;

interface CreateConsignmentData {
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

export const useStockManagement = () => {
  const { currentBar } = useBarContext();
  const { currentSession: session } = useAuth();
  const barId = currentBar?.id || '';

  // 1. Queries (Lecture)
  const { data: products = [], isLoading: isLoadingProducts } = useProducts(barId);
  const { data: supplies = [], isLoading: isLoadingSupplies } = useSupplies(barId);
  const { data: consignments = [], isLoading: isLoadingConsignments } = useConsignments(barId);

  // 2. Mutations (Écriture)
  const mutations = useStockMutations();

  // ===== LOGIQUE DE BASE (PRODUITS) =====

  const addProduct = useCallback((productData: Omit<Product, 'id' | 'createdAt'>) => {
    if (!currentBar || !session) return;

    const newProductData = toDbProductForCreation(productData, currentBar.id);

    mutations.createProduct.mutate(newProductData, {
      onSuccess: (data) => {
        auditLogger.log({
          event: 'PRODUCT_CREATED',
          severity: 'info',
          userId: session.userId,
          userName: session.userName,
          userRole: session.role,
          barId: currentBar.id,
          barName: currentBar.name,
          description: `Création produit: ${data.local_name}`,
          relatedEntityId: data.id,
          relatedEntityType: 'product',
        });
      }
    });
  }, [currentBar, session, mutations]);

  const addProducts = useCallback((productsData: Omit<Product, 'id' | 'createdAt'>[]) => {
    // Pour l'instant, on boucle. Idéalement: bulk insert.
    productsData.forEach(p => addProduct(p));
    return []; // Legacy return
  }, [addProduct]);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    // ✅ Use centralized mapper to convert camelCase → snake_case
    // ⚠️ Stock field is automatically excluded (security: prevents direct manipulation)
    const dbUpdates = toDbProduct(updates, true);

    mutations.updateProduct.mutate({ id, updates: dbUpdates });
  }, [mutations]);

  const deleteProduct = useCallback((id: string) => {
    mutations.deleteProduct.mutate(id);
  }, [mutations]);

  // ===== LOGIQUE DE STOCK PHYSIQUE =====

  const increasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'manual_restock') => {
    if (!currentBar) {
      console.error('Cannot increase stock: no bar selected');
      return false;
    }

    mutations.adjustStock.mutate(
      { productId, delta: quantity, reason },
      {
        onError: (error) => {
          console.error(`Failed to increase stock for product ${productId}:`, error);
        }
      }
    );
    return true;
  }, [currentBar, mutations]);

  const decreasePhysicalStock = useCallback((productId: string, quantity: number, reason: string = 'manual_decrease') => {
    if (!currentBar) {
      console.error('Cannot decrease stock: no bar selected');
      return false;
    }

    mutations.adjustStock.mutate(
      { productId, delta: -quantity, reason },
      {
        onError: (error) => {
          console.error(`Failed to decrease stock for product ${productId}:`, error);
        }
      }
    );
    return true;
  }, [currentBar, mutations]);

  // ===== LOGIQUE DE CONSIGNATION =====

  const createConsignment = useCallback((data: CreateConsignmentData) => {
    if (!currentBar || !session) return Promise.reject('No bar or session');

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
      expiresAt: data.expiresAt,
      expirationDays: data.expirationDays || 7,
      originalSeller: data.originalSeller,
      serverId: data.serverId, // ✨ NUEVO: UUID del servidor asignado (BUG #10)
      businessDate: data.businessDate,
    };

    // ✅ BUG #1 FIX: Retourner une promesse qui se résout quand la mutation est terminée
    return new Promise((resolve, reject) => {
      mutations.createConsignment.mutate(consignmentData, {
        onSuccess: (data) => resolve(data),
        onError: (err) => reject(err)
      });
    });
  }, [currentBar, session, mutations]);

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

  // ===== SUPPLY MANAGEMENT =====

  const processSupply = useCallback((
    supplyData: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId' | 'createdBy'>,
    onExpenseCreated: CreateExpenseCallback
  ) => {
    if (!currentBar || !session) return null;

    const totalCost = (supplyData.quantity / supplyData.lotSize) * supplyData.lotPrice;

    const dbSupplyData = {
      bar_id: currentBar.id,
      product_id: supplyData.productId,
      quantity: supplyData.quantity,
      lot_size: supplyData.lotSize,
      lot_price: supplyData.lotPrice,
      total_cost: totalCost,
      created_by: session.userId,
      supplier: supplyData.supplier
    };

    mutations.addSupply.mutate(dbSupplyData, {
      onSuccess: (newSupply) => {
        // Callback expense
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

    return null; // Legacy return
  }, [currentBar, session, mutations]);

  // ===== SALE VALIDATION =====

  const processSaleValidation = useCallback((
    saleItems: Array<{ product: { id: string; name: string }; quantity: number }>,
    onSuccess: () => void,
    onError: (message: string) => void
  ) => {
    // 1. Vérification du stock (Client-side check before mutation)
    for (const item of saleItems) {
      const stockInfo = getProductStockInfo(item.product.id); // Utiliser getProductStockInfo pour vérifier le stock disponible

      if (!stockInfo) {
        onError(`Produit ${item.product.name} introuvable`);
        return false;
      }
      if (stockInfo.availableStock < item.quantity) { // Vérifier par rapport au stock disponible
        onError(`Stock insuffisant pour ${item.product.name} (disponible: ${stockInfo.availableStock})`);
        return false;
      }
    }

    // 2. Mutation
    mutations.validateSale.mutate(saleItems, {
      onSuccess: () => {
        onSuccess();
      },
      onError: (error) => {
        onError(error.message || 'Erreur lors de la validation');
      }
    });

    return true;
  }, [products, mutations]);

  // ===== HELPERS / DERIVED STATE =====

  /**
   * ✅ NEW: Memoized Map of ALL products stock information.
   * This is the single source of truth for stock alerts and display.
   * High performance O(N + M) calculation.
   */
  // 🛡️ Lock Stock (Sprint 2): Récupérer les ventes offline pour déduction immédiate
  const { data: offlineSales = [], refetch: refetchOfflineSales } = useQuery({
    queryKey: ['offline-sales-for-stock', currentBar?.id],
    networkMode: 'always', // 🛡️ CRITIQUE: Fonctionne même offline (IndexedDB)
    queryFn: async () => {
      if (!currentBar?.id) return [];
      const ops = await offlineQueue.getOperations({
        status: 'pending',
        barId: currentBar.id
      });
      return ops
        .filter(op => op.type === 'CREATE_SALE')
        .map(op => op.payload);
    },
    enabled: !!currentBar?.id,
    refetchInterval: false // 🚀 Désactivé : Utiliser listener queue-updated pour réactivité instantanée
  });

  // 🚀 Réactivité Instantanée: Écouter les mises à jour de la queue
  useEffect(() => {
    const handleQueueUpdate = () => {
      console.log('[useStockManagement] Queue updated, refetching offline sales...');
      refetchOfflineSales();
    };

    const handleSyncCompleted = () => {
      console.log('[useStockManagement] Sync completed, refetching offline sales...');
      refetchOfflineSales();
    };

    window.addEventListener('queue-updated', handleQueueUpdate);
    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('queue-updated', handleQueueUpdate);
      window.removeEventListener('sync-completed', handleSyncCompleted);
    };
  }, [refetchOfflineSales]);

  const allProductsStockInfo = useMemo(() => {
    const infoMap: Record<string, ProductStockInfo> = {};
    const recentlySyncedKeys = syncManager.getRecentlySyncedKeys();

    // 1. Initialiser avec le stock physique (Serveur)
    products.forEach(p => {
      infoMap[p.id] = {
        productId: p.id,
        physicalStock: p.stock,
        consignedStock: 0,
        availableStock: p.stock
      };
    });

    // 2. Déduire les consignations actives
    consignments.forEach(c => {
      if (c.status === 'active' && infoMap[c.productId]) {
        infoMap[c.productId].consignedStock += c.quantity;
      }
    });

    // 3. 🛡️ DÉDUIRE les ventes offline (Sprint 2)
    offlineSales.forEach(sale => {
      // Déduplication : Ne déduire que si n'est pas déjà dans le tampon de synchro récente
      if (sale.idempotency_key && recentlySyncedKeys.has(sale.idempotency_key)) {
        return;
      }

      sale.items.forEach((item) => {
        const pId = item.product_id;
        if (infoMap[pId]) {
          infoMap[pId].availableStock -= item.quantity;
        }
      });
    });

    // 4. Recalculer le stock disponible final (Physical - Consigned - Offline)
    Object.values(infoMap).forEach(info => {
      info.availableStock = calculateAvailableStock(
        info.availableStock, // Contient déjà Physical - Offline
        info.consignedStock
      );
    });

    return infoMap;
  }, [products, consignments, offlineSales]);

  const getConsignedStockByProduct = useCallback((productId: string): number => {
    return allProductsStockInfo[productId]?.consignedStock ?? 0;
  }, [allProductsStockInfo]);

  const getProductStockInfo = useCallback((productId: string): ProductStockInfo | null => {
    return allProductsStockInfo[productId] || null;
  }, [allProductsStockInfo]);

  const getAverageCostPerUnit = useCallback((productId: string): number => {
    const productSupplies = supplies.filter(s => s.productId === productId);
    if (productSupplies.length === 0) return 0;
    const totalCost = productSupplies.reduce((sum, s) => sum + s.totalCost, 0);
    const totalQuantity = productSupplies.reduce((sum, s) => sum + s.quantity, 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [supplies]);

  const getActiveConsignments = useCallback(() => {
    return consignments.filter(c => c.status === 'active');
  }, [consignments]);

  return {
    products,
    consignments,
    supplies,
    addProduct,
    addProducts,
    updateProduct,
    deleteProduct,
    increasePhysicalStock,
    decreasePhysicalStock,
    processSupply,
    processSaleValidation,
    createConsignment,
    claimConsignment,
    forfeitConsignment,
    checkAndExpireConsignments,
    getProductStockInfo,
    getConsignedStockByProduct,
    getAverageCostPerUnit,
    getActiveConsignments,
    allProductsStockInfo, // ✨ New: Exposed for global usage
    isLoadingProducts,
    isLoadingSupplies,
    isLoadingConsignments,
  };
};
