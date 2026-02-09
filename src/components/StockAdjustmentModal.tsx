import React, { useState, useEffect } from 'react';
import { X, BarChart3, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { Product, ADJUSTMENT_REASONS, AdjustmentReason } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (adjustmentData: {
    productId: string;
    delta: number;
    reason: AdjustmentReason;
    notes?: string;
  }) => Promise<void>;
  product: Product;
}

export function StockAdjustmentModal({
  isOpen,
  onClose,
  onSave,
  product
}: StockAdjustmentModalProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { categories } = useAppContext();
  const categoryName = categories.find(c => c.id === product.categoryId)?.name || 'Inconnue';
  const [formData, setFormData] = useState({
    delta: '',
    reason: 'inventory_count' as AdjustmentReason,
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        delta: '',
        reason: 'inventory_count',
        notes: ''
      });
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const delta = parseInt(formData.delta, 10);

    // Validation
    if (isNaN(delta) || delta === 0) {
      setError('L\'ajustement doit être différent de 0');
      return;
    }

    const newStock = product.stock + delta;
    if (newStock < 0) {
      setError(`Le stock ne peut pas être négatif (${product.stock} + ${delta} = ${newStock})`);
      return;
    }

    if (formData.reason === 'other' && !formData.notes.trim()) {
      setError('Les notes sont obligatoires pour la raison "Autre"');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        productId: product.id,
        delta,
        reason: formData.reason,
        notes: formData.notes || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'ajustement du stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  const delta = formData.delta ? parseInt(formData.delta) : 0;
  const newStock = product.stock + delta;
  const isValidDelta = !isNaN(delta) && delta !== 0;
  const reasonConfig = ADJUSTMENT_REASONS[formData.reason];
  const isDeltaPositive = delta > 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50/50 to-blue-50/50">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <BarChart3 size={20} className="text-blue-600" />
                Ajuster le stock
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-600 hover:text-gray-700 transition-colors"
              >
                <X size={24} />
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Product Info Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 rounded-xl p-4 border border-gray-200"
              >
                <h3 className="text-sm font-semibold text-gray-700 mb-3">📦 PRODUIT</h3>
                <p className="text-base font-semibold text-gray-800">{product.name}</p>
                <p className="text-sm text-gray-600 mt-1">
                  Volume: <span className="font-medium">{product.volume}</span> |
                  Catégorie: <span className="font-medium">{categoryName}</span>
                </p>
              </motion.div>

              {/* Current Stock Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-blue-50 rounded-xl p-4 border border-blue-200"
              >
                <h3 className="text-sm font-semibold text-blue-700 mb-3">📊 STOCK ACTUEL</h3>
                <p className="text-2xl font-bold text-blue-700">{product.stock} pièces</p>
                {product.price && (
                  <p className="text-sm text-blue-600 mt-2">
                    Prix de vente: <span className="font-semibold">{formatPrice(product.price)}</span>
                  </p>
                )}
              </motion.div>

              {/* Adjustment Amount Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ➕ AJUSTEMENT (Augmenter ou diminuer)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    value={formData.delta}
                    onChange={(e) => setFormData({ ...formData, delta: e.target.value })}
                    className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 text-lg font-semibold"
                    placeholder="Ex: -50 ou +25"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
                    {isDeltaPositive && delta > 0 && (
                      <TrendingUp size={20} className="text-green-600" />
                    )}
                    {isDeltaPositive === false && delta < 0 && (
                      <TrendingDown size={20} className="text-red-600" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Valeurs négatives (-) = diminution | Valeurs positives (+) = augmentation
                </p>
              </motion.div>

              {/* Reason Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  🔍 RAISON
                </label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value as AdjustmentReason })}
                  className="w-full px-4 py-2.5 bg-white border-2 border-gray-300 rounded-xl text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {Object.entries(ADJUSTMENT_REASONS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-2">
                  {reasonConfig?.description}
                </p>
              </motion.div>

              {/* Notes Section (conditional) */}
              {formData.reason === 'other' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    📝 NOTES *
                  </label>
                  <textarea
                    required={formData.reason === 'other'}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border-2 border-blue-200 rounded-xl text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                    rows={3}
                    placeholder="Expliquez la raison de cet ajustement..."
                  />
                  <p className="text-xs text-blue-600 mt-1">
                    Les notes sont obligatoires pour la raison "Autre"
                  </p>
                </motion.div>
              )}

              {/* Preview Box */}
              {isValidDelta && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-4 border-2 ${newStock < 0
                    ? 'bg-red-50 border-red-300'
                    : isDeltaPositive
                      ? 'bg-green-50 border-green-300'
                      : 'bg-orange-50 border-orange-300'
                    }`}
                >
                  <h4 className={`text-sm font-semibold mb-2 ${newStock < 0
                    ? 'text-red-700'
                    : isDeltaPositive
                      ? 'text-green-700'
                      : 'text-orange-700'
                    }`}>
                    ⚠️ APERÇU DU NOUVEAU STOCK
                  </h4>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-700">
                      Ancien stock: <span className="font-semibold text-gray-800">{product.stock}</span>
                    </p>
                    <p className="text-sm text-gray-700">
                      Ajustement: <span className={`font-semibold ${isDeltaPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isDeltaPositive ? '+' : ''}{delta}
                      </span>
                    </p>
                    <p className={`text-lg font-bold ${newStock < 0
                      ? 'text-red-700'
                      : isDeltaPositive
                        ? 'text-green-700'
                        : 'text-orange-700'
                      }`}>
                      Nouveau stock: {newStock}
                    </p>
                  </div>

                  {newStock < 0 && (
                    <div className="flex items-center gap-2 mt-3 p-2 bg-red-100 rounded-lg">
                      <AlertTriangle size={16} className="text-red-600" />
                      <p className="text-sm font-semibold text-red-700">
                        ❌ Stock négatif non autorisé!
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-red-50 border-l-4 border-red-500 p-3 rounded"
                >
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <motion.button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Annuler
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={!isValidDelta || newStock < 0 || isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    'Confirmer'
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
