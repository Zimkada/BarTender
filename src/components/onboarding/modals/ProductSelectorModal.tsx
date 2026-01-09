import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Product {
  id: string;
  name: string;
  category_id: string;
  global_price: number;
}

interface Category {
  id: string;
  name: string;
}

interface SelectedProduct {
  productId: string;
  localPrice: number;
}

interface ProductSelectorModalProps {
  isOpen: boolean;
  onConfirm: (products: SelectedProduct[]) => void;
  onCancel: () => void;
  selectedProducts?: SelectedProduct[];
}

export const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  selectedProducts = [],
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(
    new Map(selectedProducts.map((p) => [p.productId, p.localPrice]))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Fetch products and categories on mount
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Filter products based on category and search
  useEffect(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category_id === selectedCategory);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(term));
    }

    setFilteredProducts(filtered);
  }, [selectedCategory, searchTerm, products]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch categories
      const { data: categoriesData, error: catError } = await supabase
        .from('global_categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (catError) throw new Error(catError.message);

      // Fetch products
      const { data: productsData, error: prodError } = await supabase
        .from('global_products')
        .select('id, name, category_id, global_price')
        .order('name', { ascending: true });

      if (prodError) throw new Error(prodError.message);

      setCategories(categoriesData || []);
      setProducts(productsData || []);
      setFilteredProducts(productsData || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (productId: string, globalPrice: number) => {
    setSelected((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(productId)) {
        newMap.delete(productId);
      } else {
        newMap.set(productId, globalPrice); // Default to global price
      }
      return newMap;
    });
  };

  const updatePrice = (productId: string, price: number) => {
    setSelected((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(productId)) {
        newMap.set(productId, Math.max(0, price)); // Prevent negative prices
      }
      return newMap;
    });
  };

  const handleConfirm = () => {
    const selectedArray = Array.from(selected.entries()).map(([productId, localPrice]) => ({
      productId,
      localPrice,
    }));
    onConfirm(selectedArray);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Add Products to Catalog</h2>
          <p className="text-sm text-gray-600 mt-1">Select products and set local prices</p>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 space-y-3">
          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Products</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="px-6 py-8 text-center">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
              <p className="mt-2 text-sm text-gray-600">Loading products...</p>
            </div>
          )}

          {/* Product Grid */}
          {!loading && filteredProducts.length > 0 && (
            <div className="px-6 py-4 grid grid-cols-1 gap-3">
              {filteredProducts.map((product) => {
                const isSelected = selected.has(product.id);
                const localPrice = selected.get(product.id) || product.global_price;

                return (
                  <div
                    key={product.id}
                    className={`border rounded-lg p-4 transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(product.id, product.global_price)}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                      />

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Global price: {product.global_price.toFixed(2)}€
                        </p>
                      </div>

                      {/* Price Input (only visible when selected) */}
                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">Local price:</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={localPrice}
                            onChange={(e) => updatePrice(product.id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">€</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredProducts.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-600">
                {products.length === 0
                  ? 'No products available'
                  : 'No products match your filters'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add ({selected.size}) Products
          </button>
        </div>
      </div>
    </div>
  );
};
