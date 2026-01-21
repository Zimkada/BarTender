import { useState, useMemo } from 'react';
import {
    Search,
    Download,
    ShoppingCart,
    TrendingUp,
    LayoutGrid,
    List as ListIcon,
    X
} from 'lucide-react';

import { motion } from 'framer-motion';
import { useNotifications } from '../components/Notifications';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';
import { useStockManagement } from '../hooks/useStockManagement';
import { DataFreshnessIndicatorCompact } from '../components/DataFreshnessIndicator';
import { useRealtimeSales } from '../hooks/useRealtimeSales';
import { Sale, SaleItem, User } from '../types';
import { getSaleDate } from '../utils/saleHelpers';
// import { AnalyticsService } from '../services/supabase/analytics.service'; // Unused
import { SALES_HISTORY_FILTERS } from '../config/dateFilters';
import { useSalesFilters } from '../features/Sales/SalesHistory/hooks/useSalesFilters';
import { useSalesStats } from '../features/Sales/SalesHistory/hooks/useSalesStats';
import { AnalyticsView } from '../features/Sales/SalesHistory/views/AnalyticsView';
import { SalesListView } from '../features/Sales/SalesHistory/views/SalesListView';
import { SalesCardsView } from '../features/Sales/SalesHistory/views/SalesCardsView';
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
    const { showNotification } = useNotifications();
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

    const [viewMode, setViewMode] = useState<ViewMode>('cards');
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

    const exportSales = async () => {

        // Préparer les données avec la nouvelle structure: lignes pour ventes + lignes pour retours
        const exportData: any[] = [];

        // 1. Ajouter toutes les ventes
        filteredSales.forEach(sale => {
            // Source of truth: soldBy is the business attribution
            const serverUserId = sale.soldBy;
            const user = safeUsers.find(u => u.id === serverUserId);
            const member = safeBarMembers.find(m => m.userId === user?.id);
            const vendeur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            // Déterminer le mode d'opération de cette vente
            const operationMode = sale.serverId ? 'Simplifié' : 'Complet';

            const saleDate = getSaleDate(sale);
            // Get actual transaction time (not business date which is normalized to midnight)
            const saleTimestamp = sale.validatedAt || sale.createdAt;
            sale.items.forEach((item: SaleItem) => {
                const name = item.product_name;
                const volume = item.product_volume || '';
                const price = item.unit_price;
                // For now, we can try to find product to get category
                const product = products.find(p => p.id === item.product_id);
                const category = categories.find(c => c.id === product?.categoryId);
                const cost = 0; // TODO: Calculer depuis Supply
                const total = price * item.quantity;
                const benefice = (price - cost) * item.quantity;

                exportData.push({
                    'Type': 'Vente',
                    'Mode': operationMode,
                    'Date': saleDate.toLocaleDateString('fr-FR'),
                    'Heure': saleTimestamp.toLocaleTimeString('fr-FR'),
                    'ID Transaction': sale.id.slice(-6),
                    'Produit': name,
                    'Catégorie': category?.name || 'Non classé',
                    'Volume': volume,
                    'Quantité': item.quantity,
                    'Prix unitaire': price,
                    'Coût unitaire': cost,
                    'Total': total,
                    'Bénéfice': benefice,
                    'Utilisateur': vendeur,
                    'Rôle': role,
                    'Statut': sale.status,
                    'Devise': sale.currency
                });
            });
        });

        // 2. Ajouter les retours associés aux ventes filtrées
        const saleIds = new Set(filteredSales.map(s => s.id));
        const relevantReturns = returns.filter(r => saleIds.has(r.saleId));

        relevantReturns.forEach(ret => {
            // Récupérer le produit via productId
            const product = products.find(p => p.id === ret.productId);
            if (!product) {
                console.warn('⚠️ Retour avec produit introuvable:', ret.id);
                return;
            }

            // Source of truth: server_id is the business attribution for returns
            const serverUserId = ret.server_id;
            const user = safeUsers.find(u => u.id === serverUserId);
            const member = safeBarMembers.find(m => m.userId === user?.id);
            const utilisateur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            // Déterminer le mode d'opération de ce retour (basé sur la vente originale)
            const originalSale = sales.find(s => s.id === ret.saleId);
            const operationMode = originalSale?.serverId ? 'Simplifié' : 'Complet';

            const category = categories.find(c => c.id === product.categoryId);
            const cost = 0; // TODO: Calculer depuis Supply
            const total = ret.isRefunded ? -ret.refundAmount : 0; // Négatif si remboursé
            const benefice = ret.isRefunded ? -(ret.refundAmount - (cost * ret.quantityReturned)) : 0;

            exportData.push({
                'Type': 'Retour',
                'Mode': operationMode,
                'Date': new Date(ret.returnedAt).toLocaleDateString('fr-FR'),
                'Heure': new Date(ret.returnedAt).toLocaleTimeString('fr-FR'),
                'ID Transaction': ret.id.slice(-6),
                'Produit': ret.productName,
                'Catégorie': category?.name || 'Non classé',
                'Volume': ret.productVolume || '',
                'Quantité': -ret.quantityReturned, // Négatif pour indiquer retour
                'Prix unitaire': product.price,
                'Coût unitaire': cost,
                'Total': total,
                'Bénéfice': benefice,
                'Utilisateur': utilisateur,
                'Rôle': role,
                'Devise': 'XOF'
            });
        });

        // 3. Ajouter toutes les consignations de la période filtrée
        filteredConsignments.forEach(consignment => {
            const product = products.find(p => p.id === consignment.productId);
            if (!product) {
                console.warn('⚠️ Consignation sans produit ignoré:', consignment.id);
                return;
            }

            // ✨ MODE SWITCHING FIX: Always deduce seller from the sale, not from consignment.createdBy
            // This matches the logic in ConsignmentPage: prioritize serverId (assigned server) over createdBy
            let utilisateur = 'Inconnu';
            let role = 'serveur';
            let operationMode = 'Complet';

            const originalSale = sales.find(s => s.id === consignment.saleId);
            if (originalSale) {
                // Source of truth: soldBy is the business attribution
                const serverUserId = originalSale.soldBy;
                const user = safeUsers.find(u => u.id === serverUserId);
                const member = safeBarMembers.find(m => m.userId === user?.id);
                utilisateur = user?.name || 'Inconnu';
                role = member?.role || 'serveur';
                operationMode = originalSale.serverId ? 'Simplifié' : 'Complet';
            }

            const category = categories.find(c => c.id === product.categoryId);

            // Déterminer le statut pour affichage
            let statusLabel = '';
            switch (consignment.status) {
                case 'active':
                    statusLabel = 'Active';
                    break;
                case 'claimed':
                    statusLabel = 'Récupérée';
                    break;
                case 'expired':
                    statusLabel = 'Expirée';
                    break;
                case 'forfeited':
                    statusLabel = 'Confisquée';
                    break;
            }

            exportData.push({
                'Type': 'Consignation',
                'Mode': operationMode,
                'Date': new Date(consignment.createdAt).toLocaleDateString('fr-FR'),
                'Heure': new Date(consignment.createdAt).toLocaleTimeString('fr-FR'),
                'ID Transaction': consignment.id.slice(-6),
                'Produit': product.name,
                'Catégorie': category?.name || 'Non classé',
                'Volume': product.volume || '',
                'Quantité': consignment.quantity,
                'Prix unitaire': product.price,
                'Coût unitaire': 0, // Les produits n'ont pas de coût dans le modèle actuel
                'Total': consignment.totalAmount,
                'Bénéfice': 0, // Consignations = pas de bénéfice immédiat
                'Utilisateur': utilisateur,
                'Rôle': role,
                'Devise': 'XOF',
                'Statut': statusLabel,
                'Client': consignment.customerName || '',
                'Expiration': new Date(consignment.expiresAt).toLocaleDateString('fr-FR')
            });
        });

        // Trier par date/heure décroissante
        exportData.sort((a, b) => {
            const dateA = new Date(`${a.Date} ${a.Heure} `);
            const dateB = new Date(`${b.Date} ${b.Heure} `);
            return dateB.getTime() - dateA.getTime();
        });

        const fileName = `ventes_${new Date().toISOString().split('T')[0]} `;




        if (exportData.length === 0) {
            alert('Aucune donnée à exporter pour la période sélectionnée');
            return;
        }

        if (exportFormat === 'excel') {
            // Lazy load XLSX library only when export is triggered (~300 Kio savings)
            const XLSX = await import('xlsx');

            // Export Excel
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes');

            // Ajuster la largeur des colonnes
            const columnWidths = [
                { wch: 10 }, // Type
                { wch: 12 }, // Mode
                { wch: 12 }, // Date
                { wch: 10 }, // Heure
                { wch: 12 }, // ID Transaction
                { wch: 20 }, // Produit
                { wch: 15 }, // Catégorie
                { wch: 10 }, // Volume
                { wch: 10 }, // Quantité
                { wch: 12 }, // Prix unitaire
                { wch: 12 }, // Coût unitaire
                { wch: 12 }, // Total
                { wch: 12 }, // Bénéfice
                { wch: 15 }, // Utilisateur
                { wch: 12 }, // Rôle
                { wch: 8 }   // Devise
            ];
            worksheet['!cols'] = columnWidths;

            try {
                XLSX.writeFile(workbook, `${fileName}.xlsx`);
            } catch (error) {
                console.error('❌ Erreur export Excel:', error);
                alert(`Erreur lors de l'export Excel: ${error}`);
            }
        } else {
            // Export CSV
            const headers = Object.keys(exportData[0] || {});
            const csvContent = [
                headers.join(','),
                ...exportData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
            ].join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${fileName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };


    const tabsConfig = [
        { id: 'cards', label: isMobile ? 'Cartes' : 'Détails des ventes', icon: LayoutGrid },
        { id: 'list', label: isMobile ? 'Liste' : 'Tableau des ventes', icon: ListIcon },
        { id: 'analytics', label: isMobile ? 'Analytics' : 'Statistiques & Analyses', icon: TrendingUp }
    ] as { id: string; label: string; icon: any }[];

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 pb-16 md:pb-0">
            <div className={`w-full flex flex-col ${isMobile ? 'h-full' : 'max-w-7xl mx-auto'}`}>
                <TabbedPageHeader
                    title={isMobile ? 'Historique' : 'Historique des ventes'}
                    subtitle={
                        <span>
                            Consultez et analysez votre historique
                            {!isMobile && <span className="ml-2 text-amber-200 font-medium">• {filteredSales.length} ventes</span>}
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
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${exportFormat === 'excel' ? 'bg-green-600 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                                    >
                                        Excel
                                    </button>
                                    <button
                                        onClick={() => setExportFormat('csv')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${exportFormat === 'csv' ? 'bg-blue-600 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                                    >
                                        CSV
                                    </button>
                                </div>

                                <Button
                                    onClick={() => {
                                        if (filteredSales.length === 0) {
                                            showNotification('error', "Aucune vente à exporter");
                                            return;
                                        }
                                        exportSales();
                                    }}
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
                                        onClick={() => {
                                            if (filteredSales.length === 0) {
                                                showNotification('error', "Aucune vente à exporter");
                                                return;
                                            }
                                            exportSales();
                                        }}
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
            {
                selectedSale && (
                    <SaleDetailModal
                        sale={selectedSale}
                        formatPrice={formatPrice}
                        onClose={() => setSelectedSale(null)}
                    />
                )
            }

            <GuideTourModal />
        </div>
    );
}

// Modal détail vente
function SaleDetailModal({
    sale,
    formatPrice,
    onClose
}: {
    sale: Sale;
    formatPrice: (price: number) => string;
    onClose: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Détail vente #{sale.id.slice(-6)}</h3>
                    <Button onClick={onClose} variant="ghost" size="icon" className="p-2 text-gray-600 hover:text-gray-600">
                        <X size={20} />
                    </Button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <p className="text-sm text-gray-600">Date et heure</p>
                        <p className="font-medium">{new Date(sale.validatedAt || sale.createdAt).toLocaleString('fr-FR')}</p>
                    </div>

                    <div>
                        <p className="text-sm text-gray-600 mb-2">Articles vendus</p>
                        <div className="space-y-2">
                            {sale.items.map((item: any, index) => {
                                const name = item.product?.name || item.product_name || 'Produit';
                                const volume = item.product?.volume || item.product_volume || '';
                                const price = item.product?.price || item.unit_price || 0;
                                return (
                                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-gray-800">{name} {volume ? `(${volume})` : ''}</p>
                                            <p className="text-sm text-gray-600">Qté: {item.quantity}</p>
                                        </div>
                                        <span className="font-semibold text-amber-600">
                                            {formatPrice(price * item.quantity)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-gray-800">Total</span>
                            <span className="text-xl font-bold text-amber-600">{formatPrice(sale.total)}</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}