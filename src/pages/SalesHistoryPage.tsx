import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Download,
    Eye,
    Users,
    ShoppingCart,
    TrendingUp,
    ArrowLeft,
    X
} from 'lucide-react';

import { motion } from 'framer-motion';
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
import { SALES_HISTORY_FILTERS, TIME_RANGE_CONFIGS } from '../config/dateFilters';
import { useSalesFilters } from '../features/Sales/SalesHistory/hooks/useSalesFilters';
import { useSalesStats } from '../features/Sales/SalesHistory/hooks/useSalesStats';
import { AnalyticsView } from '../features/Sales/SalesHistory/views/AnalyticsView';
import { SalesListView } from '../features/Sales/SalesHistory/views/SalesListView';
import { SalesCardsView, SaleCard } from '../features/Sales/SalesHistory/views/SalesCardsView';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAutoGuide } from '../hooks/useGuideTrigger';
import { useOnboarding } from '../context/OnboardingContext';
import { useGuide } from '../context/GuideContext';
import { GuideTourModal } from '../components/guide/GuideTourModal';

type ViewMode = 'list' | 'cards' | 'analytics';

/**
 * SalesHistoryPage - Page d'historique des ventes
 * Route: /sales
 * Refactoré de composant nommé vers export default page
 */
export default function SalesHistoryPage() {
    const navigate = useNavigate();
    const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
    const { barMembers, currentBar } = useBarContext();
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession } = useAuth();
    const { isMobile } = useViewport();
    const { showSuccess } = useFeedback();
    const { consignments } = useStockManagement();
    const { isComplete: onboardingComplete } = useOnboarding();
    const { hasCompletedGuide } = useGuide();

    // Auto-trigger stats guide for bartenders
    useAutoGuide(
        'bartender-stats',
        onboardingComplete && currentSession?.role === 'serveur' && !hasCompletedGuide('bartender-stats'),
        { delay: 2000 }
    );

    // Auto-trigger history/analytics guide for owners
    useAutoGuide(
        'analytics-overview',
        onboardingComplete && currentSession?.role === 'promoteur' && !hasCompletedGuide('analytics-overview'),
        { delay: 2500 }
    );

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
        customRange,
        updateCustomRange,
        isCustom,
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
            const dateA = new Date(`${a.Date} ${a.Heure}`);
            const dateB = new Date(`${b.Date} ${b.Heure}`);
            return dateB.getTime() - dateA.getTime();
        });

        const fileName = `ventes_${new Date().toISOString().split('T')[0]}`;




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


    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50 pb-16 md:pb-0">
            <div className={`bg-gradient-to-br from-amber-50 to-amber-50 w-full overflow-hidden flex flex-col ${isMobile
                ? 'h-full'
                : 'max-w-7xl mx-auto'
                }`}
            >
                {/* ==================== VERSION MOBILE ==================== */}
                {isMobile ? (
                    <div className="flex flex-col h-full">
                        {/* Header mobile */}
                        <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-amber-500 text-white p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(-1)}
                                    className="rounded-lg transition-colors hover:bg-white/20"
                                >
                                    <ArrowLeft size={24} />
                                </Button>
                                <div className="flex items-center gap-3">
                                    <TrendingUp size={24} />
                                    <div>
                                        <h1 className="text-lg font-bold">Historique</h1>
                                        <p className="text-xs text-amber-100">{filteredSales.length} ventes</p>
                                    </div>
                                </div>
                            </div>
                            <Button
                                onClick={exportSales}
                                disabled={filteredSales.length === 0}
                                title={`Exporter en ${exportFormat.toUpperCase()}`}
                                className="w-full mt-2 flex items-center justify-center gap-2"
                            >
                                <Download size={18} className="mr-2" />
                                <span className="text-sm font-medium">Exporter ({exportFormat.toUpperCase()})</span>
                            </Button>
                        </div>

                        {/* Filtres compacts en haut (stats retirées, disponibles dans Analytics) */}
                        <div className="flex-shrink-0 bg-amber-50 p-3" data-guide="sales-filters">
                            {/* Sélecteur format export mobile */}
                            <div className="flex gap-1 mb-3" >
                                <Button
                                    onClick={() => setExportFormat('excel')}
                                    variant={exportFormat === 'excel' ? 'default' : 'secondary'}
                                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg"
                                >
                                    📊 Excel
                                </Button>
                                <Button
                                    onClick={() => setExportFormat('csv')}
                                    variant={exportFormat === 'csv' ? 'default' : 'secondary'}
                                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg"
                                >
                                    📄 CSV
                                </Button>
                            </div >

                            {/* Filtres période horizontaux */}
                            <div className="flex gap-2 overflow-x-auto pb-2 mb-3" >
                                {
                                    SALES_HISTORY_FILTERS.map(filter => (
                                        <Button
                                            key={filter}
                                            onClick={() => setTimeRange(filter)}
                                            variant={timeRange === filter ? 'default' : 'secondary'}
                                            className="px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium"
                                        >
                                            {TIME_RANGE_CONFIGS[filter].label}
                                        </Button>
                                    ))
                                }
                            </div >

                            {/* Date range personnalisée */}
                            {
                                isCustom && (
                                    <div className="flex gap-2 mb-3">
                                        <Input
                                            type="date"
                                            value={customRange.start}
                                            onChange={(e) => updateCustomRange('start', e.target.value)}
                                            placeholder="Début"
                                            className="flex-1 text-sm"
                                        />
                                        <Input
                                            type="date"
                                            value={customRange.end}
                                            onChange={(e) => updateCustomRange('end', e.target.value)}
                                            placeholder="Fin"
                                            className="flex-1 text-sm"
                                        />
                                    </div>
                                )
                            }

                            {/* Recherche et Sélecteurs Top Produits (mobile) */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {/* Recherche */}
                                <Input
                                    type="text"
                                    placeholder="ID vente ou produit..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    leftIcon={<Search size={16} />}
                                    className="flex-1 min-w-[150px] text-sm"
                                />
                            </div>

                            {/* Mode d'affichage */}
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {[
                                    { value: 'list', icon: Users, label: 'Liste' },
                                    { value: 'cards', icon: Eye, label: 'Détails' },
                                    { value: 'analytics', icon: TrendingUp, label: 'Analytics' }
                                ].map(mode => {
                                    const Icon = mode.icon;
                                    return (
                                        <Button
                                            key={mode.value}
                                            onClick={() => setViewMode(mode.value as ViewMode)}
                                            variant={viewMode === mode.value ? 'default' : 'secondary'}
                                            className="px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium flex items-center gap-1"
                                        >
                                            <Icon size={14} className="mr-1" />
                                            {mode.label}
                                        </Button>
                                    );
                                })}
                            </div >
                        </div >

                        {/* Contenu scrollable */}
                        < div className="flex-1 overflow-y-auto p-3" >
                            {
                                filteredSales.length === 0 ? (
                                    <div className="text-center py-12">
                                        <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                                        <p className="text-gray-500">Aucune vente trouvée</p>
                                    </div>
                                ) : viewMode === 'cards' ? (
                                    <div className="space-y-3">
                                        <SalesCardsView
                                            sales={filteredSales}
                                            formatPrice={formatPrice}
                                            onViewDetails={setSelectedSale}
                                            getReturnsBySale={getReturnsBySale}
                                            users={safeUsers}
                                        />
                                    </div>
                                ) : viewMode === 'list' ? (
                                    <SalesListView
                                        sales={filteredSales}
                                        formatPrice={formatPrice}
                                        onViewDetails={setSelectedSale}
                                        getReturnsBySale={getReturnsBySale}
                                        users={safeUsers}
                                    />
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
                                )
                            }
                        </div >
                    </div >
                ) : (
                    /* ==================== VERSION DESKTOP ==================== */
                    <>
                        {/* Header desktop */}
                        <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(-1)}
                                    className="rounded-lg transition-colors hover:bg-white/20"
                                >
                                    <ArrowLeft size={24} />
                                </Button>
                                <div className="flex items-center gap-3">
                                    <TrendingUp size={28} />
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-xl font-bold">Historique des ventes</h1>
                                            <DataFreshnessIndicatorCompact
                                                viewName="top_products_by_period"
                                                onRefreshComplete={async () => {
                                                    showSuccess('✅ Données actualisées avec succès');
                                                }}
                                            />
                                        </div>
                                        <p className="text-sm text-amber-100">{filteredSales.length} ventes trouvées</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Sélecteur de format d'export */}
                                <div className="flex items-center gap-1 mr-2 bg-white/20 rounded-lg p-1">
                                    <Button
                                        onClick={() => setExportFormat('excel')}
                                        variant="ghost"
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${exportFormat === 'excel'
                                            ? 'bg-white text-amber-900'
                                            : 'text-white hover:bg-white/10'
                                            }`}
                                    >
                                        Excel
                                    </Button>
                                    <Button
                                        onClick={() => setExportFormat('csv')}
                                        variant="ghost"
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${exportFormat === 'csv'
                                            ? 'bg-white text-amber-900'
                                            : 'text-white hover:bg-white/10'
                                            }`}
                                    >
                                        CSV
                                    </Button>
                                </div>
                                <Button
                                    onClick={exportSales}
                                    disabled={filteredSales.length === 0}
                                    className="px-4 py-2 flex items-center gap-2"
                                >
                                    <Download size={16} className="mr-2" />
                                    <span className="text-sm font-medium">Exporter ({exportFormat.toUpperCase()})</span>
                                </Button>
                            </div>
                        </div>
                        {/* Barre de filtres Desktop */}
                        <div className="flex-shrink-0 bg-white border-b border-amber-200 p-4 flex items-center gap-4 flex-wrap" data-guide="sales-filters">

                            {/* Filtres de date */}
                            <div className="flex bg-gray-100 rounded-lg p-1">
                                {SALES_HISTORY_FILTERS.map(filter => (
                                    <Button
                                        key={filter}
                                        onClick={() => setTimeRange(filter)}
                                        variant={timeRange === filter ? 'default' : 'ghost'}
                                        className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                                    >
                                        {TIME_RANGE_CONFIGS[filter].label}
                                    </Button>
                                ))}
                            </div>

                            {/* Date range Custom */}
                            {isCustom && (
                                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                                    <Input
                                        type="date"
                                        value={customRange.start}
                                        onChange={(e) => updateCustomRange('start', e.target.value)}
                                        className="p-1.5 bg-transparent text-sm"
                                    />
                                    <span className="text-gray-600">-</span>
                                    <Input
                                        type="date"
                                        value={customRange.end}
                                        onChange={(e) => updateCustomRange('end', e.target.value)}
                                        className="p-1.5 bg-transparent text-sm"
                                    />
                                </div>
                            )}

                            {/* Recherche */}
                            <Input
                                type="text"
                                placeholder="ID vente ou produit..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                leftIcon={<Search size={16} />}
                                className="w-64 text-sm bg-gray-50 border-amber-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />

                            <div className="flex-1"></div>


                        </div>
                        <div className="flex flex-1 overflow-hidden">


                            {/* Contenu principal */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {/* Toolbar */}
                                <div className="flex-shrink-0 p-4 border-b border-amber-200 bg-amber-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600">Mode d'affichage:</span>
                                            <div className="flex border border-amber-300 rounded-lg overflow-hidden">
                                                {[
                                                    { value: 'list', icon: Users, label: 'Liste' },
                                                    { value: 'cards', icon: Eye, label: 'Détails' },
                                                    { value: 'analytics', icon: TrendingUp, label: 'Analytics' }
                                                ].map(mode => {
                                                    const Icon = mode.icon;
                                                    return (
                                                        <Button
                                                            key={mode.value}
                                                            onClick={() => setViewMode(mode.value as ViewMode)}
                                                            variant={viewMode === mode.value ? 'default' : 'ghost'}
                                                            className="px-3 py-1.5 text-sm flex items-center gap-1 transition-colors"
                                                        >
                                                            <Icon size={14} className="mr-1" />
                                                            {mode.label}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Contenu ventes */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {(() => {


                                        if (filteredSales.length === 0) {
                                            return (
                                                <div className="text-center py-12">
                                                    <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                                                    <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune vente trouvée</h3>
                                                    <p className="text-gray-500">Ajustez vos filtres ou changez la période</p>
                                                </div>
                                            );
                                        }

                                        if (viewMode === 'cards') {

                                            return (
                                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                                    {filteredSales.map(sale => (
                                                        <SaleCard
                                                            key={sale.id}
                                                            sale={sale}
                                                            formatPrice={formatPrice}
                                                            onViewDetails={() => setSelectedSale(sale)}
                                                            getReturnsBySale={getReturnsBySale}
                                                            users={safeUsers}
                                                        />
                                                    ))}
                                                </div>
                                            );
                                        }

                                        if (viewMode === 'list') {

                                            return (
                                                <SalesListView
                                                    sales={filteredSales}
                                                    formatPrice={formatPrice}
                                                    onViewDetails={setSelectedSale}
                                                    getReturnsBySale={getReturnsBySale}
                                                    users={safeUsers}
                                                />
                                            );
                                        }


                                        return (
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
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Détail vente */}
            {selectedSale && (
                <SaleDetailModal
                    sale={selectedSale}
                    formatPrice={formatPrice}
                    onClose={() => setSelectedSale(null)}
                />
            )}

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