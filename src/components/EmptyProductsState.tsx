import React from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Loader2, LucideIcon } from 'lucide-react';

interface EmptyProductsStateProps {
  isLoading?: boolean;
  title?: string;
  message?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string; // Pour styling custom si besoin
}

export function EmptyProductsState({
  isLoading = false,
  title = "Aucun produit trouvé",
  message = "Cette liste est vide pour le moment.",
  icon: Icon = Package,
  actionLabel,
  onAction,
  className = ""
}: EmptyProductsStateProps) {

  // État de chargement
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white/60 backdrop-blur-sm rounded-2xl p-12 shadow-sm border border-amber-100 text-center ${className}`}
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
              Chargement en cours...
            </h3>
            <p className="text-gray-600 text-sm">
              Veuillez patienter un instant
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // État vide générique
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-12 shadow-sm border-2 border-dashed border-amber-300 text-center ${className}`}
    >
      <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-400/20 blur-2xl rounded-full" />
          <div className="relative bg-white p-6 rounded-full shadow-lg">
            <Icon className="w-16 h-16 text-amber-600" />
          </div>
        </div>

        <div>
          {title && (
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              {title}
            </h3>
          )}
          <p className="text-gray-600">
            {message}
          </p>
        </div>

        {onAction && actionLabel && (
          <motion.button
            onClick={onAction}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full font-semibold hover:shadow-lg transition-all"
          >
            <Plus size={20} />
            {actionLabel}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
