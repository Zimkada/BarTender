import React, { useState, useMemo, useEffect } from 'react';
import {
    Search,
    User,
    Phone,
    Calendar,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    ShoppingCart,
    Package,
    Archive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { useBarContext } from '../../context/BarContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useFeedback } from '../../hooks/useFeedback';
import { EnhancedButton } from '../EnhancedButton';
import { Sale, SaleItem, Consignment, User as UserType } from '../../types';
import { BackButton } from '../ui/BackButton';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';

interface CreateConsignmentFormProps {
    consignments: Consignment[];
    onCreate: (data: any) => Promise<any>;
    onCancel: () => void;
    onSuccess: () => void;
}

export function CreateConsignmentForm({
    consignments,
    onCreate,
    onCancel,
    onSuccess
}: CreateConsignmentFormProps) {
    const { getTodaySales, getReturnsBySale } = useAppContext();
    const { formatPrice } = useCurrencyFormatter();
    const { currentBar, barMembers } = useBarContext();
    const { currentSession: session } = useAuth();
    const { showSuccess, showError } = useFeedback();

    const users = useMemo(() =>
        Array.isArray(barMembers) ? barMembers.map((m: any) => m.user).filter(Boolean) as UserType[] : [],
        [barMembers]
    );

    // --- STATE ---
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [selectedSaleId, setSelectedSaleId] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSeller, setFilterSeller] = useState<string>('all');
    const [isInfoExpanded, setIsInfoExpanded] = useState(false);
    const [expirationDays, setExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);

    // Update expiration days when bar settings change
    useEffect(() => {
        if (currentBar?.settings?.consignmentExpirationDays) {
            setExpirationDays(currentBar.settings.consignmentExpirationDays);
        }
    }, [currentBar?.settings?.consignmentExpirationDays]);

    // --- DATA DERIVATION ---
    const todaySales = getTodaySales();

    const filteredSales = useMemo(() => {
        if (!currentBar || !session) return [];
        let filtered = todaySales;

        if (filterSeller !== 'all') {
            filtered = filtered.filter(sale => sale.soldBy === filterSeller);
        }

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(sale =>
                sale.id.toLowerCase().includes(lowerTerm) ||
                sale.items.some(item => item.product_name.toLowerCase().includes(lowerTerm))
            );
        }

        return [...filtered].sort((a, b) =>
            new Date(b.validatedAt || b.createdAt).getTime() - new Date(a.validatedAt || a.createdAt).getTime()
        );
    }, [todaySales, filterSeller, searchTerm, currentBar, session]);

    const sellersWithSales = useMemo(() => {
        if (!currentBar || !session || !Array.isArray(todaySales) || !Array.isArray(users)) return [];
        const sellerIds = new Set(todaySales.map(sale => sale.soldBy).filter(Boolean));
        return users.filter(user => sellerIds.has(user.id));
    }, [todaySales, users, currentBar, session]);

    const selectedSale = useMemo(() =>
        todaySales.find(s => s.id === selectedSaleId),
        [todaySales, selectedSaleId]
    );

    const selectedProductItem = useMemo(() =>
        selectedSale?.items.find((item: SaleItem) => item.product_id === selectedProductId),
        [selectedSale, selectedProductId]
    );

    // --- LOGIC ---
    const getAlreadyReturned = (saleId: string, productId: string): number => {
        return getReturnsBySale(saleId)
            .filter(r => r.productId === productId && r.status !== 'rejected')
            .reduce((sum, r) => sum + r.quantityReturned, 0);
    };

    const getAlreadyConsignedCount = (saleId: string, productId: string): number => {
        return consignments
            .filter(c => c.saleId === saleId && c.productId === productId && c.status === 'active')
            .reduce((sum, c) => sum + c.quantity, 0);
    };

    const maxQuantity = selectedProductItem
        ? selectedProductItem.quantity -
        getAlreadyReturned(selectedSaleId, selectedProductId) -
        getAlreadyConsignedCount(selectedSaleId, selectedProductId)
        : 0;

    const handleSaleSelect = (saleId: string) => {
        setSelectedSaleId(saleId);
        setSelectedProductId('');
        setStep(2);
    };

    const handleProductSelect = (productId: string) => {
        setSelectedProductId(productId);
        setQuantity(1);
        setStep(3);
    };

    const handleSubmit = async () => {
        if (!selectedSale || !selectedProductItem) {
            showError('Données manquantes');
            return;
        }

        if (quantity < 1 || quantity > maxQuantity) {
            showError(`Quantité invalide (max: ${maxQuantity})`);
            return;
        }

        if (!customerName.trim()) {
            showError('Veuillez saisir le nom du client');
            return;
        }

        try {
            const consignmentData = {
                saleId: selectedSale.id,
                productId: selectedProductItem.product_id,
                productName: selectedProductItem.product_name,
                productVolume: selectedProductItem.product_volume,
                quantity,
                totalAmount: selectedProductItem.unit_price * quantity,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim() || undefined,
                notes: notes.trim() || undefined,
                expirationDays,
                originalSeller: selectedSale.createdBy,
                serverId: selectedSale.soldBy,
                businessDate: selectedSale.businessDate,
            };

            const result = await onCreate(consignmentData);
            if (result) {
                showSuccess(`Consignation créée pour ${customerName}`);
                onSuccess();
            }
        } catch (error) {
            showError('Erreur lors de la création de la consignation');
        }
    };

    // --- ANIMATION VARIANTS ---
    const stepVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 50 : -50,
            opacity: 0,
        }),
    };

    return (
        <div className="flex flex-col h-full bg-white sm:bg-transparent">
            {/* 📘 ONBOARDING / HELP PANEL (Always at top if expanded) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden mb-6 shadow-sm">
                <button
                    onClick={() => setIsInfoExpanded(!isInfoExpanded)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-2 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                        </div>
                        <p className="font-bold text-amber-900">Processus consignation</p>
                    </div>
                    {isInfoExpanded ? (
                        <ChevronUp className="w-5 h-5 text-amber-600" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-amber-600" />
                    )}
                </button>
                <AnimatePresence>
                    {isInfoExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="px-5 pb-5 pt-1 border-t border-amber-200">
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <span className="bg-amber-100 text-amber-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                                        <p className="text-sm text-amber-800">Sélectionnez la vente d'origine effectuée aujourd'hui.</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="bg-amber-100 text-amber-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                                        <p className="text-sm text-amber-800">Choisissez le produit spécifique à mettre de côté.</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="bg-amber-100 text-amber-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                                        <p className="text-sm text-amber-800">Indiquez les informations du client pour le suivi.</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="relative flex-1">
                <AnimatePresence mode="wait" custom={step}>
                    {/* STEP 1: SELECT SALE */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            custom={1}
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-800">1. Sélectionner la vente</h3>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    {/* Search */}
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <Input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="ID vente ou produit..."
                                            className="pl-9 bg-white border-gray-200"
                                        />
                                    </div>

                                    {/* Filter Seller */}
                                    {sellersWithSales.length > 0 && (
                                        <div className="w-full sm:w-64">
                                            <Select
                                                value={filterSeller}
                                                onChange={(e) => setFilterSeller(e.target.value)}
                                                options={[
                                                    { value: 'all', label: 'Tous les vendeurs' },
                                                    ...sellersWithSales.map(seller => ({
                                                        value: seller.id,
                                                        label: seller.name
                                                    }))
                                                ]}
                                                leftIcon={<User size={14} className="text-gray-400" />}
                                                className="bg-white border-gray-200"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 pb-4 scrollbar-thin">
                                    {filteredSales.length === 0 ? (
                                        <div className="col-span-full py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                                            <ShoppingCart size={48} strokeWidth={1} className="mb-4 opacity-20" />
                                            <p className="font-medium text-gray-500">Aucune vente correspondante</p>
                                            <button
                                                onClick={() => { setSearchTerm(''); setFilterSeller('all'); }}
                                                className="mt-2 text-amber-600 font-semibold hover:underline"
                                            >
                                                Réinitialiser les filtres
                                            </button>
                                        </div>
                                    ) : (
                                        filteredSales.map(sale => {
                                            const serverUserId = sale.soldBy;
                                            const seller = serverUserId ? users.find(u => u.id === serverUserId) : null;
                                            const productPreview = sale.items.slice(0, 2).map(i => `${i.quantity}x ${i.product_name}`).join(', ');
                                            const moreCount = sale.items.length - 2;

                                            return (
                                                <button
                                                    key={sale.id}
                                                    onClick={() => handleSaleSelect(sale.id)}
                                                    className="group p-5 bg-white rounded-2xl border-2 border-gray-100 text-left transition-all hover:border-amber-400 hover:shadow-xl hover:shadow-amber-100 hover:-translate-y-1"
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="bg-gray-100 px-3 py-1 rounded-lg">
                                                            <span className="font-mono text-xs font-bold text-gray-600">#{sale.id.slice(-6).toUpperCase()}</span>
                                                        </div>
                                                        <div className="text-sm font-black text-gray-900">{formatPrice(sale.total)}</div>
                                                    </div>

                                                    <div className="text-sm text-gray-800 font-medium line-clamp-2 min-h-[40px] mb-3">
                                                        {productPreview}{moreCount > 0 && <span className="text-amber-600 font-bold ml-1">+{moreCount} articles</span>}
                                                    </div>

                                                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                                                        <div className="flex items-center gap-2">
                                                            {seller && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center">
                                                                        <User size={10} className="text-purple-600" />
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-purple-600 uppercase tracking-tight">{seller.name}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                            {new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 2: SELECT PRODUCT */}
                    {step === 2 && selectedSale && (
                        <motion.div
                            key="step2"
                            custom={selectedSaleId}
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <BackButton
                                            onClick={() => setStep(1)}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 border-none px-2"
                                        />
                                        <h3 className="text-lg font-bold text-gray-800">2. Choisir le produit</h3>
                                    </div>
                                </div>

                                {/* Selected Sale Recap */}
                                <div className="bg-gradient-to-br from-amber-900 to-amber-950 text-white rounded-2xl p-5 shadow-lg flex justify-between items-center border border-amber-800/50">
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-amber-200/60 tracking-widest mb-1">Vente sélectionnée</p>
                                        <p className="text-sm font-bold text-amber-50">#{selectedSaleId.slice(-6).toUpperCase()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase font-black text-amber-200/60 tracking-widest mb-1">Total Payé</p>
                                        <p className="text-xl font-black text-white font-mono tracking-tighter">{formatPrice(selectedSale.total)}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {selectedSale.items.map((item: SaleItem) => {
                                        const consignedCount = getAlreadyConsignedCount(selectedSale.id, item.product_id);
                                        const returnedCount = getAlreadyReturned(selectedSale.id, item.product_id);
                                        const available = item.quantity - consignedCount - returnedCount;
                                        const isFullyUnavailable = available <= 0;

                                        return (
                                            <button
                                                key={item.product_id}
                                                onClick={() => !isFullyUnavailable && handleProductSelect(item.product_id)}
                                                disabled={isFullyUnavailable}
                                                className={`group p-5 rounded-2xl border-2 text-left transition-all ${isFullyUnavailable
                                                    ? 'bg-gray-100 border-gray-200 opacity-60 grayscale cursor-not-allowed'
                                                    : 'bg-white border-gray-100 hover:border-amber-400 hover:shadow-xl hover:-translate-y-1'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${isFullyUnavailable ? 'bg-gray-200 text-gray-400' : 'bg-amber-100 text-amber-600'}`}>
                                                        {item.quantity}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-gray-900 truncate">{item.product_name}</h4>
                                                        <p className="text-xs text-gray-500">{item.product_volume || 'Format standard'}</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5 pt-3 border-t border-gray-50">
                                                    {consignedCount > 0 && (
                                                        <div className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                                                            <Archive className="w-3 h-3" />
                                                            <span>{consignedCount} déjà consigné(s)</span>
                                                        </div>
                                                    )}
                                                    {returnedCount > 0 && (
                                                        <div className="flex items-center gap-2 text-xs text-red-500 font-bold">
                                                            <Package className="w-3 h-3" />
                                                            <span>{returnedCount} déjà retourné(s)</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-4 flex items-center justify-between">
                                                    <span className={`text-[11px] font-black uppercase px-2 py-1 rounded ${isFullyUnavailable ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                        {isFullyUnavailable ? 'Plus de stock' : `Dispo: ${available}`}
                                                    </span>
                                                    <span className="text-sm font-bold text-gray-700 font-mono">{formatPrice(item.unit_price)}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3: CONSIGNMENT DETAILS */}
                    {step === 3 && selectedProductItem && (
                        <motion.div
                            key="step3"
                            custom={selectedProductId}
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <BackButton
                                            onClick={() => setStep(2)}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 border-none px-2"
                                        />
                                        <h3 className="text-lg font-bold text-gray-800">3. Détails</h3>
                                    </div>
                                </div>

                                {/* Form Body */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left Column: Input Form */}
                                    <div className="lg:col-span-2 space-y-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {/* Quantity */}
                                            <div className="space-y-2">
                                                <Label htmlFor="qty" className="font-bold text-gray-700">Quantité à consigner</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="qty"
                                                        type="number"
                                                        min="1"
                                                        max={maxQuantity}
                                                        value={quantity}
                                                        onChange={(e) => setQuantity(Number(e.target.value))}
                                                        className="bg-gray-50 border-gray-200 h-12 text-lg font-bold focus:bg-white"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 uppercase">Max: {maxQuantity}</span>
                                                </div>
                                            </div>

                                            {/* Expiration */}
                                            <div className="space-y-2">
                                                <Label htmlFor="days" className="font-bold text-gray-700">Délai (jours)</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="days"
                                                        type="number"
                                                        min="1"
                                                        value={expirationDays}
                                                        onChange={(e) => setExpirationDays(Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="bg-gray-50 border-gray-200 h-12 text-lg font-bold focus:bg-white"
                                                    />
                                                    <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {/* Customer Name */}
                                            <div className="space-y-2">
                                                <Label htmlFor="cName" className="font-bold text-gray-700">Nom du client *</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="cName"
                                                        type="text"
                                                        value={customerName}
                                                        onChange={(e) => setCustomerName(e.target.value)}
                                                        placeholder="Ex: Jean Dupont"
                                                        className="bg-gray-50 border-gray-200 h-12 pl-10 focus:bg-white"
                                                    />
                                                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                </div>
                                            </div>

                                            {/* Customer Phone */}
                                            <div className="space-y-2">
                                                <Label htmlFor="cPhone" className="font-bold text-gray-700">Téléphone client</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="cPhone"
                                                        type="tel"
                                                        value={customerPhone}
                                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                                        placeholder="+229 00 00 00 00"
                                                        className="bg-gray-50 border-gray-200 h-12 pl-10 focus:bg-white"
                                                    />
                                                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Notes */}
                                        <div className="space-y-2">
                                            <Label htmlFor="notes" className="font-bold text-gray-700">Notes & Observations</Label>
                                            <Textarea
                                                id="notes"
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Ex: Bouteille entamée ou condition particulière..."
                                                className="bg-gray-50 border-gray-200 focus:bg-white resize-none"
                                                rows={3}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column: Dynamic Recap "Ticket" */}
                                    <div className="lg:col-span-1">
                                        <div className="bg-amber-100 rounded-3xl p-6 border-2 border-dashed border-amber-300 relative overflow-hidden h-full flex flex-col">
                                            {/* Top Cutout */}
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full" />

                                            <div className="text-center mb-6">
                                                <Package className="w-12 h-12 text-amber-600 mx-auto mb-2 opacity-50" />
                                                <h4 className="font-black text-amber-900 uppercase tracking-widest text-sm">Récapitulatif</h4>
                                            </div>

                                            <div className="space-y-4 flex-1">
                                                <div className="bg-white/50 p-3 rounded-xl">
                                                    <p className="text-[10px] font-black text-amber-700 uppercase mb-1">Produit</p>
                                                    <p className="font-bold text-amber-950 text-sm leading-tight">{selectedProductItem.product_name}</p>
                                                    <p className="text-xs text-amber-800/70">{selectedProductItem.product_volume}</p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-white/50 p-3 rounded-xl">
                                                        <p className="text-[10px] font-black text-amber-700 uppercase mb-1">Quantité</p>
                                                        <p className="font-black text-amber-950 text-xl">{quantity}</p>
                                                    </div>
                                                    <div className="bg-white/50 p-3 rounded-xl">
                                                        <p className="text-[10px] font-black text-amber-700 uppercase mb-1">Délai</p>
                                                        <p className="font-black text-amber-950 text-xl">{expirationDays}j</p>
                                                    </div>
                                                </div>

                                                <div className="bg-amber-950 text-amber-100 p-4 rounded-xl shadow-inner text-center">
                                                    <p className="text-[10px] font-black uppercase opacity-60 mb-1">Valeur Gardée</p>
                                                    <p className="font-black text-2xl font-mono tracking-tighter">{formatPrice(selectedProductItem.unit_price * quantity)}</p>
                                                </div>

                                                <div className="px-1 text-center pt-2">
                                                    <p className="text-[10px] text-amber-800/60 font-medium">Consignation de la vente #{selectedSaleId.slice(-6).toUpperCase()}</p>
                                                </div>
                                            </div>

                                            <div className="mt-8">
                                                <EnhancedButton
                                                    onClick={handleSubmit}
                                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-2xl font-black uppercase tracking-wide shadow-lg shadow-amber-200 transition-all active:scale-95"
                                                >
                                                    Valider la consigne
                                                </EnhancedButton>
                                                <button
                                                    onClick={onCancel}
                                                    className="w-full mt-3 text-amber-800/50 font-bold text-xs uppercase hover:text-amber-800 transition-colors"
                                                >
                                                    Abandonner
                                                </button>
                                            </div>

                                            {/* Bottom Cutout */}
                                            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-50 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
