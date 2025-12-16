import { useState } from 'react';
import { Category } from '../types';
import { CategoriesService } from '../services/supabase/categories.service';
import { useFeedback } from './useFeedback';
import { useBarContext } from '../context/BarContext';

/**
 * Hook consolidé pour la gestion complète des catégories
 * Gère: création, édition, suppression, liaison avec catégories globales
 * Gère également l'état des modales associées
 */
export function useCategoryManagement() {
  const { showSuccess, showError } = useFeedback();
  const { currentBar } = useBarContext();

  // État du modal d'ajout/édition
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // État du modal de suppression
  const [deleteCategoryModalOpen, setDeleteCategoryModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  /**
   * Ouvre le modal pour ajouter une nouvelle catégorie
   */
  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };

  /**
   * Ouvre le modal pour éditer une catégorie existante
   */
  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  /**
   * Prépare la suppression d'une catégorie
   */
  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteCategoryModalOpen(true);
  };

  /**
   * Sauvegarde une catégorie (création ou édition)
   */
  const handleSaveCategory = async (
    catData: Omit<Category, 'id' | 'createdAt' | 'barId'>
  ) => {
    if (!currentBar?.id) {
      showError('Bar non sélectionné.');
      return;
    }
    try {
      if (editingCategory) {
        await CategoriesService.updateCustomCategory(editingCategory.id, {
          name: catData.name,
          color: catData.color,
        });
        showSuccess('Catégorie mise à jour.');
      } else {
        await CategoriesService.createCustomCategory(currentBar.id, {
          name: catData.name,
          color: catData.color,
        });
        showSuccess('Catégorie créée.');
      }
      closeAddEditModal();
    } catch (error: any) {
      showError(error.message);
    }
  };

  /**
   * Lie une catégorie globale au bar courant
   */
  const handleLinkGlobalCategory = async (globalCategoryId: string) => {
    if (!currentBar?.id) {
      showError('Bar non sélectionné.');
      return;
    }
    try {
      await CategoriesService.linkGlobalCategory(currentBar.id, globalCategoryId);
      showSuccess('Catégorie globale liée.');
      closeAddEditModal();
    } catch (error: any) {
      showError(error.message);
    }
  };

  /**
   * Confirme et exécute la suppression d'une catégorie
   */
  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await CategoriesService.deleteCategory(categoryToDelete.id);
      showSuccess('Catégorie supprimée.');
      closeDeleteModal();
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase();
      if (errorMessage.includes('restrict') || errorMessage.includes('constraint')) {
        showError(
          'Cette catégorie ne peut pas être supprimée car elle est utilisée par des produits. Supprimez d\'abord les produits qui la référencent ou transférez-les vers une autre catégorie.'
        );
      } else {
        showError(error.message);
      }
    }
  };

  /**
   * Ferme le modal d'ajout/édition
   */
  const closeAddEditModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
  };

  /**
   * Ferme le modal de suppression
   */
  const closeDeleteModal = () => {
    setDeleteCategoryModalOpen(false);
    setCategoryToDelete(null);
  };

  return {
    // État des modales
    isCategoryModalOpen,
    editingCategory,
    deleteCategoryModalOpen,
    categoryToDelete,

    // Handlers de modal
    closeAddEditModal,
    closeDeleteModal,

    // Handlers de catégorie
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleSaveCategory,
    handleLinkGlobalCategory,
    handleConfirmDeleteCategory,
  };
}
