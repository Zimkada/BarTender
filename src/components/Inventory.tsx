import React, { useState } from 'react';
import { X, Package, AlertTriangle, Plus, Edit, Trash2, ShoppingCart } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { ProductModal } from './ProductModal';
import { SupplyModal } from './SupplyModal';
import { Product } from '../types';

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
    getAverageCostPerUnit,
    formatPrice
  } = useAppContext();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  
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
    // L'augmentation de stock est gérée directement dans le contexte
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Package size={20} />
              Inventaire
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSupplyModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                <ShoppingCart size={16} />
                Approvisionnement
              </button>
              <button
                onClick={handleAddProduct}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Ajouter produit
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="p-4">
            {lowStockProducts.length > 0 && (
              <div className="bg-red-600/20 border border-red-600/30 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={20} className="text-red-400" />
                  <span className="text-white font-medium">Alertes stock faible</span>
                </div>
                <div className="space-y-1">
                  {lowStockProducts.map((product) => (
                    <p key={product.id} className="text-sm text-red-300">
                      {product.name} ({product.volume}) - Stock: {product.stock}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3 text-gray-300 font-medium">Produit</th>
                    <th className="pb-3 text-gray-300 font-medium">Catégorie</th>
                    <th className="pb-3 text-gray-300 font-medium">Prix vente</th>
                    <th className="pb-3 text-gray-300 font-medium">Coût moyen</th>
                    <th className="pb-3 text-gray-300 font-medium">Marge</th>
                    <th className="pb-3 text-gray-300 font-medium">Stock</th>
                    <th className="pb-3 text-gray-300 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const avgCost = getAverageCostPerUnit(product.id);
                    const margin = getMargin(product);
                    
                    return (
                      <tr key={product.id} className="border-b border-gray-800">
                        <td className="py-3">
                          <div>
                            <div className="text-white font-medium">{product.name}</div>
                            <div className="text-gray-400 text-sm">{product.volume}</div>
                          </div>
                        </td>
                        <td className="py-3 text-gray-300">
                          {getCategoryName(product.categoryId)}
                        </td>
                        <td className="py-3 text-teal-400 font-medium">
                          {formatPrice(product.price)}
                        </td>
                        <td className="py-3 text-gray-300">
                          {avgCost > 0 ? formatPrice(avgCost) : '-'}
                        </td>
                        <td className="py-3">
                          {margin > 0 ? (
                            <span className={`${margin > 50 ? 'text-green-400' : margin > 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {margin.toFixed(1)}%
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-3">
                          <span className={`${
                            product.stock <= product.alertThreshold
                              ? 'text-red-400'
                              : 'text-white'
                          }`}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditProduct(product)}
                              className="p-2 text-gray-400 hover:text-teal-400 transition-colors"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
                                  deleteProduct(product.id);
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

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