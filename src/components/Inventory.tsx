import React, { useState } from 'react';
import { X, Package, AlertTriangle, Plus, Edit, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { ProductModal } from './ProductModal';
import { SupplyModal } from './SupplyModal';
import { Product } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useFeedback } from '../hooks/useFeedback';
import { FeedbackButton } from './FeedbackButton';
import { EnhancedButton } from './EnhancedButton';
import { useViewport } from '../hooks/useViewport';

interface InventoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Inventory({ isOpen, onClose }: InventoryProps) {
  const {
    products,
    categories,
    getLowStockProducts,
    deleteProduct,
    addProduct,
    updateProduct,
    addSupply,
    getAverageCostPerUnit
  } = useAppContext();
  const { formatPrice } = useCurrencyFormatter();
  const { isMobile } = useViewport();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const { showSuccess } = useFeedback();

  const lowStockProducts = getLowStockProducts();

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleAddProduct = () => {
    setEditingProduct(undefined);
    setShowProductModal(true);
  };

  const handleSupply = (supplyData: {
    productId: string;
    quantity: number;
    lotSize: number;
    lotPrice: number;
    supplier: string;
  }) => {
    addSupply(supplyData);
    setShowSupplyModal(false);
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(cat => cat.id === categoryId)?.name || 'Sans catégorie';
  };

