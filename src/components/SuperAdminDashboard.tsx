import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Building2,
  TrendingUp,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  UserCheck,
  UserX,
  CheckCircle,
  XCircle,
  Award,
  BarChart3,
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Sale } from '../types';
import { getBusinessDay, getCurrentBusinessDay, isSameDay } from '../utils/businessDay';

interface SuperAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SuperAdminDashboard({ isOpen, onClose }: SuperAdminDashboardProps) {
  const { bars, barMembers } = useBarContext();
  const { users } = useAuth();

  // Statistiques complètes
  const stats = useMemo(() => {
    // Users breakdown
    const promoteurs = users.filter(u => {
      const memberRoles = barMembers.filter(m => m.userId === u.id).map(m => m.role);
      return memberRoles.includes('promoteur');
    });

    const gerants = users.filter(u => {
      const memberRoles = barMembers.filter(m => m.userId === u.id).map(m => m.role);
      return memberRoles.includes('gerant');
    });

    const serveurs = users.filter(u => {
      const memberRoles = barMembers.filter(m => m.userId === u.id).map(m => m.role);
      return memberRoles.includes('serveur');
    });

    const activeUsers = users.filter(u => u.isActive).length;
    const suspendedUsers = users.filter(u => !u.isActive).length;

    // Bars stats
    const activeBars = bars.filter(b => b.isActive);
    const suspendedBars = bars.filter(b => !b.isActive);

    // Calculate total CA and sales count across all bars (today)
    let totalCAToday = 0;
    let totalSalesToday = 0;
    const barsPerformance: Array<{
      barId: string;
      barName: string;
      ca: number;
      salesCount: number;
      isActive: boolean;
    }> = [];

    bars.forEach(bar => {
      try {
        const salesKey = `sales_${bar.id}`;
        const salesData = localStorage.getItem(salesKey);
        const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

        const closeHour = bar.settings?.businessDayCloseHour ?? 6;
        const currentBusinessDay = getCurrentBusinessDay(closeHour);

        const salesToday = sales.filter(sale => {
          const saleDate = new Date(sale.date);
          const saleBusinessDay = getBusinessDay(saleDate, closeHour);
          return isSameDay(saleBusinessDay, currentBusinessDay);
        });

        const barCA = salesToday.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const barSalesCount = salesToday.length;

        totalCAToday += barCA;
        totalSalesToday += barSalesCount;

        barsPerformance.push({
          barId: bar.id,
          barName: bar.name,
          ca: barCA,
          salesCount: barSalesCount,
          isActive: bar.isActive,
        });
      } catch (error) {
        console.error(`Error calculating stats for bar ${bar.id}:`, error);
      }
    });

    // Sort bars by CA and get top 10
    const topBars = barsPerformance
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 10);

    return {
      // Vue d'ensemble
      totalBars: bars.length,
      activeBars: activeBars.length,
      suspendedBars: suspendedBars.length,

      // Users
      totalUsers: users.length,
      totalPromoteurs: promoteurs.length,
      totalGerants: gerants.length,
      totalServeurs: serveurs.length,
      activeUsers,
      suspendedUsers,

      // Performance
      totalCAToday,
      totalSalesToday,
      topBars,
    };
  }, [bars, users, barMembers]);

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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
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
              <ShieldCheck className="w-6 h-6 md:w-8 md:h-8" />
              <div>
                <h2 className="text-xl md:text-2xl font-bold">Super Admin Dashboard</h2>
                <p className="text-purple-100 text-xs md:text-sm">Vue d'ensemble de BarTender Pro</p>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* 🏢 Section 1: Statistiques des Bars */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-gray-900">Statistiques des Bars</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 shadow-sm border border-purple-200">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-6 h-6 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Total Bars</p>
                      <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats.totalBars}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Bars Actifs</p>
                      <p className="text-2xl md:text-3xl font-bold text-green-600">{stats.activeBars}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 shadow-sm border border-red-200">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Bars Suspendus</p>
                      <p className="text-2xl md:text-3xl font-bold text-red-600">{stats.suspendedBars}</p>
                    </div>
                  </div>
                </div>
              </div>

              {stats.suspendedBars > 0 && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">
                    <span className="font-semibold">{stats.suspendedBars}</span> bar{stats.suspendedBars > 1 ? 's' : ''} suspendu{stats.suspendedBars > 1 ? 's' : ''} nécessite{stats.suspendedBars > 1 ? 'nt' : ''} votre attention.
                  </p>
                </div>
              )}
            </section>

            {/* 👥 Section 2: Statistiques des Utilisateurs */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-gray-900">Statistiques des Utilisateurs</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 shadow-sm border border-blue-200">
                  <div className="flex items-start gap-3">
                    <Users className="w-6 h-6 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Total Utilisateurs</p>
                      <p className="text-2xl md:text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 shadow-sm border border-purple-200">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-6 h-6 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Promoteurs</p>
                      <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats.totalPromoteurs}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 shadow-sm border border-indigo-200">
                  <div className="flex items-start gap-3">
                    <UserCheck className="w-6 h-6 text-indigo-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Gérants</p>
                      <p className="text-2xl md:text-3xl font-bold text-indigo-600">{stats.totalGerants}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 shadow-sm border border-teal-200">
                  <div className="flex items-start gap-3">
                    <Users className="w-6 h-6 text-teal-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Serveurs</p>
                      <p className="text-2xl md:text-3xl font-bold text-teal-600">{stats.totalServeurs}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Actifs</p>
                      <p className="text-2xl md:text-3xl font-bold text-green-600">{stats.activeUsers}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 shadow-sm border border-red-200">
                  <div className="flex items-start gap-3">
                    <UserX className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-xs md:text-sm mb-1">Suspendus</p>
                      <p className="text-2xl md:text-3xl font-bold text-red-600">{stats.suspendedUsers}</p>
                    </div>
                  </div>
                </div>
              </div>

              {stats.suspendedUsers > 0 && (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-orange-800">
                    <span className="font-semibold">{stats.suspendedUsers}</span> utilisateur{stats.suspendedUsers > 1 ? 's' : ''} suspendu{stats.suspendedUsers > 1 ? 's' : ''}.
                  </p>
                </div>
              )}
            </section>

            {/* 💰 Section 3: Performance & Analytics */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-gray-900">Performance & Analytics</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 md:p-6 shadow-sm border border-green-200">
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-8 h-8 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-sm mb-1">CA Total Aujourd'hui</p>
                      <p className="text-3xl md:text-4xl font-bold text-green-600">
                        {stats.totalCAToday.toLocaleString('fr-FR')} <span className="text-xl md:text-2xl">FCFA</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-xl p-4 md:p-6 shadow-sm border border-orange-200">
                  <div className="flex items-start gap-3">
                    <ShoppingCart className="w-8 h-8 text-orange-600 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600 text-sm mb-1">Nombre de Ventes</p>
                      <p className="text-3xl md:text-4xl font-bold text-orange-600">{stats.totalSalesToday}</p>
                      <p className="text-xs text-gray-500 mt-1">Transactions effectuées</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top 10 Bars */}
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-5 h-5 text-amber-600" />
                  <h4 className="font-bold text-gray-900">Top 10 Bars par CA</h4>
                </div>

                {stats.topBars.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Aucune vente enregistrée aujourd'hui</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topBars.map((bar, index) => (
                      <div
                        key={bar.barId}
                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                          index < 3
                            ? 'bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300 shadow-sm'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              index === 0
                                ? 'bg-yellow-400 text-yellow-900'
                                : index === 1
                                ? 'bg-gray-300 text-gray-700'
                                : index === 2
                                ? 'bg-orange-300 text-orange-900'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate text-sm md:text-base">
                              {bar.barName}
                              {!bar.isActive && (
                                <span className="ml-2 text-xs text-red-600">(Suspendu)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{bar.salesCount} vente{bar.salesCount > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600 text-sm md:text-base">
                            {bar.ca.toLocaleString('fr-FR')} FCFA
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Info Message */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200">
              <p className="text-sm text-gray-700 text-center">
                💡 <span className="font-semibold">Conseil:</span> Utilisez le menu mobile (☰) pour accéder aux fonctionnalités de gestion détaillées (Bars, Utilisateurs, Audit Logs)
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
