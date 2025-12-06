// src/pages/HomePage.tsx
import React, { useState, useMemo } from 'react';
import { ShoppingCart, Grid3x3, List } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { ProductGrid } from '../components/ProductGrid';
import { CategoryFilter } from '../components/CategoryFilter';
import { SearchBar } from '../components/common/SearchBar';
import { Product } from '../types';

export function HomePage() {
  const { products, categories, addToCart } = useAppContext();
  const { currentBar } = useBarContext();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.categoryId === selectedCategory);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.volume && p.volume.toLowerCase().includes(query))
      );
    }

    // Filter by stock (hide out of stock)
    filtered = filtered.filter(p => p.stock > 0);

    return filtered;
  }, [products, selectedCategory, searchQuery]);

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
    </div>
  );
}
