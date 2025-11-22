import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CategoriesService } from '../../services/supabase/categories.service';

/**
 * Hook pour les mutations de catégories
 * Utilise le pattern Global/Local de l'architecture
 */
export function useCategoryMutations(barId: string) {
    const queryClient = useQueryClient();

    /**
     * Créer une catégorie personnalisée
     */
    const createCategory = useMutation({
        mutationFn: (data: { name: string; color?: string }) =>
            CategoriesService.createCustomCategory(barId, data),
        onSuccess: () => {
            // Invalider le cache des catégories pour forcer un refetch
            queryClient.invalidateQueries({ queryKey: ['stock', 'categories', barId] });
        },
    });

    /**
     * Lier une catégorie globale au bar
     */
    const linkGlobalCategory = useMutation({
        mutationFn: (globalCategoryId: string) =>
            CategoriesService.linkGlobalCategory(barId, globalCategoryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock', 'categories', barId] });
        },
    });

    /**
     * Mettre à jour une catégorie personnalisée
     */
    const updateCategory = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: { name?: string; color?: string } }) =>
            CategoriesService.updateCustomCategory(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock', 'categories', barId] });
        },
    });

    /**
     * Supprimer une catégorie (soft delete)
     */
    const deleteCategory = useMutation({
        mutationFn: (categoryId: string) => CategoriesService.deleteCategory(categoryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock', 'categories', barId] });
        },
    });

    return {
        createCategory,
        linkGlobalCategory,
        updateCategory,
        deleteCategory,
    };
}
