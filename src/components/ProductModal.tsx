import React, { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { Product, Category } from '../types';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  categories: Category[];
  product?: Product;
}

export function ProductModal({ isOpen, onClose, onSave, categories, product }: ProductModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    volume: '',
    price: '',
    stock: '',
    categoryId: '',
    image: '',
    alertThreshold: '',
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        volume: product.volume,
        price: product.price.toString(),
        stock: product.stock.toString(),
        categoryId: product.categoryId,
        image: product.image || '',
        alertThreshold: product.alertThreshold.toString(),
      });
    } else {
      setFormData({
        name: '',
        volume: '',
        price: '',
        stock: '',
        categoryId: categories[0]?.id || '',
        image: '',
        alertThreshold: '10',
      });
    }
  }, [product, categories, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: formData.name,
      volume: formData.volume,
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock),
      categoryId: formData.categoryId,
      image: formData.image || undefined,
      alertThreshold: parseInt(formData.alertThreshold),
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {product ? 'Modifier le produit' : 'Ajouter un produit'}
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
              Nom du produit *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="ex: Beaufort"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Volume/Contenance *
            </label>
            <input
              type="text"
              required
              value={formData.volume}
              onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="ex: 33cl, 50cl, 75cl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Prix de vente (FCFA) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                placeholder="500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stock initial *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                placeholder="24"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Catégorie *
            </label>
            <select
              required
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Seuil d'alerte stock *
            </label>
            <input
              type="number"
              required
              min="0"
              value={formData.alertThreshold}
              onChange={(e) => setFormData({ ...formData, alertThreshold: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              URL de l'image (optionnel)
            </label>
            <input
              type="url"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="https://example.com/image.jpg"
            />
          </div>

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
              {product ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}