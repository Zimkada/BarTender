import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
//import {Package } from 'lucide-react';
import { Product, Category } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { modalVariants } from './Animations';
//import { useAppContext } from '../context/AppContext';
import { useRealTimeSync } from '../hooks/useRealTimeSync';



interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  categories: Category[];
  product?: Product;
}

export function ProductModal({ isOpen, onClose, onSave, product }: ProductModalProps) {
  // Utiliser le hook de synchronisation
  const { categories } = useRealTimeSync();
  const [formData, setFormData] = useState({
    name: '',
    volume: '',
    price: '',
    stock: '',
    categoryId: '',
    image: '',
    alertThreshold: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

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
    setIsSubmitting(true);
    
    // Simuler une petite latence pour montrer l'animation
    setTimeout(() => {
      onSave({
        name: formData.name,
        volume: formData.volume,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock),
        categoryId: formData.categoryId,
        image: formData.image || undefined,
        alertThreshold: parseInt(formData.alertThreshold),
      });
      setIsSubmitting(false);
      onClose();
    }, 500);
  };
  
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (!formTouched) setFormTouched(true);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {product ? 'Modifier le produit' : 'Ajouter un produit'}
          </h2>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            className="text-gray-400 hover:text-white"
          >
            <X size={24} />
          </motion.button>
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
              onChange={(e) => handleInputChange('name', e.target.value)}
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
              onChange={(e) => handleInputChange('volume', e.target.value)}
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
                onChange={(e) => handleInputChange('price', e.target.value)}
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
                onChange={(e) => handleInputChange('stock', e.target.value)}
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
              onChange={(e) => handleInputChange('categoryId', e.target.value)}
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
              onChange={(e) => handleInputChange('alertThreshold', e.target.value)}
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
              onChange={(e) => handleInputChange('image', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-teal-500 focus:outline-none"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600"
            >
              Annuler
            </motion.button>
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { scale: 1.02 } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center ${
                formTouched 
                  ? 'bg-teal-600 text-white hover:bg-teal-500' 
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  <span>Traitement...</span>
                </div>
              ) : (
                product ? 'Modifier' : 'Ajouter'
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