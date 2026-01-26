import { supabase } from '../../lib/supabase';

/**
 * Service de détection automatique de complétion des tâches d'onboarding
 * Utilisé par RedirectStep pour polling
 */
export class OnboardingCompletionService {
    /**
     * Vérifie si des produits ont été ajoutés au bar
     */
    static async checkProductsAdded(barId: string): Promise<{ complete: boolean; count: number }> {
        const { count, error } = await supabase
            .from('bar_products')
            .select('*', { count: 'exact', head: true })
            .eq('bar_id', barId)
            .eq('is_active', true);

        if (error) {
            console.error('Error checking products:', error);
            return { complete: false, count: 0 };
        }

        const actualCount = count || 0;
        return { complete: actualCount > 0, count: actualCount };
    }

    /**
     * Vérifie si le stock a été initialisé (au moins 1 produit avec stock > 0)
     */
    static async checkStockInitialized(barId: string): Promise<{ complete: boolean; count: number }> {
        const { count, error } = await supabase
            .from('bar_products')
            .select('*', { count: 'exact', head: true })
            .eq('bar_id', barId)
            .eq('is_active', true)
            .gt('current_stock', 0);

        if (error) {
            console.error('Error checking stock:', error);
            return { complete: false, count: 0 };
        }

        const actualCount = count || 0;
        return { complete: actualCount > 0, count: actualCount };
    }

    /**
     * Vérifie si des serveurs ont été ajoutés
     */
    static async checkServersAdded(barId: string): Promise<{ complete: boolean; count: number }> {
        const { count, error } = await supabase
            .from('bar_members')
            .select('*', { count: 'exact', head: true })
            .eq('bar_id', barId)
            .eq('role', 'serveur')
            .eq('is_active', true);

        if (error) {
            console.error('Error checking servers:', error);
            return { complete: false, count: 0 };
        }

        const actualCount = count || 0;
        return { complete: actualCount > 0, count: actualCount };
    }

    /**
     * Vérifie si des gérants ont été ajoutés
     */
    static async checkManagersAdded(barId: string): Promise<{ complete: boolean; count: number }> {
        const { count, error } = await supabase
            .from('bar_members')
            .select('*', { count: 'exact', head: true })
            .eq('bar_id', barId)
            .eq('role', 'gérant')
            .eq('is_active', true);

        if (error) {
            console.error('Error checking managers:', error);
            return { complete: false, count: 0 };
        }

        const actualCount = count || 0;
        return { complete: actualCount > 0, count: actualCount };
    }

    /**
     * Vérifie toutes les tâches obligatoires pour le propriétaire
     */
    static async checkOwnerMandatoryTasks(barId: string): Promise<{
        barDetailsComplete: boolean;
        productsAdded: boolean;
    }> {
        const { data: bar } = await supabase
            .from('bars')
            .select('name, location')
            .eq('id', barId)
            .single();

        return {
            barDetailsComplete: !!(bar?.name && bar?.location),
            productsAdded: (await this.checkProductsAdded(barId)).complete,
        };
    }
}
