import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Building2,
  TrendingUp,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminService, DashboardStats } from '../services/supabase/admin.service';
import { LoadingFallback } from '../components/LoadingFallback';
import { Alert } from '../components/ui/Alert';

const initialStats: DashboardStats = {
  total_revenue: 0,
  sales_count: 0,
  active_users_count: 0,
  new_users_count: 0,
  bars_count: 0,
  active_bars_count: 0,
};

export default function SuperAdminPage() {
  const { currentSession } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('today');

  const loadStats = useCallback(async () => {
    if (currentSession?.role !== 'super_admin') return;
    try {
      setLoading(true);
      const data = await AdminService.getDashboardStats(period);
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement des statistiques:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession, period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return <LoadingFallback />;
  }

  const suspendedBarsCount = stats.bars_count - stats.active_bars_count;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-purple-600" />
            Dashboard Super Admin
            </h1>
            <p className="text-gray-500 mt-1">Vue d'ensemble de BarTender Pro</p>
        </div>
        {/* Filtre de période */}
        <div className="flex items-center gap-2">
            {(['today', '7d', '30d'] as const).map(p => (
                <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${ 
                        period === p
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    {p === 'today' ? 'Aujourd\'hui' : p === '7d' ? '7 jours' : '30 jours'}
                </button>
            ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Statistiques Générales */}
        <section>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Revenue */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-6 shadow-sm border border-green-200">
                    <div className="flex items-center gap-4">
                        <DollarSign className="w-8 h-8 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="text-gray-600 text-sm mb-1">Chiffre d'affaires</p>
                            <p className="text-3xl font-bold text-green-600">
                                {stats.total_revenue.toLocaleString('fr-FR')} <span className="text-xl">FCFA</span>
                            </p>
                        </div>
                    </div>
                </div>
                {/* Sales Count */}
                <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-xl p-6 shadow-sm border border-amber-200">
                    <div className="flex items-center gap-4">
                        <ShoppingCart className="w-8 h-8 text-amber-600 flex-shrink-0" />
                        <div>
                            <p className="text-gray-600 text-sm mb-1">Ventes</p>
                            <p className="text-3xl font-bold text-amber-600">{stats.sales_count}</p>
                        </div>
                    </div>
                </div>
                {/* Active Users */}
                <div className="bg-gradient-to-br from-blue-50 to-sky-100 rounded-xl p-6 shadow-sm border border-blue-200">
                    <div className="flex items-center gap-4">
                        <Users className="w-8 h-8 text-blue-600 flex-shrink-0" />
                        <div>
                            <p className="text-gray-600 text-sm mb-1">Utilisateurs actifs (7j)</p>
                            <p className="text-3xl font-bold text-blue-600">{stats.active_users_count}</p>
                        </div>
                    </div>
                </div>
                {/* New Users */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-100 rounded-xl p-6 shadow-sm border border-indigo-200">
                    <div className="flex items-center gap-4">
                        <UserCheck className="w-8 h-8 text-indigo-600 flex-shrink-0" />
                        <div>
                            <p className="text-gray-600 text-sm mb-1">Nouveaux utilisateurs</p>
                            <p className="text-3xl font-bold text-indigo-600">{stats.new_users_count}</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Section 2: Statistiques des Bars */}
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
                  <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats.bars_count}</p>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 shadow-sm border border-green-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-gray-600 text-xs md:text-sm mb-1">Bars Actifs</p>
                  <p className="text-2xl md:text-3xl font-bold text-green-600">{stats.active_bars_count}</p>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 shadow-sm border border-red-200">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-gray-600 text-xs md:text-sm mb-1">Bars Suspendus</p>
                  <p className="text-2xl md:text-3xl font-bold text-red-600">{suspendedBarsCount}</p>
                </div>
              </div>
            </div>
          </div>
          {suspendedBarsCount > 0 && (
            <Alert show={suspendedBarsCount > 0} variant="destructive" className="mt-3">
              <p className="text-sm">
                <span className="font-semibold">{suspendedBarsCount}</span> bar{suspendedBarsCount > 1 ? 's' : ''} suspendu{suspendedBarsCount > 1 ? 's' : ''} nécessite{suspendedBarsCount > 1 ? 'nt' : ''} votre attention.
              </p>
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
