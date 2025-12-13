import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Bar } from '../../types';

type BarRow = Database['public']['Tables']['bars']['Row'];
// type BarInsert = Database['public']['Tables']['bars']['Insert']; // Unused
type BarUpdate = Database['public']['Tables']['bars']['Update'];

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
   */
  private static mapToBar(row: BarRow): Bar {
    return {
      id: row.id,
      name: row.name,
      address: row.address || undefined,
      phone: row.phone || undefined,
      email: undefined, // Pas dans la table bars actuelle
      ownerId: row.owner_id || '',
      createdAt: new Date(row.created_at || Date.now()),
      isActive: row.is_active || false,
      closingHour: (row as any).closing_hour ?? 6, // ✅ Mappage explicite
      settings: row.settings as any,
      // logoUrl: row.logo_url || undefined // ❌ Pas dans l'interface Bar actuelle
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
   * Récupérer un bar par son ID
   */
  static async getBarById(barId: string): Promise<BarWithOwner | null> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .select('*')
        .eq('id', barId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return null;
      }

      // Récupérer le owner
      const { data: owner } = await supabase
        .from('users')
        .select('name, phone')
        .eq('id', data.owner_id || '') // ✅ Fix null check
        .single();

      // Compter les membres actifs
      const { count } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('is_active', true);

      const bar = this.mapToBar(data);

      const barWithOwner: BarWithOwner = {
        ...bar,
        owner_name: owner?.name || '',
        owner_phone: owner?.phone || '',
        member_count: count || 0,
      };

      return barWithOwner;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les bars (super_admin uniquement)
   */
  static async getAllBars(): Promise<BarWithOwner[]> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error('Erreur lors de la récupération des bars');
      }

      // Pour chaque bar, récupérer owner et compter les membres
      const barsWithOwner: BarWithOwner[] = await Promise.all(
        (data || []).map(async (row) => {
          // Récupérer le owner
          const { data: owner } = await supabase
            .from('users')
            .select('name, phone')
            .eq('id', row.owner_id || '') // ✅ Fix null check
            .single();

          // Compter les membres
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
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer les bars d'un utilisateur
   * Utilise un RPC pour contourner les RLS lors de l'impersonation
   */
  static async getUserBars(userId: string): Promise<Bar[]> {
    try {
      // Use RPC to bypass RLS (important for impersonation)
      const { data, error } = await supabase
        .rpc('get_user_bars', { p_user_id: userId });

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

      return this.mapToBar(data); // ✅ Mapper le retour
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
   * Récupérer les statistiques d'un bar
   */
  static async getBarStats(barId: string): Promise<{
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
    pendingSales: number;
  }> {
    try {
      // Nombre de produits actifs
      const { count: productCount } = await supabase
        .from('bar_products')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('is_active', true);

      // Nombre de ventes validées
      const { count: salesCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('status', 'validated');

      // Revenu total (ventes validées)
      const { data: salesData } = await supabase
        .from('sales')
        .select('total')
        .eq('bar_id', barId)
        .eq('status', 'validated');

      const totalRevenue = (salesData || []).reduce((sum, sale) => sum + (sale.total || 0), 0);

      // Ventes en attente
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
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
