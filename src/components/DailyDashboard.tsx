import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, ShoppingCart, Package, Share, Lock, Eye, EyeOff, RotateCcw, Archive, Check, X, User, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { AnalyticsService, DailySalesSummary, TopProduct } from '../services/supabase/analytics.service';

interface DailyDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const PendingSalesSection = ({ sales, onValidate, onReject, onValidateAll, users }: {
  sales: Sale[];
  onValidate: (saleId: string) => void;
  onReject: (saleId: string) => void;
  onValidateAll: (salesToValidate: Sale[]) => void;
  users: UserType[];
}) => {
  const { formatPrice } = useCurrencyFormatter();

  const salesByServer = useMemo(() => {
    return sales.reduce((acc, sale) => {
      const serverId = sale.createdBy;
      if (!acc[serverId]) {
        acc[serverId] = [];
      }
      acc[serverId].push(sale);
      return acc;
    }, {} as Record<string, Sale[]>);
  }, [sales]);

  const sortedServerIds = useMemo(() => {
    return Object.keys(salesByServer).sort((a, b) => {
      const userA = users.find(u => u.id === a)?.name || '';
      const userB = users.find(u => u.id === b)?.name || '';
      return userA.localeCompare(userB);
    });
  }, [salesByServer, users]);

  if (sales.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-4 border border-amber-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800 text-lg">Commandes en attente ({sales.length})</h3>
        <EnhancedButton onClick={() => onValidateAll(sales)} size="sm" variant="primary">
          Tout Valider
        </EnhancedButton>
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {sortedServerIds.map(serverId => {
          const serverSales = salesByServer[serverId];
          const server = users.find(u => u.id === serverId);
          const sortedSales = serverSales.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          return (
            <div key={serverId} className="bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-700 flex items-center gap-2"><User size={16} /> {server?.name || 'Serveur Inconnu'}</h4>
                <EnhancedButton onClick={() => onValidateAll(sortedSales)} size="sm">Valider pour {server?.name.split(' ')[0]}</EnhancedButton>
              </div>
              <div className="space-y-3">
                {sortedSales.map(sale => (
                  <div key={sale.id} className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-gray-500">{new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="font-bold text-xl text-amber-600 mt-1">{formatPrice(sale.total)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <EnhancedButton onClick={() => onValidate(sale.id)} size="sm" className="bg-green-500 hover:bg-green-600 text-white p-2"><Check size={16} /></EnhancedButton>
                        <EnhancedButton onClick={() => onReject(sale.id)} size="sm" className="bg-red-500 hover:bg-red-600 text-white p-2"><X size={16} /></EnhancedButton>
                      </div>
                    </div>
                    <ul className="mt-2 text-xs text-gray-700 space-y-1">
                      {sale.items.map((item: SaleItem, idx) => {
                        const name = item.product_name;
                        const productId = item.product_id;
                        return <li key={productId} className="flex justify-between"><span>{item.quantity}x {name}</span><span>{formatPrice(item.total_price)}</span></li>;
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};

export function DailyDashboard({ isOpen, onClose }: DailyDashboardProps) {
  const { sales, products, getTodaySales, getTodayTotal, getLowStockProducts, returns, validateSale, rejectSale, users } = useAppContext();
  const { currentBar } = useBarContext();
  const { consignments } = useStockManagement();
  const { formatPrice } = useCurrencyFormatter();
  const { currentSession } = useAuth();
  const { showSuccess, showError, setLoading, isLoading } = useFeedback();

  const [showDetails, setShowDetails] = useState(false);
  const [cashClosed, setCashClosed] = useState(false);

  // Analytics State - SQL for performance
  const [todayStats, setTodayStats] = useState<DailySalesSummary | null>(null);
  const [topProductsData, setTopProductsData] = useState<TopProduct[]>([]);

  useEffect(() => {
    if (isOpen && currentBar) {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      // Fetch SQL stats for performance
      AnalyticsService.getDailySummary(currentBar.id, start, end, 'day').then(stats => {
        if (stats.length > 0) setTodayStats(stats[0]);
        else setTodayStats(null);
      });

      // Fetch top 100 products to calculate total items accurately
      AnalyticsService.getTopProducts(currentBar.id, start, end, 100).then(products => {
        setTopProductsData(products);
      });
    }
  }, [isOpen, currentBar]);

  const todayValidatedSales = getTodaySales();
  // Use SQL stats if available, otherwise fallback to context
  const todayTotal = todayStats ? todayStats.gross_revenue : getTodayTotal();

  const pendingSales = useMemo(() => {
    const isManager = currentSession?.role === 'gerant' || currentSession?.role === 'promoteur';
    const isServer = currentSession?.role === 'serveur';

    return sales.filter(s =>
      s.status === 'pending' &&
      (isManager || (isServer && s.createdBy === currentSession.userId))
    );
  }, [sales, currentSession]);

  const lowStockProducts = getLowStockProducts();
  const totalProducts = products.length;
  const lowStockCount = lowStockProducts.length;

  // Calculate total items sold TODAY only (SQL data is already filtered by date in useEffect)
  const totalItems = todayStats
    ? todayStats.total_items_sold  // Use SQL if available
    : todayValidatedSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);

  const avgSaleValue = todayStats
    ? (todayStats.validated_count > 0 ? todayStats.gross_revenue / todayStats.validated_count : 0)
    : (todayValidatedSales.length > 0 ? todayTotal / todayValidatedSales.length : 0);

  // Top products list - ALWAYS use SQL data filtered by today's date (set in useEffect)
  // topProductsData is already filtered for today in the query
  const topProductsList = topProductsData.length > 0
    ? topProductsData.slice(0, 3).map(p => [p.product_name, p.total_quantity] as [string, number])
    : Object.entries(todayValidatedSales.flatMap(sale => sale.items).reduce((acc, item: SaleItem) => {
      const name = item.product_name;
      const volume = item.product_volume || '';
      const key = `${name}-${volume}`;
      acc[key] = (acc[key] || 0) + item.quantity;
      return acc;
    }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 🔒 SERVEURS : Ne voir que les retours de LEURS ventes (même logique que getTodayTotal)
  const todaySaleIds = useMemo(() => new Set(todayValidatedSales.map(s => s.id)), [todayValidatedSales]);
  const todayReturns = returns.filter(r =>
    new Date(r.returnedAt).toDateString() === new Date().toDateString() &&
    (currentSession?.role !== 'serveur' || todaySaleIds.has(r.saleId))
  );
  const todayReturnsCount = todayReturns.length;
  const todayReturnsRefunded = todayReturns.filter(r => r.isRefunded && (r.status === 'approved' || r.status === 'restocked')).reduce((sum, r) => sum + r.refundAmount, 0);

  const activeConsignments = useMemo(() => {
    const allActive = consignments.filter(c => c.status === 'active');
    if (currentSession?.role === 'serveur') {
      // 🔒 SERVEURS : Voir consignations de LEURS ventes (via originalSeller)
      return allActive.filter(c => c.originalSeller === currentSession.userId);
    }
    return allActive;
  }, [consignments, currentSession]);
  const activeConsignmentsCount = activeConsignments.length;
  const activeConsignmentsValue = activeConsignments.reduce((sum, c) => sum + c.totalAmount, 0);
  const todayReturnsPending = todayReturns.filter(r => r.status === 'pending').length;

  const handleValidateSale = (saleId: string) => { if (!currentSession) return; validateSale(saleId, currentSession.userId); };
  const handleRejectSale = (saleId: string) => { if (!currentSession) return; rejectSale(saleId, currentSession.userId); };
  const handleValidateAll = (salesToValidate: Sale[]) => {
    if (!currentSession || salesToValidate.length === 0) return;
    if (confirm(`Valider les ${salesToValidate.length} ventes sélectionnées ?`)) {
      salesToValidate.forEach(sale => { validateSale(sale.id, currentSession.userId); });
    }
  };

  const exportToWhatsApp = () => {
    const date = new Date().toLocaleDateString('fr-FR');
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Construction du message sans emojis pour WhatsApp
    let message = `*Rapport de caisse - ${date}*\n`;
    message += `Heure: ${time}\n`;
    message += `${currentSession?.role}: ${currentSession?.userName}\n\n`;

    message += `*RESUME FINANCIER*\n`;
    message += `- Total des ventes: *${formatPrice(todayTotal)}*\n`;
    message += `- Nombre de ventes: ${todayValidatedSales.length}\n`;
    message += `- Articles vendus: ${totalItems}\n`;
    message += `- Panier moyen: ${formatPrice(avgSaleValue)}\n\n`;

    if (topProductsList.length > 0) {
      message += `*TOP PRODUITS*\n`;
      topProductsList.forEach(([product, qty], index) => {
        message += `${index + 1}. ${product}: ${qty} vendus\n`;
      });
      message += `\n`;
    }

    if (lowStockProducts.length > 0) {
      message += `*ALERTES STOCK*\n`;
      lowStockProducts.slice(0, 5).forEach(product => {
        message += `- ${product.name} (${product.volume}): ${product.stock} restants\n`;
      });
      message += `\n`;
    }

    message += `Envoye depuis BarTender Pro`;

    // Encodage correct pour WhatsApp (sans encodeURIComponent pour les emojis)
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    showSuccess('📱 Rapport exporté vers WhatsApp');
  };

  const closeCash = async () => {
    if (!confirm('Confirmer la fermeture de caisse ? Cette action est définitive.')) return;
    setLoading('closeCash', true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setCashClosed(true);
      showSuccess('✅ Caisse fermée avec succès');
      setTimeout(() => { exportToWhatsApp(); }, 1000);
    } catch {
      showError('❌ Erreur lors de la fermeture');
    } finally { setLoading('closeCash', false); }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white p-6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <TrendingUp size={24} />
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Informations du jour</h2>
                    <DataFreshnessIndicatorCompact
                      viewName="daily_sales_summary"
                      onRefreshComplete={async () => {
                        if (currentBar) {
                          const today = new Date();
                          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                          const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
                          const stats = await AnalyticsService.getDailySummary(currentBar.id, start, end, 'day');
                          if (stats.length > 0) setTodayStats(stats[0]);
                          showSuccess('✅ Données actualisées avec succès');
                        }
                      }}
                    />
                  </div>
                  <p className="text-sm text-amber-100">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gradient-to-br from-amber-50 to-amber-50">

              <div className="p-6 space-y-6">
                {pendingSales.length > 0 && <PendingSalesSection sales={pendingSales} onValidate={handleValidateSale} onReject={handleRejectSale} onValidateAll={handleValidateAll} users={users} />}

                <div>
                  <h3 className="font-semibold text-gray-800 text-lg mb-4">Point du jour</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-3 sm:p-4 border border-green-200"><div className="flex items-center justify-between mb-2"><DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" /><span className="text-green-600 text-xs sm:text-sm font-medium">Total</span></div><AnimatedCounter value={todayTotal} className="text-xl sm:text-2xl font-bold text-gray-800" /><p className="text-xs text-gray-600 mt-1">{formatPrice(todayTotal)}</p></motion.div>
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl p-3 sm:p-4 border border-blue-200"><div className="flex items-center justify-between mb-2"><ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" /><span className="text-blue-600 text-xs sm:text-sm font-medium">Ventes</span></div><AnimatedCounter value={todayValidatedSales.length} className="text-xl sm:text-2xl font-bold text-gray-800" /><p className="text-xs text-amber-600 mt-1 font-semibold">{pendingSales.length > 0 ? `${pendingSales.length} en attente` : ''}</p></motion.div>
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-purple-100 to-violet-100 rounded-xl p-3 sm:p-4 border border-purple-200"><div className="flex items-center justify-between mb-2"><Package className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" /><span className="text-purple-600 text-xs sm:text-sm font-medium">Articles</span></div><AnimatedCounter value={totalItems} className="text-xl sm:text-2xl font-bold text-gray-800" /><p className="text-xs text-gray-600 mt-1">vendus aujourd'hui</p></motion.div>
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl p-3 sm:p-4 border border-orange-200"><div className="flex items-center justify-between mb-2"><AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-orange-600" /><span className="text-orange-600 text-xs sm:text-sm font-medium">Alertes</span></div><div className="text-xl sm:text-2xl font-bold text-gray-800">{lowStockCount}</div><p className="text-xs text-gray-600 mt-1">sur {totalProducts} produits</p></motion.div>
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-red-100 to-pink-100 rounded-xl p-3 sm:p-4 border border-red-200"><div className="flex items-center justify-between mb-2"><RotateCcw className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" /><span className="text-red-600 text-xs sm:text-sm font-medium">Retours</span></div><AnimatedCounter value={todayReturnsCount} className="text-xl sm:text-2xl font-bold text-gray-800" /><div className="flex items-center justify-between mt-1"><p className="text-xs text-gray-600">{todayReturnsPending > 0 && `${todayReturnsPending} en attente`}</p>{todayReturnsRefunded > 0 && <p className="text-xs text-red-600 font-medium">-{formatPrice(todayReturnsRefunded).replace(/\s/g, '')}</p>}</div></motion.div>
                    <motion.div whileHover={{ y: -2 }} className="bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl p-3 sm:p-4 border border-indigo-200"><div className="flex items-center justify-between mb-2"><Archive className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" /><span className="text-indigo-600 text-xs sm:text-sm font-medium">Consignations</span></div><AnimatedCounter value={activeConsignmentsCount} className="text-xl sm:text-2xl font-bold text-gray-800" /><div className="flex items-center justify-between mt-1"><p className="text-xs text-gray-600">{activeConsignmentsCount > 0 ? `actives` : `aucune`}</p>{activeConsignmentsValue > 0 && <p className="text-xs text-indigo-600 font-medium">{formatPrice(activeConsignmentsValue).replace(/\s/g, '')}</p>}</div></motion.div>
                  </div>
                </div>

                <div className="px-6 mb-6">
                  <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
                    {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
                    <span className="font-medium">{showDetails ? 'Masquer' : 'Voir'} les détails</span>
                  </button>
                  <AnimatePresence>{showDetails && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="bg-white rounded-xl p-4 border border-amber-100"><h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">🏆 Top produits</h3><div className="space-y-2">{topProductsList.map(([product, qty], index) => <div key={product} className="flex items-center justify-between"><span className="text-sm text-gray-700">{index + 1}. {product}</span><span className="text-sm font-medium text-amber-600">{qty} vendus</span></div>)}{topProductsList.length === 0 && <p className="text-sm text-gray-500">Aucune vente aujourd'hui</p>}</div></div><div className="bg-white rounded-xl p-4 border border-red-100"><h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">⚠️ Alertes stock</h3><div className="space-y-2">{lowStockProducts.slice(0, 5).map(product => <div key={product.id} className="flex items-center justify-between"><span className="text-sm text-gray-700">{product.name} ({product.volume})</span><span className="text-sm font-medium text-red-600">{product.stock} restants</span></div>)}{lowStockProducts.length === 0 && <p className="text-sm text-green-600">✅ Tous les stocks sont OK</p>}</div></div></motion.div>}</AnimatePresence>
                </div>

                <div className="p-4 sm:p-6 border-t border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50 sticky bottom-0">
                  <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
                    <EnhancedButton onClick={exportToWhatsApp} className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 shadow-lg text-sm sm:text-base"><Share size={16} className="sm:w-[18px] sm:h-[18px]" />Exporter WhatsApp</EnhancedButton>
                    {!cashClosed ? <EnhancedButton onClick={closeCash} loading={isLoading('closeCash')} className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 shadow-lg text-sm sm:text-base"><Lock size={16} className="sm:w-[18px] sm:h-[18px]" />Fermer la caisse</EnhancedButton> : <div className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-xl font-medium opacity-75 text-sm sm:text-base"><Lock size={16} className="sm:w-[18px] sm:h-[18px]" />Caisse fermée</div>}
                    <button onClick={onClose} className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 text-sm sm:text-base">Fermer</button>
                  </div>
                  {cashClosed && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-green-100 border border-green-200 rounded-lg p-3 text-center"><p className="text-green-700 font-medium">✅ Caisse fermée - Rapport automatiquement exporté</p></motion.div>}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
