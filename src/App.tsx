import { useState, useEffect } from 'react';
//import React, from 'react';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CategoryModal } from './components/CategoryModal';
import { EnhancedSalesHistory } from './components/SalesHistory';
import { Inventory } from './components/Inventory';
import { Settings } from './components/Settings';
import { ServerInterface } from './components/ServerInterface';
import { LoginScreen } from './components/LoginScreen';
import { UserManagement } from './components/UserManagement';
import { RoleBasedComponent } from './components/RoleBasedComponent';
import { NotificationsProvider} from './components/Notifications';
import { useNotifications } from './hooks/useNotifications';
import { useAppContext } from './context/AppContext';
import { CartItem, Product } from './types';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import { syncService } from './services/syncService';
import { DailyDashboard } from './components/DailyDashboard';
import { ReturnsSystem } from './components/ReturnsSystem';
import { QuickSaleFlow } from './components/QuickSaleFlow';
import { StockAlertsSystem } from './components/StockAlertsSystem';
import { MobileNavigation } from './components/MobileNavigation';
import { MobileSidebar } from './components/MobileSidebar';
import { Accounting } from './components/Accounting';
import { ConsignmentSystem } from './components/ConsignmentSystem';



function AppContent() {
  const {
    categories,
    addCategory,
    addProduct, 
    getProductsByCategory,
    addSale,
    settings 
  } = useAppContext();
  
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotifications();
  const [showDailyDashboard, setShowDailyDashboard] = useState(false);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showServers, setShowServers] = useState(false);
  const [currentInterface, setCurrentInterface] = useState<'manager' | 'server'>('manager');
  const currentProducts = getProductsByCategory(activeCategory);
  const [showReturns, setShowReturns] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showStockAlerts, setShowStockAlerts] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [currentMenu, setCurrentMenu] = useState('home');
  const [showAccounting, setShowAccounting] = useState(false);
  const [showConsignment, setShowConsignment] = useState(false);


  useEffect(() => {
    // Démarrer la sync automatique
    syncService.startAutoSync();

    // Écouter l'événement de sync requise
    const handleSyncRequired = () => {
      syncService.syncPendingOperations();
    };

    window.addEventListener('sync-required', handleSyncRequired);

    return () => {
      syncService.stopAutoSync();
      window.removeEventListener('sync-required', handleSyncRequired);
    };
    }, []);

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity === 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const checkout = (assignedTo?: string) => {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    try {
      addSale({
        items: cart,
        total,
        currency: settings.currency,
        assignedTo,
      });

      clearCart();
      setIsCartOpen(false);
      showNotification('success', 'Vente enregistrée avec succès !');
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Erreur lors de la vente');
    }
  };

  const handleMobileNavigation = (menu: string) => {
    setCurrentMenu(menu);

    // Fermer toutes les modales pour éviter les conflits
    setShowSalesHistory(false);
    setShowInventory(false);
    setShowSettings(false);
    setShowDailyDashboard(false);
    setShowQuickSale(false);
    setShowStockAlerts(false);
    setShowServers(false);
    setShowAccounting(false);
    setShowReturns(false);
    setShowConsignment(false);

    // Ouvrir la modale demandée
    switch (menu) {
      case 'quickSale':
        setShowQuickSale(true);
        break;
      case 'dailyDashboard':
        setShowDailyDashboard(true);
        break;
      case 'history':
        setShowSalesHistory(true);
        break;
      case 'inventory':
        setShowInventory(true);
        break;
      case 'stockAlerts':
        setShowStockAlerts(true);
        break;
      case 'returns':
        setShowReturns(true);
        break;
      case 'consignments':
        setShowConsignment(true);
        break;
      case 'teamManagement':
        setShowServers(true);
        break;
      case 'settings':
        setShowSettings(true);
        break;
      case 'accounting':
        setShowAccounting(true);
        break;
      // Le cas 'home' ne fait plus rien, car tout est déjà fermé.
      default:
        break;
    }
  };

  // Écran de connexion si pas authentifié
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Interface serveur simplifiée
  if (currentInterface === 'server') {
    return (
      <ServerInterface 
        onSwitchToManager={() => setCurrentInterface('manager')}
      />
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-yellow-200 to-amber-200 pb-16 md:pb-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Header
        onShowSales={() => setShowSalesHistory(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowInventory={() => setShowInventory(true)}
        onShowServers={() => setShowServers(true)}
        onSwitchToServer={() => setCurrentInterface('server')}
        onShowDailyDashboard={() => setShowDailyDashboard(true)}
        onShowReturns={() => setShowReturns(true)}
        onShowQuickSale={() => setShowQuickSale(true)}
        onShowStockAlerts={() => setShowStockAlerts(true)}
        onShowAccounting={() => setShowAccounting(true)}
        onShowConsignment={() => setShowConsignment(true)}
        onToggleMobileSidebar={() => setShowMobileSidebar(!showMobileSidebar)}
      />
      
      <motion.main
        className="container mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={(id) => {
            setActiveCategory(id);
            const category = categories.find(c => c.id === id);
            if (category) {
              showNotification('info', `Catégorie: ${category.name}`);
            }
          }}
          onAddCategory={() => setShowCategoryModal(true)}
        />
        
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ProductGrid
              products={currentProducts}
              onAddToCart={addToCart}
          />
          </motion.div>
        </AnimatePresence>
      </motion.main>

      <RoleBasedComponent requiredPermission="canViewInventory">
        <StockAlertsSystem 
          isOpen={showStockAlerts} 
          onClose={() => setShowStockAlerts(false)} />
      </RoleBasedComponent>

      <DailyDashboard
        isOpen={showDailyDashboard}
        onClose={() => setShowDailyDashboard(false)}
      />

      <RoleBasedComponent requiredPermission="canManageInventory">
        <ReturnsSystem
          isOpen={showReturns}
          onClose={() => setShowReturns(false)}
        />
      </RoleBasedComponent>

      <QuickSaleFlow
        isOpen={showQuickSale}
        onClose={() => setShowQuickSale(false)}
      />

      <Cart
        items={cart}
        isOpen={isCartOpen}
        onToggle={() => setIsCartOpen(!isCartOpen)}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={checkout}
        onClear={clearCart}
        hideFloatingButton={showQuickSale || showStockAlerts || showDailyDashboard || showSalesHistory || showInventory || showSettings || showServers || showReturns || showAccounting}
      />
      
      <RoleBasedComponent requiredPermission="canManageUsers">
        <UserManagement
          isOpen={showServers}
          onClose={() => setShowServers(false)}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canAddProducts">
        <ProductModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSave={(productData) => {
            addProduct(productData);
            setShowProductModal(false);
            showNotification('success', `Produit "${productData.name}" ajouté`);
          }}
          categories={categories}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canAddProducts">
        <CategoryModal
          isOpen={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          onSave={(categoryData) => {
            const newCategory = addCategory(categoryData);
            if (newCategory) {
              setActiveCategory(newCategory.id);
              setShowCategoryModal(false);
              showNotification('success', `Catégorie "${categoryData.name}" créée`);
            }
          }}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canViewAllSales">
        <EnhancedSalesHistory
          isOpen={showSalesHistory}
          onClose={() => setShowSalesHistory(false)}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canManageInventory">
        <Inventory
          isOpen={showInventory}
          onClose={() => setShowInventory(false)}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canManageSettings">
        <Settings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canViewAccounting">
        <Accounting
          isOpen={showAccounting}
          onClose={() => setShowAccounting(false)}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canCreateConsignment">
        <ConsignmentSystem
          isOpen={showConsignment}
          onClose={() => setShowConsignment(false)}
        />
      </RoleBasedComponent>

      {/* Sidebar - Mobile & Desktop */}
      <MobileSidebar
        isOpen={showMobileSidebar}
        onClose={() => setShowMobileSidebar(false)}
        onNavigate={handleMobileNavigation}
        currentMenu={currentMenu}
      />

      {/* Mobile Navigation */}
      <MobileNavigation
        onShowSales={() => setShowSalesHistory(true)}
        onShowInventory={() => setShowInventory(true)}
        onShowQuickSale={() => setShowQuickSale(true)}
        onShowReturns={() => setShowReturns(true)}
        onShowStockAlerts={() => setShowStockAlerts(true)}
        onShowExcel={() => setShowExcel(true)}
      />
    </motion.div>
  );
}

function App() {
  return (
    <NotificationsProvider>
      <AppContent />
    </NotificationsProvider>
  );
}

export default App;