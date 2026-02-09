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
import { useUnifiedStock } from '../hooks/pivots/useUnifiedStock';
import { useUnifiedSales } from '../hooks/pivots/useUnifiedSales';
import { ProductGridSkeleton } from '../components/skeletons';

export default function HomePage() {
  // 1. Tous les hooks sont appelés inconditionnellement en haut
  const { categories, addToCart } = useAppContext();
  const { currentBar } = useBarContext();
  const stockManager = useUnifiedStock(currentBar?.id);
  const { sales, isLoading: isLoadingSales, refetch: refetchSales } = useUnifiedSales(currentBar?.id);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const productsWithAvailableStock = useMemo(() => {
    return stockManager.products.map(product => {
      const stockInfo = stockManager.getProductStockInfo(product.id);
      return {
        ...product,
        stock: stockInfo?.availableStock ?? 0 // Override 'stock' with availableStock
      };
    });
  }, [stockManager.products, stockManager.getProductStockInfo]);

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
        <h1 className="text-3xl font-bold text-brand-dark mb-4">Bienvenue sur BarTender !</h1>
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
      {/* Header Premium */}
      <Card variant="elevated" padding="default" className="border-brand-subtle bg-white/40 backdrop-blur-md overflow-hidden relative">
        {/* Subtle background glow */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-primary/10 blur-3xl rounded-full"></div>

        <div className="flex items-center justify-between mb-6 relative z-10">
          <div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">Vente</h2>
              <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tighter leading-tight">Rapide</h3>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1.5">{currentBar.name}</p>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-brand-subtle rounded-2xl border border-brand-subtle shadow-sm hover:shadow-md transition-all group">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-brand-primary shadow-sm group-hover:scale-110 transition-transform">
              <ShoppingCart size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-brand-dark leading-none">{stockManager.products.length}</span>
              <span className="text-[9px] font-black text-brand-primary uppercase tracking-wider">produits</span>
            </div>
          </div>
        </div>

        {/* Search Premium */}
        <div className="relative z-10">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher un produit..."
            className="w-full bg-white/60 focus-within:bg-white transition-all border-brand-subtle shadow-inner"
          />
        </div>
      </Card>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={handleAddCategory}
        productCounts={stockManager.products.reduce((acc: Record<string, number>, p) => {
          acc[p.categoryId] = (acc[p.categoryId] || 0) + 1;
          return acc;
        }, {})}
      />

      {/* Product Grid */}
      <Card variant="elevated" padding="default" className="border-brand-subtle min-h-[600px]">
        {stockManager.isLoading ? (
          <ProductGridSkeleton count={12} />
        ) : stockManager.products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-lg font-medium">Aucun produit trouvé</p>
          </div>
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
