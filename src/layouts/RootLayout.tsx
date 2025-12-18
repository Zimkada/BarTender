import { Outlet, Navigate } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useAppContext } from '../context/AppContext';
import { useActingAs } from '../context/ActingAsContext';
import { ModalProvider, useModal } from '../context/ModalContext';
import { useStockMutations } from '../hooks/mutations/useStockMutations';

import { Header } from '../components/Header';
import { MobileNavigation } from '../components/MobileNavigation';
import { MobileSidebar } from '../components/MobileSidebar'; // NEW
import { Cart } from '../components/Cart';
import { LoadingFallback } from '../components/LoadingFallback';
import { ProductModal } from '../components/ProductModal';
import { CategoryModal } from '../components/CategoryModal';
import { QuickSaleFlow } from '../components/QuickSaleFlow';
// import { UserManagement } from '../components/UserManagement'; // Removed
import { SupplyModal } from '../components/SupplyModal';
import { Category } from '../types';
import { ActingAsBar } from '../components/ActingAsBar';

const LazyBarStatsModal = lazy(() => import('../components/BarStatsModal').then(m => ({ default: m.BarStatsModal })));

function RootLayoutContent() {
  const { isAuthenticated, currentSession } = useAuth();
  const { currentBar } = useBarContext();
  const { categories, products, addProduct, addCategory, updateCategory, linkCategory, showNotification } = useAppContext();
  const { addSupply } = useStockMutations(currentBar?.id || '');
  const { isActingAs } = useActingAs();

  const { modalState, openModal, closeModal } = useModal();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // NEW

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // Allow super_admin to access this layout if they're currently acting as another user
  if (currentSession?.role === 'super_admin' && !isActingAs()) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 pb-16 md:pb-0">
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
        <Outlet />
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
