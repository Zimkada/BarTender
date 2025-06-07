import React, { createContext, useContext, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  Category, 
  Product, 
  Supply, 
  Order, 
  Sale, 
  CartItem,
  AppSettings,
  Server,
  ServerSession
} from '../types';


// Données par défaut
const defaultCategories: Category[] = [
  {
    id: '1',
    name: 'Bières',
    color: '#f59e0b',
    createdAt: new Date(),
  },
  {
    id: '2',
    name: 'Sucreries',
    color: '#ef4444',
    createdAt: new Date(),
  },
  {
    id: '3',
    name: 'Liqueurs',
    color: '#8b5cf6',
    createdAt: new Date(),
  },
  {
    id: '4',
    name: 'Vins',
    color: '#dc2626',
    createdAt: new Date(),
  },
];

const defaultProducts: Product[] = [
  {
    id: '1',
    name: 'Beaufort',
    volume: '33cl',
    price: 500,
    stock: 24,
    categoryId: '1',
    alertThreshold: 10,
    createdAt: new Date(),
  },
  {
    id: '2',
    name: 'Beaufort',
    volume: '50cl',
    price: 650,
    stock: 12,
    categoryId: '1',
    alertThreshold: 8,
    createdAt: new Date(),
  },
  {
    id: '3',
    name: 'Coca Cola',
    volume: '33cl',
    price: 300,
    stock: 48,
    categoryId: '2',
    alertThreshold: 15,
    createdAt: new Date(),
  },
  {
    id: '4',
    name: 'Castel',
    volume: '50cl',
    price: 600,
    stock: 18,
    categoryId: '1',
    alertThreshold: 10,
    createdAt: new Date(),
  },
  {
    id: '5',
    name: 'Johnny Walker',
    volume: '75cl',
    price: 10000,
    stock: 3,
    categoryId: '3',
    alertThreshold: 2,
    createdAt: new Date(),
  },
  {
    id: '6',
    name: 'Mouton Cadet',
    volume: '75cl',
    price: 12000,
    stock: 5,
    categoryId: '4',
    alertThreshold: 2,
    createdAt: new Date(),
  },
];

const defaultServers: Server[] = [
  {
    id: '1',
    name: 'Prenom1 Nom1',
    email: 'prenom1n@bar.com',
    isActive: true,
    createdAt: new Date(),
  },
];

const defaultSettings: AppSettings = {
  currency: 'FCFA',
  currencySymbol: '₣',
  userRole: 'manager',
};

// Interface du contexte
interface AppContextType {
  // État
  servers: Server[];
  currentServer: ServerSession | null;
  categories: Category[];
  products: Product[];
  supplies: Supply[];
  orders: Order[];
  sales: Sale[];
  settings: AppSettings;
  
  // Serveurs
  addServer: (server: Omit<Server, 'id' | 'createdAt'>) => Server;
  updateServer: (id: string, updates: Partial<Server>) => void;
  deleteServer: (id: string) => void;
  loginServer: (serverId: string) => void;
  logoutServer: () => void;
  getActiveServers: () => Server[];

  // Catégories
  addCategory: (category: Omit<Category, 'id' | 'createdAt'>) => Category;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  
  // Produits
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  decreaseStock: (id: string, quantity: number) => void;
  increaseStock: (id: string, quantity: number) => void;
  getProductsByCategory: (categoryId: string) => Product[];
  getLowStockProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;
  
  // Approvisionnements
  addSupply: (supply: Omit<Supply, 'id' | 'date' | 'totalCost'>) => Supply;
  getSuppliesByProduct: (productId: string) => Supply[];
  getTotalCostByProduct: (productId: string) => number;
  getAverageCostPerUnit: (productId: string) => number;
  
  // Commandes
  addOrder: (order: Omit<Order, 'id' | 'date' | 'status'>) => Order;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  returnOrderItem: (orderId: string, productId: string, returnQuantity: number) => void;
  getPendingOrders: () => Order[];
  getTodayOrders: () => Order[];
  
  // Ventes
  addSale: (saleData: { items: CartItem[]; total: number; currency: string; serverId: string; serverName: string; orderId?: string }) => Sale;
  getSalesByDate: (startDate: Date, endDate: Date) => Sale[];
  getTodaySales: () => Sale[];
  getTodayTotal: () => number;
  
