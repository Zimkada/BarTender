import { useState, useMemo, useEffect } from 'react';
import {
    Search,
    Download,
    ShoppingCart,
    TrendingUp,
    LayoutGrid,
    List as ListIcon
} from 'lucide-react';

import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useUnifiedReturns } from '../hooks/pivots/useUnifiedReturns';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';
import { DataFreshnessIndicatorCompact } from '../components/DataFreshnessIndicator';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { SALES_HISTORY_FILTERS } from '../config/dateFilters';
import { Sale, User, getPermissionsByRole } from '../types';
import { useSalesFilters } from '../features/Sales/SalesHistory/hooks/useSalesFilters';
import { useSalesStats } from '../features/Sales/SalesHistory/hooks/useSalesStats';
import { useSalesExport } from '../features/Sales/SalesHistory/hooks/useSalesExport';
// Lazy load AnalyticsView to defer recharts bundle
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
    const { currentBar } = useBarContext();
    const { products, categories, consignments } = useUnifiedStock(currentBar?.id);
    const { returns: unifiedReturns, getReturnsBySale: getReturnsBySaleFromHook } = useUnifiedReturns(currentBar?.id, currentBar?.closingHour);
    const { barMembers } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { isMobile } = useViewport();
    const { showSuccess, showError } = useFeedback();

    // Guide ID for sales history - using header button instead of auto-trigger
    const historyGuideId = currentSession?.role === 'serveur' ? 'serveur-history' : 'analytics-overview';

    // Real-time logic moved to useUnifiedSales
    const { cancelSale } = useSalesMutations(currentBar?.id || '');

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

    const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'cards' : 'analytics');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
    const [serverSearchTerm, setServerSearchTerm] = useState<string>(''); // ✨ NOUVEAU: Failover Search

    const canCancelSales = currentSession
        ? getPermissionsByRole(currentSession.role).canCancelSales
        : false;
    const [statusFilter, setStatusFilter] = useState<'validated' | 'rejected' | 'cancelled' | 'all'>('validated');
    const [isTieringIgnored, setIsTieringIgnored] = useState(false);

    // ✨ NOUVEAU: Pilotage temporel centralisé (Certification Elite)
    const dateFilter = useDateRangeFilter({
        defaultRange: 'today',
        includeBusinessDay: true,
        closeHour
    });

    const { timeRange, setTimeRange, startDate, endDate, updateCustomRange, customRange } = dateFilter;

    // ✨ NOUVEAU: Ventes & Retours Unifiés (Certification Perfection)
    const {
        sales: unifiedSales,
        isLoading: isLoadingSales
    } = useUnifiedSales(currentBar?.id, serverSearchTerm, timeRange, isTieringIgnored);

    // HOOK: Filtrage (Ventes & Retours)
    const {
        searchTerm,
        setSearchTerm,
        filteredSales,
        filteredReturns // ✨ MODE SWITCHING FIX: Get filtered returns from hook
    } = useSalesFilters({
        sales: unifiedSales as any, // Use unifiedSales
        returns: unifiedReturns, // Use unifiedReturns
        currentSession,
        closeHour,
        statusFilter, // Pass 'all' directly to the hook
        externalStartDate: startDate,
        externalEndDate: endDate,
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
        isLoadingStats
    } = useSalesStats({
        filteredSales,
        timeRange,
        startDate,
        endDate,
        currentBar,
        serverId: serverIdForAnalytics // Pass serverId for server filtering
    });

    // HOOK: Export Logic
    const { exportSales } = useSalesExport({
        filteredSales: filteredSales as any,
        filteredReturns,
        sales: unifiedSales as any,
        returns: unifiedReturns,
        products,
        categories,
        users: safeUsers,
        barMembers: safeBarMembers,
        barId: currentBar?.id, // ✨ REQUIRED for integral export
        startDate: startDate?.toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0],
        statusFilter, // Pass 'all' directly to handle it inside the hook
    });

    // ✨ Effacement automatique de la recherche serveur si on efface le terme
    useEffect(() => {
        if (!searchTerm) setServerSearchTerm('');
    }, [searchTerm]);

    // ✨ Reset ignoreTiering if timeRange changes back to short periods
    useEffect(() => {
        if (timeRange && ['today', 'yesterday', 'last_7days', 'last_30days'].includes(timeRange)) {
            setIsTieringIgnored(false);
        }
    }, [timeRange]);

    // Handler: annulation de vente
    const handleCancelSale = async (saleId: string, reason: string) => {
        try {
            await cancelSale.mutateAsync({ id: saleId, reason });
            setSelectedSale(null);
        } catch (error: any) {
            showError(error.message || 'Erreur lors de l\'annulation');
        }
    };

    // ✨ FIX: Fonction pour obtenir les retours filtrés d'une vente
    // Utilise filteredReturns (déjà filtrés par date) au lieu de tous les retours
    const getFilteredReturnsBySale = (saleId: string) => {
        return filteredReturns.filter((r: any) => r.saleId === saleId);
    };


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
                            Consultez l'historique détaillé de vos transactions et analysez la performance de votre établissement.
                            {!isMobile && (
                                <span className="ml-2 text-brand-primary font-bold">
                                    • {isLoadingStats ? '...' : stats.totalItems} ventes
                                </span>
                            )}
                        </span>
                    }
                    icon={<TrendingUp size={24} />}
                    hideSubtitleOnMobile={true}
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

                {/* ✨ SIGNALÉTIQUE DATA TIERS (Certification Perfection) */}
                {currentBar?.settings?.dataTier && currentBar.settings.dataTier !== 'lite' && (
                    <div className="bg-brand-primary/5 border-b border-brand-primary/10 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] text-brand-primary font-medium">
                            <TrendingUp size={14} />
                            <span>
                                Affichage optimisé ({currentBar.settings.dataTier.toUpperCase()}) :
                                {currentBar.settings.dataTier === 'balanced' ? ' 6 derniers mois' : ' 30 derniers jours'} chargés.
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setIsTieringIgnored(true);
                                setTimeRange('last_365days');
                                showSuccess('Chargement de l\'historique étendu...');
                            }}
                            className="text-[10px] bg-brand-primary text-white px-2 py-0.5 rounded hover:bg-brand-dark transition-colors font-bold uppercase"
                        >
                            Voir plus
                        </button>
                    </div>
                )}

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
                                {searchTerm && filteredSales.length === 0 && !isLoadingSales && serverSearchTerm !== searchTerm && (
                                    <button
                                        onClick={() => setServerSearchTerm(searchTerm)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-brand-primary text-white px-2 py-0.5 rounded hover:bg-brand-dark transition-all animate-pulse"
                                    >
                                        Serveur ?
                                    </button>
                                )}
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

                            {/* Pills de statut — visible uniquement pour les rôles avec canCancelSales */}
                            {canCancelSales && (
                                <div className="flex bg-white/40 backdrop-blur-md rounded-2xl p-1 gap-1.5 border border-brand-subtle shadow-sm">
                                    {(['validated', 'rejected', 'cancelled'] as const).map((status) => {
                                        const labels = { validated: 'Validées', rejected: 'Rejetées', cancelled: 'Annulées' };
                                        return (
                                            <button
                                                key={status}
                                                onClick={() => setStatusFilter(status)}
                                                className={`px-3 py-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all flex-1 min-w-[80px] ${statusFilter === status
                                                    ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle'
                                                    : 'glass-action-button-2026 text-gray-400 hover:text-brand-primary'
                                                    } `}
                                            >
                                                {labels[status]}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Export format toggle & Action (Mobile only) */}
                        {isMobile && (
                            <div className="flex items-center gap-3 w-full justify-between pt-2 border-t border-gray-100 mt-1">
                                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Format:</span>
                                <div className="flex items-center gap-2 flex-1 justify-end">
                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                        <button
                                            onClick={() => setExportFormat('excel')}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${exportFormat === 'excel' ? 'bg-green-600 text-white shadow-md' : 'text-gray-500'} `}
                                        >
                                            XLS
                                        </button>
                                        <button
                                            onClick={() => setExportFormat('csv')}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${exportFormat === 'csv' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500'} `}
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
                                            } `}
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
                            <h3 className="text-lg font-medium text-gray-600 mb-2">
                                {statusFilter === 'cancelled' ? 'Aucune vente annulée'
                                    : statusFilter === 'rejected' ? 'Aucune vente rejetée'
                                        : 'Aucune vente trouvée'}
                            </h3>
                            <p className="text-gray-500">
                                {statusFilter === 'validated'
                                    ? 'Ajustez vos filtres ou changez la période'
                                    : `Aucune vente ${statusFilter === 'cancelled' ? 'annulée' : 'rejetée'} sur cette période`}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-2">
                            {viewMode === 'cards' ? (
                                <div className="space-y-4 max-w-5xl mx-auto">
                                    <SalesCardsView
                                        sales={filteredSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={setSelectedSale}
                                        getReturnsBySale={getFilteredReturnsBySale}
                                        users={safeUsers}
                                    />
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <SalesListView
                                        sales={filteredSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={setSelectedSale}
                                        getReturnsBySale={getFilteredReturnsBySale}
                                        users={safeUsers}
                                    />
                                </div>
                            ) : (
                                <div className="min-h-[500px]">
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
                                        returns={unifiedReturns}
                                        closeHour={closeHour}
                                        startDate={startDate}
                                        endDate={endDate}
                                        topProductMetric={topProductMetric}
                                        setTopProductMetric={setTopProductMetric}
                                        topProductsLimit={topProductsLimit}
                                        setTopProductsLimit={setTopProductsLimit}
                                        isLoadingTopProducts={isLoadingStats}
                                        viewMode={viewMode}
                                    />
                                </div>
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
                canCancel={canCancelSales}
                onCancelSale={handleCancelSale}
                hasReturns={selectedSale ? (getReturnsBySaleFromHook(selectedSale.id).length > 0) : false}
                hasConsignments={selectedSale ? consignments.some(c => c.saleId === selectedSale.id && ['active', 'claimed'].includes(c.status)) : false}
                returns={selectedSale ? getReturnsBySaleFromHook(selectedSale.id) : []}
                serverName={selectedSale ? (() => {
                    if (selectedSale.assignedTo) return selectedSale.assignedTo;
                    const serverId = selectedSale.serverId || selectedSale.soldBy;
                    if (serverId) {
                        return safeUsers.find(u => u.id === serverId)?.name;
                    }
                    return undefined;
                })() : undefined}
            />

            <GuideTourModal />
        </div>
    );
}