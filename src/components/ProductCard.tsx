import React, { useState } from 'react';
import { Package, Plus, AlertTriangle, Check } from 'lucide-react';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const { formatPrice } = useCurrencyFormatter();
  const isLowStock = product.stock <= product.alertThreshold;
  const [showFeedback, setShowFeedback] = useState(false);
  const { itemAddedToCart, setLoading, isLoading, showError } = useFeedback();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (product.stock === 0) {
      showError('❌ Stock épuisé');
      return;
    }

    if (product.stock <= product.alertThreshold && product.stock > 0) {
      if (!confirm(`⚠️ Stock critique (${product.stock} restants). Continuer ?`)) {
        return;
      }
    }

    try {
      setLoading('addToCart', true);
      await onAddToCart(product);
      itemAddedToCart(product.name);
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 1000);
    } finally {
      setLoading('addToCart', false);
    }
  };

  const getStockBadgeColor = () => {
    if (product.stock === 0) return 'bg-red-500';
    if (isLowStock) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div
      onClick={handleAddToCart}
      className="bg-white rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer hover:shadow-md h-full flex flex-col"
    >
      {/* Stock Badge */}
      <div className={`absolute top-2 right-2 ${getStockBadgeColor()} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold z-10 shadow-sm`}>
        {product.stock}
      </div>

      {/* Low Stock Alert */}
      {isLowStock && product.stock > 0 && (
        <div className="absolute top-2 left-2 bg-amber-500 text-white rounded-full p-1 z-10 shadow-sm">
          <AlertTriangle size={12} />
        </div>
      )}

      {/* Image */}
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden p-2">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain mix-blend-multiply"
          />
        ) : (
          <Package size={24} className="text-gray-300" />
        )}
      </div>

      {/* Content */}
      <div className="p-2 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-xs leading-tight mb-0.5 line-clamp-2 min-h-[2.5em]">
          {product.name}
        </h3>
        <p className="text-[10px] text-gray-500 mb-1 truncate">{product.volume}</p>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-amber-600 font-bold text-sm font-mono">
            {formatPrice(product.price)}
          </span>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || isLoading('addToCart')}
            className={`
              w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm transition-colors
              ${product.stock === 0
                ? 'bg-gray-300 cursor-not-allowed'
                : showFeedback
                  ? 'bg-green-500'
                  : 'bg-amber-500 hover:bg-amber-600'
              }
            `}
          >
            {isLoading('addToCart') ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
            ) : showFeedback ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <Plus size={16} strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
