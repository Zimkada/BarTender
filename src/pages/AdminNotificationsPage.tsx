// src/pages/AdminNotificationsPage.tsx
import AdminNotificationsPanel from '../components/AdminNotificationsPanel'; // Corrected to default import
import { useAdminNotifications } from '../hooks/useAdminNotifications';

/**
 * Page Notifications Admin - Wrapper pour le composant AdminNotificationsPanel
 * Route: /admin/notifications
 * 
 * Cette page utilise le hook useAdminNotifications pour fournir
 * les données et fonctions nécessaires au panel
 */
export default function AdminNotificationsPage() {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    markAsResolved,
    deleteNotification,
    clearAll,
  } = useAdminNotifications();

  return (
    <AdminNotificationsPanel
      isOpen={true}
      onClose={() => window.history.back()}
      notifications={notifications}
      onMarkAsRead={markAsRead}
      onMarkAllAsRead={markAllAsRead}
      onMarkAsResolved={markAsResolved}
      onDelete={deleteNotification}
      onClearAll={clearAll}
    />
  );
}
