import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  TrendingUp, Clock, Search, Download, Eye, BarChart3, Users, ShoppingCart, X, ArrowUp, ArrowDown, Minus, RotateCcw, List, LayoutGrid, PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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

// Helper function to get a consistent sale date
const getSaleDate = (sale: Sale): Date => new Date(sale.validatedAt || sale.createdAt);

interface EnhancedSalesHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimeFilter = 'today' | 'week' | 'month' | 'custom';
type ViewMode = 'list' | 'cards' | 'analytics';

export function EnhancedSalesHistory({ isOpen, onClose }: EnhancedSalesHistoryProps) {
  const { sales, categories, products, returns, getReturnsBySale } = useAppContext();
  const { barMembers, currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession, users } = useAuth();
  const { isMobile } = useViewport();

  const closeHour = currentBar?.settings?.businessDayCloseHour ?? 6;
  const safeUsers = users || [];
  const safeBarMembers = barMembers || [];

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'cards' : 'list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('excel');
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const filteredSales = useMemo(() => {
    let filtered = sales.filter(sale => sale.status === 'validated');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeFilter) {
      case 'today': {
        const currentBusinessDay = getCurrentBusinessDay(closeHour);
        filtered = filtered.filter(sale => {
          const saleBusinessDay = getBusinessDay(getSaleDate(sale), closeHour);
          return isSameDay(saleBusinessDay, currentBusinessDay);
        });
        break;
      }
      case 'week': {
        const currentDay = today.getDay();
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date(today);
        monday.setDate(monday.getDate() - daysFromMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        filtered = filtered.filter(sale => {
          const saleDate = getSaleDate(sale);
          return saleDate >= monday && saleDate <= sunday;
        });
        break;
      }
      case 'month': {
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        lastDayOfMonth.setHours(23, 59, 59, 999);
        filtered = filtered.filter(sale => {
          const saleDate = getSaleDate(sale);
          return saleDate >= firstDayOfMonth && saleDate <= lastDayOfMonth;
        });
        break;
      }
      case 'custom': {
        const startDate = new Date(customDateRange.start);
        const endDate = new Date(customDateRange.end);
        endDate.setDate(endDate.getDate() + 1);
        filtered = filtered.filter(sale => {
          const saleDate = getSaleDate(sale);
          return saleDate >= startDate && saleDate < endDate;
        });
        break;
      }
    }

    if (searchTerm) {
      filtered = filtered.filter(sale =>
        sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.items.some(item =>
          item.product.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    if (currentSession?.role === 'serveur') {
      filtered = filtered.filter(sale => sale.createdBy === currentSession.userId);
    }

    return filtered.sort((a, b) => getSaleDate(b).getTime() - getSaleDate(a).getTime());
  }, [sales, timeFilter, searchTerm, customDateRange, currentSession, closeHour]);

  const stats = useMemo(() => {
    const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    // ... (rest of the stats logic from oldsaleshistory.tsx)
    return { totalRevenue: grossRevenue, totalItems: 0, kpiValue: 0, kpiLabel: '', topProducts: [] };
  }, [filteredSales, returns, timeFilter, customDateRange, closeHour]);

  const exportSales = () => {
    const exportData: any[] = [];
    filteredSales.forEach(sale => {
      const user = safeUsers.find(u => u.id === sale.createdBy);
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
          'Date': getSaleDate(sale).toLocaleDateString('fr-FR'),
          'Heure': getSaleDate(sale).toLocaleTimeString('fr-FR'),
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

    const fileName = `ventes_${new Date().toISOString().split('T')[0]}`;
    if (exportData.length === 0) {
      alert('Aucune donnée à exporter pour la période sélectionnée');
      return;
    }

    if (exportFormat === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes');
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      // CSV export logic
    }
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (filteredSales.length === 0) {
        return (
          <div className="text-center py-12">
            <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune vente trouvée</h3>
            <p className="text-gray-500">Ajustez vos filtres ou changez la période</p>
          </div>
        );
    }

    switch (viewMode) {
        case 'list':
            return <SalesList sales={filteredSales} users={safeUsers} formatPrice={formatPrice} onViewDetails={setSelectedSale} getReturnsBySale={getReturnsBySale} />;
        case 'cards':
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredSales.map(sale => (
                        <SaleCard key={sale.id} sale={sale} users={safeUsers} formatPrice={formatPrice} onViewDetails={() => setSelectedSale(sale)} getReturnsBySale={getReturnsBySale} />
                    ))}
                </div>
            );
        case 'analytics':
            return <AnalyticsView sales={filteredSales} stats={stats} formatPrice={formatPrice} categories={categories} products={products} users={safeUsers} barMembers={safeBarMembers} timeFilter={timeFilter} isMobile={isMobile} returns={returns} closeHour={closeHour} />;
        default:
            return null;
    }
  }

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
            className={`bg-gradient-to-br from-yellow-100 to-amber-100 w-full shadow-2xl overflow-hidden ${isMobile ? 'h-full' : 'rounded-2xl max-w-7xl max-h-[85vh] md:max-h-[90vh]'}`}
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 md:p-6 border-b border-orange-200">
                <div className="flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-blue-600" />
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Historique des ventes</h2>
                        <p className="text-sm text-gray-600">{filteredSales.length} ventes trouvées</p>
                    </div>
                </div>
                <EnhancedButton onClick={onClose} size="icon" variant="ghost"><X /></EnhancedButton>
            </div>

            <div className={`flex ${isMobile ? 'flex-col' : ''} h-[calc(100%-76px)]`}>
                {/* Sidebar / Filters */} 
                <div className={`${isMobile ? 'p-3 bg-orange-50' : 'w-80 border-r border-orange-200 p-6'} overflow-y-auto`}>
                    {/* Time Filters */}
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                        {[{ value: 'today', label: "Aujourd'hui" }, { value: 'week', label: '7 jours' }, { value: 'month', label: '30 jours' }, { value: 'custom', label: 'Personnalisée' }].map(filter => (
                            <button key={filter.value} onClick={() => setTimeFilter(filter.value as TimeFilter)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${timeFilter === filter.value ? 'bg-orange-500 text-white' : 'bg-white text-gray-700'}`}>
                                {filter.label}
                            </button>
                        ))}
                    </div>
                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <input type="text" placeholder="ID vente ou produit..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-orange-200 rounded-lg bg-white text-sm" />
                    </div>
                    {/* View Mode */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {[{ value: 'list', icon: List, label: 'Liste' }, { value: 'cards', icon: LayoutGrid, label: 'Cartes' }, { value: 'analytics', icon: PieChartIcon, label: 'Analytics' }].map(mode => {
                            const Icon = mode.icon;
                            return <button key={mode.value} onClick={() => setViewMode(mode.value as ViewMode)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === mode.value ? 'bg-orange-500 text-white' : 'bg-white text-gray-700'}`}><Icon size={14} />{mode.label}</button>
                        })}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-y-auto">
                    <div className="p-4">
                        {renderContent()}
                    </div>
                </div>
            </div>

            {selectedSale && (
              <SaleDetailModal sale={selectedSale} users={safeUsers} formatPrice={formatPrice} onClose={() => setSelectedSale(null)} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SaleCard({ sale, users, formatPrice, onViewDetails, getReturnsBySale }: { sale: Sale; users: User[]; formatPrice: (price: number) => string; onViewDetails: () => void; getReturnsBySale: (saleId: string) => Return[] }) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const seller = users.find(u => u.id === sale.createdBy);
  return (
    <motion.div whileHover={{ y: -2 }} className="bg-white rounded-xl p-4 border border-orange-100 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">Vente #{sale.id.slice(-6)}</h4>
          <p className="text-sm text-gray-600">{getSaleDate(sale).toLocaleDateString('fr-FR')} • {getSaleDate(sale).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-sm text-gray-500">par {seller?.name || 'Inconnu'}</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-orange-600">{formatPrice(sale.total)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{itemCount} articles</span>
        <EnhancedButton variant="info" size="sm" onClick={onViewDetails} icon={<Eye size={14} />}>Détails</EnhancedButton>
      </div>
    </motion.div>
  );
}

function SalesList({ sales, users, formatPrice, onViewDetails, getReturnsBySale }: { sales: Sale[]; users: User[]; formatPrice: (price: number) => string; onViewDetails: (sale: Sale) => void; getReturnsBySale: (saleId: string) => Return[] }) {
  return (
    <div className="bg-white rounded-xl border border-orange-100 overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead className="bg-orange-50">
          <tr>
            <th className="text-left p-4 font-medium text-gray-700">ID</th>
            <th className="text-left p-4 font-medium text-gray-700">Date</th>
            <th className="text-left p-4 font-medium text-gray-700">Vendeur</th>
            <th className="text-left p-4 font-medium text-gray-700">Articles</th>
            <th className="text-left p-4 font-medium text-gray-700">Total</th>
            <th className="text-left p-4 font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map(sale => {
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
            const seller = users.find(u => u.id === sale.createdBy);
            return (
              <tr key={sale.id} className="border-t border-orange-100 hover:bg-orange-25">
                <td className="p-4">#{sale.id.slice(-6)}</td>
                <td className="p-4">{getSaleDate(sale).toLocaleString('fr-FR')}</td>
                <td className="p-4">{seller?.name || 'Inconnu'}</td>
                <td className="p-4">{itemCount}</td>
                <td className="p-4 font-semibold text-green-600">{formatPrice(sale.total)}</td>
                <td className="p-4"><EnhancedButton variant="info" size="sm" onClick={() => onViewDetails(sale)} icon={<Eye size={14} />}>Voir</EnhancedButton></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsView({ sales, stats, formatPrice, categories, products, users, barMembers, timeFilter, isMobile, returns, closeHour }: { sales: Sale[]; stats: any; formatPrice: (price: number) => string; categories: Category[]; products: Product[]; users: User[]; barMembers: BarMember[]; timeFilter: string; isMobile: boolean; returns: Return[]; closeHour: number; }) {
    // The full analytics view from oldsaleshistory.tsx would go here
    // This is a simplified version for now
    return <div className="text-center p-8">La vue analytique est en cours de construction.</div>;
}

function SaleDetailModal({ sale, users, formatPrice, onClose }: { sale: Sale; users: User[]; formatPrice: (price: number) => string; onClose: () => void; }) {
  const seller = users.find(u => u.id === sale.createdBy);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Détail vente #{sale.id.slice(-6)}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><p className="text-sm text-gray-600">Date</p><p className="font-medium">{getSaleDate(sale).toLocaleString('fr-FR')}</p></div>
          <div><p className="text-sm text-gray-600">Vendeur</p><p className="font-medium">{seller?.name || 'Inconnu'}</p></div>
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