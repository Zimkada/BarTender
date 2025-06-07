import React, { useState } from 'react';
import { Package, AlertTriangle, Check } from 'lucide-react';
import { Product } from '../types';
import { useSettings } from '../hooks/useSettings';
import { motion } from 'framer-motion';
import { itemVariants } from './Animations';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  compact?: boolean;
}

export function ProductCard({ product, onAddToCart, compact = false }: ProductCardProps) {
  const { formatPrice } = useSettings();
  const isLowStock = product.stock <= product.alertThreshold;
  const [isAdding, setIsAdding] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleAddToCart = () => {
    if (product.stock === 0) return;
    
    setIsAdding(true);
    
    // Simuler un délai pour montrer l'animation
    setTimeout(() => {
      onAddToCart(product);
      setIsAdding(false);
      setShowFeedback(true);
      
      // Masquer le feedback après 1.5s
      setTimeout(() => {
        setShowFeedback(false);
      }, 1500);
    }, 300);
  };

  return (
    <motion.div 
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{ y: -5 }}
      className={`bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-3 ${
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
        
        <motion.button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          className={`w-full ${compact ? 'py-2 text-sm' : 'py-3'} rounded-lg font-medium relative overflow-hidden ${
            product.stock === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-teal-600 text-white hover:bg-teal-500'
          }`}
        >
          {showFeedback ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-1"
            >
              <Check size={16} /> Ajouté
            </motion.div>
          ) : isAdding ? (
            <motion.div 
              animate={{ 
                opacity: [0.5, 1, 0.5], 
                scale: [0.98, 1.02, 0.98]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 1 
              }}
            >
              Ajout...
            </motion.div>
          ) : (
            product.stock === 0 ? 'Rupture' : 'Ajouter'
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}