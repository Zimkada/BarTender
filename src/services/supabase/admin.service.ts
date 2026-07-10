// src/services/supabase/admin.service.ts
import { supabase, handleSupabaseError } from '../../lib/supabase';
import {
  Bar,
  User,
  GlobalCatalogAuditLog,
  SubscriptionOverview,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
} from '../../types';

export interface DashboardStats {
  total_revenue: number;
  sales_count: number;
  active_users_count: number;
  new_users_count: number;
  bars_count: number;
  active_bars_count: number;
}

export interface GetPaginatedBarsParams {
  page: number;
  limit: number;
  searchQuery?: string;
  statusFilter?: 'all' | 'active' | 'suspended';
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedBarsResult {
  bars: Bar[];
  totalCount: number;
}

interface BarFromRPC {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  owner_id: string | null;
  created_at: string;
  is_active: boolean;
  closing_hour: number;
  settings: Record<string, unknown> | null;
}

export interface GetPaginatedUsersParams {
  page: number;
  limit: number;
  searchQuery?: string;
  roleFilter?: 'all' | 'promoteur' | 'gerant' | 'serveur';
}

interface UserFromRPC {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
  is_active: boolean;
  first_login: boolean;
  last_login_at: string | null;
  roles: string[];
  bars: Array<{ id: string; name: string }>;
}

export interface PaginatedUsersResult {
  users: Array<User & { roles: string[]; bars: Array<{ id: string; name: string }> }>;
  totalCount: number;
}

// Reflète exactement les colonnes retournées par le RPC get_paginated_audit_logs
// (= json_agg(audit_logs.*), donc toutes les colonnes de la table audit_logs)
interface AuditLogFromRPC {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  bar_id: string | null;
  bar_name: string | null;
  event: string;
  description: string;
  severity: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
}

// Type retourné par getPaginatedAuditLogs : champs snake_case du RPC + timestamp converti en Date
export type AuditLogEntry = Omit<AuditLogFromRPC, 'timestamp'> & { timestamp: Date };

export interface GetPaginatedAuditLogsParams {
  page: number;
  limit: number;
  searchQuery?: string;
  severityFilter?: 'all' | 'critical' | 'warning' | 'info';
  eventFilter?: string;
  barFilter?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedAuditLogsResult {
  logs: AuditLogEntry[];
  totalCount: number;
}

export interface GetPaginatedGlobalCatalogAuditLogsParams {
  page: number;
  limit: number;
  searchQuery?: string;
  actionFilter?: 'CREATE' | 'UPDATE' | 'DELETE';
  entityFilter?: 'PRODUCT' | 'CATEGORY';
  startDate?: string;
  endDate?: string;
}

export interface PaginatedGlobalCatalogAuditLogsResult {
  logs: GlobalCatalogAuditLog[];
  totalCount: number;
}

interface GlobalCatalogLogFromRPC {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  modified_by: string;
  created_at: string;
  total_count?: number;
}

export class AdminService {
  /**
   * Récupère les statistiques agrégées pour le dashboard superadmin.
   * @param period 'today' | '7d' | '30d'
   */
  static async getDashboardStats(startDate: string, endDate: string, barId?: string): Promise<DashboardStats> {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_bar_id: barId ?? undefined,
      });

      if (error) {
        throw error;
      }

      if (Array.isArray(data) && data.length > 0) {
        return data[0] as DashboardStats;
      }

      // Return a default object if there's no data
      return {
        total_revenue: 0, sales_count: 0, active_users_count: 0, new_users_count: 0, bars_count: 0, active_bars_count: 0,
      };

    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Nombre d'appareils avec un heartbeat actif (< 15 min) en ce moment.
   * Instantané, indépendant de tout filtre de période — cf. getBarHealthStatus
   * pour le détail par bar. Filtre optionnel par bar, cohérent avec le
   * sélecteur de bar de SuperAdminPage.
   */
  static async getActiveDevicesCount(barId?: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_active_devices_count', {
        p_bar_id: barId ?? undefined,
      });

