import { Outlet, Navigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useActingAs } from '../context/ActingAsContext';
import { ModalProvider, useModal } from '../context/ModalContext';
import { useStockMutations } from '../hooks/mutations/useStockMutations';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService } from '../services/realtime/RealtimeService';
import { broadcastService } from '../services/broadcast/BroadcastService';
import { supabase } from '../lib/supabase';
import { VersionCheckService } from '../services/versionCheck.service';
import { useRoutePreload } from '../hooks/useRoutePreload';

import { Header } from '../components/Header';
import { MobileNavigation } from '../components/MobileNavigation';
import { MobileSidebar } from '../components/MobileSidebar'; // NEW
import { Cart } from '../components/Cart';
import { LoadingFallback } from '../components/LoadingFallback';
import { LazyLoadErrorBoundary } from '../components/LazyLoadErrorBoundary';
import { ProductModal } from '../components/ProductModal';
import { CategoryModal } from '../components/CategoryModal';
import { QuickSaleFlow } from '../components/QuickSaleFlow';
// import { UserManagement } from '../components/UserManagement'; // Removed
import { SupplyModal } from '../components/SupplyModal';
import { Category } from '../types';
import { ActingAsBar } from '../components/ActingAsBar';
import { UpdateNotification } from '../components/UpdateNotification';

const LazyBarStatsModal = lazy(() => import('../components/BarStatsModal').then(m => ({ default: m.BarStatsModal })));

function RootLayoutContent() {
  const { isAuthenticated, currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { categories, products, addProduct, addCategory, updateCategory, linkCategory, showNotification } = useAppContext();
  const { addSupply } = useStockMutations(currentBar?.id || '');
  const { isActingAs } = useActingAs();
  const queryClient = useQueryClient();

  const { modalState, openModal, closeModal } = useModal();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // NEW

  // 📦 Préchargement des pages critiques pour les utilisateurs bar
  useRoutePreload([
    () => import('../pages/DashboardPage'),
    () => import('../pages/InventoryPage'),
    () => import('../pages/SalesHistoryPage'),
    () => import('../pages/AccountingPage'),
    () => import('../pages/AnalyticsPage'),
  ], isAuthenticated && !!currentBar);

  // 🔐 Redirection automatique et nettoyage en cas de perte de session
  useEffect(() => {
    if (!isAuthenticated || !currentSession) {
      console.log('[RootLayout] Session perdue, nettoyage et redirection vers login');

      // ✅ 1. Nettoyer React Query cache
      queryClient.clear();

      // ✅ 2. Fermer les subscriptions Realtime et Broadcast
      realtimeService.unsubscribeAll().catch(err =>
        console.warn('[RootLayout] Erreur lors de la fermeture Realtime:', err)
      );
      broadcastService.closeAllChannels();

      // La navigation sera gérée par le Navigate ci-dessous
    }
  }, [isAuthenticated, currentSession, queryClient]);

  // 🔄 Heartbeat: Vérifier la validité du token toutes les 30 secondes
  useEffect(() => {
    if (!isAuthenticated || !currentSession) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        // Vérifier si le session Supabase est toujours valide
        const { data: { session: supabaseSession }, error } = await supabase.auth.getSession();

        if (!supabaseSession || error) {
          console.warn('[RootLayout] ⚠️ Token expiré détecté lors du heartbeat');

          // Dispatcher un événement custom que AuthContext va écouter
          window.dispatchEvent(new Event('token-expired'));
        }
      } catch (err) {
        console.warn('[RootLayout] Erreur lors de la vérification du heartbeat:', err);
      }
    }, 30000); // Vérifier toutes les 30 secondes

    return () => clearInterval(heartbeatInterval);
  }, [isAuthenticated, currentSession]);

  // 🔄 Initialiser la vérification de version au démarrage de l'app
  useEffect(() => {
    VersionCheckService.initialize().catch(err => {
      console.warn('[RootLayout] Erreur lors de l\'initialisation VersionCheckService:', err);
    });

    // Cleanup: arrêter la vérification si le composant se démonte
    return () => {
      VersionCheckService.stopChecking();
    };
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // Allow super_admin to access this layout if they're currently acting as another user
  if (currentSession?.role === 'super_admin' && !isActingAs()) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 pb-16 md:pb-0">
      <UpdateNotification />
      <ActingAsBar />
      <Header
        onShowQuickSale={() => openModal('QUICK_SALE')}
        onShowProductModal={() => openModal('PRODUCT')}
        onShowCategoryModal={() => openModal('CATEGORY')}
        // onShowUserManagement removed
        onShowSupplyModal={() => openModal('SUPPLY')}
        onShowBarStatsModal={(bar) => openModal('BAR_STATS', { bar })}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} // NEW
      />
      <main className="container mx-auto px-3 md:px-4 py-4 md:py-6">
        <LazyLoadErrorBoundary maxRetries={3}>
          <Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </Suspense>
        </LazyLoadErrorBoundary>
      </main>
      <MobileNavigation
        onShowQuickSale={() => openModal('QUICK_SALE')}
      />
      <Cart
        isOpen={isCartOpen}
        onToggle={() => setIsCartOpen(!isCartOpen)}
      />

      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        onShowQuickSale={() => openModal('QUICK_SALE')}
        currentMenu={''} // Placeholder
      />

      <Suspense fallback={<LoadingFallback />}>
        {modalState.type === 'PRODUCT' && (
          <ProductModal
            isOpen={true}
            onClose={closeModal}
            onSave={(productData) => {
              if (!currentBar) {
                showNotification('error', 'Aucun bar sélectionné');
                return;
              }
              addProduct({ ...productData, barId: currentBar.id });
              closeModal();
              showNotification('success', `Produit "${productData.name}" ajouté`);
            }}
            categories={categories}
            product={modalState.props.product}
          />
        )}
        {modalState.type === 'CATEGORY' && (
          <CategoryModal
            isOpen={true}
            onClose={closeModal}
            onSave={(categoryData) => {
              if (modalState.props.category) {
                updateCategory(modalState.props.category.id, categoryData);
              } else {
                addCategory(categoryData);
              }
              closeModal();
            }}
            onLinkGlobal={linkCategory}
            category={modalState.props.category}
          />
        )}
        {modalState.type === 'QUICK_SALE' && (
          <QuickSaleFlow
            isOpen={true}
            onClose={closeModal}
          />
        )}
        {/* UserManagement modal removed - migrated to page */}
        {modalState.type === 'SUPPLY' && (
          <SupplyModal
            isOpen={true}
            onClose={closeModal}
            products={products}
            onSave={(supplyData) => {
              if (!currentBar || !currentSession) {
                showNotification('error', 'Session ou bar non valide.');
                return;
              }
              addSupply.mutate({
                bar_id: currentBar.id,
                product_id: supplyData.productId,
                quantity: supplyData.quantity,
                lot_price: supplyData.lotPrice,
                lot_size: supplyData.lotSize,
                supplier: supplyData.supplier,
                created_by: currentSession.userId,
              });
            }}
          />
        )}
        {modalState.type === 'BAR_STATS' && (
          <LazyBarStatsModal
            isOpen={true}
            onClose={closeModal}
            bar={modalState.props.bar}
          />
        )}
      </Suspense>
    </div>
  );
}

export function RootLayout() {
  return (
    <ModalProvider>
      <RootLayoutContent />
    </ModalProvider>
  );
}
