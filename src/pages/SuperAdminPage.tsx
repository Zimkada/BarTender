import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wifi,
  Building2,
  ShieldCheck,
  ShoppingCart,
  DollarSign,
  CheckCircle,
  XCircle,
  UserCheck,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminService, DashboardStats } from '../services/supabase/admin.service';
import { Alert } from '../components/ui/Alert';
import { Select, SelectOption } from '../components/ui/Select';
import { DashboardStatCard } from '../components/DashboardStatCard';
import { useDateRangeFilter } from '../hooks/useDateRangeFilter';
import { SALES_HISTORY_FILTERS } from '../config/dateFilters';
import { PeriodFilter } from '../components/common/filters/PeriodFilter';
import { dateToYYYYMMDD } from '../utils/businessDateHelpers';

const initialStats: DashboardStats = {
  total_revenue: 0,
  sales_count: 0,
  active_users_count: 0,
  new_users_count: 0,
  bars_count: 0,
  active_bars_count: 0,
};

/** Rafraîchissement de la métrique temps réel "Appareils actifs" (cohérent avec le dashboard sécurité). */
const ACTIVE_DEVICES_REFRESH_MS = 30000;

export default function SuperAdminPage() {
  const { currentSession } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [barOptions, setBarOptions] = useState<SelectOption[]>([{ value: '', label: 'Tous les bars' }]);
  const [selectedBarId, setSelectedBarId] = useState('');
  const [activeDevicesCount, setActiveDevicesCount] = useState(0);

  const filter = useDateRangeFilter({
    defaultRange: 'yesterday', // Default to yesterday
  });

  const loadStats = useCallback(async () => {
    if (currentSession?.role !== 'super_admin') return;
    try {
      setLoading(true);
      setError(false);
      const data = await AdminService.getDashboardStats(
        dateToYYYYMMDD(filter.startDate),
        dateToYYYYMMDD(filter.endDate),
        selectedBarId || undefined
      );
      setStats(data);
    } catch (err) {
      console.error('Erreur chargement des statistiques:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [currentSession, filter.startDate, filter.endDate, selectedBarId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Charger la liste des bars pour le sélecteur (une seule fois)
  useEffect(() => {
    if (currentSession?.role !== 'super_admin') return;
    AdminService.getUniqueBars()
      .then((bars) => {
        setBarOptions([
          { value: '', label: 'Tous les bars' },
          ...bars.map((b) => ({
            value: b.id,
            label: b.is_active ? b.name : `${b.name} (suspendu)`,
          })),
        ]);
      })
      .catch((err) => console.error('Erreur chargement des bars:', err));
  }, [currentSession]);

  // Appareils actifs (< 15 min) : instantané indépendant du filtre de période,
  // rafraîchi périodiquement (cohérent avec SecurityDashboardPage). Suit le
  // filtre de bar mais pas les dates.
  useEffect(() => {
    if (currentSession?.role !== 'super_admin') return;

    let cancelled = false;
    const loadActiveDevices = () => {
      AdminService.getActiveDevicesCount(selectedBarId || undefined)
        .then((count) => { if (!cancelled) setActiveDevicesCount(count); })
        .catch((err) => console.error('Erreur chargement des appareils actifs:', err));
    };

    loadActiveDevices();
    const intervalId = window.setInterval(loadActiveDevices, ACTIVE_DEVICES_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentSession, selectedBarId]);

  const suspendedBarsCount = stats.bars_count - stats.active_bars_count;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-purple-600" />
            Dashboard Super Admin
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Vue d'ensemble de BarTender Pro</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 lg:items-start">
          <Select
            options={barOptions}
            value={selectedBarId}
            onChange={(e) => setSelectedBarId(e.target.value)}
            className="sm:w-56"
            aria-label="Filtrer par bar"
          />
          <PeriodFilter
            timeRange={filter.timeRange}
            setTimeRange={filter.setTimeRange}
            availableFilters={SALES_HISTORY_FILTERS}
            customRange={filter.customRange}
            updateCustomRange={filter.updateCustomRange}
            justify="end"
          />
        </div>
      </div>

      {error && (
        <Alert show={true} variant="destructive" className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-semibold">Erreur lors du chargement des statistiques.</p>
            </div>
            <button
              onClick={() => loadStats()}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-950/40 hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réessayer
            </button>
          </div>
        </Alert>
      )}

      <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {/* Section 1: Statistiques Générales */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"> {/* Made grid more responsive */}
            <DashboardStatCard
              icon={DollarSign}
              label="Chiffre d'affaires"
              value={stats.total_revenue}
              subValue="FCFA"
              gradient="green"
            />
            <DashboardStatCard
              icon={ShoppingCart}
              label="Ventes"
              value={stats.sales_count}
              gradient="amber"
            />
            <DashboardStatCard
              icon={Wifi}
              label="Appareils actifs maintenant"
              value={activeDevicesCount}
              gradient="blue"
            />
            <DashboardStatCard
              icon={UserCheck}
              label="Nouveaux utilisateurs"
              value={stats.new_users_count}
              gradient="purple"
            />
          </div>
        </section>

        {/* Section 2: Statistiques des Bars (toujours globales, non affectées par le filtre bar) */}
        <section className="bg-card rounded-2xl shadow-sm border border-purple-100 dark:border-purple-900/40 p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-bold text-foreground">Statistiques des Bars</h3>
            </div>
            <span className="text-xs text-muted-foreground">Toutes périodes, tous bars</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <Link
              to="/admin/bars"
              className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/30 rounded-xl p-4 shadow-sm border border-purple-200 dark:border-purple-900/40 transition-all hover:shadow-md hover:border-purple-400 dark:hover:border-purple-700 cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-foreground/70 text-xs md:text-sm mb-1">Total Bars</p>
                  <p className="text-2xl md:text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.bars_count}</p>
                </div>
              </div>
            </Link>
            <Link
              to="/admin/bars?status=active"
              className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/40 dark:to-green-900/30 rounded-xl p-4 shadow-sm border border-green-200 dark:border-green-900/40 transition-all hover:shadow-md hover:border-green-400 dark:hover:border-green-700 cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-foreground/70 text-xs md:text-sm mb-1">Bars Actifs</p>
                  <p className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">{stats.active_bars_count}</p>
                </div>
              </div>
            </Link>
            <Link
              to="/admin/bars?status=suspended"
              className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/40 dark:to-red-900/30 rounded-xl p-4 shadow-sm border border-red-200 dark:border-red-900/40 transition-all hover:shadow-md hover:border-red-400 dark:hover:border-red-700 cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-foreground/70 text-xs md:text-sm mb-1">Bars Suspendus</p>
                  <p className="text-2xl md:text-3xl font-bold text-red-600 dark:text-red-400">{suspendedBarsCount}</p>
                </div>
              </div>
            </Link>
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
