import React, { useState } from 'react';
import { Package, Plus, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { OptimizedImage } from './ui/OptimizedImage';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  availableStock?: number;
}

export function ProductCard({ product, onAddToCart, availableStock }: ProductCardProps) {
  const { formatPrice } = useCurrencyFormatter();

  // Priorité au stock "calculé" (disponible) s'il est fourni, sinon stock physique
  const displayStock = availableStock !== undefined ? availableStock : product.stock;
  const isLowStock = displayStock <= product.alertThreshold;
  const isStockEmpty = displayStock <= 0;

  const [showFeedback, setShowFeedback] = useState(false);
  const { itemAddedToCart, isLoading } = useFeedback();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop propagation pour éviter d'autres events
    e.preventDefault(); // Empêcher le focus/sélection natif sur mobile

    if (isStockEmpty) return;

    // Feedback haptique simulé et visuel
    if (navigator.vibrate) navigator.vibrate(10); // Vibration légère (5-10ms)

    // Optimistic UI: Feedback immédiat
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 800); // 800ms pour l'anim

    // Action réelle (async ou sync)
    // On ne bloque pas l'UI pour l'ajout panier, c'est instantané ressenti
    onAddToCart(product);
    itemAddedToCart(product.name);
  };

  /**
   * Helper pour la couleur du badge de stock
   */
  const getStockStatus = () => {
    if (isStockEmpty) return { color: 'bg-red-500', label: 'Épuisé' };
    if (isLowStock) return { color: 'bg-amber-500', label: displayStock };
    return { color: 'bg-emerald-500', label: displayStock }; // Emerald est plus "Premium" que Green
  };

  const status = getStockStatus();

  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      animate={showFeedback ? { scale: [1, 1.05, 1], borderColor: '#f59e0b' } : {}}
      transition={{ duration: 0.2 }}
      onClick={handleAddToCart}
      className={`
        relative flex flex-col h-full
        bg-white rounded-2xl
        border ${showFeedback ? 'border-amber-400' : 'border-amber-100'}
        shadow-md shadow-amber-500/5 hover:shadow-xl hover:shadow-amber-500/15
        overflow-hidden cursor-pointer select-none
        touch-manipulation
        transition-all duration-200
        ${isStockEmpty ? 'opacity-60 grayscale' : ''}
      `}
    >
      {/* --- STOCK BADGE --- */}
      <div className={`
        absolute top-2 right-2 z-10
        ${status.color} text-white
        text-[10px] font-bold px-2 py-0.5 rounded-full
        shadow-sm backdrop-blur-sm bg-opacity-90
      `}>
        {status.label}
      </div>

      {/* --- IMAGE AREA (Aspect Ratio 1:1 pour cohérence) --- */}
      <div className="aspect-square bg-gray-50 p-3 flex items-center justify-center relative">
        {isLowStock && !isStockEmpty && (
          <div className="absolute top-2 left-2 text-amber-500 animate-pulse">
            <AlertTriangle size={14} />
          </div>
        )}

        {product.image ? (
          <OptimizedImage
            src={product.image}
            alt={product.name}
            width={200}
            height={200}
            className="w-full h-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Package className="text-gray-300 w-1/2 h-1/2" strokeWidth={1.5} />
        )}

        {/* --- ADD SUCCESS OVERLAY --- */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-amber-500/80 flex items-center justify-center z-20"
            >
              <Check className="text-white w-12 h-12 drop-shadow-md" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="font-bold text-gray-800 text-sm leading-snug line-clamp-2 min-h-[2.5em]">
            {product.name}
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{product.volume}</p>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-amber-600 font-bold text-base font-mono">
            {formatPrice(product.price)}
          </span>

          {/* Bouton "+" visuel (décoratif car toute la carte est cliquable) 
              mais utile pour l'affordance */}
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center
            transition-all duration-200
            ${isStockEmpty
              ? 'bg-gray-100 text-gray-400'
              : 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm shadow-amber-500/30'
            }
          `}>
            <Plus size={18} strokeWidth={3} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

