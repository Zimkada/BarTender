import { useState, useMemo, useEffect } from 'react';
import {
    Search,
    User,
    ShoppingCart,
    Package,
    Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUnifiedSales } from '../../hooks/pivots/useUnifiedSales';
import { useBarContext } from '../../context/BarContext';
import { useUnifiedReturns } from '../../hooks/pivots/useUnifiedReturns';
import { useAuth } from '../../context/AuthContext';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { useFeedback } from '../../hooks/useFeedback';
import { useViewport } from '../../hooks/useViewport';
import { EnhancedButton } from '../EnhancedButton';
import { SaleItem, Consignment, User as UserType } from '../../types';
import { BackButton } from '../ui/BackButton';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { SelectionCard } from '../ui/SelectionCard';
import { FormStepper } from '../ui/FormStepper';
import {
    getBusinessDate,
    getCurrentBusinessDateString
} from '../../utils/businessDateHelpers';

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
    const { isMobile } = useViewport();
    const { currentBar, barMembers } = useBarContext();
    const { sales: allSales } = useUnifiedSales(currentBar?.id);
    const { formatPrice } = useCurrencyFormatter();
    const { currentSession: session } = useAuth();
    const { getReturnsBySale } = useUnifiedReturns(currentBar?.id);
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
    const [expirationDays, setExpirationDays] = useState(currentBar?.settings?.consignmentExpirationDays ?? 7);

    // 🛡️ Extract nested dependency to prevent unnecessary re-renders
    // when currentBar.settings object reference changes but value stays same
    const barExpirationDays = currentBar?.settings?.consignmentExpirationDays ?? 7;

    // Update expiration days when bar's expiration setting actually changes
    useEffect(() => {
        setExpirationDays(barExpirationDays);
    }, [barExpirationDays]);

    // --- DATA DERIVATION ---
    const availableSales = useMemo(() => {
        // 🔒 STRICT: Correspondance exacte avec la Journée Commerciale actuelle
        // Corrige les problèmes de décalage horaire (UTC vs Local) et assure que seuls
        // les tickets de la journée active sont consignables.
        const currentBusinessDate = getCurrentBusinessDateString(currentBar?.closingHour);

        return allSales
            .filter(s => {
                if (s.status !== 'validated') return false;

                // Le helper gère correctement le dual-casing (businessDate vs business_date)
                // et la conversion Date/String pour une comparaison fiable "YYYY-MM-DD"
                const sDate = getBusinessDate(s, currentBar?.closingHour);
                return sDate === currentBusinessDate;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [allSales, currentBar?.closingHour]);

    const filteredSales = useMemo(() => {
        if (!currentBar || !session) return [];
        let filtered = availableSales;

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

        return [...filtered];
    }, [availableSales, filterSeller, searchTerm, currentBar, session]);

    const sellersWithSales = useMemo(() => {
        if (!currentBar || !session || !Array.isArray(availableSales) || !Array.isArray(users)) return [];
        const sellerIds = new Set(availableSales.map(sale => sale.soldBy).filter(Boolean));
        return users.filter(user => sellerIds.has(user.id));
    }, [availableSales, users, currentBar, session]);

    const selectedSale = useMemo(() =>
        availableSales.find(s => s.id === selectedSaleId),
        [availableSales, selectedSaleId]
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
            x: direction > 0 ? 30 : -30,
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 30 : -30,
            opacity: 0,
        }),
    };

    return (
        <div className="flex flex-col h-full">
            <FormStepper
                steps={[
                    { label: "Sélection Vente" },
                    { label: "Choix Produit" },
                    { label: "Validation" }
                ]}
                currentStep={step}
            />

            <div className="relative flex-1">
                <AnimatePresence mode="wait" custom={step}>
                    {/* STEP 1: SELECT SALE */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            custom={step}
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-h3 text-foreground whitespace-nowrap">1. Sélectionner une vente</h3>
                            </div>




                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={16} strokeWidth={2.5} />
                                    <Input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder={isMobile ? "Rechercher vente ou produit" : "Rechercher une vente ou un produit..."}
                                        className="pl-9 bg-card border-border h-11 rounded-xl focus:border-brand-primary/50"
                                    />
                                </div>
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
                                            className="bg-card border-border h-11 rounded-xl"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 pb-4 scrollbar-hide">
                                {filteredSales.length === 0 ? (
                                    <div className="col-span-full py-20 text-center text-muted-foreground">
                                        <ShoppingCart size={48} strokeWidth={1} className="mx-auto mb-4 opacity-20" />
                                        <p className="text-body-sm font-medium">Aucune vente correspondante</p>
                                    </div>
                                ) : (
                                    filteredSales.map(sale => {
                                        const seller = users.find(u => u.id === sale.soldBy);
                                        const productPreview = sale.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ');

                                        return (
                                            <SelectionCard
                                                key={sale.id}
                                                onClick={() => handleSaleSelect(sale.id)}
                                                status="default"

                                                className="group"
                                            >
                                                <div className="space-y-3">
                                                    {/* Top Row: Server & Time */}
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {seller ? (
                                                                <>
                                                                    <div className="w-6 h-6 rounded-full bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20 flex-shrink-0">
                                                                        <User size={12} className="text-brand-primary" />
                                                                    </div>
                                                                    <span className="text-caption font-semibold text-brand-primary truncate">
                                                                        {seller.name}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <div className="text-caption font-medium text-muted-foreground">Vendeur inconnu</div>
                                                            )}
                                                        </div>
                                                        <span className="text-micro text-muted-foreground tabular-nums flex-shrink-0">
                                                            {new Date(sale.validatedAt || sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    {/* Middle: Product List */}
                                                    <div className="text-caption text-foreground font-medium line-clamp-2 leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-border">
                                                        {productPreview}
                                                    </div>

                                                    {/* Bottom: ID & Price */}
                                                    <div className="flex items-center justify-between pt-1">
                                                        <span className="text-micro text-muted-foreground tabular-nums">
                                                            #{sale.id.slice(-4).toUpperCase()}
                                                        </span>
                                                        <span className="text-caption font-semibold text-foreground tabular-nums">
                                                            {formatPrice(sale.total)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </SelectionCard>
                                        );
                                    })
                                )}
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
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <BackButton
                                    onClick={() => setStep(1)}
                                />
                                <h3 className="text-h3 text-foreground whitespace-nowrap">2. Choisir le produit</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {selectedSale.items.map((item: SaleItem) => {
                                    const consignedCount = getAlreadyConsignedCount(selectedSale.id, item.product_id);
                                    const returnedCount = getAlreadyReturned(selectedSale.id, item.product_id);
                                    const available = item.quantity - consignedCount - returnedCount;
                                    const isUnavailable = available <= 0;

                                    return (
                                        <SelectionCard
                                            key={item.product_id}
                                            onClick={() => handleProductSelect(item.product_id)}
                                            status={isUnavailable ? 'disabled' : 'default'}
                                            statusText={isUnavailable ? 'Indisponible' : undefined}
                                            priceDisplay={
                                                <span className="text-body-sm font-semibold text-foreground tabular-nums">
                                                    {formatPrice(item.unit_price)}
                                                </span>
                                            }
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="text-body-sm font-semibold text-foreground">
                                                        {item.product_name}
                                                    </span>
                                                    {item.product_volume && (
                                                        <span className="text-micro text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {item.product_volume}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-micro text-muted-foreground">Dispo :</span>
                                                        <span className="text-caption font-semibold text-brand-primary tabular-nums">
                                                            {available}
                                                        </span>
                                                    </div>

                                                    {(consignedCount > 0 || returnedCount > 0) && (
                                                        <>
                                                            <span className="text-micro text-muted-foreground/40">|</span>
                                                            <div className="flex items-center gap-2">
                                                                {consignedCount > 0 && (
                                                                    <span className="text-micro text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums">
                                                                        <Archive size={8} /> {consignedCount}
                                                                    </span>
                                                                )}
                                                                {returnedCount > 0 && (
                                                                    <span className="text-micro text-red-500 dark:text-red-400 flex items-center gap-1 tabular-nums">
                                                                        <Package size={8} /> {returnedCount}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </SelectionCard>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3: DETAILS & VALIDATION */}
                    {step === 3 && selectedProductItem && (
                        <motion.div
                            key="step3"
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <BackButton
                                    onClick={() => setStep(2)}
                                />
                                <h3 className="text-h3 text-foreground whitespace-nowrap">3. Finalisation</h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* FORM */}
                                <div className="lg:col-span-2 space-y-6">
                                    <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-micro text-muted-foreground">Quantité</Label>
                                                <Input
                                                    type="number"
                                                    value={quantity}
                                                    onChange={e => setQuantity(Number(e.target.value))}
                                                    max={maxQuantity}
                                                    min={1}
                                                    className="bg-muted border border-border focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 h-12 text-body text-foreground font-semibold tabular-nums shadow-sm rounded-xl transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-micro text-muted-foreground">Délai (jours)</Label>
                                                <Input
                                                    type="number"
                                                    value={expirationDays}
                                                    onChange={e => setExpirationDays(Number(e.target.value))}
                                                    min={1}
                                                    className="bg-muted border border-border focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 h-12 text-body text-foreground font-semibold tabular-nums shadow-sm rounded-xl transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-micro text-muted-foreground">Client</Label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <Input
                                                    placeholder="Nom complet"
                                                    value={customerName}
                                                    onChange={e => setCustomerName(e.target.value)}
                                                    className="bg-muted border border-border focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 h-11 font-medium shadow-sm rounded-xl transition-all placeholder:text-muted-foreground"
                                                />
                                                <Input
                                                    placeholder="Téléphone (Optionnel)"
                                                    value={customerPhone}
                                                    onChange={e => setCustomerPhone(e.target.value)}
                                                    className="bg-muted border border-border focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 h-11 font-medium shadow-sm rounded-xl transition-all placeholder:text-muted-foreground"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-micro text-muted-foreground">Note (optionnelle)</Label>
                                            <Textarea
                                                value={notes}
                                                onChange={e => setNotes(e.target.value)}
                                                className="bg-muted border border-border focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 shadow-sm rounded-xl transition-all resize-none placeholder:text-muted-foreground"
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* PREMIUM REALISTIC TICKET */}
                                <div className="lg:col-span-1">
                                    <div className="relative bg-card shadow-xl shadow-black/10 dark:shadow-black/40 flex flex-col overflow-hidden">
                                        {/* Serrated Top — couleur du fond pour découpe naturelle en clair et sombre */}
                                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[linear-gradient(45deg,transparent_33.333%,hsl(var(--background))_33.333%,hsl(var(--background))_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,hsl(var(--background))_33.333%,hsl(var(--background))_66.667%,transparent_66.667%)] bg-[length:12px_24px] bg-[position:0_-12px] rotate-180 transform translate-y-[-50%]" />

                                        <div className="p-6 pt-8 text-center border-b border-dashed border-border">
                                            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-100 dark:border-amber-900/40">
                                                <Archive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                            </div>
                                            <h4 className="text-micro text-muted-foreground mb-1">Billet de</h4>
                                            <h3 className="text-h3 text-foreground">Consignation</h3>
                                        </div>

                                        <div className="p-6 space-y-4 flex-1 bg-card">
                                            <div className="flex justify-between items-center gap-3 border-b border-dashed border-border pb-3">
                                                <span className="text-micro text-muted-foreground">Produit</span>
                                                <span className="text-body-sm font-semibold text-foreground truncate">{selectedProductItem.product_name}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-dashed border-border pb-3">
                                                <span className="text-micro text-muted-foreground">Quantité</span>
                                                <span className="text-body-sm font-semibold text-foreground tabular-nums">x{quantity}</span>
                                            </div>
                                            <div className="flex justify-between items-center pb-2">
                                                <span className="text-micro text-muted-foreground">Valeur totale</span>
                                                <span className="text-body-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{formatPrice(selectedProductItem.unit_price * quantity)}</span>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-muted border-t border-border">
                                            <EnhancedButton
                                                onClick={handleSubmit}
                                                className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl text-body-sm font-semibold shadow-lg shadow-brand-primary/20 mb-2"
                                            >
                                                Confirmer
                                            </EnhancedButton>
                                            <button
                                                onClick={onCancel}
                                                className="w-full text-center py-2 text-caption font-medium text-muted-foreground hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                            >
                                                Annuler
                                            </button>
                                        </div>

                                        {/* Serrated Bottom — couleur du fond pour découpe naturelle en clair et sombre */}
                                        <div className="h-4 w-full bg-[linear-gradient(45deg,transparent_33.333%,hsl(var(--background))_33.333%,hsl(var(--background))_66.667%,transparent_66.667%),linear-gradient(-45deg,transparent_33.333%,hsl(var(--background))_33.333%,hsl(var(--background))_66.667%,transparent_66.667%)] bg-[length:12px_24px] bg-[position:0_12px]" />
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
