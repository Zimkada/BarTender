import React, { useState, useEffect } from 'react';
import { X, Loader2, Globe, PenTool, Search, Check } from 'lucide-react';
import { Product, Category, GlobalProduct } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealTimeSync } from '../hooks/useRealTimeSync';
import { ImageUpload } from './ImageUpload';
import { ProductsService } from '../services/supabase/products.service';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'createdAt' | 'barId'>) => void;
  categories: Category[];
  product?: Product;
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 }
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }
};

type Mode = 'custom' | 'global';

export function ProductModal({ isOpen, onClose, onSave, product }: ProductModalProps) {
  const { categories } = useRealTimeSync();
  const [mode, setMode] = useState<Mode>('custom');
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

  // Global Catalog State
  const [globalProducts, setGlobalProducts] = useState<GlobalProduct[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [selectedGlobalId, setSelectedGlobalId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (product) {
      setMode('custom'); // Editing is always custom-like view
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
      // Reset form for new product
      setFormData({
        name: '',
        volume: '',
        price: '',
        stock: '',
        categoryId: categories[0]?.id || '',
        image: '',
        alertThreshold: '10',
      });
      setMode('custom');
      setSelectedGlobalId(null);
    }
  }, [product, categories, isOpen]);

  // Load global products when switching to global mode
  useEffect(() => {
    if (mode === 'global' && globalProducts.length === 0) {
      loadGlobalProducts();
    }
  }, [mode]);

  const loadGlobalProducts = async () => {
    setIsLoadingGlobal(true);
    try {
      const products = await ProductsService.getGlobalProducts();
      setGlobalProducts(products);
    } catch (error) {
      console.error('Error loading global products:', error);
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  const handleGlobalProductSelect = (globalProduct: GlobalProduct) => {
    setSelectedGlobalId(globalProduct.id);
    setFormData(prev => ({
      ...prev,
      name: globalProduct.name,
      volume: globalProduct.volume,
      image: globalProduct.officialImage || '',
      // Keep price/stock empty or default
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      onSave({
        name: formData.name,
        volume: formData.volume,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock),
        categoryId: formData.categoryId,
        image: formData.image || undefined,
        alertThreshold: parseInt(formData.alertThreshold),
        globalProductId: mode === 'global' ? selectedGlobalId || undefined : undefined,
        isCustomProduct: mode === 'custom',
      });
      setIsSubmitting(false);
      onClose();
    }, 500);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (!formTouched) setFormTouched(true);
  };

  const filteredGlobalProducts = globalProducts.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] md:max-h-[90vh] overflow-hidden shadow-xl border border-amber-200 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-amber-200 bg-white z-10">
              <h2 className="text-xl font-semibold text-gray-800">
                {product ? 'Modifier le produit' : 'Ajouter un produit'}
              </h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </motion.button>
            </div>

            {!product && (
              <div className="flex p-2 bg-gray-50 border-b border-gray-100">
                <button
                  onClick={() => setMode('custom')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${mode === 'custom'
                      ? 'bg-white text-amber-600 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                  <PenTool size={16} />
                  Produit Personnalisé
                </button>
                <button
                  onClick={() => setMode('global')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${mode === 'global'
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                  <Globe size={16} />
                  Catalogue Global
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {mode === 'global' && !product ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Rechercher dans le catalogue..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {isLoadingGlobal ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin text-blue-500" size={32} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredGlobalProducts.map((gp) => (
                        <div
                          key={gp.id}
                          onClick={() => handleGlobalProductSelect(gp)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${selectedGlobalId === gp.id
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                            }`}
                        >
                          <div className="w-12 h-12 bg-white rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {gp.officialImage ? (
                              <img src={gp.officialImage} alt={gp.name} className="w-full h-full object-contain" />
                            ) : (
                              <Globe size={20} className="text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{gp.name}</h4>
                            <p className="text-xs text-gray-500">{gp.brand} • {gp.volume}</p>
                          </div>
                          {selectedGlobalId === gp.id && (
                            <div className="text-blue-600">
                              <Check size={20} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedGlobalId && (
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="font-medium text-gray-900 mb-4">Détails du stock</h3>
                      {/* Form fields below will be rendered */}
                    </div>
                  )}
                </div>
              ) : null}

              {(mode === 'custom' || selectedGlobalId || product) && (
                <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nom du produit *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                          placeholder="ex: Beaufort"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Volume/Contenance *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.volume}
                          onChange={(e) => handleInputChange('volume', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                          placeholder="ex: 33cl, 50cl, 75cl"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Catégorie *
                        </label>
                        <select
                          required
                          value={formData.categoryId}
                          onChange={(e) => handleInputChange('categoryId', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <ImageUpload
                        currentImage={formData.image}
                        onImageChange={(url) => handleInputChange('image', url)}
                        bucketName="product-images"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prix de vente *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          required
                          min="0"
                          value={formData.price}
                          onChange={(e) => handleInputChange('price', e.target.value)}
                          className="w-full pl-3 pr-8 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                          placeholder="500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">F</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock initial *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.stock}
                        onChange={(e) => handleInputChange('stock', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                        placeholder="24"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Seuil alerte *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.alertThreshold}
                        onChange={(e) => handleInputChange('alertThreshold', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 focus:border-amber-400 focus:outline-none"
                        placeholder="10"
                      />
                    </div>
                  </div>
                </form>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Annuler
              </motion.button>

              {(mode === 'custom' || selectedGlobalId || product) && (
                <motion.button
                  type="submit"
                  form="product-form"
                  disabled={isSubmitting}
                  whileHover={!isSubmitting ? { scale: 1.02 } : {}}
                  whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center ${formTouched || selectedGlobalId
                      ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-200'
                      : 'bg-gray-300 text-gray-500'
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
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}