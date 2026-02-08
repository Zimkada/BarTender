// src/services/supabase/security.service.ts
import { supabase, handleSupabaseError } from '../../lib/supabase';

// =====================================================
// TYPES - RLS VIOLATIONS
// =====================================================

export interface RLSViolation {
  id: string;
  user_id: string | null;
  table_name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  attempted_bar_id: string | null;
  user_bar_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  created_at: string;
}

export interface BarHealthStatus {
  bar_id: string;
  bar_name: string;
  device_id: string;
  app_version: string;
  last_heartbeat_at: string | null;
  unsynced_count: number;
  battery_level: number | null;
  status: 'online' | 'warning' | 'offline';
  minutes_since_heartbeat: number;
}

export interface SecurityDashboardData {
  hour: string;
  table_name: string;
  operation: string;
  violation_count: number;
  unique_users: number;
  user_ids: string[];
}

export interface RecentRLSViolation {
  user_id: string;
  user_email: string | null;
  violation_count: number;
  tables_affected: string[];
  last_violation: string;
}

// =====================================================
// TYPES - MATERIALIZED VIEW REFRESH
// =====================================================

export interface MaterializedViewRefreshLog {
  id: string;
  view_name: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: 'running' | 'success' | 'failed' | 'timeout';
  error_message: string | null;
  rows_affected: number | null;
  created_at: string;
}

export interface MaterializedViewRefreshStats {
  view_name: string;
  total_refreshes: number;
  success_count: number;
  failed_count: number;
  timeout_count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  min_duration_ms: number;
  last_refresh_at: string;
}

export interface RefreshFailureAlert {
  id: string;
  view_name: string;
  consecutive_failures: number;
  first_failure_at: string;
  last_failure_at: string;
  alert_sent_at: string | null;
  resolved_at: string | null;
  status: 'active' | 'resolved' | 'acknowledged';
  error_messages: string[];
  created_at: string;
}

export interface ActiveRefreshAlert extends RefreshFailureAlert {
  incident_duration_seconds: number;
  total_refreshes: number | null;
  success_count: number | null;
  failed_count: number | null;
  timeout_count: number | null;
  avg_duration_ms: number | null;
}

// =====================================================
// SERVICE - RLS VIOLATIONS
// =====================================================

