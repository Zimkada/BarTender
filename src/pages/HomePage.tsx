import { useState, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { ProductGrid } from '../components/ProductGrid';
import { CategoryFilter } from '../components/CategoryFilter';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryModal } from '../components/CategoryModal';
import { ConfirmModal } from '../components/ui/Modal';
import { Product } from '../types';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useStock } from '../context/hooks/useStock';
import { ProductGridSkeleton } from '../components/skeletons';

export default function HomePage() {
  const { addToCart, cart } = useAppContext();
  const { currentBar } = useBarContext();

  const { products, categories, getProductStockInfo, isLoading } = useStock();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const productsWithAvailableStock = useMemo(() => {
    return products.map(product => {
      const stockInfo = getProductStockInfo(product.id);
      return {
        ...product,
        stock: stockInfo?.availableStock ?? 0 // Override 'stock' with availableStock
      };
    });
  }, [products, getProductStockInfo]);

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
    onlyInStock: false
  });

  // 2. Le retour anticipé est placé après tous les hooks
  if (!currentBar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-gray-800 p-4">
        <h1 className="text-display text-brand-dark mb-3">Bienvenue sur BarTender</h1>
        <p className="text-body text-gray-600">Sélectionnez un bar pour commencer.</p>
      </div>
    );
  }

  const handleAddToCart = (product: Product) => {
    addToCart(product);
  };

  // 3. Le reste du rendu du composant
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      {/* Header — typographie 2026, hiérarchie claire */}
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-micro text-gray-500 uppercase mb-1">{currentBar.name}</p>
            <h1 className="text-h1 text-gray-900">
              Vente <span className="text-brand-primary">rapide</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-subtle rounded-full border border-brand-subtle flex-shrink-0">
            <ShoppingCart size={14} className="text-brand-primary" />
            <span className="text-caption text-brand-dark">
              <span className="font-semibold">{products.length}</span>
              <span className="text-gray-500 ml-1">produits</span>
            </span>
          </div>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Rechercher un produit..."
          className="w-full"
        />
      </div>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={handleAddCategory}
        productCounts={products.reduce((acc: Record<string, number>, p) => {
          acc[p.categoryId] = (acc[p.categoryId] || 0) + 1;
          return acc;
        }, {})}
      />

      {/* Product Grid — plate, sans encadrement (aération) */}
      <div className="min-h-[600px]">
        {isLoading ? (
          <ProductGridSkeleton count={12} />
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-body">Aucun produit trouvé</p>
          </div>
        ) : (
          <ProductGrid
            products={filteredProducts}
            onAddToCart={handleAddToCart}
            cart={cart}
            getAvailableStock={(productId) => getProductStockInfo(productId)?.availableStock}
            categoryName={
              selectedCategory === 'all'
                ? undefined
                : categories.find(c => c.id === selectedCategory)?.name
            }
          />
        )}
      </div>

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
