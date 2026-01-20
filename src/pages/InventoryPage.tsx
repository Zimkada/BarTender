import { useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, AlertTriangle, Plus, Edit, Trash2, UploadCloud, TruckIcon, BarChart3 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useStockAdjustment } from '../hooks/mutations/useStockAdjustment';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { Product } from '../types';
import { motion } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useBarContext } from '../context/BarContext';

// Lazy load heavy modals to reduce initial bundle size (~40-50 KB savings)
const ProductModal = lazy(() => import('../components/ProductModal').then(m => ({ default: m.ProductModal })));
const SupplyModal = lazy(() => import('../components/SupplyModal').then(m => ({ default: m.SupplyModal })));
const ProductImport = lazy(() => import('../components/ProductImport').then(m => ({ default: m.ProductImport })));

// Import StockAdjustmentModal directly (lighter component, used frequently)
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { searchProducts } from '../utils/productFilters';
import { sortProducts, SortMode } from '../utils/productSorting';
import { SearchBar } from '../components/common/SearchBar';
import { CollapsibleSection } from '../components/common/CollapsibleSection';
import { CategoryStatsList } from '../components/common/CategoryStatsList';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
// import { useAutoGuide } from '../hooks/useGuideTrigger'; // removed
import { GuideHeaderButton } from '../components/guide/GuideHeaderButton';
import { ComplexPageHeader } from '../components/common/PageHeader/patterns/ComplexPageHeader';
import { useOnboarding } from '../context/OnboardingContext';
import { useGuide } from '../context/GuideContext';
import { useAuth } from '../context/AuthContext';
import { CatalogContributionBadge } from '../components/products/CatalogContributionBadge';
// Duplicate import removed

/**
 * InventoryPage - Page de gestion des produits
 * Route: /inventory
 * Refactoré de modale vers page
 */
