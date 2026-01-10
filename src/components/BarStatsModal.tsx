import React, { useEffect, useState, useMemo } from 'react';
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
  Loader,
} from 'lucide-react';
import { Bar } from '../types';
import { useFeedback } from '../hooks/useFeedback';
import { supabase } from '../lib/supabase';

interface BarStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bar: Bar;
}

// Define a type for our combined stats for clarity
type CombinedStats = {
  // Financial
  revenue_today: number;
  revenue_yesterday: number;
  revenue_7d: number;
  revenue_30d: number;
  sales_today: number;
  sales_yesterday: number;
  sales_7d: number;
  sales_30d: number;
  // Ancillary
  total_members: number;
  top_products_json: { product_id: string; name: string; rank: number; revenue: number }[];
  // Live
  stock_alerts_count: number;
};

export default function BarStatsModal({ isOpen, onClose, bar }: BarStatsModalProps) {
  const { showSuccess, showError } = useFeedback();

  const [combinedStats, setCombinedStats] = useState<CombinedStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !bar?.id) return;

    const loadAllStats = async () => {
      setIsLoading(true);
      try {
        const [financialStats, ancillaryStats, liveAlerts] = await Promise.all([
          supabase.from('bar_stats_multi_period').select('*').eq('bar_id', bar.id).single(),
          supabase.from('bar_ancillary_stats_mat').select('*').eq('bar_id', bar.id).single(),
          supabase.rpc('get_bar_live_alerts', { p_bar_id: bar.id }),
        ]);

        if (financialStats.error) throw financialStats.error;
        if (ancillaryStats.error) throw ancillaryStats.error;
        if (liveAlerts.error) throw liveAlerts.error;

        setCombinedStats({
          ...(financialStats.data as any),
          total_members: ancillaryStats.data?.total_members ?? 0,
          top_products_json: ancillaryStats.data?.top_products_json ?? [],
          stock_alerts_count: liveAlerts.data ?? 0,
        });

      } catch (error: any) {
        console.error('Error loading combined bar stats:', error);
        showError('Erreur lors du chargement des statistiques.');
        setCombinedStats(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllStats();
  }, [isOpen, bar?.id]);

  const stats = useMemo(() => {
    if (!combinedStats) return null;

    const { revenue_today, revenue_yesterday, revenue_7d, sales_today, sales_yesterday, sales_7d } = combinedStats;

    const caChangeVsYesterday = revenue_yesterday > 0 ? ((revenue_today - revenue_yesterday) / revenue_yesterday * 100) : (revenue_today > 0 ? 100 : 0);
    const avgCALast7Days = revenue_7d / 7;
    const caChangeVsLast7Days = avgCALast7Days > 0 ? ((revenue_today - avgCALast7Days) / avgCALast7Days * 100) : (revenue_today > 0 ? 100 : 0);
    const salesChangeVsYesterday = sales_yesterday > 0 ? ((sales_today - sales_yesterday) / sales_yesterday * 100) : (sales_today > 0 ? 100 : 0);
    const avgSalesLast7Days = sales_7d / 7;
    const salesChangeVsLast7Days = avgSalesLast7Days > 0 ? ((sales_today - avgSalesLast7Days) / avgSalesLast7Days * 100) : (sales_today > 0 ? 100 : 0);

    return {
      ...combinedStats,
      caChangeVsYesterday,
      caChangeVsLast7Days,
      avgCALast7Days,
      salesChangeVsYesterday,
      salesChangeVsLast7Days,
      avgSalesLast7Days
    };
  }, [combinedStats]);


  if (!isOpen) return null;

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
                  <h2 className="text-xl md:text-2xl font-bold">Statistiques Détaillées</h2>
                  <p className="text-purple-100 text-sm md:text-base">{bar.name}</p>
                <p className="text-purple-200 text-xs mt-0.5">
                  {bar.isActive ? '✅ Actif' : '❌ Suspendu'} • {bar.address}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader className="w-8 h-8 animate-spin text-purple-600" />
                <p className="ml-4 text-gray-600">Chargement des statistiques...</p>
              </div>
            )}
            {!isLoading && !stats && (
               <div className="text-center p-8">
                 <p className="text-red-500">Impossible de charger les statistiques.</p>
               </div>
            )}
            {!isLoading && stats && (
              <>
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
                            {stats.revenue_today.toLocaleString('fr-FR')} <span className="text-lg">FCFA</span>
                          </p>
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              {Math.abs(stats.caChangeVsYesterday) < 1 ? <Minus className="w-4 h-4 text-gray-500" /> : stats.caChangeVsYesterday > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                              <span className={`text-xs font-medium ${Math.abs(stats.caChangeVsYesterday) < 1 ? 'text-gray-600' : stats.caChangeVsYesterday > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.caChangeVsYesterday > 0 ? '+' : ''}{stats.caChangeVsYesterday.toFixed(1)}% vs hier
                              </span>
                              <span className="text-xs text-gray-500">({stats.revenue_yesterday.toLocaleString('fr-FR')} FCFA)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {Math.abs(stats.caChangeVsLast7Days) < 1 ? <Minus className="w-4 h-4 text-gray-500" /> : stats.caChangeVsLast7Days > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                              <span className={`text-xs font-medium ${Math.abs(stats.caChangeVsLast7Days) < 1 ? 'text-gray-600' : stats.caChangeVsLast7Days > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.caChangeVsLast7Days > 0 ? '+' : ''}{stats.caChangeVsLast7Days.toFixed(1)}% vs moy. 7j
                              </span>
                              <span className="text-xs text-gray-500">({stats.avgCALast7Days.toFixed(0)} FCFA/j)</span>
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
                          <p className="text-2xl md:text-3xl font-bold text-amber-600">{stats.sales_today}</p>
                          <p className="text-xs text-gray-500 mt-1">Transactions effectuées</p>
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center gap-2">
                              {Math.abs(stats.salesChangeVsYesterday) < 1 ? <Minus className="w-4 h-4 text-gray-500" /> : stats.salesChangeVsYesterday > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                              <span className={`text-xs font-medium ${Math.abs(stats.salesChangeVsYesterday) < 1 ? 'text-gray-600' : stats.salesChangeVsYesterday > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.salesChangeVsYesterday > 0 ? '+' : ''}{stats.salesChangeVsYesterday.toFixed(1)}% vs hier
                              </span>
                              <span className="text-xs text-gray-500">({stats.sales_yesterday} ventes)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {Math.abs(stats.salesChangeVsLast7Days) < 1 ? <Minus className="w-4 h-4 text-gray-500" /> : stats.salesChangeVsLast7Days > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                              <span className={`text-xs font-medium ${Math.abs(stats.salesChangeVsLast7Days) < 1 ? 'text-gray-600' : stats.salesChangeVsLast7Days > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stats.salesChangeVsLast7Days > 0 ? '+' : ''}{stats.salesChangeVsLast7Days.toFixed(1)}% vs moy. 7j
                              </span>
                              <span className="text-xs text-gray-500">({stats.avgSalesLast7Days.toFixed(1)} ventes/j)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Historical Summary */}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">CA 7 jours</p><p className="text-lg font-bold text-gray-900">{stats.revenue_7d.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span></p></div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">CA 30 jours</p><p className="text-lg font-bold text-gray-900">{stats.revenue_30d.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span></p></div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">Ventes 7j</p><p className="text-lg font-bold text-gray-900">{stats.sales_7d}</p></div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200"><p className="text-xs text-gray-500 mb-1">Ventes 30j</p><p className="text-lg font-bold text-gray-900">{stats.sales_30d}</p></div>
                  </div>
                </section>
                
                {/* Top Products */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-bold text-gray-900">Top 3 Produits (Historique)</h3>
                  </div>
                  {!stats.top_products_json || stats.top_products_json.length === 0 ? (
                    <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">Aucune donnée de produit disponible.</div>
                  ) : (
                    <div className="space-y-2">
                      {stats.top_products_json.map((product, index) => (
                        <div key={product.product_id} className={`flex items-center justify-between p-3 rounded-lg ${index < 3 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200' : 'bg-white border border-gray-200'}`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${product.rank === 1 ? 'bg-yellow-400 text-yellow-900' : product.rank === 2 ? 'bg-gray-300 text-gray-700' : 'bg-amber-300 text-amber-900'}`}>{product.rank}</div>
                            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 truncate">{product.name}</p></div>
                          </div>
                          <div className="text-right"><p className="font-bold text-green-600">{product.revenue.toLocaleString('fr-FR')} FCFA</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Team & Alerts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <section>
                    <div className="flex items-center gap-2 mb-3"><Users className="w-5 h-5 text-blue-600" /><h3 className="text-lg font-bold text-gray-900">Équipe</h3></div>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Total membres</span>
                        <span className="text-xl font-bold text-blue-600">{stats.total_members}</span>
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center gap-2 mb-3"><Package className="w-5 h-5 text-orange-600" /><h3 className="text-lg font-bold text-gray-900">Alertes Stock (En direct)</h3></div>
                    <div className={`rounded-xl p-4 border ${stats.stock_alerts_count > 0 ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200' : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'}`}>
                      {stats.stock_alerts_count > 0 ? (
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-red-900 text-lg">{stats.stock_alerts_count}</p>
                            <p className="text-sm text-red-700">Produit{stats.stock_alerts_count > 1 ? 's' : ''} en alerte de stock.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <Package className="w-6 h-6 text-green-600 flex-shrink-0" />
                          <div><p className="font-bold text-green-900">Stock OK</p><p className="text-sm text-green-700">Aucune alerte de stock.</p></div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Bar Settings Summary */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3"><Calendar className="w-5 h-5 text-gray-600" /><h3 className="text-sm font-bold text-gray-700">Configuration</h3></div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div><p className="text-gray-500 text-xs">Heure de fermeture</p><p className="font-semibold text-gray-900">{bar.closingHour ?? 6}h</p></div>
                    <div><p className="text-gray-500 text-xs">TVA</p><p className="font-semibold text-gray-900">{bar.settings?.taxRate ?? 0}%</p></div>
                    <div><p className="text-gray-500 text-xs">Mode</p><p className="font-semibold text-gray-900">{bar.settings?.operatingMode === 'full' ? 'Complet' : 'Simplifié'}</p></div>
                  </div>
                </section>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
