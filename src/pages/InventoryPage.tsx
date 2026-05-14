import { useState, Suspense, lazy, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, BarChart3, Zap, AlertCircle, ClipboardList, Folder, ArrowDownAZ, TrendingDown, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../types';

// Hooks & Context
import { useAuth } from '../context/AuthContext';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useInventoryFilter } from '../hooks/useInventoryFilter';
import { useInventoryActions } from '../hooks/useInventoryActions';
import { usePurchaseOrders } from '../hooks/queries/usePurchaseOrdersQueries';
import { useViewport } from '../hooks/useViewport';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useBarContext } from '../context/BarContext';

// Components
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { SearchBar } from '../components/common/SearchBar';


import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { InventoryList } from '../components/inventory/InventoryList';
import { InventoryExportModal } from '../components/inventory/InventoryExportModal';
import { InventoryOperations } from '../components/inventory/InventoryOperations';
import { InventoryStats } from '../components/inventory/InventoryStats';
import { PurchaseOrdersTab } from '../components/inventory/PurchaseOrdersTab';
import { OnboardingBreadcrumb } from '../components/onboarding/ui/OnboardingBreadcrumb';
import { ProductGridSkeleton } from '../components/skeletons';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
// Lazy load
const ProductModal = lazy(() => import('../components/ProductModal').then(m => ({ default: m.ProductModal })));
import { ProductHistoryModal } from '../components/inventory/ProductHistoryModal';

type ViewMode = 'products' | 'operations' | 'stats' | 'orders';
type SortMode = 'category' | 'alphabetical' | 'stock';

