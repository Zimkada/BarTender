import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, DollarSign, ShoppingCart, Package, Share, Lock, Eye, EyeOff, RotateCcw, Archive, Check, X, User, AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, ShoppingBag
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRevenueStats } from '../hooks/useRevenueStats';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useBarContext } from '../context/BarContext';
import { useStockManagement } from '../hooks/useStockManagement';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { AnimatedCounter } from './AnimatedCounter';
import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';
import { Sale, SaleItem, User as UserType } from '../types';
import { AnalyticsService, DailySalesSummary } from '../services/supabase/analytics.service';
import { useTopProducts } from '../hooks/queries/useTopProductsQuery';
import { getCurrentBusinessDateString } from '../utils/businessDateHelpers';
import { Button } from './ui/Button';

// Sous-composant pour les ventes en attente
const PendingSalesSection = ({ sales, onValidate, onReject, onValidateAll, users }: {
  sales: Sale[];
  onValidate: (saleId: string) => void;
  onReject: (saleId: string) => void;
  onValidateAll: (salesToValidate: Sale[]) => void;
  users: UserType[];
}) => {
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());

  const toggleExpanded = (saleId: string) => {
    setExpandedSales((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(saleId)) {
        newSet.delete(saleId);
      } else {
        newSet.add(saleId);
      }
      return newSet;
    });
  };

  const salesByServer = useMemo(() => {
    return sales.reduce((acc, sale) => {
      const serverId = sale.serverId || sale.soldBy;
      if (!acc[serverId]) acc[serverId] = [];
      acc[serverId].push(sale);
      return acc;
    }, {} as Record<string, Sale[]>);
  }, [sales]);

  const sortedServerIds = Object.keys(salesByServer).sort((a, b) => {
    const userA = users.find(u => u.id === a)?.name || '';
    const userB = users.find(u => u.id === b)?.name || '';
    return userA.localeCompare(userB);
  });

  if (sales.length === 0) return null;

  // ✨ MODE SWITCHING FIX: Only show bulk validation buttons to managers
  const isServerRole = currentSession?.role === 'serveur';
  const showBulkValidation = !isServerRole;

  return (
    <div className="bg-white rounded-xl p-4 border border-amber-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800 text-lg">Commandes en attente ({sales.length})</h3>
        {showBulkValidation && (
          <EnhancedButton onClick={() => onValidateAll(sales)} size="sm" variant="primary">Tout Valider</EnhancedButton>
        )}
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {sortedServerIds.map(serverId => {
          const serverSales = salesByServer[serverId];
          const server = users.find(u => u.id === serverId);
          return (
            <div key={serverId} className="bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-700 flex items-center gap-2"><User size={16} /> {server?.name || 'Inconnu'}</h4>
                {showBulkValidation && (
                  <EnhancedButton onClick={() => onValidateAll(serverSales)} size="sm">Valider tout</EnhancedButton>
                )}
              </div>
              <div className="space-y-2">
                {serverSales.map(sale => {
                  // ✨ MODE SWITCHING FIX: Hide validate/reject buttons for servers viewing their own pending sales
                  const isServerRole = currentSession?.role === 'serveur';
                  const showButtons = !isServerRole;
                  const isExpanded = expandedSales.has(sale.id);
                  const totalItems = sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

                  return (
                    <div key={sale.id} className="bg-amber-50 rounded-lg border border-amber-100 overflow-hidden">
                      <div className="p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3 flex-1">
                          <div>
                            <p className="text-xs text-gray-500">{new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="font-bold text-amber-600">{formatPrice(sale.total)}</p>
                          </div>
                          <button
                            onClick={() => toggleExpanded(sale.id)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-amber-600 transition-colors px-2 py-1 rounded-md hover:bg-amber-100"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>Détails ({totalItems})</span>
                          </button>
                        </div>
                        {showButtons && (
                          <div className="flex gap-2">
                            <button onClick={() => onValidate(sale.id)} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"><Check size={16} /></button>
                            <button onClick={() => onReject(sale.id)} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"><X size={16} /></button>
                          </div>
                        )}
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-amber-200 bg-amber-50/50"
                          >
                            <div className="p-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                                <ShoppingBag size={14} />
                                Articles ({sale.items.length}):
                              </p>
                              {sale.items.map((item: SaleItem, index: number) => (
                                <div key={index} className="flex items-center justify-between text-sm pl-5 border-l-2 border-amber-300">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-700">{item.quantity}x</span>
                                    <span className="text-gray-600">{item.product_name}</span>
                                    {item.product_volume && (
                                      <span className="text-gray-600 text-xs">({item.product_volume})</span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-amber-600">
                                    {formatPrice(item.total_price)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * DailyDashboard - Page tableau de bord quotidien
 * Route: /dashboard
 */
export function DailyDashboard() {
  const navigate = useNavigate();
  const { sales, products, getTodaySales, getTodayReturns, getLowStockProducts, validateSale, rejectSale, users } = useAppContext();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, setLoading, isLoading } = useFeedback();
  const { consignments, allProductsStockInfo } = useStockManagement();

  const [showDetails, setShowDetails] = useState(false);
  const [cashClosed, setCashClosed] = useState(false);
  const [todayStats, setTodayStats] = useState<DailySalesSummary | null>(null);

  const todayDateStr = useMemo(() => getCurrentBusinessDateString(), []);

  // ✨ Filter metrics for servers
  const isServerRole = currentSession?.role === 'serveur';
  const serverIdForTopProducts = isServerRole ? currentSession?.userId : undefined;

  const { data: topProductsData = [] } = useTopProducts({
    barId: currentBar?.id || '',
    startDate: todayDateStr,
    endDate: todayDateStr,
    limit: 5,
    serverId: serverIdForTopProducts, // Pass serverId for server filtering
    enabled: !!currentBar,
  });

  useEffect(() => {
    if (currentBar) {
      AnalyticsService.getDailySummary(currentBar.id, todayDateStr, todayDateStr, 'day').then(stats => {
        if (stats.length > 0) setTodayStats(stats[0]);
      });
    }
  }, [currentBar, todayDateStr]);

  const todayValidatedSales = getTodaySales();
  const todayReturns = getTodayReturns();

  const { netRevenue: todayTotal } = useRevenueStats({ startDate: todayDateStr, endDate: todayDateStr, enabled: true });

  // 🔍 DEBUG: Log raw data from getTodaySales
  console.log('[DailyDashboard] Debug filtrage:', {
    isServerRole,
    currentUserId: currentSession?.userId,
    todayDateStr,
    allSalesCount: sales.length,
    todayValidatedSalesCount: todayValidatedSales.length,
    todayValidatedSales: todayValidatedSales.map(s => ({
      id: s.id,
      total: s.total,
      status: s.status,
      business_date: s.businessDate,
      created_by: s.createdBy,
      sold_by: s.soldBy,
      server_id: s.serverId
    }))
  });

  const pendingSales = useMemo(() => {
    const isManager = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';
    // ✨ MODE SWITCHING FIX: Servers should see pending sales they created or were assigned
    // Check BOTH serverId (simplified mode) AND soldBy (full mode)
    return sales.filter(s =>
      s.status === 'pending' && (
        isManager ||
        s.soldBy === currentSession?.userId ||
        s.serverId === currentSession?.userId
      )
    );
  }, [sales, currentSession]);

  // Define activeConsignments BEFORE using it in serverFilteredConsignments
  const activeConsignments = consignments.filter(c => c.status === 'active');

  const serverFilteredSales = useMemo(() => {
    if (!isServerRole) return todayValidatedSales;
    // ✨ MODE SWITCHING FIX: A server should see ALL their sales regardless of mode
    // Check BOTH serverId (simplified mode) AND soldBy (full mode)
    const filtered = todayValidatedSales.filter(s =>
      s.serverId === currentSession?.userId || s.soldBy === currentSession?.userId
    );

    // 🔍 DEBUG: Log filtering result
    console.log('[DailyDashboard] serverFilteredSales:', {
      beforeFilterCount: todayValidatedSales.length,
      afterFilterCount: filtered.length,
      currentUserId: currentSession?.userId,
      filtered: filtered.map(s => ({
        id: s.id,
        total: s.total,
        server_id: s.serverId,
        sold_by: s.soldBy,
        matches_serverId: s.serverId === currentSession?.userId,
        matches_soldBy: s.soldBy === currentSession?.userId
      }))
    });

    return filtered;
  }, [todayValidatedSales, isServerRole, currentSession?.userId]);

  const serverFilteredReturns = useMemo(() => {
    if (!isServerRole) return todayReturns;
    // ✨ MODE SWITCHING FIX: A server should see ALL their returns regardless of mode
    // Check BOTH serverId (simplified mode) AND returnedBy (full mode)
    return todayReturns.filter(r =>
      r.serverId === currentSession?.userId || r.returnedBy === currentSession?.userId
    );
  }, [todayReturns, isServerRole, currentSession?.userId]);

  const serverFilteredConsignments = useMemo(() => {
    if (!isServerRole) return activeConsignments;
    // ✨ MODE SWITCHING FIX: A server should see ALL their consignments regardless of mode
    // Check BOTH serverId (simplified mode) AND originalSeller (full mode)
    return activeConsignments.filter(c =>
      c.serverId === currentSession?.userId || c.originalSeller === currentSession?.userId
    );
  }, [activeConsignments, isServerRole, currentSession?.userId]);

  const lowStockProducts = getLowStockProducts();
  // ✨ Calculate total items sold today (consistent with serverFilteredSales)
  const totalItems = serverFilteredSales.reduce((sum: number, sale: any) => sum + sale.items.reduce((s: number, i: any) => s + i.quantity, 0), 0);

  const topProductsList = topProductsData.map(p => ({
    name: p.product_volume ? `${p.product_name} (${p.product_volume})` : p.product_name,
    qty: p.total_quantity
  }));

  const handleValidateSale = (id: string) => currentSession && validateSale(id, currentSession.userId);
  const handleRejectSale = (id: string) => currentSession && rejectSale(id, currentSession.userId);
  const handleValidateAll = (list: Sale[]) => {
    if (currentSession && list.length && confirm(`Valider ${list.length} ventes ?`)) {
      list.forEach(s => validateSale(s.id, currentSession.userId));
    }
  };

  const exportToWhatsApp = () => {
    let msg = `*Rapport - ${new Date().toLocaleDateString('fr-FR')}*\n\n`;
    msg += `Total: *${formatPrice(todayTotal)}*\nVentes: ${todayValidatedSales.length}\nArticles: ${totalItems}\n`;
    if (topProductsList.length) {
      msg += `\n*Top produits:*\n`;
      topProductsList.slice(0, 3).forEach((p, i) => msg += `${i + 1}. ${p.name}: ${p.qty}\n`);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    showSuccess('📱 Rapport exporté');
  };

  const closeCash = async () => {
    if (!confirm('Fermer la caisse ?')) return;
    setLoading('closeCash', true);
    await new Promise(r => setTimeout(r, 1000));
    setCashClosed(true);
    showSuccess('✅ Caisse fermée');
    setLoading('closeCash', false);
    exportToWhatsApp();
  };

  if (!currentBar) return <div className="text-center py-20 text-gray-500">Sélectionnez un bar</div>;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate(-1)} className="p-2 hover:bg-white/20 rounded-lg" variant="ghost" size="icon">
              <ArrowLeft size={24} />
            </Button>
            <div className="flex items-center gap-3">
              <TrendingUp size={24} />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold">Tableau de bord</h1>
                  {currentBar?.id && currentBar.id !== '00000000-0000-0000-0000-000000000000' && (
                    <DataFreshnessIndicatorCompact
                      viewName="daily_sales_summary"
                      onRefreshComplete={async () => {
                        if (currentBar) {
                          const stats = await AnalyticsService.getDailySummary(currentBar.id, todayDateStr, todayDateStr, 'day');
                          if (stats.length > 0) setTodayStats(stats[0]);
                          showSuccess('✅ Données actualisées avec succès');
                        }
                      }}
                    />
                  )}
                </div>
                <p className="text-sm text-amber-100">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Sales */}
      {pendingSales.length > 0 && (
        <div className="mb-6">
          <PendingSalesSection sales={pendingSales} onValidate={handleValidateSale} onReject={handleRejectSale} onValidateAll={handleValidateAll} users={users} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200">
          <div className="flex items-center justify-between mb-2"><DollarSign className="w-8 h-8 text-green-600" /><span className="text-green-600 text-sm">Total</span></div>
          <AnimatedCounter value={todayTotal} className="text-2xl font-bold text-gray-800" />
          <p className="text-xs text-gray-600">{formatPrice(todayTotal)}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2"><ShoppingCart className="w-8 h-8 text-blue-600" /><span className="text-blue-600 text-sm">Ventes</span></div>
          <AnimatedCounter value={serverFilteredSales.length} className="text-2xl font-bold text-gray-800" />
          {pendingSales.length > 0 && <p className="text-xs text-amber-600">{pendingSales.length} en attente</p>}
        </div>
        <div className="bg-gradient-to-br from-purple-100 to-violet-100 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-2"><Package className="w-8 h-8 text-purple-600" /><span className="text-purple-600 text-sm">Articles</span></div>
          <AnimatedCounter value={totalItems} className="text-2xl font-bold text-gray-800" />
        </div>
        <div className="bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl p-4 border border-orange-200">
          <div className="flex items-center justify-between mb-2"><AlertTriangle className="w-8 h-8 text-orange-600" /><span className="text-orange-600 text-sm">Alertes</span></div>
          <div className="text-2xl font-bold text-gray-800">{lowStockProducts.length}</div>
          <p className="text-xs text-gray-600">sur {products.length} produits</p>
        </div>
        <div className="bg-gradient-to-br from-red-100 to-pink-100 rounded-xl p-4 border border-red-200">
          <div className="flex items-center justify-between mb-2"><RotateCcw className="w-8 h-8 text-red-600" /><span className="text-red-600 text-sm">Retours</span></div>
          <div className="text-2xl font-bold text-gray-800">{serverFilteredReturns.length}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl p-4 border border-indigo-200">
          <div className="flex items-center justify-between mb-2"><Archive className="w-8 h-8 text-indigo-600" /><span className="text-indigo-600 text-sm">Consignations</span></div>
          <div className="text-2xl font-bold text-gray-800">{serverFilteredConsignments.length}</div>
        </div>
      </div>

      {/* Details Toggle */}
      <div className="mb-6">
        <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900">
          {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
          <span className="font-medium">{showDetails ? 'Masquer' : 'Voir'} les détails</span>
        </button>
        <AnimatePresence>
          {showDetails && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-4 border border-amber-100">
                <h3 className="font-semibold text-gray-800 mb-3">🏆 Top produits</h3>
                {topProductsList.length > 0 ? topProductsList.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span>{i + 1}. {p.name}</span>
                    <span className="text-amber-600 font-medium">{p.qty}</span>
                  </div>
                )) : <p className="text-sm text-gray-500">Aucune vente</p>}
              </div>
              <div className="bg-white rounded-xl p-4 border border-red-100">
                <h3 className="font-semibold text-gray-800 mb-3">⚠️ Alertes stock</h3>
                {lowStockProducts.length > 0 ? lowStockProducts.slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between text-sm py-1">
                    <span>{p.name}</span>
                    <span className="text-red-600 font-medium">{allProductsStockInfo[p.id]?.availableStock ?? p.stock}</span>
                  </div>
                )) : <p className="text-sm text-green-600">✅ Stocks OK</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl p-4 border border-amber-100 flex gap-3 justify-center">
        <EnhancedButton onClick={exportToWhatsApp} className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl">
          <Share size={18} /> WhatsApp
        </EnhancedButton>
        {!cashClosed ? (
          <EnhancedButton onClick={closeCash} loading={isLoading('closeCash')} className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl">
            <Lock size={18} /> Fermer caisse
          </EnhancedButton>
        ) : (
          <div className="flex items-center gap-2 px-6 py-3 bg-gray-400 text-white rounded-xl">
            <Lock size={18} /> Caisse fermée
          </div>
        )}
      </div>
    </div>
  );
}
