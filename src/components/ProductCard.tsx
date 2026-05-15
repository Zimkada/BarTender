import React, { useState } from 'react';
import { Package, Plus, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { ProductCardImage } from './ProductCardImage';

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
      whileTap={!isMaxReached ? { scale: 0.97 } : {}}
      animate={showFeedback ? { borderColor: 'var(--brand-primary)' } : {}}
      transition={{ duration: 0.15 }}
      onClick={handleAddToCart}
      className={`
        relative flex flex-col h-full
        rounded-2xl bg-card border shadow-sm
        ${showFeedback
          ? 'border-brand-primary ring-2 ring-brand-primary/20'
          : isMaxReached
            ? 'border-amber-300 dark:border-amber-700/50'
            : 'border-border hover:border-brand-primary/40 hover:shadow-md'
        }
        overflow-hidden cursor-pointer select-none
        touch-manipulation
        transition-all duration-200 ease-out
        ${isStockEmpty ? 'opacity-60' : ''}
        ${isMaxReached ? 'cursor-default' : ''}
      `}
    >
      {/* Stock Badge */}
      <div
        className={`
          absolute top-2 right-2 z-10
          ${status.color} text-white
          text-micro font-semibold px-2 py-0.5 rounded-full
          tabular-nums
        `}
      >
        {status.label}
      </div>

      {/* Image */}
      <div className="aspect-square bg-muted p-2 flex items-center justify-center relative group border-b border-border overflow-hidden">
        {isLowStock && !isStockEmpty && !isMaxReached && (
          <div className="absolute top-2 left-2 text-amber-600 dark:text-amber-400 bg-card/90 rounded-full p-1 shadow-sm">
            <AlertTriangle size={12} />
          </div>
        )}

        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          {product.image ? (
            <ProductCardImage
              src={product.image}
              alt={product.name}
              priority={priority}
            />
          ) : (
            <div className="w-10 h-10 bg-brand-subtle rounded-xl flex items-center justify-center text-brand-primary/50">
              <Package size={20} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* Success overlay */}
        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-brand-primary/85 flex items-center justify-center z-20"
            >
              <div className="bg-white rounded-full p-2 shadow-lg">
                <Check className="text-brand-primary w-5 h-5" strokeWidth={3} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="text-body-sm font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.4em]">
            {product.name}
          </h3>
          <p className="text-micro text-muted-foreground mt-0.5 uppercase">{product.volume}</p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-micro text-muted-foreground">Prix</span>
            <span className="text-body-sm font-semibold text-foreground tabular-nums">
              {formatPrice(product.price)}
            </span>
          </div>

          <div
            className={`
              w-8 h-8 rounded-xl flex items-center justify-center
              transition-colors
              ${isStockEmpty || isMaxReached
                ? 'bg-muted text-muted-foreground'
                : 'bg-brand-primary text-white shadow-sm hover:shadow'
              }
            `}
          >
            <Plus size={16} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
