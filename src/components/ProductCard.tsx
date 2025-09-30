import React, { useState } from 'react';
import { Package,
  //AlertTriangle,
  Check,
  Plus } from 'lucide-react';
import { Product } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { motion } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback';
import { FeedbackButton } from './FeedbackButton';
import { EnhancedButton } from './EnhancedButton';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  compact?: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

export function ProductCard({ product, onAddToCart, compact = false }: ProductCardProps) {
  const formatPrice = useCurrencyFormatter();
  const isLowStock = product.stock <= product.alertThreshold;
  const [isAdding, setIsAdding] = useState(false);
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

  return (
    <motion.div 
      variants={itemVariants}
      whileHover={{ y: -3, scale: 1.02 }}
      className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-2xl p-3 shadow-sm border border-orange-100 relative"
    >

      
      {/* Stock Badge */}
      <div className={`absolute top-2 right-2 ${getStockBadgeColor()} text-white text-xs px-2 py-1 rounded-full z-10`}>
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
          <Package size={32} className="text-orange-400" />
        )}
      </div>
      
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-800 leading-tight text-sm">
          {product.name}
        </h3>
        <p className="text-gray-500 text-xs">{product.volume}</p>
        
        <div className="flex items-center justify-between">
          <span className="text-orange-600 price-display-sm">
            {formatPrice(product.price)}
          </span>
          
          <EnhancedButton
            onClick={handleAddToCart}
            loading={isLoading('addToCart')}
            disabled={product.stock === 0}
            success={showFeedback}
            size="sm"
            variant={product.stock === 0 ? 'secondary' : 'primary'}
            className="rounded-full critical-action"
          >
            <Plus size={16} />
          </EnhancedButton>
        </div>
      </div>
    </motion.div>
  );
}