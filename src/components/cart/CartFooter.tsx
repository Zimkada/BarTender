import { Trash2, Users, Check, Wallet, Receipt, Plus, ArrowRight, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { EnhancedButton } from '../EnhancedButton';
import { Select, SelectOption } from '../ui/Select';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { PaymentMethodSelector, PaymentMethod, PAYMENT_METHODS } from './PaymentMethodSelector';
import { motion, AnimatePresence } from 'framer-motion';

interface CartFooterProps {
    total: number;
    isSimplifiedMode: boolean;
    serverOptions: SelectOption[];
    selectedServer: string;
    onServerChange: (value: string) => void;
    bonOptions?: SelectOption[];
    selectedBon?: string;
    onBonChange?: (value: string) => void;
    onCreateBon?: (tableNumber?: number, customerName?: string) => void;
    paymentMethod: PaymentMethod;
    onPaymentMethodChange: (value: PaymentMethod) => void;
    onCheckout: () => void;
    onClear: () => void;
    isLoading: boolean;
    showSuccess?: boolean;
    hasItems: boolean;
    isMobile?: boolean;
}

export function CartFooter({
    total,
    isSimplifiedMode,
    serverOptions,
    selectedServer,
    onServerChange,
    bonOptions = [],
    selectedBon,
    onBonChange,
    onCreateBon,
    paymentMethod,
    onPaymentMethodChange,
    onCheckout,
    onClear,
    isLoading,
    showSuccess = false,
    hasItems,
    isMobile = false
}: CartFooterProps) {
    const { formatPrice } = useCurrencyFormatter();

    // Si un bon est sélectionné, on cache les options de paiement
    const isBonMode = !!selectedBon;
    const [isPaymentExpanded, setIsPaymentExpanded] = useState(false);

    // UX : Drawer de sélection de bon (remplace le select natif pour mobile)
    const [showBonSelection, setShowBonSelection] = useState(false);

    // Fonction pour obtenir le label du bon sélectionné
    const selectedBonLabel = bonOptions.find(o => o.value === selectedBon)?.label;

    // UI creation bon - 2 champs séparés
    const [isCreatingBon, setIsCreatingBon] = useState(false);
    const [tableNumber, setTableNumber] = useState('');
    const [customerName, setCustomerName] = useState('');

    const handleConfirmCreateBon = () => {
        onCreateBon(
            tableNumber ? parseInt(tableNumber) : undefined,
            customerName || undefined
        );
        setTableNumber('');
        setCustomerName('');
        setIsCreatingBon(false);
        setShowBonSelection(false);
    };



    return (
        <div className={`space-y-1.5 ${isMobile ? '' : 'p-1'}`}>
            {/* Server Selection - Extra Compact */}
            {isSimplifiedMode && (
                <div className="bg-gray-50/30 rounded-lg overflow-hidden border border-brand-subtle/20">
                    <Select
                        label=""
                        options={serverOptions}
                        value={selectedServer}
                        onChange={(e) => onServerChange(e.target.value)}
                        size="sm"
                        className="border-none bg-transparent shadow-none h-7 text-[9px] font-black uppercase"
                        leftIcon={<Users size={10} className="text-brand-primary" />}
                    />
                </div>
            )}

            {/* Bon Selection Mode Toggle - Enlarged for Priority */}
            <div className={`rounded-xl overflow-hidden border-2 transition-all ${selectedBon ? 'bg-brand-primary/10 border-brand-primary' : 'bg-white border-gray-200 hover:border-brand-primary/50'}`}>
                {selectedBon ? (
                    // Active Bon Display (Clear & Visible)
                    <div className="flex items-center justify-between p-2">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 bg-brand-primary text-white rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                <Receipt size={16} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-black text-brand-dark uppercase truncate leading-tight">
                                    {selectedBonLabel || 'Bon sélectionné'}
                                </span>
                                <span className="text-[9px] text-brand-primary font-bold uppercase tracking-wider">
                                    Paiement différé actif
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => onBonChange('')}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                ) : (
                    // "Mettre sur un bon" Button (Trigger) - Bigger Call to Action
                    <button
                        onClick={() => setShowBonSelection(true)}
                        className="w-full flex items-center justify-between p-3 group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 group-hover:bg-brand-primary/10 group-hover:text-brand-primary flex items-center justify-center transition-colors">
                                <Receipt size={16} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="text-[11px] font-black uppercase text-gray-700 group-hover:text-brand-primary transition-colors">
                                    Mettre sur un bon
                                </span>
                                <span className="text-[9px] text-gray-400 font-medium">
                                    Différer le paiement
                                </span>
                            </div>
                        </div>
                        <div className="bg-gray-100 text-gray-600 group-hover:bg-brand-primary/10 group-hover:text-brand-primary rounded-lg px-2 py-1 text-[9px] font-bold transition-colors">
                            {bonOptions.length - 1} en cours
                        </div>
                    </button>
                )}
            </div>

            {/* Bon Selection Overlay (Custom Drawer) */}
            <AnimatePresence>
                {showBonSelection && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowBonSelection(false)}
                            className="fixed inset-0 bg-black/50 z-40"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="fixed inset-x-0 bottom-0 bg-white shadow-2xl z-50 rounded-t-2xl border-t border-gray-100 p-4 max-h-[70vh] flex flex-col"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-gray-900 uppercase">Choisir un bon</h3>
                                <button onClick={() => setShowBonSelection(false)} className="p-2 bg-gray-100 rounded-full">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                                {isCreatingBon ? (
                                    <div className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/20 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-black text-xs text-brand-primary uppercase">Nouveau Bon</span>
                                            <button
                                                onClick={() => setIsCreatingBon(false)}
                                                className="text-[10px] font-bold text-gray-400 uppercase hover:text-gray-600"
                                            >
                                                Annuler
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <div>
                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                                    N° Table (Optionnel)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={tableNumber}
                                                    onChange={(e) => setTableNumber(e.target.value)}
                                                    placeholder="Ex: 5"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateBon()}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                                    Client (Optionnel)
                                                </label>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                    placeholder="Ex: Amina"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateBon()}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary uppercase placeholder:normal-case"
                                                />
                                            </div>
                                        </div>

                                        <EnhancedButton
                                            onClick={handleConfirmCreateBon}
                                            variant="primary"
                                            className="w-full rounded-lg h-9 text-[10px] font-black uppercase tracking-widest"
                                        >
                                            Créer le bon
                                        </EnhancedButton>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setIsCreatingBon(true)}
                                        className="w-full text-left p-3 rounded-xl border border-dashed border-brand-primary/50 bg-brand-primary/5 flex items-center gap-3 text-brand-primary hover:bg-brand-primary/10"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center">
                                            <Plus size={16} />
                                        </div>
                                        <span className="font-black text-xs uppercase">Créer un nouveau bon</span>
                                    </button>
                                )}

                                {!isCreatingBon && bonOptions.filter(o => o.value).map((opt, index) => {
                                    // Luminosité dynamique basée sur l'index : 40%, 50%, 60%, 70%, puis cycle
                                    const lightness = 40 + ((index % 4) * 10);

                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                onBonChange(opt.value);
                                                setShowBonSelection(false);
                                            }}
                                            className="w-full text-left p-3 rounded-xl border-l-4 border-t border-r border-b border-gray-100 bg-white shadow-sm flex items-center justify-between active:scale-95 transition-all"
                                            style={{
                                                borderLeftColor: `hsl(var(--brand-hue), var(--brand-saturation), ${lightness}%)`
                                            }}
                                        >
                                            <span className="font-black text-gray-800 text-xs">{opt.label}</span>
                                            <ArrowRight size={14} className="text-gray-300" />
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Payment Method & Total Row */}
            <div className="flex items-start justify-between gap-3 mb-3">
                {/* Payment Method Selector (Left) */}
                <div className="flex-1 min-w-0">
                    {!isBonMode && (
                        <AnimatePresence mode="wait">
                            {isPaymentExpanded ? (
                                <motion.div
                                    key="expanded"
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="border border-gray-200 rounded-xl p-2 bg-white shadow-sm"
                                >
                                    <button
                                        onClick={() => setIsPaymentExpanded(false)}
                                        className="flex items-center justify-between w-full mb-2 px-1 text-brand-primary"
                                    >
                                        <div className="flex items-center gap-2 text-xs font-black uppercase">
                                            <Wallet size={14} />
                                            <span>{PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label}</span>
                                        </div>
                                        <ChevronUp size={14} />
                                    </button>
                                    <PaymentMethodSelector
                                        value={paymentMethod}
                                        onChange={(method) => {
                                            onPaymentMethodChange(method);
                                            setIsPaymentExpanded(false);
                                        }}
                                    />
                                </motion.div>
                            ) : (
                                <motion.button
                                    key="collapsed"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    onClick={() => setIsPaymentExpanded(true)}
                                    className="w-full flex items-center justify-between p-2.5 border border-gray-200 rounded-xl bg-white text-gray-700 hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all"
                                >
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const method = PAYMENT_METHODS.find(m => m.id === paymentMethod);
                                            const Icon = method?.icon || Wallet;
                                            return (
                                                <>
                                                    <div className="text-brand-primary">
                                                        <Icon size={16} strokeWidth={2.5} />
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase text-brand-primary">
                                                        {method?.label || 'Paiement'}
                                                    </span>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <ChevronDown size={14} className="text-gray-400" />
                                </motion.button>
                            )}
                        </AnimatePresence>
                    )}
                </div>

                {/* Total Display (Right) */}
                <div className="text-right leading-none flex-shrink-0 pt-1">
                    <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">
                        {isBonMode ? 'Montant à ajouter' : 'NET À PAYER'}
                    </span>
                    <span className="text-2xl font-black text-brand-primary font-mono">
                        {formatPrice(total)}
                    </span>
                </div>
            </div>

            {/* Main Actions */}
            <div className="flex gap-1.5">
                <EnhancedButton
                    onClick={onCheckout}
                    loading={isLoading}
                    success={showSuccess}
                    disabled={!hasItems}
                    size="lg"
                    variant="primary"
                    className={`flex-1 rounded-xl shadow-md border-none h-12 ${isBonMode ? 'bg-brand-dark text-white' : 'bg-gradient-brand'} shadow-brand-shadow-light`}
                    icon={showSuccess ? <Check size={16} /> : (isBonMode ? <Plus size={16} /> : <Wallet size={16} />)}
                >
                    <span className="font-black uppercase tracking-widest text-[11px]">
                        {showSuccess ? 'OK' : (isBonMode ? 'Ajouter au bon' : 'Lancer la vente')}
                    </span>
                </EnhancedButton>

                <button
                    onClick={() => {
                        if (confirm('Vider le panier ?')) onClear();
                    }}
                    disabled={!hasItems}
                    className="w-12 h-12 flex items-center justify-center bg-white border border-red-50 text-red-300 hover:text-red-500 rounded-xl hover:bg-red-50 active:scale-95 disabled:opacity-20 transition-all"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}
