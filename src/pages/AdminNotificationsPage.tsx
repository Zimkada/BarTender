import React, { useState } from 'react';
import {
  AlertCircle,
  TrendingDown,
  Package,
  Archive,
  Users,
  AlertTriangle,
  Database,
  TrendingUp,
  DollarSign,
  Sparkles,
  BarChart3,
  UserCog,
  CheckCircle,
  Bell,
} from 'lucide-react';
import type { AdminNotification, NotificationPriority } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAdminNotifications } from '../hooks/useAdminNotifications';
import { AdminPanelErrorBoundary } from '../components/AdminPanelErrorBoundary';

// Icônes par type
const notificationIcons: Record<string, React.ElementType> = {
  negative_stock: Package,
  high_return_rate: TrendingDown,
  unpaid_salaries: DollarSign,
  zero_revenue_active: AlertCircle,
  consignment_expired_high: Archive,
  no_products: Package,
  single_user_bar: Users,
  sync_queue_blocked: AlertTriangle,
  data_corruption: Database,
  localstorage_full: Database,
  large_sale_anomaly: AlertTriangle,
  high_performer: TrendingUp,
  ready_for_billing: DollarSign,
  new_bar_success: Sparkles,
};

// Couleurs par priorité
const priorityColors: Record<NotificationPriority, string> = {
  high: 'from-red-50 to-amber-50 border-red-300',
  medium: 'from-yellow-50 to-amber-50 border-yellow-300',
  info: 'from-blue-50 to-indigo-50 border-blue-300',
};

const priorityIcons: Record<NotificationPriority, string> = {
  high: '🔴',
  medium: '🟠',
  info: '🔵',
};

export default function AdminNotificationsPage() {
  const { impersonate } = useAuth();
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'info'>('all');

  const {
    notifications,
    markAsRead,
    markAllAsRead,
    markAsResolved,
    deleteNotification,
    clearAll,
  } = useAdminNotifications();

  // Filtrer notifications
  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.priority === filter);

  // Gérer actions
  const handleAction = (notification: AdminNotification, actionId: string) => {
    switch (actionId) {
      case 'impersonate':
        // Trouver promoteur du bar pour impersonate
        const membersData = localStorage.getItem('barMembers');
        if (membersData) {
          const allMembers = JSON.parse(membersData);
          const promoteurMember = allMembers.find((m: any) =>
            m.barId === notification.barId && m.role === 'promoteur'
          );
          if (promoteurMember) {
            impersonate(promoteurMember.userId, notification.barId, 'promoteur');
          }
        }
        break;

      case 'view_stats':
        alert(`Voir stats de ${notification.barName}`);
        break;

      case 'fix_stock':
        handleAction(notification, 'impersonate');
        break;

      case 'contact_promoter':
        alert(`Contacter promoteur de ${notification.barName}`);
        break;

      default:
        console.log(`Action non gérée: ${actionId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <AdminPanelErrorBoundary fallbackTitle="Erreur dans la gestion des notifications">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 md:p-6 text-white rounded-t-2xl">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-8 h-8" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Notifications Admin</h1>
              <p className="text-purple-100 text-sm">
                {notifications.length} notification{notifications.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Filtres priorité */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-all ${
                filter === 'all'
                  ? 'bg-white text-purple-700'
                  : 'bg-purple-500/30 hover:bg-purple-500/50'
              }`}
            >
              Toutes ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('high')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-all ${
                filter === 'high'
                  ? 'bg-white text-red-700'
                  : 'bg-purple-500/30 hover:bg-purple-500/50'
              }`}
            >
              🔴 Urgentes ({notifications.filter(n => n.priority === 'high').length})
            </button>
            <button
              onClick={() => setFilter('medium')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-all ${
                filter === 'medium'
                  ? 'bg-white text-amber-700'
                  : 'bg-purple-500/30 hover:bg-purple-500/50'
              }`}
            >
              🟠 Importantes ({notifications.filter(n => n.priority === 'medium').length})
            </button>
          </div>
        </div>

        {/* Actions globales */}
        {notifications.length > 0 && (
          <div className="bg-gray-50 p-3 border-b border-gray-200 flex gap-2 flex-wrap">
            <button
              onClick={markAllAsRead}
              className="flex-1 md:flex-none px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-semibold text-sm hover:bg-blue-200 transition-colors"
            >
              Tout marquer lu
            </button>
            <button
              onClick={() => {
                if (confirm('Effacer toutes les notifications ?')) {
                  clearAll();
                }
              }}
              className="flex-1 md:flex-none px-3 py-2 bg-red-100 text-red-700 rounded-lg font-semibold text-sm hover:bg-red-200 transition-colors"
            >
              Tout effacer
            </button>
          </div>
        )}

        {/* Liste notifications */}
        <div className="bg-gray-50 rounded-b-2xl p-4 space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-semibold">Aucune notification</p>
              <p className="text-sm">Tout va bien ! 🎉</p>
            </div>
          ) : (
            filteredNotifications.map(notification => {
              const Icon = notificationIcons[notification.type] || AlertCircle;
              const gradientClass = priorityColors[notification.priority];

              return (
                <div
                  key={notification.id}
                  className={`bg-gradient-to-r ${gradientClass} rounded-lg p-4 border-2 ${
                    notification.isRead ? 'opacity-60' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-gray-700 flex-shrink-0" />
                      <div>
                        <h2 className="font-bold text-gray-900 text-sm">
                          {priorityIcons[notification.priority]} {notification.title}
                        </h2>
                        <p className="text-xs text-gray-600">{notification.barName}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="text-gray-600 hover:text-gray-600 p-1"
                    >
                      <AlertCircle className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-gray-800 mb-3">{notification.message}</p>

                  {/* Metadata (si présent) */}
                  {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                    <div className="bg-white/60 rounded p-2 mb-3 text-xs space-y-1">
                      {Object.entries(notification.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 font-medium">{key}:</span>
                          <span className="text-gray-900 font-semibold">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {notification.actions?.includes('impersonate') && (
                      <button
                        onClick={() => handleAction(notification, 'impersonate')}
                        className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold text-xs hover:bg-amber-200 flex items-center gap-1"
                      >
                        <UserCog className="w-3.5 h-3.5" />
                        Impersonate
                      </button>
                    )}
                    {notification.actions?.includes('view_stats') && (
                      <button
                        onClick={() => handleAction(notification, 'view_stats')}
                        className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg font-semibold text-xs hover:bg-purple-200 flex items-center gap-1"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Stats
                      </button>
                    )}
                    {!notification.isRead && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-semibold text-xs hover:bg-blue-200"
                      >
                        Marquer lu
                      </button>
                    )}
                    {!notification.isResolved && (
                      <button
                        onClick={() => markAsResolved(notification.id)}
                        className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-semibold text-xs hover:bg-green-200 flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Résolu
                      </button>
                    )}
                  </div>

                  {/* Timestamp */}
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(notification.timestamp).toLocaleString('fr-FR')}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </AdminPanelErrorBoundary>
    </div>
  );
}
