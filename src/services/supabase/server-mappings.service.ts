/**
 * ServerMappingsService
 * Manages mappings between server names (simplified mode) and user UUIDs (full mode)
 *
 * Purpose: Enable mode switching by maintaining a mapping table
 * - Get UUID for a server name in a bar
 * - Create/update mappings
 * - List all mappings for a bar
 */

import { supabase } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { OfflineStorage } from '../../utils/offlineStorage';

export interface ServerNameMapping {
  id: string;
  barId: string;
  userId: string;
  serverName: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ServerMappingsService {
  /**
   * Get the user ID (UUID) for a server name in a specific bar
   * Used during sale creation in simplified mode to resolve server name → UUID
   */
  static async getUserIdForServerName(barId: string, serverName: string): Promise<string | null> {
    const normalizedName = serverName.trim();

    // 1. Détection préventive du mode hors ligne
    const { shouldShowBanner } = networkManager.getDecision();
    if (shouldShowBanner) {
      console.log('[ServerMappingsService] Offline mode: using cache fallback for', normalizedName);
      const cachedMappings = OfflineStorage.getMappings(barId);
      const mapping = cachedMappings?.find((m: any) => m.serverName === normalizedName);
      return mapping?.userId || null;
    }

    try {
      // ⭐ TIMEOUT RESILIENCE (Correction Spinner)
      const rpcPromise = supabase
        .from('server_name_mappings')
        .select('user_id')
        .eq('bar_id', barId)
        .eq('server_name', normalizedName)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 3000)
      );

      const result = await Promise.race([rpcPromise, timeoutPromise]) as any;

      if (result.error) {
        if (result.error.code === 'PGRST116') {
          return null;
        }
        throw result.error;
      }

      return result.data?.user_id || null;
    } catch (error: any) {
      if (error.message === 'TIMEOUT_EXCEEDED') {
        console.warn('[ServerMappingsService] Fetch timed out (3s), using cache fallback for', normalizedName);
      } else {
        console.warn('[ServerMappingsService] Fetch failed, falling back to cache:', error);
      }

      // 2. Fallback de secours en cas d'erreur réseau ou timeout
      const cachedMappings = OfflineStorage.getMappings(barId);
      const mapping = cachedMappings?.find((m: any) => m.serverName === normalizedName);
      return mapping?.userId || null;
    }
  }

  /**
   * Create or update a server name mapping
   * Called when setting up or updating simplified mode mappings
   */
  static async upsertServerMapping(
    barId: string,
    serverName: string,
    userId: string | null
  ): Promise<ServerNameMapping | null> {
    try {
      // Normalize server name (trim whitespace)
      const normalizedName = serverName.trim();

      if (!normalizedName) {
        throw new Error('Server name cannot be empty');
      }

      if (userId === null) {
        // Delete the mapping if userId is null
        const { error } = await supabase
          .from('server_name_mappings')
          .delete()
          .eq('bar_id', barId)
          .eq('server_name', normalizedName);

        if (error) throw error;
        return null;
      }

      // Use Supabase upsert (insert or update)
      const { data, error } = await supabase
        .from('server_name_mappings')
        .upsert(
          {
            bar_id: barId,
            server_name: normalizedName,
            user_id: userId,
          },
          {
            onConflict: 'bar_id,server_name', // Match by these columns
          }
        )
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        console.warn('[ServerMappingsService] Upsert returned no data');
        return null;
      }

      return {
        id: data.id,
        barId: data.bar_id,
        userId: data.user_id as string,
        serverName: data.server_name,
        createdAt: new Date(data.created_at || Date.now()),
        updatedAt: new Date(data.updated_at || Date.now()),
      };
    } catch (error) {
      console.error('[ServerMappingsService] Error upserting server mapping:', error);
      throw error;
    }
  }

  /**
   * Get all server name mappings for a bar
   * Used in settings UI to display current mappings
   */
  static async getAllMappingsForBar(barId: string): Promise<ServerNameMapping[]> {
    try {
      const { data, error } = await supabase
        .from('server_name_mappings')
        .select('*')
        .eq('bar_id', barId)
        .order('server_name', { ascending: true });

      if (error) throw error;

      return (data || []).map(m => ({
        id: m.id,
        barId: m.bar_id,
        userId: m.user_id as string,
        serverName: m.server_name,
        createdAt: new Date(m.created_at || Date.now()),
        updatedAt: new Date(m.updated_at || Date.now()),
      }));
    } catch (error) {
      console.error('[ServerMappingsService] Error getting all mappings for bar:', error);
      throw error;
    }
  }

  /**
   * Delete a server name mapping
   * Used when removing a server or updating mappings
   */
  static async deleteMapping(barId: string, serverName: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('server_name_mappings')
        .delete()
        .eq('bar_id', barId)
        .eq('server_name', serverName.trim());

      if (error) throw error;
    } catch (error) {
      console.error('[ServerMappingsService] Error deleting mapping:', error);
      throw error;
    }
  }

  /**
   * Check if server name mappings exist for a bar
   * Used to validate mode switches (warning if switching from simplified to full without mappings)
   */
  static async hasMappingsForBar(barId: string): Promise<boolean> {
    try {
      const { count, error } = await supabase
        .from('server_name_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('bar_id', barId);

      if (error) throw error;

      return (count || 0) > 0;
    } catch (error) {
      console.error('[ServerMappingsService] Error checking for mappings:', error);
      throw error;
    }
  }

  /**
   * Batch upsert mappings
   * Used when updating multiple mappings at once (e.g., from settings UI)
   */
  static async batchUpsertMappings(
    barId: string,
    mappings: Array<{ serverName: string; userId: string | null }>
  ): Promise<ServerNameMapping[]> {
    try {
      const normalizedMappings = mappings
        .filter(m => m.userId !== null) // Filtre les mappings invalides
        .map(m => ({
          bar_id: barId,
          server_name: m.serverName.trim(),
          user_id: m.userId as string,
        }));

      if (normalizedMappings.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('server_name_mappings')
        .upsert(normalizedMappings, {
          onConflict: 'bar_id,server_name',
        })
        .select();

      if (error) throw error;

      return (data || []).map((m: any) => ({
        id: m.id,
        barId: m.bar_id,
        userId: m.user_id,
        serverName: m.server_name,
        createdAt: new Date(m.created_at || Date.now()),
        updatedAt: new Date(m.updated_at || Date.now()),
      }));
    } catch (error) {
      console.error('[ServerMappingsService] Error batch upserting mappings:', error);
      throw error;
    }
  }

  /**
   * Auto-populate mappings from bar members with role='serveur'
   * Called when entering simplified mode to automatically create mappings
   * from existing bar members with server role
   */
  static async autoPopulateMappingsFromBarMembers(barId: string): Promise<ServerNameMapping[]> {
    try {
      // Fetch all bar members with role='serveur' and is_active=true
      const { data: barMembers, error: fetchError } = await supabase
        .from('bar_members')
        .select('user_id')
        .eq('bar_id', barId)
        .eq('role', 'serveur')
        .eq('is_active', true);

      if (fetchError) throw fetchError;

      if (!barMembers || barMembers.length === 0) {
        console.info('[ServerMappingsService] No active server members found for bar:', barId);
        return [];
      }

      // Fetch user names for these user IDs
      const userIds = (barMembers || []).map(bm => bm.user_id).filter((id): id is string => id !== null);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds);

      if (usersError) throw usersError;

      // Create a map of user ID to name
      const userNameMap = new Map((users || []).map(u => [u.id, u.name]));

      // prepare mappings from the fetched bar members
      const mappingsToCreate = barMembers
        .map(bm => ({
          bar_id: barId,
          server_name: (userNameMap.get((bm as any).user_id) || '').trim(),
          user_id: (bm as any).user_id as string,
        }))
        .filter(m => m.server_name && m.user_id); // Only include if user has a name and ID

      if (mappingsToCreate.length === 0) {
        console.info('[ServerMappingsService] No valid server members to map for bar:', barId);
        return [];
      }

      // Upsert all mappings at once (creates if not exist, updates if exist)
      const { data, error: upsertError } = await (supabase as any)
        .from('server_name_mappings')
        .upsert(mappingsToCreate, {
          onConflict: 'bar_id,server_name',
        })
        .select();

      if (upsertError) throw upsertError;

      console.info(
        `[ServerMappingsService] Auto-populated ${data?.length || 0} mappings for bar: ${barId}`
      );

      return (data || []).map((m: any) => ({
        id: m.id,
        barId: m.bar_id,
        userId: m.user_id,
        serverName: m.server_name,
        createdAt: new Date(m.created_at || Date.now()),
        updatedAt: new Date(m.updated_at || Date.now()),
      }));
    } catch (error) {
      console.error('[ServerMappingsService] Error auto-populating mappings:', error);
      throw error;
    }
  }
}
