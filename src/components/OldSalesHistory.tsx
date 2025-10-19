import React, { useState, useMemo } from 'react';
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
  //ChevronDown
} from 'lucide-react';
import {
  BarChart,
  Bar,
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
import { EnhancedButton } from './EnhancedButton';
import { Sale, Category, Product, User, BarMember, Return } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';

interface EnhancedSalesHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimeFilter = 'today' | 'week' | 'month' | 'custom';
type ViewMode = 'list' | 'cards' | 'analytics';

export function EnhancedSalesHistory({ isOpen, onClose }: EnhancedSalesHistoryProps) {
  const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
  const { barMembers, currentBar } = useBarContext();
  const formatPrice = useCurrencyFormatter();
  const { currentSession, users } = useAuth();
  const { isMobile } = useViewport();

  // Récupérer l'heure de clôture (défaut: 6h)
  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;

  // Protection: s'assurer que tous les tableaux sont définis
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Filtrage des ventes
  const filteredSales = useMemo(() => {
    let filtered = sales;

    // Filtre par date avec logique journée commerciale
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeFilter) {
      case 'today': {
        // Utiliser la journée commerciale actuelle
        const currentBusinessDay = getCurrentBusinessDay(closeHour);

        filtered = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          const saleBusinessDay = getBusinessDay(saleDate, closeHour);
          return isSameDay(saleBusinessDay, currentBusinessDay);
        });
        break;
      }
      case 'week': {
        // Semaine calendaire : Lundi-Dimanche
        const currentDay = today.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1; // Distance depuis lundi
        const monday = new Date(today);
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        filtered = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= monday && saleDate <= sunday;
        });
        break;
      }
      case 'month': {
        // Mois calendaire : du 1er au dernier jour du mois
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDayOfMonth.setHours(0, 0, 0, 0);

        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDayOfMonth.setHours(23, 59, 59, 999);

        filtered = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= firstDayOfMonth && saleDate <= lastDayOfMonth;
        });
        break;
      }
      case 'custom': {
        const startDate = new Date(customDateRange.start);
        const endDate = new Date(customDateRange.end);
        endDate.setDate(endDate.getDate() + 1);
        filtered = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= startDate && saleDate < endDate;
        });
        break;
      }
    }

    // Filtre par recherche
    if (searchTerm) {
      filtered = filtered.filter(sale => 
        sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.items.some(item => 
          item.product.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Filtre par utilisateur (serveurs voient leurs ventes uniquement)
    if (currentSession?.role === 'serveur') {
      filtered = filtered.filter(sale => sale.processedBy === currentSession.userId);
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, timeFilter, searchTerm, customDateRange, currentSession, closeHour]);

  // Statistiques
  const stats = useMemo(() => {
    // Total des ventes brutes
    const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

    // Déduire les retours remboursés de la période filtrée
    const refundedReturns = returns
      .filter(r => {
        // Seulement les retours approuvés/restockés avec remboursement
        if (r.status !== 'approved' && r.status !== 'restocked') return false;
        if (!r.isRefunded) return false;

        const returnDate = new Date(r.returnedAt);

        // Filtrer selon la période active
        if (timeFilter === 'today') {
          const currentBusinessDay = getCurrentBusinessDay(closeHour);
          const returnBusinessDay = getBusinessDay(returnDate, closeHour);
          return isSameDay(returnBusinessDay, currentBusinessDay);
        } else if (timeFilter === 'week') {
          const currentDay = new Date().getDay();
          const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
          const monday = new Date();
          monday.setDate(monday.getDate() - daysFromMonday);
          monday.setHours(0, 0, 0, 0);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          return returnDate >= monday && returnDate <= sunday;
        } else if (timeFilter === 'month') {
          const today = new Date();
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          firstDay.setHours(0, 0, 0, 0);
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          lastDay.setHours(23, 59, 59, 999);
          return returnDate >= firstDay && returnDate <= lastDay;
        } else if (timeFilter === 'custom') {
          const start = new Date(customDateRange.start);
          const end = new Date(customDateRange.end);
          return returnDate >= start && returnDate <= end;
        }
        return false;
      })
      .reduce((sum, r) => sum + r.refundAmount, 0);

    // CA NET = Ventes brutes - Retours remboursés
    const totalRevenue = grossRevenue - refundedReturns;

    const totalItems = filteredSales.reduce((sum, sale) =>
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );

    // KPI contextuel selon la période
    let kpiValue = 0;
    let kpiLabel = 'Panier moyen';

    if (timeFilter === 'today') {
      // CA moyen/heure pour aujourd'hui
      const now = new Date();
      const barToday = getCurrentBusinessDay(closeHour);
      const hoursElapsed = (now.getTime() - barToday.getTime()) / (1000 * 60 * 60);
      kpiValue = hoursElapsed > 0 ? totalRevenue / hoursElapsed : 0;
      kpiLabel = 'CA moyen/heure';
    } else if (timeFilter === 'week') {
      // CA moyen/jour pour semaine calendaire (lundi-dimanche = 7 jours)
      kpiValue = totalRevenue / 7;
      kpiLabel = 'CA moyen/jour';
    } else if (timeFilter === 'month') {
      // CA moyen/jour pour mois calendaire (nombre réel de jours du mois)
      const today = new Date();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      kpiValue = totalRevenue / daysInMonth;
      kpiLabel = 'CA moyen/jour';
    } else if (timeFilter === 'custom') {
      // CA moyen/jour pour période personnalisée
      const startDate = new Date(customDateRange.start);
      const endDate = new Date(customDateRange.end);
      const dayCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      kpiValue = totalRevenue / dayCount;
      kpiLabel = 'CA moyen/jour';
    }

    // Top produits
    const productCounts: Record<string, { name: string; volume: string; count: number; revenue: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const key = `${item.product.name}-${item.product.volume}`;
        if (!productCounts[key]) {
          productCounts[key] = {
            name: item.product.name,
            volume: item.product.volume,
            count: 0,
            revenue: 0
          };
        }
        productCounts[key].count += item.quantity;
        productCounts[key].revenue += item.product.price * item.quantity;
      });
    });

    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { totalRevenue, totalItems, kpiValue, kpiLabel, topProducts };
  }, [filteredSales, returns, timeFilter, customDateRange, closeHour]);

  // Export des données
  const exportSales = () => {
    console.log('🔄 Export déclenché - Format:', exportFormat);
    console.log('📊 Ventes filtrées:', filteredSales.length);

    // Préparer les données avec la nouvelle structure: lignes pour ventes + lignes pour retours
    const exportData: any[] = [];

    // 1. Ajouter toutes les ventes
    filteredSales.forEach(sale => {
      const user = safeUsers.find(u => u.id === sale.processedBy);
      const member = safeBarMembers.find(m => m.userId === user?.id);
      const vendeur = user?.name || 'Inconnu';
      const role = member?.role || user?.role || 'serveur';

      sale.items.forEach(item => {
        const category = categories.find(c => c.id === item.product.categoryId);
        const cost = item.product.cost || 0;
        const total = item.product.price * item.quantity;
        const benefice = (item.product.price - cost) * item.quantity;

        exportData.push({
          'Type': 'Vente',
          'Date': new Date(sale.date).toLocaleDateString('fr-FR'),
          'Heure': new Date(sale.date).toLocaleTimeString('fr-FR'),
          'ID Transaction': sale.id.slice(-6),
          'Produit': item.product.name,
          'Catégorie': category?.name || 'Non classé',
          'Volume': item.product.volume || '',
          'Quantité': item.quantity,
          'Prix unitaire': item.product.price,
          'Coût unitaire': cost,
          'Total': total,
          'Bénéfice': benefice,
          'Utilisateur': vendeur,
          'Rôle': role,
          'Devise': sale.currency
        });
      });
    });

    // 2. Ajouter tous les retours de la période filtrée
    const filteredReturns = returns.filter(ret => {
      const returnDate = new Date(ret.returnedAt);

      // Appliquer les mêmes filtres de période que pour les ventes
      switch (timeFilter) {
        case 'today': {
          const today = new Date();
          const barToday = getCurrentBusinessDay(closeHour);
          return returnDate >= barToday && returnDate <= today;
        }
        case 'week': {
          // Semaine calendaire : Lundi-Dimanche
          const today = new Date();
          const currentDay = today.getDay();
          const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
          const monday = new Date(today);
          monday.setDate(monday.getDate() - daysFromMonday);
          monday.setHours(0, 0, 0, 0);

          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);

          return returnDate >= monday && returnDate <= sunday;
        }
        case 'month': {
          // Mois calendaire : du 1er au dernier jour du mois
          const today = new Date();
          const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          firstDayOfMonth.setHours(0, 0, 0, 0);

          const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          lastDayOfMonth.setHours(23, 59, 59, 999);

          return returnDate >= firstDayOfMonth && returnDate <= lastDayOfMonth;
        }
        case 'custom': {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setDate(endDate.getDate() + 1);
          return returnDate >= startDate && returnDate < endDate;
        }
        default:
          return false;
      }
    });

    filteredReturns.forEach(ret => {
      // Ignorer les retours sans produit
      if (!ret.product) {
        console.warn('⚠️ Retour sans produit ignoré:', ret.id);
        return;
      }

      const user = safeUsers.find(u => u.id === ret.returnedBy);
      const member = safeBarMembers.find(m => m.userId === user?.id);
      const utilisateur = user?.name || 'Inconnu';
      const role = member?.role || user?.role || 'serveur';

      const category = categories.find(c => c.id === ret.product.categoryId);
      const cost = ret.product.cost || 0;
      const total = ret.isRefunded ? -ret.refundAmount : 0; // Négatif si remboursé
      const benefice = ret.isRefunded ? -(ret.refundAmount - (cost * ret.quantity)) : 0;

      exportData.push({
        'Type': 'Retour',
        'Date': new Date(ret.returnedAt).toLocaleDateString('fr-FR'),
        'Heure': new Date(ret.returnedAt).toLocaleTimeString('fr-FR'),
        'ID Transaction': ret.id.slice(-6),
        'Produit': ret.product.name,
        'Catégorie': category?.name || 'Non classé',
        'Volume': ret.product.volume || '',
        'Quantité': -ret.quantity, // Négatif pour indiquer retour
        'Prix unitaire': ret.product.price,
        'Coût unitaire': cost,
        'Total': total,
        'Bénéfice': benefice,
        'Utilisateur': utilisateur,
        'Rôle': role,
        'Devise': 'XOF'
      });
    });

    // Trier par date/heure décroissante
    exportData.sort((a, b) => {
      const dateA = new Date(`${a.Date} ${a.Heure}`);
      const dateB = new Date(`${b.Date} ${b.Heure}`);
      return dateB.getTime() - dateA.getTime();
    });

    const fileName = `ventes_${new Date().toISOString().split('T')[0]}`;

    console.log('📦 Données export:', exportData.length, 'lignes');

    if (exportData.length === 0) {
      console.warn('⚠️ Aucune donnée à exporter');
      alert('Aucune donnée à exporter pour la période sélectionnée');
      return;
    }

    console.log('💾 Export en cours...', exportFormat);

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
        console.log('✅ Export Excel réussi:', `${fileName}.xlsx`);
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

  if (!isOpen) return null;

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
            className={`bg-gradient-to-br from-yellow-100 to-amber-100 w-full shadow-2xl overflow-hidden ${
              isMobile
                ? 'h-full'
                : 'rounded-2xl max-w-7xl max-h-[85vh] md:max-h-[90vh]'
            }`}
          >
            {/* ==================== VERSION MOBILE ==================== */}
            {isMobile ? (
              <div className="flex flex-col h-full">
                {/* Header mobile */}
                <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-orange-200">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Historique</h2>
                      <p className="text-xs text-gray-600">{filteredSales.length} ventes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportSales}
                      className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                      disabled={filteredSales.length === 0}
                      title={`Exporter en ${exportFormat.toUpperCase()}`}
                    >
                      <Download size={20} />
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                      <X size={24} />
                    </button>
                  </div>
                </div>
                {/* Filtres compacts en haut (stats retirées, disponibles dans Analytics) */}
                <div className="flex-shrink-0 bg-orange-50 p-3">
                  {/* Sélecteur format export mobile */}
                  <div className="flex gap-1 mb-3">
                    <button
                      onClick={() => setExportFormat('excel')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        exportFormat === 'excel'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-gray-600'
                      }`}
                    >
                      📊 Excel
                    </button>
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        exportFormat === 'csv'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-gray-600'
                      }`}
                    >
                      📄 CSV
                    </button>
                  </div>

                  {/* Filtres période horizontaux */}
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                    {[
                      { value: 'today', label: "Aujourd'hui" },
                      { value: 'week', label: '7 jours' },
                      { value: 'month', label: '30 jours' },
                      { value: 'custom', label: 'Personnalisée' }
                    ].map(filter => (
                      <button
                        key={filter.value}
                        onClick={() => setTimeFilter(filter.value as TimeFilter)}
                        className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                          timeFilter === filter.value
                            ? 'bg-orange-500 text-white'
                            : 'bg-white text-gray-700'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {/* Date range personnalisée */}
                  {timeFilter === 'custom' && (
                    <div className="flex gap-2 mb-3">
                      <input
                        type="date"
                        value={customDateRange.start}
                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="flex-1 p-2 border border-orange-200 rounded-lg bg-white text-sm"
                        placeholder="Début"
                      />
                      <input
                        type="date"
                        value={customDateRange.end}
                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="flex-1 p-2 border border-orange-200 rounded-lg bg-white text-sm"
                        placeholder="Fin"
                      />
                    </div>
                  )}

                  {/* Recherche */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="ID vente ou produit..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-orange-200 rounded-lg bg-white text-sm"
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
                        <button
                          key={mode.value}
                          onClick={() => setViewMode(mode.value as ViewMode)}
                          className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors flex items-center gap-1 ${
                            viewMode === mode.value
                              ? 'bg-orange-500 text-white'
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
                        />
                      ))}
                    </div>
                  ) : viewMode === 'list' ? (
                    <SalesList
                      sales={filteredSales}
                      formatPrice={formatPrice}
                      onViewDetails={setSelectedSale}
                      returns={returns}
                      getReturnsBySale={getReturnsBySale}
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
                      timeFilter={timeFilter}
                      isMobile={isMobile}
                      returns={returns}
                      closeHour={closeHour}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* ==================== VERSION DESKTOP ==================== */
              <>
                {/* Header desktop */}
                <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-orange-200">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-blue-600" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">Historique des ventes</h2>
                      <p className="text-sm text-gray-600">{filteredSales.length} ventes trouvées</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Sélecteur de format d'export */}
                    <div className="flex items-center gap-1 mr-2">
                      <button
                        onClick={() => setExportFormat('excel')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
                          exportFormat === 'excel'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Excel
                      </button>
                      <button
                        onClick={() => setExportFormat('csv')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                          exportFormat === 'csv'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        CSV
                      </button>
                    </div>
                    <EnhancedButton
                      variant="info"
                      size="sm"
                      onClick={exportSales}
                      icon={<Download size={16} />}
                      disabled={filteredSales.length === 0}
                    >
                      Exporter
                    </EnhancedButton>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                      <X size={24} />
                    </button>
                  </div>
                </div>
              <div className="flex h-[calc(85vh-120px)] md:h-[calc(90vh-120px)]">
                {/* Sidebar filtres */}
                <div className="w-80 border-r border-orange-200 p-6 overflow-y-auto">
                  {/* Statistiques */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-800 mb-3">Statistiques</h3>
                    <div className="space-y-3">
                      <div className="bg-orange-100 rounded-lg p-3">
                        <p className="text-orange-600 text-sm font-medium">Chiffre d'affaires (NET)</p>
                        <p className="text-orange-800 font-bold text-lg">{formatPrice(stats.totalRevenue)}</p>
                      </div>
                      <div className="bg-orange-100 rounded-lg p-3">
                        <p className="text-orange-600 text-sm font-medium">Articles vendus</p>
                        <p className="text-orange-800 font-bold text-lg">{stats.totalItems}</p>
                      </div>
                      <div className="bg-orange-100 rounded-lg p-3">
                        <p className="text-orange-600 text-sm font-medium">{stats.kpiLabel}</p>
                        <p className="text-orange-800 font-bold text-lg">{formatPrice(stats.kpiValue)}</p>
                      </div>
                      {(() => {
                        // Calculer les retours de la période filtrée
                        const periodReturns = returns.filter(r => {
                          if (r.status !== 'approved' && r.status !== 'restocked') return false;
                          if (!r.isRefunded) return false;

                          const returnDate = new Date(r.returnedAt);

                          if (timeFilter === 'today') {
                            const currentBusinessDay = getCurrentBusinessDay(closeHour);
                            const returnBusinessDay = getBusinessDay(returnDate, closeHour);
                            return isSameDay(returnBusinessDay, currentBusinessDay);
                          } else if (timeFilter === 'week') {
                            const currentDay = new Date().getDay();
                            const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
                            const monday = new Date();
                            monday.setDate(monday.getDate() - daysFromMonday);
                            monday.setHours(0, 0, 0, 0);
                            const sunday = new Date(monday);
                            sunday.setDate(monday.getDate() + 6);
                            sunday.setHours(23, 59, 59, 999);
                            return returnDate >= monday && returnDate <= sunday;
                          } else if (timeFilter === 'month') {
                            const today = new Date();
                            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                            firstDay.setHours(0, 0, 0, 0);
                            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                            lastDay.setHours(23, 59, 59, 999);
                            return returnDate >= firstDay && returnDate <= lastDay;
                          } else if (timeFilter === 'custom') {
                            const start = new Date(customDateRange.start);
                            const end = new Date(customDateRange.end);
                            return returnDate >= start && returnDate <= end;
                          }
                          return false;
                        });

                        const returnsCount = periodReturns.length;
                        const returnsAmount = periodReturns.reduce((sum, r) => sum + r.refundAmount, 0);

                        if (returnsCount > 0) {
                          return (
                            <div className="bg-red-100 border border-red-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-red-600 text-sm font-medium flex items-center gap-1">
                                  <RotateCcw size={14} />
                                  Retours remboursés
                                </p>
                                <span className="text-red-700 text-xs font-medium">{returnsCount}</span>
                              </div>
                              <p className="text-red-800 font-bold text-lg">-{formatPrice(returnsAmount)}</p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Filtres temporels */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-800 mb-3">Période</h3>
                    <div className="space-y-2">
                      {[
                        { value: 'today', label: "Aujourd'hui" },
                        { value: 'week', label: 'Cette semaine (Lun-Dim)' },
                        { value: 'month', label: 'Ce mois' },
                        { value: 'custom', label: 'Personnalisée' }
                      ].map(filter => (
                        <button
                          key={filter.value}
                          onClick={() => setTimeFilter(filter.value as TimeFilter)}
                          className={`w-full text-left p-2 rounded-lg transition-colors ${
                            timeFilter === filter.value
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-gray-700 hover:bg-orange-50'
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>

                    {timeFilter === 'custom' && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="date"
                          value={customDateRange.start}
                          onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                          className="w-full p-2 border border-orange-200 rounded-lg bg-white text-sm"
                        />
                        <input
                          type="date"
                          value={customDateRange.end}
                          onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                          className="w-full p-2 border border-orange-200 rounded-lg bg-white text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Top produits */}
                  {stats.topProducts.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-800 mb-3">Top produits</h3>
                      <div className="space-y-2">
                        {stats.topProducts.map((product, index) => (
                          <div key={`${product.name}-${product.volume}`} className="bg-white rounded-lg p-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-800">
                                  {index + 1}. {product.name}
                                </p>
                                <p className="text-xs text-gray-600">{product.volume}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-orange-600">{product.count}</p>
                                <p className="text-xs text-gray-500">{formatPrice(product.revenue)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recherche */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">Recherche</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="ID vente ou produit..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-orange-200 rounded-lg bg-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Contenu principal */}
                <div className="flex-1 flex flex-col">
                  {/* Toolbar */}
                  <div className="p-4 border-b border-orange-200 bg-orange-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Mode d'affichage:</span>
                        <div className="flex border border-orange-300 rounded-lg overflow-hidden">
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
                                className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${
                                  viewMode === mode.value
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-orange-100'
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
                      console.log('🔄 SalesHistory - Mode actuel:', viewMode, '| Ventes filtrées:', filteredSales.length);

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
                        console.log('📋 Affichage mode Cartes');
                        return (
                          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredSales.map(sale => (
                              <SaleCard
                                key={sale.id}
                                sale={sale}
                                formatPrice={formatPrice}
                                onViewDetails={() => setSelectedSale(sale)}
                                returns={returns}
                                getReturnsBySale={getReturnsBySale}
                              />
                            ))}
                          </div>
                        );
                      }

                      if (viewMode === 'list') {
                        console.log('📝 Affichage mode Liste');
                        return (
                          <SalesList
                            sales={filteredSales}
                            formatPrice={formatPrice}
                            onViewDetails={setSelectedSale}
                            returns={returns}
                            getReturnsBySale={getReturnsBySale}
                          />
                        );
                      }

                      console.log('📊 Affichage mode Analytics avec', filteredSales.length, 'ventes');
                      return (
                        <AnalyticsView
                          sales={filteredSales}
                          stats={stats}
                          formatPrice={formatPrice}
                          categories={categories}
                          products={products}
                          users={safeUsers}
                          barMembers={safeBarMembers}
                          timeFilter={timeFilter}
                          isMobile={isMobile}
                          returns={returns}
                          closeHour={closeHour}
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
  returns,
  getReturnsBySale
}: {
  sale: Sale;
  formatPrice: (price: number) => string;
  onViewDetails: () => void;
  returns?: any[];
  getReturnsBySale?: (saleId: string) => any[];
}) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculer le montant des retours remboursés
  const saleReturns = getReturnsBySale ? getReturnsBySale(sale.id) : [];
  const refundedAmount = saleReturns
    .filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked'))
    .reduce((sum, r) => sum + r.refundAmount, 0);

  const netAmount = sale.total - refundedAmount;
  const hasReturns = saleReturns.length > 0;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-xl p-4 border border-orange-100 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">Vente #{sale.id.slice(-6)}</h4>
          <p className="text-sm text-gray-600">
            {new Date(sale.date).toLocaleDateString('fr-FR')} • {new Date(sale.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-orange-600">{formatPrice(sale.total)}</span>
          {hasReturns && refundedAmount > 0 && (
            <p className="text-xs text-red-600 font-medium">
              -{formatPrice(refundedAmount).replace(/\s/g, '')}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {sale.items.slice(0, 2).map((item, index) => (
          <div key={index} className="flex justify-between text-sm">
            <span className="text-gray-700">{item.quantity}x {item.product.name}</span>
            <span className="text-gray-600">{formatPrice(item.product.price * item.quantity)}</span>
          </div>
        ))}
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
  returns,
  getReturnsBySale
}: {
  sales: Sale[];
  formatPrice: (price: number) => string;
  onViewDetails: (sale: Sale) => void;
  returns: any[];
  getReturnsBySale: (saleId: string) => any[];
}) {
  return (
    <div className="bg-white rounded-xl border border-orange-100 overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead className="bg-orange-50">
          <tr>
            <th className="text-left p-4 font-medium text-gray-700">ID</th>
            <th className="text-left p-4 font-medium text-gray-700">Date</th>
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

            return (
              <tr key={sale.id} className="border-t border-orange-100 hover:bg-orange-25">
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
                  <div>
                    <p className="text-sm">{new Date(sale.date).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-gray-600">{new Date(sale.date).toLocaleTimeString('fr-FR')}</p>
                  </div>
                </td>
                <td className="p-4">{itemCount} articles</td>
                <td className="p-4">
                  <span className={`font-semibold ${hasReturns ? 'text-gray-500 line-through' : 'text-orange-600'}`}>
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
  products,
  users,
  barMembers,
  timeFilter,
  isMobile,
  returns,
  closeHour
}: {
  sales: Sale[];
  stats: Stats;
  formatPrice: (price: number) => string;
  categories: Category[];
  products: Product[];
  users: User[];
  barMembers: BarMember[];
  timeFilter: string;
  isMobile: boolean;
  returns: Return[];
  closeHour: number;
}) {
  // Protection: s'assurer que tous les tableaux sont définis
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  // DEBUG: Tracer les données reçues
  console.log('🔍 AnalyticsView - DEBUG:', {
    salesCount: sales.length,
    statsTotal: stats.totalRevenue,
    timeFilter,
    isMobile,
    categoriesCount: categories.length,
    productsCount: products.length,
    usersCount: safeUsers.length,
    barMembersCount: safeBarMembers.length,
    firstSale: sales[0],
    stats
  });

  // Calculer période précédente pour comparaison
  const { currentPeriodSales, previousPeriodSales } = useMemo(() => {
    const now = new Date();
    let currentStart: Date, previousStart: Date, previousEnd: Date;

    if (timeFilter === 'today') {
      currentStart = new Date(now.setHours(0, 0, 0, 0));
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = new Date(currentStart);
    } else if (timeFilter === 'week') {
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);
      previousEnd = new Date(currentStart);
    } else if (timeFilter === 'month') {
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 30);
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 30);
      previousEnd = new Date(currentStart);
    } else {
      return { currentPeriodSales: sales, previousPeriodSales: [] };
    }

    const previous = sales.filter(s => {
      const saleDate = new Date(s.date);
      return saleDate >= previousStart && saleDate < previousEnd;
    });

    return { currentPeriodSales: sales, previousPeriodSales: previous };
  }, [sales, timeFilter]);

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

  // Données pour graphique d'évolution - granularité adaptative
  const evolutionChartData = useMemo(() => {
    const grouped: Record<string, { label: string; revenue: number; sales: number; timestamp: number }> = {};

    sales.forEach(sale => {
      let label: string;
      const saleDate = new Date(sale.date);

      if (timeFilter === 'today') {
        // Mode Aujourd'hui → Par heure (groupement)
        const hour = saleDate.getHours();
        label = `${hour.toString().padStart(2, '0')}h`;
      } else if (timeFilter === 'week') {
        // Mode Semaine → Par jour
        label = saleDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
      } else if (timeFilter === 'month') {
        // Mode Mois → Par semaine calendaire (Lun-Dim)
        // Trouver le lundi de la semaine de cette vente
        const day = saleDate.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // Décalage pour trouver le lundi
        const monday = new Date(saleDate);
        monday.setDate(saleDate.getDate() + diff);
        monday.setHours(0, 0, 0, 0);

        // Calculer le dimanche
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Format du label: "Lun 6 - Dim 12"
        const mondayDay = monday.getDate();
        const sundayDay = sunday.getDate();
        const mondayMonth = monday.getMonth();
        const sundayMonth = sunday.getMonth();

        // Si la semaine chevauche deux mois, afficher les mois
        if (mondayMonth !== sundayMonth) {
          label = `${mondayDay}/${mondayMonth + 1} - ${sundayDay}/${sundayMonth + 1}`;
        } else {
          label = `${mondayDay} - ${sundayDay}`;
        }
      } else {
        // Mode Custom → Par jour
        label = saleDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      }

      if (!grouped[label]) {
        grouped[label] = { label, revenue: 0, sales: 0, timestamp: saleDate.getTime() };
      }
      grouped[label].revenue += sale.total;
      grouped[label].sales += 1;
      // Garder le timestamp le plus ancien pour ce label
      grouped[label].timestamp = Math.min(grouped[label].timestamp, saleDate.getTime());
    });

    // Trier par timestamp chronologique (ancien → récent)
    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
  }, [sales, timeFilter]);

  // Répartition par catégorie (sur CA BRUT pour avoir le détail des ventes)
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    let totalGross = 0;

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const category = categories.find(c => c.id === item.product.categoryId);
        const catName = category?.name || 'Autre';
        const itemRevenue = item.product.price * item.quantity;
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
  }, [sales, categories]);

  // Performance par utilisateur
  const [userFilter, setUserFilter] = useState<'all' | 'servers' | 'management'>('all');

  const userPerformance = useMemo(() => {
    const userStats: Record<string, { name: string; role: string; revenue: number; sales: number; items: number }> = {};

    console.log('🔍 Performance équipe - Analyse:', {
      nbVentes: sales.length,
      nbRetours: returns.length,
      nbUsers: safeUsers.length,
      nbBarMembers: safeBarMembers.length,
      ventes: sales.map(s => ({ id: s.id.slice(-6), processedBy: s.processedBy, assignedTo: s.assignedTo }))
    });

    // 1. Ajouter les ventes
    sales.forEach(sale => {
      // Mode simplifié : utiliser assignedTo si présent
      // Mode complet : utiliser processedBy (userId)
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
        // Mode complet - utiliser processedBy (userId)
        const user = safeUsers.find(u => u.id === sale.processedBy);
        if (!user) {
          console.log('⚠️ Utilisateur non trouvé pour vente:', sale.id.slice(-6), 'processedBy:', sale.processedBy);
          return;
        }

        // Chercher d'abord dans barMembers, sinon utiliser le rôle de l'utilisateur
        const member = safeBarMembers.find(m => m.userId === user.id);
        const role = member?.role || user.role || 'serveur';

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
    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;

      const returnDate = new Date(r.returnedAt);

      if (timeFilter === 'today') {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      } else if (timeFilter === 'week') {
        const currentDay = new Date().getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return returnDate >= monday && returnDate <= sunday;
      } else if (timeFilter === 'month') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        return returnDate >= firstDay && returnDate <= lastDay;
      } else if (timeFilter === 'custom') {
        // Custom range - on ne peut pas filtrer car on n'a pas accès à customDateRange ici
        // On inclut tous les retours de la période des ventes affichées
        return true;
      }
      return false;
    });

    // Déduire les retours du revenue de chaque vendeur
    filteredReturns.forEach(ret => {
      // Trouver la vente originale pour identifier le vendeur
      const originalSale = sales.find(s => s.id === ret.saleId);
      if (!originalSale) return;

      const identifier = originalSale.assignedTo || originalSale.processedBy;
      if (userStats[identifier]) {
        userStats[identifier].revenue -= ret.refundAmount;
      }
    });

    const allUsers = Object.values(userStats);

    if (userFilter === 'servers') {
      return allUsers.filter(u => u.role === 'serveur');
    } else if (userFilter === 'management') {
      return allUsers.filter(u => u.role === 'gerant' || u.role === 'promoteur');
    }

    return allUsers;
  }, [sales, returns, safeUsers, safeBarMembers, userFilter, timeFilter, closeHour]);

  // Top produits - 3 analyses (CA NET = Ventes - Retours)
  const topProductsData = useMemo(() => {
    const productStats: Record<string, { name: string; units: number; revenue: number; profit: number }> = {};

    // 1. Ajouter les ventes
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const product = item.product;
        if (!productStats[product.id]) {
          productStats[product.id] = {
            name: product.name,
            units: 0,
            revenue: 0,
            profit: 0
          };
        }
        productStats[product.id].units += item.quantity;
        productStats[product.id].revenue += product.price * item.quantity;
        productStats[product.id].profit += (product.price - (product.cost || 0)) * item.quantity;
      });
    });

    // 2. Déduire les retours remboursés
    const filteredReturns = returns.filter(r => {
      if (r.status !== 'approved' && r.status !== 'restocked') return false;
      if (!r.isRefunded) return false;

      const returnDate = new Date(r.returnedAt);

      if (timeFilter === 'today') {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        const returnBusinessDay = getBusinessDay(returnDate, closeHour);
        return isSameDay(returnBusinessDay, currentBusinessDay);
      } else if (timeFilter === 'week') {
        const currentDay = new Date().getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date();
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return returnDate >= monday && returnDate <= sunday;
      } else if (timeFilter === 'month') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        return returnDate >= firstDay && returnDate <= lastDay;
      } else if (timeFilter === 'custom') {
        return true;
      }
      return false;
    });

    filteredReturns.forEach(ret => {
      if (ret.product && productStats[ret.product.id]) {
        productStats[ret.product.id].units -= ret.quantity;
        productStats[ret.product.id].revenue -= ret.refundAmount;
        productStats[ret.product.id].profit -= (ret.product.price - (ret.product.cost || 0)) * ret.quantity;
      }
    });

    const products = Object.values(productStats);

    return {
      byUnits: products.sort((a, b) => b.units - a.units).slice(0, 5),
      byRevenue: products.sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      byProfit: products.sort((a, b) => b.profit - a.profit).slice(0, 5)
    };
  }, [sales, returns, timeFilter, closeHour]);

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
    console.log('⚠️ AnalyticsView - Aucune vente, affichage message vide');
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart3 size={64} className="text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">Aucune donnée disponible</h3>
        <p className="text-sm text-gray-500">Effectuez des ventes pour voir les analytics</p>
      </div>
    );
  }

  console.log('✅ AnalyticsView - Rendu du tableau de bord avec', sales.length, 'ventes');
  console.log('📊 KPIs:', kpis);
  console.log('📈 CategoryData:', categoryData);
  console.log('👥 UserPerformance:', userPerformance);

  return (
    <div className="space-y-4">
      {/* KPIs principaux */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3`}>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
          <h4 className="text-xs font-medium text-orange-700 mb-1">Chiffre d'affaires</h4>
          <p className="text-xl font-bold text-orange-900">{formatPrice(kpis.revenue.value)}</p>
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

        <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-xl p-4 border border-orange-200">
          <h4 className="text-xs font-medium text-orange-700 mb-1">{kpis.kpi.label}</h4>
          <p className="text-xl font-bold text-orange-900">{formatPrice(kpis.kpi.value)}</p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-medium text-orange-600">Période actuelle</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl p-4 border border-amber-200">
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
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">
            Évolution du CA
            <span className="text-xs text-gray-500 ml-2">
              ({timeFilter === 'today' ? 'par heure' : timeFilter === 'week' ? 'par jour' : timeFilter === 'month' ? 'par semaine' : 'par jour'})
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
        <div className="bg-white rounded-xl p-4 border border-orange-100">
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
                label={(entry) => `${entry.percentage.toFixed(0)}%`}
              >
                {categoryData.map((entry, index) => (
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

      {/* Performance équipe */}
      <div className="bg-white rounded-xl p-4 border border-orange-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Performance Équipe</h4>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value as any)}
            className="text-xs border border-orange-200 rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">Tous</option>
            <option value="servers">Serveurs</option>
            <option value="management">Management</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-orange-100">
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
                  <tr key={index} className="border-b border-orange-50">
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                          {badge.icon}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-right text-sm font-semibold text-orange-600 py-2 px-2">
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

      {/* Top produits - 3 graphiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top par unités vendues */}
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Top 5 - Unités vendues</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <BarChart data={topProductsData.byUnits}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="units" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top par CA */}
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Top 5 - Chiffre d'affaires</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <BarChart data={topProductsData.byRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Bar dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top par bénéfice */}
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Top 5 - Bénéfices</h4>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
            <BarChart data={topProductsData.byProfit}>
              <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
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
            <p className="font-medium">{new Date(sale.date).toLocaleString('fr-FR')}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">Articles vendus</p>
            <div className="space-y-2">
              {sale.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{item.product.name}</p>
                    <p className="text-sm text-gray-600">{item.product.volume} • Qté: {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-orange-600">
                    {formatPrice(item.product.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-800">Total</span>
              <span className="text-xl font-bold text-orange-600">{formatPrice(sale.total)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}