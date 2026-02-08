import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { GlobalCategory as GlobalCategoryType } from '../../types';

type BarCategory = Database['public']['Tables']['bar_categories']['Row'];
type BarCategoryInsert = Database['public']['Tables']['bar_categories']['Insert'];
type BarCategoryUpdate = Database['public']['Tables']['bar_categories']['Update'];
type GlobalCategoryRow = Database['public']['Tables']['global_categories']['Row'];
type GlobalCategoryInsert = Database['public']['Tables']['global_categories']['Insert'];
type GlobalCategoryUpdate = Database['public']['Tables']['global_categories']['Update'];

/**
 * Interface pour une catégorie enrichie (avec données globales si applicable)
 */
export interface EnrichedBarCategory extends BarCategory {
    global_category?: GlobalCategoryRow | null;
}

export interface CategoryWithGlobal extends BarCategory {
    global_category?: GlobalCategoryRow | null;
}

/**
 * Service de gestion des catégories de bar
 * 
 * ARCHITECTURE:
 * - Une catégorie peut être une RÉFÉRENCE à une catégorie globale (global_category_id)
 * - OU une catégorie PERSONNALISÉE (custom_name + custom_color)
 * - Jamais les deux en même temps (contrainte CHECK en DB)
 */
export class CategoriesService {
    /**
     * Récupérer toutes les catégories d'un bar avec enrichissement
     */
    static async getCategories(barId: string): Promise<EnrichedBarCategory[]> {
        try {
            const { data, error } = await supabase
                .from('bar_categories')
                .select(`
          *,
          global_category:global_categories (*)
        `)
                .eq('bar_id', barId)
                .eq('is_active', true);

            if (error) {
                throw new Error('Erreur lors de la récupération des catégories');
            }

            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer les catégories d'un bar avec les données globales
     */
    static async getBarCategoriesWithGlobal(barId: string): Promise<CategoryWithGlobal[]> {
        try {
            const { data, error } = await supabase
                .from('bar_categories')
                .select(`
          *,
          global_category:global_categories (*)
        `)
                .eq('bar_id', barId)
                .eq('is_active', true);

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Créer une catégorie personnalisée (custom)
     */
    static async createCustomCategory(
        barId: string,
        data: { name: string; color?: string }
    ): Promise<BarCategory> {
        try {
            console.log('[CategoriesService] Creating custom category:', { barId, data });
            // ✅ Type-safe payload using Database Insert type
            const payload: BarCategoryInsert = {
                bar_id: barId,
                custom_name: data.name,
                custom_color: data.color || '#3B82F6',
                is_active: true,
            };
            console.log('[CategoriesService] Payload:', payload);

            const { data: newCategory, error } = await supabase
                .from('bar_categories')
                .insert(payload)
                .select()
                .single();

            if (error) {
                console.error('[CategoriesService] Supabase Error:', error);
                throw new Error(error.message || 'Erreur lors de la création de la catégorie');
            }

            if (!newCategory) {
                throw new Error('Erreur inconnue: Aucune donnée retournée');
            }

            return newCategory;
        } catch (error) {
            console.error('[CategoriesService] Catch Error:', error);
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Lier une catégorie globale à un bar
     */
    static async linkGlobalCategory(
        barId: string,
        globalCategoryId: string
    ): Promise<BarCategory> {
        try {
            // ✅ Type-safe payload using Database Insert type
            const payload: BarCategoryInsert = {
                bar_id: barId,
                global_category_id: globalCategoryId,
                is_active: true,
            };

            const { data: newCategory, error } = await supabase
                .from('bar_categories')
                .insert(payload)
                .select()
                .single();

            if (error || !newCategory) {
                throw new Error('Erreur lors de l\'ajout de la catégorie globale');
            }

            return newCategory;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Mettre à jour une catégorie personnalisée
     * Note: On ne peut mettre à jour que les catégories custom (custom_name/custom_color)
     */
    static async updateCustomCategory(
        categoryId: string,
        updates: { name?: string; color?: string }
    ): Promise<BarCategory> {
        try {
            // ✅ Type-safe update payload using Database Update type
            const updateData: BarCategoryUpdate = {};
            if (updates.name !== undefined) updateData.custom_name = updates.name;
            if (updates.color !== undefined) updateData.custom_color = updates.color;

            const { data, error } = await supabase
                .from('bar_categories')
                .update(updateData)
                .eq('id', categoryId)
                .select()
                .single();

            if (error || !data) {
                throw new Error('Erreur lors de la mise à jour de la catégorie');
            }

            return data;
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Supprimer une catégorie (soft delete)
     */
    static async deleteCategory(categoryId: string): Promise<void> {
        try {
            // ✅ Type-safe soft delete using Database Update type
            const updatePayload: BarCategoryUpdate = { is_active: false };

            const { error } = await supabase
                .from('bar_categories')
                .update(updatePayload)
                .eq('id', categoryId);

            if (error) {
                // Check if error is due to RESTRICT constraint (products using this category)
                const errorMessage = error.message?.toLowerCase() || '';
                if (errorMessage.includes('restrict') || errorMessage.includes('constraint') || errorMessage.includes('fk_bar_products_local_category')) {
                    throw new Error('Cette catégorie ne peut pas être supprimée car elle est utilisée par des produits. Supprimez d\'abord les produits qui la référencent ou transférez-les vers une autre catégorie.');
                }
                throw new Error('Erreur lors de la suppression de la catégorie');
            }
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Récupérer toutes les catégories globales (pour le catalogue)
     */
    static async getGlobalCategories(): Promise<GlobalCategoryType[]> {
        try {
            const { data, error } = await supabase
                .from('global_categories')
                .select('*')
                .eq('is_active', true)
                .order('order_index', { ascending: true })
                .order('name', { ascending: true });

            if (error) {
                throw new Error('Erreur lors de la récupération des catégories globales');
            }

            return (data || []).map((cat: GlobalCategoryRow) => ({
                id: cat.id,
                name: cat.name,
                color: cat.color || '#3B82F6',
                icon: cat.icon || undefined,
                orderIndex: cat.order_index ?? 0,
                isSystem: cat.is_system ?? false,
                createdAt: new Date(cat.created_at || Date.now())
            }));
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Créer une catégorie globale (Super Admin)
     */
    static async createGlobalCategory(data: Partial<GlobalCategoryType>): Promise<GlobalCategoryType> {
        try {
            // ✅ Type-safe payload transformation from app type to DB type
            const payload: GlobalCategoryInsert = {
                name: data.name!,
                color: data.color,
                icon: data.icon,
                order_index: data.orderIndex,
                is_system: data.isSystem,
            };

            const { data: newCategory, error } = await supabase
                .from('global_categories')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            // Map to GlobalCategoryType
            const result = newCategory as GlobalCategoryRow;
            return {
                id: result.id,
                name: result.name,
                color: result.color || '#3B82F6',
                icon: result.icon || undefined,
                orderIndex: result.order_index ?? 0,
                isSystem: result.is_system ?? false,
                createdAt: new Date(result.created_at || Date.now())
            };
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Mettre à jour une catégorie globale (Super Admin)
     */
    static async updateGlobalCategory(id: string, updates: Partial<GlobalCategoryType>): Promise<GlobalCategoryType> {
        try {
            // ✅ Type-safe payload transformation from app type to DB type
            const payload: GlobalCategoryUpdate = {};
            if (updates.name !== undefined) payload.name = updates.name;
            if (updates.color !== undefined) payload.color = updates.color;
            if (updates.icon !== undefined) payload.icon = updates.icon;
            if (updates.orderIndex !== undefined) payload.order_index = updates.orderIndex;
            if (updates.isSystem !== undefined) payload.is_system = updates.isSystem;

            const { data, error } = await supabase
                .from('global_categories')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // Map to GlobalCategoryType
            const result = data as GlobalCategoryRow;
            return {
                id: result.id,
                name: result.name,
                color: result.color || '#3B82F6',
                icon: result.icon || undefined,
                orderIndex: result.order_index ?? 0,
                isSystem: result.is_system ?? false,
                createdAt: new Date(result.created_at || Date.now())
            };
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * Supprimer une catégorie globale (Super Admin) - Soft delete
     */
    static async deleteGlobalCategory(id: string): Promise<void> {
        try {
            // ✅ Type-safe soft delete using Database Update type
            const updatePayload: GlobalCategoryUpdate = { is_active: false };

            const { error } = await supabase
                .from('global_categories')
                .update(updatePayload)
                .eq('id', id);

            if (error) {
                // Check if error is due to RESTRICT constraint (products using this category)
                const errorMessage = error.message?.toLowerCase() || '';
                if (errorMessage.includes('restrict') || errorMessage.includes('constraint') || errorMessage.includes('fk_global_products_category')) {
                    throw new Error('Cette catégorie ne peut pas être supprimée car elle est utilisée par des produits globaux. Supprimez d\'abord les produits qui la référencent ou transférez-les vers une autre catégorie.');
                }
                throw new Error('Erreur lors de la suppression de la catégorie');
            }
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }
}
