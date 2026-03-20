import { Outlet, Navigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { ModalProvider, useModal } from '../context/ModalContext';
import { useStockMutations } from '../hooks/mutations/useStockMutations';
import { useNotifications } from '../components/Notifications';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeService } from '../services/realtime/RealtimeService';
import { broadcastService } from '../services/broadcast/BroadcastService';
import { supabase } from '../lib/supabase';
import { VersionCheckService } from '../services/versionCheck.service';
import { useRoutePreload } from '../hooks/useRoutePreload';
import { networkManager } from '../services/NetworkManager';
import { salesKeys } from '../hooks/queries/useSalesQueries';
import { stockKeys } from '../hooks/queries/useStockQueries';
import { statsKeys } from '../hooks/queries/useStatsQueries';
import { returnKeys } from '../hooks/queries/useReturnsQueries';
import { expenseKeys } from '../hooks/queries/useExpensesQueries';
import { ticketKeys } from '../hooks/queries/useTickets';
import { analyticsKeys } from '../hooks/queries/useAnalyticsQueries';

import { Header } from '../components/Header';
import { MobileNavigation } from '../components/MobileNavigation';
import { MobileSidebar } from '../components/MobileSidebar'; // NEW
import { Cart } from '../components/Cart';
// Phase 1.5 & UX Improvements - Lazy Loaded
const LazyGuideButton = lazy(() => import('../components/guide/GuideButton').then(m => ({ default: m.GuideButton })));
const LazyGuideTourModal = lazy(() => import('../components/guide/GuideTourModal').then(m => ({ default: m.GuideTourModal })));
const LazyOnboardingBanner = lazy(() => import('../components/onboarding/OnboardingBanner').then(m => ({ default: m.OnboardingBanner })));
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
  const { products, categories } = useUnifiedStock(currentBar?.id);
  const { addCategory, updateCategory, linkCategory } = useAppContext();
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

      // ✅ 1. Nettoyer React Query cache (Gérer les erreurs IDB potentielles)
      try {
        queryClient.clear();
      } catch (err) {
        console.error('[RootLayout] QueryClient clear failed:', err);
      }

      // ✅ 2. Fermer les subscriptions Realtime et Broadcast (Isolés)
      realtimeService.unsubscribeAll().catch(err =>
        console.warn('[RootLayout] Erreur lors de la fermeture Realtime:', err)
      );

      try {
        broadcastService.closeAllChannels();
      } catch (err) {
        console.warn('[RootLayout] Broadcast closure failed:', err);
      }

      // La navigation sera gérée par le Navigate ci-dessous
    }
  }, [isAuthenticated, currentSession, queryClient]);

  // 🎓 Redirection vers l'Onboarding / Formation : SUPPRIMÉE (Remplacée par WelcomeCard)
  // L'utilisateur n'est plus forcé, il est invité via le Dashboard.

  // 🔄 Heartbeat: Vérifier la validité du token toutes les 30 secondes
  useEffect(() => {
    if (!isAuthenticated || !currentSession) return;

    const heartbeatInterval = setInterval(async () => {
      // ⭐ SILENCE OFFLINE: On ne veut pas déconnecter l'utilisateur s'il est hors-ligne
      // même si le token expire (on synchronisera au retour du réseau).
      const { shouldShowBanner: isOffline } = networkManager.getDecision();
      if (isOffline) {
        console.debug('[RootLayout] Heartbeat skipped (Offline mode)');
        return;
      }

      try {
        // Vérifier si le session Supabase est toujours valide
        const { data: { session: supabaseSession }, error } = await supabase.auth.getSession();

        if (error || !supabaseSession) {
          console.warn('[RootLayout] ⚠️ Token expiré détecté lors du heartbeat');

          // Double check internet avant de paniquer
          if (!networkManager.getDecision().shouldShowBanner) {
            window.dispatchEvent(new Event('token-expired'));
          }
        }
      } catch (err) {
        console.warn('[RootLayout] Erreur lors de la vérification du heartbeat:', err);
      }
    }, 30000); // Vérifier toutes les 30 secondes

    return () => clearInterval(heartbeatInterval);
  }, [isAuthenticated, currentSession]);

  useEffect(() => {
    VersionCheckService.initialize().catch(err => {
      console.warn('[RootLayout] Erreur lors de l\'initialisation VersionCheckService:', err);
    });

    // Cleanup: arrêter la vérification si le composant se démonte
    return () => {
      VersionCheckService.stopChecking();
    };
  }, []);

  // 🔄 Vision Rayons X: Rafraîchir les données au retour du réseau ou fin de synchro
  // Invalidation ciblée métier — exclut volontairement :
  //   - offline-only queries (offline-sales-list, offline-returns-list, etc.)
  //   - quasi-statique (categories, settings, feature-flags)
  // Note: sync-completed ne porte pas de payload de types syncés,
  //   donc on invalide le même sous-ensemble métier dans les deux cas.
  useEffect(() => {
    const invalidateBusinessData = () => {
      const barId = currentBar?.id;
      if (!barId) return; // Pas de bar actif → rien à invalider

      // Ventes & stats
      queryClient.invalidateQueries({ queryKey: salesKeys.all });
      queryClient.invalidateQueries({ queryKey: statsKeys.all(barId) });

      // Stock serveur (products, supplies, consignments — PAS categories)
      queryClient.invalidateQueries({ queryKey: stockKeys.products(barId) });
      queryClient.invalidateQueries({ queryKey: stockKeys.supplies(barId) });
      queryClient.invalidateQueries({ queryKey: stockKeys.consignments(barId) });

      // Retours, dépenses (list — PAS categories), tickets
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(barId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });

      // Analytics & dérivés
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      queryClient.invalidateQueries({ queryKey: ['topProducts'] });
      queryClient.invalidateQueries({ queryKey: ['barMembers'] });

      // Clés ad hoc liées au stock/ventes
      queryClient.invalidateQueries({ queryKey: ['stale-pending-sales', barId] });
      queryClient.invalidateQueries({ queryKey: ['server-pending-sales-for-stock', barId] });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
    };

    // 1. Écouter le retour du réseau
    const unsubscribeNetwork = networkManager.subscribe((status) => {
      if (status === 'online') {
        console.log('[RootLayout] Network restored, invalidating business data...');
        invalidateBusinessData();
      }
    });

    // 2. Écouter la fin de la synchro
    const handleSyncCompleted = () => {
      console.log('[RootLayout] Sync completed, invalidating business data...');
      invalidateBusinessData();
    };

    window.addEventListener('sync-completed', handleSyncCompleted);

    return () => {
      unsubscribeNetwork();
      window.removeEventListener('sync-completed', handleSyncCompleted);
    };
  }, [queryClient, currentBar?.id]);

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
      <Suspense fallback={null}>
        <LazyOnboardingBanner /> {/* UX Improvement 1: Show setup banner */}
      </Suspense>
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

      <Suspense fallback={null}>
        <LazyGuideButton /> {/* Phase 1.5: Floating guide button */}
        <LazyGuideTourModal /> {/* Phase 1.5: Guide modal visible everywhere */}
      </Suspense>

      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        onShowQuickSale={() => openModal('QUICK_SALE')}
        currentMenu={''} // Placeholder
      />

      <LazyLoadErrorBoundary maxRetries={3}>
      <Suspense fallback={<LoadingFallback />}>
        {modalState.type === 'PRODUCT' && (
          <LazyProductModal
            isOpen={true}
            onClose={closeModal}
            onSave={async (productData) => {
              if (!currentBar) {
                showNotification('error', 'Aucun bar sélectionné');
                return;
              }
              try {
                // ✅ Attendre le résultat de la mutation avant de fermer
                await createProduct.mutateAsync({ ...productData, barId: currentBar.id });
                // ✅ Fermer APRÈS succès
                closeModal();
                // 🛡️ Pas de toast manuel — useStockMutations gère le succès
              } catch (error) {
                // 🛡️ Pas de toast manuel — useStockMutations gère l'erreur
                // Le formulaire reste ouvert pour que l'utilisateur corrige
                throw error; // Relancer pour que ProductModal sache que c'est échoué
              }
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
      </LazyLoadErrorBoundary>
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
