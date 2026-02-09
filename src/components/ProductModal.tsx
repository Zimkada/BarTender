import React, { useState, useEffect, useMemo } from 'react';
import { Globe, PenTool, Search, ChevronRight, PlusCircle, Edit } from 'lucide-react';
import { Product, Category, GlobalProduct } from '../types';
import { useAppContext } from '../context/AppContext';
import { ImageUpload } from './ImageUpload';
import { ProductsService } from '../services/supabase/products.service';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Input } from './ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import { BackButton } from './ui/BackButton';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'createdAt' | 'barId'>) => void;
  categories: Category[];
  product?: Product;
  inline?: boolean;
}

type Mode = 'custom' | 'global';
type Step = 'selection' | 'details'; // NEW: For navigation

export function ProductModal({ isOpen, onClose, onSave, product, inline = false }: ProductModalProps) {
  const { categories } = useAppContext();
  const [mode, setMode] = useState<Mode>('global');
  const [step, setStep] = useState<Step>('selection'); // NEW: Current step
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

  // 🛡️ wasOpen Ref: Protège le formulaire contre les resets intempestifs
  // Notamment lors du rafraîchissement des catégories en arrière-plan (React Query)
  const wasOpen = React.useRef(false);

  useEffect(() => {
    // On ne reset le formulaire que si le modal VIENT d'ouvrir
    // OU si l'objet 'product' passé en prop a explicitement changé (ex: switch d'édition)
    const justOpened = isOpen && !wasOpen.current;

    if (justOpened || (isOpen && product)) {
      if (product) {
        setMode('custom');
        setStep('details');
        setFormData({
          name: product.name,
          volume: product.volume,
          price: product.price.toString(),
          stock: product.stock.toString(),
          categoryId: product.categoryId,
          image: product.image || '',
          alertThreshold: product.alertThreshold.toString(),
        });
      } else if (justOpened) {
        // Reset uniquement à l'ouverture pour un nouveau produit
        setFormData({
          name: '',
          volume: '',
          price: '',
          stock: '',
          categoryId: categories[0]?.id || '',
          image: '',
          alertThreshold: '10',
        });
        setSelectedGlobalId(null);
        setStep('selection');
      }
    }
    wasOpen.current = isOpen;
  }, [product, categories.length, isOpen]);

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
    setStep('details'); // Advance to next step
  };

  const handleBackToSelection = () => {
    setStep('selection');
    setSelectedGlobalId(null);
  }

  const handleCustomProductStart = () => {
    setMode('custom');
    setStep('details');
  }


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      onSave({
        name: formData.name,
        volume: formData.volume,
        price: parseFloat(formData.price),
        ...(product ? {} : { stock: parseInt(formData.stock) || 0 }),
        categoryId: formData.categoryId,
        image: formData.image || undefined,
        alertThreshold: parseInt(formData.alertThreshold) || 10,
        globalProductId: product?.globalProductId || (mode === 'global' ? selectedGlobalId || undefined : undefined),
        isCustomProduct: mode === 'custom' && !selectedGlobalId && !product?.globalProductId,
      } as Omit<Product, 'id' | 'createdAt' | 'barId'>);
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

  const categoryOptions = useMemo(() =>
    categories.map(c => ({ value: c.id, label: c.name })),
    [categories]);

  const content = (
    <div className={`flex flex-col ${inline ? '' : 'h-full'}`}>
      <AnimatePresence mode="wait">
        {step === 'selection' && !product ? (
          <motion.div
            key="step-selection"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col h-full"
          >
            <div className="flex flex-wrap p-2 gap-2 bg-gray-50 border-b border-gray-100 rounded-t-xl shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode('global')}
                className={`flex-1 min-w-fit text-sm sm:text-base font-medium transition-all ${mode === 'global'
                  ? 'bg-brand-subtle text-brand-dark shadow-md border-2 border-brand-primary'
                  : 'text-gray-600 border-2 border-transparent hover:bg-brand-subtle/50'
                  }`}
              >
                <Globe size={16} className="mr-1 sm:mr-2 shrink-0" />
                <span className="hidden sm:inline">Catalogue Global</span>
                <span className="sm:hidden">Catalogue</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode('custom')} // Just change tab styling
                onMouseDown={handleCustomProductStart} // Action on click
                className={`flex-1 min-w-fit text-sm sm:text-base font-medium transition-all ${mode === 'custom'
                  ? 'bg-brand-subtle text-brand-dark shadow-md border-2 border-brand-primary'
                  : 'text-gray-600 border-2 border-transparent hover:bg-brand-subtle/50'
                  }`}
              >
                <PenTool size={16} className="mr-1 sm:mr-2 shrink-0" />
                <span className="hidden sm:inline">Produit Personnalisé</span>
                <span className="sm:hidden">Personnalisé</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {mode === 'global' && (
                <div className="space-y-4">
                  <Input
                    type="text"
                    placeholder="Rechercher dans le catalogue..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    leftIcon={<Search size={18} />}
                    className="bg-gray-50"
                  />
                  {isLoadingGlobal ? (
                    <div className="flex justify-center py-8">
                      <Spinner size="lg" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredGlobalProducts.map((gp) => (
                        <div
                          key={gp.id}
                          onClick={() => handleGlobalProductSelect(gp)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 group active:scale-95`}
                        >
                          <div className="w-12 h-12 bg-white rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-110 transition-transform">
                            {gp.officialImage ? (
                              <img src={gp.officialImage} alt={gp.name} className="w-full h-full object-contain" />
                            ) : (
                              <Globe size={20} className="text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate group-hover:text-blue-700 transition-colors">{gp.name}</h4>
                            <p className="text-xs text-gray-500">{gp.brand} • {gp.volume}</p>
                          </div>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step-details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col h-full"
          >
            {/* Header with back button only if we came from selection (not direct edit) */}
            {!product && (
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
                <BackButton
                  onClick={handleBackToSelection}
                  showLabel={true}
                  label={mode === 'global' ? "Retour au catalogue" : "Annuler"}
                  size="sm"
                  className='h-8'
                />
                {mode === 'global' && selectedGlobalId && (
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-auto">Produit sélectionné</span>
                )}
                {mode === 'custom' && (
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-auto">Création manuelle</span>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
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
                    <Label htmlFor="stock">
                      Stock initial {product ? '(lecture seule)' : '*'}
                    </Label>
                    <Input
                      id="stock"
                      type="number"
                      required={!product}
                      min="0"
                      value={formData.stock}
                      onChange={(e) => {
                        if (!product) handleInputChange('stock', e.target.value);
                      }}
                      disabled={!!product}
                      placeholder="24"
                      className={product ? 'opacity-60 cursor-not-allowed' : ''}
                    />
                    {product && (
                      <p className="text-xs text-brand-primary mt-1">
                        ⚠️ Le stock ne peut être modifié que via: ventes, approvisionnements, ou ajustements spécifiques
                      </p>
                    )}
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
                </div>
              </form>
            </div>

            <div className={`p-4 border-t border-gray-100 flex gap-3 ${inline ? 'mt-auto' : ''}`}>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="flex-1"
                disabled={isSubmitting}
              >
                Fermer
              </Button>

              <Button
                type="submit"
                form="product-form"
                disabled={isSubmitting || !formTouched}
                className="flex-1"
              >
                {isSubmitting && <Spinner size="sm" className="mr-2" />}
                {isSubmitting ? 'Traitement...' : (product ? 'Modifier' : 'Confirmer Ajout')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={product ? 'Modifier le produit' : 'Ajouter un produit'}
      size="xl"
      icon={product ? <Edit className="text-amber-600" size={20} /> : <PlusCircle className="text-brand-primary" size={20} />}
      headerClassName={product ? "bg-amber-50/50" : "bg-brand-subtle/30"}
    >
      {content}
    </Modal>
  );
}