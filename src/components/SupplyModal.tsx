import React, { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { Product } from '../types';
import { useSettings } from '../hooks/useSettings';

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
  const { formatPrice } = useSettings();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Package size={20} />
            Approvisionnement
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Produit *
            </label>
            <select
              required
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.volume})
                </option>
              ))}
            </select>
            {selectedProduct && (
              <p className="text-sm text-gray-400 mt-1">
                Stock actuel: {selectedProduct.stock} | Prix de vente: {formatPrice(selectedProduct.price)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Quantité totale *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                placeholder="48"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Quantité par lot *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.lotSize}
                onChange={(e) => setFormData({ ...formData, lotSize: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                placeholder="24"
              />
              <p className="text-xs text-gray-500 mt-1">Casier, pack, caisse...</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Prix par lot (FCFA) *
            </label>
            <input
              type="number"
              required
              min="0"
              value={formData.lotPrice}
              onChange={(e) => setFormData({ ...formData, lotPrice: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="12000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fournisseur *
            </label>
            <input
              type="text"
              required
              value={formData.supplier}
              onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="Brasseries du Cameroun"
            />
          </div>

          {totalLots > 0 && (
            <div className="bg-teal-600/20 border border-teal-600/30 rounded-lg p-3">
              <h4 className="text-white font-medium mb-2">Résumé de l'approvisionnement</h4>
              <div className="space-y-1 text-sm">
                <p className="text-gray-300">Nombre de lots: <span className="text-white">{totalLots}</span></p>
                <p className="text-gray-300">Coût total: <span className="text-teal-400 font-semibold">{formatPrice(totalCost)}</span></p>
                <p className="text-gray-300">Coût par unité: <span className="text-white">{formatPrice(totalCost / parseInt(formData.quantity))}</span></p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}