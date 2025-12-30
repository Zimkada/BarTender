import { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  DollarSign,
  ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useFeedback } from '../hooks/useFeedback';
import { useStockManagement } from '../hooks/useStockManagement';
import { EnhancedButton } from './EnhancedButton';
import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';
// XLSX lazy loaded in exportOrderList function to save ~138 KB gzipped on initial bundle
import { ForecastingService, ProductSalesStats, OrderSuggestion } from '../services/supabase/forecasting.service';
import { Button } from './ui/Button';

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

type ForecastView = 'stock' | 'sales' | 'advanced';

export function ForecastingSystem() {
  const navigate = useNavigate();
  const { formatPrice } = useCurrencyFormatter();
  const { hasPermission } = useAuth();
  const { isMobile } = useViewport();
  const { currentBar } = useBarContext();
  const { showSuccess, showError } = useFeedback();
  const { products } = useStockManagement();

  const [activeTab, setActiveTab] = useState<ForecastView>('stock');
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'read' | 'resolved'>('all');
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

  // Récupérer la fréquence depuis les settings du bar (défaut: 7 jours)
  const coverageDays = currentBar?.settings?.supplyFrequency ?? 7;

  // SQL Data State
  const [productStats, setProductStats] = useState<ProductSalesStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger les données SQL
  const loadStats = async () => {
    if (!currentBar) return;

    try {
      setIsLoading(true);
      const stats = await ForecastingService.getProductSalesStats(currentBar.id);
      setProductStats(stats);

      // Générer les alertes basées sur les données SQL
      const newAlerts: StockAlert[] = stats
        .filter(stat => stat.current_stock <= stat.alert_threshold)
        .map(stat => {
          const severity: StockAlert['severity'] =
            stat.current_stock === 0 ? 'critical' :
              stat.current_stock <= stat.alert_threshold / 2 ? 'critical' :
                'warning';

          // Calculer suggestion pour l'alerte
          const suggestion = ForecastingService.calculateOrderSuggestion(stat, coverageDays);

          return {
            id: `alert_${stat.product_id}_${new Date().toISOString().split('T')[0]}`,
            productId: stat.product_id,
            productName: stat.product_name,
            productVolume: stat.product_volume,
            currentStock: stat.current_stock,
            threshold: stat.alert_threshold,
            severity,
            createdAt: new Date(),
            status: 'new',
            // Estimation rupture: stock / moyenne journalière
            predictedRunout: stat.daily_average > 0
              ? new Date(Date.now() + (stat.current_stock / stat.daily_average) * 86400000)
              : undefined,
            suggestedOrder: suggestion.suggestedQuantity
          };
        });

      setAlerts(prev => {
        // Fusionner avec les alertes existantes pour ne pas perdre le statut 'read'/'resolved'
        const existingMap = new Map(prev.map(a => [a.productId, a]));
        return newAlerts.map(newAlert => {
          const existing = existingMap.get(newAlert.productId);
          if (existing && existing.status !== 'new') {
            return { ...newAlert, status: existing.status, id: existing.id };
          }
          return newAlert;
        });
      });

    } catch (error) {
      console.error('Error loading forecasting stats:', error);
      showError('Erreur lors du chargement des prévisions');
    } finally {
      setIsLoading(false);
    }
  };

  // Charger au montage et quand le bar change OU quand les produits changent
  useEffect(() => {
    if (currentBar) {
      loadStats();
    }
  }, [currentBar, products]); // Removed isOpen - now a pure page component

  // Recalculer les suggestions quand coverageDays change (sans recharger SQL)
  const orderSuggestions = useMemo(() => {
    return productStats
      .map(stat => ForecastingService.calculateOrderSuggestion(stat, coverageDays))
      .filter(suggestion => suggestion.suggestedQuantity > 0)
      .sort((a, b) => {
        // Trier par urgence puis par coût
        const urgencyScore = { high: 3, medium: 2, low: 1 };
        if (urgencyScore[a.urgency] !== urgencyScore[b.urgency]) {
          return urgencyScore[b.urgency] - urgencyScore[a.urgency];
        }
        return b.estimatedCost - a.estimatedCost;
      });
  }, [productStats, coverageDays]);

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

  // Export bon de commande Excel
  const exportOrderList = async () => {
    // Lazy load XLSX library only when export is triggered (saves ~138 KB gzipped on initial load)
    const XLSX = await import('xlsx');

    const exportData = orderSuggestions.map(suggestion => ({
      'Produit': suggestion.productName,
      'Volume': suggestion.productVolume,
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
      { wch: 10 }, // Volume
      { wch: 12 }, // Stock actuel
      { wch: 18 }, // Quantité suggérée
      { wch: 15 }, // Coût estimé
      { wch: 10 }, // Urgence
      { wch: 40 }, // Raison
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Commande Suggérée");
    XLSX.writeFile(wb, `bon_commande_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Removed: if (!isOpen) return null; - Now a pure page component

  return (
    <div className="bg-gradient-to-br from-amber-50 to-amber-50 w-full shadow-xl rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-lg transition-colors hover:bg-white/20"
            >
              <ArrowLeft size={isMobile ? 20 : 24} />
            </Button>
            <TrendingUp size={isMobile ? 20 : 24} />
            <div className="flex items-center gap-2">
              <h2 className={`font-bold ${isMobile ? 'text-lg' : 'text-xl'}`}>
                📈 Prévisions
              </h2>
              <DataFreshnessIndicatorCompact
                viewName="product_sales_stats"
                onRefreshComplete={async () => {
                  await loadStats();
                  showSuccess('✅ Données actualisées avec succès');
                }}
              />
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-2 bg-white/10 backdrop-blur p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium ${activeTab === 'stock'
              ? 'bg-white text-amber-600'
              : 'text-white hover:bg-white/20'
              }`}
          >
            <AlertTriangle size={16} />
            Alertes Stock
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium ${activeTab === 'sales'
              ? 'bg-white text-amber-600'
              : 'text-white hover:bg-white/20'
              }`}
          >
            <BarChart3 size={16} />
            Analyse Ventes
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`flex-1 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1 ${isMobile ? 'text-xs' : 'text-sm'} font-medium ${activeTab === 'advanced'
              ? 'bg-white text-amber-600'
              : 'text-white hover:bg-white/20'
              }`}
          >
            <ShoppingCart size={16} />
            Suggestions
          </button>
        </div>
      </div>

      {/* Content - Same as modal */}
      <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
          </div>
        ) : (
          <>
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
              <SalesForecastView />
            )}

            {activeTab === 'advanced' && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500 py-12">
                  <BarChart3 size={64} className="mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">Analyses Avancées</h3>
                  <p className="text-sm">🚧 Bientôt disponible</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
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
function SalesForecastView() {
  return (
    <div className="flex items-center justify-center min-h-full p-6">
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

      <div className="flex justify-end gap-2">
        {alert.status === 'new' && (
          <button
            onClick={onMarkAsRead}
            className="p-1.5 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors"
            title="Marquer comme lu"
          >
            <Check size={16} />
          </button>
        )}
        {alert.status !== 'resolved' && (
          <button
            onClick={onMarkAsResolved}
            className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
            title="Marquer comme résolu"
          >
            <Check size={16} className="double" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Supprimer"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// Composant carte suggestion commande
function OrderSuggestionCard({
  suggestion,
  formatPrice
}: {
  suggestion: OrderSuggestion;
  formatPrice: (price: number) => string;
}) {
  const getUrgencyColor = (urgency: OrderSuggestion['urgency']) => {
    switch (urgency) {
      case 'high': return 'bg-red-50 border-red-200';
      case 'medium': return 'bg-orange-50 border-orange-200';
      case 'low': return 'bg-green-50 border-green-200';
    }
  };

  const getUrgencyBadge = (urgency: OrderSuggestion['urgency']) => {
    switch (urgency) {
      case 'high': return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">URGENT</span>;
      case 'medium': return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold">NORMAL</span>;
      case 'low': return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">FAIBLE</span>;
    }
  };

  return (
    <div className={`p-4 rounded-xl border ${getUrgencyColor(suggestion.urgency)}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-bold text-gray-800">{suggestion.productName}</h4>
          <p className="text-xs text-gray-500">{suggestion.productVolume}</p>
        </div>
        {getUrgencyBadge(suggestion.urgency)}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
        <div className="bg-white/50 p-2 rounded">
          <span className="block text-gray-500 text-xs">Stock actuel</span>
          <span className="font-semibold">{suggestion.currentStock}</span>
        </div>
        <div className="bg-white/50 p-2 rounded">
          <span className="block text-gray-500 text-xs">À commander</span>
          <span className="font-bold text-amber-600 text-lg">{suggestion.suggestedQuantity}</span>
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Coût estimé</p>
          <p className="font-bold text-gray-800">{formatPrice(suggestion.estimatedCost)}</p>
        </div>
        <div className="text-right max-w-[50%]">
          <p className="text-xs text-gray-500 italic truncate" title={suggestion.reasoning}>
            {suggestion.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}
