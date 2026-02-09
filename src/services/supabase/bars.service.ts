import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database, Json } from '../../lib/database.types';
import { Bar, BarSettings } from '../../types';
import { getErrorMessage } from '../../utils/errorHandler';

type BarRow = Database['public']['Tables']['bars']['Row'];
// type BarInsert = Database['public']['Tables']['bars']['Insert']; // Unused
type BarUpdate = Database['public']['Tables']['bars']['Update'];
type BarMemberInsert = Database['public']['Tables']['bar_members']['Insert'];

import { z } from 'zod';

const AddMemberResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

/**
 * ✅ Type-safe interface pour la vue SQL admin_bars_list
 * La vue matérialisée admin_bars_list n'est pas dans les types générés Supabase
 * car elle est créée via migration SQL et contient des JOINs enrichis.
 *
 * @note settings/theme_config utilisent `unknown` car le contenu JSONB est dynamique
 */
// ✅ Vue matérialisée admin_bars_list non incluse dans les types générés
interface AdminBarsListRow {
  id: string | null;
  name: string | null;
  owner_id: string | null;
  address?: string | null;
  phone?: string | null;
  created_at: string | null;
  is_active: boolean | null;
  closing_hour?: number | null;
  settings?: unknown; // JSONB dynamique, contenu type-safe via BarSettings au runtime
  theme_config?: unknown; // JSONB dynamique pour thème custom
  owner_name?: string | null;
  owner_phone?: string | null;
  member_count?: number | null;
  contact_email?: string | null;
  is_setup_complete?: boolean | null;
}

/**
 * ✅ Type union pour mapToBar - accepte BarRow standard ou la vue admin_bars_list
 */
type BarLikeRow = BarRow | AdminBarsListRow;

export interface BarWithOwner extends Bar {
  owner_name: string;
  owner_phone: string;
  member_count: number;
}

export interface CreateBarData {
  name: string;
  owner_id: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  settings?: Record<string, unknown>; // ✅ Changed from any to unknown
  closing_hour?: number;
}

/**
 * Service de gestion des bars
 */
export class BarsService {
  /**
   * Helper pour convertir une ligne Supabase en objet Bar frontend
   * Extensible pour gérer BarRow classique ou la vue admin_bars_list
   */
  private static mapToBar(row: BarLikeRow): Bar {
    const defaultSettings = {} as BarSettings; // Fallback

    return {
      id: row.id || '',
      name: row.name || '',
      address: 'address' in row ? (row.address || undefined) : undefined,
      phone: 'phone' in row ? (row.phone || undefined) : undefined,
      email: 'contact_email' in row ? (row.contact_email || undefined) : undefined,
      ownerId: row.owner_id || '',
      createdAt: new Date(row.created_at || Date.now()),
      isActive: row.is_active || false,
      closingHour: ('closing_hour' in row ? row.closing_hour : 6) ?? 6,
      settings: (('settings' in row && row.settings) ? (row.settings as unknown as BarSettings) : defaultSettings),
      theme_config: 'theme_config' in row ? (row.theme_config as unknown as Record<string, unknown> | undefined) : undefined,
      isSetupComplete: 'is_setup_complete' in row ? (row.is_setup_complete === true) : false,
    };
  }

