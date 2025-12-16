// src/services/supabase/admin.service.ts
import { supabase, handleSupabaseError } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Bar, User, AuditLog, GlobalCatalogAuditLog } from '../../types';

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
  settings: Record<string, any> | null;
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

interface AuditLogFromRPC {
  id: string;
  user_id: string | null;
  user_name: string;
  bar_id: string | null;
  bar_name: string | null;
  action: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  metadata: Record<string, any> | null;
}

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
  logs: AuditLog[];
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

export class AdminService {
  /**
   * Récupère les statistiques agrégées pour le dashboard superadmin.
   * @param period 'today' | '7d' | '30d'
   */
  static async getDashboardStats(period: string): Promise<DashboardStats> {
    try {
      const cacheBuster = uuidv4();
      const { data, error } = await (supabase.rpc as any)('get_dashboard_stats', {
        p_period: period,
        p_cache_buster: cacheBuster,
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

    } catch (error: any) {
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

      const { data, error } = await (supabase.rpc as any)('get_paginated_bars', {
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
        const barsData = (Array.isArray(result.bars) ? result.bars : []).map((bar: BarFromRPC) => ({
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
          bars: barsData,
          totalCount: result.total_count || 0,
        };
      }

      return { bars: [], totalCount: 0 };

    } catch (error: any) {
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

      const { data, error } = await (supabase.rpc as any)('get_paginated_users', {
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
        const usersData = (Array.isArray(result.users) ? result.users : []).map((u: UserFromRPC) => ({
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
          users: usersData,
          totalCount: result.total_count || 0,
        };
      }

      return { users: [], totalCount: 0 };

    } catch (error: any) {
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

      const { data, error } = await (supabase.rpc as any)('get_paginated_audit_logs', {
        p_page: page,
        p_limit: limit,
        p_search_query: searchQuery,
        p_severity_filter: severityFilter,
        p_event_filter: eventFilter,
        p_bar_filter: barFilter,
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
      });

      if (error) throw error;

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        const logsData = (Array.isArray(result.logs) ? result.logs : []).map((log: AuditLogFromRPC) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        }));
        return {
          logs: logsData,
          totalCount: result.total_count || 0,
        };
      }

      return { logs: [], totalCount: 0 };
    } catch (error: any) {
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
        searchQuery = '',
        actionFilter = 'all',
        entityFilter = 'all',
        startDate = undefined,
        endDate = undefined
      } = params;

      const { data, error } = await (supabase
        .from('global_catalog_audit_log')
        .select('id, action, entity_type, entity_id, entity_name, old_values, new_values, modified_by, created_at') as any)
        .gte('created_at', startDate ? `${startDate}T00:00:00Z` : undefined)
        .lte('created_at', endDate ? `${endDate}T23:59:59Z` : undefined)
        .eq(actionFilter && actionFilter !== 'all' ? 'action' : 'action', actionFilter !== 'all' ? actionFilter : undefined)
        .eq(entityFilter && entityFilter !== 'all' ? 'entity_type' : 'entity_type', entityFilter !== 'all' ? entityFilter : undefined)
        .ilike('entity_name', searchQuery ? `%${searchQuery}%` : '%')
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;

      // Faire une deuxième requête pour le count
      const { count, error: countError } = await (supabase
        .from('global_catalog_audit_log')
        .select('id', { count: 'exact' }) as any)
        .gte('created_at', startDate ? `${startDate}T00:00:00Z` : undefined)
        .lte('created_at', endDate ? `${endDate}T23:59:59Z` : undefined)
        .eq(actionFilter && actionFilter !== 'all' ? 'action' : 'action', actionFilter !== 'all' ? actionFilter : undefined)
        .eq(entityFilter && entityFilter !== 'all' ? 'entity_type' : 'entity_type', entityFilter !== 'all' ? entityFilter : undefined)
        .ilike('entity_name', searchQuery ? `%${searchQuery}%` : '%');

      if (countError) throw countError;

      const logsData = (Array.isArray(data) ? data : []).map((log: any) => ({
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

      return {
        logs: logsData,
        totalCount: count || 0,
      };
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupère la liste légère des bars pour les dropdowns (id, name, is_active uniquement).
   * Optimisé pour les filtres et sélecteurs.
   */
  static async getUniqueBars(): Promise<{ id: string; name: string; is_active: boolean }[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_unique_bars');

      if (error) throw error;

      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}