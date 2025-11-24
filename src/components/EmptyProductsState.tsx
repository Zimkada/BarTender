import React from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface EmptyProductsStateProps {
  isLoading: boolean;
  categoryName?: string;
  onAddProduct?: () => void;
}

export function EmptyProductsState({
  isLoading,
  categoryName,
  onAddProduct
}: EmptyProductsStateProps) {
  const { hasPermission } = useAuth();
  const canAddProducts = hasPermission('canAddProducts');

  // État de chargement
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/60 backdrop-blur-sm rounded-2xl p-12 shadow-sm border border-amber-100 text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 p-4 rounded-2xl">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              Chargement des produits...
            </h3>
            <p className="text-gray-600 text-sm">
              {categoryName ? `Catégorie: ${categoryName}` : 'Préparation de votre catalogue'}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // État vide (pas de produits)
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-12 shadow-sm border-2 border-dashed border-amber-300 text-center"
    >
      <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-400/20 blur-2xl rounded-full" />
          <div className="relative bg-white p-6 rounded-full shadow-lg">
            <Package className="w-16 h-16 text-amber-600" />
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            Aucun produit dans cette catégorie
          </h3>
          <p className="text-gray-600">
            {categoryName
              ? `La catégorie "${categoryName}" ne contient pas encore de produits.`
              : "Cette catégorie est vide pour le moment."
            }
          </p>
        </div>

        {canAddProducts && onAddProduct && (
          <motion.button
            onClick={onAddProduct}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full font-semibold hover:shadow-lg transition-all"
          >
            <Plus size={20} />
            Ajouter un produit
          </motion.button>
        )}

        {!canAddProducts && (
          <p className="text-sm text-gray-500 italic">
            Contactez un gérant pour ajouter des produits
          </p>
        )}
      </div>
    </motion.div>
  );
}