  const getMargin = (product: Product) => {
    const avgCost = getAverageCostPerUnit(product.id);
    if (avgCost === 0) return 0;
    return ((product.price - avgCost) / product.price) * 100;
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
          >
            {/* ==================== VERSION MOBILE ==================== */}
            {isMobile ? (
              <div className="bg-white w-full h-full flex flex-col">
                {/* Header sticky avec boutons */}
                <div className="flex-shrink-0 sticky top-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg z-10">
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <Package size={20} />
                        Inventaire
                      </h2>
                      <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
                        <X size={24} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowSupplyModal(true)}
                        className="flex-1 px-3 py-2 bg-white/20 backdrop-blur rounded-lg text-sm font-medium active:bg-white/30"
                      >
                        Approvisionner
                      </button>
                      <button
                        onClick={handleAddProduct}
                        className="flex-1 px-3 py-2 bg-white text-orange-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-orange-50"
                      >
                        <Plus size={16} />
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content scrollable */}
                <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe">
                  {/* Alertes stock */}
                  {lowStockProducts.length > 0 && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        <span className="text-gray-800 font-semibold text-sm">Alertes stock faible</span>
                      </div>
                      <div className="space-y-1">
                        {lowStockProducts.map((product) => (
                          <p key={product.id} className="text-sm text-red-700">
                            {product.name} • Stock: {product.stock}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cards verticales */}
                  <div className="space-y-3">
                    {products.map((product) => {
                      const avgCost = getAverageCostPerUnit(product.id);
                      const margin = getMargin(product);

                      return (
                        <div key={product.id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                          <div className="p-4">
                            {/* En-tête produit */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-800 text-base mb-1">{product.name}</h3>
                                <p className="text-gray-600 text-sm">{product.volume}</p>
                                <p className="text-gray-500 text-xs mt-1">{getCategoryName(product.categoryId)}</p>
                              </div>
                              <div className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-bold ${
                                product.stock <= product.alertThreshold
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}>
                                {product.stock}
                              </div>
                            </div>

                            {/* Infos financières */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div className="bg-white rounded-lg p-2">
                                <p className="text-xs text-gray-600 mb-1">Prix vente</p>
                                <p className="text-orange-600 font-bold text-sm">{formatPrice(product.price)}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2">
                                <p className="text-xs text-gray-600 mb-1">Coût moy.</p>
                                <p className="text-gray-800 font-bold text-sm">
                                  {avgCost > 0 ? formatPrice(avgCost) : '-'}
                                </p>
                              </div>
                              <div className="bg-white rounded-lg p-2">
                                <p className="text-xs text-gray-600 mb-1">Marge</p>
                                <p className={`font-bold text-sm ${
                                  margin > 50 ? 'text-green-600' : margin > 30 ? 'text-orange-600' : 'text-red-600'
                                }`}>
                                  {margin > 0 ? `${margin.toFixed(1)}%` : '-'}
                                </p>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:bg-orange-600"
                              >
                                <Edit size={16} />
                                Modifier
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Supprimer ${product.name} ?`)) {
                                    await deleteProduct(product.id);
                                    showSuccess('Produit supprimé');
                                  }
                                }}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium active:bg-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* ==================== VERSION DESKTOP ==================== */
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="bg-gradient-to-br from-yellow-100 to-amber-100 rounded-lg w-full max-w-6xl max-h-[85vh] md:max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between p-6 border-b border-orange-100">
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Package size={20} className="text-orange-500" />
                    Inventaire
                  </h2>
                  <div className="flex items-center gap-2">
                    <EnhancedButton
                      onClick={() => setShowSupplyModal(true)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-xl"
                    >
                      Approvisionnement
                    </EnhancedButton>
                    <motion.button
                      onClick={handleAddProduct}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Ajouter produit
                    </motion.button>
                    <motion.button
                      onClick={onClose}
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={24} />
                    </motion.button>
                  </div>
                </div>

                <div className="p-6">
                  {lowStockProducts.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={20} className="text-red-500" />
                        <span className="text-gray-800 font-medium">Alertes stock faible</span>
                      </div>
                      <div className="space-y-1">
                        {lowStockProducts.map((product) => (
                          <p key={product.id} className="text-sm text-red-600">
                            {product.name} ({product.volume}) - Stock: {product.stock}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <div className="overflow-x-auto bg-white rounded-xl border border-orange-100">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-orange-100 bg-orange-50">
                          <th className="p-4 text-gray-700 font-medium">Produit</th>
                          <th className="p-4 text-gray-700 font-medium">Catégorie</th>
                          <th className="p-4 text-gray-700 font-medium">Prix vente</th>
                          <th className="p-4 text-gray-700 font-medium">Coût moyen</th>
                          <th className="p-4 text-gray-700 font-medium">Marge</th>
                          <th className="p-4 text-gray-700 font-medium">Stock</th>
                          <th className="p-4 text-gray-700 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((product) => {
                          const avgCost = getAverageCostPerUnit(product.id);
                          const margin = getMargin(product);

                          return (
                            <motion.tr
                              key={product.id}
                              whileHover={{ backgroundColor: '#fef7ed' }}
                              className="border-b border-orange-50"
                            >
                              <td className="p-4">
                                <div>
                                  <div className="text-gray-800 font-medium">{product.name}</div>
                                  <div className="text-gray-600 text-sm">{product.volume}</div>
                                </div>
                              </td>
                              <td className="p-4 text-gray-700">
                                {getCategoryName(product.categoryId)}
                              </td>
                              <td className="p-4 text-orange-600 font-medium">
                                {formatPrice(product.price)}
                              </td>
                              <td className="p-4 text-gray-700">
                                {avgCost > 0 ? formatPrice(avgCost) : '-'}
                              </td>
                              <td className="p-4">
                                {margin > 0 ? (
                                  <span className={`${margin > 50 ? 'text-green-600' : margin > 30 ? 'text-orange-600' : 'text-red-600'}`}>
                                    {margin.toFixed(1)}%
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="p-4">
                                <span className={`${
                                  product.stock <= product.alertThreshold
                                    ? 'text-red-600'
                                    : 'text-gray-800'
                                }`}>
                                  {product.stock}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <motion.button
                                    onClick={() => handleEditProduct(product)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-2 text-gray-500 hover:text-orange-600 transition-colors"
                                  >
                                    <Edit size={16} />
                                  </motion.button>
                                  <FeedbackButton
                                    onClick={async () => {
                                      if (confirm(`Supprimer ${product.name} ?`)) {
                                        await deleteProduct(product.id);
                                        showSuccess('Produit supprimé');
                                      }
                                    }}
                                    className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </FeedbackButton>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSave={(productData) => {
          if (editingProduct) {
            updateProduct(editingProduct.id, productData);
          } else {
            addProduct(productData);
          }
          setShowProductModal(false);
        }}
        categories={categories}
        product={editingProduct}
      />

      <SupplyModal
        isOpen={showSupplyModal}
        onClose={() => setShowSupplyModal(false)}
        onSave={handleSupply}
        products={products}
      />
    </>
  );
}