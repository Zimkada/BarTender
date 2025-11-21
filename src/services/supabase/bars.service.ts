import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Bar = Database['public']['Tables']['bars']['Row'];
type BarInsert = Database['public']['Tables']['bars']['Insert'];
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
}

/**
 * Service de gestion des bars
 */
export class BarsService {
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

      return newBar;
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
        .eq('id', data.owner_id)
        .single();

      // Compter les membres actifs
      const { count } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('is_active', true);

      const barWithOwner: BarWithOwner = {
        ...data,
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
        (data || []).map(async (bar) => {
          // Récupérer le owner
          const { data: owner } = await supabase
            .from('users')
            .select('name, phone')
            .eq('id', bar.owner_id)
            .single();

          // Compter les membres
          const { count } = await supabase
            .from('bar_members')
            .select('*', { count: 'exact', head: true })
            .eq('bar_id', bar.id)
            .eq('is_active', true);

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
   */
  static async getUserBars(userId: string): Promise<Bar[]> {
    try {
      const { data, error } = await supabase
        .from('bar_members')
        .select(`
          bars (*)
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        throw new Error('Erreur lors de la récupération des bars');
      }

      return (data || []).map((member: any) => member.bars);
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un bar
   */
  static async updateBar(barId: string, updates: BarUpdate): Promise<Bar> {
    try {
      const { data, error } = await supabase
        .from('bars')
        .update(updates)
        .eq('id', barId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour du bar');
      }

      return data;
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
