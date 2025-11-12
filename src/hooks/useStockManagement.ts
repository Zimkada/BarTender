// hooks/useStockManagement.ts - Hook unifié pour la gestion des stocks
import { useCallback, useMemo } from 'react';
import { useDataStore } from './useDataStore';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { calculateAvailableStock } from '../utils/calculations';
import { syncQueue } from '../services/SyncQueue';
import type { Product, Consignment, ConsignmentStatus, ProductStockInfo, Supply, Expense } from '../types';

// ----- CONSTANTES -----
// ✅ IMPORTANT: Utiliser les mêmes clés que AppContext pour éviter duplication
const PRODUCTS_STORAGE_KEY = 'products-v3'; // ✅ Unifié avec AppContext (was 'bar-products')
const CONSIGNMENTS_STORAGE_KEY = 'consignments-v1';
const SUPPLIES_STORAGE_KEY = 'supplies-v3'; // ✅ Unifié avec AppContext (was 'all-supplies-v1')
const DEFAULT_EXPIRATION_DAYS = 7;

// ----- INTERFACES -----
// Callback type for expense creation (separation of concerns)
export type CreateExpenseCallback = (expense: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;

// ----- HOOK PRINCIPAL -----
export const useStockManagement = () => {
  const [products, setProducts] = useDataStore<Product[]>(PRODUCTS_STORAGE_KEY, []);
  const [consignments, setConsignments] = useDataStore<Consignment[]>(CONSIGNMENTS_STORAGE_KEY, []);
  const [supplies, setSupplies] = useDataStore<Supply[]>(SUPPLIES_STORAGE_KEY, []);

  const { currentBar } = useBarContext();
  const { currentSession: session } = useAuth();

  // ===== LOGIQUE DE BASE (PRODUITS) =====
  const addProduct = (product: Omit<Product, 'id' | 'createdAt'>) => {
    const newProduct: Product = {
      ...product,
      id: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    // 1. Optimistic update
    setProducts(prev => [...prev, newProduct]);

    // 2. Enqueue pour sync
    if (currentBar && session) {
      syncQueue.enqueue('CREATE_PRODUCT', newProduct, currentBar.id, session.userId);
    }

    return newProduct;
  };

  /**
   * Ajoute plusieurs produits en UNE SEULE opération atomique
   * ✅ CRITIQUE: Évite race condition avec forEach + addProduct rapide
   * ✅ Compatible Supabase (un seul INSERT batch au lieu de N requêtes)
   *
   * @param productsData - Array de produits à ajouter
   * @returns Array des produits créés avec id et createdAt
   */
  const addProducts = useCallback((productsData: Omit<Product, 'id' | 'createdAt'>[]): Product[] => {
    const newProducts = productsData.map((data, index) => ({
      ...data,
      // ID unique avec timestamp + random + index pour garantir unicité
      id: `product_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date(),
    }));

    // ✅ UNE SEULE opération setState (pas de race condition)
    setProducts(prev => [...prev, ...newProducts]);

    console.log(`✅ Batch import: ${newProducts.length} produits ajoutés en une seule opération`);
    return newProducts;
  }, [setProducts]);

  const updateProduct = (id: string, updates: Partial<Product>) => {
    // 1. Optimistic update
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));

    // 2. Enqueue pour sync
    if (currentBar && session) {
      syncQueue.enqueue('UPDATE_PRODUCT', { productId: id, updates }, currentBar.id, session.userId);
    }
  };

  const deleteProduct = (id: string) => {
    // 1. Optimistic update
    setProducts(prev => prev.filter(p => p.id !== id));

    // 2. Enqueue pour sync
    if (currentBar && session) {
      syncQueue.enqueue('DELETE_PRODUCT', { productId: id }, currentBar.id, session.userId);
    }
  };

  // ===== LOGIQUE DE STOCK PHYSIQUE =====
  const increasePhysicalStock = useCallback((productId: string, quantity: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.id === productId ? { ...p, stock: p.stock + quantity } : p
      )
    );
  }, [setProducts]);

  const decreasePhysicalStock = useCallback((productId: string, quantity: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.id === productId ? { ...p, stock: Math.max(0, p.stock - quantity) } : p
      )
    );
  }, [setProducts]);

  // ===== LOGIQUE DE CONSIGNATION (ATOMIQUE) =====

  const getExpirationDate = useCallback((createdAt: Date, overrideDays?: number): Date => {
    const expirationDays = overrideDays ?? currentBar?.settings?.consignmentExpirationDays ?? DEFAULT_EXPIRATION_DAYS;
    const expiresAt = new Date(createdAt);
    expiresAt.setDate(expiresAt.getDate() + expirationDays);
    return expiresAt;
  }, [currentBar]);

  const createConsignment = useCallback((data: Omit<Consignment, 'id' | 'barId' | 'createdAt' | 'createdBy' | 'status'> & { expirationDays?: number }): Consignment | null => {
    if (!currentBar || !session) return null;
    if (session.role !== 'promoteur' && session.role !== 'gerant') return null;

    const now = new Date();
    const { expirationDays, ...consignmentData } = data;

    const newConsignment: Consignment = {
      ...consignmentData,
      id: `consignment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      barId: currentBar.id,
      createdAt: now,
      expiresAt: getExpirationDate(now, expirationDays),
      createdBy: session.userId,
      status: 'active',
    };

    // 1. Optimistic update
    setConsignments(prev => [...prev, newConsignment]);

    // 2. Enqueue pour sync
    syncQueue.enqueue('CREATE_CONSIGNMENT', newConsignment, currentBar.id, session.userId);

    return newConsignment;
  }, [currentBar, session, setConsignments, getExpirationDate]);

  const claimConsignment = useCallback((consignmentId: string): boolean => {
    const consignment = consignments.find(c => c.id === consignmentId);
    if (!consignment || consignment.status !== 'active') return false;

    // 1. Optimistic update
    setConsignments(prev =>
      prev.map(c =>
        c.id === consignmentId
          ? { ...c, status: 'claimed' as ConsignmentStatus, claimedAt: new Date(), claimedBy: session?.userId }
          : c
      )
    );

    // 2. Opération atomique : déduire le stock physique (produit part avec le client)
    decreasePhysicalStock(consignment.productId, consignment.quantity);

    // 3. Enqueue pour sync
    if (currentBar && session) {
      syncQueue.enqueue(
        'CLAIM_CONSIGNMENT',
        { consignmentId, claimedBy: session.userId, claimedAt: new Date() },
        currentBar.id,
        session.userId
      );
    }

    return true;
  }, [consignments, session, currentBar, setConsignments, decreasePhysicalStock]);

  const forfeitConsignment = useCallback((consignmentId: string): boolean => {
    const consignment = consignments.find(c => c.id === consignmentId);
    if (!consignment || consignment.status !== 'active') return false;

    // 1. Optimistic update
    setConsignments(prev =>
      prev.map(c =>
        c.id === consignmentId ? { ...c, status: 'forfeited' as ConsignmentStatus } : c
      )
    );

    // 2. Opération atomique : réintégrer le stock physique
    increasePhysicalStock(consignment.productId, consignment.quantity);

    // 3. Enqueue pour sync
    if (currentBar && session) {
      syncQueue.enqueue('FORFEIT_CONSIGNMENT', { consignmentId }, currentBar.id, session.userId);
    }

    return true;
  }, [consignments, currentBar, session, setConsignments, increasePhysicalStock]);

  const checkAndExpireConsignments = useCallback(() => {
    const now = new Date();

    const consignmentsToExpire = consignments.filter(c =>
      c.barId === currentBar?.id &&
      c.status === 'active' &&
      new Date(c.expiresAt) <= now
    );

    if (consignmentsToExpire.length === 0) return;

    // 1️⃣ Mettre à jour les statuts
    setConsignments(prev =>
      prev.map(c => {
        const needsToExpire = consignmentsToExpire.some(exp => exp.id === c.id);
        return needsToExpire ? { ...c, status: 'expired' as ConsignmentStatus } : c;
      })
    );

    // 2️⃣ Réintégrer le stock (APRÈS, en batch pour éviter multiples setState)
    consignmentsToExpire.forEach(c => {
      increasePhysicalStock(c.productId, c.quantity);
    });

    console.log(`✅ ${consignmentsToExpire.length} consignation(s) expirée(s) et stock réintégré.`);
  }, [currentBar, consignments, setConsignments, increasePhysicalStock]);


  // ===== SUPPLY MANAGEMENT (APPROVISIONNEMENTS) =====

  /**
   * Traite un approvisionnement de manière atomique
   * @param supplyData - Données de l'approvisionnement
   * @param onExpenseCreated - Callback pour créer la dépense associée (AppContext)
   * @returns Supply créé ou null si erreur
   */
  const processSupply = useCallback((
    supplyData: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId' | 'createdBy'>,
    onExpenseCreated: CreateExpenseCallback
  ): Supply | null => {
    // Vérifications permissions et contexte
    if (!currentBar || !session) {
      console.error('❌ processSupply: currentBar ou session manquant');
      return null;
    }

    if (session.role !== 'promoteur' && session.role !== 'gerant') {
      console.error('❌ processSupply: Permission refusée (role:', session.role, ')');
      return null;
    }

    // 1️⃣ Calculer coût total
    const totalCost = (supplyData.quantity / supplyData.lotSize) * supplyData.lotPrice;

    // 2️⃣ Créer supply
    const uniqueId = `supply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newSupply: Supply = {
      ...supplyData,
      id: uniqueId,
      barId: currentBar.id,
      date: new Date(),
      totalCost,
      createdBy: session.userId
    };

    // 3️⃣ Opération atomique : supply + stock physique
    setSupplies(prev => [newSupply, ...prev]);
    increasePhysicalStock(supplyData.productId, supplyData.quantity);

    // 4️⃣ Enqueue pour sync
    syncQueue.enqueue('ADD_SUPPLY', newSupply, currentBar.id, session.userId);

    // 5️⃣ Callback pour créer expense (AppContext garde la logique expenses)
    const product = products.find(p => p.id === supplyData.productId);
    onExpenseCreated({
      category: 'supply',
      amount: totalCost,
      date: new Date(),
      description: `Approvisionnement: ${product?.name || 'Produit'} (${supplyData.quantity} unités)`,
      createdBy: session.userId,
      relatedSupplyId: newSupply.id,
    });

    console.log(`✅ Supply créé: ${supplyData.quantity} unités, stock physique augmenté`);
    return newSupply;
  }, [currentBar, session, products, setSupplies, increasePhysicalStock]);


  // ===== QUERIES ET DONNÉES DÉRIVÉES =====

  // ✅ Filtrer les produits par bar actuel (isolation multi-tenant)
  const barProducts = useMemo(() => {
    if (!currentBar) return [];
    return products.filter(p => p.barId === currentBar.id);
  }, [products, currentBar]);

  // ✅ Filtrer les supplies par bar actuel
  const barSupplies = useMemo(() => {
    if (!currentBar) return [];
    return supplies.filter(s => s.barId === currentBar.id);
  }, [supplies, currentBar]);

  // ✅ Filtrer les consignations par bar actuel
  const barConsignments = useMemo(() => {
    if (!currentBar) return [];
    return consignments.filter(c => c.barId === currentBar.id);
  }, [consignments, currentBar]);

  const getConsignedStockByProduct = useCallback((productId: string): number => {
    return barConsignments
      .filter(c => c.productId === productId && c.status === 'active')
      .reduce((sum, c) => sum + c.quantity, 0);
  }, [barConsignments]);

  const getProductStockInfo = useCallback((productId: string): ProductStockInfo | null => {
    // ✅ Utiliser barProducts (filtré) au lieu de products (global)
    const product = barProducts.find(p => p.id === productId);
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
  }, [barProducts, getConsignedStockByProduct]);


  // ===== SALE VALIDATION =====

  /**
   * Traite la validation d'une vente en vérifiant et décrementant le stock
   * @param saleItems - Items de la vente à valider
   * @param onSuccess - Callback si validation réussie
   * @param onError - Callback si erreur (stock insuffisant)
   * @returns true si succès, false si erreur
   */
  const processSaleValidation = useCallback((
    saleItems: Array<{ product: { id: string; name: string }; quantity: number }>,
    onSuccess: () => void,
    onError: (message: string) => void
  ): boolean => {
    // Vérifier stock disponible AVANT validation (protection stock consigné)
    for (const item of saleItems) {
      const stockInfo = getProductStockInfo(item.product.id);

      if (!stockInfo) {
        onError(`Produit ${item.product.name} introuvable`);
        return false;
      }

      if (stockInfo.availableStock < item.quantity) {
        onError(`Stock insuffisant pour ${item.product.name} (disponible: ${stockInfo.availableStock}, demandé: ${item.quantity})`);
        return false;
      }
    }

    // Opération atomique: décrémenter tous les stocks
    saleItems.forEach(item => {
      decreasePhysicalStock(item.product.id, item.quantity);
    });

    console.log(`✅ Vente validée: ${saleItems.length} produit(s), stock mis à jour`);
    onSuccess();
    return true;
  }, [getProductStockInfo, decreasePhysicalStock]);


  // ===== SUPPLY QUERIES =====

  /**
   * Calcule le coût moyen par unité pour un produit
   * Basé sur les approvisionnements effectués
   */
  const getAverageCostPerUnit = useCallback((productId: string): number => {
    // ✅ Utiliser barSupplies (filtré) au lieu de supplies (global)
    const productSupplies = barSupplies.filter(s => s.productId === productId);

    if (productSupplies.length === 0) return 0;

    const totalCost = productSupplies.reduce((sum, s) => sum + s.totalCost, 0);
    const totalQuantity = productSupplies.reduce((sum, s) => sum + s.quantity, 0);

    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [barSupplies]);

  /**
   * Récupère toutes les consignations actives du bar
   */
  const getActiveConsignments = useCallback((): Consignment[] => {
    return barConsignments.filter(c => c.status === 'active');
  }, [barConsignments]);

  // ===== EXPORTATIONS DU HOOK =====
  return {
    // State (✅ Filtrés par bar actuel)
    products: barProducts,
    consignments: barConsignments,
    supplies: barSupplies,

    // Product Actions
    addProduct,
    addProducts,
    updateProduct,
    deleteProduct,

    // Physical Stock Actions
    increasePhysicalStock,
    decreasePhysicalStock,

    // Supply Actions
    processSupply,

    // Sale Actions
    processSaleValidation,

    // Consignment Actions
    createConsignment,
    claimConsignment,
    forfeitConsignment,
    checkAndExpireConsignments,

    // Queries
    getProductStockInfo,
    getConsignedStockByProduct,
    getAverageCostPerUnit,
    getActiveConsignments,
  };
};
