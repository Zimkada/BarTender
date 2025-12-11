import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
  Award,
} from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { Sale, User, Return } from '../types';
import { AuthService } from '../services/supabase/auth.service';
import { getCurrentBusinessDateString, dateToYYYYMMDD, filterByBusinessDateRange } from '../utils/businessDateHelpers';
import { SalesService } from '../services/supabase/sales.service';
import { ReturnsService } from '../services/supabase/returns.service';
import { Alert } from '../components/ui/Alert';
import { LoadingFallback } from '../components/LoadingFallback';

/**
 * SuperAdminPage - Page dédiée pour le Super Admin Dashboard
 * Route: /admin
 */
export default function SuperAdminPage() {
  const { currentSession } = useAuth();
  const { bars } = useBarContext();
  const [users, setUsers] = useState<Array<User & { roles: string[] }>>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [allReturns, setAllReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAllData = useCallback(async () => {
    try {
      const [usersData, salesData, returnsData] = await Promise.all([
        AuthService.getAllUsersWithRoles(),
        SalesService.getAllSales(),
        ReturnsService.getAllReturns(),
      ]);

      const mappedUsers = usersData.map(u => ({
        id: u.id,
        username: u.username || '',
        password: '',
        name: u.name || '',
        phone: u.phone || '',
        email: u.email || '',
        createdAt: new Date(u.created_at),
        isActive: u.is_active ?? true,
        firstLogin: u.first_login ?? false,
        lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : undefined,
        roles: u.roles
      })) as Array<User & { roles: string[] }>;

      // Mapper les ventes (snake_case -> camelCase)
      const mappedSales = salesData.map((sale: any) => ({
        id: sale.id,
        barId: sale.bar_id,
        items: sale.items || [],
        total: sale.total,
        currency: sale.currency || 'XOF',
        status: sale.status,
        createdBy: sale.created_by,
        validatedBy: sale.validated_by,
        createdAt: new Date(sale.created_at),
        validatedAt: sale.validated_at ? new Date(sale.validated_at) : undefined,
        businessDate: sale.business_date ? new Date(sale.business_date) : new Date(sale.created_at),
        paymentMethod: sale.payment_method,
        customerName: sale.customer_name,
        notes: sale.notes,
      })) as Sale[];

      // Mapper les retours (snake_case -> camelCase)
      const mappedReturns = returnsData.map((ret: any) => ({
        id: ret.id,
        barId: ret.bar_id,
        saleId: ret.sale_id,
        productId: ret.product_id,
        productName: ret.product_name,
        productVolume: ret.product_volume || '',
        quantitySold: ret.quantity_sold,
        quantityReturned: ret.quantity_returned,
        reason: ret.reason,
        returnedBy: ret.returned_by,
        returnedAt: new Date(ret.returned_at),
        businessDate: ret.business_date ? new Date(ret.business_date) : new Date(ret.returned_at),
        refundAmount: ret.refund_amount,
        isRefunded: ret.is_refunded,
        status: ret.status,
        autoRestock: ret.auto_restock,
        manualRestockRequired: ret.manual_restock_required,
        restockedAt: ret.restocked_at ? new Date(ret.restocked_at) : undefined,
        notes: ret.notes,
      })) as Return[];

      setUsers(mappedUsers);
      setAllSales(mappedSales);
      setAllReturns(mappedReturns);

    } catch (error) {
      console.error('Erreur chargement données Super Admin:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // AdminLayout gère déjà la protection d'accès
    // On charge les données uniquement si la session est valide
    if (currentSession?.role === 'super_admin') {
      loadAllData();
    }
  }, [currentSession, loadAllData]);

  const stats = useMemo(() => {
    const promoteurs = users.filter(u => u.roles.includes('promoteur'));
    const gerants = users.filter(u => u.roles.includes('gerant'));
    const serveurs = users.filter(u => u.roles.includes('serveur'));
    const activeUsers = users.filter(u => u.isActive).length;
    const suspendedUsers = users.filter(u => !u.isActive).length;

    const safeBars = bars || [];
    const activeBars = safeBars.filter(b => b.isActive);
    const suspendedBars = safeBars.filter(b => !b.isActive);

    const todayStr = getCurrentBusinessDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateToYYYYMMDD(yesterday);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = dateToYYYYMMDD(sevenDaysAgo);

    const salesToday = filterByBusinessDateRange(allSales, todayStr, todayStr);
    const salesYesterday = filterByBusinessDateRange(allSales, yesterdayStr, yesterdayStr);
    const salesLast7Days = filterByBusinessDateRange(allSales, sevenDaysAgoStr, todayStr);

    const returnsToday = filterByBusinessDateRange(allReturns, todayStr, todayStr).filter(r => r.isRefunded);
    const returnsYesterday = filterByBusinessDateRange(allReturns, yesterdayStr, yesterdayStr).filter(r => r.isRefunded);
    const returnsLast7Days = filterByBusinessDateRange(allReturns, sevenDaysAgoStr, todayStr).filter(r => r.isRefunded);


    const getNetRevenue = (sales: Sale[], returns: Return[]): number => {
      const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
      const returnsTotal = returns.reduce((sum, ret) => sum + ret.refundAmount, 0);
      return salesTotal - returnsTotal;
    };

    const totalCAToday = getNetRevenue(salesToday, returnsToday);
    const totalCAYesterday = getNetRevenue(salesYesterday, returnsYesterday);
    const totalCALast7Days = getNetRevenue(salesLast7Days, returnsLast7Days);

    const totalSalesToday = salesToday.length;
    const totalSalesYesterday = salesYesterday.length;

    const barsPerformance = safeBars.map(bar => {
      const barSalesToday = salesToday.filter(s => s.barId === bar.id);
      const barReturnsToday = returnsToday.filter(r => r.barId === bar.id);
      return {
        barId: bar.id,
        barName: bar.name,
        ca: getNetRevenue(barSalesToday, barReturnsToday),
        salesCount: barSalesToday.length,
        isActive: bar.isActive,
      };
    });

    const caChangeVsYesterday = totalCAYesterday > 0 ? ((totalCAToday - totalCAYesterday) / totalCAYesterday * 100) : (totalCAToday > 0 ? 100 : 0);
    const salesChangeVsYesterday = totalSalesYesterday > 0 ? ((totalSalesToday - totalSalesYesterday) / totalSalesYesterday * 100) : (totalSalesToday > 0 ? 100 : 0);

    const avgCALast7Days = totalCALast7Days / 7;
    const caChangeVsLast7Days = avgCALast7Days > 0 ? ((totalCAToday - avgCALast7Days) / avgCALast7Days * 100) : (totalCAToday > 0 ? 100 : 0);

    const avgSalesLast7Days = salesLast7Days.length / 7;
    const salesChangeVsLast7Days = avgSalesLast7Days > 0 ? ((totalSalesToday - avgSalesLast7Days) / avgSalesLast7Days * 100) : (totalSalesToday > 0 ? 100 : 0);

    const topBars = barsPerformance.sort((a, b) => b.ca - a.ca).slice(0, 10);

    return {
      totalBars: safeBars.length,
      activeBars: activeBars.length,
      suspendedBars: suspendedBars.length,
      totalUsers: users.length,
      totalPromoteurs: promoteurs.length,
      totalGerants: gerants.length,
      totalServeurs: serveurs.length,
      activeUsers,
      suspendedUsers,
      totalCAToday,
      totalSalesToday,
      totalCAYesterday,
      totalSalesYesterday,
      totalCALast7Days,
      totalSalesLast7Days: salesLast7Days.length,
      caChangeVsYesterday,
      salesChangeVsYesterday,
      caChangeVsLast7Days,
      salesChangeVsLast7Days,
      avgCALast7Days,
      avgSalesLast7Days,
      topBars,
    };
  }, [bars, users, allSales, allReturns]);

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-purple-600" />
          Dashboard Super Admin
        </h1>
        <p className="text-gray-500 mt-1">Vue d'ensemble de BarTender Pro</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Section 1: Statistiques des Bars */}
        <section className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
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
            <Alert show={stats.suspendedBars > 0} variant="destructive" className="mt-3">
              <p className="text-sm">
                <span className="font-semibold">{stats.suspendedBars}</span> bar{stats.suspendedBars > 1 ? 's' : ''} suspendu{stats.suspendedBars > 1 ? 's' : ''} nécessite{stats.suspendedBars > 1 ? 'nt' : ''} votre attention.
              </p>
            </Alert>
          )}
        </section>

        {/* Section 2: Statistiques des Utilisateurs */}
        <section className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
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
            <Alert show={stats.suspendedUsers > 0} variant="warning" className="mt-3">
              <p className="text-sm">
                <span className="font-semibold">{stats.suspendedUsers}</span> utilisateur{stats.suspendedUsers > 1 ? 's' : ''} suspendu{stats.suspendedUsers > 1 ? 's' : ''}.
              </p>
            </Alert>
          )}
        </section>

        {/* Section 3: Performance & Analytics */}
        <section className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">Performance & Analytics</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4">
            {/* CA Total Card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-4 md:p-6 shadow-sm border border-green-200">
              <div className="flex items-start gap-3">
                <DollarSign className="w-8 h-8 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-gray-600 text-sm mb-1">CA Total Aujourd'hui</p>
                  <p className="text-3xl md:text-4xl font-bold text-green-600">
                    {stats.totalCAToday.toLocaleString('fr-FR')} <span className="text-xl md:text-2xl">FCFA</span>
                  </p>

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
                        ({stats.totalCAYesterday.toLocaleString('fr-FR')} FCFA)
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

            {/* Ventes Count Card */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 md:p-6 shadow-sm border border-amber-200">
              <div className="flex items-start gap-3">
                <ShoppingCart className="w-8 h-8 text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-gray-600 text-sm mb-1">Nombre de Ventes</p>
                  <p className="text-3xl md:text-4xl font-bold text-amber-600">{stats.totalSalesToday}</p>
                  <p className="text-xs text-gray-500 mt-1">Transactions effectuées</p>

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
                        ({stats.totalSalesYesterday} ventes)
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
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${index < 3
                      ? 'bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300 shadow-sm'
                      : 'bg-white border border-gray-200'
                      }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0
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
    </div>
  );
}