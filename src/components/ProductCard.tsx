import React from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { Product } from '../types';
import { useSettings } from '../hooks/useSettings';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  compact?: boolean;
}

export function ProductCard({ product, onAddToCart, compact = false }: ProductCardProps) {
  const { formatPrice } = useSettings();
  const isLowStock = product.stock <= product.alertThreshold;

  return (
    <div className={`bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-3 hover:bg-gray-800/70 transition-all duration-200 hover:transform hover:scale-[1.02] ${
      compact ? 'min-h-[200px]' : 'min-h-[240px]'
    }`}>
      <div className={`${compact ? 'aspect-[4/3]' : 'aspect-square'} bg-gray-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden`}>
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package size={compact ? 32 : 40} className="text-gray-500" />
        )}
      </div>
      
      <div className="space-y-2">
        <h3 className={`font-semibold text-white leading-tight ${compact ? 'text-sm' : 'text-base'}`}>
          {product.name}
        </h3>
        <p className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>{product.volume}</p>
        
        <div className="flex items-center justify-between">
          <span className={`text-teal-400 font-bold ${compact ? 'text-sm' : 'text-base'}`}>
            {formatPrice(product.price)}
          </span>
          <div className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} ${
            isLowStock ? 'text-red-400' : 'text-gray-400'
          }`}>
            {isLowStock && <AlertTriangle size={compact ? 12 : 16} />}
            <span>Stock: {product.stock}</span>
          </div>
        </div>
        
        <button
          onClick={() => onAddToCart(product)}
          disabled={product.stock === 0}
          className={`w-full ${compact ? 'py-2 text-sm' : 'py-3'} rounded-lg font-medium transition-all duration-200 ${
            product.stock === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-teal-600 text-white hover:bg-teal-500 active:transform active:scale-95'
          }`}
        >
          {product.stock === 0 ? 'Rupture' : 'Ajouter'}
        </button>
      </div>
    </div>
  );
}