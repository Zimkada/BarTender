import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type {
  AdminNotification,
  NotificationType,
  NotificationPriority,
  Bar,
  Product,
  Sale,
  Return,
  Consignment,
  BarMember,
} from '../types';

/**
 * Hook pour gérer les notifications admin (Super Admin Dashboard)
 * Détecte les problèmes métier et techniques pour tous les bars
 */
export function useAdminNotifications() {
  const [notifications, setNotifications] = useLocalStorage<AdminNotification[]>(
    'admin_notifications_v1',
    []
  );

  /**
   * Créer une nouvelle notification (helper interne)
   */
  const createNotification = useCallback((params: {
    type: NotificationType;
    priority: NotificationPriority;
    barId: string;
    barName: string;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    actions?: string[];
  }): AdminNotification => {
    return {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: params.type,
      priority: params.priority,
      barId: params.barId,
      barName: params.barName,
      title: params.title,
      message: params.message,
      timestamp: new Date(),
      isRead: false,
      isResolved: false,
      metadata: params.metadata,
      actions: params.actions,
    };
  }, []);

  /**
   * 1. Vérifier stock négatif (CRITIQUE)
   */
  const checkNegativeStock = useCallback((bar: Bar, products: Product[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    products.forEach(product => {
      if (product.stock < 0) {
        alerts.push(createNotification({
          type: 'negative_stock',
          priority: 'high',
          barId: bar.id,
          barName: bar.name,
          title: 'STOCK NÉGATIF DÉTECTÉ',
          message: `${product.name}: ${product.stock} unités`,
          metadata: {
            productId: product.id,
            productName: product.name,
            currentStock: product.stock,
          },
          actions: ['fix_stock', 'view_stats', 'impersonate'],
        }));
      }
    });

    return alerts;
  }, [createNotification]);

  /**
   * 2. Vérifier taux de retours élevé
   */
  const checkHighReturnRate = useCallback((bar: Bar, sales: Sale[], returns: Return[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    // Calcul sur les 7 derniers jours
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSales = sales.filter(s => new Date(s.date) >= sevenDaysAgo);
    const recentReturns = returns.filter(r =>
      r.status !== 'rejected' &&
      new Date(r.returnedAt) >= sevenDaysAgo
    );

    if (recentSales.length > 0) {
      const returnRate = (recentReturns.length / recentSales.length) * 100;

      if (returnRate > 15) {
        alerts.push(createNotification({
          type: 'high_return_rate',
          priority: 'high',
          barId: bar.id,
          barName: bar.name,
          title: 'TAUX DE RETOURS ÉLEVÉ',
          message: `${returnRate.toFixed(1)}% des ventes retournées (7 derniers jours)`,
          metadata: {
            returnRate,
            totalSales: recentSales.length,
            totalReturns: recentReturns.length,
          },
          actions: ['view_stats', 'impersonate'],
        }));
      }
    }

    return alerts;
  }, [createNotification]);

  /**
   * 3. Vérifier bar sans produits (onboarding incomplet)
   */
  const checkNoProducts = useCallback((bar: Bar, products: Product[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    const daysSinceCreation = Math.floor(
      (new Date().getTime() - new Date(bar.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (products.length === 0 && daysSinceCreation > 1) {
      alerts.push(createNotification({
        type: 'no_products',
        priority: 'high',
        barId: bar.id,
        barName: bar.name,
        title: 'BAR SANS PRODUITS',
        message: `Créé il y a ${daysSinceCreation}j mais aucun produit`,
        metadata: {
          daysSinceCreation,
        },
        actions: ['impersonate', 'contact_promoter'],
      }));
    }

    return alerts;
  }, [createNotification]);

  /**
   * 4. Vérifier bar avec CA 0 depuis 7 jours (mais actif)
   */
  const checkZeroRevenue = useCallback((bar: Bar, sales: Sale[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    if (!bar.isActive) return alerts;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSales = sales.filter(s => new Date(s.date) >= sevenDaysAgo);

    if (recentSales.length === 0) {
      alerts.push(createNotification({
        type: 'zero_revenue_active',
        priority: 'medium',
        barId: bar.id,
        barName: bar.name,
        title: 'BAR INACTIF',
        message: `Aucune vente depuis 7 jours (bar actif)`,
        metadata: {
          daysSinceLastSale: 7,
        },
        actions: ['view_stats', 'impersonate', 'contact_promoter'],
      }));
    }

    return alerts;
  }, [createNotification]);

  /**
   * 5. Vérifier consignations expirées élevées
   */
  const checkExpiredConsignments = useCallback((bar: Bar, consignments: Consignment[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    const expired = consignments.filter(c => c.status === 'expired');

    if (expired.length > 20) {
      alerts.push(createNotification({
        type: 'consignment_expired_high',
        priority: 'medium',
        barId: bar.id,
        barName: bar.name,
        title: 'CONSIGNATIONS EXPIRÉES ÉLEVÉES',
        message: `${expired.length} consignations expirées`,
        metadata: {
          expiredCount: expired.length,
        },
        actions: ['view_stats', 'impersonate'],
      }));
    }

    return alerts;
  }, [createNotification]);

  /**
   * 6. Vérifier bar avec un seul membre
   */
  const checkSingleUserBar = useCallback((bar: Bar, members: BarMember[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    const activeMembers = members.filter(m => m.isActive);

    if (activeMembers.length === 1) {
      const daysSinceCreation = Math.floor(
        (new Date().getTime() - new Date(bar.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Alerte seulement si > 7 jours
      if (daysSinceCreation > 7) {
        alerts.push(createNotification({
          type: 'single_user_bar',
          priority: 'info',
          barId: bar.id,
          barName: bar.name,
          title: 'BAR AVEC 1 SEUL MEMBRE',
          message: `Encourager ajout d'équipe (créé il y a ${daysSinceCreation}j)`,
          metadata: {
            daysSinceCreation,
            membersCount: 1,
          },
          actions: ['impersonate', 'contact_promoter'],
        }));
      }
    }

    return alerts;
  }, [createNotification]);

  /**
   * 7. Vérifier incohérence données (corruption)
   */
  const checkDataIntegrity = useCallback((bar: Bar, sales: Sale[], products: Product[]): AdminNotification[] => {
    const alerts: AdminNotification[] = [];

    sales.forEach(sale => {
      // Vérifier que total sale = sum(items)
      const itemsTotal = sale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const diff = Math.abs(sale.total - itemsTotal);

      if (diff > 1) { // Tolérance 1 FCFA
        alerts.push(createNotification({
          type: 'data_corruption',
          priority: 'high',
          barId: bar.id,
          barName: bar.name,
          title: 'DONNÉES INCOHÉRENTES',
          message: `Vente ${sale.id}: Total ne correspond pas (${diff} FCFA écart)`,
          metadata: {
            saleId: sale.id,
            declaredTotal: sale.total,
            calculatedTotal: itemsTotal,
            diff,
          },
          actions: ['view_stats', 'impersonate'],
        }));
      }

      // Vérifier produits existent
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) {
          alerts.push(createNotification({
            type: 'data_corruption',
            priority: 'high',
            barId: bar.id,
            barName: bar.name,
            title: 'PRODUIT MANQUANT',
            message: `Vente ${sale.id} référence produit inexistant: ${item.productId}`,
            metadata: {
              saleId: sale.id,
              productId: item.productId,
            },
            actions: ['impersonate'],
          }));
        }
      });
    });

    return alerts;
  }, [createNotification]);

  /**
   * Analyser tous les bars et générer notifications
   */
  const analyzeAllBars = useCallback((bars: Bar[]) => {
    const newNotifications: AdminNotification[] = [];

    bars.forEach(bar => {
      try {
        // Récupérer données du bar depuis localStorage
        const productsKey = `products_${bar.id}`;
        const salesKey = `sales_${bar.id}`;
        const returnsKey = `returns_${bar.id}`;
        const consignmentsKey = `consignments-v1`;
        const membersKey = `barMembers`;

        const productsData = localStorage.getItem(productsKey);
        const products: Product[] = productsData ? JSON.parse(productsData) : [];

        const salesData = localStorage.getItem(salesKey);
        const sales: Sale[] = salesData ? JSON.parse(salesData) : [];

        const returnsData = localStorage.getItem(returnsKey);
        const returns: Return[] = returnsData ? JSON.parse(returnsData) : [];

        const consignmentsData = localStorage.getItem(consignmentsKey);
        const allConsignments: Consignment[] = consignmentsData ? JSON.parse(consignmentsData) : [];
        const barConsignments = allConsignments.filter(c => c.barId === bar.id);

        const membersData = localStorage.getItem(membersKey);
        const allMembers: BarMember[] = membersData ? JSON.parse(membersData) : [];
        const barMembers = allMembers.filter(m => m.barId === bar.id);

        // Exécuter toutes les vérifications
        newNotifications.push(...checkNegativeStock(bar, products));
        newNotifications.push(...checkHighReturnRate(bar, sales, returns));
        newNotifications.push(...checkNoProducts(bar, products));
        newNotifications.push(...checkZeroRevenue(bar, sales));
        newNotifications.push(...checkExpiredConsignments(bar, barConsignments));
        newNotifications.push(...checkSingleUserBar(bar, barMembers));
        newNotifications.push(...checkDataIntegrity(bar, sales, products));
      } catch (error) {
        console.error(`[useAdminNotifications] Error analyzing bar ${bar.id}:`, error);
      }
    });

    // Fusionner avec notifications existantes (éviter doublons)
    const merged = mergeNotifications(notifications, newNotifications);
    setNotifications(merged);
  }, [notifications, checkNegativeStock, checkHighReturnRate, checkNoProducts, checkZeroRevenue, checkExpiredConsignments, checkSingleUserBar, checkDataIntegrity]);

  /**
   * Fusionner notifications (éviter doublons basés sur type + barId)
   */
  const mergeNotifications = (
    existing: AdminNotification[],
    newOnes: AdminNotification[]
  ): AdminNotification[] => {
    const map = new Map<string, AdminNotification>();

    // Ajouter existantes (non résolues)
    existing.filter(n => !n.isResolved).forEach(n => {
      const key = `${n.type}_${n.barId}`;
      map.set(key, n);
    });

    // Remplacer/Ajouter nouvelles
    newOnes.forEach(n => {
      const key = `${n.type}_${n.barId}`;
      map.set(key, n);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  /**
   * Marquer notification comme lue
   */
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
  }, [setNotifications]);

  /**
   * Marquer toutes comme lues
   */
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, [setNotifications]);

  /**
   * Marquer notification comme résolue
   */
  const markAsResolved = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isResolved: true, isRead: true } : n))
    );
  }, [setNotifications]);

  /**
   * Supprimer notification
   */
  const deleteNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, [setNotifications]);

  /**
   * Effacer toutes les notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, [setNotifications]);

  // Statistiques calculées
  const stats = useMemo(() => {
    const unread = notifications.filter(n => !n.isRead && !n.isResolved);
    const urgent = notifications.filter(n => n.priority === 'high' && !n.isResolved);
    const unresolved = notifications.filter(n => !n.isResolved);

    return {
      total: notifications.length,
      unreadCount: unread.length,
      urgentCount: urgent.length,
      unresolvedCount: unresolved.length,
      byPriority: {
        high: notifications.filter(n => n.priority === 'high' && !n.isResolved).length,
        medium: notifications.filter(n => n.priority === 'medium' && !n.isResolved).length,
        info: notifications.filter(n => n.priority === 'info' && !n.isResolved).length,
      },
    };
  }, [notifications]);

  return {
    notifications,
    unreadNotifications: notifications.filter(n => !n.isRead && !n.isResolved),
    urgentNotifications: notifications.filter(n => n.priority === 'high' && !n.isResolved),
    unresolvedNotifications: notifications.filter(n => !n.isResolved),
    stats,
    analyzeAllBars,
    markAsRead,
    markAllAsRead,
    markAsResolved,
    deleteNotification,
    clearAll,
  };
}
