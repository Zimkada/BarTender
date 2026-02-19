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
  quantityInCart?: number; // ✨ Ajout : Quantité déjà présente dans le panier
  priority?: boolean; // ✨ Pour l'optimisation LCP
}

export function ProductCard({ product, onAddToCart, availableStock, quantityInCart = 0, priority = false }: ProductCardProps) {
  const { formatPrice } = useCurrencyFormatter();

  // Priorité au stock "calculé" (disponible) s'il est fourni, sinon stock physique
  const displayStock = availableStock !== undefined ? availableStock : product.stock;
  const isLowStock = displayStock <= product.alertThreshold;
  const isStockEmpty = displayStock <= 0;

  // 🛡️ Détection du stock maximum atteint dans le panier
  const isMaxReached = quantityInCart >= displayStock && !isStockEmpty;

  const [showFeedback, setShowFeedback] = useState(false);
  const { itemAddedToCart } = useFeedback();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isStockEmpty || isMaxReached) return;

    if (navigator.vibrate) navigator.vibrate(10);

    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 800);

    onAddToCart(product);
    itemAddedToCart(product.name);
  };

  const getStockStatus = () => {
    if (isStockEmpty) return { color: 'bg-red-500', label: 'Épuisé' };
    if (isMaxReached) return { color: 'bg-orange-600', label: 'MAX' };
    if (isLowStock) return { color: 'bg-orange-400', label: displayStock };
    return { color: 'bg-emerald-500', label: displayStock };
  };

  const status = getStockStatus();

  return (
    <motion.div
      whileTap={!isMaxReached ? { scale: 0.96 } : {}}
      animate={showFeedback ? { scale: [1, 1.05, 1], borderColor: 'var(--brand-primary)' } : {}}
      transition={{ duration: 0.2 }}
      onClick={handleAddToCart}
      className={`
        relative flex flex-col h-full
        rounded-2xl backdrop-blur-md
        ${showFeedback
          ? 'bg-white border-2 border-brand-primary shadow-xl shadow-brand-primary/20 ring-1 ring-brand-primary/10'
          : isMaxReached
            ? 'bg-gradient-to-br from-orange-50 to-orange-50/50 border-2 border-orange-300 shadow-lg shadow-orange-200/30 ring-1 ring-orange-200/50'
            : 'bg-gradient-to-br from-white via-gray-50 to-gray-100/50 border-2 border-gray-200 shadow-md shadow-gray-300/20 ring-1 ring-white/80 hover:shadow-xl hover:shadow-gray-400/30 hover:border-gray-300'
        }
        overflow-hidden cursor-pointer select-none
        touch-manipulation
        transition-all duration-300 ease-out
        ${isStockEmpty ? 'opacity-60 grayscale' : ''}
        ${isMaxReached ? 'cursor-default' : 'hover:scale-[1.02]'}
      `}
    >
      {/* --- STOCK BADGE HAUTE LISIBILITÉ --- */}
      <motion.div
        animate={isMaxReached ? { scale: [1, 1.12, 1] } : {}}
        transition={{ repeat: isMaxReached ? Infinity : 0, duration: 2 }}
        className={`
          absolute top-2 right-2 z-10
          ${status.color} text-white
          text-[10px] font-black px-2.5 py-1.5 rounded-full
          shadow-lg bg-opacity-95 border border-white/30 backdrop-blur-md active:scale-95 transition-all duration-200
          ring-1 ring-white/40
        `}
      >
        {status.label}
      </motion.div>

      {/* --- IMAGE AREA --- */}
      <div className="aspect-square bg-gradient-to-br from-white/90 via-white/80 to-gray-50/50 p-3 flex items-center justify-center relative group border-b border-gray-200/60 backdrop-blur-sm">
        {isLowStock && !isStockEmpty && !isMaxReached && (
          <div className="absolute top-2 left-2 text-orange-600 animate-pulse bg-white/80 rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}

        <div className="w-full h-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
          {product.image ? (
            <OptimizedImage
              src={product.image}
              alt={product.name}
              width={150}
              height={150}
              className="w-full h-full object-contain mix-blend-multiply"
              priority={priority} // ✨ LCP Optimization
            />
          ) : (
            <div className="w-10 h-10 bg-brand-subtle rounded-2xl flex items-center justify-center text-brand-primary/30">
              <Package size={20} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* --- ADD SUCCESS OVERLAY --- */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-primary/80 flex items-center justify-center z-20 backdrop-blur-sm"
            >
              <div className="bg-white rounded-full p-2 shadow-xl">
                <Check className="text-brand-primary w-5 h-5" strokeWidth={4} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="p-3 flex flex-col flex-1 justify-between bg-gradient-to-br from-white/95 via-white/90 to-gray-50/30 relative backdrop-blur-sm">

        <div className="pt-1">
          <h3 className="font-black text-gray-900 text-[10px] sm:text-[11px] leading-tight line-clamp-2 min-h-[2.4em] uppercase tracking-tight">
            {product.name}
          </h3>
          <p className="text-[8px] text-gray-400 mt-0.5 font-black uppercase tracking-widest leading-none">{product.volume}</p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-brand-primary/60 uppercase tracking-widest leading-none mb-1">Prix</span>
            <span className="text-brand-dark font-black text-xs sm:text-sm font-mono tracking-tighter">
              {formatPrice(product.price)}
            </span>
          </div>

          <motion.div
            whileHover={!isMaxReached ? { scale: 1.15, rotate: 90 } : {}}
            whileTap={!isMaxReached ? { scale: 0.85 } : {}}
            className={`
              w-8 h-8 rounded-xl flex items-center justify-center
              transition-all duration-300
              ${isStockEmpty || isMaxReached
                ? 'bg-gray-200 text-gray-400 shadow-sm'
                : 'glass-action-button-active-2026 shadow-lg hover:shadow-xl'
              }
            `}
          >
            <Plus size={16} strokeWidth={3} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