export const SecurityService = {
  /**
   * Récupérer le dashboard de sécurité (dernières 24h)
   */
  async getSecurityDashboard(): Promise<SecurityDashboardData[]> {
    try {
      const { data, error } = await supabase
        .from('admin_security_dashboard')
        .select('*')
        .order('hour', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Avoid spamming if view is missing or permission denied
      console.warn('[Security] Dashboard unreachable (missing view or permissions)');
      return [];
    }
  },

  /**
   * Récupérer les violations RLS récentes (1h)
   */
  async getRecentRLSViolations(): Promise<RecentRLSViolation[]> {
    try {
      const { data, error } = await supabase.rpc('check_recent_rls_violations');

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Avoid spamming if RPC is missing
      return [];
    }
  },

  /**
   * Récupérer l'historique complet des violations RLS
   */
  async getRLSViolationsHistory(
    limit: number = 100,
    offset: number = 0
  ): Promise<{ violations: RLSViolation[]; totalCount: number }> {
    try {
      // Get total count
      const { count, error: countError } = await supabase
        .from('rls_violations_log')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      // Get paginated data
      const { data, error } = await supabase
        .from('rls_violations_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        violations: data || [],
        totalCount: count || 0,
      };
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Logger une violation RLS
   */
  async logRLSViolation(
    tableName: string,
    operation: string,
    attemptedBarId: string | null,
    errorMessage?: string
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('log_rls_violation', {
        p_table_name: tableName,
        p_operation: operation,
        p_attempted_bar_id: attemptedBarId,
        p_error_message: errorMessage || null,
      });

      if (error) throw error;
    } catch (error) {
      // Log silently - don't throw to avoid breaking user experience
      console.error('Failed to log RLS violation:', error);
    }
  },

  /**
   * Récupérer l'état de santé des bars (heartbeats récents)
   */
  async getBarHealthStatus(): Promise<BarHealthStatus[]> {
    try {
      const { data, error } = await supabase
        .from('admin_bars_health_status')
        .select('*')
        .order('last_heartbeat_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Avoid spamming if view is missing
      return [];
    }
  },
};

// =====================================================
// SERVICE - MATERIALIZED VIEW MONITORING
// =====================================================

export const MaterializedViewService = {
  /**
   * Récupérer les stats de refresh pour toutes les vues
   */
  async getRefreshStats(): Promise<MaterializedViewRefreshStats[]> {
    try {
      const { data, error } = await supabase
        .from('materialized_view_refresh_stats')
        .select('*')
        .order('last_refresh_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Views might not exist
      return [];
    }
  },

  /**
   * Récupérer l'historique de refresh pour une vue spécifique
   */
  async getRefreshHistory(
    viewName: string,
    limit: number = 50
  ): Promise<MaterializedViewRefreshLog[]> {
    try {
      const { data, error } = await supabase
        .from('materialized_view_refresh_log')
        .select('*')
        .eq('view_name', viewName)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Views might not exist
      return [];
    }
  },

  /**
   * Refresh manuel sécurisé d'une vue matérialisée
   */
  async refreshMaterializedView(
    viewName: string,
    concurrently: boolean = true,
    timeoutSeconds: number = 30
  ): Promise<{ success: boolean; duration_ms: number; error_message: string | null }> {
    try {
      const { data, error } = await supabase.rpc('safe_refresh_materialized_view', {
        p_view_name: viewName,
        p_concurrently: concurrently,
        p_timeout_seconds: timeoutSeconds,
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No data returned from refresh function');
      }

      return data[0];
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Refresh bars_with_stats (wrapper optimisé)
   */
  async refreshBarsWithStats(): Promise<{
    success: boolean;
    duration_ms: number;
    error_message: string | null;
  }> {
    try {
      const { data, error } = await supabase.rpc('refresh_bars_with_stats');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No data returned from refresh function');
      }

      return data[0];
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Récupérer les alertes actives de refresh
   */
  async getActiveRefreshAlerts(): Promise<ActiveRefreshAlert[]> {
    try {
      const { data, error } = await supabase
        .from('active_refresh_alerts')
        .select('*')
        .order('consecutive_failures', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      // 🛡️ Silent Error: Views might not exist
      return [];
    }
  },

  /**
   * Détecter les échecs consécutifs
   */
  async detectConsecutiveFailures(): Promise<
    Array<{
      view_name: string;
      consecutive_failures: number;
      first_failure: string;
      last_failure: string;
      error_messages: string[];
    }>
  > {
    try {
      const { data, error } = await supabase.rpc('detect_consecutive_refresh_failures');

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Créer ou mettre à jour les alertes de failure
   */
  async createOrUpdateFailureAlerts(): Promise<{
    alerts_created: number;
    alerts_updated: number;
  }> {
    try {
      const { data, error } = await supabase.rpc('create_or_update_failure_alerts');

      if (error) throw error;
      if (!data || data.length === 0) {
        return { alerts_created: 0, alerts_updated: 0 };
      }

      return data[0];
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Acknowledger une alerte (SuperAdmin uniquement)
   */
  async acknowledgeAlert(alertId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('acknowledge_refresh_alert', {
        p_alert_id: alertId,
      });

      if (error) throw error;
      return data || false;
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Nettoyer les logs anciens (30 jours)
   */
  async cleanupOldRefreshLogs(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_old_refresh_logs');

      if (error) throw error;
      return data || 0;
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },

  /**
   * Nettoyer les alertes anciennes (90 jours)
   */
  async cleanupOldRefreshAlerts(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_old_refresh_alerts');

      if (error) throw error;
      return data || 0;
    } catch (error) {
      throw handleSupabaseError(error);
    }
  },
};
