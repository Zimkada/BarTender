// services/AuditLogger.ts - Service de logging et audit trail
import { AuditLog, AuditLogEvent, AuditLogSeverity, UserRole } from '../types';

const AUDIT_LOGS_KEY = 'audit_logs';
const MAX_LOGS_STORAGE = 5000; // Limite pour éviter localStorage plein
const LOG_RETENTION_DAYS = 90; // Garder logs 90 jours

interface LogParams {
  event: AuditLogEvent;
  severity?: AuditLogSeverity;
  userId: string;
  userName: string;
  userRole: UserRole;
  barId?: string;
  barName?: string;
  description: string;
  metadata?: Record<string, any>;
  relatedEntityId?: string;
  relatedEntityType?: 'bar' | 'user' | 'product' | 'sale' | 'expense';
}

class AuditLoggerService {
  private logs: AuditLog[] = [];

  constructor() {
    this.loadLogs();
    this.cleanupOldLogs();
  }

  // Charger logs depuis localStorage
  private loadLogs(): void {
    try {
      const stored = localStorage.getItem(AUDIT_LOGS_KEY);
      if (stored) {
        this.logs = JSON.parse(stored).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        }));
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);
      this.logs = [];
    }
  }

  // Sauvegarder logs dans localStorage
  private saveLogs(): void {
    try {
      localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('Error saving audit logs:', error);

      // Si quota dépassé, supprimer anciens logs
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.pruneOldLogs(1000); // Garder seulement 1000 derniers
        try {
          localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(this.logs));
        } catch (retryError) {
          console.error('Failed to save even after pruning:', retryError);
        }
      }
    }
  }

  // Nettoyer logs anciens (>90 jours)
  private cleanupOldLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

    const initialCount = this.logs.length;
    this.logs = this.logs.filter(log => log.timestamp >= cutoffDate);

    if (this.logs.length < initialCount) {
      console.log(`Cleaned up ${initialCount - this.logs.length} old audit logs (older than ${LOG_RETENTION_DAYS} days)`);
      this.saveLogs();
    }
  }

  // Supprimer anciens logs si dépassement limite
  private pruneOldLogs(keepCount: number): void {
    if (this.logs.length > keepCount) {
      // Garder les plus récents
      this.logs = this.logs
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, keepCount);
      console.log(`Pruned audit logs to ${keepCount} most recent entries`);
    }
  }

  // Logger un événement
  log(params: LogParams): void {
    const log: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
      event: params.event,
      severity: params.severity || this.getDefaultSeverity(params.event),
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      barId: params.barId,
      barName: params.barName,
      description: params.description,
      metadata: params.metadata,
      relatedEntityId: params.relatedEntityId,
      relatedEntityType: params.relatedEntityType,
      ipAddress: undefined, // Future: récupérer IP si possible
      userAgent: navigator.userAgent,
    };

    this.logs.push(log);

    // Limiter taille si dépassement
    if (this.logs.length > MAX_LOGS_STORAGE) {
      this.pruneOldLogs(MAX_LOGS_STORAGE - 100); // Garder marge
    }

    this.saveLogs();

    // Log console en dev
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT LOG] ${params.event}:`, log);
    }
  }

  // Déterminer severity par défaut selon l'event
  private getDefaultSeverity(event: AuditLogEvent): AuditLogSeverity {
    const criticalEvents: AuditLogEvent[] = [
      'BAR_DELETED',
      'USER_DELETED',
      'PRODUCTS_BULK_DELETED',
      'DATA_EXPORTED',
      'PASSWORD_RESET',
      'SYNC_FAILED',
    ];

    const warningEvents: AuditLogEvent[] = [
      'LOGIN_FAILED',
      'BAR_SUSPENDED',
      'USER_SUSPENDED',
      'PRODUCT_DELETED',
      'SALE_DELETED',
      'EXPENSE_DELETED',
    ];

    if (criticalEvents.includes(event)) return 'critical';
    if (warningEvents.includes(event)) return 'warning';
    return 'info';
  }

  // Récupérer tous les logs
  getAllLogs(): AuditLog[] {
    return [...this.logs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Récupérer logs filtrés
  getFilteredLogs(filters: {
    event?: AuditLogEvent;
    severity?: AuditLogSeverity;
    userId?: string;
    barId?: string;
    startDate?: Date;
    endDate?: Date;
  }): AuditLog[] {
    let filtered = this.getAllLogs();

    if (filters.event) {
      filtered = filtered.filter(log => log.event === filters.event);
    }

    if (filters.severity) {
      filtered = filtered.filter(log => log.severity === filters.severity);
    }

    if (filters.userId) {
      filtered = filtered.filter(log => log.userId === filters.userId);
    }

    if (filters.barId) {
      filtered = filtered.filter(log => log.barId === filters.barId);
    }

    if (filters.startDate) {
      filtered = filtered.filter(log => log.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      filtered = filtered.filter(log => log.timestamp <= filters.endDate!);
    }

    return filtered;
  }

  // Récupérer logs pour un bar spécifique
  getBarLogs(barId: string, limit?: number): AuditLog[] {
    const barLogs = this.logs
      .filter(log => log.barId === barId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return limit ? barLogs.slice(0, limit) : barLogs;
  }

  // Récupérer logs pour un utilisateur
  getUserLogs(userId: string, limit?: number): AuditLog[] {
    const userLogs = this.logs
      .filter(log => log.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return limit ? userLogs.slice(0, limit) : userLogs;
  }

  // Compter échecs login récents pour un user (détection brute force)
  getRecentLoginFailures(userId: string, minutes: number = 30): number {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutes);

    return this.logs.filter(
      log =>
        log.event === 'LOGIN_FAILED' &&
        log.userId === userId &&
        log.timestamp >= cutoffTime
    ).length;
  }

  // Compter actions d'un type dans une période (détection anomalies)
  countEventInPeriod(
    event: AuditLogEvent,
    userId: string,
    minutes: number = 10
  ): number {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutes);

    return this.logs.filter(
      log =>
        log.event === event &&
        log.userId === userId &&
        log.timestamp >= cutoffTime
    ).length;
  }

  // Export logs (pour backup ou debug)
  exportLogs(filters?: {
    startDate?: Date;
    endDate?: Date;
    barId?: string;
  }): string {
    const logsToExport = filters ? this.getFilteredLogs(filters) : this.getAllLogs();

    const exportData = {
      exportDate: new Date().toISOString(),
      totalLogs: logsToExport.length,
      filters,
      logs: logsToExport,
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Supprimer tous les logs (DANGEREUX - admin only)
  clearAllLogs(): void {
    this.logs = [];
    localStorage.removeItem(AUDIT_LOGS_KEY);
    console.warn('[AUDIT] All logs cleared');
  }

  // Stats globales
  getStats(): {
    totalLogs: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    oldestLog?: Date;
    newestLog?: Date;
    topEvents: Array<{ event: AuditLogEvent; count: number }>;
  } {
    const criticalCount = this.logs.filter(l => l.severity === 'critical').length;
    const warningCount = this.logs.filter(l => l.severity === 'warning').length;
    const infoCount = this.logs.filter(l => l.severity === 'info').length;

    const sortedByDate = [...this.logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const oldestLog = sortedByDate[0]?.timestamp;
    const newestLog = sortedByDate[sortedByDate.length - 1]?.timestamp;

    // Compter événements les plus fréquents
    const eventCounts: Record<string, number> = {};
    this.logs.forEach(log => {
      eventCounts[log.event] = (eventCounts[log.event] || 0) + 1;
    });

    const topEvents = Object.entries(eventCounts)
      .map(([event, count]) => ({ event: event as AuditLogEvent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalLogs: this.logs.length,
      criticalCount,
      warningCount,
      infoCount,
      oldestLog,
      newestLog,
      topEvents,
    };
  }
}

// Singleton instance
export const auditLogger = new AuditLoggerService();
