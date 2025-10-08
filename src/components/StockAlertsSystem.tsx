import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Bell,
  Package,
  ShoppingCart,
  TrendingDown,
  Calendar,
  X,
  Check,
  Download,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { EnhancedButton } from './EnhancedButton';
import { Product} from '../types';

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

interface StockAlertsSystemProps {
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

export function StockAlertsSystem({ isOpen, onClose }: StockAlertsSystemProps) {
  const {
    products,
    sales,
    getLowStockProducts,
    getAverageCostPerUnit
  } = useAppContext();
  const formatPrice = useCurrencyFormatter();
  const { hasPermission } = useAuth();
  const { isMobile } = useViewport();

  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'read' | 'resolved'>('all');
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

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
  }, [products, getLowStockProducts]);

  // Calcul prédiction rupture stock
  const calculatePredictedRunout = (product: Product): Date | undefined => {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    
    const recentSales = sales.filter(sale => 
      new Date(sale.date) >= last30Days &&
      sale.items.some(item => item.product.id === product.id)
    );

    const totalSold = recentSales.reduce((sum, sale) => {
      const item = sale.items.find(i => i.product.id === product.id);
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
      new Date(sale.date) >= last30Days &&
      sale.items.some(item => item.product.id === product.id)
    );

    const totalSold = recentSales.reduce((sum, sale) => {
      const item = sale.items.find(i => i.product.id === product.id);
      return sum + (item?.quantity || 0);
    }, 0);

    const monthlyAverage = totalSold;
    const safetyStock = product.alertThreshold;
    const suggestedOrder = monthlyAverage + safetyStock - product.stock;
    
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
  }, [products, getLowStockProducts, getAverageCostPerUnit]);

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
  const exportOrderList = () => {
    const csvData = orderSuggestions.map(suggestion => ({
      'Produit': suggestion.productName,
      'Stock actuel': suggestion.currentStock,
      'Quantité suggérée': suggestion.suggestedQuantity,
      'Coût estimé': suggestion.estimatedCost,
      'Urgence': suggestion.urgency,
      'Raison': suggestion.reasoning
    }));

    const headers = Object.keys(csvData[0] || {});
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `bon_commande_${new Date().toISOString().split('T')[0]}.csv`);
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
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 ${isMobile ? '' : 'p-4'}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`bg-gradient-to-br from-yellow-100 to-amber-100 w-full shadow-2xl ${
              isMobile
                ? 'h-full'
                : 'rounded-2xl max-w-6xl max-h-[85vh] md:max-h-[90vh] overflow-hidden'
            }`}
          >
            {/* Header */}
            {isMobile ? (
              /* Header mobile avec bouton suggestions bien visible */
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={20} />
                    <h2 className="text-lg font-bold">Alertes stock</h2>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                    <X size={24} />
                  </button>
                </div>
                <p className="text-sm opacity-90 mb-3">
                  {stats.new} nouvelles • {stats.critical} critiques
                </p>
                {/* Bouton toggle suggestions - TOUJOURS VISIBLE */}
                <button
                  onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                  className={`w-full px-4 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
                    showOrderSuggestions
                      ? 'bg-white text-orange-600'
                      : 'bg-white/20 backdrop-blur text-white'
                  }`}
                >
                  <ShoppingCart size={18} />
                  {showOrderSuggestions ? 'Voir alertes' : `Suggestions de commande (${orderSuggestions.length})`}
                </button>
              </div>
            ) : (
              /* Header desktop */
              <div className="flex items-center justify-between p-6 border-b border-orange-200">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Alertes stock</h2>
                    <p className="text-sm text-gray-600">
                      {stats.new} nouvelles • {stats.critical} critiques
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <EnhancedButton
                    variant="info"
                    size="sm"
                    onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                    icon={<ShoppingCart size={16} />}
                  >
                    Suggestions ({orderSuggestions.length})
                  </EnhancedButton>
                  <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>
              </div>
            )}

            {/* ==================== VERSION MOBILE ==================== */}
            {isMobile ? (
              <div className="flex flex-col h-[calc(100vh-180px)]">
                {/* Stats + Filtres compacts en haut */}
                <div className="flex-shrink-0 bg-orange-50 p-3">
                  {/* Stats en 3 colonnes */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-red-100 rounded-lg p-2 text-center">
                      <p className="text-red-600 text-xs font-medium mb-1">Critiques</p>
                      <p className="text-red-800 font-bold text-sm">{stats.critical}</p>
                    </div>
                    <div className="bg-yellow-100 rounded-lg p-2 text-center">
                      <p className="text-yellow-600 text-xs font-medium mb-1">Nouvelles</p>
                      <p className="text-yellow-800 font-bold text-sm">{stats.new}</p>
                    </div>
                    <div className="bg-blue-100 rounded-lg p-2 text-center">
                      <p className="text-blue-600 text-xs font-medium mb-1">Total</p>
                      <p className="text-blue-800 font-bold text-sm">{stats.total}</p>
                    </div>
                  </div>

                  {/* Filtres horizontaux */}
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
                        className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                          filterStatus === filter.value
                            ? 'bg-orange-500 text-white'
                            : 'bg-white text-gray-700'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
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
                        {filteredAlerts.map(alert => (
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
                        <p className="text-sm text-gray-600 mb-2">
                          Total estimé: <span className="font-bold text-orange-600">{formatPrice(stats.totalOrderValue)}</span>
                        </p>
                        {orderSuggestions.map(suggestion => (
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
              <div className="flex h-[calc(85vh-120px)] md:h-[calc(90vh-120px)]">
                {/* Sidebar stats */}
                <div className="w-80 border-r border-orange-200 p-6 overflow-y-auto pb-20 md:pb-6">
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
                          className={`w-full text-left p-2 rounded-lg transition-colors ${
                            filterStatus === filter.value
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-gray-700 hover:bg-orange-50'
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
                        filteredAlerts.map(alert => (
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
                          {orderSuggestions.map(suggestion => (
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
      className={`rounded-xl p-4 border-2 transition-all ${getSeverityColor(alert.severity)} ${
        alert.status === 'new' ? 'shadow-md' : 'opacity-75'
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
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          alert.status === 'new' ? 'bg-red-100 text-red-700' :
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
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          suggestion.urgency === 'high' ? 'bg-red-100 text-red-700' :
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