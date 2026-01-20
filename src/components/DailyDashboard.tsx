import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, DollarSign, ShoppingCart, Package, Share, Lock, Check, X, User, AlertTriangle, RotateCcw, Archive, ShoppingBag, ChevronDown, ChevronUp
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
import { useTeamPerformance } from '../hooks/useTeamPerformance';
import { TeamPerformanceTable } from './analytics/TeamPerformanceTable';

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
      // Source of truth: soldBy is the business attribution
      const serverId = sale.soldBy;
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

import { DashboardViewMode } from '../pages/DashboardPage';

interface DailyDashboardProps {
  activeView?: DashboardViewMode;
}

/**
 * DailyDashboard - Page tableau de bord quotidien
 */
export function DailyDashboard({ activeView = 'summary' }: DailyDashboardProps) {
  const navigate = useNavigate();
  const { sales, getTodaySales, getTodayReturns, getLowStockProducts, validateSale, rejectSale, users } = useAppContext();
  const { currentBar } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, setLoading, isLoading } = useFeedback();
  const { consignments, allProductsStockInfo } = useStockManagement();

  const [cashClosed, setCashClosed] = useState(false);
  const [todayStats, setTodayStats] = useState<DailySalesSummary | null>(null);
  const [userFilter, setUserFilter] = useState<'all' | 'servers' | 'management'>('all');

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


  const pendingSales = useMemo(() => {
    const isManager = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';
    // ✨ MODE SWITCHING FIX: Servers should see pending sales they created or were assigned
    // Check BOTH serverId (simplified mode) AND soldBy (full mode)
    // 🔒 EXPIRATION FALLBACK: Only show pending sales from current business day
    return sales.filter(s => {
      // Convert businessDate (Date object) to YYYY-MM-DD string for comparison
      const saleDateStr = s.businessDate instanceof Date
        ? s.businessDate.toISOString().split('T')[0]
        : String(s.businessDate).split('T')[0];

      return (
        s.status === 'pending' &&
        saleDateStr === todayDateStr && // Filter expired sales (frontend fallback)
        (
          isManager ||
          s.soldBy === currentSession?.userId ||
          s.serverId === currentSession?.userId
        )
      );
    });
  }, [sales, currentSession, todayDateStr]);

  // Define activeConsignments BEFORE using it in serverFilteredConsignments
  const activeConsignments = consignments.filter(c => c.status === 'active');

  const serverFilteredSales = useMemo(() => {
    if (!isServerRole) return todayValidatedSales;
    // Source of truth: soldBy is the business attribution
    const filtered = todayValidatedSales.filter(s =>
      s.soldBy === currentSession?.userId
    );


    return filtered;
  }, [todayValidatedSales, isServerRole, currentSession?.userId]);

  const teamPerformanceData = useTeamPerformance({
    sales: isServerRole ? serverFilteredSales : todayValidatedSales,
    returns: todayReturns,
    users: users,
    barMembers: [],
    startDate: undefined,
    endDate: undefined
  });

  const serverFilteredReturns = useMemo(() => {
    if (!isServerRole) return todayReturns;
    // Source of truth: returnedBy is who created the return, serverId is the server
    return todayReturns.filter(r =>
      r.returnedBy === currentSession?.userId || r.serverId === currentSession?.userId
    );
  }, [todayReturns, isServerRole, currentSession?.userId]);

  const serverFilteredConsignments = useMemo(() => {
    if (!isServerRole) return activeConsignments;
    // ✨ MODE SWITCHING FIX: Filter by server using mode-agnostic detection
    // A server should see consignments on their sales (serverId) or that they created (originalSeller)
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
    const barName = currentBar?.name || 'Mon Bar';
    const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Helper function to replace accented characters with their ASCII equivalents
    const replaceAccents = (str: string) => {
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/œ/g, "oe")
        .replace(/Œ/g, "OE")
        .replace(/æ/g, "ae")
        .replace(/Æ/g, "AE");
    };

    let msg = `*RAPPORT JOURNALIER - ${barName.toUpperCase()}*\n`;
    msg += `_${dateStr}_\n\n`;

    msg += `---------------------------\n`;
    msg += `*RESUME FINANCIER*\n`;
    msg += `- Total (Net) : *${formatPrice(todayTotal)}*\n`;
    msg += `- Commandes : ${serverFilteredSales.length}\n`;
    msg += `- Articles vendus : ${totalItems}\n\n`;

    msg += `*OPERATIONS*\n`;
    msg += `- Retours traites : ${serverFilteredReturns.length}\n`;
    msg += `- Consignations actives : ${serverFilteredConsignments.length}\n`;

    if (topProductsList.length) {
      msg += `\n*TOP PRODUITS*\n`;
      topProductsList.slice(0, 3).forEach((p, i) => {
        msg += `${i + 1}. ${p.name} : *${p.qty}*\n`;
      });
    }

    msg += `---------------------------\n`;
    msg += `_Genere via BarTender_`;

    const asciiMsg = replaceAccents(msg); // Apply the conversion
    window.open(`https://wa.me/?text=${encodeURIComponent(asciiMsg)}`, '_blank');
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
    <AnimatePresence mode="wait">
      {/* ONGLET SYNTHÈSE */}
      {activeView === 'summary' && (
        <motion.div
          key="summary"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6"
        >
          {/* Stats Grid avec design amélioré */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Indicateurs clés</h2>
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" data-guide="revenue-stats">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                  <DollarSign size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Revenus</span>
              </div>
              <AnimatedCounter value={todayTotal} className="text-xl font-black text-gray-900" />
              <p className="text-[10px] text-gray-500 font-medium truncate mt-1">{formatPrice(todayTotal)} net</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <ShoppingCart size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Ventes</span>
              </div>
              <AnimatedCounter value={serverFilteredSales.length} className="text-xl font-black text-gray-900" />
              <p className="text-[10px] text-gray-500 font-medium mt-1">{pendingSales.length} en attente</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <Package size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Articles</span>
              </div>
              <AnimatedCounter value={totalItems} className="text-xl font-black text-gray-900" />
              <p className="text-[10px] text-gray-500 font-medium mt-1">Total vendus</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-50 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                  <AlertTriangle size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Alertes</span>
              </div>
              <div className="text-xl font-black text-red-600">{lowStockProducts.length}</div>
              <p className="text-[10px] text-gray-500 font-medium mt-1">Stock critique</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                  <RotateCcw size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Retours</span>
              </div>
              <div className="text-xl font-black text-gray-900">{serverFilteredReturns.length}</div>
              <p className="text-[10px] text-gray-500 font-medium mt-1">Traités ce jour</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Archive size={20} />
                </div>
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Consign.</span>
              </div>
              <div className="text-xl font-black text-gray-900">{serverFilteredConsignments.length}</div>
              <p className="text-[10px] text-gray-500 font-medium mt-1">Fiches actives</p>
            </div>
          </div>

          {/* Insights Intégrés - Design Premium */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                  <TrendingUp size={20} />
                </div>
                <h3 className="font-bold text-gray-900">Top produits vendus</h3>
              </div>
              {topProductsList.length > 0 ? (
                <div className="space-y-3">
                  {topProductsList.map((p, i) => (
                    <div key={i} className="flex justify-between items-center group">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-700 group-hover:text-amber-600 transition-colors">{p.name}</span>
                      </div>
                      <span className="text-sm font-black text-gray-900">
                        {p.qty} <span className="text-[10px] text-gray-400 font-medium">unités</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-400">Aucune vente enregistrée pour le moment</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-50">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="font-bold text-gray-900">Points de vigilance stock</h3>
              </div>
              {lowStockProducts.length > 0 ? (
                <div className="space-y-3">
                  {lowStockProducts.slice(0, 5).map(p => (
                    <div key={p.id} className="flex justify-between items-center group">
                      <span className="text-sm text-gray-700 group-hover:text-red-600 transition-colors">{p.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Restant :</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-black">
                          {allProductsStockInfo[p.id]?.availableStock ?? p.stock}
                        </span>
                      </div>
                    </div>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <button
                      onClick={() => navigate('/inventory')}
                      className="w-full mt-2 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                    >
                      Voir les {lowStockProducts.length - 5} autres alertes...
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center bg-green-50 rounded-xl border border-dashed border-green-200">
                  <p className="text-sm text-green-600 font-medium">✅ Tous vos stocks sont au-dessus des seuils</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions rapides */}
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-6 text-white shadow-lg shadow-amber-200 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="text-lg font-bold mb-1">Actions de fin de journée</h4>
              <p className="text-amber-100 text-sm">Partagez le rapport ou clôturez votre caisse en un clic.</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <EnhancedButton
                onClick={exportToWhatsApp}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-emerald-600 rounded-2xl font-bold shadow-sm hover:bg-emerald-50 active:scale-95 transition-all"
              >
                <Share size={18} /> WhatsApp
              </EnhancedButton>
              {!isServerRole && (
                !cashClosed ? (
                  <EnhancedButton
                    onClick={closeCash}
                    loading={isLoading('closeCash')}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-2xl font-bold shadow-md hover:bg-red-600 active:scale-95 transition-all"
                  >
                    <Lock size={18} /> Fermer caisse
                  </EnhancedButton>
                ) : (
                  <div className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/20 text-white rounded-2xl font-bold backdrop-blur-sm">
                    <Lock size={18} /> Caisse fermée
                  </div>
                )
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ONGLET COMMANDES */}
      {activeView === 'orders' && (
        <motion.div
          key="orders"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6"
        >
          {pendingSales.length > 0 ? (
            <div data-guide="pending-sales">
              <PendingSalesSection
                sales={pendingSales}
                onValidate={handleValidateSale}
                onReject={handleRejectSale}
                onValidateAll={handleValidateAll}
                users={users}
              />
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-gray-100">
              <div className="w-16 h-16 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Tout est à jour !</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                Aucune vente en attente de validation pour le moment. Toutes les commandes ont été traitées.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ONGLET PERFORMANCE */}
      {activeView === 'performance' && (
        <motion.div
          key="performance"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-100" data-guide="team-performance">
            <TeamPerformanceTable
              data={teamPerformanceData}
              totalRevenue={isServerRole ? (todayStats?.net_revenue || 0) : todayTotal}
              filter={userFilter}
              onFilterChange={setUserFilter}
              title={isServerRole ? "Ma Performance (Journée)" : "Performance Équipe (Journée)"}
              subtitle="Net (Ventes - Remboursés)"
              compact={false}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