      if (error) throw error;
      return data ?? 0;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère les bars de manière paginée.
   * @param params - Paramètres de pagination, filtre et tri
   */
  static async getPaginatedBars(params: GetPaginatedBarsParams): Promise<PaginatedBarsResult> {
    try {
      const {
        page,
        limit,
        searchQuery = '',
        statusFilter = 'all',
        sortBy = 'name',
        sortOrder = 'asc'
      } = params;

      const { data, error } = await supabase.rpc('get_paginated_bars', {
        p_page: page,
        p_limit: limit,
        p_search_query: searchQuery,
        p_status_filter: statusFilter,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
      });

      if (error) {
        throw error;
      }

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        const rawBars = (Array.isArray(result.bars) ? result.bars : []) as unknown as BarFromRPC[];
        const barsData = rawBars.map(bar => ({
          id: bar.id,
          name: bar.name,
          address: bar.address,
          phone: bar.phone,
          ownerId: bar.owner_id,
          createdAt: new Date(bar.created_at),
          isActive: bar.is_active,
          closingHour: bar.closing_hour,
          settings: bar.settings,
        }));

        return {
          bars: barsData as unknown as Bar[],
          totalCount: result.total_count || 0,
        };
      }

      return { bars: [], totalCount: 0 };

    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère les utilisateurs de manière paginée.
   * @param params - Paramètres de pagination, filtre et recherche
   */
  static async getPaginatedUsers(params: GetPaginatedUsersParams): Promise<PaginatedUsersResult> {
    try {
      const {
        page,
        limit,
        searchQuery = '',
        roleFilter = 'all'
      } = params;

      const { data, error } = await supabase.rpc('get_paginated_users', {
        p_page: page,
        p_limit: limit,
        p_search_query: searchQuery,
        p_role_filter: roleFilter,
      });

      if (error) {
        throw error;
      }

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        const rawUsers = (Array.isArray(result.users) ? result.users : []) as unknown as UserFromRPC[];
        const usersData = rawUsers.map(u => ({
          id: u.id,
          username: u.username || '',
          password: '', // Ne jamais exposer
          name: u.name || '',
          phone: u.phone || '',
          email: u.email || '',
          createdAt: new Date(u.created_at),
          isActive: u.is_active ?? true,
          firstLogin: u.first_login ?? false,
          lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : undefined,
          roles: u.roles || [],
          bars: u.bars || [],
        }));

        return {
          users: usersData as unknown as (User & { roles: string[]; bars: { id: string; name: string; }[]; })[],
          totalCount: result.total_count || 0,
        };
      }

      return { users: [], totalCount: 0 };

    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère les logs d'audit de manière paginée.
   * @param params - Paramètres de pagination et de filtre
   */
  static async getPaginatedAuditLogs(params: GetPaginatedAuditLogsParams): Promise<PaginatedAuditLogsResult> {
    try {
      const {
        page,
        limit,
        searchQuery = '',
        severityFilter = 'all',
        eventFilter = 'all',
        barFilter = 'all',
        startDate = undefined,
        endDate = undefined
      } = params;

      const { data, error } = await supabase.rpc('get_paginated_audit_logs', {
        p_page: page,
        p_limit: limit,
        p_search_query: searchQuery,
        p_severity_filter: severityFilter,
        p_event_filter: eventFilter,
        p_bar_filter: barFilter,
        p_start_date: startDate ?? undefined,
        p_end_date: endDate ?? undefined,
      });

      if (error) throw error;

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        const rawLogs = (Array.isArray(result.logs) ? result.logs : []) as unknown as AuditLogFromRPC[];
        const logsData = rawLogs.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp),
        }));
        return {
          logs: logsData,
          totalCount: result.total_count || 0,
        };
      }

      return { logs: [], totalCount: 0 };
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère les logs du catalogue global de manière paginée.
   * @param params - Paramètres de pagination et de filtre
   */
  static async getPaginatedGlobalCatalogAuditLogs(
    params: GetPaginatedGlobalCatalogAuditLogsParams
  ): Promise<PaginatedGlobalCatalogAuditLogsResult> {
    try {
      const {
        page,
        limit,
        searchQuery,
        actionFilter,
        entityFilter,
        startDate,
        endDate
      } = params;

      const rpcParams = {
        p_page: page,
        p_limit: limit,
        p_search_query: searchQuery,
        p_action_filter: actionFilter,
        p_entity_filter: entityFilter,
        p_start_date: startDate || undefined,
        p_end_date: endDate || undefined,
      };

      const { data, error } = await supabase.rpc('get_paginated_catalog_logs_for_admin', rpcParams);

      if (error) {
        // La fonction RPC renvoie une exception si l'utilisateur n'est pas super admin
        if (error.message.includes('Forbidden')) {
          throw new Error('Vous devez être un super administrateur pour voir ces logs.');
        }
        throw error;
      }

      const rawLogs = (data || []) as unknown as GlobalCatalogLogFromRPC[];
      const logsData = rawLogs.map(log => ({
        id: log.id,
        action: log.action as 'CREATE' | 'UPDATE' | 'DELETE',
        entityType: log.entity_type as 'PRODUCT' | 'CATEGORY',
        entityId: log.entity_id,
        entityName: log.entity_name,
        oldValues: log.old_values,
        newValues: log.new_values,
        modifiedBy: log.modified_by,
        createdAt: new Date(log.created_at),
      }));

      const totalCount = data?.[0]?.total_count ?? 0;

      return {
        logs: logsData as unknown as GlobalCatalogAuditLog[],
        totalCount: Number(totalCount),
      };
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère la liste légère des bars pour les dropdowns (id, name, is_active uniquement).
   * Optimisé pour les filtres et sélecteurs.
   */
  static async getUniqueBars(): Promise<{ id: string; name: string; is_active: boolean }[]> {
    try {
      const { data, error } = await supabase.rpc('get_unique_bars');

      if (error) throw error;

      return Array.isArray(data) ? data : [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // =====================================================
  // ABONNEMENTS (suivi des paiements)
  // =====================================================

  /**
   * Vue paginée exacte des abonnements, triée/filtrée côté serveur.
   */
  static async getSubscriptionOverview(params: {
    page: number;
    limit: number;
    searchQuery?: string;
    statusFilter?: 'all' | SubscriptionStatus;
  }): Promise<SubscriptionOverview> {
    try {
      const { data, error } = await supabase.rpc('get_subscription_overview', {
        p_page: params.page,
        p_limit: params.limit,
        p_search_query: params.searchQuery ?? '',
        p_status_filter: params.statusFilter ?? 'all',
      });

      if (error) throw error;
      return mapSubscriptionOverview(
        (data as SubscriptionOverviewRow[] | null)?.[0]
      );
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Enregistre un paiement d'abonnement et avance l'échéance du bar (atomique côté RPC).
   * RLS + RPC garantissent l'accès super_admin uniquement.
   */
  static async recordSubscriptionPayment(params: {
    barId: string;
    amount: number;
    monthsCovered: number;
    method: SubscriptionPaymentMethod;
    notes?: string;
  }): Promise<SubscriptionPayment> {
    try {
      const { data, error } = await supabase.rpc('record_subscription_payment', {
        p_bar_id: params.barId,
        p_amount: params.amount,
        p_months_covered: params.monthsCovered,
        p_method: params.method,
        p_notes: params.notes || undefined,
      });

      if (error) throw error;
      if (!data) throw new Error('Aucun paiement retourné par le serveur');
      return mapSubscriptionPayment(data as SubscriptionPaymentRow);
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /** Historique des paiements d'un bar (le plus récent d'abord). */
  static async getSubscriptionPayments(barId: string): Promise<SubscriptionPayment[]> {
    try {
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('bar_id', barId)
        .order('paid_at', { ascending: false });

      if (error) throw error;
      return (data as SubscriptionPaymentRow[] | null)?.map(mapSubscriptionPayment) ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
}

// Reflète les colonnes de la table subscription_payments (snake_case)
interface SubscriptionPaymentRow {
  id: string;
  bar_id: string;
  amount: number;
  months_covered: number;
  method: SubscriptionPaymentMethod;
  paid_at: string;
  period_start: string;
  period_end: string;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
}

interface SubscriptionOverviewBarRow extends BarFromRPC {
  subscription_status: SubscriptionStatus;
  days_until_due: number | null;
}

interface SubscriptionOverviewRow {
  bars: SubscriptionOverviewBarRow[] | null;
  total_count: number | string | null;
  mrr: number | string | null;
  overdue_count: number | string | null;
  due_soon_count: number | string | null;
  never_paid_count: number | string | null;
  up_to_date_count: number | string | null;
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function mapSubscriptionOverview(row: SubscriptionOverviewRow | undefined): SubscriptionOverview {
  const rawBars = Array.isArray(row?.bars) ? row.bars : [];

  return {
    bars: rawBars.map((bar) => ({
      bar: {
        id: bar.id,
        name: bar.name,
        address: bar.address ?? undefined,
        phone: bar.phone ?? undefined,
        ownerId: bar.owner_id ?? '',
        createdAt: new Date(bar.created_at),
        isActive: bar.is_active,
        closingHour: bar.closing_hour,
        settings: (bar.settings ?? {}) as Bar['settings'],
      },
      status: bar.subscription_status,
      daysUntilDue: bar.days_until_due,
    })),
    totalCount: toNumber(row?.total_count),
    mrr: toNumber(row?.mrr),
    counts: {
      overdue: toNumber(row?.overdue_count),
      due_soon: toNumber(row?.due_soon_count),
      never_paid: toNumber(row?.never_paid_count),
      up_to_date: toNumber(row?.up_to_date_count),
    },
  };
}

function mapSubscriptionPayment(row: SubscriptionPaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    barId: row.bar_id,
    amount: Number(row.amount),
    monthsCovered: row.months_covered,
    method: row.method,
    paidAt: row.paid_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    recordedBy: row.recorded_by ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}