export default function InventoryPage() {
    const { currentBar } = useBarContext();
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const isOnboardingMode = searchParams.get('mode') === 'onboarding';
    const onboardingTask = searchParams.get('task');
    const initialTab = searchParams.get('tab') as ViewMode | null;

    // 2. Local View State
    const [viewMode, setViewMode] = useState<ViewMode>(initialTab || 'products');

    // 🛡️ Expert Fix: Active le "Lite Mode" quand on est dans l'onglet Produits
    const {
        products,
        categories,
        getProductStockInfo,
        getAverageCostPerUnit,
        getDisplayCostForProduct,
        isLoading: isLoadingProducts
    } = useUnifiedStock(currentBar?.id, { skipSupplies: viewMode === 'products' });

    const { currentSession } = useAuth();
    const { isMobile } = useViewport();
    const { formatPrice } = useCurrencyFormatter();
    const isProductImportEnabled = useFeatureFlag('product-import').data as boolean;

    // Sync viewMode with URL tab param if it changes (e.g. navigation)
    useEffect(() => {
        if (initialTab && initialTab !== viewMode) {
            setViewMode(initialTab);
        }
    }, [initialTab || viewMode]); // Adding viewMode to dependency for safety

    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('category');
    const [showAnomalies, setShowAnomalies] = useState(false); // ✨ State Filtre Anomalies
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // ✅ Fix Lint: use any for now or imported Product if available
    const [viewingHistoryProduct, setViewingHistoryProduct] = useState<any | null>(null); // ✨ State History

    const {
        sortedProducts,
        productsWithAnomalies,
        lowStockProducts,
        categoryStats,
        anomalyCount
    } = useInventoryFilter({
        products,
        categories,
        searchTerm,
        sortMode,
        showAnomaliesOnly: showAnomalies,
        barSettings: currentBar?.settings,
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

    // ✨ Handler pour l'historique
    const handleViewHistory = (product: Product) => {
        setViewingHistoryProduct(product);
    };

    // 4. Config
    const inventoryGuideId = currentSession?.role === 'gerant' ? 'manager-inventory' : 'manage-inventory';

    // Badge "Commandes" : nombre de bons de commande actifs (brouillon, en attente, partiel)
    const { data: purchaseOrders } = usePurchaseOrders(currentBar?.id);
    const activeOrdersCount = purchaseOrders?.filter(o =>
        o.status === 'draft' || o.status === 'ordered' || o.status === 'partially_received'
    ).length ?? 0;

    const tabsConfig = [
        { id: 'products', label: 'Produits', icon: Package },
        { id: 'operations', label: 'Opérations', icon: Zap },
        {
            id: 'orders',
            label: 'Commandes',
            icon: ClipboardList,
            badge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
        },
        { id: 'stats', label: 'Statistiques', icon: BarChart3 },
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
                subtitle="Catalogue, stocks et réapprovisionnement."
                icon={<Package size={24} />}
                tabs={tabsConfig}
                hideSubtitleOnMobile={true}
                activeTab={viewMode}
                onTabChange={(id) => setViewMode(id as ViewMode)}
                guideId={inventoryGuideId}
                showBack={false}
            />

            <main className="container mx-auto px-4 py-4 pb-24">
                <AnimatePresence mode={isMobile ? undefined : "wait"}>
                    {/* ONGLET PRODUITS */}
                    {viewMode === 'products' && (
                        <motion.div
                            key="products-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-4"
                            data-guide="inventory-products"
                        >
                            {/* Toolbar — search + export, puis tri/filtre */}
                            <div className="space-y-3">
                                {/* Ligne 1 : recherche + bouton Exporter sur la même ligne */}
                                <div className="flex items-center gap-2">
                                    <SearchBar
                                        value={searchTerm}
                                        onChange={setSearchTerm}
                                        placeholder={isMobile ? "Rechercher..." : "Rechercher un produit..."}
                                        className="flex-1 min-w-0"
                                    />
                                    <Button
                                        onClick={() => setIsExportModalOpen(true)}
                                        data-guide="inventory-export-btn"
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 flex-shrink-0"
                                    >
                                        <Download size={16} />
                                        <span>Exporter</span>
                                    </Button>
                                </div>

                                {/* Ligne 2 : Trier + Filtrer */}
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-micro text-gray-500 uppercase">Trier</span>
                                        <div
                                            role="radiogroup"
                                            aria-label="Mode de tri"
                                            className="inline-flex items-center p-0.5 bg-gray-100 rounded-full border border-gray-200"
                                        >
                                            {[
                                                { mode: 'category' as SortMode, Icon: Folder, label: 'Catégorie' },
                                                { mode: 'alphabetical' as SortMode, Icon: ArrowDownAZ, label: 'Nom' },
                                                { mode: 'stock' as SortMode, Icon: TrendingDown, label: 'Stock' }
                                            ].map(({ mode, Icon, label }) => {
                                                const isActive = sortMode === mode && !showAnomalies;
                                                return (
                                                    <button
                                                        key={mode}
                                                        role="radio"
                                                        aria-checked={isActive}
                                                        onClick={() => {
                                                            setSortMode(mode);
                                                            setShowAnomalies(false);
                                                        }}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption transition-all",
                                                            isActive
                                                                ? "bg-white text-brand-primary shadow-sm font-semibold"
                                                                : "text-gray-600 hover:text-gray-900 font-medium"
                                                        )}
                                                    >
                                                        <Icon size={14} />
                                                        <span>{label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-micro text-gray-500 uppercase">Filtrer</span>
                                        <button
                                            onClick={() => setShowAnomalies(!showAnomalies)}
                                            data-guide="inventory-filter-anomalies"
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption transition-all border",
                                                showAnomalies
                                                    ? "bg-red-500 text-white border-red-500 font-semibold"
                                                    : "bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:bg-red-50 font-medium"
                                            )}
                                        >
                                            <AlertCircle size={14} className={showAnomalies ? 'text-white' : 'text-red-500'} />
                                            <span>Anomalies</span>
                                            {anomalyCount > 0 && (
                                                <span className={cn(
                                                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums",
                                                    showAnomalies ? "bg-white/25" : "bg-red-100 text-red-700"
                                                )}>
                                                    {anomalyCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Liste Produits */}
                            {isLoadingProducts ? (
                                <ProductGridSkeleton count={isMobile ? 4 : 8} />
                            ) : (
                                <div data-guide="inventory-table">
                                    <InventoryList
                                        products={sortedProducts}
                                        categories={categories}
                                        getProductStockInfo={getProductStockInfo}
                                        getDisplayCostForProduct={getDisplayCostForProduct}
                                        barSettings={currentBar?.settings}
                                        onEdit={handleEditProduct}
                                        onAdjust={handleAdjustStock}
                                        onDelete={handleDeleteClick}
                                        onHistory={handleViewHistory}
                                        searchTerm={searchTerm}
                                    />
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ONGLET OPERATIONS */}
                    {viewMode === 'operations' && (
                        <motion.div
                            key="operations-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            data-guide="inventory-operations"
                        >
                            <InventoryOperations
                                getProductStockInfo={getProductStockInfo}
                                categories={categories}
                                products={products}
                                onSaveProduct={handleSaveProduct}
                                onSupply={handleSupply}
                                isProductImportEnabled={isProductImportEnabled}
                            />
                        </motion.div>
                    )}

                    {/* ONGLET COMMANDES */}
                    {viewMode === 'orders' && currentBar && (
                        <motion.div
                            key="orders-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <PurchaseOrdersTab barId={currentBar.id} />
                        </motion.div>
                    )}

                    {/* ONGLET STATISTIQUES */}
                    {viewMode === 'stats' && (
                        <motion.div
                            key="stats-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            data-guide="inventory-stats"
                        >
                            <InventoryStats
                                products={products}
                                categoryStats={categoryStats}
                                productsWithAnomalies={productsWithAnomalies}
                                lowStockCount={lowStockProducts.length}
                                onNavigateToOperations={() => setViewMode('operations')}
                                formatPrice={formatPrice}
                                barSettings={currentBar?.settings}
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
                        categories={categories}
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
            {/* Modale d'export */}
            <InventoryExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                barId={currentSession?.barId || ''}
                barName={currentSession?.barName || 'Bar'}
                products={products}
                categories={categories}
                getStockInfo={getProductStockInfo}
            />

            {/* ✨ Modale d'Historique Produit */}
            {viewingHistoryProduct && (
                <ProductHistoryModal
                    isOpen={true}
                    onClose={() => setViewingHistoryProduct(null)}
                    product={viewingHistoryProduct}
                />
            )}
        </div>
    );
}
