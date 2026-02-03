// services/AuditLogger.ts - Service de logging et audit trail (Connected to Supabase)
import { AuditLog, AuditLogEvent, AuditLogSeverity, UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface LogParams {
  event: AuditLogEvent;
  severity?: AuditLogSeverity;
  userId?: string; // Optional: RPC resolves it from auth.uid()
  userName?: string; // Optional: RPC resolves it
  userRole?: UserRole; // Optional: RPC resolves it
  barId?: string;
  barName?: string;
  description: string;
  metadata?: Record<string, any>;
  relatedEntityId?: string;
  relatedEntityType?: 'bar' | 'user' | 'product' | 'sale' | 'expense';
}

class AuditLoggerService {
  // Logger un événement directement vers Supabase via RPC
  async log(params: LogParams): Promise<void> {
    try {
      // En dev, on logue aussi dans la console pour debug
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AUDIT LOG] Sending to DB: ${params.event}`, params);
      }

      const { error } = await supabase.rpc('log_audit_event', {
        p_event: params.event,
        p_severity: params.severity || this.getDefaultSeverity(params.event),
        p_bar_id: params.barId || null,
        p_description: params.description,
        p_metadata: params.metadata || {},
        p_related_entity_id: params.relatedEntityId || null,
        p_related_entity_type: params.relatedEntityType || null
      });

      if (error) {
        console.error('[AUDIT LOGGER] Failed to send log to Supabase:', error);
        // Fallback: Could store in localStorage for retry, but keeping it simple for now
      }
    } catch (err) {
      console.error('[AUDIT LOGGER] Unexpected error:', err);
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
      'SALE_CANCELLED', // Critical for fraud prevention
    ];

    const warningEvents: AuditLogEvent[] = [
      'LOGIN_FAILED',
      'BAR_SUSPENDED',
      'USER_SUSPENDED',
      'PRODUCT_DELETED',
      'SALE_DELETED',
      'EXPENSE_DELETED',
      'STOCK_ADJUSTED', // Warning to track anomalies
    ];

    if (criticalEvents.includes(event)) return 'critical';
    if (warningEvents.includes(event)) return 'warning';
    return 'info';
  }
}

// Singleton instance
export const auditLogger = new AuditLoggerService();
