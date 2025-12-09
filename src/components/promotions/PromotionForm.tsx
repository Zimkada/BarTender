import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Calendar, Tag, Percent, DollarSign, Gift, Search } from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { useAppContext } from '../../context/AppContext';
import { useStockManagement } from '../../hooks/useStockManagement';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { Promotion, PromotionType, Product } from '../../types';
import { useNotifications } from '../Notifications';
import { EnhancedButton } from '../EnhancedButton';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface PromotionFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    initialData?: Promotion | null;
}

export function PromotionForm({ isOpen, onClose, onSave, initialData }: PromotionFormProps) {
    const { currentBar } = useBarContext();
    const { categories } = useAppContext();
    const { products } = useStockManagement();
    const { showNotification } = useNotifications();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<PromotionType>('percentage');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');

    // Values
    const [discountPercentage, setDiscountPercentage] = useState<number>(10);
    const [discountAmount, setDiscountAmount] = useState<number>(0);
    const [specialPrice, setSpecialPrice] = useState<number>(0);
    const [bundleQuantity, setBundleQuantity] = useState<number>(2);
    const [bundlePrice, setBundlePrice] = useState<number>(0);

    // Targeting
    const [targetType, setTargetType] = useState<'all' | 'category' | 'product'>('all');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [productSearch, setProductSearch] = useState('');

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setDescription(initialData.description || '');
            setType(initialData.type);
            setStartDate(initialData.startDate.split('T')[0]);
            setEndDate(initialData.endDate ? initialData.endDate.split('T')[0] : '');
            setTargetType(initialData.targetType);

            if (initialData.discountPercentage) setDiscountPercentage(initialData.discountPercentage);
            if (initialData.discountAmount) setDiscountAmount(initialData.discountAmount);
            if (initialData.specialPrice) setSpecialPrice(initialData.specialPrice);
            if (initialData.bundleQuantity) setBundleQuantity(initialData.bundleQuantity);
            if (initialData.bundlePrice) setBundlePrice(initialData.bundlePrice);

            if (initialData.targetCategoryIds) setSelectedCategoryIds(initialData.targetCategoryIds);
            if (initialData.targetProductIds) setSelectedProductIds(initialData.targetProductIds);
        } else {
            resetForm();
        }
    }, [initialData, isOpen]);

    const resetForm = () => {
        setName('');
        setDescription('');
        setType('percentage');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setDiscountPercentage(10);
        setDiscountAmount(0);
        setSpecialPrice(0);
        setBundleQuantity(2);
        setBundlePrice(0);
        setTargetType('all');
        setSelectedCategoryIds([]);
        setSelectedProductIds([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentBar) return;

        // Validation
        if (!name) {
            showNotification('error', 'Le nom est requis');
            return;
        }

        if (targetType === 'category' && selectedCategoryIds.length === 0) {
            showNotification('error', 'Sélectionnez au moins une catégorie');
            return;
        }

        if (targetType === 'product' && selectedProductIds.length === 0) {
            showNotification('error', 'Sélectionnez au moins un produit');
            return;
        }

        setIsSubmitting(true);

        try {
            const promotionData: Partial<Promotion> = {
                barId: currentBar.id,
                name,
                description,
                type,
                startDate: new Date(startDate).toISOString(),
                endDate: endDate ? new Date(endDate).toISOString() : undefined,
                targetType,
                targetCategoryIds: targetType === 'category' ? selectedCategoryIds : undefined,
                targetProductIds: targetType === 'product' ? selectedProductIds : undefined,
                status: initialData ? initialData.status : 'active',
                priority: 0, // Default priority
                createdBy: 'user-id-placeholder' // Should be handled by service or backend
            };

            // Add type-specific fields
            if (type === 'percentage') promotionData.discountPercentage = discountPercentage;
            if (type === 'fixed_discount') promotionData.discountAmount = discountAmount;
            if (type === 'special_price') promotionData.specialPrice = specialPrice;
            if (type === 'bundle') {
                promotionData.bundleQuantity = bundleQuantity;
                promotionData.bundlePrice = bundlePrice;
            }

            if (initialData) {
                await PromotionsService.updatePromotion(initialData.id, promotionData);
                showNotification('success', 'Promotion mise à jour');
            } else {
                await PromotionsService.createPromotion(promotionData as any);
                showNotification('success', 'Promotion créée');
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving promotion:', error);
            showNotification('error', 'Erreur lors de l\'enregistrement');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleCategory = (id: string) => {
        setSelectedCategoryIds(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const toggleProduct = (id: string) => {
        setSelectedProductIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase())
    );

      if (!isOpen) return null;
    
      return (
        <Modal
          open={isOpen}
          onClose={onClose}
          title={initialData ? 'Modifier la promotion' : 'Nouvelle promotion'}
          size="xl"
          footer={
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <EnhancedButton
                    variant="secondary"
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    Annuler
                </EnhancedButton>
                <EnhancedButton
                    variant="primary"
                    onClick={handleSubmit}
                    loading={isSubmitting}
                    icon={<Save size={20} />}
                >
                    Enregistrer
                </EnhancedButton>
            </div>
          }
        >
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="promoName">Nom de la promotion</Label>
                        <Input
                            id="promoName"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="ex: Happy Hour, 3 pour 2..."
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optionnelle)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Détails de l'offre..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            rows={2}
                        />
                    </div>
                </div>
    
                {/* Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Type de promotion</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { id: 'percentage', label: 'Pourcentage', icon: <Percent size={18} /> },
                            { id: 'fixed_discount', label: 'Réduction fixe', icon: <DollarSign size={18} /> },
                            { id: 'special_price', label: 'Prix spécial', icon: <Tag size={18} /> },
                            { id: 'bundle', label: 'Offre groupée', icon: <Gift size={18} /> },
                        ].map((t) => (
                            <Button
                                key={t.id}
                                type="button"
                                variant="outline"
                                onClick={() => setType(t.id as PromotionType)}
                                className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 h-auto ${type === t.id
                                    ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-gray-200 hover:border-amber-200 text-gray-600'
                                    }`}
                            >
                                {t.icon}
                                <span className="text-xs font-medium">{t.label}</span>
                            </Button>
                        ))}
                    </div>
                </div>
    
                {/* Dynamic Value Fields */}
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    {type === 'percentage' && (
                        <div>
                            <Label htmlFor="discountPercentage">Pourcentage de réduction (%)</Label>
                            <Input
                                id="discountPercentage"
                                type="number"
                                min="1"
                                max="100"
                                value={discountPercentage}
                                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                            />
                        </div>
                    )}
                    {type === 'fixed_discount' && (
                        <div>
                            <Label htmlFor="discountAmount">Montant de la réduction (FCFA)</Label>
                            <Input
                                id="discountAmount"
                                type="number"
                                min="0"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                            />
                        </div>
                    )}
                    {type === 'special_price' && (
                        <div>
                            <Label htmlFor="specialPrice">Nouveau prix unitaire (FCFA)</Label>
                            <Input
                                id="specialPrice"
                                type="number"
                                min="0"
                                value={specialPrice}
                                onChange={(e) => setSpecialPrice(Number(e.target.value))}
                            />
                        </div>
                    )}
                    {type === 'bundle' && (
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <Label htmlFor="bundleQuantity">Quantité (ex: 3)</Label>
                                <Input
                                    id="bundleQuantity"
                                    type="number"
                                    min="2"
                                    value={bundleQuantity}
                                    onChange={(e) => setBundleQuantity(Number(e.target.value))}
                                />
                            </div>
                            <div className="flex-1">
                                <Label htmlFor="bundlePrice">Prix du lot (FCFA)</Label>
                                <Input
                                    id="bundlePrice"
                                    type="number"
                                    min="0"
                                    value={bundlePrice}
                                    onChange={(e) => setBundlePrice(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    )}
                </div>
    
                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="startDate">Date de début</Label>
                        <Input
                            id="startDate"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            leftIcon={<Calendar size={18} />}
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="endDate">Date de fin (optionnelle)</Label>
                        <Input
                            id="endDate"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={startDate}
                            leftIcon={<Calendar size={18} />}
                        />
                    </div>
                </div>
    
                {/* Targeting */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Ciblage</label>
                    <div className="flex gap-2 mb-4">
                        {[
                            { id: 'all', label: 'Tout le menu' },
                            { id: 'category', label: 'Par catégorie' },
                            { id: 'product', label: 'Par produit' },
                        ].map((t) => (
                            <Button
                                key={t.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setTargetType(t.id as any)}
                                className={targetType === t.id
                                    ? 'bg-amber-50 border-amber-500 text-amber-700 hover:bg-amber-100'
                                    : 'border-gray-300 text-gray-700'
                                }
                            >
                                {t.label}
                            </Button>
                        ))}
                    </div>
    
                    {targetType === 'category' && (
                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 max-h-48 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-2">
                                {categories.map(cat => (
                                    <label key={cat.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedCategoryIds.includes(cat.id)}
                                            onChange={() => toggleCategory(cat.id)}
                                            className="rounded text-amber-600 focus:ring-amber-500"
                                        />
                                        <span className="text-sm">{cat.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
    
                    {targetType === 'product' && (
                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                            <div className="mb-2">
                                <Input
                                    type="text"
                                    placeholder="Rechercher un produit..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    leftIcon={<Search size={16} />}
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {filteredProducts.map(product => (
                                    <label key={product.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.includes(product.id)}
                                            onChange={() => toggleProduct(product.id)}
                                            className="rounded text-amber-600 focus:ring-amber-500"
                                        />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">{product.name}</div>
                                            <div className="text-xs text-gray-500">{product.volume}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </form>
        </Modal>
      );
    }
    
