import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Bell,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Calendar,
  X,
  Check,
  Download,
  Plus,
  BarChart3,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { EnhancedButton } from './EnhancedButton';
import { Product } from '../types';
import { getSaleDate } from '../utils/saleHelpers';
import * as XLSX from 'xlsx';

interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  productVolume: string;
  currentStock: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  createdAt: Date;
  status: 'new' | 'read' | 'resolved';
  predictedRunout?: Date;
  suggestedOrder?: number;
}

interface ForecastingSystemProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OrderSuggestion {
  productId: string;
  productName: string;
  currentStock: number;
  suggestedQuantity: number;
  estimatedCost: number;
  urgency: 'high' | 'medium' | 'low';
  reasoning: string;
}

type ForecastView = 'stock' | 'sales' | 'advanced';

export function ForecastingSystem({ isOpen, onClose }: ForecastingSystemProps) {
  const {
    products,
    sales,
    getLowStockProducts,
    getAverageCostPerUnit
  } = useAppContext();
  const { formatPrice } = useCurrencyFormatter();
  const { hasPermission } = useAuth();
  const { isMobile } = useViewport();

  const [activeTab, setActiveTab] = useState<ForecastView>('stock');
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'read' | 'resolved'>('all');
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);
  const [coverageDays, setCoverageDays] = useState(7); // Fréquence d'approvisionnement: 7 jours par défaut

  // Génération automatique des alertes
  useEffect(() => {
    const lowStockProducts = getLowStockProducts();
    const newAlerts: StockAlert[] = lowStockProducts.map(product => {
      const severity: StockAlert['severity'] =
        product.stock === 0 ? 'critical' :
          product.stock <= product.alertThreshold / 2 ? 'critical' :
            'warning';

      return {
        id: `alert_${product.id}_${Date.now()}`,
        productId: product.id,
        productName: product.name,
        productVolume: product.volume,
        currentStock: product.stock,
        threshold: product.alertThreshold,
        severity,
        createdAt: new Date(),
        status: 'new',
        predictedRunout: calculatePredictedRunout(product),
        suggestedOrder: calculateSuggestedOrder(product)
      };
    });

    setAlerts(prev => {
      const existingIds = prev.map(a => a.productId);
      const toAdd = newAlerts.filter(alert => !existingIds.includes(alert.productId));
      return [...prev, ...toAdd];
    });
  }, [products, getLowStockProducts, coverageDays]);

  // Calcul prédiction rupture stock
  const calculatePredictedRunout = (product: Product): Date | undefined => {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentSales = sales.filter(sale =>
      sale.status === 'validated' &&
      getSaleDate(sale) >= last30Days &&
      sale.items.some((item: any) => {
        const productId = item.product?.id || item.product_id;
        return productId === product.id;
      })
    );

    const totalSold = recentSales.reduce((sum, sale) => {
      const item = sale.items.find((i: any) => {
        const productId = i.product?.id || i.product_id;
        return productId === product.id;
      });
      return sum + (item?.quantity || 0);
    }, 0);

    const dailyAverage = totalSold / 30;

    if (dailyAverage > 0 && product.stock > 0) {
      const daysRemaining = product.stock / dailyAverage;
      const runoutDate = new Date();
      runoutDate.setDate(runoutDate.getDate() + Math.floor(daysRemaining));
      return runoutDate;
    }

    return undefined;
  };

  // Calcul suggestion commande
  const calculateSuggestedOrder = (product: Product): number => {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentSales = sales.filter(sale =>
      sale.status === 'validated' &&
      getSaleDate(sale) >= last30Days &&
      sale.items.some((item: any) => {
        const productId = item.product?.id || item.product_id;
        return productId === product.id;
      })
    );

    const totalSold = recentSales.reduce((sum, sale) => {
      const item = sale.items.find((i: any) => {
        const productId = i.product?.id || i.product_id;
        return productId === product.id;
      });
      return sum + (item?.quantity || 0);
    }, 0);

    // Calculer le nombre de jours RÉELS avec des ventes (pas 30 jours fixes)
    const uniqueDays = new Set(
      recentSales.map(sale => getSaleDate(sale).toDateString())
    );
    const actualDaysWithSales = uniqueDays.size;

    // Si aucune vente, pas de suggestion
    if (actualDaysWithSales === 0 || totalSold === 0) {
      return 0;
    }

    // Moyenne journalière basée sur les jours RÉELS de vente
    const dailyAverage = totalSold / actualDaysWithSales;

    // Besoin pour la période de couverture choisie
    const coverageNeeds = dailyAverage * coverageDays;

    const safetyStock = product.alertThreshold;
    const suggestedOrder = coverageNeeds + safetyStock - product.stock;

    return Math.max(0, Math.ceil(suggestedOrder));
  };

  // Suggestions de commande globales
  const orderSuggestions = useMemo((): OrderSuggestion[] => {
    return getLowStockProducts().map(product => {
      const suggestedQuantity = calculateSuggestedOrder(product);
      const avgCost = getAverageCostPerUnit(product.id);
      const estimatedCost = suggestedQuantity * avgCost;

      let urgency: OrderSuggestion['urgency'] = 'low';
      let reasoning = 'Stock normal';

      if (product.stock === 0) {
        urgency = 'high';
        reasoning = 'Rupture de stock';
      } else if (product.stock <= product.alertThreshold / 2) {
        urgency = 'high';
        reasoning = 'Stock critique';
      } else if (product.stock <= product.alertThreshold) {
        urgency = 'medium';
        reasoning = 'Stock faible';
      }

      return {
        productId: product.id,
        productName: `${product.name} (${product.volume})`,
        currentStock: product.stock,
        suggestedQuantity,
        estimatedCost,
        urgency,
        reasoning
      };
    }).filter(suggestion => suggestion.suggestedQuantity > 0);
  }, [products, getLowStockProducts, getAverageCostPerUnit, coverageDays]);

  // Actions sur alertes
  const markAsRead = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId ? { ...alert, status: 'read' } : alert
    ));
  };

  const markAsResolved = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId ? { ...alert, status: 'resolved' } : alert
    ));
  };

  const deleteAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  // Filtrage
  const filteredAlerts = alerts.filter(alert => {
    if (filterStatus === 'all') return true;
    return alert.status === filterStatus;
  });

  // Stats
  const stats = {
    total: alerts.length,
    new: alerts.filter(a => a.status === 'new').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    totalOrderValue: orderSuggestions.reduce((sum, s) => sum + s.estimatedCost, 0)
  };

  // Export bon de commande
  // Export bon de commande Excel
  const exportOrderList = () => {
    const exportData = orderSuggestions.map(suggestion => ({
      'Produit': suggestion.productName,
      'Stock actuel': suggestion.currentStock,
      'Quantité suggérée': suggestion.suggestedQuantity,
      'Coût estimé (FCFA)': suggestion.estimatedCost,
      'Urgence': suggestion.urgency === 'high' ? 'Haute' : suggestion.urgency === 'medium' ? 'Moyenne' : 'Faible',
      'Raison': suggestion.reasoning
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Ajustement largeur colonnes
    const wscols = [
      { wch: 30 }, // Produit
      { wch: 12 }, // Stock actuel
      { wch: 18 }, // Quantité suggérée
      { wch: 15 }, // Coût estimé
      { wch: 10 }, // Urgence
      { wch: 25 }, // Raison
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Commande Suggérée");
    XLSX.writeFile(wb, `bon_commande_${new Date().toISOString().split('T')[0]}.xlsx`);
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
            className={`bg-gradient-to-br from-amber-50 to-amber-50 w-full shadow-2xl ${isMobile
              ? 'h-full'
              : 'rounded-2xl max-w-6xl max-h-[85vh] md:max-h-[90vh] overflow-hidden'
              }`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={isMobile ? 20 : 24} />
                  <h2 className={`font-bold ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    📈 Prévisions & Analyses
                  </h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                  <X size={24} />
                </button>
              </div>

              {/* Tabs Navigation */}
              <div className="flex gap-2 bg-white/10 backdrop-blur p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('stock')}
                  className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium ${activeTab === 'stock'
                    ? 'bg-white text-amber-600'
                    : 'text-white hover:bg-white/10'
                    }`}
                >
                  <Package size={16} />
                  {!isMobile && <span>Stock</span>}
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium ${activeTab === 'sales'
                    ? 'bg-white text-amber-600'
                    : 'text-white hover:bg-white/10'
                    }`}
                >
                  <DollarSign size={16} />
                  {!isMobile && <span>Ventes</span>}
                </button>
                <button
                  onClick={() => setActiveTab('advanced')}
                  disabled
                  className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium opacity-50 cursor-not-allowed text-white`}
                >
                  <BarChart3 size={16} />
                  {!isMobile && <span>Analyses</span>}
                </button>
              </div>

              {/* Curseur Fréquence d'approvisionnement - Visible uniquement dans l'onglet Stock */}
              {activeTab === 'stock' && (
                <div className="mt-4 bg-white/10 backdrop-blur p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">Fréquence d'approvisionnement</span>
                    <span className="text-sm font-bold text-white bg-white/20 px-2 py-0.5 rounded">
                      {coverageDays} jours
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={coverageDays}
                    onChange={(e) => setCoverageDays(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <div className="flex justify-between text-xs text-white/60 mt-1">
                    <span>1 jour</span>
                    <span>15 jours</span>
                    <span>30 jours</span>
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className={`${isMobile ? 'h-[calc(100vh-230px)]' : 'h-[calc(85vh-230px)] md:h-[calc(90vh-230px)]'} overflow-hidden`}>
              {activeTab === 'stock' && (
                <StockForecastView
                  isMobile={isMobile}
                  alerts={alerts}
                  filteredAlerts={filteredAlerts}
                  filterStatus={filterStatus}
                  setFilterStatus={setFilterStatus}
                  showOrderSuggestions={showOrderSuggestions}
                  setShowOrderSuggestions={setShowOrderSuggestions}
                  orderSuggestions={orderSuggestions}
                  stats={stats}
                  formatPrice={formatPrice}
                  markAsRead={markAsRead}
                  markAsResolved={markAsResolved}
                  deleteAlert={deleteAlert}
                  setAlerts={setAlerts}
                  exportOrderList={exportOrderList}
                  hasPermission={hasPermission}
                />
              )}

              {activeTab === 'sales' && (
                <SalesForecastView
                  isMobile={isMobile}
                  formatPrice={formatPrice}
                />
              )}

              {activeTab === 'advanced' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-500 py-12">
                    <BarChart3 size={64} className="mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium mb-2">Analyses Avancées</h3>
                    <p className="text-sm">🚧 Bientôt disponible</p>
                    <p className="text-xs mt-2 text-gray-400">Machine Learning & Optimisations</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==================== SUB-COMPONENTS ====================

// Stock Forecast View
function StockForecastView({
  isMobile,
  filteredAlerts,
  filterStatus,
  setFilterStatus,
  showOrderSuggestions,
  setShowOrderSuggestions,
  orderSuggestions,
  stats,
  formatPrice,
  markAsRead,
  markAsResolved,
  deleteAlert,
  setAlerts,
  exportOrderList,
  hasPermission
}: any) {
  return (
    <>
      {isMobile ? (
        <div className="flex flex-col h-full">
          {/* Filtres compacts en haut */}
          <div className="flex-shrink-0 bg-amber-50 p-3">
            {/* Bouton toggle suggestions */}
            <button
              onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
              className={`w-full px-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors mb-3 ${showOrderSuggestions
                ? 'bg-white text-amber-600 border-2 border-amber-600'
                : 'bg-amber-500 text-white'
                }`}
            >
              <ShoppingCart size={18} />
              {showOrderSuggestions ? 'Voir alertes' : `Suggestions de commande (${orderSuggestions.length})`}
            </button>

            {/* Filtres horizontaux */}
            {!showOrderSuggestions && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {[
                  { value: 'all', label: 'Toutes' },
                  { value: 'new', label: 'Nouvelles' },
                  { value: 'read', label: 'Lues' },
                  { value: 'resolved', label: 'Résolues' }
                ].map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setFilterStatus(filter.value as typeof filterStatus)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${filterStatus === filter.value
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-700'
                      }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto p-3">
            {!showOrderSuggestions ? (
              /* Liste des alertes */
              filteredAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <Bell size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune alerte</h3>
                  <p className="text-gray-500">Toutes vos alertes apparaîtront ici</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAlerts.map((alert: StockAlert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onMarkAsRead={() => markAsRead(alert.id)}
                      onMarkAsResolved={() => markAsResolved(alert.id)}
                      onDelete={() => deleteAlert(alert.id)}
                    />
                  ))}
                </div>
              )
            ) : (
              /* Suggestions de commande */
              orderSuggestions.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune suggestion</h3>
                  <p className="text-gray-500">Tous vos stocks sont corrects</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Header avec bouton Export uniquement - Mobile */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg sticky top-0 z-10 px-3 py-2 flex justify-end">
                    <EnhancedButton
                      variant="primary"
                      size="sm"
                      onClick={exportOrderList}
                      icon={<Download size={14} />}
                      className="text-xs px-3 py-1.5"
                    >
                      Export
                    </EnhancedButton>
                  </div>
                  {orderSuggestions.map((suggestion: OrderSuggestion) => (
                    <OrderSuggestionCard
                      key={suggestion.productId}
                      suggestion={suggestion}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      ) : (
        /* ==================== VERSION DESKTOP ==================== */
        <div className="flex h-full">
          {/* Sidebar stats */}
          <div className="w-80 border-r border-purple-200 p-6 overflow-y-auto pb-20 md:pb-6">
            {/* Statistiques */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Vue d'ensemble</h3>
              <div className="space-y-3">
                <div className="bg-red-100 rounded-lg p-3">
                  <p className="text-red-600 text-sm font-medium">Alertes critiques</p>
                  <p className="text-red-800 font-bold text-lg">{stats.critical}</p>
                </div>
                <div className="bg-yellow-100 rounded-lg p-3">
                  <p className="text-yellow-600 text-sm font-medium">Nouvelles alertes</p>
                  <p className="text-yellow-800 font-bold text-lg">{stats.new}</p>
                </div>
                <div className="bg-blue-100 rounded-lg p-3">
                  <p className="text-blue-600 text-sm font-medium">Total alertes</p>
                  <p className="text-blue-800 font-bold text-lg">{stats.total}</p>
                </div>
                {orderSuggestions.length > 0 && (
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-green-600 text-sm font-medium">Valeur commande</p>
                    <p className="text-green-800 font-bold text-lg">{formatPrice(stats.totalOrderValue)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Filtres */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Filtres</h3>
              <div className="space-y-2">
                {[
                  { value: 'all', label: 'Toutes' },
                  { value: 'new', label: 'Nouvelles' },
                  { value: 'read', label: 'Lues' },
                  { value: 'resolved', label: 'Résolues' }
                ].map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setFilterStatus(filter.value as typeof filterStatus)}
                    className={`w-full text-left p-2 rounded-lg transition-colors ${filterStatus === filter.value
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-amber-50'
                      }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions rapides */}
            {hasPermission('canManageInventory') && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Actions</h3>
                <div className="space-y-2">
                  <EnhancedButton
                    variant="info"
                    size="sm"
                    onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                    icon={<ShoppingCart size={16} />}
                    className="w-full"
                  >
                    {showOrderSuggestions ? 'Voir alertes' : `Suggestions (${orderSuggestions.length})`}
                  </EnhancedButton>
                  <EnhancedButton
                    variant="primary"
                    size="sm"
                    onClick={exportOrderList}
                    disabled={orderSuggestions.length === 0}
                    icon={<Download size={16} />}
                    className="w-full"
                  >
                    Export commande
                  </EnhancedButton>
                  <EnhancedButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setAlerts([])}
                    className="w-full"
                  >
                    Tout effacer
                  </EnhancedButton>
                </div>
              </div>
            )}
          </div>

          {/* Contenu principal */}
          <div className="flex-1 overflow-y-auto p-6">
            {!showOrderSuggestions ? (
              /* Liste des alertes */
              <div className="space-y-4">
                {filteredAlerts.length === 0 ? (
                  <div className="text-center py-12">
                    <Bell size={48} className="text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune alerte</h3>
                    <p className="text-gray-500">Toutes vos alertes apparaîtront ici</p>
                  </div>
                ) : (
                  filteredAlerts.map((alert: StockAlert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onMarkAsRead={() => markAsRead(alert.id)}
                      onMarkAsResolved={() => markAsResolved(alert.id)}
                      onDelete={() => deleteAlert(alert.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              /* Suggestions de commande */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Suggestions de commande intelligentes
                  </h3>
                  <span className="text-sm text-gray-600">
                    Total estimé: {formatPrice(stats.totalOrderValue)}
                  </span>
                </div>

                {orderSuggestions.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune suggestion</h3>
                    <p className="text-gray-500">Tous vos stocks sont corrects</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {orderSuggestions.map((suggestion: OrderSuggestion) => (
                      <OrderSuggestionCard
                        key={suggestion.productId}
                        suggestion={suggestion}
                        formatPrice={formatPrice}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Sales Forecast View (Placeholder)
function SalesForecastView({ isMobile, formatPrice }: any) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center max-w-2xl">
        <DollarSign size={64} className="mx-auto mb-4 text-amber-400" />
        <h3 className="text-xl font-semibold text-gray-800 mb-3">
          Prévisions de Ventes
        </h3>
        <p className="text-gray-600 mb-6">
          🚧 Module en développement - Bientôt disponible
        </p>

        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6 text-left">
          <h4 className="font-semibold text-amber-800 mb-3">Fonctionnalités à venir :</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>Prévision CA 7 et 30 jours basée sur moyenne mobile</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>Identification produits stars et tendances</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>Meilleur jour de vente prévu (saisonnalité)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>Graphique évolution prévisions vs réalisations</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>Recommandations promotions et actions commerciales</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ==================== ALERT & ORDER CARDS ====================

// Composant carte d'alerte
function AlertCard({
  alert,
  onMarkAsRead,
  onMarkAsResolved,
  onDelete
}: {
  alert: StockAlert;
  onMarkAsRead: () => void;
  onMarkAsResolved: () => void;
  onDelete: () => void;
}) {
  const getSeverityColor = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'border-red-500 bg-red-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      case 'info': return 'border-blue-500 bg-blue-50';
    }
  };

  const getSeverityIcon = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="text-red-600" size={20} />;
      case 'warning': return <TrendingDown className="text-yellow-600" size={20} />;
      case 'info': return <Package className="text-blue-600" size={20} />;
    }
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`rounded-xl p-4 border-2 transition-all ${getSeverityColor(alert.severity)} ${alert.status === 'new' ? 'shadow-md' : 'opacity-75'
        }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getSeverityIcon(alert.severity)}
          <div>
            <h4 className="font-semibold text-gray-800">
              {alert.productName} ({alert.productVolume})
            </h4>
            <p className="text-sm text-gray-600">
              Stock: {alert.currentStock} / Seuil: {alert.threshold}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${alert.status === 'new' ? 'bg-red-100 text-red-700' :
          alert.status === 'read' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
          {alert.status === 'new' ? 'Nouveau' :
            alert.status === 'read' ? 'Lu' : 'Résolu'}
        </span>
      </div>

      {alert.predictedRunout && (
        <div className="mb-3 p-2 bg-white/50 rounded-lg">
          <p className="text-sm text-gray-700">
            <Calendar size={14} className="inline mr-1" />
            Rupture prévue: {alert.predictedRunout.toLocaleDateString('fr-FR')}
          </p>
        </div>
      )}

      {alert.suggestedOrder && alert.suggestedOrder > 0 && (
        <div className="mb-3 p-2 bg-white/50 rounded-lg">
          <p className="text-sm text-gray-700">
            <ShoppingCart size={14} className="inline mr-1" />
            Suggestion: commander {alert.suggestedOrder} unités
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {alert.status === 'new' && (
          <EnhancedButton
            variant="info"
            size="sm"
            onClick={onMarkAsRead}
            icon={<Check size={14} />}
          >
            Marquer lu
          </EnhancedButton>
        )}
        {alert.status !== 'resolved' && (
          <EnhancedButton
            variant="success"
            size="sm"
            onClick={onMarkAsResolved}
            icon={<Check size={14} />}
          >
            Résoudre
          </EnhancedButton>
        )}
        <EnhancedButton
          variant="danger"
          size="sm"
          onClick={onDelete}
          icon={<X size={14} />}
        >
          Supprimer
        </EnhancedButton>
      </div>
    </motion.div>
  );
}

// Composant suggestion de commande
function OrderSuggestionCard({
  suggestion,
  formatPrice
}: {
  suggestion: OrderSuggestion;
  formatPrice: (price: number) => string;
}) {
  const getUrgencyColor = (urgency: OrderSuggestion['urgency']) => {
    switch (urgency) {
      case 'high': return 'border-red-500 bg-red-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-green-500 bg-green-50';
    }
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`rounded-xl p-4 border-2 transition-all ${getUrgencyColor(suggestion.urgency)}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">{suggestion.productName}</h4>
          <p className="text-sm text-gray-600">
            Stock actuel: {suggestion.currentStock}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${suggestion.urgency === 'high' ? 'bg-red-100 text-red-700' :
          suggestion.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
          {suggestion.urgency === 'high' ? 'Urgent' :
            suggestion.urgency === 'medium' ? 'Moyen' : 'Faible'}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Quantité suggérée:</span>
          <span className="font-medium">{suggestion.suggestedQuantity}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Coût estimé:</span>
          <span className="font-medium text-green-600">{formatPrice(suggestion.estimatedCost)}</span>
        </div>
        <div className="text-sm text-gray-600">
          <em>{suggestion.reasoning}</em>
        </div>
      </div>

      <EnhancedButton
        variant="primary"
        size="sm"
        icon={<Plus size={14} />}
        className="w-full"
      >
        Ajouter à la commande
      </EnhancedButton>
    </motion.div>
  );
}
