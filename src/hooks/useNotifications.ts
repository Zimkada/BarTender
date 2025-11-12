// hooks/useNotifications.ts - Hook React pour utiliser le NotificationService
import { useState, useEffect } from 'react';
import { AdminNotification, NotificationPriority } from '../types';
import { notificationService } from '../services/NotificationService';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Charger et s'abonner aux changements
  useEffect(() => {
    // Charger initial
    const loadNotifications = () => {
      setNotifications(notificationService.getAll());
      setUnreadCount(notificationService.getUnreadCount());
    };

    loadNotifications();

    // S'abonner aux mises à jour
    const unsubscribe = notificationService.subscribe(loadNotifications);

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    // State
    notifications,
    unreadCount,

    // Getters
    getUnread: () => notificationService.getUnread(),
    getUnresolved: () => notificationService.getUnresolved(),
    getByBar: (barId: string) => notificationService.getByBar(barId),
    getByPriority: (priority: NotificationPriority) => notificationService.getByPriority(priority),
    getStats: () => notificationService.getStats(),

    // Actions
    markAsRead: (notificationId: string) => notificationService.markAsRead(notificationId),
    markAllAsRead: () => notificationService.markAllAsRead(),
    markAsResolved: (notificationId: string) => notificationService.markAsResolved(notificationId),
    deleteNotification: (notificationId: string) => notificationService.delete(notificationId),
    deleteAll: () => notificationService.deleteAll(),
  };
}