  /**
   * Créer un nouveau bar via RPC atomique (Bar + Membre promoteur en 1 transaction)
   * ✅ EXPERT FIX: RPC retourne les champs complets du bar, éliminant le besoin d'une 2e requête
   * Réservé aux promoteurs et super_admins
   */
  static async createBar(data: CreateBarData): Promise<Bar> {
    try {
      const { data: result, error } = await supabase.rpc('setup_promoter_bar', {
        p_owner_id: data.owner_id,
        p_bar_name: data.name,
        p_address: data.address || undefined,
        p_phone: data.phone || undefined,
        p_settings: (data.settings ? JSON.parse(JSON.stringify(data.settings)) : undefined) as unknown as Json,
      });

      if (error) {
        // ✅ User-friendly error messages
        if (error.message.includes('duplicate key') || error.message.includes('unique')) {
          throw new Error('Un bar avec ce nom existe déjà.');
        }
        if (error.message.includes('Permission denied')) {
          throw new Error('Seuls les super-admins peuvent créer des bars.');
        }
        if (error.message.includes('foreign key')) {
          throw new Error('Propriétaire invalide. Veuillez vérifier l\'ID utilisateur.');
        }
        throw new Error(handleSupabaseError(error));
      }

      // ✅ Type-safe result from RPC (now includes full bar record)
      interface BarCreationResult {
        success: boolean;
        bar_id: string;
        id: string;
        name: string;
        owner_id: string;
        address: string | null;
        phone: string | null;
        logo_url: string | null;
        settings: unknown;
        is_active: boolean;
        closing_hour: number;
        created_at: string;
        updated_at: string;
      }

      const creationResult = result as unknown as BarCreationResult;

      if (!creationResult?.success || !creationResult?.id) {
        throw new Error('Erreur inattendue lors de la création du bar (RPC)');
      }

      // ✅ ATOMICITY: Directly map RPC result to Bar without 2nd fetch
      // The bar record is already complete from the RPC response
      return {
        id: creationResult.id,
        name: creationResult.name,
        address: creationResult.address || undefined,
        phone: creationResult.phone || undefined,
        email: undefined, // RPC doesn't return email, kept for API compatibility
        ownerId: creationResult.owner_id,
        createdAt: new Date(creationResult.created_at),
        isActive: creationResult.is_active,
        closingHour: creationResult.closing_hour ?? 6,
        settings: (creationResult.settings || {}) as BarSettings,
        theme_config: undefined, // Not returned by RPC
        isSetupComplete: false, // Newly created bars are not setup complete
      };
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer un bar par son ID (Optimisé via Vue)
   */
  static async getBarById(barId: string): Promise<BarWithOwner | null> {
    try {
      // ✅ Utilisation de la vue optimisée admin_bars_list
      const { data, error } = await supabase
        .from('admin_bars_list')
        .select('*')
        .eq('id', barId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        // Fallback or return null
        if (error.code === '42P01') { // undefined_table
          console.warn('View admin_bars_list not found, falling back to legacy.');
          return this.getBarByIdLegacy(barId);
        }
        return null;
      }

      const bar = this.mapToBar(data);

      return {
        ...bar,
        owner_name: data.owner_name || '',
        owner_phone: data.owner_phone || '',
        member_count: data.member_count || 0,
      };
    } catch (error) {
      console.warn('Fallback legacy getBarById due to error:', getErrorMessage(error));
      return this.getBarByIdLegacy(barId);
    }
  }

  /**
   * Fallback Legacy: Récupérer un bar par son ID (non optimisé)
   */
  private static async getBarByIdLegacy(barId: string): Promise<BarWithOwner | null> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .select('*')
        .eq('id', barId)
        .eq('is_active', true)
        .single();

      if (error || !data) return null;

      const { data: owner } = await supabase
        .from('users')
        .select('name, phone')
        .eq('id', data.owner_id || '')
        .single();

      const { count } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('is_active', true);

      const bar = this.mapToBar(data);
      return {
        ...bar,
        owner_name: owner?.name || '',
        owner_phone: owner?.phone || '',
        member_count: count || 0
      };
    } catch (e) {
      throw new Error(handleSupabaseError(e));
    }
  }

  /**
   * Récupérer tous les bars (super_admin uniquement) - Optimisé via Vue
   */
  static async getAllBars(): Promise<BarWithOwner[]> {
    try {
      // ✅ Utilisation de la vue optimisée admin_bars_list
      const { data, error } = await supabase
        .from('admin_bars_list')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') { // undefined_table
          console.warn('View admin_bars_list not found, falling back to legacy.');
          return this.getAllBarsLegacy();
        }
        throw new Error('Erreur lors de la récupération des bars');
      }

