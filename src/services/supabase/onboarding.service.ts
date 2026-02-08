import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { auditLogger } from '../AuditLogger';

type BarUpdate = Database['public']['Tables']['bars']['Update'];
type BarRow = Database['public']['Tables']['bars']['Row'];

interface OnboardingAtomicResult {
  success: boolean;
  completed_at?: string;
  error?: string;
}

/**
 * Onboarding Service
 * Handles all database operations for the onboarding workflow
 * - Bar setup completion
 * - Manager/Staff assignment
 * - Product catalog & stock initialization
 * - Audit logging
 */
export class OnboardingService {
  /**
   * Launch bar: Mark setup as complete
   * Called from ReviewStep.tsx when owner clicks "Launch Bar"
   */
  static async launchBar(barId: string, ownerId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({
          is_setup_complete: true,
          setup_completed_at: new Date().toISOString(),
        } as BarUpdate)
        .eq('id', barId)
        .eq('owner_id', ownerId);

      if (error) {
        throw new Error(`Failed to launch bar: ${error.message}`);
      }

      // Log audit event
      await auditLogger.log({
        event: 'BAR_UPDATED',
        severity: 'info',
        userId: ownerId,
        userName: 'System',
        userRole: 'promoteur',
        barId: barId,
        description: 'Owner completed onboarding setup and launched bar',
      });
    } catch (error: unknown) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Verify manager exists before assigning
   * Checks that user exists in auth.users
   */
  static async verifyManagerExists(userId: string): Promise<boolean> {
    try {
      const { data: user, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update bar operating mode
   * Can be called from BarDetailsStep or anytime before launch
   */
  static async updateBarMode(
    barId: string,
    mode: 'full' | 'simplifié',
    updatedByUserId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('bars')
        .update({
          operating_mode: mode,
        } as BarUpdate)
        .eq('id', barId)
        .eq('owner_id', updatedByUserId);

      if (error) {
        throw new Error(`Failed to update mode: ${error.message}`);
      }

      await auditLogger.log({
        event: 'BAR_UPDATED',
        severity: 'info',
        userId: updatedByUserId,
        userName: 'System',
        userRole: 'promoteur',
        barId: barId,
        description: `Operating mode changed to ${mode}`,
        metadata: { mode },
      });
    } catch (error: unknown) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Verify bar is ready for sales
   * Checks all onboarding requirements
   */
  static async verifyBarReady(barId: string): Promise<{
    isReady: boolean;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];

      // Check 1: Bar details complete
      const { data: bar, error: barError } = await supabase
        .from('bars')
        .select('id, name, address, closing_hour, settings')
        .eq('id', barId)
        .single();

      if (barError || !bar) {
        errors.push('Bar not found');
        return { isReady: false, errors };
      }

      if (!bar.name || !bar.address) {
        errors.push('Bar details incomplete');
      }

      if (bar.closing_hour === null) {
        errors.push('Closing hour not set');
      }

      // Check 2: At least 1 product
      const { data: products, error: productsError } = await supabase
        .from('bar_products')
        .select('id')
        .eq('bar_id', barId);

      if (productsError) {
        errors.push('Failed to check products');
      }

      if (!products || products.length === 0) {
        errors.push('No products added');
      }

      // Check 3: Stock exists for products (can be 0)
      if (products && products.length > 0) {
        const { count: stockCount, error: stockError } = await supabase
          .from('supplies')
          .select('*', { count: 'exact', head: true })
          .eq('bar_id', barId);

        if (stockError) {
          errors.push('Failed to check stock');
        }

        if (!stockCount || stockCount === 0) {
          errors.push('No stock initialized');
        }
      }

      return {
        isReady: errors.length === 0,
        errors,
      };
    } catch (error: unknown) {
      return {
        isReady: false,
        errors: [handleSupabaseError(error)],
      };
    }
  }

  /**
   * Get onboarding progress for a bar
   * Useful for resuming or tracking
   */
  static async getOnboardingProgress(barId: string): Promise<{
    barName: string;
    isSetupComplete: boolean;
    completedAt: string | null;
    managerCount: number;
    serverCount: number;
    productCount: number;
    hasStock: boolean;
  }> {
    try {
      // Get bar info
      const { data: bar } = await supabase
        .from('bars')
        .select('name, settings, is_setup_complete, setup_completed_at')
        .eq('id', barId)
        .single();

      // Get counts
      const { count: managerCount } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('role', 'gérant');

      const { count: serverCount } = await supabase
        .from('bar_members')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId)
        .eq('role', 'serveur');

      const { count: productCount } = await supabase
        .from('bar_products')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId);

      const { count: stockCount } = await supabase
        .from('supplies')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', barId);

      return {
        barName: bar?.name || 'Unknown',
        isSetupComplete: bar?.is_setup_complete === true,
        completedAt: bar?.setup_completed_at || null,
        managerCount: managerCount || 0,
        serverCount: serverCount || 0,
        productCount: productCount || 0,
        hasStock: (stockCount || 0) > 0,
      };
    } catch (error: unknown) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Complete bar onboarding atomically using RPC
   *
   * PHASE 2 IMPLEMENTATION: Atomic transaction for production safety
   * Replaces multiple sequential API calls with single RPC call
   * Prevents partial failures and improves performance
   *
   * Called from ReviewStep.tsx as alternative to multiple sequential calls
   */
  static async completeBarOnboardingAtomic(
    barId: string,
    ownerId: string,
    operatingMode?: 'full' | 'simplifié'
  ): Promise<{ success: boolean; completedAt?: string; error?: string }> {
    try {
      // @ts-expect-error - RPC complete_bar_onboarding non incluse dans les types générés
      const { data, error } = await supabase.rpc('complete_bar_onboarding', {
        p_bar_id: barId,
        p_owner_id: ownerId,
        p_operating_mode: operatingMode || 'simplifié',
      });

      if (error) {
        throw new Error(`RPC failed: ${error.message}`);
      }

      // Cast unknown to expected result type
      const result = (Array.isArray(data) ? data[0] : data) as unknown as OnboardingAtomicResult | null;

      if (!result?.success) {
        throw new Error(result?.error || 'Unknown error in RPC');
      }

      // Log completion
      await auditLogger.log({
        event: 'BAR_UPDATED',
        severity: 'info',
        userId: ownerId,
        userName: 'System',
        userRole: 'promoteur',
        barId: barId,
        description: 'Owner completed onboarding using atomic RPC',
        metadata: { operating_mode: operatingMode },
      });

      return {
        success: true,
        completedAt: result.completed_at,
      };
    } catch (error: unknown) {
      console.error('Atomic onboarding failed:', error);
      return {
        success: false,
        error: handleSupabaseError(error),
      };
    }
  }
}
