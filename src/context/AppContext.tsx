import React, { createContext, useContext, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { offlineQueue } from '../services/offlineQueue';
import { useNotifications } from '../hooks/useNotifications';
import { 
  Category, 
  Product, 
  Supply, 
  Order, 
  Sale, 
  CartItem,
  AppSettings,
} from '../types';

// Données par défaut pour un nouveau bar
const getDefaultCategories = (barId: string): Category[] => [
  { id: `${barId}_cat_1`, barId, name: 'Bières', color: '#f59e0b', createdAt: new Date() },
  { id: `${barId}_cat_2`, barId, name: 'Sucreries', color: '#ef4444', createdAt: new Date() },
  { id: `${barId}_cat_3`, barId, name: 'Liqueurs', color: '#8b5cf6', createdAt: new Date() },
  { id: `${barId}_cat_4`, barId, name: 'Vins', color: '#dc2626', createdAt: new Date() },
];

const getDefaultProducts = (barId: string): Product[] => [
  { id: `${barId}_prod_1`, barId, name: 'Beaufort', volume: '33cl', price: 500, stock: 24, categoryId: `${barId}_cat_1`, alertThreshold: 10, createdAt: new Date() },
  { id: `${barId}_prod_2`, barId, name: 'Beaufort', volume: '50cl', price: 650, stock: 12, categoryId: `${barId}_cat_1`, alertThreshold: 8, createdAt: new Date() },
  { id: `${barId}_prod_3`, barId, name: 'Coca Cola', volume: '33cl', price: 300, stock: 48, categoryId: `${barId}_cat_2`, alertThreshold: 15, createdAt: new Date() },
];

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
  orders: Order[];
  sales: Sale[];
  settings: AppSettings;
  
  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => Category | null;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  
  // Produits
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'barId'>) => Product | null;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  decreaseStock: (id: string, quantity: number) => void;
  increaseStock: (id: string, quantity: number) => void;
  getProductsByCategory: (categoryId: string) => Product[];
  getLowStockProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;
  
  // Approvisionnements
  addSupply: (supply: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId'>) => Supply | null;
  getSuppliesByProduct: (productId: string) => Supply[];
  getTotalCostByProduct: (productId: string) => number;
  getAverageCostPerUnit: (productId: string) => number;
  
  // Commandes
  addOrder: (order: Omit<Order, 'id' | 'date' | 'status' | 'createdBy' | 'barId'>) => Order | null;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  returnOrderItem: (orderId: string, productId: string, returnQuantity: number) => void;
  getPendingOrders: () => Order[];
  getTodayOrders: () => Order[];
  getOrdersByUser: (userId: string) => Order[];
  
  // Ventes
  addSale: (saleData: { items: CartItem[]; total: number; currency: string; orderId?: string }) => Sale | null;
  getSalesByDate: (startDate: Date, endDate: Date) => Sale[];
  getTodaySales: () => Sale[];
  getTodayTotal: () => number;
  getSalesByUser: (userId: string) => Sale[];
  
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
  const { showNotification } = useNotifications();
  
  // États avec tous les bars
  const [allCategories, setAllCategories] = useLocalStorage<Category[]>('categories-v3', []);
  const [allProducts, setAllProducts] = useLocalStorage<Product[]>('products-v3', []);
  const [allSupplies, setAllSupplies] = useLocalStorage<Supply[]>('supplies-v3', []);
  const [allOrders, setAllOrders] = useLocalStorage<Order[]>('orders-v3', []);
  const [allSales, setAllSales] = useLocalStorage<Sale[]>('sales-v3', []);
  const [settings, setSettings] = useLocalStorage<AppSettings>('app-settings-v3', defaultSettings);

  // Filtrage automatique par bar actuel
  const categories = allCategories.filter(c => c.barId === currentBar?.id);
  const products = allProducts.filter(p => p.barId === currentBar?.id);
  const supplies = allSupplies.filter(s => s.barId === currentBar?.id);
  const sales = allSales.filter(s => s.barId === currentBar?.id);
  const orders = allOrders.filter(o => o.barId === currentBar?.id);

  // Initialisation des données par défaut pour un nouveau bar
  const initializeBarData = useCallback((barId: string) => {
    const existingCategories = allCategories.some(c => c.barId === barId);
    if (!existingCategories) {
      const defaultCategories = getDefaultCategories(barId);
      const defaultProducts = getDefaultProducts(barId);
      
      setAllCategories(prev => [...prev, ...defaultCategories]);
      setAllProducts(prev => [...prev, ...defaultProducts]);
    }
  }, [allCategories, setAllCategories, setAllProducts]);

  // Catégories
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    if (!hasPermission('canAddProducts') || !currentBar) return null;
    
    const newCategory: Category = { 
      ...category, 
      id: Date.now().toString(), 
      barId: currentBar.id,
      createdAt: new Date() 
    };
    setAllCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [setAllCategories, hasPermission, currentBar]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    if (!hasPermission('canEditProducts')) return;
    setAllCategories(prev => prev.map(cat => cat.id === id ? { ...cat, ...updates } : cat));
  }, [setAllCategories, hasPermission]);

  const deleteCategory = useCallback((id: string) => {
    if (!hasPermission('canDeleteProducts')) return;
    setAllCategories(prev => prev.filter(cat => cat.id !== id));
  }, [setAllCategories, hasPermission]);
  
  // Produits
  const addProduct = useCallback((product: Omit<Product, 'id' | 'createdAt' | 'barId'>) => {
    if (!hasPermission('canAddProducts') || !currentBar) return null;
    
    const newProduct: Product = { 
      ...product, 
      id: Date.now().toString(), 
      barId: currentBar.id,
      createdAt: new Date() 
    };
    setAllProducts(prev => [...prev, newProduct]);
    return newProduct;
  }, [setAllProducts, hasPermission, currentBar]);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    if (!hasPermission('canEditProducts')) return;
    setAllProducts(prev => prev.map(product => product.id === id ? { ...product, ...updates } : product));
  }, [setAllProducts, hasPermission]);

  const deleteProduct = useCallback((id: string) => {
    if (!hasPermission('canDeleteProducts')) return;
    setAllProducts(prev => prev.filter(product => product.id !== id));
  }, [setAllProducts, hasPermission]);

  const decreaseStock = useCallback((id: string, quantity: number) => {
    setAllProducts(prev => prev.map(product => 
      product.id === id ? { ...product, stock: Math.max(0, product.stock - quantity) } : product
    ));
  }, [setAllProducts]);

  const increaseStock = useCallback((id: string, quantity: number) => {
    if (!hasPermission('canManageInventory')) return;
    setAllProducts(prev => prev.map(product => 
      product.id === id ? { ...product, stock: product.stock + quantity } : product
    ));
  }, [setAllProducts, hasPermission]);

  const getProductsByCategory = useCallback((categoryId: string) => {
    return products.filter(product => product.categoryId === categoryId);
  }, [products]);

  const getLowStockProducts = useCallback(() => {
    return products.filter(product => product.stock <= product.alertThreshold);
  }, [products]);

  const getProductById = useCallback((id: string) => {
    return products.find(product => product.id === id);
  }, [products]);

  // Approvisionnements
  const addSupply = useCallback((supply: Omit<Supply, 'id' | 'date' | 'totalCost' | 'barId'>) => {
    if (!hasPermission('canManageInventory') || !currentBar) return null;
    
    const totalCost = (supply.quantity / supply.lotSize) * supply.lotPrice;
    const newSupply: Supply = {
      ...supply,
      id: Date.now().toString(),
      barId: currentBar.id,
      date: new Date(),
      totalCost,
    };
    setAllSupplies(prev => [newSupply, ...prev]);
    increaseStock(supply.productId, supply.quantity);
    return newSupply;
  }, [setAllSupplies, increaseStock, hasPermission, currentBar]);

  const getSuppliesByProduct = useCallback((productId: string) => {
    return supplies.filter(supply => supply.productId === productId);
  }, [supplies]);

  const getTotalCostByProduct = useCallback((productId: string) => {
    return getSuppliesByProduct(productId).reduce((sum, supply) => sum + supply.totalCost, 0);
  }, [getSuppliesByProduct]);

  const getAverageCostPerUnit = useCallback((productId: string) => {
    const productSupplies = getSuppliesByProduct(productId);
    const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
    const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [getSuppliesByProduct]);

  // Commandes
  const addOrder = useCallback((order: Omit<Order, 'id' | 'date' | 'status' | 'createdBy' | 'barId'>) => {
    if (!hasPermission('canSell') || !currentBar || !currentSession) return null;
    
    const newOrder: Order = {
      ...order,
      id: Date.now().toString(),
      barId: currentBar.id,
      date: new Date(),
      status: 'en attente',
      createdBy: currentSession.userId,
    };
    setAllOrders(prev => [newOrder, ...prev]);
    return newOrder;
  }, [setAllOrders, hasPermission, currentBar, currentSession]);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    if (!hasPermission('canSell')) return;
    setAllOrders(prev => prev.map(order => 
      order.id === orderId 
        ? { 
            ...order, 
            status,
            completedAt: status === 'servi' ? new Date() : order.completedAt,
          }
        : order
    ));
  }, [setAllOrders, hasPermission]);

  const returnOrderItem = useCallback((orderId: string, productId: string, returnQuantity: number) => {
    if (!hasPermission('canSell')) return;
    setAllOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      
      const updatedItems = order.items.map(item => {
        if (item.product.id !== productId) return item;
        const currentReturned = item.returned || 0;
        const newReturned = Math.min(currentReturned + returnQuantity, item.quantity);
        return { ...item, returned: newReturned };
      });
      
      const newTotal = updatedItems.reduce((sum, item) => {
        const effectiveQuantity = item.quantity - (item.returned || 0);
        return sum + (item.product.price * effectiveQuantity);
      }, 0);
      
      return { ...order, items: updatedItems, total: newTotal };
    }));
    
    increaseStock(productId, returnQuantity);
  }, [setAllOrders, increaseStock, hasPermission]);

  const getPendingOrders = useCallback(() => {
    const pendingOrders = orders.filter(order => order.status === 'en attente');
    
    if (currentSession?.role === 'serveur') {
      return pendingOrders.filter(order => order.createdBy === currentSession.userId);
    }
    
    return pendingOrders;
  }, [orders, currentSession]);

  const getTodayOrders = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = orders.filter(order => {
      const orderDate = new Date(order.date);
      return orderDate >= today && orderDate < tomorrow;
    });

    if (currentSession?.role === 'serveur') {
      return todayOrders.filter(order => order.createdBy === currentSession.userId);
    }

    return todayOrders;
  }, [orders, currentSession]);

  const getOrdersByUser = useCallback((userId: string) => {
    if (!hasPermission('canViewAllSales')) return [];
    return orders.filter(order => order.createdBy === userId);
  }, [orders, hasPermission]);

  // Ventes
  const addSale = useCallback((saleData: { items: CartItem[]; total: number; currency: string; orderId?: string }) => {
    if (!hasPermission('canSell') || !currentBar || !currentSession) return null;
    
    // Vérifier stock
    for (const item of saleData.items) {
      const product = getProductById(item.product.id);
      if (!product || product.stock < item.quantity) {
        throw new Error(`Stock insuffisant pour ${item.product.name}`);
      }
    }
    
    const newSale: Sale = {
      ...saleData,
      id: Date.now().toString(),
      barId: currentBar.id,
      date: new Date(),
      processedBy: currentSession.userId,
    };

    // Si hors ligne, ajouter à la queue
    if (!navigator.onLine) {
      offlineQueue.add({
        type: 'CREATE_SALE',
        payload: newSale,
        barId: currentBar.id
      });
      
      // Quand même sauvegarder localement
      setAllSales(prev => [newSale, ...prev]);
      
      // Diminuer le stock localement
      saleData.items.forEach(item => {
        decreaseStock(item.product.id, item.quantity);
      });
      
      showNotification('info', '📵 Vente enregistrée localement');
      return newSale;
    }
    
    // Si en ligne, procéder normalement
    setAllSales(prev => [newSale, ...prev]);
    
    saleData.items.forEach(item => {
      decreaseStock(item.product.id, item.quantity);
    });
    
    return newSale;
  }, [setAllSales, decreaseStock, getProductById, hasPermission, currentBar, currentSession, showNotification]);
    

  const getSalesByDate = useCallback((startDate: Date, endDate: Date) => {
    const filteredSales = sales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= startDate && saleDate <= endDate;
    });

    if (currentSession?.role === 'serveur') {
      return filteredSales.filter(sale => sale.processedBy === currentSession.userId);
    }

    return filteredSales;
  }, [sales, currentSession]);

  const getTodaySales = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return getSalesByDate(today, tomorrow);
  }, [getSalesByDate]);

  const getTodayTotal = useCallback(() => {
    return getTodaySales().reduce((sum, sale) => sum + sale.total, 0);
  }, [getTodaySales]);

  const getSalesByUser = useCallback((userId: string) => {
    if (!hasPermission('canViewAllSales')) return [];
    return sales.filter(sale => sale.processedBy === userId);
  }, [sales, hasPermission]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    if (!hasPermission('canManageSettings')) return;
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings, hasPermission]);


  const value: AppContextType = {
    // État
    categories, products, supplies, orders, sales, settings,
    
    // Catégories
    addCategory, updateCategory, deleteCategory,
    
    // Produits
    addProduct, updateProduct, deleteProduct, decreaseStock, increaseStock,
    getProductsByCategory, getLowStockProducts, getProductById,
    
    // Approvisionnements
    addSupply, getSuppliesByProduct, getTotalCostByProduct, getAverageCostPerUnit,
    
    // Commandes
    addOrder, updateOrderStatus, returnOrderItem, getPendingOrders, getTodayOrders, getOrdersByUser,
    
    // Ventes
    addSale, getSalesByDate, getTodaySales, getTodayTotal, getSalesByUser,
    
    // Paramètres
    updateSettings,
    
    // Initialisation
    initializeBarData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};