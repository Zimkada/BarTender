import { useState, useMemo, lazy, Suspense } from 'react';
import {
    Package,
    AlertTriangle,
    Plus,
    Edit,
    Trash2,
    TruckIcon,
    BarChart3,
    Zap,
    ChevronLeft,
    PlusCircle,
    FileSpreadsheet,
    Container,
    LayoutGrid
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useStockAdjustment } from '../hooks/mutations/useStockAdjustment';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { Product } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useBarContext } from '../context/BarContext';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';

// Lazy load heavy modals to reduce initial bundle size (~40-50 KB savings)
const ProductModal = lazy(() => import('../components/ProductModal').then(m => ({ default: m.ProductModal })));
const SupplyModal = lazy(() => import('../components/SupplyModal').then(m => ({ default: m.SupplyModal })));
const ProductImport = lazy(() => import('../components/ProductImport').then(m => ({ default: m.ProductImport })));

// Import StockAdjustmentModal directly (lighter component, used frequently)
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { searchProducts } from '../utils/productFilters';
import { sortProducts, SortMode } from '../utils/productSorting';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryStatsList } from '../components/common/CategoryStatsList';
import { ConfirmationModal } from '../components/common/ConfirmationModal';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

type ViewMode = 'products' | 'operations' | 'stats';
type OperationMode = 'menu' | 'add' | 'import' | 'supply';

/**
 * InventoryPage - Page de gestion des produits
 * Route: /inventory
 * Refactoré de modale vers page
 */
