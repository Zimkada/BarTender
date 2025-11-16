import React, { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { Product } from '../types';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { motion, AnimatePresence } from 'framer-motion';

interface SupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplyData: {
    productId: string;
    quantity: number;
    lotSize: number;
    lotPrice: number;
    supplier: string;
  }) => void;
  products: Product[];
}

export function SupplyModal({ isOpen, onClose, onSave, products }: SupplyModalProps) {
  const { formatPrice } = useCurrencyFormatter();
  const [formData, setFormData] = useState({
    productId: '',
    quantity: '',
    lotSize: '',
    lotPrice: '',
    supplier: '',
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        productId: products[0]?.id || '',
        quantity: '',
        lotSize: '',
        lotPrice: '',
        supplier: '',
      });
    }
  }, [isOpen, products]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      productId: formData.productId,
      quantity: parseInt(formData.quantity),
      lotSize: parseInt(formData.lotSize),
      lotPrice: parseFloat(formData.lotPrice),
      supplier: formData.supplier,
    });
    onClose();
  };

  const selectedProduct = products.find(p => p.id === formData.productId);
  const totalLots = formData.quantity && formData.lotSize ? 
    Math.floor(parseInt(formData.quantity) / parseInt(formData.lotSize)) : 0;
  const totalCost = totalLots * parseFloat(formData.lotPrice || '0');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-gradient-to-br from-amber-50 to-amber-50 rounded-lg w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-amber-100">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Package size={20} className="text-amber-500" />
                Approvisionnement
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Produit *
                </label>
                <select
                  required
                  value={formData.productId}
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.volume})
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <p className="text-sm text-gray-600 mt-1">
                    Stock actuel: {selectedProduct.stock} | Prix de vente: {formatPrice(selectedProduct.price)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité totale *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    placeholder="48"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité par lot *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.lotSize}
                    onChange={(e) => setFormData({ ...formData, lotSize: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    placeholder="24"
                  />
                  <p className="text-xs text-gray-500 mt-1">Casier, pack, caisse...</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix par lot (FCFA) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.lotPrice}
                  onChange={(e) => setFormData({ ...formData, lotPrice: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  placeholder="12000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fournisseur *
                </label>
                <input
                  type="text"
                  required
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  placeholder="SOBEBRA"
                />
              </div>

              {totalLots > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-100 to-amber-100 border border-amber-200 rounded-xl p-3"
                >
                  <h4 className="text-gray-800 font-medium mb-2">Résumé de l'approvisionnement</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-700">Nombre de lots: <span className="text-gray-800 font-medium">{totalLots}</span></p>
                    <p className="text-gray-700">Coût total: <span className="text-amber-600 font-semibold">{formatPrice(totalCost)}</span></p>
                    <p className="text-gray-700">Coût par unité: <span className="text-gray-800 font-medium">{formatPrice(totalCost / parseInt(formData.quantity))}</span></p>
                  </div>
                </motion.div>
              )}

              <div className="flex gap-3 pt-4">
                <motion.button
                  type="button"
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  Annuler
                </motion.button>
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors"
                >
                  Enregistrer
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}