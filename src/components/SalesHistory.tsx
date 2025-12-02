import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  Clock,
  //Calendar,
  //Filter,
  Search,
  Download,
  Eye,
  BarChart3,
  Users,
  ShoppingCart,
  X,
  ArrowUp,
  ArrowDown,
  Minus,
  RotateCcw,
  Archive,
  //ChevronDown
} from 'lucide-react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';
import { Sale, SaleItem, Category, Product, User, BarMember, Return } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay, getBusinessDayDateString } from '../utils/businessDay';
import { useStockManagement } from '../hooks/useStockManagement';
import { getSaleDate } from '../utils/saleHelpers';
import { AnalyticsService, TopProduct } from '../services/supabase/analytics.service';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { SALES_HISTORY_FILTERS, TIME_RANGE_CONFIGS } from '../config/dateFilters';
import { dateToYYYYMMDD, filterByBusinessDateRange, getBusinessDate } from '../utils/businessDateHelpers';
import type { TimeRange } from '../types/dateFilters';
import { TopProductsChart } from './analytics/TopProductsChart';

interface EnhancedSalesHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewMode = 'list' | 'cards' | 'analytics';

export function EnhancedSalesHistory({ isOpen, onClose }: EnhancedSalesHistoryProps) {
  const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
  const { barMembers, currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { isMobile } = useViewport();
  const { showSuccess } = useFeedback();
  const { consignments } = useStockManagement();

  // Récupérer l'heure de clôture (défaut: 6h)
  const closeHour = currentBar?.closingHour ?? 6;

  // ✨ Utiliser le hook de filtrage temporel avec Business Day
  const {
    timeRange,
    setTimeRange,
    startDate,
    endDate,
    customRange,
    updateCustomRange,
    isCustom
  } = useDateRangeFilter({
    defaultRange: 'today',
    includeBusinessDay: true,
    closeHour
  });

  // Protection: s'assurer que tous les tableaux sont définis
  const safeBarMembers = barMembers || [];
  // Derive users from barMembers for backward compatibility with child components
  const safeUsers = useMemo(() => {
    return safeBarMembers
      .map(m => m.user)
      .filter((u): u is User => !!u);
  }, [safeBarMembers]);

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
  
  // NOUVEAU : Limite Top Produits
  const [topProductsLimit, setTopProductsLimit] = useState<number>(5);
  // NOUVEAU : Metrique Top Produits
  const [topProductMetric, setTopProductMetric] = useState<'units' | 'revenue' | 'profit'>('units');

  // SQL Analytics State
  const [sqlTopProducts, setSqlTopProducts] = useState<TopProduct[]>([]);
  const [isLoadingTopProducts, setIsLoadingTopProducts] = useState(false);

  // Load top products from SQL view when filters change
  useEffect(() => {
    if (!currentBar || !isOpen) return;

    const loadTopProducts = async () => {
      setIsLoadingTopProducts(true);
      try {
        // ✨ Utiliser directement startDate et endDate du hook
        const products = await AnalyticsService.getTopProducts(currentBar.id, startDate, endDate, topProductsLimit);
        setSqlTopProducts(products);
      } catch (error) {
        console.error('Error loading top products:', error);
        setSqlTopProducts([]);
      } finally {
        setIsLoadingTopProducts(false);
      }
    };

    loadTopProducts();
  }, [currentBar, startDate, endDate, isOpen, viewMode, topProductsLimit]);

  // Filtrage des ventes
  const filteredSales = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    // 1. Filtrage initial basé sur le rôle
    const baseSales = sales.filter(sale => {
      if (isServer) {
        // Les serveurs voient toutes leurs ventes (pending, validated, rejected)
        return sale.createdBy === currentSession.userId;
      } else {
        // Gérants/Promoteurs voient seulement les ventes validées dans l'historique
        return sale.status === 'validated';
      }
    });

    // 2. Appliquer le filtre de date (utiliser startDate et endDate du hook)
    // Convertir les Dates en strings YYYY-MM-DD pour filterByBusinessDateRange
    const startDateStr = dateToYYYYMMDD(startDate);
    const endDateStr = dateToYYYYMMDD(endDate);

    const filtered = filterByBusinessDateRange(baseSales, startDateStr, endDateStr, closeHour);

    // 3. Filtre par recherche
    let finalFiltered = filtered;
    if (searchTerm) {
      finalFiltered = filtered.filter(sale =>
        sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.items.some((item: SaleItem) => {
          const name = item.product_name;
          return name.toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }

    return finalFiltered.sort((a, b) => getSaleDate(b).getTime() - getSaleDate(a).getTime());
  }, [sales, startDate, endDate, searchTerm, currentSession]);

  // Filtrage des consignations par période
  const filteredConsignments = useMemo(() => {
    const isServer = currentSession?.role === 'serveur';

    // 1. Filtrage initial basé sur le rôle
    const baseConsignments = consignments.filter(consignment => {
      if (isServer) {
        // 🔒 SERVEURS : Voir consignations de LEURS ventes (via originalSeller)
        return consignment.originalSeller === currentSession.userId;
      }
      return true; // Gérants/Promoteurs voient toutes les consignations
    });

    // 2. Appliquer les filtres de date sur la liste pré-filtrée
    let filtered = baseConsignments;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeRange) {
      case 'today': {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          const consignBusinessDay = getBusinessDay(consignDate, closeHour);
          return isSameDay(consignBusinessDay, currentBusinessDay);
        });
        break;
      }
      case 'week': {
        const currentDay = today.getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= monday && consignDate <= sunday;
        });
        break;
      }
      case 'month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= firstDay && consignDate <= lastDay;
        });
        break;
      }
      case 'custom': {
        const startDate = new Date(customRange.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customRange.end);
        endDate.setDate(endDate.getDate() + 1);
        filtered = baseConsignments.filter(c => {
          const consignDate = new Date(c.createdAt);
          return consignDate >= startDate && consignDate < endDate;
        });
        break;
      }
    }

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [consignments, timeRange, customRange, currentSession, closeHour]);

  // Statistiques
  const stats = useMemo(() => {
    // Total des ventes brutes
    const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

    // Déduire les retours remboursés des ventes affichées
    const saleIds = new Set(filteredSales.map(s => s.id));
    const refundedReturns = returns
      .filter(r =>
        saleIds.has(r.saleId) &&
        r.isRefunded &&
        (r.status === 'approved' || r.status === 'restocked')
      )
      .reduce((sum, r) => sum + r.refundAmount, 0);

    // CA NET = Ventes brutes - Retours remboursés
    const totalRevenue = grossRevenue - refundedReturns;

    const totalItems = filteredSales.reduce((sum, sale) =>
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );

    // KPI contextuel selon la période
    let kpiValue = 0;
    let kpiLabel = 'Panier moyen';

    // Calculer le nombre de jours dans la période sélectionnée
    const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    if (timeRange === 'today') {
      const now = new Date();
      // Assurer que "now" ne soit pas avant le début de la journée commerciale
      const effectiveNow = now < startDate ? startDate : now;
      const hoursElapsed = (effectiveNow.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      kpiValue = hoursElapsed > 0 ? totalRevenue / hoursElapsed : 0;
      kpiLabel = 'CA moyen/heure';
    } else {
      kpiValue = totalRevenue / dayCount;
      kpiLabel = 'CA moyen/jour';
    }

    const topProductsResult = (sqlTopProducts && sqlTopProducts.length > 0)
      ? sqlTopProducts.map(p => ({
          name: p.product_name,
          volume: p.product_volume || '',
          displayName: `${p.product_name}${p.product_volume ? ' (' + p.product_volume + ')' : ''}`,
          units: p.total_quantity,
          revenue: p.total_revenue,
          profit: p.total_revenue // Approximation sans coût réel
        }))
      : [];

    // Créer les 3 listes triées
    const byUnits = [...topProductsResult].sort((a, b) => b.units - a.units).slice(0, topProductsLimit);
    const byRevenue = [...topProductsResult].sort((a, b) => b.revenue - a.revenue).slice(0, topProductsLimit);
    const byProfit = [...topProductsResult].sort((a, b) => b.profit - a.profit).slice(0, topProductsLimit);

    return { totalRevenue, totalItems, kpiValue, kpiLabel, topProducts: { byUnits, byRevenue, byProfit } };
  }, [filteredSales, returns, timeRange, sqlTopProducts, topProductsLimit, startDate, endDate]);

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
        const categoryId = item.product_id; // Note: SaleItem doesn't have categoryId directly, might need lookup if critical
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 ${isMobile ? '' : 'p-4'}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`bg-gradient-to-br from-amber-50 to-amber-50 w-full shadow-2xl overflow-hidden flex flex-col ${isMobile
              ? 'h-full'
              : 'rounded-2xl max-w-7xl h-[85vh] md:h-[90vh]'
              }`}
          >
            {/* ==================== VERSION MOBILE ==================== */}
            {isMobile ? (
              <div className="flex flex-col h-full">
                {/* Header mobile */}
                <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-amber-500 text-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <TrendingUp size={24} />
                      <div>
                        <h2 className="text-lg font-bold">Historique</h2>
                        <p className="text-xs text-amber-100">{filteredSales.length} ventes</p>
                      </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                      <X size={24} />
                    </button>
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
                <div className="flex-shrink-0 bg-amber-50 p-3">
                  {/* Sélecteur format export mobile */}
                  <div className="flex gap-1 mb-3">
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
                  </div>

                  {/* Filtres période horizontaux */}
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                    {SALES_HISTORY_FILTERS.map(filter => (
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
                    ))}
                  </div>

                  {/* Date range personnalisée */}
                  {isCustom && (
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
                  )}

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

                    {/* Sélecteurs Top Produits Mobile */}
                    {viewMode === 'analytics' && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-amber-100 rounded-lg p-1">
                          <span className="text-sm font-medium text-amber-700 px-2">Top:</span>
                          <select
                            value={topProductsLimit}
                            onChange={(e) => setTopProductsLimit(Number(e.target.value))}
                            className="bg-white border border-amber-200 text-amber-700 text-sm rounded-lg p-1"
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                          </select>
                        </div>
                        <div className="flex items-center bg-amber-100 rounded-lg p-1">
                          <span className="text-sm font-medium text-amber-700 px-2">Par:</span>
                          <select
                            value={topProductMetric}
                            onChange={(e) => setTopProductMetric(e.target.value as 'units' | 'revenue' | 'profit')}
                            className="bg-white border border-amber-200 text-amber-700 text-sm rounded-lg p-1"
                          >
                            <option value="units">Unités</option>
                            <option value="revenue">CA</option>
                            <option value="profit">Bénéfices</option>
                          </select>
                        </div>
                      </div>
                    )}
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
                </div>

                {/* Contenu scrollable */}
                <div className="flex-1 overflow-y-auto p-3">
                  {filteredSales.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Aucune vente trouvée</p>
                    </div>
                  ) : viewMode === 'cards' ? (
                    <div className="space-y-3">
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
                  ) : viewMode === 'list' ? (
                    <SalesList
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
                      currentSession={currentSession}
                      customRange={customRange}
                      startDate={startDate}
                      endDate={endDate}
                      topProductMetric={topProductMetric}
                      setTopProductMetric={setTopProductMetric}
                      topProductsLimit={topProductsLimit}
                      viewMode={viewMode}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* ==================== VERSION DESKTOP ==================== */
              <>
                {/* Header desktop */}
                <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <TrendingUp size={28} />
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl font-bold">Historique des ventes</h2>
                          <DataFreshnessIndicatorCompact
                            viewName="top_products_by_period"
                            onRefreshComplete={async () => {
                              if (currentBar) {
                                const start = new Date();
                                start.setDate(start.getDate() - 30);
                                const end = new Date();
                                const products = await AnalyticsService.getTopProducts(currentBar.id, start, end, 100);
                                setTopProductsAnalytics(products);
                                showSuccess('✅ Données actualisées avec succès');
                              }
                            }}
                          />
                        </div>
                        <p className="text-sm text-amber-100">{filteredSales.length} ventes trouvées</p>
                      </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                      <X size={24} />
                    </button>
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
                          ? 'bg-white text-amber-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                          }`}
                      >
                        {TIME_RANGE_CONFIGS[filter].label}
                      </button>
                    ))}
                  </div>

                  {/* Date Range Custom */}
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
                          {/* Sélecteur Limite Top Produits (Visible seulement en Analytics) */}
                          {viewMode === 'analytics' && (
                            <>
                              <div className="flex bg-gray-100 rounded-lg p-1">
                                <span className="text-sm font-medium text-gray-600 py-1.5 px-3">Nombre de Top produits:</span>
                                <select
                                  value={topProductsLimit}
                                  onChange={(e) => setTopProductsLimit(Number(e.target.value))}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-white text-amber-600 shadow-sm"
                                >
                                  <option value={5}>5</option>
                                  <option value={10}>10</option>
                                  <option value={20}>20</option>
                                  <option value={50}>50</option>
                                </select>
                              </div>
                              <div className="flex bg-gray-100 rounded-lg p-1">
                                <span className="text-sm font-medium text-gray-600 py-1.5 px-3">Afficher par:</span>
                                <select
                                  value={topProductMetric}
                                  onChange={(e) => setTopProductMetric(e.target.value as 'units' | 'revenue' | 'profit')}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-white text-amber-600 shadow-sm"
                                >
                                  <option value="units">Unités vendues</option>
                                  <option value="revenue">Chiffre d'affaires</option>
                                  <option value="profit">Bénéfices</option>
                                </select>
                              </div>
                            </>
                          )}
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
                            <SalesList
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
                                                    isLoadingTopProducts={isLoadingTopProducts}
                                                  />
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </motion.div>
                                          {/* Détail vente */}
          {selectedSale && (
            <SaleDetailModal
              sale={selectedSale}
              formatPrice={formatPrice}
              onClose={() => setSelectedSale(null)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Composant carte de vente
function SaleCard({
  sale,
  formatPrice,
  onViewDetails,
  getReturnsBySale,
  users
}: {
  sale: Sale;
  formatPrice: (price: number) => string;
  onViewDetails: () => void;
  getReturnsBySale?: (saleId: string) => any[];
  users?: User[];
}) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculer le montant des retours remboursés
  const saleReturns = getReturnsBySale ? getReturnsBySale(sale.id) : [];
  const refundedAmount = saleReturns
    .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
    .reduce((sum, r) => sum + r.refundAmount, 0);

  const netAmount = sale.total - refundedAmount;
  const hasReturns = saleReturns.length > 0;

  // Badge de statut
  const statusBadge = {
    pending: { label: '⏳ En attente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    validated: { label: '✅ Validée', color: 'bg-green-100 text-green-700 border-green-200' },
    rejected: { label: '❌ Rejetée', color: 'bg-red-100 text-red-700 border-red-200' }
  }[sale.status];

  // Infos utilisateurs
  const creator = users?.find(u => u.id === sale.createdBy);
  const validator = sale.validatedBy ? users?.find(u => u.id === sale.validatedBy) : null;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-xl p-4 border border-amber-100 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-800">Vente #{sale.id.slice(-6)}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {getSaleDate(sale).toLocaleDateString('fr-FR')} • {getSaleDate(sale).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {creator && (
            <p className="text-xs text-gray-500 mt-1">
              Par: {creator.name}
              {validator && ` • Validée par: ${validator.name}`}
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-amber-600">{formatPrice(sale.total)}</span>
          {hasReturns && refundedAmount > 0 && (
            <p className="text-xs text-red-600 font-medium">
              -{formatPrice(refundedAmount).replace(/\s/g, '')}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {sale.items.slice(0, 2).map((item: any, index) => {
          const name = item.product?.name || item.product_name || 'Produit';
          const volume = item.product?.volume || item.product_volume || '';
          const price = item.product?.price || item.unit_price || 0;
          return (
            <div key={index} className="flex justify-between text-sm">
              <span className="text-gray-700">{item.quantity}x {name} {volume ? `(${volume})` : ''}</span>
              <span className="text-gray-600">{formatPrice(price * item.quantity)}</span>
            </div>
          );
        })}
        {sale.items.length > 2 && (
          <p className="text-sm text-gray-500">... et {sale.items.length - 2} autres articles</p>
        )}
      </div>

      {/* Affichage des retours et montant net */}
      {hasReturns && (
        <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-700 font-medium">
              <RotateCcw size={14} className="inline mr-1" />
              {saleReturns.length} retour{saleReturns.length > 1 ? 's' : ''}
            </span>
            <span className="text-gray-800 font-semibold">
              Net: {formatPrice(netAmount)}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{itemCount} articles</span>
        <EnhancedButton
          variant="info"
          size="sm"
          onClick={onViewDetails}
          icon={<Eye size={14} />}
        >
          Détails
        </EnhancedButton>
      </div>
    </motion.div>
  );
}

// Composant liste des ventes
function SalesList({
  sales,
  formatPrice,
  onViewDetails,
  getReturnsBySale,
  users
}: {
  sales: Sale[];
  formatPrice: (price: number) => string;
  onViewDetails: (sale: Sale) => void;
  getReturnsBySale: (saleId: string) => any[];
  users?: User[];
}) {
  return (
    <div className="bg-white rounded-xl border border-amber-100 overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="bg-amber-50">
          <tr>
            <th className="text-left p-4 font-medium text-gray-700">ID</th>
            <th className="text-left p-4 font-medium text-gray-700">Statut</th>
            <th className="text-left p-4 font-medium text-gray-700">Date</th>
            <th className="text-left p-4 font-medium text-gray-700">Vendeur</th>
            <th className="text-left p-4 font-medium text-gray-700">Articles</th>
            <th className="text-left p-4 font-medium text-gray-700">Total</th>
            <th className="text-left p-4 font-medium text-gray-700">Retours</th>
            <th className="text-left p-4 font-medium text-gray-700">Net</th>
            <th className="text-left p-4 font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map(sale => {
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

            // Calculer le montant des retours remboursés
            const saleReturns = getReturnsBySale(sale.id);
            const refundedAmount = saleReturns
              .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
              .reduce((sum, r) => sum + r.refundAmount, 0);

            const netAmount = sale.total - refundedAmount;
            const hasReturns = saleReturns.length > 0;

            // Badge de statut
            const statusBadge = {
              pending: { label: '⏳ En attente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
              validated: { label: '✅ Validée', color: 'bg-green-100 text-green-700 border-green-200' },
              rejected: { label: '❌ Rejetée', color: 'bg-red-100 text-red-700 border-red-200' }
            }[sale.status];

            // Infos utilisateurs
            const creator = users?.find(u => u.id === sale.createdBy);
            const validator = sale.validatedBy ? users?.find(u => u.id === sale.validatedBy) : null;

            return (
              <tr key={sale.id} className="border-t border-amber-100 hover:bg-amber-50">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span>#{sale.id.slice(-6)}</span>
                    {hasReturns && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {saleReturns.length} retour{saleReturns.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full border ${statusBadge.color}`}>
                    {statusBadge.label}
                  </span>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-sm">{getSaleDate(sale).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-gray-600">{getSaleDate(sale).toLocaleTimeString('fr-FR')}</p>
                  </div>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-sm font-medium">{creator?.name || 'Inconnu'}</p>
                    {validator && (
                      <p className="text-xs text-gray-500">Val.: {validator.name}</p>
                    )}
                  </div>
                </td>
                <td className="p-4">{itemCount} articles</td>
                <td className="p-4">
                  <span className={`font-semibold ${hasReturns ? 'text-gray-500 line-through' : 'text-amber-600'}`}>
                    {formatPrice(sale.total)}
                  </span>
                </td>
                <td className="p-4">
                  {refundedAmount > 0 ? (
                    <span className="text-red-600 font-medium">-{formatPrice(refundedAmount)}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="p-4">
                  <span className="font-bold text-green-600">{formatPrice(netAmount)}</span>
                </td>
                <td className="p-4">
                  <EnhancedButton
                    variant="info"
                    size="sm"
                    onClick={() => onViewDetails(sale)}
                    icon={<Eye size={14} />}
                  >
                    Voir
                  </EnhancedButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Vue analytics
type Stats = {
  totalRevenue: number;
  totalItems: number;
  kpiValue: number;
  kpiLabel: string;
  topProducts: {
    name: string;
    volume: string;
    count: number;
    revenue: number;
  }[];
};

// Couleurs thème orange/ambre
const CHART_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#ea580c', '#c2410c'];

function AnalyticsView({
  sales,
  stats,
  formatPrice,
  categories,
  products: _products,
  users,
  barMembers,
  timeRange,
  isMobile,
  returns,
  closeHour,
  filteredConsignments,
  startDate,
  endDate,
  topProductMetric,
  setTopProductMetric,
  topProductsLimit,
  isLoadingTopProducts,
  viewMode
}: {
  sales: Sale[];
  stats: Stats;
  formatPrice: (price: number) => string;
  categories: Category[];
  products: Product[];
  users: User[];
  barMembers: BarMember[];
  timeRange: string;
  isMobile: boolean;
  returns: Return[];
  closeHour: number;
  filteredConsignments: any[];
  startDate: Date;
  endDate: Date;
  topProductMetric: 'units' | 'revenue' | 'profit';
  setTopProductMetric: (metric: 'units' | 'revenue' | 'profit') => void;
  topProductsLimit: number;
  isLoadingTopProducts: boolean;
  viewMode: ViewMode;
}) {
  console.log('AnalyticsView - viewMode:', viewMode);
  console.log('AnalyticsView - topProductsData (stats.topProducts):', stats.topProducts);
  console.log('AnalyticsView - topProductsData (byUnits):', stats.topProducts.byUnits); // Correction ici, topProductsData est directement dans stats
  console.log('AnalyticsView - topProductMetric:', topProductMetric);
  console.log('AnalyticsView - topProductsLimit:', topProductsLimit);
  // Protection: s'assurer que tous les tableaux sont définis
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  const { sales: allSales } = useAppContext();

  // Calculer période précédente pour comparaison
  const { previousPeriodSales } = useMemo(() => {
    // 1. Calculer la durée de la période actuelle
    const currentDuration = endDate.getTime() - startDate.getTime();
    if (currentDuration <= 0) return { previousPeriodSales: [] };

    // 2. Déterminer les dates de la période précédente
    const previousEnd = startDate;
    const previousStart = new Date(previousEnd.getTime() - currentDuration);
    
    // 3. Convertir en strings YYYY-MM-DD pour le filtrage
    const prevStartDateStr = dateToYYYYMMDD(previousStart);
    // `-1` milliseconde pour garantir que la date de fin est exclusive et éviter tout chevauchement avec la `startDate` de la période actuelle.
    const prevEndDateStr = dateToYYYYMMDD(new Date(previousEnd.getTime() - 1));

    // 4. Filtrer les ventes GLOBALES avec le helper centralisé
    const previous = filterByBusinessDateRange(allSales, prevStartDateStr, prevEndDateStr, closeHour);
    
    return { previousPeriodSales: previous };
  }, [allSales, startDate, endDate, closeHour]);

  // KPIs avec tendances
  const kpis = useMemo(() => {
    const prevRevenue = previousPeriodSales.reduce((sum, s) => sum + s.total, 0);
    const prevCount = previousPeriodSales.length;
    const prevItems = previousPeriodSales.reduce((sum, s) =>
      sum + s.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );

    const revenueChange = prevRevenue > 0 ? ((stats.totalRevenue - prevRevenue) / prevRevenue) * 100 : (stats.totalRevenue > 0 ? 100 : 0);
    const salesChange = prevCount > 0 ? ((sales.length - prevCount) / prevCount) * 100 : (sales.length > 0 ? 100 : 0);
    const itemsChange = prevItems > 0 ? ((stats.totalItems - prevItems) / prevItems) * 100 : (stats.totalItems > 0 ? 100 : 0);

    return {
      revenue: { value: stats.totalRevenue, change: revenueChange },
      salesCount: { value: sales.length, change: salesChange },
      kpi: { value: stats.kpiValue, label: stats.kpiLabel, change: 0 },
      items: { value: stats.totalItems, change: itemsChange }
    };
  }, [sales, stats, previousPeriodSales]);

  // Statistiques consignations
  const consignmentStats = useMemo(() => {
    const activeConsignments = filteredConsignments.filter(c => c.status === 'active');
    const claimedConsignments = filteredConsignments.filter(c => c.status === 'claimed');
    const expiredConsignments = filteredConsignments.filter(c => c.status === 'expired');
    const forfeitedConsignments = filteredConsignments.filter(c => c.status === 'forfeited');

    const activeValue = activeConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
    const claimedValue = claimedConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalValue = filteredConsignments.reduce((sum, c) => sum + c.totalAmount, 0);

    const totalQuantity = filteredConsignments.reduce((sum, c) => sum + c.quantity, 0);
    const claimedQuantity = claimedConsignments.reduce((sum, c) => sum + c.quantity, 0);
    const claimRate = filteredConsignments.length > 0
      ? (claimedConsignments.length / filteredConsignments.length) * 100
      : 0;

    return {
      total: filteredConsignments.length,
      active: activeConsignments.length,
      claimed: claimedConsignments.length,
      expired: expiredConsignments.length,
      forfeited: forfeitedConsignments.length,
      activeValue,
      claimedValue,
      totalValue,
      totalQuantity,
      claimedQuantity,
      claimRate
    };
  }, [filteredConsignments]);

  // Données pour graphique d'évolution - granularité adaptative
  const evolutionChartData = useMemo(() => {
    const grouped: Record<string, { label: string; revenue: number; sales: number; timestamp: number }> = {};
    const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    sales.forEach(sale => { // 'sales' here is the filtered list from props
      if (sale.status !== 'validated') return;
      
      let label: string;
      const saleDate = getSaleDate(sale);

      if (dayCount <= 2) { // Today, Yesterday -> group by hour
        const hour = saleDate.getHours();
        label = `${hour.toString().padStart(2, '0')}h`;
      } else if (dayCount <= 14) { // Up to 2 weeks -> group by day
        label = saleDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
      } else { // More than 2 weeks -> group by day (DD/MM)
        label = saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      }

      if (!grouped[label]) {
        grouped[label] = { label, revenue: 0, sales: 0, timestamp: saleDate.getTime() };
      }
      grouped[label].revenue += sale.total;
      grouped[label].sales += 1;
      grouped[label].timestamp = Math.min(grouped[label].timestamp, saleDate.getTime());
    });

    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
  }, [sales, startDate, endDate]);

  // Répartition par catégorie (sur CA BRUT pour avoir le détail des ventes)
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    let totalGross = 0;

    sales.forEach(sale => { // 'sales' is now the filtered list passed in props
      sale.items.forEach((item: any) => {
        const productId = item.product?.id || item.product_id;
        const product = _products.find(p => p.id === productId);
        const categoryId = product?.categoryId;

        const category = categories.find(c => c.id === categoryId);
        const catName = category?.name || 'Autre';
        const price = item.unit_price || 0;
        const itemRevenue = price * item.quantity;
        catRevenue[catName] = (catRevenue[catName] || 0) + itemRevenue;
        totalGross += itemRevenue;
      });
    });

    // Calculer les pourcentages sur le total BRUT pour cohérence
    return Object.entries(catRevenue).map(([name, value]) => ({
      name,
      value,
      percentage: totalGross > 0 ? (value / totalGross) * 100 : 0
    }));
  }, [sales, categories, _products]);

  // Performance par utilisateur
  const [userFilter, setUserFilter] = useState<'all' | 'servers' | 'management'>('all');

  const userPerformance = useMemo(() => {
    const userStats: Record<string, { name: string; role: string; revenue: number; sales: number; items: number }> = {};

    // Les ventes sont déjà filtrées par période via useDateRangeFilter
    // On n'a plus besoin de refiltrer, juste d'utiliser 'sales' directement
    const performanceSales = sales;

    // 1. Ajouter les ventes (déjà filtrées par période)
    performanceSales.forEach(sale => {
      // Mode simplifié : utiliser assignedTo si présent
      // Mode complet : utiliser createdBy (userId)
      if (sale.assignedTo) {
        // Mode simplifié - assignedTo contient le nom du serveur
        const serverName = sale.assignedTo;

        if (!userStats[serverName]) {
          // Détecter si c'est le gérant/promoteur qui a servi lui-même
          let role = 'serveur';
          if (serverName.includes('Moi (')) {
            if (serverName.includes('Gérant')) role = 'gerant';
            else if (serverName.includes('Promoteur')) role = 'promoteur';
          }

          userStats[serverName] = {
            name: serverName,
            role,
            revenue: 0,
            sales: 0,
            items: 0
          };
        }

        userStats[serverName].revenue += sale.total;
        userStats[serverName].sales += 1;
        userStats[serverName].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      } else {
        // Mode complet - utiliser createdBy (userId)
        const user = safeUsers.find(u => u.id === sale.createdBy);
        if (!user) {

          return;
        }

        // Chercher d'abord dans barMembers, sinon utiliser le rôle de l'utilisateur
        const member = safeBarMembers.find(m => m.userId === user.id);
        const role = member?.role || 'serveur';

        if (!userStats[user.id]) {
          userStats[user.id] = {
            name: user.name,
            role,
            revenue: 0,
            sales: 0,
            items: 0
          };
        }

        userStats[user.id].revenue += sale.total;
        userStats[user.id].sales += 1;
        userStats[user.id].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      }
    });

    // 2. Déduire les retours remboursés de la période filtrée
    // 🔒 SERVEURS : Seulement retours de LEURS ventes (même logique que getTodayTotal)
    const performanceSaleIds = new Set(performanceSales.map(s => s.id));

    // Filtrer les retours par business_date (même logique que les ventes)
    const startDateStr = dateToYYYYMMDD(startDate);
    const endDateStr = dateToYYYYMMDD(endDate);

    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;
      // 🔒 IMPORTANT: Seulement retours des ventes affichées
      if (!performanceSaleIds.has(r.saleId)) return false;

      // Filtrer par business_date du retour
      const returnBusinessDate = getBusinessDate(r, closeHour);
      return returnBusinessDate >= startDateStr && returnBusinessDate <= endDateStr;
    });

    // Déduire les retours du revenue de chaque vendeur
    filteredReturns.forEach(ret => {
      // Trouver la vente originale pour identifier le vendeur
      // ✅ IMPORTANT: Chercher dans performanceSales (même période)
      const originalSale = performanceSales.find(s => s.id === ret.saleId);
      if (!originalSale) {

        return; // Vente hors période, ignorer
      }

      const identifier = originalSale.assignedTo || originalSale.createdBy;


      if (userStats[identifier]) {
        userStats[identifier].revenue -= ret.refundAmount;
      } else {
        console.warn('❌ Identifier non trouvé dans userStats:', identifier);
      }
    });

    const allUsers = Object.values(userStats);

    if (userFilter === 'servers') {
      return allUsers.filter(u => u.role === 'serveur');
    } else if (userFilter === 'management') {
      return allUsers.filter(u => u.role === 'gerant' || u.role === 'promoteur');
    }

    return allUsers;
  }, [sales, returns, safeUsers, safeBarMembers, userFilter, closeHour, startDate, endDate]);

  // Top produits - 3 analyses (CA NET = Ventes - Retours)
  const topProductsData = useMemo(() => {
    const productStats: Record<string, { name: string; volume: string; units: number; revenue: number; profit: number }> = {};

    // 1. Ajouter les ventes
    sales.forEach(sale => {
      sale.items.forEach((item: any) => {
        const productId = item.product?.id || item.product_id;
        const productName = item.product?.name || item.product_name || 'Produit';
        const productVolume = item.product?.volume || item.product_volume || '';
        const productPrice = item.product?.price || item.unit_price || 0;

        if (!productId) return; // Skip items without product ID

        if (!productStats[productId]) {
          productStats[productId] = {
            name: productName,
            volume: productVolume,
            units: 0,
            revenue: 0,
            profit: 0
          };
        }
        productStats[productId].units += item.quantity;
        productStats[productId].revenue += productPrice * item.quantity;
        productStats[productId].profit += productPrice * item.quantity; // TODO: Déduire coût réel
      });
    });

    // 2. Déduire les retours remboursés
    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;

      const returnDate = new Date(r.returnedAt);

      if (timeRange === 'today') {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      } else if (timeRange === 'week') {
        const currentDay = new Date().getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return returnDate >= monday && returnDate <= sunday;
      } else if (timeRange === 'month') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        return returnDate >= firstDay && returnDate <= lastDay;
      } else if (timeRange === 'custom') {
        return true;
      }
      return false;
    });

    filteredReturns.forEach(ret => {
      if (productStats[ret.productId]) {
        productStats[ret.productId].units -= ret.quantityReturned;
        productStats[ret.productId].revenue -= ret.refundAmount;
        productStats[ret.productId].profit -= ret.refundAmount; // Approximation sans coût
      }
    });

    const products = Object.values(productStats).map(p => ({
      ...p,
      displayName: `${p.name} ${p.volume ? `(${p.volume})` : ''}`
    }));

    return {
      byUnits: products.sort((a, b) => b.units - a.units).slice(0, 5),
      byRevenue: products.sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      byProfit: products.sort((a, b) => b.profit - a.profit).slice(0, 5)
    };
  }, [sales, returns, timeRange, closeHour]);

  const TrendIcon = ({ change }: { change: number }) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getRoleBadge = (role: string) => {
    if (role === 'promoteur') return { icon: '🏆', color: 'bg-yellow-100 text-yellow-800', label: 'Promoteur' };
    if (role === 'gerant') return { icon: '👔', color: 'bg-purple-100 text-purple-800', label: 'Gérant' };
    return { icon: '👨‍💼', color: 'bg-blue-100 text-blue-800', label: 'Serveur' };
  };

  // Message si pas de données
  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart3 size={64} className="text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">Aucune donnée disponible</h3>
        <p className="text-sm text-gray-500">Effectuez des ventes pour voir les analytics</p>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {/* KPIs principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`}>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Chiffre d'affaires</h4>
          <p className="text-xl font-bold text-amber-900">{formatPrice(kpis.revenue.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.revenue.change} />
            <span className={`text-xs font-medium ${kpis.revenue.change > 0 ? 'text-green-600' : kpis.revenue.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.revenue.change > 0 ? '+' : ''}{kpis.revenue.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Ventes totales</h4>
          <p className="text-xl font-bold text-amber-900">{kpis.salesCount.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.salesCount.change} />
            <span className={`text-xs font-medium ${kpis.salesCount.change > 0 ? 'text-green-600' : kpis.salesCount.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.salesCount.change > 0 ? '+' : ''}{kpis.salesCount.change.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">{kpis.kpi.label}</h4>
          <p className="text-xl font-bold text-amber-900">{formatPrice(kpis.kpi.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-600">Période actuelle</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <h4 className="text-xs font-medium text-amber-700 mb-1">Articles vendus</h4>
          <p className="text-xl font-bold text-amber-900">{kpis.items.value}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendIcon change={kpis.items.change} />
            <span className={`text-xs font-medium ${kpis.items.change > 0 ? 'text-green-600' : kpis.items.change < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {kpis.items.change > 0 ? '+' : ''}{kpis.items.change.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Graphiques principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
        {/* Évolution CA - granularité adaptative */}
        <div className="bg-white rounded-xl p-4 border border-amber-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">
            Évolution du CA
            <span className="text-xs text-gray-500 ml-2">
              ({timeRange === 'today' ? 'par heure' : timeRange === 'week' ? 'par jour' : timeRange === 'month' ? 'par semaine' : 'par jour'})
            </span>
          </h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <LineChart data={evolutionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #fdba74', borderRadius: '8px' }}
                formatter={(value: number) => formatPrice(value)}
              />
              <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition par catégorie */}
        <div className="bg-white rounded-xl p-4 border border-amber-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Répartition par catégorie</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 40 : 60}
                outerRadius={isMobile ? 70 : 90}
                paddingAngle={2}
                dataKey="value"
                label={(entry: any) => `${entry.percentage.toFixed(0)}%`}
              >
                {categoryData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Legend
                layout={isMobile ? "horizontal" : "vertical"}
                align={isMobile ? "center" : "right"}
                verticalAlign={isMobile ? "bottom" : "middle"}
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section Consignations */}
      {consignmentStats.total > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-semibold text-gray-800">Consignations</h4>
          </div>

          {/* Stats grid */}
          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-5'} gap-3 mb-3`}>
            <div className="bg-white rounded-lg p-3 border border-indigo-100">
              <p className="text-xs text-gray-600 mb-1">Total</p>
              <p className="text-lg font-bold text-indigo-900">{consignmentStats.total}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.totalValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-gray-600 mb-1">Actives</p>
              <p className="text-lg font-bold text-blue-900">{consignmentStats.active}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.activeValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-green-100">
              <p className="text-xs text-gray-600 mb-1">Récupérées</p>
              <p className="text-lg font-bold text-green-900">{consignmentStats.claimed}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(consignmentStats.claimedValue)}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="text-xs text-gray-600 mb-1">Expirées</p>
              <p className="text-lg font-bold text-amber-900">{consignmentStats.expired}</p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-red-100">
              <p className="text-xs text-gray-600 mb-1">Confisquées</p>
              <p className="text-lg font-bold text-red-900">{consignmentStats.forfeited}</p>
            </div>
          </div>

          {/* Taux de récupération */}
          <div className="bg-white rounded-lg p-3 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700">Taux de récupération</span>
              <span className="text-sm font-bold text-indigo-900">{consignmentStats.claimRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(consignmentStats.claimRate, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {consignmentStats.claimedQuantity} articles sur {consignmentStats.totalQuantity} récupérés
            </p>
          </div>
        </div>
      )}

      {/* Performance équipe */}
      <div className="bg-white rounded-xl p-4 border border-amber-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Performance Équipe</h4>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value as any)}
            className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">Tous</option>
            <option value="servers">Serveurs</option>
            <option value="management">Management</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-amber-100">
                <th className="text-left text-xs font-medium text-gray-600 pb-2 px-1">Nom</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">CA</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">Ventes</th>
                <th className="text-right text-xs font-medium text-gray-600 pb-2 px-1">% CA</th>
              </tr>
            </thead>
            <tbody>
              {userPerformance.sort((a, b) => b.revenue - a.revenue).map((user, index) => {
                const badge = getRoleBadge(user.role);
                return (
                  <tr key={index} className="border-b border-amber-50">
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-right text-sm font-semibold text-amber-600 py-2 px-2">
                      {formatPrice(user.revenue)}
                    </td>
                    <td className="text-right text-sm text-gray-600 py-2 px-2">{user.sales}</td>
                    <td className="text-right text-sm font-medium text-gray-700 py-2 px-1">
                      {((user.revenue / stats.totalRevenue) * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top produits - Composant dédié */}
      <TopProductsChart
        data={stats.topProducts}
        metric={topProductMetric}
        onMetricChange={setTopProductMetric}
        limit={topProductsLimit}
        isLoading={isLoadingTopProducts}
        isMobile={isMobile}
        formatPrice={formatPrice}
      />
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
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