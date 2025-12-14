import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
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
} from 'lucide-react';
import type { AdminNotification, NotificationPriority } from '../types';
import { useAuth } from '../context/AuthContext';

interface AdminNotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AdminNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onMarkAsResolved: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

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

export default function AdminNotificationsPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onMarkAsResolved,
  onDelete,
  onClearAll,
}: AdminNotificationsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'info'>('all');

  // Filtrer notifications
  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.priority === filter);

  // Gérer actions
  const handleAction = (notification: AdminNotification, actionId: string) => {
    switch (actionId) {
      case 'view_stats':
        // TODO: Ouvrir modal stats du bar
        alert(`Voir stats de ${notification.barName}`);
        break;

      case 'contact_promoter':
        alert(`Contacter promoteur de ${notification.barName}`);
        break;

      default:
        console.log(`Action non gérée: ${actionId}`);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="fixed right-0 top-0 bottom-0 w-full md:w-[600px] bg-white shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Notifications Admin</h2>
                <p className="text-purple-100 text-sm">
                  {notifications.length} notification{notifications.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Filtres priorité */}
            <div className="flex gap-2">
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
            <div className="bg-gray-50 p-3 border-b border-gray-200 flex gap-2">
              <button
                onClick={onMarkAllAsRead}
                className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-semibold text-sm hover:bg-blue-200 transition-colors"
              >
                Tout marquer lu
              </button>
              <button
                onClick={() => {
                  if (confirm('Effacer toutes les notifications ?')) {
                    onClearAll();
                  }
                }}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg font-semibold text-sm hover:bg-red-200 transition-colors"
              >
                Tout effacer
              </button>
            </div>
          )}

          {/* Liste notifications */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    className={`bg-gradient-to-r ${gradientClass} rounded-lg p-4 border-2 ${
                      notification.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-gray-700 flex-shrink-0" />
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm">
                            {priorityIcons[notification.priority]} {notification.title}
                          </h3>
                          <p className="text-xs text-gray-600">{notification.barName}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => onDelete(notification.id)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        <X className="w-4 h-4" />
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
                          onClick={() => onMarkAsRead(notification.id)}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-semibold text-xs hover:bg-blue-200"
                        >
                          Marquer lu
                        </button>
                      )}
                      {!notification.isResolved && (
                        <button
                          onClick={() => onMarkAsResolved(notification.id)}
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
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