  // Paramètres
  updateSettings: (updates: Partial<AppSettings>) => void;
  formatPrice: (price: number) => string;
}

// Création du contexte
const AppContext = createContext<AppContextType | undefined>(undefined);

// Hook pour utiliser le contexte
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// Provider du contexte
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // États locaux avec persistance
  const [servers, setServers] = useLocalStorage<Server[]>('bar-servers', defaultServers);
  const [currentServer, setCurrentServer] = useLocalStorage<ServerSession | null>('bar-current-server', null);
  const [categories, setCategories] = useLocalStorage<Category[]>('bar-categories', defaultCategories);
  const [products, setProducts] = useLocalStorage<Product[]>('bar-products', defaultProducts);
  const [supplies, setSupplies] = useLocalStorage<Supply[]>('bar-supplies', []);
  const [orders, setOrders] = useLocalStorage<Order[]>('bar-orders', []);
  const [sales, setSales] = useLocalStorage<Sale[]>('bar-sales', []);
  const [settings, setSettings] = useLocalStorage<AppSettings>('bar-settings', defaultSettings);

  // Optimisation : Mémoriser les fonctions pour éviter les re-renders inutiles

  // Gestion serveurs
  const addServer = useCallback((server: Omit<Server, 'id' | 'createdAt'>) => {
    const newServer: Server = {
      ...server,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setServers(prev => [...prev, newServer]);
    return newServer;
  }, [setServers]);

  const updateServer = useCallback((id: string, updates: Partial<Server>) => {
    setServers(prev => prev.map(server => 
      server.id === id ? { ...server, ...updates } : server
    ));
  }, [setServers]);

  const deleteServer = useCallback((id: string) => {
    setServers(prev => prev.filter(server => server.id !== id));
  }, [setServers]);

  const loginServer = useCallback((serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (server && server.isActive) {
      setCurrentServer({
        serverId: server.id,
        serverName: server.name,
        loginTime: new Date(),
      });
      updateServer(serverId, { lastActiveAt: new Date() });
    }
  }, [servers, setCurrentServer, updateServer]);

  const logoutServer = useCallback(() => {
    setCurrentServer(null);
  }, [setCurrentServer]);

  const getActiveServers = useCallback(() => {
    return servers.filter(server => server.isActive);
  }, [servers]);


  // Fonctions de gestion des catégories
  const addCategory = useCallback((category: Omit<Category, 'id' | 'createdAt'>) => {
    const newCategory: Category = {
      ...category,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setCategories(prev => [...prev, newCategory]);
    return newCategory;
  }, [setCategories]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories(prev => prev.map(cat => 
      cat.id === id ? { ...cat, ...updates } : cat
    ));
  }, [setCategories]);

  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== id));
  }, [setCategories]);
  
  const addProduct = useCallback((product: Omit<Product, 'id' | 'createdAt'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  }, [setProducts]);


  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(product => 
      product.id === id ? { ...product, ...updates } : product
    ));
  }, [setProducts]);

  const deleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(product => product.id !== id));
  }, [setProducts]);

  const decreaseStock = useCallback((id: string, quantity: number) => {
    setProducts(prev => prev.map(product => 
      product.id === id ? { ...product, stock: Math.max(0, product.stock - quantity) } : product
    ));
  }, [setProducts]);

  const increaseStock = useCallback((id: string, quantity: number) => {
    setProducts(prev => prev.map(product => 
      product.id === id ? { ...product, stock: product.stock + quantity } : product
    ));
  }, [setProducts]);

  const getProductsByCategory = useCallback((categoryId: string) => {
    return products
      .filter(product => product.categoryId === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [products]);

  const getLowStockProducts = useCallback(() => {
    return products.filter(product => product.stock <= product.alertThreshold);
  }, [products]);

  const getProductById = useCallback((id: string) => {
    return products.find(product => product.id === id);
  }, [products]);

  const addSupply = useCallback((supply: Omit<Supply, 'id' | 'date' | 'totalCost'>) => {
    const totalCost = (supply.quantity / supply.lotSize) * supply.lotPrice;
    const newSupply: Supply = {
      ...supply,
      id: Date.now().toString(),
      date: new Date(),
      totalCost,
    };
    setSupplies(prev => [newSupply, ...prev]);
    
    // Mettre à jour le stock du produit
    increaseStock(supply.productId, supply.quantity);
    
    return newSupply;
  }, [setSupplies, increaseStock]);

  const getSuppliesByProduct = useCallback((productId: string) => {
    return supplies.filter(supply => supply.productId === productId);
  }, [supplies]);

  const getTotalCostByProduct = useCallback((productId: string) => {
    return supplies
      .filter(supply => supply.productId === productId)
      .reduce((total, supply) => total + supply.totalCost, 0);
  }, [supplies]);

  const getAverageCostPerUnit = useCallback((productId: string) => {
    const productSupplies = getSuppliesByProduct(productId);
    if (productSupplies.length === 0) return 0;
    
    const totalQuantity = productSupplies.reduce((sum, supply) => sum + supply.quantity, 0);
    const totalCost = productSupplies.reduce((sum, supply) => sum + supply.totalCost, 0);
    
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  }, [getSuppliesByProduct]);

  const addOrder = useCallback((order: Omit<Order, 'id' | 'date' | 'status'>) => {
    const newOrder: Order = {
      ...order,
      id: Date.now().toString(),
      date: new Date(),
      status: 'pending',
    };
    setOrders(prev => [newOrder, ...prev]);
    return newOrder;
  }, [setOrders]);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    setOrders(prev => prev.map(order => 
      order.id === orderId 
        ? { 
            ...order, 
            status,
            completedAt: status === 'completed' ? new Date() : order.completedAt
          }
        : order
    ));
  }, [setOrders]);

  const returnOrderItem = useCallback((orderId: string, productId: string, returnQuantity: number) => {
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      
      const updatedItems = order.items.map(item => {
        if (item.product.id !== productId) return item;
        
        const currentReturned = item.returned || 0;
        const newReturned = Math.min(currentReturned + returnQuantity, item.quantity);
        
        return { ...item, returned: newReturned };
      });
      
      // Recalculer le total
      const newTotal = updatedItems.reduce((sum, item) => {
        const effectiveQuantity = item.quantity - (item.returned || 0);
        return sum + (item.product.price * effectiveQuantity);
      }, 0);
      
      return { ...order, items: updatedItems, total: newTotal };
    }));
    
    // Restituer le stock du produit
    increaseStock(productId, returnQuantity);
  }, [setOrders, increaseStock]);

  const getPendingOrders = useCallback(() => {
    return orders.filter(order => order.status === 'pending');
  }, [orders]);

  const getTodayOrders = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return orders.filter(order => {
      const orderDate = new Date(order.date);
      return orderDate >= today && orderDate < tomorrow;
    });
  }, [orders]);

  const addSale = useCallback((saleData: { items: CartItem[]; total: number; currency: string; serverId: string; serverName: string; orderId?: string }) => {
    const newSale: Sale = {
      ...saleData,
      id: Date.now().toString(),
      date: new Date(),
    };
    setSales(prev => [newSale, ...prev]);
    
    saleData.items.forEach(item => {
      decreaseStock(item.product.id, item.quantity);
    });
    
    return newSale;
  }, [setSales, decreaseStock]);

  const getSalesByDate = useCallback((startDate: Date, endDate: Date) => {
    return sales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= startDate && saleDate <= endDate;
    });
  }, [sales]);

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

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings]);

  const formatPrice = useCallback((price: number) => {
    return `${settings.currencySymbol}${price.toLocaleString('fr-FR')}`;
  }, [settings.currencySymbol]);

  const value: AppContextType = {
    // État
    servers,           
    currentServer,     
    categories,
    products,
    supplies,
    orders,
    sales,
    settings,
    
    // Serveurs
    addServer,
    updateServer, 
    deleteServer,
    loginServer,
    logoutServer,
    getActiveServers,



    // Catégories
    addCategory,
    updateCategory,
    deleteCategory,
    
    // Produits
    addProduct,
    updateProduct,
    deleteProduct,
    decreaseStock,
    increaseStock,
    getProductsByCategory,
    getLowStockProducts,
    getProductById,
    
    // Approvisionnements
    addSupply,
    getSuppliesByProduct,
    getTotalCostByProduct,
    getAverageCostPerUnit,
    
    // Commandes
    addOrder,
    updateOrderStatus,
    returnOrderItem,
    getPendingOrders,
    getTodayOrders,
    
    // Ventes
    addSale,
    getSalesByDate,
    getTodaySales,
    getTodayTotal,
    
    // Paramètres
    updateSettings,
    formatPrice,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};