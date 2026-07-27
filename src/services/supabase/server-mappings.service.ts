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
import { OfflineStorage, isActiveMapping } from '../../utils/offlineStorage';

export interface ServerNameMapping {
  id: string;
  barId: string;
  userId: string;
  serverName: string;
  /**
   * false = le membre n'est plus un serveur actif du bar (retiré ou promu).
   * Synchronisé en DB par le trigger trg_sync_server_mapping.
   *
   * ⚠️ Deux usages distincts, ne pas les confondre :
   * - Sélecteur de caisse → mappings ACTIFS uniquement (le nom doit disparaître)
   * - Résolution d'un nom de bon → TOUS les mappings (un bon ouvert d'un serveur
   *   parti doit garder son libellé, cf. useTickets)
   */
  isActive: boolean;
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
      const mapping = cachedMappings?.find(
        (m) => m.serverName === normalizedName && isActiveMapping(m)
      );
      return mapping?.userId || null;
    }

    try {
      // ⭐ TIMEOUT RESILIENCE (Correction Spinner)
      // 🛡️ is_active : ne jamais résoudre le nom d'un serveur retiré ou promu.
      // Sans ce filtre, une vente pourrait encore lui être imputée.
      const rpcPromise = supabase
        .from('server_name_mappings')
        .select('user_id')
        .eq('bar_id', barId)
        .eq('server_name', normalizedName)
        .eq('is_active', true)
        .single();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 3000)
      );

      const result = await Promise.race([rpcPromise, timeoutPromise]);

      if (result.error) {
        if (result.error.code === 'PGRST116') {
          return null;
        }
        throw result.error;
      }

      return result.data?.user_id || null;
    } catch (error) {
      const err = error as Error;
      if (err.message === 'TIMEOUT_EXCEEDED') {
        console.warn('[ServerMappingsService] Fetch timed out (3s), using cache fallback for', normalizedName);
      } else {
        console.warn('[ServerMappingsService] Fetch failed, falling back to cache:', err);
      }

      // 2. Fallback de secours en cas d'erreur réseau ou timeout
      const cachedMappings = OfflineStorage.getMappings(barId);
      const mapping = cachedMappings?.find(
        (m) => m.serverName === normalizedName && isActiveMapping(m)
      );
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
        isActive: data.is_active ?? true,
        createdAt: new Date(data.created_at || Date.now()),
        updatedAt: new Date(data.updated_at || Date.now()),
      };
    } catch (error) {
      console.error('[ServerMappingsService] Error upserting server mapping:', error);
      throw error;
    }
  }

  /**
   * Get server name mappings for a bar
   *
   * @param includeInactive
   *   false (défaut) → mappings ACTIFS seulement. Pour le sélecteur de caisse :
   *     un serveur retiré ou promu ne doit plus être sélectionnable.
   *   true → TOUS les mappings. Pour la résolution des noms de bons ouverts
   *     (useTickets) et l'écran de gestion des mappings, qui doivent continuer
   *     d'afficher les inactifs.
   */
  static async getAllMappingsForBar(
    barId: string,
    includeInactive = false
  ): Promise<ServerNameMapping[]> {
    try {
      let query = supabase
        .from('server_name_mappings')
        .select('*')
        .eq('bar_id', barId);

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query.order('server_name', { ascending: true });

      if (error) throw error;

      return (data || []).map(m => ({
        id: m.id,
        barId: m.bar_id,
        userId: m.user_id as string,
        serverName: m.server_name,
        // ⭐ Fallback true : si la colonne n'est pas encore présente (client
        // déployé avant la migration), on ne masque personne par erreur.
        isActive: m.is_active ?? true,
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

      const { data, error } = await supabase
        .from('server_name_mappings')
        .upsert(normalizedMappings, {
          onConflict: 'bar_id,server_name',
        })
        .select();

      if (error) throw error;

      return (data || []).map(m => ({
        id: m.id,
        barId: m.bar_id,
        userId: m.user_id,
        serverName: m.server_name,
        isActive: m.is_active ?? true,
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
        .filter((bm): bm is { user_id: string } => bm.user_id !== null)
        .map(bm => ({
          bar_id: barId,
          server_name: (userNameMap.get(bm.user_id) || '').trim(),
          user_id: bm.user_id,
        }))
        .filter(m => m.server_name && m.user_id); // Only include if user has a name and ID

      if (mappingsToCreate.length === 0) {
        console.info('[ServerMappingsService] No valid server members to map for bar:', barId);
        return [];
      }

      // Upsert all mappings at once (creates if not exist, updates if exist)
      // ⭐ is_active: true — réactive un mapping désactivé si le serveur est
      // redevenu actif, au lieu de laisser une ligne inactive orpheline.
      const { data, error: upsertError } = await supabase
        .from('server_name_mappings')
        .upsert(
          mappingsToCreate.map(m => ({ ...m, is_active: true })),
          { onConflict: 'bar_id,server_name' }
        )
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
        isActive: m.is_active ?? true,
        createdAt: new Date(m.created_at || Date.now()),
        updatedAt: new Date(m.updated_at || Date.now()),
      }));
    } catch (error) {
      console.error('[ServerMappingsService] Error auto-populating mappings:', error);
      throw error;
    }
  }
}
