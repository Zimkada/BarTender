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
                .eq('is_active', true)
                // 🛡️ §3 — BOISSONS uniquement. Ce service alimente le catalogue
                // produits : sans ce filtre, les catégories de plats
                // (type='dish') y remonteraient pour les bars-restos.
                // Les catégories de plats se lisent via getDishCategories().
                .eq('type', 'product');

            if (error) {
                throw new Error('Erreur lors de la récupération des catégories');
            }

            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * ⭐ Catégories de PLATS (§13.10) — module restauration.
     *
     * ⚠️ N'appeler que si `hasRestaurant` : §3, pas un octet d'egress sur un
     * bar pur. La query `useDishCategories` porte la garde.
     *
     * ⚠️ Pas de jointure `global_categories` ici, contrairement aux boissons :
     * il n'existe pas de catalogue global de plats. Une catégorie de plats est
     * toujours propre au bar (custom_name), ce qui rend la requête plus légère.
     */
    static async getDishCategories(barId: string): Promise<BarCategory[]> {
        try {
            const { data, error } = await supabase
                .from('bar_categories')
                .select('*')
                .eq('bar_id', barId)
                .eq('is_active', true)
                .eq('type', 'dish');

            if (error) throw error;
            return data || [];
        } catch (error) {
            throw new Error(handleSupabaseError(error));
        }
    }

    /**
     * ⭐ Créer une catégorie de PLATS.
     *
     * ⚠️ Distincte de `createCustomCategory` par le seul `type`, mais méthode
     * SÉPARÉE volontairement : un paramètre `type` optionnel sur la méthode
     * existante ferait dépendre l'étanchéité d'un argument qu'on peut oublier.
     * Deux méthodes explicites valent mieux qu'un drapeau silencieux.
     *
     * ⚠️⚠️ L'UNICITÉ EN BASE NE PROTÈGE RIEN ICI — vérifié, pas supposé.
     *
     * La contrainte relevée en prod est `UNIQUE (bar_id, name)`, sur la colonne
     * `name`. Or les catégories personnalisées — plats ET boissons, c'est le
     * comportement existant du projet — écrivent `custom_name` et laissent
     * `name` à NULL. En SQL, NULL n'entre PAS dans une contrainte d'unicité :
     * deux catégories custom homonymes passent donc sans erreur.
     *
     * ⭐ D'où la garde APPLICATIVE ci-dessous. Sans elle, un promoteur pourrait
     * créer deux fois « Grillades » et ne plus savoir laquelle rattacher à quel
     * plat.
     *
     * ⚠️ Le garde 23505 est CONSERVÉ malgré tout : si `name` venait à être
     * rempli un jour (backfill, autre chemin d'écriture), la contrainte
     * mordrait et l'erreur Postgres brute serait illisible.
     */
    static async createDishCategory(
        barId: string,
        data: { name: string; color?: string }
    ): Promise<BarCategory> {
        try {
            const trimmed = data.name.trim();
            if (!trimmed) {
                throw new Error('Le nom de la catégorie est obligatoire');
            }

            // ⭐ Garde applicative — l'unicité SQL ne mord pas sur `custom_name`
            // (cf. commentaire ci-dessus). Comparaison insensible à la casse :
            // « Grillades » et « grillades » sont la même catégorie.
            //
            // ⚠️ Ne compare qu'aux catégories ACTIVES (getDishCategories filtre
            // is_active = true) — c'est VOULU : une catégorie supprimée (soft
            // delete) ne doit pas bloquer la re-création d'un homonyme. Même
            // parti pris que l'index partiel `idx_ingredients_unique_name_per_bar`
            // de la phase 1.
            //
            // ⚠️ Fenêtre de concurrence assumée : deux créations simultanées du
            // même nom passeraient toutes deux la garde. Le cas suppose deux
            // utilisateurs créant LA MÊME catégorie à LA MÊME seconde sur le
            // même bar — négligeable ici, et le coût d'une vraie protection
            // (contrainte SQL sur custom_name, donc migration d'une table en
            // production) serait sans commune mesure.
            const existing = await CategoriesService.getDishCategories(barId);
            const clash = existing.some(
                (c) => (c.custom_name || c.name || '').trim().toLowerCase() === trimmed.toLowerCase()
            );
            if (clash) {
                throw new Error(`La catégorie « ${trimmed} » existe déjà.`);
            }

            const payload: BarCategoryInsert = {
                bar_id: barId,
                custom_name: trimmed,
                custom_color: data.color || '#F59E0B',
                is_active: true,
                type: 'dish',
            };

            const { data: newCategory, error } = await supabase
                .from('bar_categories')
                .insert(payload)
                .select()
                .single();

            if (error || !newCategory) {
                // 23505 = violation d'unicité. Le message Postgres brut
                // ('duplicate key value violates unique constraint...') serait
                // incompréhensible pour un promoteur.
                if (error?.code === '23505') {
                    throw new Error(
                        `Le nom « ${data.name} » est déjà utilisé par une autre catégorie de ce bar.`
                    );
                }
                throw new Error(error?.message || 'Erreur lors de la création de la catégorie');
            }

            return newCategory;
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
                .eq('is_active', true)
                // 🛡️ §3 — BOISSONS uniquement, même raison que getCategories.
                .eq('type', 'product');

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
                // 🛡️ §3 — explicite plutôt que de compter sur le DEFAULT SQL :
                // ce service crée des catégories de BOISSONS. Les catégories de
                // plats passeront par leur propre service (type='dish').
                type: 'product',
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
                // 🛡️ §3 — le catalogue global ne contient que des boissons.
                type: 'product',
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
