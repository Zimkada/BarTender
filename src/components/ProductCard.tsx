import React, { useState } from 'react';
import { Package, Plus, AlertTriangle } from 'lucide-react';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  compact?: boolean;
}

export function ProductCard({ product, onAddToCart, compact = false }: ProductCardProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const isLowStock = product.stock <= product.alertThreshold;
  const [showFeedback, setShowFeedback] = useState(false);
  const { itemAddedToCart, setLoading, isLoading, showError } = useFeedback();

  const handleAddToCart = async () => {
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
    if (isLowStock) return 'bg-orange-500';
    return 'bg-green-500';
  };

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  // Card horizontale XXL pour lisibilité optimale bars africains
  if (isMobile) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden active:scale-[0.98] transition-transform">
        <div className="flex items-center gap-4 p-4">
          {/* Image produit 80x80 */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl flex items-center justify-center overflow-hidden">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package size={32} className="text-orange-400" />
              )}
            </div>

            {/* Badge stock (position absolue top-right de l'image) */}
            <div className={`absolute -top-1 -right-1 ${getStockBadgeColor()} text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm`}>
              {product.stock}
            </div>

            {/* Alerte stock faible */}
            {isLowStock && product.stock > 0 && (
              <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white rounded-full p-1">
                <AlertTriangle size={12} />
              </div>
            )}
          </div>

          {/* Info produit (flex-1 pour prendre l'espace) */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-tight mb-1 truncate">
              {product.name}
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              {product.volume}
            </p>
            <p className="text-xl font-bold text-orange-600 font-mono">
              {formatPrice(product.price)}
            </p>
          </div>

          {/* Bouton + GÉANT 64x64 */}
          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || isLoading('addToCart')}
            className={`
              flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg
              active:scale-95 transition-all
              ${product.stock === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : showFeedback
                  ? 'bg-green-500'
                  : 'bg-orange-500 active:bg-orange-600'
              }
            `}
            aria-label={`Ajouter ${product.name} au panier`}
          >
            {isLoading('addToCart') ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
            ) : showFeedback ? (
              '✓'
            ) : (
              <Plus size={28} strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  // Card verticale classique pour grid
  return (
    <div className="bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl p-4 shadow-sm border border-orange-100 hover:shadow-md transition-shadow relative">
      {/* Stock Badge */}
      <div className={`absolute top-3 right-3 ${getStockBadgeColor()} text-white text-xs px-2 py-1 rounded-full font-bold z-10`}>
        {product.stock}
      </div>

      {/* Image Container */}
      <div className="aspect-square bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package size={48} className="text-orange-400" />
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-bold text-gray-800 leading-tight text-base">
          {product.name}
        </h3>
        <p className="text-gray-600 text-sm">{product.volume}</p>

        <div className="flex items-center justify-between pt-2">
          <span className="text-orange-600 font-bold text-lg font-mono">
            {formatPrice(product.price)}
          </span>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || isLoading('addToCart')}
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl
              hover:scale-105 active:scale-95 transition-all
              ${product.stock === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : showFeedback
                  ? 'bg-green-500'
                  : 'bg-orange-500 hover:bg-orange-600'
              }
            `}
            aria-label={`Ajouter ${product.name} au panier`}
          >
            {isLoading('addToCart') ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : showFeedback ? (
              '✓'
            ) : (
              <Plus size={20} strokeWidth={3} />
            )}
          </button>
        </div>
      </div>

      {/* Alert stock faible desktop */}
      {isLowStock && product.stock > 0 && (
        <div className="absolute top-3 left-3 bg-orange-500 text-white rounded-full p-1.5">
          <AlertTriangle size={16} />
        </div>
      )}
    </div>
  );
}
