import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useBarContext } from '../context/BarContext';
import { useCacheWarming } from '../hooks/useViewMonitoring';
import { useAuth } from '../context/AuthContext';
import { useStock } from '../context/StockContext';
import { useNotifications } from '../components/Notifications';
import {
  Category,
  Product,
  Supply,
  Sale,
  AppSettings,
  Return,
  User,
  Expense,
  ExpenseCategoryCustom,
  CartItem,
} from '../types';
import { filterByBusinessDateRange, getCurrentBusinessDateString, dateToYYYYMMDD } from '../utils/businessDateHelpers';
import { BUSINESS_DAY_CLOSE_HOUR } from '../constants/businessDay';

// React Query Hooks
import { useCategories } from '../hooks/queries/useStockQueries';
import { useSales } from '../hooks/queries/useSalesQueries';
import { useExpenses, useCustomExpenseCategories } from '../hooks/queries/useExpensesQueries';
import { useReturns } from '../hooks/queries/useReturnsQueries';

import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useExpensesMutations } from '../hooks/mutations/useExpensesMutations';
import { useReturnsMutations } from '../hooks/mutations/useReturnsMutations';
import { useCategoryMutations } from '../hooks/mutations/useCategoryMutations';

const defaultSettings: AppSettings = {
  currency: 'FCFA',
  currencySymbol: ' FCFA',
  currentSession: null,
};

interface AppContextType {
  // État
  categories: Category[];
  products: Product[];
  supplies: Supply[];
  sales: Sale[];
  settings: AppSettings;
  users: User[];

