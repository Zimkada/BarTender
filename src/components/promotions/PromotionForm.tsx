import { useState, useEffect } from 'react';
import { Save, Calendar, Tag, Percent, DollarSign, Gift, Search, Wand2, ArrowLeft, Filter } from 'lucide-react';
import { useBarContext } from '../../context/BarContext';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';
import { PromotionsService } from '../../services/supabase/promotions.service';
import { Promotion, PromotionType } from '../../types';
import { useNotifications } from '../Notifications';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Textarea } from '../ui/Textarea';
import { Checkbox } from '../ui/Checkbox';
import { RadioGroup, RadioGroupItem } from '../ui/Radio';
import { Button } from '../ui/Button';
import { BackButton } from '../ui/BackButton';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCurrencyFormatter } from '../../hooks/useCurrencyFormatter';

interface PromotionFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    promotion: Promotion | null; // Changed from initialData to promotion
    onCancel: () => void; // Added onCancel
}

export function PromotionForm({ isOpen, onClose, onSave, promotion, onCancel }: PromotionFormProps) {
    const { currentBar } = useBarContext();
    const { categories } = useAppContext();
    const { products, getProductStockInfo } = useUnifiedStock(currentBar?.id); // Replaced useStockManagement with useUnifiedStock
    const { formatPrice } = useCurrencyFormatter(); // Added useCurrencyFormatter
    const { showNotification } = useNotifications();
    const { currentSession } = useAuth();
    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<PromotionType>('reduction_produit');
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
        if (promotion) {
            setName(promotion.name);
            setDescription(promotion.description || '');
            setType(promotion.type);
            setStartDate(promotion.startDate.split('T')[0]);
            setEndDate(promotion.endDate ? promotion.endDate.split('T')[0] : '');
            setTargetType(promotion.targetType);

            if (promotion.discountPercentage) setDiscountPercentage(promotion.discountPercentage);
            if (promotion.discountAmount) setDiscountAmount(promotion.discountAmount);
            if (promotion.specialPrice) setSpecialPrice(promotion.specialPrice);
            if (promotion.bundleQuantity) setBundleQuantity(promotion.bundleQuantity);
            if (promotion.bundlePrice) setBundlePrice(promotion.bundlePrice);

            if (promotion.targetCategoryIds) setSelectedCategoryIds(promotion.targetCategoryIds);
            if (promotion.targetProductIds) setSelectedProductIds(promotion.targetProductIds);
        } else {
            resetForm();
        }
    }, [promotion, isOpen]);

    const resetForm = () => {
        setName('');
        setDescription('');
        setType('reduction_produit');
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

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!currentBar || !currentSession?.userId) return;

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
                status: promotion ? promotion.status : 'active',
                priority: 0,
                createdBy: currentSession.userId
            };

            if (type === 'pourcentage' || type === 'percentage') promotionData.discountPercentage = discountPercentage;
            if (type === 'reduction_vente' || type === 'fixed_discount' || type === 'reduction_produit' || type === 'majoration_produit') {
                promotionData.discountAmount = discountAmount;
            }
            if (type === 'prix_special' || type === 'special_price') promotionData.specialPrice = specialPrice;
            if (type === 'lot' || type === 'bundle') {
                promotionData.bundleQuantity = bundleQuantity;
                promotionData.bundlePrice = bundlePrice;
            }

            if (promotion) {
                await PromotionsService.updatePromotion(promotion.id, promotionData);
                showNotification('success', 'Promotion mise à jour');
            } else {
                await PromotionsService.createPromotion(promotionData as Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>);
                showNotification('success', 'Promotion créée');
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving promotion:', error);
            showNotification('error', 'Erreur lors de l\'enregistrement');
        } finally {
            // Loading handled by button implicitly or removed
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

    const promotionTypes = [
        { id: 'reduction_produit', label: 'Unitaire', description: 'Remise par article', icon: <DollarSign size={20} /> },
        { id: 'pourcentage', label: 'Pourcentage', description: 'Remise en %', icon: <Percent size={20} /> },
        { id: 'lot', label: 'Offre Groupée', description: 'Ex: 3 pour 2000', icon: <Gift size={20} /> },
        { id: 'prix_special', label: 'Prix Fixe', description: 'Nouveau prix', icon: <Tag size={20} /> },
        { id: 'reduction_vente', label: 'Sur Vente', description: 'Remise panier total', icon: <DollarSign size={20} /> },
        { id: 'majoration_produit', label: 'Majoration', description: 'Prix augmenté', icon: <DollarSign size={20} /> },
    ];

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={`flex flex-col md:flex-row overflow-hidden h-full w-full ${isOpen ? '' : 'hidden'}`}
            >
                {/* Header (Mobile-Friendly) */}
                <div className="md:hidden bg-white border-b border-gray-100 p-4 flex items-center justify-between">
                    <BackButton onClick={onClose} className="mr-2" />
                    <h2 className="font-bold text-gray-800">Promotion Studio</h2>
                    <Button onClick={() => handleSubmit()} size="sm" className="btn-brand font-bold">
                        OK
                    </Button>
                </div>

                {/* Left Column: Configuration Form */}
                <div className="flex-1 overflow-y-auto bg-white shadow-2xl z-10">
                    <div className="max-w-3xl mx-auto p-6 md:p-12 space-y-10 pb-32">
                        {/* Title Section */}
                        <div className="hidden md:flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <BackButton onClick={onClose} />
                                <div>
                                    <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                                        Promotion Studio
                                        <Wand2 className="text-brand-primary" />
                                    </h1>
                                    <p className="text-gray-500 font-medium">Configurez votre offre marketing irrésistible</p>
                                </div>
                            </div>
                        </div>

                        {/* step 1: Basics */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-l-4 border-brand-primary pl-4 py-1">
                                <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider">L'Identité</h2>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="promoName" className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Nom de la promotion</Label>
                                    <Input
                                        id="promoName"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="ex: HAPPY HOUR CHILL..."
                                        className="h-14 text-lg font-bold bg-slate-50 border-transparent focus:bg-white focus:border-brand-primary transition-all rounded-2xl"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="description" className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Accroche Marketing</Label>
                                    <Textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Décrivez l'avantage client..."
                                        rows={2}
                                        className="bg-slate-50 border-transparent focus:bg-white focus:border-brand-primary transition-all rounded-2xl p-4"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* step 2: Type Selection */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-l-4 border-brand-primary pl-4 py-1">
                                <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider">Le Mécanisme</h2>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {promotionTypes.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setType(t.id as PromotionType)}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all group ${type === t.id
                                            ? 'border-brand-primary bg-brand-subtle shadow-lg shadow-brand-subtle/40'
                                            : 'border-gray-100 hover:border-brand-subtle bg-slate-50/50'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center transition-all ${type === t.id ? 'btn-brand shadow-lg' : 'bg-white text-gray-400'}`}>
                                            {t.icon}
                                        </div>
                                        <div className={`font-bold text-sm ${type === t.id ? 'text-brand-dark' : 'text-gray-700'}`}>{t.label}</div>
                                        <div className="text-[10px] text-gray-400 font-medium truncate italic">{t.description}</div>
                                    </button>
                                ))}
                            </div>

                            {/* Dynamic Value Input */}
                            <motion.div
                                layout
                                className="bg-brand-subtle p-6 rounded-3xl border border-brand-subtle flex flex-col sm:flex-row items-center gap-6"
                            >
                                <div className="hidden sm:flex w-16 h-16 rounded-full bg-white items-center justify-center text-brand-primary shadow-inner">
                                    <Tag size={32} />
                                </div>
                                <div className="flex-1 w-full space-y-2">
                                    <div className="text-xs font-black text-brand-primary opacity-40 uppercase tracking-[0.15em]">Valeur de la remise</div>

                                    {(type === 'pourcentage' || type === 'percentage') && (
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={discountPercentage}
                                                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                                                className="w-full bg-transparent text-4xl font-black text-brand-primary outline-none"
                                            />
                                            <span className="text-4xl font-black text-brand-primary opacity-20">%</span>
                                        </div>
                                    )}

                                    {(type === 'reduction_vente' || type === 'fixed_discount' || type === 'reduction_produit' || type === 'majoration_produit') && (
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="0"
                                                value={discountAmount}
                                                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                                                className="w-full bg-transparent text-4xl font-black text-brand-primary outline-none"
                                            />
                                            <span className="text-2xl font-black text-brand-primary opacity-20">FCFA</span>
                                        </div>
                                    )}

                                    {(type === 'prix_special' || type === 'special_price') && (
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="0"
                                                value={specialPrice}
                                                onChange={(e) => setSpecialPrice(Number(e.target.value))}
                                                className="w-full bg-transparent text-4xl font-black text-brand-primary outline-none"
                                            />
                                            <span className="text-2xl font-black text-brand-primary opacity-20">FCFA</span>
                                        </div>
                                    )}

                                    {(type === 'lot' || type === 'bundle') && (
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min="2"
                                                value={bundleQuantity}
                                                onChange={(e) => setBundleQuantity(Number(e.target.value))}
                                                className="w-16 bg-white rounded-xl p-2 text-2xl font-black text-brand-primary text-center shadow-sm"
                                            />
                                            <span className="font-bold text-brand-primary opacity-40 uppercase">Articles pour</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={bundlePrice}
                                                    onChange={(e) => setBundlePrice(Number(e.target.value))}
                                                    className="w-32 bg-transparent text-2xl font-black text-brand-primary outline-none"
                                                />
                                                <span className="text-lg font-black text-brand-primary opacity-20">FCFA</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </section>

                        {/* step 3: Targeting */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-l-4 border-brand-primary pl-4 py-1">
                                <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider">Le Ciblage</h2>
                            </div>

                            <RadioGroup
                                name="targetType"
                                value={targetType}
                                onValueChange={(value: 'all' | 'category' | 'product') => setTargetType(value)}
                                className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3"
                            >
                                {[
                                    { id: 'all', label: 'Tout le menu', icon: <Gift size={16} /> },
                                    { id: 'category', label: 'Catégories', icon: <Filter size={16} /> },
                                    { id: 'product', label: 'Produits', icon: <Search size={16} /> },
                                ].map((t) => (
                                    <div
                                        key={t.id}
                                        onClick={() => setTargetType(t.id as 'all' | 'category' | 'product')}
                                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer h-full ${targetType === t.id ? 'border-brand-primary bg-brand-subtle' : 'border-slate-100 bg-slate-50 hover:border-brand-subtle'}`}
                                    >
                                        <RadioGroupItem value={t.id} id={`targetType-${t.id}`} className="text-brand-primary border-brand-subtle shrink-0" />
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className={`p-1.5 rounded-md shrink-0 ${targetType === t.id ? 'bg-brand-primary text-white' : 'bg-white text-gray-400'}`}>
                                                {t.icon}
                                            </span>
                                            <span className={`text-sm font-bold break-words leading-tight ${targetType === t.id ? 'text-brand-dark' : 'text-gray-600'}`}>
                                                {t.label}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </RadioGroup>

                            <AnimatePresence mode="wait">
                                {targetType === 'category' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="border border-gray-100 rounded-3xl p-6 bg-slate-50 max-h-64 overflow-y-auto overflow-hidden shadow-inner"
                                    >
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {categories.map(cat => (
                                                <div
                                                    key={cat.id}
                                                    onClick={() => toggleCategory(cat.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${selectedCategoryIds.includes(cat.id) ? 'bg-brand-primary text-white shadow-lg shadow-brand-subtle/40 scale-[1.02]' : 'bg-white hover:bg-brand-subtle text-gray-700'}`}
                                                >
                                                    <Checkbox
                                                        id={`category-${cat.id}`}
                                                        checked={selectedCategoryIds.includes(cat.id)}
                                                        onCheckedChange={() => toggleCategory(cat.id)}
                                                        className={`shrink-0 ${selectedCategoryIds.includes(cat.id) ? 'border-white' : 'border-gray-200'}`}
                                                    />
                                                    <span className="text-sm font-bold line-clamp-2 leading-tight">{cat.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                                {targetType === 'product' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="border border-gray-100 rounded-3xl p-6 bg-slate-50 overflow-hidden shadow-inner"
                                    >
                                        <div className="relative mb-4">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                placeholder="Rechercher un produit..."
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                                className="w-full bg-white rounded-xl pl-12 pr-4 h-12 text-sm font-semibold outline-none focus:ring-2 ring-brand-primary/20"
                                            />
                                        </div>
                                        <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                                            {filteredProducts.map(product => (
                                                <div
                                                    key={product.id}
                                                    onClick={() => toggleProduct(product.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${selectedProductIds.includes(product.id) ? 'bg-brand-primary text-white shadow-lg shadow-brand-subtle/40' : 'bg-white hover:bg-brand-subtle text-gray-700'}`}
                                                >
                                                    <Checkbox
                                                        id={`product-${product.id}`}
                                                        checked={selectedProductIds.includes(product.id)}
                                                        onCheckedChange={() => toggleProduct(product.id)}
                                                        className={`shrink-0 ${selectedProductIds.includes(product.id) ? 'border-white' : 'border-gray-200'}`}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold line-clamp-2 leading-tight">{product.name}</div>
                                                        <div className={`text-[10px] uppercase font-medium ${selectedProductIds.includes(product.id) ? 'text-white/70' : 'text-gray-400'}`}>{product.volume}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>

                        {/* step 4: Dates */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-l-4 border-brand-primary pl-4 py-1">
                                <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider">La Période</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="startDate" className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Date de lancement</Label>
                                    <div className="relative group">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary" size={18} />
                                        <input
                                            id="startDate"
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 font-bold text-gray-800 focus:ring-2 ring-brand-primary/20"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="endDate" className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Fin (Illimité si vide)</Label>
                                    <div className="relative group">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-brand-primary" size={18} />
                                        <input
                                            id="endDate"
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            min={startDate}
                                            className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 font-bold text-gray-800 focus:ring-2 ring-brand-primary/20"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Desktop Footer Actions */}
                        <div className="hidden md:flex pt-10 border-t border-gray-100 gap-4">
                            <Button
                                onClick={onClose}
                                variant="ghost"
                                className="h-14 px-8 rounded-2xl font-bold text-gray-500 hover:bg-slate-100 transition-all flex-1"
                            >
                                Abandonner
                            </Button>
                            <Button
                                onClick={() => handleSubmit()}
                                className="h-14 px-12 rounded-2xl font-black uppercase tracking-widest btn-brand shadow-xl shadow-brand-subtle/50 hover:scale-[1.02] flex-[2]"
                            >
                                <Save className="mr-2" size={20} />
                                Activer la Promotion
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Live Preview Card */}
                <div className="hidden md:flex flex-1 bg-slate-100 items-center justify-center p-12 relative overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary opacity-20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-primary opacity-10 blur-[80px] rounded-full -translate-x-1/2 translate-y-1/2"></div>

                    <div className="max-w-md w-full perspective-1000">
                        <div className="mb-8 text-center">
                            <span className="px-5 py-2 rounded-full bg-brand-subtle text-brand-primary font-black text-xs uppercase tracking-widest border border-brand-subtle">
                                Prévisualisation en direct
                            </span>
                        </div>

                        {/* Ticket Preview */}
                        <motion.div
                            key={type + name + discountAmount + discountPercentage}
                            initial={{ scale: 0.9, opacity: 0, rotateX: 20 }}
                            animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                            className="bg-white rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] border border-white overflow-hidden"
                        >
                            {/* Card Body */}
                            <div className="p-10 text-center relative overflow-hidden">
                                {/* Gradient Circle behind icon */}
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-to-b from-brand-primary to-transparent opacity-10 rounded-full"></div>

                                <div className="relative mb-8 pt-4">
                                    <div className="w-20 h-20 btn-brand rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-brand-subtle transform -rotate-3 group-hover:rotate-0 transition-transform">
                                        {promotionTypes.find(t => t.id === type)?.icon || <Percent size={32} />}
                                    </div>
                                </div>

                                <h2 className="text-3xl font-black text-gray-800 mb-2 uppercase tracking-tight break-words">
                                    {name || 'Nom de la Promo'}
                                </h2>
                                <p className="text-gray-400 font-medium italic text-sm mb-10 min-h-[40px]">
                                    {description || "Dites quelque chose d'alléchant ici..."}
                                </p>

                                <div className="space-y-6">
                                    <div className="py-6 border-y border-dashed border-gray-100">
                                        <div className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mb-2">Offre Exclusive</div>
                                        <div className="text-5xl font-black text-gray-900 leading-tight">
                                            {(type === 'pourcentage' || type === 'percentage') && `-${discountPercentage}%`}
                                            {(type === 'reduction_vente' || type === 'fixed_discount') && `-${discountAmount} F`}
                                            {type === 'reduction_produit' && `-${discountAmount} F`}
                                            {type === 'majoration_produit' && `+${discountAmount} F`}
                                            {(type === 'prix_special' || type === 'special_price') && `${specialPrice} F`}
                                            {(type === 'lot' || type === 'bundle') && `${bundleQuantity} pts / ${bundlePrice} F`}
                                        </div>
                                        <div className="text-xs font-bold text-gray-400 mt-2 uppercase">
                                            {type === 'reduction_produit' || type === 'majoration_produit' || type === 'prix_special' ? 'Par unité' : 'Sur votre achat'}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center text-[10px] font-black text-gray-300 uppercase tracking-widest px-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span>Valide Du</span>
                                            <span className="text-gray-900 bg-slate-50 px-2 py-1 rounded-md">{format(new Date(startDate), 'dd MMM yyyy', { locale: fr })}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 text-right">
                                            <span>Expire Le</span>
                                            <span className="text-gray-900 bg-slate-50 px-2 py-1 rounded-md">
                                                {endDate ? format(new Date(endDate), 'dd MMM yyyy', { locale: fr }) : 'JAMAIS'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Barcode/Branding Area */}
                            <div className="bg-slate-50 p-6 flex flex-col items-center gap-3">
                                <div className="w-full h-12 flex gap-1 items-center justify-center opacity-20 overflow-hidden">
                                    {[...Array(30)].map((_, i) => (
                                        <div key={i} className={`bg-gray-900 w-[${Math.random() * 3 + 1}px] h-full`}></div>
                                    ))}
                                </div>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.4em]">BarTender Digital Pass</span>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
