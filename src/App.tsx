import { useState, useEffect, lazy, Suspense } from 'react';
//import React, from 'react';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CategoryModal } from './components/CategoryModal';
import { ServerInterface } from './components/ServerInterface';
import { LoginScreen } from './components/LoginScreen';
import { UserManagement } from './components/UserManagement';
import { RoleBasedComponent } from './components/RoleBasedComponent';
import { NotificationsProvider, useNotifications } from './components/Notifications';
import { useAppContext } from './context/AppContext';
import { useStockManagement } from './hooks/useStockManagement';
import { StockBridgeProvider } from './context/StockBridgeProvider';
import { CartItem, Product, Category } from './types';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import { syncService } from './services/syncService';
import { QuickSaleFlow } from './components/QuickSaleFlow';
import { MobileNavigation } from './components/MobileNavigation';
import { MobileSidebar } from './components/MobileSidebar';
import { LoadingFallback } from './components/LoadingFallback';

// Lazy load des composants lourds (XLSX, Recharts, etc.)
const EnhancedSalesHistory = lazy(() => import('./components/SalesHistory').then(m => ({ default: m.EnhancedSalesHistory })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const DailyDashboard = lazy(() => import('./components/DailyDashboard').then(m => ({ default: m.DailyDashboard })));
const ReturnsSystem = lazy(() => import('./components/ReturnsSystem').then(m => ({ default: m.ReturnsSystem })));
const ForecastingSystem = lazy(() => import('./components/ForecastingSystem').then(m => ({ default: m.ForecastingSystem })));
const Accounting = lazy(() => import('./components/Accounting').then(m => ({ default: m.Accounting })));
const ConsignmentSystem = lazy(() => import('./components/ConsignmentSystem').then(m => ({ default: m.ConsignmentSystem })));



function AppContent() {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    addProduct,
    getProductsByCategory,
    addSale,
    settings
  } = useAppContext();

  const { processSaleValidation } = useStockManagement();
  const { isAuthenticated, currentSession } = useAuth();
  const { showNotification } = useNotifications();
  const [showDailyDashboard, setShowDailyDashboard] = useState(false);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showServers, setShowServers] = useState(false);
  const [currentInterface, setCurrentInterface] = useState<'manager' | 'server'>('manager');
  const currentProducts = getProductsByCategory(activeCategory);
  const [showReturns, setShowReturns] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showForecasting, setShowForecasting] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [currentMenu, setCurrentMenu] = useState('home');
  const [showAccounting, setShowAccounting] = useState(false);
  const [showConsignment, setShowConsignment] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
  };

  const handleDeleteCategory = (categoryId: string) => {
    deleteCategory(categoryId);
  };

  const handleCategoryModalClose = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
  };

  const handleCategoryModalSave = (categoryData: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    if (editingCategory) {
      updateCategory(editingCategory.id, categoryData);
      showNotification('success', `Catégorie "${categoryData.name}" modifiée.`);
    } else {
      const newCategory = addCategory(categoryData);
      if (newCategory) {
        setActiveCategory(newCategory.id);
        showNotification('success', `Catégorie "${categoryData.name}" créée.`);
      }
    }
    handleCategoryModalClose();
  };

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
    if (cart.length === 0 || !currentSession) return;

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const isServerRole = currentSession.role === 'serveur';

    try {
      if (isServerRole) {
        addSale({
          items: cart,
          total,
          currency: settings.currency,
          status: 'pending',
          createdBy: currentSession.userId,
          createdAt: new Date(),
          assignedTo,
        });
      } else {
        // ✅ Vente directe (promoteur/gérant) : validation + stock atomique
        const success = processSaleValidation(
          cart,
          () => {
            // Callback succès : créer la vente après décrémentation stock
            addSale({
              items: cart,
              total,
              currency: settings.currency,
              status: 'validated',
              createdBy: currentSession.userId,
              validatedBy: currentSession.userId,
              createdAt: new Date(),
              validatedAt: new Date(),
              assignedTo,
            });
          },
          (error) => {
            // Callback erreur : stock insuffisant
            showNotification('error', error);
          }
        );

        if (!success) return; // Arrêter si validation échouée
      }

      clearCart();
      setIsCartOpen(false);
      // La notification est gérée dans AppContext, pas besoin d'une autre ici.
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
    setShowForecasting(false);
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
        setShowForecasting(true);
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
      className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 pb-16 md:pb-0"
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
        onShowForecasting={() => setShowForecasting(true)}
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
          onEditCategory={handleEditCategory}
          onDeleteCategory={handleDeleteCategory}
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
        <Suspense fallback={<LoadingFallback />}>
          <ForecastingSystem
            isOpen={showForecasting}
            onClose={() => setShowForecasting(false)} />
        </Suspense>
      </RoleBasedComponent>

      <Suspense fallback={<LoadingFallback />}>
        <DailyDashboard
          isOpen={showDailyDashboard}
          onClose={() => setShowDailyDashboard(false)}
        />
      </Suspense>

      <RoleBasedComponent requiredPermission="canManageInventory">
        <Suspense fallback={<LoadingFallback />}>
          <ReturnsSystem
            isOpen={showReturns}
            onClose={() => setShowReturns(false)}
          />
        </Suspense>
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
        hideFloatingButton={showQuickSale || showForecasting || showDailyDashboard || showSalesHistory || showInventory || showSettings || showServers || showReturns || showAccounting}
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
          isOpen={showCategoryModal || !!editingCategory}
          onClose={handleCategoryModalClose}
          onSave={handleCategoryModalSave}
          category={editingCategory || undefined}
        />
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canViewOwnSales">
        <Suspense fallback={<LoadingFallback />}>
          <EnhancedSalesHistory
            isOpen={showSalesHistory}
            onClose={() => setShowSalesHistory(false)}
          />
        </Suspense>
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canManageInventory">
        <Suspense fallback={<LoadingFallback />}>
          <Inventory
            isOpen={showInventory}
            onClose={() => setShowInventory(false)}
          />
        </Suspense>
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canManageSettings">
        <Suspense fallback={<LoadingFallback />}>
          <Settings
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canViewAccounting">
        <Suspense fallback={<LoadingFallback />}>
          <Accounting
            isOpen={showAccounting}
            onClose={() => setShowAccounting(false)}
          />
        </Suspense>
      </RoleBasedComponent>

      <RoleBasedComponent requiredPermission="canCreateConsignment">
        <Suspense fallback={<LoadingFallback />}>
          <ConsignmentSystem
            isOpen={showConsignment}
            onClose={() => setShowConsignment(false)}
          />
        </Suspense>
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
        onShowForecasting={() => setShowForecasting(true)}
        onShowExcel={() => setShowSalesHistory(true)}
      />
    </motion.div>
  );
}

function App() {
  return (
    <NotificationsProvider>
      <StockBridgeProvider>
        <AppContent />
      </StockBridgeProvider>
    </NotificationsProvider>
  );
}

export default App;