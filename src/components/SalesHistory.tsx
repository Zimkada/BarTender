import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  //Calendar,
  //Filter,
  Search,
  Download,
  Eye,
  BarChart3,
  Users,
  ShoppingCart,
  X,
  //ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { EnhancedButton } from './EnhancedButton';
import { Sale } from '../types';

interface EnhancedSalesHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

type TimeFilter = 'today' | 'week' | 'month' | 'custom';
type ViewMode = 'list' | 'cards' | 'analytics';

export function EnhancedSalesHistory({ isOpen, onClose }: EnhancedSalesHistoryProps) {
  const { sales } = useAppContext();
  const formatPrice = useCurrencyFormatter();
  const { currentSession } = useAuth();
  
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Filtrage des ventes
  const filteredSales = useMemo(() => {
    let filtered = sales;

    // Filtre par date
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (timeFilter) {
      case 'today': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        filtered = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= today && saleDate < tomorrow;
        });
        break;
      }
      case 'week': {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = sales.filter(sale => new Date(sale.date) >= weekAgo);
        break;
      }
      case 'month': {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = sales.filter(sale => new Date(sale.date) >= monthAgo);
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
  }, [sales, timeFilter, searchTerm, customDateRange, currentSession]);

  // Statistiques
  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const totalItems = filteredSales.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const avgSale = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;

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

    return { totalRevenue, totalItems, avgSale, topProducts };
  }, [filteredSales]);

  // Export des données
  const exportSales = () => {
    const csvData = filteredSales.flatMap(sale =>
      sale.items.map(item => ({
        'Date': new Date(sale.date).toLocaleDateString('fr-FR'),
        'Heure': new Date(sale.date).toLocaleTimeString('fr-FR'),
        'ID Vente': sale.id.slice(-6),
        'Produit': item.product.name,
        'Volume': item.product.volume,
        'Quantité': item.quantity,
        'Prix unitaire': item.product.price,
        'Total ligne': item.product.price * item.quantity,
        'Total vente': sale.total,
        'Devise': sale.currency
      }))
    );

    const headers = Object.keys(csvData[0] || {});
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ventes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl w-full max-w-7xl max-h-[85vh] md:max-h-[90vh] overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-orange-200">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Historique des ventes</h2>
                  <p className="text-sm text-gray-600">{filteredSales.length} ventes trouvées</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                    <div className="bg-green-100 rounded-lg p-3">
                      <p className="text-green-600 text-sm font-medium">Chiffre d'affaires</p>
                      <p className="text-green-800 font-bold text-lg">{formatPrice(stats.totalRevenue)}</p>
                    </div>
                    <div className="bg-blue-100 rounded-lg p-3">
                      <p className="text-blue-600 text-sm font-medium">Articles vendus</p>
                      <p className="text-blue-800 font-bold text-lg">{stats.totalItems}</p>
                    </div>
                    <div className="bg-purple-100 rounded-lg p-3">
                      <p className="text-purple-600 text-sm font-medium">Panier moyen</p>
                      <p className="text-purple-800 font-bold text-lg">{formatPrice(stats.avgSale)}</p>
                    </div>
                  </div>
                </div>

                {/* Filtres temporels */}
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-800 mb-3">Période</h3>
                  <div className="space-y-2">
                    {[
                      { value: 'today', label: "Aujourd'hui" },
                      { value: 'week', label: '7 derniers jours' },
                      { value: 'month', label: '30 derniers jours' },
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
                          { value: 'cards', icon: BarChart3, label: 'Cartes' },
                          { value: 'list', icon: Users, label: 'Liste' },
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
                  {filteredSales.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune vente trouvée</h3>
                      <p className="text-gray-500">Ajustez vos filtres ou changez la période</p>
                    </div>
                  ) : viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                    />
                  ) : (
                    <AnalyticsView
                      sales={filteredSales}
                      stats={stats}
                      formatPrice={formatPrice}
                    />
                  )}
                </div>
              </div>
            </div>
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
  onViewDetails 
}: { 
  sale: Sale; 
  formatPrice: (price: number) => string; 
  onViewDetails: () => void; 
}) {
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

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
        <span className="text-lg font-bold text-orange-600">{formatPrice(sale.total)}</span>
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
  onViewDetails 
}: { 
  sales: Sale[]; 
  formatPrice: (price: number) => string; 
  onViewDetails: (sale: Sale) => void; 
}) {
  return (
    <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
      <table className="w-full">
        <thead className="bg-orange-50">
          <tr>
            <th className="text-left p-4 font-medium text-gray-700">ID</th>
            <th className="text-left p-4 font-medium text-gray-700">Date</th>
            <th className="text-left p-4 font-medium text-gray-700">Articles</th>
            <th className="text-left p-4 font-medium text-gray-700">Total</th>
            <th className="text-left p-4 font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map(sale => {
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
            return (
              <tr key={sale.id} className="border-t border-orange-100 hover:bg-orange-25">
                <td className="p-4">#{sale.id.slice(-6)}</td>
                <td className="p-4">
                  <div>
                    <p className="text-sm">{new Date(sale.date).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-gray-600">{new Date(sale.date).toLocaleTimeString('fr-FR')}</p>
                  </div>
                </td>
                <td className="p-4">{itemCount} articles</td>
                <td className="p-4">
                  <span className="font-semibold text-orange-600">{formatPrice(sale.total)}</span>
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
  avgSale: number;
  topProducts: {
    name: string;
    volume: string;
    count: number;
    revenue: number;
  }[];
};

function AnalyticsView({ 
  sales, 
  stats, 
  formatPrice 
}: { 
  sales: Sale[]; 
  stats: Stats; 
  formatPrice: (price: number) => string; 
}) {
  // Données par jour
  const dailyData = useMemo(() => {
    const grouped: Record<string, { date: string; revenue: number; sales: number }> = {};
    
    sales.forEach(sale => {
      const date = new Date(sale.date).toLocaleDateString('fr-FR');
      if (!grouped[date]) {
        grouped[date] = { date, revenue: 0, sales: 0 };
      }
      grouped[date].revenue += sale.total;
      grouped[date].sales += 1;
    });
    
    return Object.values(grouped).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sales]);

  return (
    <div className="space-y-6">
      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-medium text-gray-600 mb-2">Ventes totales</h4>
          <p className="text-2xl font-bold text-blue-600">{sales.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-medium text-gray-600 mb-2">Chiffre d'affaires</h4>
          <p className="text-2xl font-bold text-green-600">{formatPrice(stats.totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-medium text-gray-600 mb-2">Panier moyen</h4>
          <p className="text-2xl font-bold text-purple-600">{formatPrice(stats.avgSale)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <h4 className="text-sm font-medium text-gray-600 mb-2">Articles vendus</h4>
          <p className="text-2xl font-bold text-orange-600">{stats.totalItems}</p>
        </div>
      </div>

      {/* Évolution par jour */}
      <div className="bg-white rounded-xl p-6 border border-orange-100">
        <h4 className="text-lg font-semibold text-gray-800 mb-4">Évolution des ventes</h4>
        <div className="space-y-3">
          {dailyData.map(day => (
            <div key={day.date} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-800">{day.date}</p>
                <p className="text-sm text-gray-600">{day.sales} ventes</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-green-600">{formatPrice(day.revenue)}</p>
                <p className="text-sm text-gray-600">Moy: {formatPrice(day.revenue / day.sales)}</p>
              </div>
            </div>
          ))}
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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
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