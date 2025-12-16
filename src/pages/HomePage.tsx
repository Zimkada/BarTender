// src/pages/HomePage.tsx
import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../hooks/useFeedback';
import { ProductGrid } from '../components/ProductGrid';
import { CategoryFilter } from '../components/CategoryFilter';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryModal } from '../components/CategoryModal';
import { ConfirmModal } from '../components/ui/Modal';
import { CategoriesService } from '../services/supabase/categories.service';
import { Product, Category } from '../types';

import { useFilteredProducts } from '../hooks/useFilteredProducts';

export function HomePage() {
  const { products, categories, addToCart } = useAppContext();
  const { currentBar } = useBarContext();
  const { showSuccess, showError } = useFeedback();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Category management states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategoryModalOpen, setDeleteCategoryModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  // Utilisation du hook centralisé pour le filtrage
  const filteredProducts = useFilteredProducts({
    products,
    searchQuery,
    selectedCategory,
    onlyInStock: true
  });

  const handleCategoriesUpdated = () => {
    // AppContext will automatically refresh categories on mount
    // or when the bar is switched
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteCategoryModalOpen(true);
  };

  const handleSaveCategory = async (catData: Omit<Category, 'id' | 'createdAt' | 'barId'>) => {
    if (!currentBar?.id) {
      showError("Bar non sélectionné.");
      return;
    }
    try {
      if (editingCategory) {
        await CategoriesService.updateCustomCategory(editingCategory.id, {
          name: catData.name,
          color: catData.color,
        });
        showSuccess("Catégorie mise à jour.");
      } else {
        await CategoriesService.createCustomCategory(currentBar.id, {
          name: catData.name,
          color: catData.color,
        });
        showSuccess("Catégorie créée.");
      }
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      handleCategoriesUpdated();
    } catch (error: any) {
      showError(error.message);
    }
  };

  const handleLinkGlobalCategory = async (globalCategoryId: string) => {
    if (!currentBar?.id) {
      showError("Bar non sélectionné.");
      return;
    }
    try {
      await CategoriesService.linkGlobalCategory(currentBar.id, globalCategoryId);
      showSuccess("Catégorie globale liée.");
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      handleCategoriesUpdated();
    } catch (error: any) {
      showError(error.message);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await CategoriesService.deleteCategory(categoryToDelete.id);
      showSuccess("Catégorie supprimée.");
      setDeleteCategoryModalOpen(false);
      setCategoryToDelete(null);
      handleCategoriesUpdated();
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase();
      if (errorMessage.includes('restrict') || errorMessage.includes('constraint')) {
        showError('Cette catégorie ne peut pas être supprimée car elle est utilisée par des produits. Supprimez d\'abord les produits qui la référencent ou transférez-les vers une autre catégorie.');
      } else {
        showError(error.message);
      }
    }
  };

  const handleAddToCart = (product: Product) => {
    addToCart(product);
  };

  if (!currentBar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-gray-800 p-4">
        <h1 className="text-3xl font-bold text-amber-700 mb-4">Bienvenue sur BarTender !</h1>
        <p className="text-lg text-gray-600">Sélectionnez un bar pour commencer.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Vente Rapide</h1>
            <p className="text-sm text-gray-500">{currentBar.name}</p>
          </div>
          <div className="flex items-center gap-2 text-amber-600">
            <ShoppingCart size={24} />
            <span className="text-sm font-medium">{products.length} produits</span>
          </div>
        </div>

        {/* Search */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Rechercher un produit..."
        />
      </div>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={() => {
          setEditingCategory(null);
          setIsCategoryModalOpen(true);
        }}
        productCounts={products.reduce((acc, p) => {
          acc[p.categoryId] = (acc[p.categoryId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)}
      />

      {/* Product Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
        <ProductGrid
          products={filteredProducts}
          onAddToCart={handleAddToCart}
          categoryName={
            selectedCategory === 'all'
              ? undefined
              : categories.find(c => c.id === selectedCategory)?.name
          }
        />
      </div>

      {/* Category Modal for Add/Edit */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        onSave={handleSaveCategory}
        onLinkGlobal={handleLinkGlobalCategory}
        category={editingCategory || undefined}
      />

      {/* Confirm Modal for Delete Category */}
      <ConfirmModal
        open={deleteCategoryModalOpen}
        onClose={() => {
          setDeleteCategoryModalOpen(false);
          setCategoryToDelete(null);
        }}
        onConfirm={handleConfirmDeleteCategory}
        title="Supprimer la catégorie"
        description={`Êtes-vous sûr de vouloir supprimer la catégorie "${categoryToDelete?.name}" ?`}
        requireConfirmation={true}
        confirmationValue={categoryToDelete?.name || ''}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
      />
    </div>
  );
}
