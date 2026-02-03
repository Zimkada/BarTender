import { useState, Suspense, lazy, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, BarChart3, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Hooks & Context
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useInventoryFilter } from '../hooks/useInventoryFilter';
import { useInventoryActions } from '../hooks/useInventoryActions';
import { useViewport } from '../hooks/useViewport';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';

// Components
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { SearchBar } from '../components/common/SearchBar';


import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { InventoryList } from '../components/inventory/InventoryList';
import { InventoryOperations } from '../components/inventory/InventoryOperations';
import { InventoryStats } from '../components/inventory/InventoryStats';
import { OnboardingBreadcrumb } from '../components/onboarding/ui/OnboardingBreadcrumb';
import { ProductGridSkeleton } from '../components/skeletons';

// Lazy load
const ProductModal = lazy(() => import('../components/ProductModal').then(m => ({ default: m.ProductModal })));

type ViewMode = 'products' | 'operations' | 'stats';
type SortMode = 'category' | 'alphabetical' | 'stock';

export default function InventoryPage() {
    // 1. Core Data
    const { products, getProductStockInfo, getAverageCostPerUnit, isLoadingProducts } = useStockManagement();
    const { categories } = useAppContext();
    const { currentSession } = useAuth();
    const { isMobile } = useViewport();
    const { formatPrice } = useCurrencyFormatter();
    const isProductImportEnabled = useFeatureFlag('product-import').data as boolean;

    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const isOnboardingMode = searchParams.get('mode') === 'onboarding';
    const onboardingTask = searchParams.get('task');
    const initialTab = searchParams.get('tab') as ViewMode | null;

    // 2. Local View State
    const [viewMode, setViewMode] = useState<ViewMode>(initialTab || 'products');

    // Sync viewMode with URL tab param if it changes (e.g. navigation)
    useEffect(() => {
        if (initialTab && initialTab !== viewMode) {
            setViewMode(initialTab);
        }
    }, [initialTab]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('category');

    // 3. Logic Hooks
    const {
        sortedProducts,
        lowStockProducts,
        categoryStats
    } = useInventoryFilter({
        products,
        categories,
        searchTerm,
        sortMode,
        getProductStockInfo
    });

    const {
        // Modal States
        showProductModal, setShowProductModal,
        showStockAdjustmentModal, setShowStockAdjustmentModal,
        editingProduct, setEditingProduct,
        adjustingProduct, setAdjustingProduct,
        productToDelete, setProductToDelete,
        isDeleting,

        // Actions

        handleEditProduct,
        handleSaveProduct,
        handleAdjustStock,
        handleAdjustmentSubmit,
        handleDeleteClick,
        handleDeleteConfirm,
        handleSupply
    } = useInventoryActions();

    // 4. Config
    const inventoryGuideId = currentSession?.role === 'gerant' ? 'manager-inventory' : 'manage-inventory';

    const tabsConfig = [
        { id: 'products', label: isMobile ? 'Produits' : 'Mes Produits', icon: Package },
        { id: 'operations', label: 'Opérations', icon: Zap },
        { id: 'stats', label: 'Statistiques', icon: BarChart3 }
    ];

    return (
        <div className="min-h-screen bg-[var(--brand-bg-subtle)]">
            {isOnboardingMode && (
                <OnboardingBreadcrumb
                    currentStep={
                        onboardingTask === 'add-products' ? 'Ajouter des Produits' :
                            onboardingTask === 'init-stock' ? 'Initialiser le Stock' :
                                'Configuration'
                    }
                    onBackToOnboarding={() => navigate('/onboarding')}
                />
            )}
            {/* Header */}
            <TabbedPageHeader
                title="Inventaire"
                subtitle="Gestion globale du catalogue, suivi des stocks en temps réel et alertes de réapprovisionnement."
                icon={<Package size={24} />}
                tabs={tabsConfig}
                hideSubtitleOnMobile={true}
                activeTab={viewMode}
                onTabChange={(id) => setViewMode(id as ViewMode)}
                guideId={inventoryGuideId}
            />

            <main className="container mx-auto px-4 py-4 pb-24">
                <AnimatePresence mode={isMobile ? undefined : "wait"}>
                    {/* ONGLET PRODUITS */}
                    {viewMode === 'products' && (
                        <motion.div
                            key="products-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {/* Toolbar (Search & Sort) */}
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
                                <SearchBar
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    placeholder="Rechercher un produit..."
                                    className="flex-1"
                                />
                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide sm:pb-0">
                                    {[
                                        { mode: 'category' as SortMode, icon: '📁', label: 'Catégorie' },
                                        { mode: 'alphabetical' as SortMode, icon: '🔤', label: 'Nom' },
                                        { mode: 'stock' as SortMode, icon: '⚠️', label: 'Stock' }
                                    ].map(({ mode, icon, label }) => (
                                        <button
                                            key={mode}
                                            onClick={() => setSortMode(mode)}
                                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-semibold transition-all border flex items-center gap-1.5 ${sortMode === mode
                                                ? 'glass-action-button-active-2026 shadow-sm'
                                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                }`}
                                        >
                                            <span>{icon}</span>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Liste Produits */}
                            {isLoadingProducts ? (
                                <ProductGridSkeleton count={isMobile ? 4 : 8} />
                            ) : (
                                <InventoryList
                                    products={sortedProducts}
                                    categories={categories}
                                    getProductStockInfo={getProductStockInfo}
                                    getAverageCostPerUnit={getAverageCostPerUnit}
                                    onEdit={handleEditProduct}
                                    onAdjust={handleAdjustStock}
                                    onDelete={handleDeleteClick}
                                    searchTerm={searchTerm}
                                />
                            )}
                        </motion.div>
                    )}

                    {/* ONGLET OPERATIONS */}
                    {viewMode === 'operations' && (
                        <motion.div
                            key="operations-view"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <InventoryOperations
                                lowStockProducts={lowStockProducts}
                                getProductStockInfo={getProductStockInfo}
                                categories={categories}
                                products={products}
                                onSaveProduct={handleSaveProduct}
                                onSupply={handleSupply}
                                isProductImportEnabled={isProductImportEnabled}
                            />
                        </motion.div>
                    )}

                    {/* ONGLET STATISTIQUES */}
                    {viewMode === 'stats' && (
                        <motion.div
                            key="stats-view"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                        >
                            <InventoryStats
                                products={products}
                                categoryStats={categoryStats}
                                lowStockProducts={lowStockProducts}
                                onNavigateToOperations={() => setViewMode('operations')}
                                formatPrice={formatPrice}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Modales (Globales) */}
            <Suspense fallback={null}>
                {/* Modale d'Édition (Utilisée depuis la liste) */}
                {showProductModal && editingProduct && (
                    <ProductModal
                        isOpen={true}
                        onClose={() => {
                            setShowProductModal(false);
                            setEditingProduct(undefined);
                        }}
                        onSave={handleSaveProduct}
                        categories={categories}
                        product={editingProduct}
                    />
                )}

                {/* Modale d'Ajustement Stock */}
                {showStockAdjustmentModal && adjustingProduct && (
                    <StockAdjustmentModal
                        isOpen={true}
                        onClose={() => {
                            setShowStockAdjustmentModal(false);
                            setAdjustingProduct(undefined);
                        }}
                        onSave={handleAdjustmentSubmit}
                        product={adjustingProduct}
                    />
                )}

                {/* Modale de Confirmation Suppression */}
                <ConfirmationModal
                    isOpen={!!productToDelete}
                    onClose={() => setProductToDelete(null)}
                    onConfirm={handleDeleteConfirm}
                    title="Supprimer le produit"
                    message={`Êtes-vous sûr de vouloir supprimer ${productToDelete?.name} ? Cette action est irréversible.`}
                    confirmLabel="Supprimer"
                    isDestructive={true}
                    isLoading={isDeleting}
                />
            </Suspense>
        </div>
    );
}
