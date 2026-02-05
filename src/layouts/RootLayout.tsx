import { Outlet, Navigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { ModalProvider, useModal } from '../context/ModalContext';
import { useStockMutations } from '../hooks/mutations/useStockMutations';
import { useNotifications } from '../components/Notifications';
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
import { GuideButton } from '../components/guide/GuideButton'; // Phase 1.5
import { GuideTourModal } from '../components/guide/GuideTourModal'; // Phase 1.5
import { OnboardingBanner } from '../components/onboarding/OnboardingBanner'; // UX Improvement 1
import { LoadingFallback } from '../components/LoadingFallback';
import { LazyLoadErrorBoundary } from '../components/LazyLoadErrorBoundary';
// import { UserManagement } from '../components/UserManagement'; // Removed
import { UpdateNotification } from '../components/UpdateNotification';
import { OfflineBanner } from '../components/OfflineBanner';

// Lazy load all modals to reduce initial bundle size (~60-80 KB savings)
const LazyProductModal = lazy(() => import('../components/ProductModal').then(m => ({ default: m.ProductModal })));
const LazyCategoryModal = lazy(() => import('../components/CategoryModal').then(m => ({ default: m.CategoryModal })));
const LazyQuickSaleFlow = lazy(() => import('../components/QuickSaleFlow').then(m => ({ default: m.QuickSaleFlow })));
const LazySupplyModal = lazy(() => import('../components/SupplyModal').then(m => ({ default: m.SupplyModal })));

function RootLayoutContent() {
  const { isAuthenticated, currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { categories, products, addCategory, updateCategory, linkCategory } = useAppContext();
  const { addSupply, createProduct } = useStockMutations(currentBar?.id || '');
  const { showNotification } = useNotifications();
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

  // 🎓 Redirection vers l'Onboarding / Formation : SUPPRIMÉE (Remplacée par WelcomeCard)
  // L'utilisateur n'est plus forcé, il est invité via le Dashboard.

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

  // Redirect super_admin to admin panel
  if (currentSession?.role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-subtle to-brand-subtle pb-16 md:pb-0">
      <OfflineBanner /> {/* Phase 1: Offline Resilience */}
      <UpdateNotification />
      <OnboardingBanner /> {/* UX Improvement 1: Show setup banner */}
      <Header
        onShowQuickSale={() => openModal('QUICK_SALE')}
        onShowProductModal={() => openModal('PRODUCT')}
        onShowCategoryModal={() => openModal('CATEGORY')}
        // onShowUserManagement removed
        onShowSupplyModal={() => openModal('SUPPLY')}
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

      <GuideButton /> {/* Phase 1.5: Floating guide button */}
      <GuideTourModal /> {/* Phase 1.5: Guide modal visible everywhere */}

      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        onShowQuickSale={() => openModal('QUICK_SALE')}
        currentMenu={''} // Placeholder
      />

      <Suspense fallback={<LoadingFallback />}>
        {modalState.type === 'PRODUCT' && (
          <LazyProductModal
            isOpen={true}
            onClose={closeModal}
            onSave={(productData) => {
              if (!currentBar) {
                showNotification('error', 'Aucun bar sélectionné');
                return;
              }
              createProduct.mutate({ ...productData, barId: currentBar.id });
              closeModal();
              showNotification('success', `Produit "${productData.name}" ajouté`);
            }}
            categories={categories}
            product={modalState.props.product}
          />
        )}
        {modalState.type === 'CATEGORY' && (
          <LazyCategoryModal
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
          <LazyQuickSaleFlow
            isOpen={true}
            onClose={closeModal}
          />
        )}
        {/* UserManagement modal removed - migrated to page */}
        {modalState.type === 'SUPPLY' && (
          <LazySupplyModal
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
