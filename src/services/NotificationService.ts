// services/NotificationService.ts - Service de notifications admin intelligentes
import { AdminNotification, NotificationType, NotificationPriority } from '../types';
import { auditLogger } from './AuditLogger';

const NOTIFICATIONS_KEY_PREFIX = 'admin_notifications_';
const MAX_NOTIFICATIONS = 200;
const NOTIFICATION_RETENTION_DAYS = 30;

interface CreateNotificationParams {
  type: NotificationType;
  priority: NotificationPriority;
  barId: string;
  barName: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  actions?: string[];
}

class NotificationServiceClass {
  private notifications: AdminNotification[] = [];
  private listeners: Array<() => void> = [];
  private currentUserId: string | null = null;

  constructor() {
    // Initial load will be done when user identity is set
  }

  // Initialiser le service pour l'utilisateur courant
  initForUser(userId: string): void {
    if (this.currentUserId === userId) return;

    this.currentUserId = userId;
    this.loadNotifications();
    this.cleanupOldNotifications();
  }

  // Nettoyer service (logout)
  clearSession(): void {
    this.currentUserId = null;
    this.notifications = [];
    this.notifyListeners();
  }

  private getStorageKey(): string | null {
    if (!this.currentUserId) return null;
    return `${NOTIFICATIONS_KEY_PREFIX}${this.currentUserId}`;
  }

  // Charger notifications depuis localStorage
  private loadNotifications(): void {
    try {
      const key = this.getStorageKey();
      if (!key) return;

      const stored = localStorage.getItem(key);
      if (stored) {
        this.notifications = JSON.parse(stored).map((notif: any) => ({
          ...notif,
          timestamp: new Date(notif.timestamp),
        }));
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      this.notifications = [];
    }
  }

  // Sauvegarder notifications
  private saveNotifications(): void {
    try {
      const key = this.getStorageKey();
      if (!key) return;

      localStorage.setItem(key, JSON.stringify(this.notifications));
      this.notifyListeners();
    } catch (error) {
      console.error('Error saving notifications:', error);

      // Si quota dépassé, supprimer anciennes
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.pruneOldNotifications(100);
        try {
          const key = this.getStorageKey();
          if (key) localStorage.setItem(key, JSON.stringify(this.notifications));
        } catch (retryError) {
          console.error('Failed to save even after pruning:', retryError);
        }
      }
    }
  }

  // Nettoyer notifications anciennes
  private cleanupOldNotifications(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - NOTIFICATION_RETENTION_DAYS);

    const initialCount = this.notifications.length;
    this.notifications = this.notifications.filter(
      notif => notif.timestamp >= cutoffDate
    );

    if (this.notifications.length < initialCount) {
      console.log(
        `Cleaned up ${initialCount - this.notifications.length} old notifications (older than ${NOTIFICATION_RETENTION_DAYS} days)`
      );
      this.saveNotifications();
    }
  }

  // Supprimer anciennes notifications
  private pruneOldNotifications(keepCount: number): void {
    if (this.notifications.length > keepCount) {
      this.notifications = this.notifications
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, keepCount);
      console.log(`Pruned notifications to ${keepCount} most recent`);
    }
  }

  // S'abonner aux changements (pour React components)
  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Notifier les listeners
  private notifyListeners(): void {
    this.listeners.forEach(callback => callback());
  }

  // Créer une notification
  create(params: CreateNotificationParams): AdminNotification {
    // Vérifier si notification similaire existe déjà (éviter doublons)
    const existingSimilar = this.notifications.find(
      notif =>
        notif.type === params.type &&
        notif.barId === params.barId &&
        !notif.isResolved &&
        Math.abs(notif.timestamp.getTime() - Date.now()) < 3600000 // 1 heure
    );

    if (existingSimilar) {
      console.log(`Notification similaire déjà existante (${params.type} pour ${params.barName}), skip création`);
      return existingSimilar;
    }

    const notification: AdminNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
      isRead: false,
      isResolved: false,
      ...params,
    };

    this.notifications.push(notification);

    // Limiter taille
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.pruneOldNotifications(MAX_NOTIFICATIONS - 20);
    }

    this.saveNotifications();

    // Log dans audit trail
    auditLogger.log({
      event: 'SETTINGS_UPDATED', // Pas d'event spécifique, on emprunte
      severity: params.priority === 'high' ? 'critical' : 'info',
      userId: 'system',
      userName: 'System',
      userRole: 'super_admin',
      barId: params.barId,
      barName: params.barName,
      description: `Notification créée: ${params.title}`,
      metadata: { notificationType: params.type },
    });

    console.log(`[NOTIFICATION CREATED] ${params.type} - ${params.title}`);

    return notification;
  }

  // Récupérer toutes les notifications
  getAll(): AdminNotification[] {
    return [...this.notifications].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  // Récupérer notifications non lues
  getUnread(): AdminNotification[] {
    return this.getAll().filter(notif => !notif.isRead);
  }

  // Récupérer notifications non résolues
  getUnresolved(): AdminNotification[] {
    return this.getAll().filter(notif => !notif.isResolved);
  }

  // Compter non lues
  getUnreadCount(): number {
    return this.notifications.filter(notif => !notif.isRead).length;
  }

  // Marquer comme lue
  markAsRead(notificationId: string): void {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.isRead = true;
      this.saveNotifications();
    }
  }

  // Marquer toutes comme lues
  markAllAsRead(): void {
    this.notifications.forEach(notif => {
      notif.isRead = true;
    });
    this.saveNotifications();
  }

  // Marquer comme résolue
  markAsResolved(notificationId: string): void {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.isResolved = true;
      notif.isRead = true;
      this.saveNotifications();
    }
  }

  // Supprimer une notification
  delete(notificationId: string): void {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.saveNotifications();
  }

  // Supprimer toutes les notifications
  deleteAll(): void {
    this.notifications = [];
    const key = this.getStorageKey();
    if (key) localStorage.removeItem(key);
    this.notifyListeners();
    console.warn('[NOTIFICATION] All notifications deleted');
  }

  // Récupérer notifications pour un bar
  getByBar(barId: string): AdminNotification[] {
    return this.getAll().filter(notif => notif.barId === barId);
  }

  // Récupérer notifications par priorité
  getByPriority(priority: NotificationPriority): AdminNotification[] {
    return this.getAll().filter(notif => notif.priority === priority);
  }

  // Stats
  getStats(): {
    total: number;
    unread: number;
    unresolved: number;
    byPriority: Record<NotificationPriority, number>;
    byType: Record<string, number>;
  } {
    const byPriority: Record<NotificationPriority, number> = {
      high: 0,
      medium: 0,
      info: 0,
    };

    const byType: Record<string, number> = {};

    this.notifications.forEach(notif => {
      byPriority[notif.priority]++;
      byType[notif.type] = (byType[notif.type] || 0) + 1;
    });

    return {
      total: this.notifications.length,
      unread: this.getUnreadCount(),
      unresolved: this.getUnresolved().length,
      byPriority,
      byType,
    };
  }
}

// Singleton instance
export const notificationService = new NotificationServiceClass();
