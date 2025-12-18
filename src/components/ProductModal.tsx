import React, { useState, useEffect } from 'react';
import { X, Loader2, Globe, PenTool, Search, Check } from 'lucide-react';
import { Product, Category, GlobalProduct } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { ImageUpload } from './ImageUpload';
import { ProductsService } from '../services/supabase/products.service';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Input } from './ui/Input';

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
  const { categories } = useAppContext();
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

  const categoryOptions = React.useMemo(() => 
    categories.map(c => ({ value: c.id, label: c.name })),
  [categories]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={product ? 'Modifier le produit' : 'Ajouter un produit'}
      size="xl"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
            disabled={isSubmitting}
          >
            Annuler
          </Button>

          {(mode === 'custom' || selectedGlobalId || product) && (
            <Button
              type="submit"
              form="product-form"
              disabled={isSubmitting || !(formTouched || selectedGlobalId)}
              className="flex-1"
            >
              {isSubmitting && <Spinner size="sm" className="mr-2" />}
              {isSubmitting ? 'Traitement...' : (product ? 'Modifier' : 'Ajouter')}
            </Button>
          )}
        </>
      }
    >
      {!product && (
        <div className="flex p-2 gap-2 bg-gray-50 border-b border-gray-100">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode('custom')}
            className={`flex-1 ${mode === 'custom'
                ? 'bg-white text-amber-600 shadow-sm border border-gray-200 hover:bg-white'
                : 'text-gray-500 hover:bg-gray-100'
              }`}
          >
            <PenTool size={16} className="mr-2" />
            Produit Personnalisé
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode('global')}
            className={`flex-1 ${mode === 'global'
                ? 'bg-white text-blue-600 shadow-sm border border-gray-200 hover:bg-white'
                : 'text-gray-500 hover:bg-gray-100'
              }`}
          >
            <Globe size={16} className="mr-2" />
            Catalogue Global
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {mode === 'global' && !product ? (
          <div className="space-y-4">
                                                <Input
                                                  type="text"
                                                  placeholder="Rechercher dans le catalogue..."
                                                  value={searchTerm}
                                                  onChange={(e) => setSearchTerm(e.target.value)}
                                                  leftIcon={<Search size={18} />}
                                                  className="bg-gray-50"
                                                />                              {isLoadingGlobal ? (
                                <div className="flex justify-center py-8">
                                  <Spinner size="lg" />
                                </div>
                              ) : (              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                        <Label htmlFor="productName">Nom du produit *</Label>
                                        <Input
                                            id="productName"
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            placeholder="ex: Beaufort"
                                        />
                                      </div>
                
                                      <div>
                                        <Label htmlFor="productVolume">Volume/Contenance *</Label>
                                        <Input
                                            id="productVolume"
                                            type="text"
                                            required
                                            value={formData.volume}
                                            onChange={(e) => handleInputChange('volume', e.target.value)}
                                            placeholder="ex: 33cl, 50cl, 75cl"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="categoryId">Catégorie *</Label>
                                                                <Select
                                                                    id="categoryId"
                                                                    required
                                                                    value={formData.categoryId}
                                                                    onChange={(e) => handleInputChange('categoryId', e.target.value)}
                                                                    options={categoryOptions}
                                                                />                                      </div>              </div>

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
                                  <Label htmlFor="price">Prix de vente *</Label>
                                  <Input
                                      id="price"
                                      type="number"
                                      required
                                      min="0"
                                      value={formData.price}
                                      onChange={(e) => handleInputChange('price', e.target.value)}
                                      placeholder="500"
                                      endAdornment="F"
                                  />
                                </div>
            
                                <div>
                                  <Label htmlFor="stock">Stock initial *</Label>
                                  <Input
                                      id="stock"
                                      type="number"
                                      required
                                      min="0"
                                      value={formData.stock}
                                      onChange={(e) => handleInputChange('stock', e.target.value)}
                                      placeholder="24"
                                  />
                                </div>
            
                                <div>
                                  <Label htmlFor="alertThreshold">Seuil alerte *</Label>
                                  <Input
                                      id="alertThreshold"
                                      type="number"
                                      required
                                      min="0"
                                      value={formData.alertThreshold}
                                      onChange={(e) => handleInputChange('alertThreshold', e.target.value)}
                                      placeholder="10"
                                  />
                                </div>
                              </div>          </form>
        )}
      </div>
    </Modal>
  );
}