      return (data || []).map((row: AdminBarsListRow) => ({
        ...this.mapToBar(row),
        owner_name: row.owner_name || '',
        owner_phone: row.owner_phone || '',
        member_count: row.member_count || 0,
      }));
    } catch (error) {
      console.warn('Fallback legacy getAllBars due to error:', error);
      return this.getAllBarsLegacy();
    }
  }

  /**
   * Fallback Legacy: Récupérer tous les bars
   */
  private static async getAllBarsLegacy(): Promise<BarWithOwner[]> {
    const { data, error } = await supabase
      .from('bars')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Erreur lors de la récupération des bars (legacy)');

    const barsWithOwner: BarWithOwner[] = await Promise.all(
      (data || []).map(async (row) => {
        const { data: owner } = await supabase
          .from('users')
          .select('name, phone')
          .eq('id', row.owner_id || '')
          .single();

        const { count } = await supabase
          .from('bar_members')
          .select('*', { count: 'exact', head: true })
          .eq('bar_id', row.id)
          .eq('is_active', true);

        const bar = this.mapToBar(row);
        return {
          ...bar,
          owner_name: owner?.name || '',
          owner_phone: owner?.phone || '',
          member_count: count || 0,
        };
      })
    );
    return barsWithOwner;
  }

  /**
   * Récupérer les bars de l'utilisateur
   * Utilise un RPC pour contourner les RLS lors de l'impersonation
   */
  static async getUserBars(userId: string, impersonatingUserId?: string): Promise<Bar[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_bars', {
          p_user_id: userId,
          p_impersonating_user_id: impersonatingUserId || null
        });

      if (error) {
        console.error('[BarsService] RPC error:', error);
        throw new Error('Erreur lors de la récupération des bars');
      }

      return (data || []).map((barRow: BarRow) => this.mapToBar(barRow));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les bars de l'utilisateur actuellement authentifié
   */
  static async getMyBars(): Promise<Bar[]> {
    try {
      const { data, error } = await supabase.rpc('get_my_bars');

      if (error) {
        console.error('[BarsService] RPC error:', error);
        throw new Error('Erreur lors de la récupération de vos bars');
      }

      return (data || []).map((barRow: BarRow) => this.mapToBar(barRow));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un bar
   */
  static async updateBar(barId: string, updates: BarUpdate & { closingHour?: number; theme_config?: unknown }): Promise<Bar> {
    try {
      // Mapper closingHour vers closing_hour si présent
      const dbUpdates: BarUpdate & { closingHour?: number } = { ...updates };
      if (updates.closingHour !== undefined) {
        dbUpdates.closing_hour = updates.closingHour;
        delete dbUpdates.closingHour; // Clean up non-DB property
      }

      // 1. Faire l'UPDATE sans .select() pour éviter l'erreur 406 avec jsonb
      const { error: updateError } = await supabase
        .from('bars')
        .update(dbUpdates)
        .eq('id', barId);

      if (updateError) {
        throw new Error('Erreur lors de la mise à jour du bar');
      }

      // 2. Récupérer le bar mis à jour directement depuis la table bars (pas la vue)
      const { data, error: selectError } = await supabase
        .from('bars')
        .select('*')
        .eq('id', barId)
        .single();

      if (selectError || !data) {
        throw new Error('Bar non trouvé après mise à jour');
      }

      return this.mapToBar(data);
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Désactiver un bar (soft delete)
   */
  static async deactivateBar(barId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({ is_active: false })
        .eq('id', barId);

      if (error) {
        throw new Error('Erreur lors de la désactivation du bar');
      }
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Activer un bar
   */
  static async activateBar(barId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({ is_active: true })
        .eq('id', barId);

      if (error) {
        throw new Error('Erreur lors de l\'activation du bar');
      }
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour les paramètres d'un bar
   */
  static async updateSettings(barId: string, settings: Record<string, unknown>): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({ settings: settings as unknown as Json })
        .eq('id', barId);

      if (error) {
        throw new Error('Erreur lors de la mise à jour des paramètres');
      }
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les paramètres d'un bar
   */
  static async getSettings(barId: string): Promise<Record<string, unknown> | null> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .select('settings')
        .eq('id', barId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.settings as unknown as Record<string, unknown>;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les statistiques d'un bar (Optimisé via RPC)
   */
  static async getBarStats(barId: string): Promise<{
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
    pendingSales: number;
  }> {
    try {
      // ✅ Utilisation du RPC optimisé get_bar_admin_stats
      const { data, error } = await supabase
        .rpc('get_bar_admin_stats', { p_bar_id: barId });

      if (error) {
        // Fallback si RPC introuvable
        if (error.code === '42883') { // undefined_function
          console.warn('RPC get_bar_admin_stats not found, falling back to legacy.');
          return this.getBarStatsLegacy(barId);
        }
        console.error('[BarsService] RPC stats error:', error);
        throw error;
      }

      const stats = Array.isArray(data) ? data[0] : data;

      if (!stats) {
        return { totalProducts: 0, totalSales: 0, totalRevenue: 0, pendingSales: 0 };
      }

      return {
        totalProducts: stats.total_products || 0,
        totalSales: stats.total_sales || 0,
        totalRevenue: stats.total_revenue || 0,
        pendingSales: stats.pending_sales || 0,
      };
    } catch (error) {
      console.warn('Fallback legacy getBarStats due to error:', getErrorMessage(error));
      return this.getBarStatsLegacy(barId);
    }
  }

  /**
   * Fallback Legacy: Stats bar (lent)
   */
  private static async getBarStatsLegacy(barId: string) {
    const { count: productCount } = await supabase
      .from('bar_products')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('is_active', true);

    const { count: salesCount } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('status', 'validated');

    const { data: salesData } = await supabase
      .from('sales')
      .select('total')
      .eq('bar_id', barId)
      .eq('status', 'validated');

    const totalRevenue = (salesData || []).reduce((sum, sale) => sum + (sale.total || 0), 0);

    const { count: pendingCount } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('bar_id', barId)
      .eq('status', 'pending');

    return {
      totalProducts: productCount || 0,
      totalSales: salesCount || 0,
      totalRevenue,
      pendingSales: pendingCount || 0,
    };
  }
  /**
   * Récupérer les candidats (employés de mes autres bars) pour ajout rapide
   */
  static async getStaffCandidates(barId: string): Promise<Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    sourceBarName: string;
  }>> {
    try {
      const { data, error } = await supabase
        .rpc('get_my_staff_candidates', { p_bar_id: barId });

      if (error) throw error;

      interface StaffCandidateRow {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        role: string;
        source_bar_name: string;
      }

      return (data || []).map((c: unknown) => {
        const candidate = c as StaffCandidateRow;
        return {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone || '',
          role: candidate.role,
          sourceBarName: candidate.source_bar_name
        };
      });
    } catch (error) {
      console.error('Error fetching staff candidates:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Ajouter un membre existant au bar (par ID ou Email)
   */
  /**
   * Ajouter un membre existant au bar (par ID ou Email)
   * Utilise le RPC de lookup V2 pour la sécurité
   */
  static async addMemberExisting(
    barId: string,
    identifier: { userId?: string; email?: string },
    role: 'gerant' | 'serveur',
    assignedByUserId: string // ✅ Added required field for audit
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data, error } = await supabase
        .rpc('add_bar_member_lookup', {
          p_bar_id: barId,
          p_role: role,
          p_assigned_by_id: assignedByUserId,
          p_user_id: identifier.userId ?? undefined,
          p_email: identifier.email ?? undefined
        });

      if (error) {
        throw error;
      }

      // Result is JSONB from add_bar_member_v2: { success, member_id, error }
      const result = data as { success: boolean; member_id?: string; error?: string };

      if (!result.success) {
        return { success: false, error: result.error || 'Erreur inconnue' };
      }

      return { success: true, message: 'Membre ajouté avec succès' };
    } catch (error) {
      console.error('[BarsService] addMemberExisting error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * ✅ Ajouter ou Mettre à jour un membre (CENTRALISÉ, Atomic RPC)
   * Gère: Permissions, Collision Mapping, Audit Log
   */
  static async addMember(
    barId: string,
    userId: string,
    role: UserRole,
    assignedByUserId: string
  ): Promise<{ success: boolean; memberId?: string; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('add_bar_member_v2', {
        p_bar_id: barId,
        p_user_id: userId,
        p_role: role,
        p_assigned_by_id: assignedByUserId
      });

      if (error) throw error;

      // Data is JSONB due to RETURNS JSONB
      // Supabase JS often auto-parses, but let's be safe
      const result = data as { success: boolean; member_id?: string; error?: string };

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, memberId: result.member_id };
    } catch (error) {
      console.error('[BarsService] addMember error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * ✅ Retirer un membre (CENTRALISÉ, Atomic RPC)
   * Gère: Permissions, Soft Delete, Audit Log
   */
  static async removeMember(
    barId: string,
    userIdToRemove: string,
    removedByUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('remove_bar_member_v2', {
        p_bar_id: barId,
        p_user_id_to_remove: userIdToRemove,
        p_removed_by_id: removedByUserId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      console.error('[BarsService] removeMember error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * ✅ Changer le rôle d'un membre (Update)
   * Wrapper autour de addMember (Upsert) pour sémantique claire
   */
  static async updateMemberRole(
    barId: string,
    userId: string,
    newRole: UserRole,
    updatedByUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.addMember(barId, userId, newRole, updatedByUserId);
  }

  /**
   * ✅ Vérifier permission (Source de vérité Serveur)
   */
  static async canManageMembers(
    barId: string,
    userId: string,
    action: 'create_manager' | 'create_server' | 'remove_member'
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('check_user_can_manage_members', {
        p_bar_id: barId,
        p_user_id: userId,
        p_action: action
      });

      if (error) return false;
      return !!data;
    } catch (err) {
      return false;
    }
  }

  /**
   * Assigner un membre utilisateur à un bar (Legacy - Deprecated by addMember)
   * @deprecated Use addMember instead
   */
  static async assignMemberToBar(
    barId: string,
    userId: string,
    role: 'promoteur' | 'gerant' | 'serveur',
    assignedByUserId: string
  ): Promise<void> {
    // Forward to new implementation for backward compat if called
    const res = await this.addMember(barId, userId, role, assignedByUserId);
    if (!res.success) throw new Error(res.error);
  }
}
