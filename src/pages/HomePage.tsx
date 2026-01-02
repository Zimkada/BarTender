// src/pages/HomePage.tsx
import { useState, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { ProductGrid } from '../components/ProductGrid';
import { CategoryFilter } from '../components/CategoryFilter';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryModal } from '../components/CategoryModal';
import { ConfirmModal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Product } from '../types';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useStockManagement } from '../hooks/useStockManagement';
import { ProductGridSkeleton } from '../components/skeletons';

export default function HomePage() {
  // 1. Tous les hooks sont appelés inconditionnellement en haut
  const { categories, addToCart } = useAppContext();
  const { currentBar } = useBarContext();
  const { products: allProducts, getProductStockInfo } = useStockManagement();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const productsWithAvailableStock = useMemo(() => {
    return allProducts.map(product => {
      const stockInfo = getProductStockInfo(product.id);
      return {
        ...product,
        stock: stockInfo?.availableStock ?? 0 // Override 'stock' with availableStock
      };
    });
  }, [allProducts, getProductStockInfo]);

  const {
    isCategoryModalOpen,
    editingCategory,
    deleteCategoryModalOpen,
    categoryToDelete,
    closeAddEditModal,
    closeDeleteModal,
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleSaveCategory,
    handleLinkGlobalCategory,
    handleConfirmDeleteCategory,
  } = useCategoryManagement();

  const filteredProducts = useFilteredProducts({
    products: productsWithAvailableStock,
    searchQuery,
    selectedCategory,
    onlyInStock: true
  });

  // 2. Le retour anticipé est placé après tous les hooks
  if (!currentBar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-gray-800 p-4">
        <h1 className="text-3xl font-bold text-amber-700 mb-4">Bienvenue sur BarTender !</h1>
        <p className="text-lg text-gray-600">Sélectionnez un bar pour commencer.</p>
      </div>
    );
  }

  const handleAddToCart = (product: Product) => {
    addToCart(product);
  };

  // 3. Le reste du rendu du composant
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card variant="elevated" padding="default" className="border-amber-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Vente Rapide</h2>
            <p className="text-sm text-gray-500">{currentBar.name}</p>
          </div>
          <div className="flex items-center gap-2 text-amber-600">
            <ShoppingCart size={24} />
            <span className="text-sm font-medium">{allProducts.length} produits</span>
          </div>
        </div>

        {/* Search */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Rechercher un produit..."
        />
      </Card>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={handleAddCategory}
        productCounts={allProducts.reduce((acc, p) => {
          acc[p.categoryId] = (acc[p.categoryId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)}
      />

      {/* Product Grid */}
      <Card variant="elevated" padding="default" className="border-amber-100 min-h-[600px]">
        {allProducts.length === 0 ? (
          <ProductGridSkeleton count={12} />
        ) : (
          <ProductGrid
            products={filteredProducts}
            onAddToCart={handleAddToCart}
            categoryName={
              selectedCategory === 'all'
                ? undefined
                : categories.find(c => c.id === selectedCategory)?.name
            }
          />
        )}
      </Card>

      {/* Category Modal for Add/Edit */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={closeAddEditModal}
        onSave={handleSaveCategory}
        onLinkGlobal={handleLinkGlobalCategory}
        category={editingCategory || undefined}
      />

      {/* Confirm Modal for Delete Category */}
      <ConfirmModal
        open={deleteCategoryModalOpen}
        onClose={closeDeleteModal}
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
