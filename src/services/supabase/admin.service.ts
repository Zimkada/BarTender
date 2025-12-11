// src/services/supabase/admin.service.ts
import { supabase, handleSupabaseError } from '../../lib/supabase';
import { Bar, User } from '../../types';

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
  email: string | null;
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
}

export interface PaginatedUsersResult {
  users: Array<User & { roles: string[] }>;
  totalCount: number;
}

export class AdminService {
  /**
   * Récupère les statistiques agrégées pour le dashboard superadmin.
   * @param period 'today' | '7d' | '30d'
   */
  static async getDashboardStats(period: 'today' | '7d' | '30d' = 'today'): Promise<DashboardStats> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_dashboard_stats', { period });

      if (error) {
        throw error;
      }

      if (Array.isArray(data) && data.length > 0) {
        return data[0] as DashboardStats;
      }

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
          email: bar.email,
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
}