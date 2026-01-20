import { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  DollarSign
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
import { ForecastingService, ProductSalesStats, OrderSuggestion } from '../services/supabase/forecasting.service';
import { TabbedPageHeader } from './common/PageHeader/patterns/TabbedPageHeader';
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
  const { allProductsStockInfo } = useStockManagement();
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'read' | 'resolved'>('all');
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);

  const coverageDays = currentBar?.settings?.supplyFrequency ?? 7;

  const [productStats, setProductStats] = useState<ProductSalesStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadStats = async () => {
    if (!currentBar) return;

    try {
      setIsLoading(true);
      const stats = await ForecastingService.getProductSalesStats(currentBar.id);
      setProductStats(stats);

      const newAlerts: StockAlert[] = stats
        .map((stat: ProductSalesStats) => {
          const availableStock = (allProductsStockInfo as any)[stat.product_id]?.availableStock ?? stat.current_stock;
          return { ...stat, availableStock };
        })
        .filter(stat => stat.availableStock <= stat.alert_threshold)
        .map(stat => {
          const severity: StockAlert['severity'] =
            stat.availableStock === 0 ? 'critical' :
              stat.availableStock <= stat.alert_threshold / 2 ? 'critical' :
                'warning';

          const suggestion = ForecastingService.calculateOrderSuggestion(stat, coverageDays, stat.availableStock);

          return {
            id: `alert_${stat.product_id}_${new Date().toISOString().split('T')[0]}`,
            productId: stat.product_id,
            productName: stat.product_name,
            productVolume: stat.product_volume,
            currentStock: stat.availableStock,
            threshold: stat.alert_threshold,
            severity,
            createdAt: new Date(),
            status: 'new',
            predictedRunout: stat.daily_average > 0
              ? new Date(Date.now() + (stat.availableStock / stat.daily_average) * 86400000)
              : undefined,
            suggestedOrder: suggestion.suggestedQuantity
          };
        });

      setAlerts(prev => {
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

  useEffect(() => {
    if (currentBar) {
      loadStats();
    }
  }, [currentBar, products]);

  const orderSuggestions = useMemo(() => {
    return productStats
      .map((stat: ProductSalesStats) => {
        const availableStock = (allProductsStockInfo as any)[stat.product_id]?.availableStock ?? stat.current_stock;
        return ForecastingService.calculateOrderSuggestion(stat, coverageDays, availableStock);
      })
      .filter(suggestion => suggestion.suggestedQuantity > 0)
      .sort((a, b) => {
        const urgencyScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
        if (urgencyScore[a.urgency] !== urgencyScore[b.urgency]) {
          return urgencyScore[b.urgency] - urgencyScore[a.urgency];
        }
        return b.estimatedCost - a.estimatedCost;
      });
  }, [productStats, coverageDays]);

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

  const filteredAlerts = alerts.filter(alert => {
    if (filterStatus === 'all') return true;
    return alert.status === filterStatus;
  });

  const stats = {
    total: alerts.length,
    new: alerts.filter(a => a.status === 'new').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    totalOrderValue: orderSuggestions.reduce((sum, s) => sum + s.estimatedCost, 0)
  };

  const exportOrderList = async () => {
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
    ws['!cols'] = [
      { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 40 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Commande Suggérée");
    XLSX.writeFile(wb, `bon_commande_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const tabsConfig = [
    { id: 'stock', label: isMobile ? 'Stock' : 'Alertes Stock', icon: AlertTriangle },
    { id: 'sales', label: isMobile ? 'Ventes' : 'Analyse Ventes', icon: BarChart3 },
    { id: 'advanced', label: isMobile ? 'Commandes' : 'Suggestions de Commande', icon: ShoppingCart },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TabbedPageHeader
        title="📈 Prévisions"
        subtitle="Analyses prédictives et alertes de stock"
        // L'utilisateur veut supprimer la "première icône" car déjà présente ailleurs.
        // On garde uniquement le titre propre sans emoji.
        tabs={tabsConfig}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as ForecastView)}
        guideId="forecasting-guide"
        onBack={() => navigate(-1)}
        mobileTopRightContent={
          <DataFreshnessIndicatorCompact
            viewName="product_sales_stats"
            onRefreshComplete={async () => {
              await loadStats();
              showSuccess('✅ Données actualisées avec succès');
            }}
          />
        }
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-12">
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
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

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
          <div className="flex-shrink-0 bg-amber-50 p-3 rounded-xl mb-3">
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

            {!showOrderSuggestions && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {[
                  { value: 'all', label: 'Toutes' },
                  { value: 'new', label: 'Nouvelles' },
                  { value: 'read', label: 'Lues' },
                  { value: 'resolved', label: 'Résolues' }
                ].map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setFilterStatus(filter.value as any)}
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

          <div className="flex-1 overflow-y-auto">
            {!showOrderSuggestions ? (
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
              orderSuggestions.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">Aucune suggestion</h3>
                  <p className="text-gray-500">Tous vos stocks sont corrects</p>
                </div>
              ) : (
                <div className="space-y-3">
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
        <div className="flex h-full">
          <div className="w-80 border-r border-gray-100 p-6 overflow-y-auto">
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Vue d'ensemble</h3>
              <div className="space-y-3">
                <div className="bg-red-50 text-red-700 rounded-xl p-3 border border-red-100">
                  <p className="text-xs font-medium uppercase tracking-wider mb-1">Critiques</p>
                  <p className="font-bold text-2xl">{stats.critical}</p>
                </div>
                <div className="bg-amber-50 text-amber-700 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs font-medium uppercase tracking-wider mb-1">Nouvelles</p>
                  <p className="font-bold text-2xl">{stats.new}</p>
                </div>
                <div className="bg-blue-50 text-blue-700 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs font-medium uppercase tracking-wider mb-1">Valeur commande</p>
                  <p className="font-bold text-2xl">{formatPrice(stats.totalOrderValue)}</p>
                </div>
              </div>
            </div>

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
                    onClick={() => setFilterStatus(filter.value as any)}
                    className={`w-full text-left px-4 py-2 rounded-xl transition-all ${filterStatus === filter.value
                      ? 'bg-amber-500 text-white shadow-md'
                      : 'bg-white text-gray-600 hover:bg-amber-50 border border-gray-100'
                      }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {hasPermission('canManageInventory') && (
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Actions</h3>
                <div className="space-y-2">
                  <EnhancedButton
                    variant="info"
                    size="sm"
                    onClick={() => setShowOrderSuggestions(!showOrderSuggestions)}
                    icon={<ShoppingCart size={16} />}
                    className="w-full justify-start py-3"
                  >
                    {showOrderSuggestions ? 'Voir alertes' : `Suggestions (${orderSuggestions.length})`}
                  </EnhancedButton>
                  <EnhancedButton
                    variant="primary"
                    size="sm"
                    onClick={exportOrderList}
                    disabled={orderSuggestions.length === 0}
                    icon={<Download size={16} />}
                    className="w-full justify-start py-3"
                  >
                    Export commande
                  </EnhancedButton>
                  <EnhancedButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setAlerts([])}
                    className="w-full justify-start py-3"
                  >
                    Tout effacer
                  </EnhancedButton>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {!showOrderSuggestions ? (
              <div className="space-y-4 max-w-4xl">
                {filteredAlerts.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
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
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      Suggestions de commande intelligentes
                    </h3>
                    <p className="text-sm text-gray-500">Basé sur vos ventes réelles des 30 derniers jours</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Investissement total</p>
                    <p className="text-2xl font-black text-amber-600">{formatPrice(stats.totalOrderValue)}</p>
                  </div>
                </div>

                {orderSuggestions.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
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

function SalesForecastView() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6 lg:p-12">
      <div className="text-center max-w-2xl bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <DollarSign size={40} className="text-amber-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-3">
          Prévisions de Ventes
        </h3>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          Nous affinons le modèle mathématique pour vous donner les prévisions les plus précises possibles.
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-left">
          <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
            <Check size={18} /> À venir prochainement :
          </h4>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-amber-800/80">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>CA prévisionnel à 30 jours</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Identification produits stars</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Saisonnalité hebdomadaire</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <span>Recommandations de prix</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

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
  const getSeverityStyle = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'border-red-200 bg-white ring-red-500/10 shadow-red-500/5';
      case 'warning': return 'border-yellow-200 bg-white ring-yellow-500/10 shadow-yellow-500/5';
      case 'info': return 'border-blue-200 bg-white ring-blue-500/10 shadow-blue-500/5';
    }
  };

  const getSeverityIcon = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="text-red-500" size={24} />;
      case 'warning': return <TrendingDown className="text-yellow-500" size={24} />;
      case 'info': return <Package className="text-blue-500" size={24} />;
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={`rounded-2xl p-5 border shadow-sm transition-all ${getSeverityStyle(alert.severity)} ${alert.status === 'new' ? 'border-l-4 border-l-amber-500' : 'opacity-80'}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="p-2 bg-gray-50 rounded-xl shrink-0">
            {getSeverityIcon(alert.severity)}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-gray-800 text-lg leading-tight truncate mb-1" title={alert.productName}>
              {alert.productName}
            </h4>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-gray-500 text-sm font-medium truncate">{alert.productVolume}</p>
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${alert.status === 'new' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                {alert.status === 'new' ? 'Nouveau' : alert.status === 'read' ? 'Lu' : 'Résolu'}
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm font-medium">
              <div className="flex flex-col">
                <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Stock Actuel</span>
                <span className={`${alert.currentStock === 0 ? 'text-red-600' : 'text-gray-700'}`}>{alert.currentStock} unités</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">Seuil Alerte</span>
                <span className="text-gray-700">{alert.threshold}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {alert.predictedRunout ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-bold text-xs italic">
              <Calendar size={12} />
              Rupture: {alert.predictedRunout.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </div>
          ) : (
            <div className="w-2" />
          )}
        </div>

        <div className="flex items-center gap-1">
          {alert.status === 'new' && (
            <Button variant="ghost" size="sm" onClick={onMarkAsRead} className="h-9 w-9 p-0 text-amber-600 hover:bg-amber-50">
              <Check size={18} />
            </Button>
          )}
          {alert.status !== 'resolved' && (
            <Button variant="ghost" size="sm" onClick={onMarkAsResolved} className="h-9 px-3 text-green-600 hover:bg-green-50 flex items-center gap-1 font-bold">
              <Check size={16} /> Résoudre
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-9 w-9 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50">
            <X size={18} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function OrderSuggestionCard({
  suggestion,
  formatPrice
}: {
  suggestion: OrderSuggestion;
  formatPrice: (price: number) => string;
}) {
  const getUrgencyConfig = (urgency: OrderSuggestion['urgency']) => {
    switch (urgency) {
      case 'high': return { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', label: 'Immédiat' };
      case 'medium': return { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', label: 'Prochainement' };
      case 'low': return { bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700', label: 'Normal' };
    }
  };

  const cfg = getUrgencyConfig(suggestion.urgency);

  return (
    <div className={`p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow`}>
      <div className="mb-6">
        <h4 className="font-bold text-gray-900 text-lg mb-1 truncate" title={suggestion.productName}>
          {suggestion.productName}
        </h4>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400 text-sm font-medium block truncate">{suggestion.productVolume}</span>
          <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shrink-0 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
            {cfg.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50/50 p-3 rounded-2xl">
          <span className="block text-gray-400 text-[10px] uppercase font-black mb-1">Stock Actuel</span>
          <span className="text-xl font-bold text-gray-800">{suggestion.currentStock}</span>
        </div>
        <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100/50">
          <span className="block text-amber-500 text-[10px] uppercase font-black mb-1">Recommandation</span>
          <span className="text-2xl font-black text-amber-600">+{suggestion.suggestedQuantity}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-50 flex items-center justify-between gap-4">
        <div>
          <span className="block text-gray-400 text-[10px] uppercase font-black mb-0.5">Investissement</span>
          <span className="font-bold text-gray-900">{formatPrice(suggestion.estimatedCost)}</span>
        </div>
        <div className="flex-1 text-right">
          <p className="text-[11px] text-gray-500 italic leading-tight line-clamp-2">
            "{suggestion.reasoning}"
          </p>
        </div>
      </div>
    </div>
  );
}
