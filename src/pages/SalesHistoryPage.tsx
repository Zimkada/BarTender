import { useState, useMemo } from 'react';
import {
    Search,
    Download,
    ShoppingCart,
    TrendingUp,
    LayoutGrid,
    List as ListIcon
} from 'lucide-react';

import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';
import { useStockManagement } from '../hooks/useStockManagement';
import { DataFreshnessIndicatorCompact } from '../components/DataFreshnessIndicator';
import { useRealtimeSales } from '../hooks/useRealtimeSales';
import { Sale, User } from '../types';
import { SALES_HISTORY_FILTERS } from '../config/dateFilters';
import { useSalesFilters } from '../features/Sales/SalesHistory/hooks/useSalesFilters';
import { useSalesStats } from '../features/Sales/SalesHistory/hooks/useSalesStats';
import { useSalesExport } from '../features/Sales/SalesHistory/hooks/useSalesExport';
import { AnalyticsView } from '../features/Sales/SalesHistory/views/AnalyticsView';
import { SalesListView } from '../features/Sales/SalesHistory/views/SalesListView';
import { SalesCardsView } from '../features/Sales/SalesHistory/views/SalesCardsView';
import { SaleDetailModal } from '../components/sales/SaleDetailModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TabbedPageHeader } from '../components/common/PageHeader/patterns/TabbedPageHeader';
import { PeriodFilter } from '../components/common/filters/PeriodFilter';
import { GuideTourModal } from '../components/guide/GuideTourModal';

type ViewMode = 'list' | 'cards' | 'analytics';

/**
 * SalesHistoryPage - Page d'historique des ventes
 * Route: /sales
 * Refactoré de composant nommé vers export default page
 */
