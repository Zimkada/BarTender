// hooks/useStockManagement.ts - Hook unifié (Refactored for React Query)
import { useCallback } from 'react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { calculateAvailableStock } from '../utils/calculations';
import { auditLogger } from '../services/AuditLogger';
import type { Product, ProductStockInfo, Supply, Expense } from '../types';

// React Query Hooks
import { useProducts, useSupplies, useConsignments } from './queries/useStockQueries';
import { useStockMutations } from './mutations/useStockMutations';

// Callback type for expense creation
export type CreateExpenseCallback = (expense: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;

export const useStockManagement = () => {
  const { currentBar } = useBarContext();
  const { currentSession: session } = useAuth();
  const barId = currentBar?.id || '';

  // 1. Queries (Lecture)
  const { data: products = [] } = useProducts(barId);
  const { data: supplies = [] } = useSupplies(barId);
  const { data: consignments = [] } = useConsignments(barId);

  // 2. Mutations (Écriture)
  const mutations = useStockMutations(barId);

  // ===== LOGIQUE DE BASE (PRODUITS) =====

  const addProduct = useCallback((productData: Omit<Product, 'id' | 'createdAt'>) => {
    if (!currentBar || !session) return;

    const newProductData = {
      bar_id: currentBar.id,
      local_name: productData.name,
      price: productData.price,
      stock: productData.stock,
      alert_threshold: productData.alertThreshold, // Mapping camelCase -> snake_case
      local_category_id: productData.categoryId,
      is_custom_product: productData.isCustomProduct ?? true,
      global_product_id: productData.globalProductId,
      local_image: productData.image,
      volume: productData.volume,
    };

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
    // Mapping des champs si nécessaire
    const dbUpdates: any = { ...updates };
    if (updates.alertThreshold !== undefined) dbUpdates.alert_threshold = updates.alertThreshold;
    if (updates.categoryId !== undefined) dbUpdates.local_category_id = updates.categoryId;
    if (updates.name !== undefined) dbUpdates.local_name = updates.name;

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
        onError: (error: any) => {
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
        onError: (error: any) => {
          console.error(`Failed to decrease stock for product ${productId}:`, error);
        }
      }
    );
    return true;
  }, [currentBar, mutations]);

  // ===== LOGIQUE DE CONSIGNATION =====

  const createConsignment = useCallback((data: any) => {
    if (!currentBar || !session) return null;

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
    };

    mutations.createConsignment.mutate(consignmentData);
    return null; // Legacy return
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
    // Géré côté serveur idéalement, ou via une tâche de fond
    // Ici on peut juste vérifier et déclencher des mutations si besoin
    // Pour l'instant, on laisse vide car React Query rafraîchit les données
  }, []);

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
      const product = products.find(p => p.id === item.product.id);
      // Note: On devrait utiliser getProductStockInfo ici pour être précis avec les consignations
      // Mais pour simplifier, on regarde le stock physique brut du produit chargé
      if (!product) {
        onError(`Produit ${item.product.name} introuvable`);
        return false;
      }
      if (product.stock < item.quantity) {
        onError(`Stock insuffisant pour ${item.product.name}`);
        return false;
      }
    }

    // 2. Mutation
    mutations.validateSale.mutate(saleItems, {
      onSuccess: () => {
        onSuccess();
      },
      onError: (error: any) => {
        onError(error.message || 'Erreur lors de la validation');
      }
    });

    return true;
  }, [products, mutations]);

  // ===== HELPERS / DERIVED STATE =====

  const getConsignedStockByProduct = useCallback((productId: string): number => {
    return consignments
      .filter(c => c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);
  }, [consignments]);

  const getProductStockInfo = useCallback((productId: string): ProductStockInfo | null => {
    const product = products.find(p => p.id === productId);
    if (!product) return null;

    const physicalStock = product.stock;
    const consignedStock = getConsignedStockByProduct(productId);
    const availableStock = calculateAvailableStock(physicalStock, consignedStock);

    return {
      productId,
      physicalStock,
      consignedStock,
      availableStock,
    };
  }, [products, getConsignedStockByProduct]);

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
  };
};
