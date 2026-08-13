import { useState, Suspense, lazy, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, BarChart3, Zap, AlertCircle, ClipboardList, Folder, ArrowDownAZ, TrendingDown, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../types';

// Hooks & Context
import { useAuth } from '../context/AuthContext';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useUnifiedDishes } from '../hooks/pivots/useUnifiedDishes';
import { useDishCategories } from '../hooks/queries/useDishesQueries';
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
import { CatalogScopeSwitcher, type CatalogScope } from '../components/inventory/CatalogScopeSwitcher';
import { DishCatalogList } from '../components/inventory/DishCatalogList';
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
    // ⭐ `hasRestaurant` extrait ICI : un second useBarContext() plus bas
    // serait un doublon, et le verrou de portée §3 en a besoin.
    const { currentBar, hasRestaurant } = useBarContext();
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
        getDisplayCostForProduct,
        isLoading: isLoadingProducts
    } = useUnifiedStock(currentBar?.id, { skipSupplies: viewMode === 'products' });

    /**
     * ⭐ Portée du catalogue — Tout / Boissons / Plats.
     *
     * ⚠️ Défaut 'all' et non 'products' : le promoteur d'un bar-resto doit voir
     * son offre COMPLÈTE en arrivant. Sur un bar pur, la valeur n'a aucun effet
     * (le sélecteur n'existe pas et `dishes` est vide) — §3 préservé.
     */
    const [rawCatalogScope, setCatalogScope] = useState<CatalogScope>('all');

    /**
     * ⭐⭐ §3 — VERROU : sur un bar pur, la portée est TOUJOURS 'all'.
     *
     * `rawCatalogScope` n'est aujourd'hui modifiable que par le sélecteur, qui
     * ne se rend pas sans `hasRestaurant` — le cas est donc inatteignable.
     * Mais rien ne l'empêche STRUCTURELLEMENT : un futur `?scope=dishes` dans
     * l'URL, un état persisté en localStorage, ou un bar qui désactive sa
     * cuisine alors que la portée est sur 'dishes' feraient DISPARAÎTRE le
     * catalogue de boissons — sans erreur, sans log, sans rien.
     *
     * Ce verrou rend l'invariance indépendante de la façon dont la portée est
     * arrivée là. §3 : « un bar pur doit être STRICTEMENT identique ».
     */
    const catalogScope: CatalogScope = hasRestaurant ? rawCatalogScope : 'all';

    /**
     * ⚠️ `hasRestaurant` vient du même `useBarContext()` que `currentBar`
     * ci-dessus : un second appel au même hook serait un doublon inutile.
     *
     * ⭐ §3 — `hasRestaurant` conditionne l'AFFICHAGE, jamais le montage des
     * hooks : ceux-ci portent déjà leur propre garde `enabled`. Sur un bar pur,
     * `dishes` reste vide SANS qu'aucune requête ne parte.
     */
    const { dishes, isLoading: isLoadingDishes } = useUnifiedDishes(currentBar?.id);
    const { data: dishCategoryRows = [] } = useDishCategories(currentBar?.id);

    /** Nom de catégorie par id — les plats n'embarquent que `category_id`. */
    const dishCategoryNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of dishCategoryRows) {
            map.set(c.id, c.custom_name || c.name || 'Sans nom');
        }
        return map;
    }, [dishCategoryRows]);


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

    /**
     * Recherche appliquée aux plats.
     *
     * ⚠️ Filtrage LOCAL, comme pour les produits : la liste est déjà en cache.
     * Une requête serveur par frappe annulerait les 3 vagues d'optimisation
     * d'egress.
     * ⚠️ Déclaré ICI et non plus haut avec les autres données plats :
     * `searchTerm` n'existe qu'à partir de ce point (TDZ sinon).
     */
    const filteredDishes = useMemo(() => {
        if (!searchTerm.trim()) return dishes;
        const needle = searchTerm.toLowerCase();
        return dishes.filter((d) => d.name.toLowerCase().includes(needle));
    }, [dishes, searchTerm]);

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

    // 4. Config — promoteur et gérant partagent le guide manage-inventory.
    const inventoryGuideId = 'manage-inventory';

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
        <div className="min-h-screen bg-brand-subtle">
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

                                {/* ⭐ Ligne 2 : portée du catalogue.
                                    §3 — ne rend RIEN sur un bar pur : le
                                    composant s'auto-masque via hasRestaurant,
                                    l'écran est alors STRICTEMENT identique. */}
                                {/* ⚠️ Compteurs MASQUÉS quand le filtre Anomalies
                                    est actif.
                                    `sortedProducts` subit ce filtre, `filteredDishes`
                                    NON (un plat n'a pas d'anomalie de stock). Le
                                    total « Tout » deviendrait alors la somme d'un
                                    ensemble filtré et d'un ensemble qui ne l'est
                                    pas — un chiffre ne correspondant à rien.
                                    Mieux vaut aucun compteur qu'un compteur faux. */}
                                <CatalogScopeSwitcher
                                    scope={catalogScope}
                                    onScopeChange={(next) => {
                                        setCatalogScope(next);
                                        // ⚠️ Le filtre Anomalies est MASQUÉ en portée
                                        // « Plats ». S'il restait actif, l'utilisateur
                                        // reviendrait en « Boissons » avec une liste
                                        // amputée sans plus voir le contrôle qui en
                                        // est la cause — un filtre fantôme.
                                        if (next === 'dishes') setShowAnomalies(false);
                                    }}
                                    hasRestaurant={hasRestaurant}
                                    productCount={showAnomalies ? undefined : sortedProducts.length}
                                    dishCount={showAnomalies ? undefined : filteredDishes.length}
                                />

                                {/* Ligne 3 : Trier + Filtrer
                                    ⚠️ Masquée en portée « Plats » : le tri par
                                    stock et le filtre Anomalies portent sur des
                                    notions qui n'existent PAS pour un plat
                                    (stock, écart d'inventaire). Les laisser
                                    serait proposer des contrôles sans effet. */}
                                <div
                                    className={cn(
                                        'flex flex-wrap items-center gap-3',
                                        catalogScope === 'dishes' && 'hidden'
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-micro text-muted-foreground uppercase">Trier</span>
                                        <div
                                            role="radiogroup"
                                            aria-label="Mode de tri"
                                            className="inline-flex items-center p-0.5 bg-muted rounded-full border border-border"
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
                                                                ? "bg-card text-brand-primary shadow-sm font-semibold"
                                                                : "text-muted-foreground hover:text-foreground font-medium"
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
                                        <span className="text-micro text-muted-foreground uppercase">Filtrer</span>
                                        <button
                                            onClick={() => setShowAnomalies(!showAnomalies)}
                                            data-guide="inventory-filter-anomalies"
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption transition-all border",
                                                showAnomalies
                                                    ? "bg-red-500 text-white border-red-500 font-semibold"
                                                    : "bg-card text-foreground/80 border-border hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium"
                                            )}
                                        >
                                            <AlertCircle size={14} className={showAnomalies ? 'text-white' : 'text-red-500'} />
                                            <span>Anomalies</span>
                                            {anomalyCount > 0 && (
                                                <span className={cn(
                                                    "ml-0.5 px-1.5 py-0.5 rounded-full text-micro tabular-nums",
                                                    showAnomalies ? "bg-card/25" : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                                                )}>
                                                    {anomalyCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ⭐ Liste Produits — masquée en portée « Plats ».
                                ⚠️ Les deux listes sont DISTINCTES, jamais
                                fusionnées : InventoryList est bâtie pour des
                                produits STOCKÉS (stock, coût d'achat,
                                ajustements, historique). Un plat n'a rien de
                                cela — c'est précisément pourquoi `dishes` est
                                une table autonome (§4.5). Les fusionner
                                exigerait des champs mensongers. */}
                            {catalogScope !== 'dishes' && (
                                isLoadingProducts ? (
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
                                )
                            )}

                            {/* ⭐ Liste Plats — §3 : `hasRestaurant` en garde,
                                sinon un bar pur afficherait un titre de section
                                « Plats » suivi d'un vide. */}
                            {hasRestaurant && catalogScope !== 'products' &&
                             /* ⚠️ En portée « Tout », un catalogue sans plat ne
                                doit PAS afficher l'état vide des plats sous les
                                boissons : l'écran dirait « aucun plat » alors
                                que l'utilisateur regarde ses boissons. L'état
                                vide n'a de sens qu'en portée « Plats ». */
                             (catalogScope === 'dishes' || filteredDishes.length > 0) && (
                                <div className="space-y-2">
                                    {/* Le titre de section n'apparaît qu'en
                                        portée « Tout » : ailleurs, le sélecteur
                                        dit déjà ce qu'on regarde. */}
                                    {catalogScope === 'all' && filteredDishes.length > 0 && (
                                        <h3 className="text-micro text-muted-foreground uppercase pt-2">
                                            Plats
                                        </h3>
                                    )}
                                    <DishCatalogList
                                        dishes={filteredDishes}
                                        categoryNames={dishCategoryNames}
                                        searchTerm={searchTerm}
                                        isLoading={isLoadingDishes}
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