export default function InventoryPage() {
    // const navigate = useNavigate();
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

    const { currentSession } = useAuth();

    // Guide ID for inventory (Propriétaire and Gérant)
    const inventoryGuideId = currentSession?.role === 'gerant' ? 'manager-inventory' : 'manage-inventory';

    const { formatPrice } = useCurrencyFormatter();
    const { isMobile } = useViewport();
    const { showSuccess } = useFeedback();
    const stockAdjustmentMutation = useStockAdjustment();

    const [viewMode, setViewMode] = useState<ViewMode>('products');
    const [operationMode, setOperationMode] = useState<OperationMode>('menu');

    const [showProductModal, setShowProductModal] = useState(false);
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
            setOperationMode('menu');
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

    const tabsConfig = [
        { id: 'products', label: isMobile ? 'Produits' : 'Mes Produits', icon: Package },
        { id: 'operations', label: 'Opérations', icon: Zap },
        { id: 'stats', label: isMobile ? 'Stats' : 'Statistiques', icon: BarChart3 }
    ];

    // Helper pour changer de vue d'opération
    const handleOperationSelect = (mode: OperationMode) => {
        setOperationMode(mode);
    };

    const handleBackToOperations = () => {
        setOperationMode('menu');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
            {/* Header avec Onglets */}
            <TabbedPageHeader
                title="Inventaire"
                subtitle={isMobile ? undefined : "Gestion du catalogue et des stocks"}
                icon={<Package size={24} />}
                tabs={tabsConfig}
                activeTab={viewMode}
                onTabChange={(id) => {
                    setViewMode(id as ViewMode);
                    if (id !== 'operations') setOperationMode('menu');
                }}
                guideId={inventoryGuideId}
                actions={
                    !isMobile && (
                        <Button
                            onClick={handleAddProduct}
                            variant="default"
                            className="bg-white text-amber-600 hover:bg-amber-50"
                        >
                            <Plus size={18} className="mr-2" />
                            Ajouter produit
                        </Button>
                    )
                }
            />

            <main className="container mx-auto px-4 py-4 pb-24">
                <AnimatePresence mode="wait">
                    {/* ONGLET PRODUITS */}
                    {viewMode === 'products' && (
                        <motion.div
                            key="products-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {/* Toolbar Recherche & Tris */}
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
                                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
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
                            {sortedProducts.length === 0 ? (
                                <EmptyState
                                    icon={Package}
                                    message="Aucun produit trouvé"
                                    subMessage={searchTerm ? "Essayez une autre recherche" : "Votre inventaire est vide"}
                                />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {sortedProducts.map((product) => {
                                        const avgCost = getAverageCostPerUnit(product.id);
                                        const margin = getMargin(product);
                                        const stockInfo = getProductStockInfo(product.id);

                                        return (
                                            <div key={product.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-amber-200 transition-colors">
                                                <div className="p-4">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-gray-900 truncate">{product.name}</h3>
                                                            <p className="text-sm text-gray-500">{product.volume || 'Format non spécifié'}</p>
                                                            <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded uppercase tracking-wider">
                                                                {getCategoryName(product.categoryId)}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`text-lg font-black ${(stockInfo?.availableStock ?? 0) <= product.alertThreshold ? 'text-red-500' : 'text-gray-900'}`}>
                                                                {stockInfo?.physicalStock ?? 0}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase">Stock</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50">
                                                        <div className="text-center">
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Prix</div>
                                                            <div className="text-xs font-bold text-amber-600">{formatPrice(product.price)}</div>
                                                        </div>
                                                        <div className="text-center border-x border-gray-50">
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Coût</div>
                                                            <div className="text-xs font-bold text-gray-700">{avgCost > 0 ? formatPrice(avgCost) : '-'}</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Marge</div>
                                                            <div className={`text-xs font-bold ${margin > 40 ? 'text-green-600' : margin > 20 ? 'text-amber-600' : 'text-red-500'}`}>
                                                                {margin > 0 ? `${margin.toFixed(0)}%` : '-'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 mt-4">
                                                        <Button
                                                            onClick={() => handleEditProduct(product)}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="flex-1 bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                                                        >
                                                            <Edit size={14} className="mr-1.5" />
                                                            Modifier
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleAdjustStock(product)}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="flex-1 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                                                        >
                                                            <BarChart3 size={14} className="mr-1.5" />
                                                            Ajuster
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleDeleteClick(product)}
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-gray-400 hover:text-red-500 hover:bg-red-50"
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
                        </motion.div>
                    )}

                    {/* ONGLET OPERATIONS */}
                    {viewMode === 'operations' && (
                        <motion.div
                            key="operations-view"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <AnimatePresence mode="wait">
                                {operationMode === 'menu' ? (
                                    <motion.div
                                        key="op-menu"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="space-y-6"
                                    >
                                        {/* Tuiles d'action */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <button
                                                onClick={() => handleOperationSelect('add')}
                                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-amber-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                                            >
                                                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                                                    <PlusCircle size={28} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900">Nouveau Produit</h3>
                                                    <p className="text-sm text-gray-500">Ajouter manuellement au catalogue</p>
                                                </div>
                                            </button>

                                            <button
                                                onClick={() => handleOperationSelect('supply')}
                                                className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-green-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                                            >
                                                <div className="p-3 bg-green-100 text-green-600 rounded-xl group-hover:scale-110 transition-transform">
                                                    <TruckIcon size={28} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900">Approvisionner</h3>
                                                    <p className="text-sm text-gray-500">Enregistrer des entrées de stock</p>
                                                </div>
                                            </button>

                                            {isProductImportEnabled && (
                                                <button
                                                    onClick={() => handleOperationSelect('import')}
                                                    className="group p-6 bg-white rounded-2xl border-2 border-transparent hover:border-blue-400 shadow-sm transition-all text-left flex items-start gap-4 active:scale-95"
                                                >
                                                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                                                        <FileSpreadsheet size={28} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-gray-900">Import Excel</h3>
                                                        <p className="text-sm text-gray-500">Charger une liste massive</p>
                                                    </div>
                                                </button>
                                            )}
                                        </div>

                                        {/* Section Alertes (Conditionnelle) */}
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                                    <AlertTriangle size={18} className="text-orange-500" />
                                                    Urgent : Stocks bas
                                                </h3>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${lowStockProducts.length > 0 ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                                                    {lowStockProducts.length > 0 ? `${lowStockProducts.length} alertes` : 'OK'}
                                                </span>
                                            </div>

                                            <div className="p-4">
                                                {lowStockProducts.length === 0 ? (
                                                    <div className="text-center py-6">
                                                        <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                                            <Package size={24} />
                                                        </div>
                                                        <p className="text-gray-600 font-medium">Tous les stocks sont à jour ✓</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {lowStockProducts.map(product => {
                                                            const stock = getProductStockInfo(product.id);
                                                            return (
                                                                <div key={product.id} className="flex items-center justify-between p-3 bg-orange-50/50 rounded-xl border border-orange-100">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-orange-600 font-bold border border-orange-100">
                                                                            {stock?.physicalStock ?? 0}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-gray-900">{product.name}</p>
                                                                            <p className="text-[10px] text-gray-500 uppercase font-black">Seuil: {product.alertThreshold}</p>
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => {
                                                                            handleOperationSelect('supply');
                                                                        }}
                                                                        size="sm"
                                                                        className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold h-7"
                                                                    >
                                                                        Réappro
                                                                    </Button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="op-form"
                                        initial={{ opacity: 0, x: 50 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -50 }}
                                        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[400px]"
                                    >
                                        <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                                            <Button
                                                onClick={handleBackToOperations}
                                                variant="ghost"
                                                size="sm"
                                                className="text-gray-500 hover:text-gray-900"
                                            >
                                                <ChevronLeft size={20} className="mr-1" />
                                                Retour
                                            </Button>
                                            <h2 className="text-lg font-bold text-gray-900">
                                                {operationMode === 'add' && "Nouveau Produit"}
                                                {operationMode === 'import' && "Importation Massive"}
                                                {operationMode === 'supply' && "Approvisionnement Manuel"}
                                            </h2>
                                        </div>

                                        <Suspense fallback={<div className="py-12 text-center text-gray-400">Chargement du formulaire...</div>}>
                                            {operationMode === 'add' && (
                                                <ProductModal
                                                    isOpen={true}
                                                    inline={true}
                                                    onClose={handleBackToOperations}
                                                    onSave={(data) => {
                                                        addProduct({ ...data, barId: currentBar?.id || '' });
                                                        showSuccess('Produit ajouté');
                                                        handleBackToOperations();
                                                    }}
                                                    categories={categories}
                                                />
                                            )}
                                            {operationMode === 'import' && (
                                                <ProductImport
                                                    isOpen={true}
                                                    inline={true}
                                                    onClose={handleBackToOperations}
                                                />
                                            )}
                                            {operationMode === 'supply' && (
                                                <SupplyModal
                                                    isOpen={true}
                                                    inline={true}
                                                    onClose={handleBackToOperations}
                                                    onSave={async (data) => {
                                                        await handleSupply(data);
                                                        handleBackToOperations();
                                                    }}
                                                    products={products}
                                                />
                                            )}
                                        </Suspense>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {/* ONGLET STATISTIQUES */}
                    {viewMode === 'stats' && (
                        <motion.div
                            key="stats-view"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="space-y-6"
                        >
                            {/* Résumé Global */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-amber-500 p-5 rounded-2xl text-white shadow-lg shadow-amber-200/50">
                                    <Container className="mb-2 opacity-50" size={24} />
                                    <div className="text-2xl font-black">{products.length}</div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Types de produits</p>
                                </div>
                                <div className="bg-blue-600 p-5 rounded-2xl text-white shadow-lg shadow-blue-200/50">
                                    <BarChart3 className="mb-2 opacity-50" size={24} />
                                    <div className="text-lg font-bold truncate">
                                        {formatPrice(products.reduce((acc, p) => acc + (p.price * p.stock), 0))}
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">Valeur Vente Stock</p>
                                </div>
                            </div>

                            {/* Répartition Catégories */}
                            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <LayoutGrid size={18} className="text-amber-500" />
                                    Répartition par catégorie
                                </h3>
                                <div className="space-y-4">
                                    <CategoryStatsList stats={categoryStats} showAlerts={false} />
                                </div>
                            </div>

                            {/* Indicateurs additionnels or Graphiques si dispo */}
                            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 text-center">
                                <AlertTriangle className="mx-auto text-orange-500 mb-2" size={32} />
                                <h4 className="font-bold text-gray-900">{lowStockProducts.length} produits nécessitent votre attention</h4>
                                <p className="text-sm text-gray-600 mt-1">Consultez l'onglet Opérations pour réapprovisionner</p>
                                <Button
                                    onClick={() => setViewMode('operations')}
                                    className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                                >
                                    Aller aux opérations
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Modales classiques (Ajustement & Suppression toujours via modale car contextuelles) */}
            <Suspense fallback={null}>
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

                {showProductModal && editingProduct && (
                    <ProductModal
                        isOpen={true}
                        onClose={() => {
                            setShowProductModal(false);
                            setEditingProduct(undefined);
                        }}
                        onSave={(data) => {
                            updateProduct(editingProduct.id, { ...data, barId: editingProduct.barId });
                            showSuccess('Produit mis à jour');
                            setShowProductModal(false);
                        }}
                        categories={categories}
                        product={editingProduct}
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
            </Suspense>
        </div>
    );
}
