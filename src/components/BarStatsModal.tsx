import React, { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Package,
  AlertTriangle,
  Award,
  Calendar,
} from 'lucide-react';
import { Bar, Sale, Return } from '../types';
import { getBusinessDate, getCurrentBusinessDay, isSameDay, dateToYYYYMMDD, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useFeedback } from '../hooks/useFeedback';
import { AnalyticsService } from '../services/supabase/analytics.service';
import { DataFreshnessIndicatorCompact } from './DataFreshnessIndicator';

interface BarStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bar: Bar;
}

export function BarStatsModal({ isOpen, onClose, bar }: BarStatsModalProps) {
  const { sales: allSales, returns: allReturns } = useAppContext();
  const { barMembers } = useBarContext();
  const { showSuccess } = useFeedback();

  // SQL Analytics State
  const [multiPeriodStats, setMultiPeriodStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Load multi-period stats from SQL view
  useEffect(() => {
    if (!isOpen || !bar?.id) return;

    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const stats = await AnalyticsService.getBarStatsMultiPeriod(bar.id);
        setMultiPeriodStats(stats);
      } catch (error) {
        console.error('Error loading bar stats:', error);
        setMultiPeriodStats(null);
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [isOpen, bar?.id]);

  const stats = useMemo(() => {
    try {
      // Use SQL stats if available, otherwise fallback to client-side calculation
      if (multiPeriodStats) {
        // This part is mostly correct, using pre-aggregated SQL data
        const caChangeVsYesterday = multiPeriodStats.revenue_yesterday > 0 ? ((multiPeriodStats.revenue_today - multiPeriodStats.revenue_yesterday) / multiPeriodStats.revenue_yesterday * 100) : (multiPeriodStats.revenue_today > 0 ? 100 : 0);
        const avgCALast7Days = multiPeriodStats.revenue_7d / 7;
        const caChangeVsLast7Days = avgCALast7Days > 0 ? ((multiPeriodStats.revenue_today - avgCALast7Days) / avgCALast7Days * 100) : (multiPeriodStats.revenue_today > 0 ? 100 : 0);
        const salesChangeVsYesterday = multiPeriodStats.sales_yesterday > 0 ? ((multiPeriodStats.sales_today - multiPeriodStats.sales_yesterday) / multiPeriodStats.sales_yesterday * 100) : (multiPeriodStats.sales_today > 0 ? 100 : 0);
        const avgSalesLast7Days = multiPeriodStats.sales_7d / 7;
        const salesChangeVsLast7Days = avgSalesLast7Days > 0 ? ((multiPeriodStats.sales_today - avgSalesLast7Days) / avgSalesLast7Days * 100) : (multiPeriodStats.sales_today > 0 ? 100 : 0);
        const teamMembers = barMembers.filter(m => m.barId === bar.id);
        const gerants = teamMembers.filter(m => m.role === 'gerant').length;
        const serveurs = teamMembers.filter(m => m.role === 'serveur').length;

        return {
          caToday: multiPeriodStats.revenue_today, caYesterday: multiPeriodStats.revenue_yesterday, caLast7Days: multiPeriodStats.revenue_7d, caLast30Days: multiPeriodStats.revenue_30d,
          caChangeVsYesterday, caChangeVsLast7Days, avgCALast7Days,
          salesToday: multiPeriodStats.sales_today, salesYesterday: multiPeriodStats.sales_yesterday, salesLast7Days: multiPeriodStats.sales_7d, salesLast30Days: multiPeriodStats.sales_30d,
          salesChangeVsYesterday, salesChangeVsLast7Days, avgSalesLast7Days,
          topProducts: [], teamMembers: teamMembers.length, gerants, serveurs, lowStockItems: 0,
        };
      }

      // Fallback: client-side calculation using AppContext data
      const closeHour = bar.closingHour ?? 6;
      
      const todayStr = getCurrentBusinessDateString(closeHour);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = dateToYYYYMMDD(yesterday);
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = dateToYYYYMMDD(sevenDaysAgo);
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = dateToYYYYMMDD(thirtyDaysAgo);

      const salesForBar = allSales.filter(s => s.barId === bar.id && s.status === 'validated');
      const returnsForBar = allReturns.filter(r => r.barId === bar.id && r.isRefunded);

      const salesToday = filterByBusinessDateRange(salesForBar, todayStr, todayStr);
      const salesYesterday = filterByBusinessDateRange(salesForBar, yesterdayStr, yesterdayStr);
      const salesLast7Days = filterByBusinessDateRange(salesForBar, sevenDaysAgoStr, todayStr);
      const salesLast30Days = filterByBusinessDateRange(salesForBar, thirtyDaysAgoStr, todayStr);
      
      const returnsToday = filterByBusinessDateRange(returnsForBar, todayStr, todayStr);
      const returnsYesterday = filterByBusinessDateRange(returnsForBar, yesterdayStr, yesterdayStr);
      const returnsLast7Days = filterByBusinessDateRange(returnsForBar, sevenDaysAgoStr, todayStr);
      const returnsLast30Days = filterByBusinessDateRange(returnsForBar, thirtyDaysAgoStr, todayStr);

      const getNetRevenue = (sales: Sale[], returns: Return[]): number => {
        const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
        const returnsTotal = returns.reduce((sum, ret) => sum + ret.refundAmount, 0);
        return salesTotal - returnsTotal;
      };

      const caToday = getNetRevenue(salesToday, returnsToday);
      const caYesterday = getNetRevenue(salesYesterday, returnsYesterday);
      const caLast7Days = getNetRevenue(salesLast7Days, returnsLast7Days);
      const caLast30Days = getNetRevenue(salesLast30Days, returnsLast30Days);

      const caChangeVsYesterday = caYesterday > 0 ? ((caToday - caYesterday) / caYesterday * 100) : (caToday > 0 ? 100 : 0);
      const avgCALast7Days = caLast7Days / 7;
      const caChangeVsLast7Days = avgCALast7Days > 0 ? ((caToday - avgCALast7Days) / avgCALast7Days * 100) : (caToday > 0 ? 100 : 0);
      const salesChangeVsYesterday = salesYesterday.length > 0 ? ((salesToday.length - salesYesterday.length) / salesYesterday.length * 100) : (salesToday.length > 0 ? 100 : 0);
      const avgSalesLast7Days = salesLast7Days.length / 7;
      const salesChangeVsLast7Days = avgSalesLast7Days > 0 ? ((salesToday.length - avgSalesLast7Days) / avgSalesLast7Days * 100) : (salesToday.length > 0 ? 100 : 0);

      const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
      salesToday.forEach(sale => {
        sale.items.forEach(item => {
          const key = item.product_id;
          const existing = productSales.get(key);
          if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += item.total_price;
          } else {
            productSales.set(key, { name: item.product_name, quantity: item.quantity, revenue: item.total_price });
          }
        });
      });
      const topProducts = Array.from(productSales.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      const teamMembers = barMembers.filter(m => m.barId === bar.id);
      const gerants = teamMembers.filter(m => m.role === 'gerant').length;
      const serveurs = teamMembers.filter(m => m.role === 'serveur').length;

      return {
        caToday, caYesterday, caLast7Days, caLast30Days,
        caChangeVsYesterday, caChangeVsLast7Days, avgCALast7Days,
        salesToday: salesToday.length, salesYesterday: salesYesterday.length, salesLast7Days: salesLast7Days.length, salesLast30Days: salesLast30Days.length,
        salesChangeVsYesterday, salesChangeVsLast7Days, avgSalesLast7Days,
        topProducts, teamMembers: teamMembers.length, gerants, serveurs, lowStockItems: 0, // Simplified
      };
    } catch (error) {
      console.error('Error calculating bar stats:', error);
      return null;
    }
  }, [bar, barMembers, multiPeriodStats, allSales, allReturns]);

  if (!isOpen || !stats) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 md:p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 md:w-8 md:h-8" />
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl md:text-2xl font-bold">Statistiques Détaillées</h2>
                  <DataFreshnessIndicatorCompact
                    viewName="bar_stats_multi_period"
                    onRefreshComplete={async () => {
                      if (bar?.id) {
                        try {
                          const stats = await AnalyticsService.getBarStatsMultiPeriod(bar.id);
                          setMultiPeriodStats(stats);
                          showSuccess('✅ Données actualisées avec succès');
                        } catch (error) {
                          console.error('Error refreshing bar stats:', error);
                        }
                      }
                    }}
                  />
                </div>
                <p className="text-purple-100 text-sm md:text-base">{bar.name}</p>
                <p className="text-purple-200 text-xs mt-0.5">
                  {bar.isActive ? '✅ Actif' : '❌ Suspendu'} • {bar.location}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Performance Financière */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-gray-900">Performance Financière</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CA Card */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 md:p-5 shadow-sm border border-green-200">
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-7 h-7 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-600 text-sm mb-1">CA Aujourd'hui</p>
                      <p className="text-2xl md:text-3xl font-bold text-green-600">
                        {stats.caToday.toLocaleString('fr-FR')} <span className="text-lg">FCFA</span>
                      </p>

                      {/* Trends */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          {Math.abs(stats.caChangeVsYesterday) < 1 ? (
                            <Minus className="w-4 h-4 text-gray-500" />
                          ) : stats.caChangeVsYesterday > 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`text-xs font-medium ${Math.abs(stats.caChangeVsYesterday) < 1
                            ? 'text-gray-600'
                            : stats.caChangeVsYesterday > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                            }`}>
                            {stats.caChangeVsYesterday > 0 ? '+' : ''}{stats.caChangeVsYesterday.toFixed(1)}% vs hier
                          </span>
                          <span className="text-xs text-gray-500">
                            ({stats.caYesterday.toLocaleString('fr-FR')} FCFA)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {Math.abs(stats.caChangeVsLast7Days) < 1 ? (
                            <Minus className="w-4 h-4 text-gray-500" />
                          ) : stats.caChangeVsLast7Days > 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`text-xs font-medium ${Math.abs(stats.caChangeVsLast7Days) < 1
                            ? 'text-gray-600'
                            : stats.caChangeVsLast7Days > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                            }`}>
                            {stats.caChangeVsLast7Days > 0 ? '+' : ''}{stats.caChangeVsLast7Days.toFixed(1)}% vs moy. 7j
                          </span>
                          <span className="text-xs text-gray-500">
                            ({stats.avgCALast7Days.toFixed(0)} FCFA/j)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sales Count Card */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 md:p-5 shadow-sm border border-amber-200">
                  <div className="flex items-start gap-3">
                    <ShoppingCart className="w-7 h-7 text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-600 text-sm mb-1">Ventes Aujourd'hui</p>
                      <p className="text-2xl md:text-3xl font-bold text-amber-600">{stats.salesToday}</p>
                      <p className="text-xs text-gray-500 mt-1">Transactions effectuées</p>

                      {/* Trends */}
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          {Math.abs(stats.salesChangeVsYesterday) < 1 ? (
                            <Minus className="w-4 h-4 text-gray-500" />
                          ) : stats.salesChangeVsYesterday > 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`text-xs font-medium ${Math.abs(stats.salesChangeVsYesterday) < 1
                            ? 'text-gray-600'
                            : stats.salesChangeVsYesterday > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                            }`}>
                            {stats.salesChangeVsYesterday > 0 ? '+' : ''}{stats.salesChangeVsYesterday.toFixed(1)}% vs hier
                          </span>
                          <span className="text-xs text-gray-500">
                            ({stats.salesYesterday} ventes)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {Math.abs(stats.salesChangeVsLast7Days) < 1 ? (
                            <Minus className="w-4 h-4 text-gray-500" />
                          ) : stats.salesChangeVsLast7Days > 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`text-xs font-medium ${Math.abs(stats.salesChangeVsLast7Days) < 1
                            ? 'text-gray-600'
                            : stats.salesChangeVsLast7Days > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                            }`}>
                            {stats.salesChangeVsLast7Days > 0 ? '+' : ''}{stats.salesChangeVsLast7Days.toFixed(1)}% vs moy. 7j
                          </span>
                          <span className="text-xs text-gray-500">
                            ({stats.avgSalesLast7Days.toFixed(1)} ventes/j)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Summary */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">CA 7 jours</p>
                  <p className="text-lg font-bold text-gray-900">
                    {stats.caLast7Days.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">CA 30 jours</p>
                  <p className="text-lg font-bold text-gray-900">
                    {stats.caLast30Days.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Ventes 7j</p>
                  <p className="text-lg font-bold text-gray-900">{stats.salesLast7Days}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Ventes 30j</p>
                  <p className="text-lg font-bold text-gray-900">{stats.salesLast30Days}</p>
                </div>
              </div>
            </section>

            {/* Top Products */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-gray-900">Top 5 Produits (Aujourd'hui)</h3>
              </div>

              {stats.topProducts.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                  Aucune vente aujourd'hui
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.topProducts.map((product, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg ${index < 3
                        ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200'
                        : 'bg-white border border-gray-200'
                        }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${index === 0
                            ? 'bg-yellow-400 text-yellow-900'
                            : index === 1
                              ? 'bg-gray-300 text-gray-700'
                              : index === 2
                                ? 'bg-amber-300 text-amber-900'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.quantity} unités vendues</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          {product.revenue.toLocaleString('fr-FR')} FCFA
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Team & Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Team Info */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900">Équipe</h3>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Total membres</span>
                      <span className="text-xl font-bold text-blue-600">{stats.teamMembers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Gérants</span>
                      <span className="text-lg font-semibold text-gray-900">{stats.gerants}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Serveurs</span>
                      <span className="text-lg font-semibold text-gray-900">{stats.serveurs}</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Stock Alerts */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900">Alertes Stock</h3>
                </div>
                <div className={`rounded-xl p-4 border ${stats.lowStockItems > 0
                  ? 'bg-gradient-to-br from-red-50 to-amber-50 border-red-200'
                  : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
                  }`}>
                  {stats.lowStockItems > 0 ? (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-900 text-lg">{stats.lowStockItems}</p>
                        <p className="text-sm text-red-700">
                          Produit{stats.lowStockItems > 1 ? 's' : ''} en rupture de stock (&lt;20% du niveau optimal)
                        </p>
                        <p className="text-xs text-red-600 mt-2">
                          Consultez l'inventaire pour réapprovisionner
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <Package className="w-6 h-6 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-green-900">Stock OK</p>
                        <p className="text-sm text-green-700">Aucune alerte de stock</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Bar Settings Summary */}
            <section className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-gray-600" />
                <h3 className="text-sm font-bold text-gray-700">Configuration</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Heure de fermeture</p>
                  <p className="font-semibold text-gray-900">{bar.closingHour ?? 6}h</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">TVA</p>
                  <p className="font-semibold text-gray-900">{bar.settings?.taxRate ?? 0}%</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Marge cible</p>
                  <p className="font-semibold text-gray-900">{bar.settings?.targetMargin ?? 0}%</p>
                </div>
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
