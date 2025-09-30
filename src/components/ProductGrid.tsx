import React from 'react';
import { ProductCard } from './ProductCard';
import { Product } from '../types';
import { motion } from 'framer-motion';

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      when: "beforeChildren"
    }
  }
};

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-6xl mb-4">🍺</div>
        <h3 className="text-xl font-semibold text-gray-600 mb-2">Aucun produit dans cette catégorie</h3>
        <p className="text-gray-500">Ajoutez des produits pour commencer à vendre</p>
      </div>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
        />
      ))}
    </motion.div>
  );
}