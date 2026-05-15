import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Search,
    Download,
    ShoppingCart,
    TrendingUp,
    LayoutGrid,
    List as ListIcon,
    ChevronDown
} from 'lucide-react';

import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { useUnifiedReturns } from '../hooks/pivots/useUnifiedReturns';
import { mapSalesData } from '../hooks/queries/useSalesQueries';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';
import { DataFreshnessIndicatorCompact } from '../components/DataFreshnessIndicator';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { useSalesMutations } from '../hooks/mutations/useSalesMutations';
import { useStock } from '../context/hooks/useStock';
import { SALES_HISTORY_FILTERS } from '../config/dateFilters';
import { User, getPermissionsByRole } from '../types';
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
import { SalesService } from '../services/supabase/sales.service';

type ViewMode = 'list' | 'cards' | 'analytics';

const PAGE_SIZE = 100; // Client pagination: render N items at a time

/**
 * SalesHistoryPage - Page d'historique des ventes
 * Route: /sales
 * Refactoré de composant nommé vers export default page
 */
export default function SalesHistoryPage() {
    const { currentBar } = useBarContext();
    const { products, categories, consignments } = useStock();
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
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
    const [serverSearchTerm, setServerSearchTerm] = useState<string>(''); // ✨ NOUVEAU: Failover Search

    const canCancelSales = currentSession
        ? getPermissionsByRole(currentSession.role).canCancelSales
        : false;
    const [statusFilter, setStatusFilter] = useState<'validated' | 'rejected' | 'cancelled' | 'all'>('validated');
    const [isTieringIgnored, setIsTieringIgnored] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // ✨ NOUVEAU: Pilotage temporel centralisé (Certification Elite)
    const dateFilter = useDateRangeFilter({
        defaultRange: 'today',
        includeBusinessDay: true,
        closeHour
    });

    const { timeRange, setTimeRange, startDate, endDate, updateCustomRange, customRange } = dateFilter;

    const needsDetailedSalesList = viewMode !== 'list' || searchTerm.length > 0;

    // ✨ NOUVEAU: Ventes & Retours Unifiés (Certification Perfection)
    const {
        sales: summarySales,
        isLoading: isLoadingSummarySales
    } = useUnifiedSales(currentBar?.id, {
        searchTerm: serverSearchTerm,
        timeRange,
        startDate: startDate?.toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0],
        status: statusFilter === 'all' ? undefined : statusFilter,
        ignoreTiering: isTieringIgnored,
        includeItems: false,
        enabled: !needsDetailedSalesList
    });

    const {
        sales: detailedSales,
        isLoading: isLoadingDetailedSales
    } = useUnifiedSales(currentBar?.id, {
        searchTerm: serverSearchTerm,
        timeRange,
        startDate: startDate?.toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0],
        status: statusFilter === 'all' ? undefined : statusFilter,
        ignoreTiering: isTieringIgnored,
        includeItems: true,
        enabled: needsDetailedSalesList
    });

    const unifiedSales = needsDetailedSalesList ? detailedSales : summarySales;
    const isLoadingSales = needsDetailedSalesList ? isLoadingDetailedSales : isLoadingSummarySales;

    // HOOK: Filtrage (Ventes & Retours)
    const {
        filteredSales,
        filteredReturns // ✨ MODE SWITCHING FIX: Get filtered returns from hook
    } = useSalesFilters({
        sales: unifiedSales as any, // Use unifiedSales
        returns: unifiedReturns, // Use unifiedReturns
        currentSession,
        closeHour,
        statusFilter, // Pass 'all' directly to the hook
        searchTerm,
        setSearchTerm,
        externalStartDate: startDate,
        externalEndDate: endDate,
    });

    const { data: selectedSaleDetail } = useQuery({
        queryKey: ['sales', 'detail', selectedSaleId],
        queryFn: async () => {
            const sale = await SalesService.getSaleById(selectedSaleId!);
            return mapSalesData([sale as any])[0] ?? null;
        },
        enabled: !!selectedSaleId && !needsDetailedSalesList,
        staleTime: 60_000,
    });

    const selectedSale = useMemo(() => {
        if (!selectedSaleId) return null;
        const saleFromActiveData = unifiedSales.find(sale => sale.id === selectedSaleId);
        return saleFromActiveData || selectedSaleDetail || null;
    }, [selectedSaleId, unifiedSales, selectedSaleDetail]);

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

    // ✨ Recherche unifiée : auto-failover vers serveur si 0 résultats locaux (debounce 500ms)
    const serverSearchTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const serverSearchTermRef = useRef(serverSearchTerm);
    serverSearchTermRef.current = serverSearchTerm;

    useEffect(() => {
        clearTimeout(serverSearchTimerRef.current);

        // Reset si terme effacé ou trop court
        if (!searchTerm || searchTerm.length < 3) {
            setServerSearchTerm('');
            return;
        }

        // Si des résultats locaux existent, pas besoin du serveur
        if (filteredSales.length > 0) {
            // Reset la recherche serveur si elle était active
            if (serverSearchTermRef.current) setServerSearchTerm('');
            return;
        }

        // 0 résultats locaux + terme ≥ 3 chars → déclencher recherche serveur après debounce
        if (serverSearchTermRef.current !== searchTerm) {
            serverSearchTimerRef.current = setTimeout(() => {
                setServerSearchTerm(searchTerm);
            }, 500);
        }

        return () => clearTimeout(serverSearchTimerRef.current);
    }, [searchTerm, filteredSales.length]);

    // Reset pagination when filters change
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [searchTerm, statusFilter, timeRange, startDate, endDate]);

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
            setSelectedSaleId(null);
        } catch (error: any) {
            showError(error.message || 'Erreur lors de l\'annulation');
        }
    };

    // ✨ FIX: Retours filtrés indexés par saleId — O(1) lookup per row
    const filteredReturnsBySaleMap = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const r of filteredReturns) {
            const saleId = (r as any).saleId;
            if (!saleId) continue;
            const existing = map.get(saleId);
            if (existing) {
                existing.push(r);
            } else {
                map.set(saleId, [r]);
            }
        }
        return map;
    }, [filteredReturns]);

    const getFilteredReturnsBySale = useCallback((saleId: string) => {
        return filteredReturnsBySaleMap.get(saleId) || [];
    }, [filteredReturnsBySaleMap]);

    // Client pagination: limit rendered items for list/cards views
    const paginatedSales = useMemo(() => {
        return filteredSales.slice(0, visibleCount);
    }, [filteredSales, visibleCount]);
    const hasMore = filteredSales.length > visibleCount;

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
                            Consultez et analysez vos transactions.
                            {!isMobile && (
                                <span className="ml-2 text-brand-primary font-semibold tabular-nums">
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
                    showBack={false}
                    actions={
                        !isMobile && (
                            <div className="flex items-center gap-2">
                                {/* Toggle format export — segmented control */}
                                <div
                                    role="radiogroup"
                                    aria-label="Format d'export"
                                    className="flex p-0.5 bg-gray-100 rounded-full border border-gray-200"
                                >
                                    <button
                                        role="radio"
                                        aria-checked={exportFormat === 'excel'}
                                        onClick={() => setExportFormat('excel')}
                                        className={`px-3 py-1.5 rounded-full text-caption transition-all ${exportFormat === 'excel' ? 'bg-white text-brand-primary shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900 font-medium'}`}
                                    >
                                        Excel
                                    </button>
                                    <button
                                        role="radio"
                                        aria-checked={exportFormat === 'csv'}
                                        onClick={() => setExportFormat('csv')}
                                        className={`px-3 py-1.5 rounded-full text-caption transition-all ${exportFormat === 'csv' ? 'bg-white text-brand-primary shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900 font-medium'}`}
                                    >
                                        CSV
                                    </button>
                                </div>

                                <Button
                                    onClick={() => exportSales(exportFormat)}
                                    title={`Exporter (${exportFormat.toUpperCase()})`}
                                    size="sm"
                                    variant="default"
                                    disabled={filteredSales.length === 0}
                                    className="gap-1.5"
                                >
                                    <Download size={16} />
                                    Exporter
                                </Button>
                            </div>
                        )
                    }
                />

                {/* Signalétique data tier */}
                {currentBar?.settings?.dataTier && currentBar.settings.dataTier !== 'lite' && (
                    <div className="bg-brand-subtle border-b border-brand-primary/10 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-caption text-brand-primary font-medium">
                            <TrendingUp size={14} />
                            <span>
                                Affichage optimisé :
                                {currentBar.settings.dataTier === 'balanced' ? ' 6 derniers mois' : ' 30 derniers jours'} chargés.
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setIsTieringIgnored(true);
                                setTimeRange('last_365days');
                                showSuccess('Chargement de l\'historique étendu...');
                            }}
                            className="text-caption bg-brand-primary text-white px-3 py-1 rounded-md hover:opacity-90 transition-opacity font-medium"
                        >
                            Voir plus
                        </button>
                    </div>
                )}

                {/* ==================== FILTERS AREA ==================== */}
                <div className="bg-card border-b border-border p-4 shadow-sm z-10" data-guide="sales-filters">
                    <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
                        {/* Bloc 1: Recherche + Période */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Rechercher ID ou produit..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 bg-muted border-border focus:bg-card transition-colors"
                                />
                                {/* Indicateur de recherche étendue (serveur) */}
                                {searchTerm && searchTerm.length >= 3 && filteredSales.length === 0 && isLoadingSales && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1">
                                        <span className="inline-block w-3 h-3 border-2 border-border border-t-brand-primary rounded-full animate-spin" />
                                        Recherche étendue…
                                    </span>
                                )}
                            </div>
                            {/* Unified Period Filter */}
                            <PeriodFilter
                                timeRange={timeRange}
                                setTimeRange={setTimeRange}
                                availableFilters={SALES_HISTORY_FILTERS}
                                customRange={customRange}
                                updateCustomRange={updateCustomRange}
                                className="w-full sm:w-auto mt-2 sm:mt-0"
                                buttonClassName="Ring-0 shadow-none border-0"
                            />
                        </div>

                        {/* Bloc 2: Statuts — segmented control */}
                        {canCancelSales && (
                            <div
                                role="radiogroup"
                                aria-label="Filtre par statut"
                                className="flex p-0.5 bg-muted rounded-full border border-border w-full lg:w-auto"
                            >
                                {(['validated', 'rejected', 'cancelled'] as const).map((status) => {
                                    const labels = { validated: 'Validées', rejected: 'Rejetées', cancelled: 'Annulées' };
                                    const isActive = statusFilter === status;
                                    return (
                                        <button
                                            key={status}
                                            role="radio"
                                            aria-checked={isActive}
                                            onClick={() => setStatusFilter(status)}
                                            className={`flex-1 lg:flex-none lg:min-w-[100px] px-3 py-1.5 rounded-full text-caption transition-all ${isActive
                                                ? 'bg-card text-brand-primary shadow-sm font-semibold'
                                                : 'text-muted-foreground hover:text-foreground font-medium'
                                                }`}
                                        >
                                            {labels[status]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Export format toggle & Action (mobile) */}
                    {isMobile && (
                        <div className="flex items-center gap-2 w-full pt-2 border-t border-border mt-2">
                            <span className="text-caption text-muted-foreground whitespace-nowrap">Format</span>
                            <div
                                role="radiogroup"
                                aria-label="Format d'export"
                                className="flex p-0.5 bg-muted rounded-full border border-border"
                            >
                                <button
                                    role="radio"
                                    aria-checked={exportFormat === 'excel'}
                                    onClick={() => setExportFormat('excel')}
                                    className={`px-3 py-1 rounded-full text-caption transition-all ${exportFormat === 'excel' ? 'bg-card text-brand-primary shadow-sm font-semibold' : 'text-muted-foreground font-medium'}`}
                                >
                                    XLS
                                </button>
                                <button
                                    role="radio"
                                    aria-checked={exportFormat === 'csv'}
                                    onClick={() => setExportFormat('csv')}
                                    className={`px-3 py-1 rounded-full text-caption transition-all ${exportFormat === 'csv' ? 'bg-card text-brand-primary shadow-sm font-semibold' : 'text-muted-foreground font-medium'}`}
                                >
                                    CSV
                                </button>
                            </div>

                            <Button
                                onClick={() => exportSales(exportFormat)}
                                size="sm"
                                variant="default"
                                disabled={filteredSales.length === 0}
                                className="ml-auto gap-1.5"
                            >
                                <Download size={14} />
                                Exporter
                            </Button>
                        </div>
                    )}
                </div>

                {/* ==================== CONTENT AREA ==================== */}
                <div className="flex-1 overflow-y-auto p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-4">
                        <DataFreshnessIndicatorCompact
                            viewName="sales_history"
                            onRefreshComplete={() => showSuccess('Données actualisées')}
                        />
                    </div>

                    {filteredSales.length === 0 ? (
                        <div className="text-center py-20 bg-card rounded-2xl border border-border shadow-sm">
                            <ShoppingCart size={48} className="text-muted-foreground/60 mx-auto mb-4" />
                            <h3 className="text-h3 text-foreground/80 mb-2">
                                {statusFilter === 'cancelled' ? 'Aucune vente annulée'
                                    : statusFilter === 'rejected' ? 'Aucune vente rejetée'
                                        : 'Aucune vente trouvée'}
                            </h3>
                            <p className="text-body-sm text-muted-foreground">
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
                                        sales={paginatedSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={(sale) => setSelectedSaleId(sale.id)}
                                        getReturnsBySale={getFilteredReturnsBySale}
                                        users={safeUsers}
                                    />
                                    {hasMore && (
                                        <div className="flex justify-center pt-2 pb-4">
                                            <button
                                                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                                                className="flex items-center gap-2 px-5 py-2 bg-white border border-gray-200 rounded-full text-body-sm font-medium text-gray-700 hover:border-brand-primary/40 hover:bg-brand-subtle hover:text-brand-primary transition-colors"
                                            >
                                                <ChevronDown size={16} />
                                                Voir plus <span className="tabular-nums">({filteredSales.length - visibleCount} restantes)</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <SalesListView
                                        sales={paginatedSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={(sale) => setSelectedSaleId(sale.id)}
                                        getReturnsBySale={getFilteredReturnsBySale}
                                        users={safeUsers}
                                    />
                                    {hasMore && (
                                        <div className="flex justify-center py-4 border-t border-gray-100">
                                            <button
                                                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                                                className="flex items-center gap-2 px-5 py-2 bg-white border border-gray-200 rounded-full text-body-sm font-medium text-gray-700 hover:border-brand-primary/40 hover:bg-brand-subtle hover:text-brand-primary transition-colors"
                                            >
                                                <ChevronDown size={16} />
                                                Voir plus <span className="tabular-nums">({filteredSales.length - visibleCount} restantes)</span>
                                            </button>
                                        </div>
                                    )}
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
            {selectedSale && (
                <SaleDetailModal
                    sale={selectedSale}
                    formatPrice={formatPrice}
                    onClose={() => setSelectedSaleId(null)}
                    canCancel={canCancelSales}
                    onCancelSale={handleCancelSale}
                    hasReturns={getReturnsBySaleFromHook(selectedSale.id).length > 0}
                    hasConsignments={consignments.some(c => c.saleId === selectedSale.id && ['active', 'claimed'].includes(c.status))}
                    returns={getReturnsBySaleFromHook(selectedSale.id)}
                    serverName={(() => {
                        if (selectedSale.assignedTo) return selectedSale.assignedTo;
                        const serverId = selectedSale.serverId || selectedSale.soldBy;
                        if (serverId) {
                            return safeUsers.find(u => u.id === serverId)?.name;
                        }
                        return undefined;
                    })()}
                />
            )}

            <GuideTourModal />
        </div>
    );
}