  // PANIER (NEW)
  cart: CartItem[];
  addToCart: (product: Product) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => void;
  linkCategory: (globalCategoryId: string) => void;
  addCategories: (categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Produits (lecture seule - mutations via StockContext)
  getProductsByCategory: (categoryId: string) => Product[];
  getLowStockProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;

  // Approvisionnements
  getSuppliesByProduct: (productId: string) => Supply[];
  getTotalCostByProduct: (productId: string) => number;
  getAverageCostPerUnit: (productId: string) => number;

  // Ventes
  addSale: (saleData: Partial<Sale>) => Promise<Sale | null>;
  validateSale: (saleId: string, validatorId: string) => void;
  rejectSale: (saleId: string, rejectorId: string) => void;
  getSalesByDate: (startDate: Date, endDate: Date) => Sale[];
  getTodaySales: () => Sale[];
  getTodayTotal: () => number;
  getSalesByUser: (userId: string) => Sale[];
  getServerRevenue: (userId: string, startDate?: Date, endDate?: Date) => number;
  getServerReturns: (userId: string) => Return[];

  // Retours
  returns: Return[];
  addReturn: (returnData: Omit<Return, 'id' | 'barId'>) => void;
  updateReturn: (returnId: string, updates: Partial<Return>) => void;
  deleteReturn: (returnId: string) => void;
  getReturnsBySale: (saleId: string) => Return[];
  getPendingReturns: () => Return[];

  // Dépenses
  expenses: Expense[];
  customExpenseCategories: ExpenseCategoryCustom[];
  addExpense: (expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => void;
  deleteExpense: (expenseId: string) => void;
  addCustomExpenseCategory: (name: string, icon: string, createdBy: string) => void;

  // Paramètres
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Initialisation
  initializeBarData: (barId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentSession, hasPermission } = useAuth();
  const { currentBar } = useBarContext();

  // Cache Warming: Rafraîchir les vues matérialisées au démarrage
  const { isWarming } = useCacheWarming(true);

  useEffect(() => {
    if (isWarming) {
      console.log('[AppProvider] Cache warming in progress...');
    }
  }, [isWarming]);

  const barId = currentBar?.id || '';

  // React Query: Fetch data
  const { data: categories = [] } = useCategories(barId);
  const { products: allProducts, supplies: allSupplies } = useStock(); // From StockContext
  const { data: sales = [] } = useSales(barId);
  const { data: returns = [] } = useReturns(barId);
  const { data: expenses = [] } = useExpenses(barId);
  const { data: customExpenseCategories = [] } = useCustomExpenseCategories(barId);

  // React Query: Mutations
  const salesMutations = useSalesMutations(barId);
  const expensesMutations = useExpensesMutations(barId);
  const returnsMutations = useReturnsMutations(barId);
  const categoryMutations = useCategoryMutations(barId);

  // Notifications
  const { showNotification } = useNotifications();
  const settings = defaultSettings;
  const users: User[] = []; // Should come from Auth/BarContext

  // --- CART STATE & LOGIC ---
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product) => {
    setCart(currentCart => {
      const existingItem = currentCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return currentCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...currentCart, { product, quantity: 1 }];
    });
  }, []);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    setCart(currentCart => {
      if (quantity === 0) {
        return currentCart.filter(item => item.product.id !== productId);
      }
      return currentCart.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      );
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(currentCart => currentCart.filter(item => item.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);
  // --- END CART STATE & LOGIC ---

  // Filtrage automatique (déjà fait par les hooks qui prennent barId)
  const products = allProducts; // Déjà filtré par StockContext/useStockQueries
  const supplies = allSupplies;

  const initializeBarData = useCallback(() => {
    // Plus nécessaire avec React Query qui fetch automatiquement
    console.log('initializeBarData called - handled by React Query');
  }, []);

  // --- CATEGORIES ---
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    categoryMutations.createCategory.mutate({
      name: category.name,
      color: category.color,
    }, {
      onSuccess: () => {
        showNotification('success', `Catégorie "${category.name}" créée avec succès`, { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de la création de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);

  const linkCategory = useCallback((globalCategoryId: string) => {
    categoryMutations.linkGlobalCategory.mutate(globalCategoryId, {
      onSuccess: () => {
        showNotification('success', 'Catégorie globale ajoutée avec succès', { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de l\'ajout de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);

  const addCategories = useCallback((categories: Omit<Category, 'id' | 'createdAt' | 'barId'>[]) => {
    // Créer les catégories une par une
    Promise.all(
      categories.map(cat =>
        categoryMutations.createCategory.mutateAsync({
          name: cat.name,
          color: cat.color,
        })
      )
    )
      .then(() => {
        showNotification('success', `${categories.length} catégories créées avec succès`, { duration: 3000 });
      })
      .catch((error: any) => {
        showNotification('error', error.message || 'Erreur lors de la création des catégories', { duration: 5000 });
      });
  }, [categoryMutations, showNotification]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    categoryMutations.updateCategory.mutate(
      {
        id,
        updates: {
          name: updates.name,
          color: updates.color,
        },
      },
      {
        onSuccess: () => {
          showNotification('success', 'Catégorie mise à jour avec succès', { duration: 3000 });
        },
        onError: (error: any) => {
          showNotification('error', error.message || 'Erreur lors de la mise à jour de la catégorie', { duration: 5000 });
        },
      }
    );
  }, [categoryMutations, showNotification]);

  const deleteCategory = useCallback((id: string) => {
    categoryMutations.deleteCategory.mutate(id, {
      onSuccess: () => {
        showNotification('success', 'Catégorie supprimée avec succès', { duration: 3000 });
      },
      onError: (error: any) => {
        showNotification('error', error.message || 'Erreur lors de la suppression de la catégorie', { duration: 5000 });
      },
    });
  }, [categoryMutations, showNotification]);


  // --- PRODUCTS (Read Only) ---
  const getProductsByCategory = useCallback((categoryId: string) => products.filter(p => p.categoryId === categoryId), [products]);
  const getLowStockProducts = useCallback(() => products.filter(p => p.stock <= p.alertThreshold), [products]);
  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

  // --- SUPPLIES (Read Only) ---
  const getSuppliesByProduct = useCallback((productId: string) => supplies.filter(s => s.productId === productId), [supplies]);
  const getTotalCostByProduct = useCallback((productId: string) => {
    return getSuppliesByProduct(productId).reduce((sum, supply) => sum + supply.totalCost, 0);
  }, [getSuppliesByProduct]);
  const getAverageCostPerUnit = useCallback((productId: string) => {
    const productSupplies = getSuppliesByProduct(productId);
    const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
    const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [getSuppliesByProduct]);

  // --- SALES ---
  const addSale = useCallback(async (saleData: Partial<Sale>) => {
    if (!hasPermission('canSell') || !currentBar || !currentSession) return null;

    // Vérifier si items est déjà au format SaleItem[] (a product_id) ou CartItem[] (a product.id)
    const isAlreadyFormatted = saleData.items?.[0]?.hasOwnProperty('product_id');

    // Mapping CartItem[] (UI) -> SaleItem[] (DB/Service)
    const formattedItems = isAlreadyFormatted
      ? (saleData.items as any)
      : saleData.items?.map((item: any) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity
      })) || [];

    const newSaleData = {
      bar_id: currentBar.id,
      items: formattedItems,
      payment_method: saleData.paymentMethod || 'cash', // Default to cash if not provided
      sold_by: currentSession.userId,
      customer_name: saleData.customerName,
      customer_phone: saleData.customerPhone,
      notes: saleData.notes,
      status: (currentSession.role === 'promoteur' || currentSession.role === 'gerant') ? 'validated' : 'pending'
    };

    const result = await salesMutations.createSale.mutateAsync(newSaleData as any);

    // Clear cart after successful sale creation
    if (result) {
      clearCart();
    }

    return result;
  }, [hasPermission, currentBar, currentSession, salesMutations, clearCart]);

  const validateSale = useCallback((saleId: string, validatorId: string) => {
    if (!hasPermission('canManageInventory')) return;

    // Le stock est décrémenté atomiquement lors de la création de la vente via RPC.
    // Cette fonction ne fait que changer le statut de 'pending' à 'validated'.
    salesMutations.validateSale.mutate({ id: saleId, validatorId });
  }, [hasPermission, salesMutations]);

  const rejectSale = useCallback((saleId: string, rejectorId: string) => {
    if (!hasPermission('canManageInventory')) return;
    salesMutations.rejectSale.mutate({ id: saleId, rejectorId });
  }, [hasPermission, salesMutations]);

  const getSalesByDate = useCallback((startDate: Date, endDate: Date) => {
    const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
    const startDateStr = dateToYYYYMMDD(startDate);
    const endDateStr = dateToYYYYMMDD(endDate);

    const baseSales = sales.filter(sale => sale.status === 'validated');
    const filteredSales = filterByBusinessDateRange(baseSales, startDateStr, endDateStr, closeHour);

    if (currentSession?.role === 'serveur') {
      return filteredSales.filter(sale => sale.createdBy === currentSession.userId);
    }
    return filteredSales;
  }, [sales, currentSession, currentBar]);

  const getTodaySales = useCallback(() => {
    const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
    const todayStr = getCurrentBusinessDateString(closeHour);

    const baseSales = sales.filter(sale => sale.status === 'validated');
    const todaySales = filterByBusinessDateRange(baseSales, todayStr, todayStr, closeHour);

    if (currentSession?.role === 'serveur') {
      return todaySales.filter(sale => sale.createdBy === currentSession.userId);
    }
    return todaySales;
  }, [sales, currentSession, currentBar]);

  /**
   * @deprecated Utiliser useRevenueStats() à la place pour garantir la cohérence DRY (SQL/Local)
   */
  const getTodayTotal = useCallback(() => {
    const todaySales = getTodaySales();
    const salesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);

    const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
    const todayStr = getCurrentBusinessDateString(closeHour);

    const todayRefunds = filterByBusinessDateRange(
      returns.filter(r => r.isRefunded),
      todayStr,
      todayStr,
      closeHour
    );

    const returnsTotal = todayRefunds.reduce((sum, r) => sum + r.refundAmount, 0);

    return salesTotal - returnsTotal;
  }, [getTodaySales, returns, currentBar]);

  const getSalesByUser = useCallback((userId: string) => {
    if (!hasPermission('canViewAllSales')) return [];
    return sales.filter(sale => sale.status === 'validated' && sale.createdBy === userId);
  }, [sales, hasPermission]);

  const getServerRevenue = useCallback((userId: string, startDate?: Date, endDate?: Date): number => {
    const closeHour = currentBar?.closingHour ?? BUSINESS_DAY_CLOSE_HOUR;
    const startDateStr = startDate ? dateToYYYYMMDD(startDate) : undefined;
    const endDateStr = endDate ? dateToYYYYMMDD(endDate) : undefined;

    let baseSales = sales.filter(sale => sale.status === 'validated' && sale.createdBy === userId);
    if (startDateStr && endDateStr) {
      baseSales = filterByBusinessDateRange(baseSales, startDateStr, endDateStr, closeHour);
    }
    const salesTotal = baseSales.reduce((sum, s) => sum + s.total, 0);
    const serverSaleIds = new Set(baseSales.map(s => s.id));

    let baseReturns = returns.filter(r => r.isRefunded);
    if (startDateStr && endDateStr) {
      baseReturns = filterByBusinessDateRange(baseReturns, startDateStr, endDateStr, closeHour);
    }

    const serverReturns = baseReturns.filter(r => serverSaleIds.has(r.saleId));

    const returnsTotal = serverReturns.reduce((sum, r) => sum + r.refundAmount, 0);
    return salesTotal - returnsTotal;
  }, [sales, returns, currentBar]);

  const getServerReturns = useCallback((userId: string): Return[] => {
    const serverSaleIds = sales
      .filter(s => s.createdBy === userId && s.status === 'validated')
      .map(s => s.id);
    return returns.filter(r => serverSaleIds.includes(r.saleId));
  }, [sales, returns]);


  // --- RETURNS ---
  const addReturn = useCallback((returnData: Omit<Return, 'id' | 'barId'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;

    returnsMutations.createReturn.mutate({
      ...returnData,
      barId: currentBar.id,
      returnedBy: currentSession.userId
    });
  }, [hasPermission, currentBar, currentSession, returnsMutations]);

  const updateReturn = useCallback((returnId: string, updates: Partial<Return>) => {
    if (!hasPermission('canManageInventory')) return;
    returnsMutations.updateReturn.mutate({ id: returnId, updates });
  }, [hasPermission, returnsMutations]);

  const deleteReturn = useCallback((returnId: string) => {
    if (!hasPermission('canManageInventory')) return;
    returnsMutations.deleteReturn.mutate(returnId);
  }, [hasPermission, returnsMutations]);

  const getReturnsBySale = useCallback((saleId: string) => returns.filter(r => r.saleId === saleId), [returns]);
  const getPendingReturns = useCallback(() => returns.filter(r => r.status === 'pending'), [returns]);


  // --- EXPENSES ---
  const addExpense = useCallback((expenseData: Omit<Expense, 'id' | 'barId' | 'createdAt'>) => {
    if (!hasPermission('canManageInventory') || !currentBar || !currentSession) return;
    expensesMutations.createExpense.mutate({
      ...expenseData,
      barId: currentBar.id,
      createdBy: currentSession.userId
    });
  }, [hasPermission, currentBar, currentSession, expensesMutations]);

  const deleteExpense = useCallback((expenseId: string) => {
    if (!hasPermission('canManageInventory')) return;
    expensesMutations.deleteExpense.mutate(expenseId);
  }, [hasPermission, expensesMutations]);

  const addCustomExpenseCategory = useCallback((name: string, icon: string) => {
    if (!hasPermission('canManageInventory') || !currentBar) return;
    expensesMutations.createCustomCategory.mutate({ name, icon });
  }, [hasPermission, currentBar, expensesMutations]);


  // --- SETTINGS ---
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    // TODO: Implement settings mutation
    console.log('updateSettings', updates);
  }, []);

  const value: AppContextType = {
    categories, products, supplies, sales, returns, settings, users,
    expenses, customExpenseCategories,
    cart, addToCart, updateCartQuantity, removeFromCart, clearCart, // NEW: Add cart state and functions
    addCategory,
    linkCategory,
    addCategories, updateCategory, deleteCategory,
    getProductsByCategory, getLowStockProducts, getProductById,
    getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,
    addSale, validateSale, rejectSale,
    getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
    getServerRevenue, getServerReturns,
    addReturn, updateReturn, deleteReturn, getReturnsBySale, getPendingReturns,
    addExpense, deleteExpense, addCustomExpenseCategory,
    updateSettings,
    initializeBarData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};