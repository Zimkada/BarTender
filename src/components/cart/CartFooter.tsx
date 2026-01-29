import { Trash2, Users, Check, CreditCard, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { EnhancedButton } from '../EnhancedButton';
import { Select, SelectOption } from '../ui/Select';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';
import { motion, AnimatePresence } from 'framer-motion';

interface CartFooterProps {
    total: number;
    isSimplifiedMode: boolean;
    serverOptions: SelectOption[];
    selectedServer: string;
    onServerChange: (value: string) => void;
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
    const [showPaymentOptions, setShowPaymentOptions] = useState(false);

    const paymentLabels: Record<PaymentMethod, string> = {
        cash: 'Espèces',
        mobile_money: 'MoMo',
        card: 'Carte',
        credit: 'Crédit'
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

            <div className="flex gap-2 items-center">
                {/* Payment Method - Compact Toggle */}
                <div className="flex-1 bg-white rounded-lg border border-brand-primary/20 overflow-hidden">
                    <button
                        onClick={() => setShowPaymentOptions(!showPaymentOptions)}
                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-center gap-1.5">
                            <Wallet size={12} className="text-brand-primary" />
                            <span className="text-[9px] font-black text-brand-dark uppercase tracking-tighter">{paymentLabels[paymentMethod]}</span>
                        </div>
                        {showPaymentOptions ? <ChevronUp size={12} className="text-brand-primary" /> : <ChevronDown size={12} className="text-brand-primary" />}
                    </button>

                    <AnimatePresence>
                        {showPaymentOptions && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="bg-white border-t border-brand-subtle/20 p-2"
                            >
                                <PaymentMethodSelector
                                    value={paymentMethod}
                                    onChange={(val) => {
                                        onPaymentMethodChange(val);
                                        setShowPaymentOptions(false);
                                    }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Total Column - Minimalist */}
                <div className="text-right leading-none">
                    <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block mb-1">NET À PAYER</span>
                    <span className="text-xl font-black text-brand-dark font-mono">
                        {formatPrice(total)}
                    </span>
                </div>
            </div>

            {/* Buttons Row - Final Compactness */}
            <div className="flex gap-1.5">
                <EnhancedButton
                    onClick={onCheckout}
                    loading={isLoading}
                    success={showSuccess}
                    disabled={!hasItems}
                    size="lg"
                    variant="primary"
                    className="flex-1 rounded-xl shadow-md border-none h-11 bg-gradient-brand shadow-brand-shadow-light"
                    icon={showSuccess ? <Check size={16} /> : <CreditCard size={16} />}
                >
                    <span className="font-black uppercase tracking-widest text-[10px]">
                        {showSuccess ? 'OK' : 'Lancer la vente'}
                    </span>
                </EnhancedButton>

                <button
                    onClick={() => {
                        if (confirm('Vider le panier ?')) onClear();
                    }}
                    disabled={!hasItems}
                    className="w-11 h-11 flex items-center justify-center bg-white border border-red-50 text-red-300 hover:text-red-500 rounded-xl hover:bg-red-50 active:scale-95 disabled:opacity-20 transition-all"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}
