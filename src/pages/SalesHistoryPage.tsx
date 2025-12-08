import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
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

    // HOOK: Filtrage (Ventes & Consignations)
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
        filteredConsignments
    } = useSalesFilters({
        sales,
        consignments,
        currentSession,
        closeHour
    });

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
        returns,
        timeRange,
        startDate,
        endDate,
        currentBar
    });

    const exportSales = () => {

        // Préparer les données avec la nouvelle structure: lignes pour ventes + lignes pour retours
        const exportData: any[] = [];

        // 1. Ajouter toutes les ventes
        filteredSales.forEach(sale => {
            const user = safeUsers.find(u => u.id === sale.createdBy);
            const member = safeBarMembers.find(m => m.userId === user?.id);
            const vendeur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            const saleDate = getSaleDate(sale);
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
                    'Date': saleDate.toLocaleDateString('fr-FR'),
                    'Heure': saleDate.toLocaleTimeString('fr-FR'),
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

            const user = safeUsers.find(u => u.id === ret.returnedBy);
            const member = safeBarMembers.find(m => m.userId === user?.id);
            const utilisateur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

            const category = categories.find(c => c.id === product.categoryId);
            const cost = 0; // TODO: Calculer depuis Supply
            const total = ret.isRefunded ? -ret.refundAmount : 0; // Négatif si remboursé
            const benefice = ret.isRefunded ? -(ret.refundAmount - (cost * ret.quantityReturned)) : 0;

            exportData.push({
                'Type': 'Retour',
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

            const user = safeUsers.find(u => u.id === consignment.createdBy);
            const member = safeBarMembers.find(m => m.userId === user?.id);
            const utilisateur = user?.name || 'Inconnu';
            const role = member?.role || 'serveur';

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
            // Export Excel
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes');

            // Ajuster la largeur des colonnes
            const columnWidths = [
                { wch: 10 }, // Type
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
                                        <h2 className="text-lg font-bold">Historique</h2>
                                        <p className="text-xs text-amber-100">{filteredSales.length} ventes</p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={exportSales}
                                className="w-full mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                disabled={filteredSales.length === 0}
                                title={`Exporter en ${exportFormat.toUpperCase()}`}
                            >
                                <Download size={18} />
                                <span className="text-sm font-medium">Exporter ({exportFormat.toUpperCase()})</span>
                            </button>
                        </div>

                        {/* Filtres compacts en haut (stats retirées, disponibles dans Analytics) */}
                        < div className="flex-shrink-0 bg-amber-50 p-3" >
                            {/* Sélecteur format export mobile */}
                            < div className="flex gap-1 mb-3" >
                                <button
                                    onClick={() => setExportFormat('excel')}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${exportFormat === 'excel'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white text-gray-600'
                                        }`}
                                >
                                    📊 Excel
                                </button>
                                <button
                                    onClick={() => setExportFormat('csv')}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${exportFormat === 'csv'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white text-gray-600'
                                        }`}
                                >
                                    📄 CSV
                                </button>
                            </div >

                            {/* Filtres période horizontaux */}
                            < div className="flex gap-2 overflow-x-auto pb-2 mb-3" >
                                {
                                    SALES_HISTORY_FILTERS.map(filter => (
                                        <button
                                            key={filter}
                                            onClick={() => setTimeRange(filter)}
                                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${timeRange === filter
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-white text-gray-700'
                                                }`}
                                        >
                                            {TIME_RANGE_CONFIGS[filter].label}
                                        </button>
                                    ))
                                }
                            </div >

                            {/* Date range personnalisée */}
                            {
                                isCustom && (
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="date"
                                            value={customRange.start}
                                            onChange={(e) => updateCustomRange('start', e.target.value)}
                                            className="flex-1 p-2 border border-amber-200 rounded-lg bg-white text-sm"
                                            placeholder="Début"
                                        />
                                        <input
                                            type="date"
                                            value={customRange.end}
                                            onChange={(e) => updateCustomRange('end', e.target.value)}
                                            className="flex-1 p-2 border border-amber-200 rounded-lg bg-white text-sm"
                                            placeholder="Fin"
                                        />
                                    </div>
                                )
                            }

                            {/* Recherche et Sélecteurs Top Produits (mobile) */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {/* Recherche */}
                                <div className="relative flex-1 min-w-[150px]">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="ID vente ou produit..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 border border-amber-200 rounded-lg bg-white text-sm"
                                    />
                                </div>
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
                                        <button
                                            key={mode.value}
                                            onClick={() => setViewMode(mode.value as ViewMode)}
                                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === mode.value
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-white text-gray-700'
                                                }`}
                                        >
                                            <Icon size={14} />
                                            {mode.label}
                                        </button>
                                    );
                                })}
                            </div>
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
                                            <h2 className="text-xl font-bold">Historique des ventes</h2>
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
                                <div className="flex items-center gap-1 mr-2">
                                    <button
                                        onClick={() => setExportFormat('excel')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${exportFormat === 'excel'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        Excel
                                    </button>
                                    <button
                                        onClick={() => setExportFormat('csv')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${exportFormat === 'csv'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        CSV
                                    </button>
                                </div>
                                <button
                                    onClick={exportSales}
                                    disabled={filteredSales.length === 0}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Download size={16} />
                                    <span className="text-sm font-medium">Exporter</span>
                                </button>
                            </div>
                        </div>
                        {/* Barre de filtres Desktop */}
                        <div className="flex-shrink-0 bg-white border-b border-amber-200 p-4 flex items-center gap-4 flex-wrap">

                            {/* Filtres de date */}
                            <div className="flex bg-gray-100 rounded-lg p-1">
                                {SALES_HISTORY_FILTERS.map(filter => (
                                    <button
                                        key={filter}
                                        onClick={() => setTimeRange(filter)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${timeRange === filter
                                            ? 'bg-amber-500 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                    >
                                        {TIME_RANGE_CONFIGS[filter].label}
                                    </button>
                                ))}
                            </div>

                            {/* Date range Custom */}
                            {isCustom && (
                                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                                    <input
                                        type="date"
                                        value={customRange.start}
                                        onChange={(e) => updateCustomRange('start', e.target.value)}
                                        className="p-1.5 bg-transparent text-sm outline-none"
                                    />
                                    <span className="text-gray-400">-</span>
                                    <input
                                        type="date"
                                        value={customRange.end}
                                        onChange={(e) => updateCustomRange('end', e.target.value)}
                                        className="p-1.5 bg-transparent text-sm outline-none"
                                    />
                                </div>
                            )}

                            {/* Recherche */}
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="ID vente ou produit..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-amber-200 rounded-lg bg-gray-50 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

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
                                                        <button
                                                            key={mode.value}
                                                            onClick={() => setViewMode(mode.value as ViewMode)}
                                                            className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${viewMode === mode.value
                                                                ? 'bg-amber-500 text-white'
                                                                : 'bg-white text-gray-700 hover:bg-amber-100'
                                                                }`}
                                                        >
                                                            <Icon size={14} />
                                                            {mode.label}
                                                        </button>
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
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <p className="text-sm text-gray-600">Date et heure</p>
                        <p className="font-medium">{getSaleDate(sale).toLocaleString('fr-FR')}</p>
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