export default function InventoryPage() {
    const navigate = useNavigate();
    const { categories, getAverageCostPerUnit, addExpense } = useAppContext();
    const { currentBar } = useBarContext();
    const {
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        getProductStockInfo,
        processSupply,
    } = useStockManagement();

    const { isComplete: onboardingComplete } = useOnboarding();
    const { hasCompletedGuide } = useGuide();
    const { currentSession } = useAuth();

    // Guide ID for inventory (Propriétaire and Gérant)
    // Auto-guide disabled in favor of manual trigger via header button
    const canSeeInventoryGuide = currentSession?.role === 'promoteur' || currentSession?.role === 'gerant';
    const inventoryGuideId = currentSession?.role === 'gerant' ? 'manager-inventory' : 'manage-inventory';

    // useAutoGuide disabled - using GuideHeaderButton in page header instead
    // useAutoGuide(
    //     inventoryGuideId,
    //     onboardingComplete && canSeeInventoryGuide && !hasCompletedGuide(inventoryGuideId),
    //     { delay: 2000 }
    // );

    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();
    const { showSuccess } = useFeedback();
    const stockAdjustmentMutation = useStockAdjustment();

    const [showProductModal, setShowProductModal] = useState(false);
    const [showSupplyModal, setShowSupplyModal] = useState(false);
    const [showProductImport, setShowProductImport] = useState(false);
    const [showStockAdjustmentModal, setShowStockAdjustmentModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | undefined>();
    const [adjustingProduct, setAdjustingProduct] = useState<Product | undefined>();

    // 2. UTILISATION DU HOOK POUR LE FEATURE FLAG
    const isProductImportEnabled = useFeatureFlag('product-import').data as boolean;
    // États pour confirmation suppression
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // États pour recherche et tri
    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('category');

    const lowStockProducts = useMemo(() =>
        products.filter(p => {
            const stockInfo = getProductStockInfo(p.id);
            const stockToCompare = stockInfo ? stockInfo.availableStock : p.stock;
            return stockToCompare <= p.alertThreshold;
        }),
        [products, getProductStockInfo]);

    const filteredProducts = useMemo(
        () => !searchTerm.trim() ? products : searchProducts(products, searchTerm),
        [products, searchTerm]
    );

    const sortedProducts = useMemo(
        () => sortProducts(filteredProducts, sortMode, categories),
        [filteredProducts, sortMode, categories]
    );

    const categoryStats = useMemo(() => {
        return categories.map(cat => {
            const catProducts = products.filter(p => p.categoryId === cat.id);
            const catAlerts = catProducts.filter(p => {
                const stockInfo = getProductStockInfo(p.id);
                const stockToCompare = stockInfo ? stockInfo.availableStock : p.stock;
                return stockToCompare <= p.alertThreshold;
            });
            return {
                categoryId: cat.id,
                categoryName: cat.name,
                categoryColor: cat.color,
                totalProducts: catProducts.length,
                alertsCount: catAlerts.length
            };
        }).filter(stat => stat.totalProducts > 0);
    }, [products, categories, getProductStockInfo]);

    const alertsDefaultOpen = lowStockProducts.length > 0 && lowStockProducts.length < 4;

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        setShowProductModal(true);
    };

    const handleDeleteClick = (product: Product) => {
        setProductToDelete(product);
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        setIsDeleting(true);
        try {
            await deleteProduct(productToDelete.id);
            showSuccess('Produit supprimé');
            setProductToDelete(null);
        } catch (error) {
            console.error('Erreur suppression:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleAdjustStock = (product: Product) => {
        setAdjustingProduct(product);
        setShowStockAdjustmentModal(true);
    };

    const handleAdjustmentSubmit = async (adjustmentData: {
        productId: string;
        delta: number;
        reason: string;
        notes?: string;
    }) => {
        if (!adjustingProduct || !currentBar || !currentSession) return;

        try {
            await stockAdjustmentMutation.mutateAsync({
                productId: adjustmentData.productId,
                productName: adjustingProduct.name,
                oldStock: adjustingProduct.stock,
                newStock: adjustingProduct.stock + adjustmentData.delta,
                delta: adjustmentData.delta,
                reason: adjustmentData.reason,
                notes: adjustmentData.notes,
                barId: currentBar.id,
                barName: currentBar.name,
                userId: currentSession.userId,
                userName: currentSession.userName,
                userRole: currentSession.role
            });
            showSuccess('Stock ajusté avec succès');
            setShowStockAdjustmentModal(false);
            setAdjustingProduct(undefined);
        } catch (error: any) {
            console.error('Erreur ajustement stock:', error);
            throw error;
        }
    };

    const handleAddProduct = () => {
        setEditingProduct(undefined);
        setShowProductModal(true);
    };

    const handleSupply = async (supplyData: {
        productId: string;
        quantity: number;
        lotSize: number;
        lotPrice: number;
        supplier: string;
    }) => {
        try {
            await processSupply(supplyData, (expenseData) => {
                addExpense(expenseData);
            });
            showSuccess('Approvisionnement effectué avec succès');
            setShowSupplyModal(false);
        } catch (error) {
            console.error('Erreur approvisionnement:', error);
        }
    };

    const getCategoryName = (categoryId: string) => {
        return categories.find(cat => cat.id === categoryId)?.name || 'Sans catégorie';
    };

    const getMargin = (product: Product) => {
        const avgCost = getAverageCostPerUnit(product.id);
        if (avgCost === 0) return 0;
        return ((product.price - avgCost) / product.price) * 100;
    };

    // ========== VERSION MOBILE ==========
    if (isMobile) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
                {/* Header fixe */}
                {/* Header fixe */}
                <div className="sticky top-0 z-10">
                    {/* Header Orange (Actions Principales) */}
                    <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white shadow-sm">
                        <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(-1)}
                                    className="rounded-lg hover:bg-white/20"
                                >
                                    <ArrowLeft size={20} />
                                </Button>
                                <h1 className="text-lg font-bold flex items-center gap-2">
                                    <Package size={20} />
                                    Inventaire
                                </h1>
                            </div>
                            <div className="flex items-center gap-1">
                                {canSeeInventoryGuide && inventoryGuideId && (
                                    <GuideHeaderButton guideId={inventoryGuideId} variant="compact" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Toolbar Blanche (Actions & Recherche) */}
                    <div className="bg-white border-b border-gray-200 shadow-sm p-3 space-y-3">
                        {/* Ligne 0: Actions Principales (Unifiées) */}
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                onClick={handleAddProduct}
                                className="bg-amber-500 hover:bg-amber-600 text-white border-0 h-9 rounded-lg flex items-center justify-center gap-1.5 px-1 shadow-sm transition-all active:scale-95"
                            >
                                <Plus size={16} />
                                <span className="text-[11px] font-bold uppercase tracking-tight">Ajouter</span>
                            </Button>

                            {isProductImportEnabled && (
                                <Button
                                    onClick={() => setShowProductImport(true)}
                                    variant="secondary"
                                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 h-9 rounded-lg flex items-center justify-center gap-1.5 px-1 transition-all active:scale-95"
                                >
                                    <UploadCloud size={16} />
                                    <span className="text-[11px] font-bold uppercase tracking-tight">Importer</span>
                                </Button>
                            )}

                            <Button
                                onClick={() => setShowSupplyModal(true)}
                                variant="secondary"
                                className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-100 h-9 rounded-lg flex items-center justify-center gap-1.5 px-1 transition-all active:scale-95"
                            >
                                <TruckIcon size={16} />
                                <span className="text-[11px] font-bold uppercase tracking-tight">Approvisionner</span>
                            </Button>
                        </div>

                        {/* Ligne 1: Recherche */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <SearchBar
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    placeholder="Rechercher un produit..."
                                    className="w-full bg-gray-50 border-gray-200 focus:bg-white h-10"
                                />
                            </div>
                        </div>

                        {/* Ligne 2: Tris (Horizontal Scroll) */}
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            {[
                                { mode: 'category' as SortMode, icon: '📁', label: 'Par Catégorie' },
                                { mode: 'alphabetical' as SortMode, icon: '🔤', label: 'Alphabétique' },
                                { mode: 'stock' as SortMode, icon: '⚠️', label: 'Par Stock' }
                            ].map(({ mode, icon, label }) => (
                                <button
                                    key={mode}
                                    onClick={() => setSortMode(mode)}
                                    className={`px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-medium transition-colors border flex items-center gap-1.5 ${sortMode === mode
                                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    <span>{icon}</span>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Contenu */}
                <div className="px-4 py-4 pb-20">
                    <div className="space-y-3 mb-4">
                        <CollapsibleSection
                            title="Nombre Produits"
                            icon={<BarChart3 size={16} className="text-amber-600" />}
                            badge={`${sortedProducts.length}/${products.length}`}
                            defaultOpen={false}
                        >
                            <CategoryStatsList stats={categoryStats} showAlerts={false} />
                        </CollapsibleSection>

                        {lowStockProducts.length === 0 ? (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                <p className="text-green-700 text-xs font-medium">✅ Tous les stocks sont OK</p>
                            </div>
                        ) : (
                            <CollapsibleSection
                                title="Alertes"
                                icon={<AlertTriangle size={16} className="text-orange-600" />}
                                badge={lowStockProducts.length}
                                defaultOpen={alertsDefaultOpen}
                                className="border-orange-200"
                            >
                                <div className="space-y-1.5">
                                    {lowStockProducts.map(product => {
                                        const stockInfo = getProductStockInfo(product.id);
                                        return (
                                            <div key={product.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                                                <span className="text-xs text-gray-700">
                                                    {product.name} {product.volume && `(${product.volume})`}
                                                </span>
                                                <span className="text-xs font-medium text-orange-600">
                                                    {stockInfo?.availableStock ?? 'N/A'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>
                        )}
                    </div>

                    {/* Liste produits */}
                    {sortedProducts.length === 0 ? (
                        <EmptyState
                            icon={Package}
                            message="Aucun produit trouvé"
                            subMessage={searchTerm ? "Essayez une autre recherche" : "Aucun produit dans l'inventaire"}
                        />
                    ) : (
                        <div className="space-y-3">
                            {sortedProducts.map((product) => {
                                const avgCost = getAverageCostPerUnit(product.id);
                                const margin = getMargin(product);
                                const stockInfo = getProductStockInfo(product.id);

                                return (
                                    <div key={product.id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="p-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-gray-800 text-base mb-1">{product.name}</h3>
                                                    <p className="text-gray-600 text-sm">{product.volume}</p>
                                                    <p className="text-gray-500 text-xs mt-1">{getCategoryName(product.categoryId)}</p>
                                                    {product.globalProductId && (
                                                        <div className="mt-2">
                                                            <CatalogContributionBadge
                                                                globalProductId={product.globalProductId}
                                                                barName={currentBar?.name}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`flex-shrink-0 text-right`}>
                                                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${(stockInfo?.availableStock ?? 0) <= product.alertThreshold
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                        {stockInfo?.physicalStock ?? 'N/A'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Vendable: {stockInfo?.availableStock ?? 'N/A'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-3 mb-3">
                                                <div className="bg-white rounded-lg p-2">
                                                    <p className="text-xs text-gray-600 mb-1">Prix vente</p>
                                                    <p className="text-amber-600 font-bold text-sm">{formatPrice(product.price)}</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-2">
                                                    <p className="text-xs text-gray-600 mb-1">Coût moy.</p>
                                                    <p className="text-gray-800 font-bold text-sm">
                                                        {avgCost > 0 ? formatPrice(avgCost) : '-'}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-2">
                                                    <p className="text-xs text-gray-600 mb-1">Marge</p>
                                                    <p className={`font-bold text-sm ${margin > 50 ? 'text-green-600' : margin > 30 ? 'text-amber-600' : 'text-red-600'
                                                        }`}>
                                                        {margin > 0 ? `${margin.toFixed(1)}%` : '-'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => handleEditProduct(product)}
                                                    className="flex-1 text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    <Edit size={16} className="mr-2" />
                                                    Modifier
                                                </Button>
                                                <Button
                                                    onClick={() => handleAdjustStock(product)}
                                                    className="flex-1 text-sm font-medium flex items-center justify-center gap-2"
                                                    style={{ backgroundColor: '#3b82f6', color: 'white' }}
                                                >
                                                    <BarChart3 size={16} />
                                                    Ajuster
                                                </Button>
                                                <Button
                                                    onClick={() => handleDeleteClick(product)}
                                                    variant="destructive"
                                                    className="text-sm font-medium"
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Modales */}
                <Suspense fallback={null}>
                    <ProductImport isOpen={showProductImport} onClose={() => setShowProductImport(false)} />
                    <ProductModal
                        isOpen={showProductModal}
                        onClose={() => setShowProductModal(false)}
                        onSave={(productData) => {
                            if (editingProduct) {
                                updateProduct(editingProduct.id, { ...productData, barId: editingProduct.barId });
                            } else {
                                addProduct({ ...productData, barId: currentBar?.id || '' });
                            }
                            setShowProductModal(false);
                        }}
                        categories={categories}
                        product={editingProduct}
                    />
                    <SupplyModal
                        isOpen={showSupplyModal}
                        onClose={() => setShowSupplyModal(false)}
                        onSave={handleSupply}
                        products={products}
                    />
                </Suspense>

                {/* Stock Adjustment Modal - not lazy loaded for immediate visibility */}
                {adjustingProduct && (
                    <StockAdjustmentModal
                        isOpen={showStockAdjustmentModal}
                        onClose={() => setShowStockAdjustmentModal(false)}
                        onSave={handleAdjustmentSubmit}
                        product={adjustingProduct}
                    />
                )}

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
            </div>
        );
    }

    // ========== VERSION DESKTOP ==========
    return (
        <div className="max-w-7xl mx-auto">
            {/* Header Standardisé */}
            <ComplexPageHeader
                title="Inventaire"
                subtitle="Gestion des produits"
                icon={<Package size={28} />}
                guideId={inventoryGuideId}
                actions={
                    <>
                        {isProductImportEnabled && (
                            <Button
                                onClick={() => setShowProductImport(true)}
                                variant="ghost"
                                className="text-white hover:bg-white/20"
                                title="Importer"
                                data-guide="inventory-import-btn"
                            >
                                <UploadCloud size={18} className="mr-2 hidden sm:block" />
                                <span className="text-sm font-medium">Importer</span>
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowSupplyModal(true)}
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                            title="Approvisionnement"
                            data-guide="inventory-supply-btn"
                        >
                            <TruckIcon size={18} className="mr-2 hidden sm:block" />
                            <span className="text-sm font-medium">Approvisionnement</span>
                        </Button>
                        <Button
                            onClick={handleAddProduct}
                            variant="default"
                            className="bg-white text-amber-600 hover:bg-amber-50"
                        >
                            <Plus size={18} className="mr-2 hidden sm:block" />
                            <span className="text-sm font-medium">Ajouter produit</span>
                        </Button>
                    </>
                }
            />

            {/* Toolbar filtres & recherche (Desktop) */}
            <div className="bg-white border-b border-gray-100 p-4 shadow-sm mb-6 rounded-b-xl mx-4 lg:mx-8 -mt-4 relative z-10" data-guide="inventory-search">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                        <div className="relative flex-1 max-w-md">
                            <SearchBar
                                value={searchTerm}
                                onChange={setSearchTerm}
                                placeholder="Rechercher par nom, catégorie..."
                                className="w-full pl-10"
                            />
                        </div>
                        {/* Filtres de tri */}
                        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg">
                            {[
                                { mode: 'category' as SortMode, icon: '📁', label: 'Catégorie' },
                                { mode: 'alphabetical' as SortMode, icon: '🔤', label: 'Nom' },
                                { mode: 'stock' as SortMode, icon: '⚠️', label: 'Stock' }
                            ].map(({ mode, icon, label }) => (
                                <Button
                                    key={mode}
                                    onClick={() => setSortMode(mode)}
                                    variant={sortMode === mode ? 'default' : 'ghost'}
                                    size="sm"
                                    className={`text-xs ${sortMode === mode ? '' : 'text-gray-600 hover:text-gray-900'}`}
                                >
                                    <span className="mr-2">{icon}</span>
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Stats rapides */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span>{lowStockProducts.length} alerte(s)</span>
                        </div>
                        <div className="w-px h-4 bg-gray-200"></div>
                        <div>
                            Valeur: {formatPrice(products.reduce((acc, p) => acc + (p.price * p.stock), 0))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats et alertes */}
            <div className="space-y-4 mb-6">
                <div data-guide="inventory-categories">
                    <CollapsibleSection
                        title="Nombre de produits par catégorie"
                        icon={<BarChart3 size={18} className="text-amber-600" />}
                        badge={`${sortedProducts.length}/${products.length} produits`}
                        defaultOpen={false}
                    >
                        <CategoryStatsList stats={categoryStats} showAlerts={false} />
                    </CollapsibleSection>
                </div>

                {lowStockProducts.length === 0 ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <p className="text-green-700 text-sm font-medium">✅ Tous les stocks sont OK</p>
                    </div>
                ) : (
                    <div data-guide="inventory-alerts">
                        <CollapsibleSection
                            title="Alertes Stock"
                            icon={<AlertTriangle size={18} className="text-orange-600" />}
                            badge={lowStockProducts.length}
                            defaultOpen={alertsDefaultOpen}
                            className="border-orange-200"
                        >
                            <div className="space-y-2">
                                {lowStockProducts.map(product => {
                                    const stockInfo = getProductStockInfo(product.id);
                                    return (
                                        <div key={product.id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                                            <span className="text-sm text-gray-700">
                                                {product.name} {product.volume && `(${product.volume})`}
                                            </span>
                                            <span className="text-sm font-medium text-orange-600">
                                                {stockInfo?.physicalStock ?? 'N/A'} restant{(stockInfo?.physicalStock ?? 0) > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CollapsibleSection>
                    </div>
                )}
            </div>

            {/* Table des produits */}
            {sortedProducts.length === 0 ? (
                <EmptyState
                    icon={Package}
                    message="Aucun produit trouvé"
                    subMessage={searchTerm ? "Essayez une autre recherche" : "Commencez par ajouter des produits"}
                    action={
                        !searchTerm && (
                            <Button
                                onClick={handleAddProduct}
                                className="mt-4 px-4 py-2 text-sm font-medium"
                            >
                                Ajouter un produit
                            </Button>
                        )
                    }
                />
            ) : (
                <div className="bg-white rounded-xl border border-amber-100 overflow-hidden" data-guide="inventory-table">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-amber-100 bg-amber-50">
                                <th className="p-4 text-gray-700 font-medium">Produit</th>
                                <th className="p-4 text-gray-700 font-medium">Catégorie</th>
                                <th className="p-4 text-gray-700 font-medium">Prix vente</th>
                                <th className="p-4 text-gray-700 font-medium">Coût moyen</th>
                                <th className="p-4 text-gray-700 font-medium">Marge</th>
                                <th className="p-4 text-gray-700 font-medium">Stock</th>
                                <th className="p-4 text-gray-700 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedProducts.map((product) => {
                                const avgCost = getAverageCostPerUnit(product.id);
                                const margin = getMargin(product);
                                const stockInfo = getProductStockInfo(product.id);

                                return (
                                    <motion.tr
                                        key={product.id}
                                        whileHover={{ backgroundColor: '#fef7ed' }}
                                        className="border-b border-amber-50"
                                    >
                                        <td className="p-4">
                                            <div>
                                                <div className="text-gray-800 font-medium">{product.name}</div>
                                                <div className="text-gray-600 text-sm">{product.volume}</div>
                                                {product.globalProductId && (
                                                    <div className="mt-2">
                                                        <CatalogContributionBadge
                                                            globalProductId={product.globalProductId}
                                                            barName={currentBar?.name}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-700">{getCategoryName(product.categoryId)}</td>
                                        <td className="p-4 text-amber-600 font-medium">{formatPrice(product.price)}</td>
                                        <td className="p-4 text-gray-700">{avgCost > 0 ? formatPrice(avgCost) : '-'}</td>
                                        <td className="p-4">
                                            {margin > 0 ? (
                                                <span className={`${margin > 50 ? 'text-green-600' : margin > 30 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {margin.toFixed(1)}%
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="p-4">
                                            <span className={`font-bold ${(stockInfo?.availableStock ?? 0) <= product.alertThreshold ? 'text-red-600' : 'text-gray-800'
                                                }`}>
                                                {stockInfo?.physicalStock ?? 'N/A'}
                                            </span>
                                            <div className="text-xs text-gray-500">
                                                Vendable: {stockInfo?.availableStock ?? 'N/A'}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2" data-guide="inventory-edit-btn">
                                                <Button
                                                    onClick={() => handleEditProduct(product)}
                                                    variant="ghost"
                                                    size="icon"
                                                >
                                                    <Edit size={16} />
                                                </Button>
                                                <Button
                                                    onClick={() => handleAdjustStock(product)}
                                                    variant="ghost"
                                                    size="icon"
                                                    className="hover:text-blue-600"
                                                >
                                                    <BarChart3 size={16} />
                                                </Button>
                                                <Button
                                                    onClick={() => handleDeleteClick(product)}
                                                    variant="ghost"
                                                    size="icon"
                                                    className="hover:text-red-600"
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modales */}
            <Suspense fallback={null}>
                <ProductImport isOpen={showProductImport} onClose={() => setShowProductImport(false)} />
                <ProductModal
                    isOpen={showProductModal}
                    onClose={() => setShowProductModal(false)}
                    onSave={(productData) => {
                        if (editingProduct) {
                            updateProduct(editingProduct.id, { ...productData, barId: editingProduct.barId });
                        } else {
                            addProduct({ ...productData, barId: currentBar?.id || '' });
                        }
                        setShowProductModal(false);
                    }}
                    categories={categories}
                    product={editingProduct}
                />
                <SupplyModal
                    isOpen={showSupplyModal}
                    onClose={() => setShowSupplyModal(false)}
                    onSave={handleSupply}
                    products={products}
                />
            </Suspense>

            {/* Stock Adjustment Modal - not lazy loaded for immediate visibility */}
            {adjustingProduct && (
                <StockAdjustmentModal
                    isOpen={showStockAdjustmentModal}
                    onClose={() => setShowStockAdjustmentModal(false)}
                    onSave={handleAdjustmentSubmit}
                    product={adjustingProduct}
                />
            )}

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
        </div>
    );
}
