import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Database,
  Users,
  TrendingUp,
  AlertCircle,
  Download,
  Bell,
  BellOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  SecurityService,
  MaterializedViewService,
  SecurityDashboardData,
  RecentRLSViolation,
  MaterializedViewRefreshStats,
  MaterializedViewRefreshLog,
  ActiveRefreshAlert,
} from '../services/supabase/security.service';
import { LoadingFallback } from '../components/LoadingFallback';
import { Alert } from '../components/ui/Alert';
import { exportToCSV } from '../utils/exportToCSV';
import { exportToExcel } from '../utils/exportToExcel';
import { formatRelativeTime } from '../utils/formatRelativeTime';

// Lazy load charts to reduce initial bundle size (saves ~110 KB gzipped)
const RefreshHistoryChart = lazy(() =>
  import('../components/charts/RefreshHistoryChart').then((module) => ({
    default: module.RefreshHistoryChart,
  }))
);

export default function SecurityDashboardPage() {
  const { currentSession } = useAuth();
  const [loading, setLoading] = useState(true);

  // RLS Violations State
  const [securityDashboard, setSecurityDashboard] = useState<SecurityDashboardData[]>([]);
  const [recentViolations, setRecentViolations] = useState<RecentRLSViolation[]>([]);

  // Materialized View State
  const [refreshStats, setRefreshStats] = useState<MaterializedViewRefreshStats[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<ActiveRefreshAlert[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshHistory, setRefreshHistory] = useState<MaterializedViewRefreshLog[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [previousAlertsCount, setPreviousAlertsCount] = useState(0);

  const loadSecurityData = useCallback(async () => {
    if (currentSession?.role !== 'super_admin') return;

    try {
      setLoading(true);

      // Load all security data in parallel
      const [dashboard, violations, stats, alerts, history] = await Promise.all([
        SecurityService.getSecurityDashboard(),
        SecurityService.getRecentRLSViolations(),
        MaterializedViewService.getRefreshStats(),
        MaterializedViewService.getActiveRefreshAlerts(),
        MaterializedViewService.getRefreshHistory('bars_with_stats', 100),
      ]);

      setSecurityDashboard(dashboard);
      setRecentViolations(violations);
      setRefreshStats(stats);

      // Detect new alerts for notifications
      if (notificationsEnabled && alerts.length > previousAlertsCount) {
        showBrowserNotification('Nouvelle alerte de refresh détectée!');
      }
      setPreviousAlertsCount(alerts.length);
      setActiveAlerts(alerts);
      setRefreshHistory(history);
    } catch (error) {
      console.error('Error loading security data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession, notificationsEnabled, previousAlertsCount]);

  useEffect(() => {
    loadSecurityData();
    // Refresh every 30 seconds
    const interval = setInterval(loadSecurityData, 30000);
    return () => clearInterval(interval);
  }, [loadSecurityData]);

  // Browser notification utility
  const showBrowserNotification = (message: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('BarTender Security Alert', {
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
      });
    }
  };

  // Toggle browser notifications
  const toggleNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Votre navigateur ne supporte pas les notifications');
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      }
    } else if (Notification.permission === 'granted') {
      setNotificationsEnabled(!notificationsEnabled);
    } else {
      alert('Notifications bloquées. Autorisez-les dans les paramètres du navigateur.');
    }
  };

  // Refresh all views in parallel
  const handleRefreshAllViews = async () => {
    try {
      setRefreshing('all');
      const result = await MaterializedViewService.refreshBarsWithStats();

      if (result.success) {
        alert(`Refresh réussi en ${result.duration_ms}ms`);
        loadSecurityData();
      } else {
        alert(`Échec du refresh: ${result.error_message}`);
      }
    } catch (error) {
      console.error('Error refreshing all views:', error);
      alert('Erreur lors du refresh');
    } finally {
      setRefreshing(null);
    }
  };

  // Export refresh logs to CSV
  const handleExportCSV = () => {
    if (refreshHistory.length === 0) {
      alert('Aucun log à exporter');
      return;
    }

    const exportData = refreshHistory.map((log) => ({
      view_name: log.view_name,
      status: log.status,
      started_at: log.started_at,
      completed_at: log.completed_at || 'N/A',
      duration_ms: log.duration_ms || 0,
      error_message: log.error_message || '',
      created_at: log.created_at,
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    exportToCSV(exportData, `refresh_logs_${timestamp}`);
  };

  // Export refresh logs to Excel
  const handleExportExcel = async () => {
    if (refreshHistory.length === 0) {
      alert('Aucun log à exporter');
      return;
    }

    const exportData = refreshHistory.map((log) => ({
      'Vue': log.view_name,
      'Statut': log.status,
      'Démarré à': new Date(log.started_at).toLocaleString('fr-FR'),
      'Terminé à': log.completed_at ? new Date(log.completed_at).toLocaleString('fr-FR') : 'N/A',
      'Durée (ms)': log.duration_ms || 0,
      'Message d\'erreur': log.error_message || '',
      'Créé le': new Date(log.created_at).toLocaleString('fr-FR'),
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    await exportToExcel(exportData, `refresh_logs_${timestamp}`);
  };

  const handleRefreshView = async (viewName: string) => {
    try {
      setRefreshing(viewName);
      const result = await MaterializedViewService.refreshMaterializedView(viewName);

      if (result.success) {
        alert(`Refresh réussi en ${result.duration_ms}ms`);
        loadSecurityData(); // Reload stats
      } else {
        alert(`Échec du refresh: ${result.error_message}`);
      }
    } catch (error) {
      console.error('Error refreshing view:', error);
      alert('Erreur lors du refresh');
    } finally {
      setRefreshing(null);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const success = await MaterializedViewService.acknowledgeAlert(alertId);
      if (success) {
        alert('Alerte acknowledgée avec succès');
        loadSecurityData(); // Reload alerts
      } else {
        alert('Échec acknowledgement alerte');
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Erreur lors de l\'acknowledgement');
    }
  };

  if (loading) {
    return <LoadingFallback />;
  }

  // Calculate summary stats
  const totalViolations = securityDashboard.reduce(
    (sum, item) => sum + item.violation_count,
    0
  );
  const totalFailedRefreshes = refreshStats.reduce(
    (sum, stat) => sum + stat.failed_count + stat.timeout_count,
    0
  );
  const totalActiveAlerts = activeAlerts.length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Shield className="w-7 h-7 text-red-600" />
          Dashboard Sécurité & Monitoring
        </h1>
        <p className="text-gray-500 mt-1 text-sm md:text-base">
          Surveillance RLS violations et performance materialized views
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* RLS Violations Card */}
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-6 shadow-sm border border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-gray-600 text-sm mb-1">RLS Violations (24h)</p>
              <p className="text-3xl font-bold text-red-600">{totalViolations}</p>
              {recentViolations.length > 0 && (
                <p className="text-xs text-red-700 mt-2">
                  {recentViolations.length} utilisateur(s) suspect(s)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Failed Refreshes Card */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-6 shadow-sm border border-amber-200">
          <div className="flex items-start gap-3">
            <Database className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-gray-600 text-sm mb-1">Échecs Refresh (7j)</p>
              <p className="text-3xl font-bold text-amber-600">{totalFailedRefreshes}</p>
              {totalFailedRefreshes > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {refreshStats.length} vue(s) affectée(s)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Active Alerts Card */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 shadow-sm border border-purple-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-gray-600 text-sm mb-1">Alertes Actives</p>
              <p className="text-3xl font-bold text-purple-600">{totalActiveAlerts}</p>
              {totalActiveAlerts > 0 && (
                <p className="text-xs text-purple-700 mt-2">Nécessitent attention</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Alerts Section */}
      {activeAlerts.length > 0 && (
        <section className="mb-6">
          <Alert show={true} variant="destructive" className="mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-semibold">
                {activeAlerts.length} alerte(s) de refresh consécutifs détectée(s)
              </p>
            </div>
          </Alert>

          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Alertes Échecs Refresh Consécutifs
            </h2>

            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-red-50 border border-red-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-red-600" />
                        <p className="font-semibold text-gray-900">{alert.view_name}</p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            alert.status === 'active'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Échecs consécutifs:</p>
                          <p className="font-semibold text-red-600">
                            {alert.consecutive_failures}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Durée incident:</p>
                          <p className="font-semibold">
                            {Math.floor(alert.incident_duration_seconds / 60)} min
                          </p>
                        </div>
                      </div>

                      {alert.error_messages.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-600 mb-1">Dernier message:</p>
                          <p className="text-xs font-mono bg-red-100 p-2 rounded">
                            {alert.error_messages[alert.error_messages.length - 1]}
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleAcknowledgeAlert(alert.id)}
                      disabled={alert.status !== 'active'}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Acknowledger
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Materialized Views Stats */}
      <section className="mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-600" />
              Performance Materialized Views (7 derniers jours)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Notifications Button */}
              <button
                onClick={toggleNotifications}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  notificationsEnabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title="Activer/Désactiver les notifications"
              >
                {notificationsEnabled ? (
                  <Bell className="w-4 h-4" />
                ) : (
                  <BellOff className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Notifications</span>
              </button>

              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                disabled={refreshHistory.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                title="Exporter en CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>

              {/* Export Excel Button */}
              <button
                onClick={handleExportExcel}
                disabled={refreshHistory.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                title="Exporter en Excel"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel</span>
              </button>

              {/* Refresh All Button */}
              <button
                onClick={handleRefreshAllViews}
                disabled={refreshing !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
                title="Rafraîchir toutes les vues"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing === 'all' ? 'animate-spin' : ''}`}
                />
                <span className="hidden md:inline">Refresh All</span>
              </button>
            </div>
          </div>

          {/* Desktop: Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Vue
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Succès
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Échecs
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Timeouts
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Avg (ms)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Dernier Refresh
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {refreshStats.map((stat) => {
                  const successRate =
                    stat.total_refreshes > 0
                      ? Math.round((stat.success_count / stat.total_refreshes) * 100)
                      : 0;

                  // Check if refresh is stale (>10 minutes)
                  const lastRefreshDate = new Date(stat.last_refresh_at);
                  const minutesSinceRefresh = Math.floor(
                    (Date.now() - lastRefreshDate.getTime()) / 60000
                  );
                  const needsRefresh = minutesSinceRefresh > 10;

                  return (
                    <tr key={stat.view_name} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-sm">{stat.view_name}</span>
                          {needsRefresh && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Needs Refresh
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {stat.total_refreshes}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-600">
                            {stat.success_count}
                          </span>
                          <span className="text-xs text-gray-500">({successRate}%)</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            stat.failed_count > 0 ? 'text-red-600' : 'text-gray-400'
                          }`}
                        >
                          {stat.failed_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            stat.timeout_count > 0 ? 'text-amber-600' : 'text-gray-400'
                          }`}
                        >
                          {stat.timeout_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm">{Math.round(stat.avg_duration_ms)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          <div className="text-gray-900 font-medium">
                            {formatRelativeTime(stat.last_refresh_at)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(stat.last_refresh_at).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: Card View */}
          <div className="md:hidden space-y-3">
            {refreshStats.map((stat) => {
              const successRate =
                stat.total_refreshes > 0
                  ? Math.round((stat.success_count / stat.total_refreshes) * 100)
                  : 0;

              // Check if refresh is stale (>10 minutes)
              const lastRefreshDate = new Date(stat.last_refresh_at);
              const minutesSinceRefresh = Math.floor(
                (Date.now() - lastRefreshDate.getTime()) / 60000
              );
              const needsRefresh = minutesSinceRefresh > 10;

              return (
                <div
                  key={stat.view_name}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-sm">{stat.view_name}</span>
                    </div>
                    {needsRefresh && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Needs Refresh
                      </span>
                    )}
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Total */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Total</div>
                      <div className="text-lg font-bold text-gray-900">
                        {stat.total_refreshes}
                      </div>
                    </div>

                    {/* Success */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Succès</div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-lg font-bold text-green-600">
                          {stat.success_count}
                        </span>
                        <span className="text-xs text-gray-500">({successRate}%)</span>
                      </div>
                    </div>

                    {/* Failures */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Échecs</div>
                      <div
                        className={`text-lg font-bold ${
                          stat.failed_count > 0 ? 'text-red-600' : 'text-gray-400'
                        }`}
                      >
                        {stat.failed_count}
                      </div>
                    </div>

                    {/* Timeouts */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Timeouts</div>
                      <div
                        className={`text-lg font-bold ${
                          stat.timeout_count > 0 ? 'text-amber-600' : 'text-gray-400'
                        }`}
                      >
                        {stat.timeout_count}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500">Avg:</span>{' '}
                      <span className="font-semibold text-gray-900">
                        {Math.round(stat.avg_duration_ms)}ms
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatRelativeTime(stat.last_refresh_at)}
                      </div>
                      <div className="text-gray-500">
                        {new Date(stat.last_refresh_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* RLS Violations - Recent Suspicious Users */}
      {recentViolations.length > 0 && (
        <section className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-red-600" />
              Utilisateurs Suspects (3+ violations en 1h)
            </h2>

            <div className="space-y-3">
              {recentViolations.map((violation) => (
                <div
                  key={violation.user_id}
                  className="bg-red-50 border border-red-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-red-600" />
                        <p className="font-semibold text-gray-900">
                          {violation.user_email || 'Email inconnu'}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Violations:</p>
                          <p className="font-semibold text-red-600">
                            {violation.violation_count}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Tables affectées:</p>
                          <p className="font-semibold">{violation.tables_affected.length}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Dernière violation:</p>
                          <p className="font-semibold text-xs">
                            {new Date(violation.last_violation).toLocaleTimeString('fr-FR')}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <p className="text-xs text-gray-600">
                          Tables:{' '}
                          <span className="font-mono">
                            {violation.tables_affected.join(', ')}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* RLS Violations - 24h Heatmap */}
      {securityDashboard.length > 0 && (
        <section>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-600" />
              Heatmap Violations RLS (24h)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Heure
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Table
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Opération
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Violations
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Utilisateurs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {securityDashboard.slice(0, 20).map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {new Date(item.hour).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">{item.table_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-semibold">
                          {item.operation}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-red-600">
                          {item.violation_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {item.unique_users}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Empty State */}
      {securityDashboard.length === 0 &&
        recentViolations.length === 0 &&
        refreshStats.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Aucune donnée de sécurité disponible</p>
            <p className="text-gray-400 text-sm mt-2">
              Les violations RLS et erreurs de refresh apparaîtront ici
            </p>
          </div>
        )}

      {/* Performance Charts Section */}
      {refreshHistory.length > 0 && (
        <section className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Analyse de Performance
            </h2>

            <Suspense fallback={<div className="text-center py-8 text-gray-500">Chargement des graphiques...</div>}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Duration Timeline */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Historique Durée Refresh (20 derniers)
                  </h4>
                  <RefreshHistoryChart logs={refreshHistory} chartType="line" />
                </div>

                {/* Status Distribution */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Distribution Statuts
                  </h4>
                  <RefreshHistoryChart logs={refreshHistory} chartType="pie" />
                </div>

                {/* Duration Trend */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Tendance Performance
                  </h4>
                  <RefreshHistoryChart logs={refreshHistory} chartType="area" />
                </div>

                {/* Average by View */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Durée Moyenne par Vue
                  </h4>
                  <RefreshHistoryChart logs={refreshHistory} chartType="bar" />
                </div>
              </div>
            </Suspense>

            {/* Performance Insights */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <p className="text-sm font-semibold text-gray-700">Refresh le Plus Rapide</p>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {Math.min(
                    ...refreshHistory
                      .filter((log) => log.duration_ms && log.status === 'success')
                      .map((log) => log.duration_ms!)
                  )}
                  ms
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-gray-700">Durée Moyenne Totale</p>
                </div>
                <p className="text-2xl font-bold text-amber-600">
                  {Math.round(
                    refreshHistory
                      .filter((log) => log.duration_ms && log.status === 'success')
                      .reduce((sum, log) => sum + log.duration_ms!, 0) /
                      refreshHistory.filter((log) => log.duration_ms && log.status === 'success')
                        .length
                  )}
                  ms
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-semibold text-gray-700">Taux de Succès</p>
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {(
                    (refreshHistory.filter((log) => log.status === 'success').length /
                      refreshHistory.length) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
