// src/services/supabase/bar.service.ts
import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type BarUpdate = Database['public']['Tables']['bars']['Update'];

export class BarService {
  /**
   * Met à jour un bar (réservé aux admins)
   */
  static async updateBar(barId: string, updates: BarUpdate): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update(updates)
        .eq('id', barId);

      if (error) {
        throw error;
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
