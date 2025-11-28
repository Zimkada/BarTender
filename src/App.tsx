import { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

// Components
import { SplashScreen } from './components/SplashScreen';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { Cart } from './components/Cart';
import { ProductModal } from './components/ProductModal';
import { CategoryModal } from './components/CategoryModal';
import { ServerInterface } from './components/ServerInterface';
import { LoginScreen } from './components/LoginScreen';
import { ForgotPasswordScreen } from './components/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { UserManagement } from './components/UserManagement';
import { RoleBasedComponent } from './components/RoleBasedComponent';
import { QuickSaleFlow } from './components/QuickSaleFlow';
import { MobileNavigation } from './components/MobileNavigation';
import { MobileSidebar } from './components/MobileSidebar';
import { LoadingFallback } from './components/LoadingFallback';
import { PromotionsManager } from './components/promotions/PromotionsManager';

// Context & Hooks
import { NotificationsProvider, useNotifications } from './components/Notifications';
import { useAppContext } from './context/AppContext';
import { useStockManagement } from './hooks/useStockManagement';
import { useAdminNotifications } from './hooks/useAdminNotifications';
import { useAuth } from './context/AuthContext';
import { useBarContext } from './context/BarContext';
import { syncHandler } from './services/SyncHandler';

// Types
import { CartItem, Product, Category } from './types';

// Lazy load des composants lourds
const EnhancedSalesHistory = lazy(() => import('./components/SalesHistory').then(m => ({ default: m.EnhancedSalesHistory })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const DailyDashboard = lazy(() => import('./components/DailyDashboard').then(m => ({ default: m.DailyDashboard })));
const ReturnsSystem = lazy(() => import('./components/ReturnsSystem').then(m => ({ default: m.ReturnsSystem })));
const ForecastingSystem = lazy(() => import('./components/ForecastingSystem').then(m => ({ default: m.ForecastingSystem })));
const Accounting = lazy(() => import('./components/Accounting').then(m => ({ default: m.Accounting })));
const ConsignmentSystem = lazy(() => import('./components/ConsignmentSystem').then(m => ({ default: m.ConsignmentSystem })));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard').then(m => ({ default: m.default })));
const AdminNotificationsPanel = lazy(() => import('./components/AdminNotificationsPanel').then(m => ({ default: m.default })));
const AuditLogsPanel = lazy(() => import('./components/AuditLogsPanel').then(m => ({ default: m.AuditLogsPanel })));
const BarsManagementPanel = lazy(() => import('./components/BarsManagementPanel').then(m => ({ default: m.BarsManagementPanel })));
const UsersManagementPanel = lazy(() => import('./components/UsersManagementPanel').then(m => ({ default: m.UsersManagementPanel })));
const BarStatsModal = lazy(() => import('./components/BarStatsModal').then(m => ({ default: m.BarStatsModal })));
const GlobalCatalogPanel = lazy(() => import('./components/GlobalCatalogPanel').then(m => ({ default: m.GlobalCatalogPanel })));

function AppContent() {
  const {
    categories,
    addCategory,
    linkCategory,
    updateCategory,
    deleteCategory,
    addSale,
    settings
  } = useAppContext();

  const { processSaleValidation, products, addProduct } = useStockManagement();
  const { isAuthenticated, currentSession } = useAuth();
  const { currentBar, bars } = useBarContext();
  const { showNotification } = useNotifications();

  // A.5: Notifications admin hook
  const {
    unresolvedNotifications,
    stats: notifStats,
    analyzeAllBars,
    markAsRead,
    markAllAsRead,
    markAsResolved,
    deleteNotification,
    clearAll,
  } = useAdminNotifications();

  const [isAppReady, setIsAppReady] = useState(false);
  const [showDailyDashboard, setShowDailyDashboard] = useState(false);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
  const [isProductsLoading, setIsProductsLoading] = useState(false);
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
  const currentProducts = products.filter(p => p.categoryId === activeCategory);
  const [showReturns, setShowReturns] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showForecasting, setShowForecasting] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [currentMenu, setCurrentMenu] = useState('home');
  const [showAccounting, setShowAccounting] = useState(false);
  const [showConsignment, setShowConsignment] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [showBarsManagement, setShowBarsManagement] = useState(false);
  const [showUsersManagement, setShowUsersManagement] = useState(false);
  const [showGlobalCatalog, setShowGlobalCatalog] = useState(false);
  const [showPromotionsManager, setShowPromotionsManager] = useState(false);
  const [selectedBarForStats, setSelectedBarForStats] = useState<any>(null);
  const [authView, setAuthView] = useState('login'); // 'login', 'forgotPassword', 'resetPassword'

  // Gestion du chargement initial avec SplashScreen
  useEffect(() => {
    if (isAuthenticated) {
      // Réinitialiser isAppReady à false pour afficher le SplashScreen
      setIsAppReady(false);

      // Timer de 2.5s dès la connexion réussie
      const timer = setTimeout(() => setIsAppReady(true), 2500);
      return () => clearTimeout(timer);
    } else {
      // Écran de login toujours prêt
      setIsAppReady(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  // Gérer le chargement des produits lors du changement de catégorie
  useEffect(() => {
    if (activeCategory) {
      setIsProductsLoading(true);
      // Délai réduit à 150ms pour une transition plus fluide (Option C)
      const timer = setTimeout(() => {
        setIsProductsLoading(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeCategory]);

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
      // Notification handled in AppContext
    } else {
      addCategory(categoryData);
      // Notification handled in AppContext
    }
    handleCategoryModalClose();
  };

  useEffect(() => {
    // Démarrer le processing automatique de la queue de sync
    syncHandler.start(5000); // Traiter toutes les 5 secondes

    return () => {
      syncHandler.stop();
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
    setShowConsignment(false);
    setShowGlobalCatalog(false);
    setShowPromotionsManager(false);

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
      case 'promotions':
        setShowPromotionsManager(true);
        break;
      // Le cas 'home' ne fait plus rien, car tout est déjà fermé.
      default:
        break;
    }
  };

  // Gérer la route de réinitialisation de mot de passe
  useEffect(() => {
    // Note: Ceci est une gestion de route simple. Pour une app plus complexe,
    // une librairie comme react-router-dom serait recommandée.
    if (window.location.pathname === '/reset-password') {
      setAuthView('resetPassword');
    }
  }, []);

  // Écrans d'authentification si pas connecté
  if (!isAuthenticated) {
    switch (authView) {
      case 'forgotPassword':
        return <ForgotPasswordScreen onBackToLogin={() => setAuthView('login')} />;
      case 'resetPassword':
        return <ResetPasswordScreen />;
      case 'login':
      default:
        return <LoginScreen onNavigateToForgotPassword={() => setAuthView('forgotPassword')} />;
    }
  }

  // Afficher le SplashScreen pendant le chargement initial
  if (!isAppReady) {
    return (
      <SplashScreen
        userName={currentSession?.userName}
        barName={currentBar?.name}
      />
    );
  }

  // Interface serveur simplifiée
  if (currentInterface === 'server') {
    return (
      <ServerInterface
        onSwitchToManager={() => setCurrentInterface('manager')}
      />
    );
  }

  // Interface Super Admin - Affiche directement le dashboard
  if (currentSession?.role === 'super_admin') {
    return (
      <motion.div
        className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Header
          onShowSales={() => setShowSalesHistory(true)}
          onShowSettings={() => setShowSettings(true)}
          onShowInventory={() => setShowInventory(true)}
          onShowServers={() => setShowServers(true)}
          onShowDailyDashboard={() => setShowDailyDashboard(true)}
          onShowReturns={() => setShowReturns(true)}
          onShowQuickSale={() => setShowQuickSale(true)}
          onShowAdminDashboard={() => setShowAdminDashboard(true)}
          onShowNotifications={() => setShowNotifications(true)}
          onShowGlobalCatalog={() => setShowGlobalCatalog(true)}
          unreadNotificationsCount={unresolvedNotifications.length}
          onToggleMobileSidebar={() => setShowMobileSidebar(!showMobileSidebar)}
        />

        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl p-8 text-center"
          >
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bienvenue, Super Admin</h1>
            <p className="text-gray-600 mb-6">
              Cliquez sur le bouton purple dans le header pour accéder au dashboard administrateur
            </p>
            <button
              onClick={() => setShowAdminDashboard(true)}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-shadow flex items-center gap-3 mx-auto"
            >
              <ShieldCheck className="w-6 h-6" />
              Ouvrir le Dashboard Admin
            </button>
          </motion.div>
        </div>

        {/* SuperAdminDashboard Modal */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <SuperAdminDashboard
              isOpen={showAdminDashboard}
              onClose={() => setShowAdminDashboard(false)}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Global Catalog Panel */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <GlobalCatalogPanel
              isOpen={showGlobalCatalog}
              onClose={() => setShowGlobalCatalog(false)}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Admin Notifications Panel */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <AdminNotificationsPanel
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              notifications={unresolvedNotifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onMarkAsResolved={markAsResolved}
              onDelete={deleteNotification}
              onClearAll={clearAll}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Audit Logs Panel */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <AuditLogsPanel
              isOpen={showAuditLogs}
              onClose={() => setShowAuditLogs(false)}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Bars Management Panel */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <BarsManagementPanel
              isOpen={showBarsManagement}
              onClose={() => setShowBarsManagement(false)}
              onShowBarStats={(bar) => setSelectedBarForStats(bar)}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Users Management Panel */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            <UsersManagementPanel
              isOpen={showUsersManagement}
              onClose={() => setShowUsersManagement(false)}
            />
          </Suspense>
        </RoleBasedComponent>

        {/* Bar Stats Modal */}
        <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
          <Suspense fallback={<LoadingFallback />}>
            {selectedBarForStats && (
              <BarStatsModal
                isOpen={!!selectedBarForStats}
                onClose={() => setSelectedBarForStats(null)}
                bar={selectedBarForStats}
              />
            )}
          </Suspense>
        </RoleBasedComponent>

        {/* Mobile Sidebar */}
        <MobileSidebar
          isOpen={showMobileSidebar}
          onClose={() => setShowMobileSidebar(false)}
          onNavigate={setCurrentMenu}
          currentMenu={currentMenu}
          onShowAdminDashboard={() => setShowAdminDashboard(true)}
          onShowNotifications={() => setShowNotifications(true)}
          onShowAuditLogs={() => setShowAuditLogs(true)}
          onShowBarsManagement={() => setShowBarsManagement(true)}
          onShowUsersManagement={() => setShowUsersManagement(true)}
          onShowGlobalCatalog={() => setShowGlobalCatalog(true)}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 pb-16 md:pb-0"
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
        onShowAdminDashboard={() => {
          setShowAdminDashboard(true);
          // A.5: Analyser bars quand dashboard s'ouvre
          if (currentSession?.role === 'super_admin') {
            analyzeAllBars(bars);
          }
        }}
        onShowNotifications={() => setShowNotifications(true)}
        unreadNotificationsCount={notifStats.unreadCount}
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
          isLoading={categories.length === 0}
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
              isLoading={isProductsLoading}
              categoryName={categories.find(c => c.id === activeCategory)?.name}
              onAddProduct={() => setShowProductModal(true)}
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

      <RoleBasedComponent requiredPermission="canCreateServers">
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
            console.log('[ProductModal] onSave - currentBar:', currentBar);
            if (!currentBar) {
              showNotification('error', 'Aucun bar sélectionné');
              return;
            }
            console.log('[ProductModal] Adding product with barId:', currentBar.id);
            addProduct({ ...productData, barId: currentBar.id });
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
          onLinkGlobal={linkCategory}
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

      <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
        <Suspense fallback={<LoadingFallback />}>
          <SuperAdminDashboard
            isOpen={showAdminDashboard}
            onClose={() => setShowAdminDashboard(false)}
          />
        </Suspense>
      </RoleBasedComponent>

      {/* A.5: Admin Notifications Panel */}
      <RoleBasedComponent requiredPermission="canAccessAdminDashboard">
        <Suspense fallback={<LoadingFallback />}>
          <AdminNotificationsPanel
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            notifications={unresolvedNotifications}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onMarkAsResolved={markAsResolved}
            onDelete={deleteNotification}
            onClearAll={clearAll}
          />
        </Suspense>
      </RoleBasedComponent>

      {/* Sidebar - Mobile & Desktop */}
      <MobileSidebar
        isOpen={showMobileSidebar}
        onClose={() => setShowMobileSidebar(false)}
        onNavigate={handleMobileNavigation}
        currentMenu={currentMenu}
        onShowAdminDashboard={() => setShowAdminDashboard(true)}
        onShowNotifications={() => setShowNotifications(true)}
        onShowAuditLogs={() => setShowAuditLogs(true)}
        onShowBarsManagement={() => setShowBarsManagement(true)}
        onShowUsersManagement={() => setShowUsersManagement(true)}
        onShowGlobalCatalog={() => setShowGlobalCatalog(true)}
      />

      {/* Mobile Navigation */}
      <MobileNavigation
        onShowSales={() => setShowSalesHistory(true)}
        onShowInventory={() => setShowInventory(true)}
        onShowQuickSale={() => setShowQuickSale(true)}
        onShowReturns={() => setShowReturns(true)}
        onShowForecasting={() => setShowForecasting(true)}
        onShowExcel={() => setShowSalesHistory(true)}
        onShowDashboard={() => setShowDailyDashboard(true)} // ✅ NOUVEAU
      />

      <PromotionsManager
        isOpen={showPromotionsManager}
        onClose={() => setShowPromotionsManager(false)}
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