export default function SalesHistoryPage() {
    const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
    const { barMembers, currentBar } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { isMobile } = useViewport();
    const { showSuccess } = useFeedback();
    const { consignments } = useStockManagement();

    // Guide ID for sales history - using header button instead of auto-trigger
    const historyGuideId = currentSession?.role === 'serveur' ? 'serveur-history' : 'analytics-overview';

    // Auto-guides disabled - using GuideHeaderButton in page header instead
    // useAutoGuide(
    //     'bartender-stats',
    //     onboardingComplete && currentSession?.role === 'serveur' && !hasCompletedGuide('bartender-stats'),
    //     { delay: 2000 }
    // );

    // useAutoGuide(
    //     'analytics-overview',
    //     onboardingComplete && currentSession?.role === 'promoteur' && !hasCompletedGuide('analytics-overview'),
    //     { delay: 2500 }
    // );

    // Enable real-time sales updates
    useRealtimeSales({ barId: currentBar?.id || '' });

    // Récupérer l'heure de clôture (défaut: 6h)
    const closeHour = currentBar?.closingHour ?? 6;

    // Protection: s'assurer que tous les tableaux sont définis
    const safeBarMembers = barMembers || [];
    // Derive users from barMembers for backward compatibility with child components
    const safeUsers = useMemo(() => {
        return safeBarMembers
            .map(m => m.user)
            .filter((u): u is User => !!u);
    }, [safeBarMembers]);

    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');

    // HOOK: Filtrage (Ventes & Consignations & Retours)
    const {
        timeRange,
        setTimeRange,
        startDate,
        endDate,
        updateCustomRange,
        customRange,
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredConsignments,
        filteredReturns // ✨ MODE SWITCHING FIX: Get filtered returns from hook
    } = useSalesFilters({
        sales,
        consignments,
        returns, // Pass returns to filter them by server
        currentSession,
        closeHour
    });

    // ✨ Filter metrics for servers
    const isServerRole = currentSession?.role === 'serveur';
    const serverIdForAnalytics = isServerRole ? currentSession?.userId : undefined;

    // HOOK: Statistiques & Top Produits
    const {
        stats,
        topProductsLimit,
        setTopProductsLimit,
        topProductMetric,
        setTopProductMetric,
        isLoadingTopProducts
    } = useSalesStats({
        filteredSales,
        returns: filteredReturns, // ✨ MODE SWITCHING FIX: Use filtered returns instead of all returns
        timeRange,
        startDate,
        endDate,
        currentBar,
        serverId: serverIdForAnalytics // Pass serverId for server filtering
    });

    // HOOK: Export Logic
    const { exportSales } = useSalesExport({
        filteredSales,
        filteredConsignments,
        filteredReturns,
        sales,
        returns,
        products,
        categories,
        users: safeUsers,
        barMembers: safeBarMembers
    });


    const tabsConfig = [
        { id: 'list', label: isMobile ? 'Tableau' : 'Tableau des ventes', icon: ListIcon },
        { id: 'cards', label: isMobile ? 'Détails' : 'Détails des ventes', icon: LayoutGrid },
        { id: 'analytics', label: isMobile ? 'Statistiques' : 'Statistiques & Analyses', icon: TrendingUp }
    ] as { id: string; label: string; icon: any }[];

    return (
        <div className="min-h-screen bg-transparent pb-16 md:pb-0">
            <div className={`w-full flex flex-col ${isMobile ? 'h-full' : 'max-w-7xl mx-auto'}`}>
                <TabbedPageHeader
                    title={isMobile ? 'Historique' : 'Historique des ventes'}
                    subtitle={
                        <span>
                            Consultez et analysez votre historique
                            {!isMobile && <span className="ml-2 text-brand-primary font-bold">• {filteredSales.length} ventes</span>}
                        </span>
                    }
                    icon={<TrendingUp size={24} />}
                    tabs={tabsConfig}
                    activeTab={viewMode}
                    onTabChange={(id) => setViewMode(id as ViewMode)}
                    guideId={historyGuideId}
                    actions={
                        !isMobile && (
                            <div className="flex items-center gap-2">
                                {/* Export format toggle (Tablets/Desktop) */}
                                <div className="flex bg-white/10 rounded-lg p-1 border border-white/20">
                                    <button
                                        onClick={() => setExportFormat('excel')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${exportFormat === 'excel' ? 'bg-green-600 text-white shadow-sm' : 'text-amber-900 hover:bg-white/10 hover:text-amber-950'}`}
                                    >
                                        Excel
                                    </button>
                                    <button
                                        onClick={() => setExportFormat('csv')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${exportFormat === 'csv' ? 'bg-blue-600 text-white shadow-sm' : 'text-amber-900 hover:bg-white/10 hover:text-amber-950'}`}
                                    >
                                        CSV
                                    </button>
                                </div>

                                <Button
                                    onClick={() => exportSales(exportFormat)}
                                    title={`Exporter (${exportFormat.toUpperCase()})`}
                                    size="sm"
                                    className={`h-10 transition-all flex items-center justify-center gap-2 font-semibold ${filteredSales.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${exportFormat === 'excel'
                                        ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                        } w-40`}
                                >
                                    <Download size={18} />
                                    <span className="whitespace-nowrap">Exporter ({exportFormat.toUpperCase()})</span>
                                </Button>
                            </div>
                        )
                    }
                />

                {/* ==================== FILTERS AREA ==================== */}
                <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10" data-guide="sales-filters">
                    <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
                        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <Input
                                    type="text"
                                    placeholder="Rechercher ID ou produit..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                                />
                            </div>
                            {/* Unified Period Filter */}
                            <PeriodFilter
                                timeRange={timeRange}
                                setTimeRange={setTimeRange}
                                availableFilters={SALES_HISTORY_FILTERS}
                                customRange={customRange}
                                updateCustomRange={updateCustomRange}
                                buttonClassName="Ring-0 shadow-none border-0"
                            />
                        </div>

                        {/* Export format toggle & Action (Mobile only) */}
                        {isMobile && (
                            <div className="flex items-center gap-3 w-full justify-between pt-2 border-t border-gray-100 mt-1">
                                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Format:</span>
                                <div className="flex items-center gap-2 flex-1 justify-end">
                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                        <button
                                            onClick={() => setExportFormat('excel')}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${exportFormat === 'excel' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500'}`}
                                        >
                                            XLS
                                        </button>
                                        <button
                                            onClick={() => setExportFormat('csv')}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${exportFormat === 'csv' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500'}`}
                                        >
                                            CSV
                                        </button>
                                    </div>

                                    <Button
                                        onClick={() => exportSales(exportFormat)}
                                        size="sm"
                                        className={`h-8 px-4 flex items-center gap-2 text-xs font-bold rounded-lg shadow-sm transition-all ${filteredSales.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${exportFormat === 'excel'
                                            ? 'bg-green-600 text-white hover:bg-green-700'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                    >
                                        <Download size={14} />
                                        Exporter
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ==================== CONTENT AREA ==================== */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                    <div className="flex items-center justify-between mb-4">
                        <DataFreshnessIndicatorCompact
                            viewName="sales_history"
                            onRefreshComplete={() => showSuccess('Données actualisées')}
                        />
                    </div>

                    {filteredSales.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                            <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune vente trouvée</h3>
                            <p className="text-gray-500">Ajustez vos filtres ou changez la période</p>
                        </div>
                    ) : (
                        <div className="mt-2">
                            {viewMode === 'cards' ? (
                                <div className="space-y-4 max-w-5xl mx-auto">
                                    <SalesCardsView
                                        sales={filteredSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={setSelectedSale}
                                        getReturnsBySale={getReturnsBySale}
                                        users={safeUsers}
                                    />
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <SalesListView
                                        sales={filteredSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={setSelectedSale}
                                        getReturnsBySale={getReturnsBySale}
                                        users={safeUsers}
                                    />
                                </div>
                            ) : (
                                <AnalyticsView
                                    sales={filteredSales}
                                    stats={stats}
                                    formatPrice={formatPrice}
                                    categories={categories}
                                    products={products}
                                    users={safeUsers}
                                    barMembers={safeBarMembers}
                                    timeRange={timeRange}
                                    isMobile={isMobile}
                                    returns={returns}
                                    closeHour={closeHour}
                                    filteredConsignments={filteredConsignments}
                                    startDate={startDate}
                                    endDate={endDate}
                                    topProductMetric={topProductMetric}
                                    setTopProductMetric={setTopProductMetric}
                                    topProductsLimit={topProductsLimit}
                                    setTopProductsLimit={setTopProductsLimit}
                                    isLoadingTopProducts={isLoadingTopProducts}
                                    viewMode={viewMode}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Détail vente */}
            <SaleDetailModal
                sale={selectedSale}
                formatPrice={formatPrice}
                onClose={() => setSelectedSale(null)}
            />

            <GuideTourModal />
        </div>
    );
}