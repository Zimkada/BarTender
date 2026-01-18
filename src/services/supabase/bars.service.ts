import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Bar } from '../../types';

type BarRow = Database['public']['Tables']['bars']['Row'];
// type BarInsert = Database['public']['Tables']['bars']['Insert']; // Unused
type BarUpdate = Database['public']['Tables']['bars']['Update'];
type BarMemberInsert = Database['public']['Tables']['bar_members']['Insert'];

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
  settings?: Record<string, any>;
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
  private static mapToBar(row: any): Bar {
    return {
      id: row.id,
      name: row.name,
      address: row.address || undefined,
      phone: row.phone || undefined,
      email: row.contact_email || undefined,
      ownerId: row.owner_id || '',
      createdAt: new Date(row.created_at || Date.now()),
      isActive: row.is_active || false,
      closingHour: row.closing_hour ?? 6, // ✅ Mappage explicite
      settings: row.settings as any,
      isSetupComplete: row.is_setup_complete === true, // ✅ Mappage strict pour boolean
    };
  }

  /**
   * Créer un nouveau bar
   * Réservé aux promoteurs et super_admins
   */
  static async createBar(data: CreateBarData): Promise<Bar> {
    try {
      // 1. Créer le bar
      const { data: newBar, error: barError } = await supabase
        .from('bars')
        .insert({
          name: data.name,
          owner_id: data.owner_id,
          address: data.address,
          phone: data.phone,
          logo_url: data.logo_url,
          settings: data.settings,
          is_active: true,
          closing_hour: data.closing_hour ?? 6,
        })
        .select()
        .single();

      if (barError || !newBar) {
        throw new Error('Erreur lors de la création du bar');
      }

      // 2. Créer l'association bar_member pour le propriétaire
      const { error: memberError } = await supabase
        .from('bar_members')
        .insert({
          bar_id: newBar.id,
          user_id: data.owner_id,
          role: 'promoteur',
          assigned_by: data.owner_id,
          is_active: true,
        });

      if (memberError) {
        // Rollback: supprimer le bar créé
        await supabase.from('bars').delete().eq('id', newBar.id);
        throw new Error('Erreur lors de l\'assignation du propriétaire');
      }

      return this.mapToBar(newBar);
    } catch (error: any) {
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
        .from('admin_bars_list' as any) // Cast as any because type might not be generated yet
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
    } catch (error: any) {
      console.warn('Fallback legacy getBarById due to error:', error);
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
    } catch (e: any) {
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
        .from('admin_bars_list' as any)
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

      return (data || []).map((row: any) => ({
        ...this.mapToBar(row),
        owner_name: row.owner_name || '',
        owner_phone: row.owner_phone || '',
        member_count: row.member_count || 0,
      }));
    } catch (error: any) {
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

      return (data || []).map((barRow: any) => this.mapToBar(barRow));
    } catch (error: any) {
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

      return (data || []).map((barRow: any) => this.mapToBar(barRow));
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un bar
   */
  static async updateBar(barId: string, updates: BarUpdate & { closingHour?: number }): Promise<Bar> {
    try {
      // Mapper closingHour vers closing_hour si présent
      const dbUpdates: any = { ...updates };
      if (updates.closingHour !== undefined) {
        dbUpdates.closing_hour = updates.closingHour;
        delete dbUpdates.closingHour;
      }

      const { data, error } = await supabase
        .from('bars')
        .update(dbUpdates)
        .eq('id', barId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour du bar');
      }

      return this.mapToBar(data);
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour les paramètres d'un bar
   */
  static async updateSettings(barId: string, settings: Record<string, any>): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({ settings })
        .eq('id', barId);

      if (error) {
        throw new Error('Erreur lors de la mise à jour des paramètres');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les paramètres d'un bar
   */
  static async getSettings(barId: string): Promise<Record<string, any> | null> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .select('settings')
        .eq('id', barId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.settings as Record<string, any>;
    } catch (error: any) {
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
    } catch (error: any) {
      console.warn('Fallback legacy getBarStats due to error:', error);
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

      return (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone || '',
        role: c.role,
        sourceBarName: c.source_bar_name
      }));
    } catch (error: any) {
      console.error('Error fetching staff candidates:', error);
      return [];
    }
  }

  /**
   * Ajouter un membre existant au bar (par ID ou Email)
   */
  static async addMemberExisting(
    barId: string,
    identifier: { userId?: string; email?: string },
    role: 'gerant' | 'serveur'
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data, error } = await supabase
        .rpc('add_bar_member_existing', {
          p_bar_id: barId,
          p_user_id: identifier.userId || null,
          p_email: identifier.email || null,
          p_role: role
        });

      if (error) {
        throw new Error(error.message);
      }

      if (data && !data.success) {
        return { success: false, error: data.error || 'Erreur inconnue' };
      }

      return { success: true, message: data?.message };
    } catch (error: any) {
      console.error('Error adding existing member:', error);
      return { success: false, error: error.message || 'Erreur lors de l\'ajout' };
    }
  }

  /**
   * Assigner un membre utilisateur à un bar
   * Support upsert pour éviter les doublons
   * Utilisé par onboarding pour assigner des managers
   */
  static async assignMemberToBar(
    barId: string,
    userId: string,
    role: 'promoteur' | 'gérant' | 'serveur',
    assignedByUserId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_members')
        .upsert({
          bar_id: barId,
          user_id: userId,
          role,
          assigned_by: assignedByUserId,
          is_active: true,
        } as BarMemberInsert, { onConflict: 'bar_id,user_id' });

      if (error) {
        throw new Error(`Erreur lors de l'assignation du membre: ${error.message}`);
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
