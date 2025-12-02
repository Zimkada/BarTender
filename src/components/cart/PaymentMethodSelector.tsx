import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type PaymentMethod = 'cash' | 'card' | 'mobile_money';

interface PaymentMethodSelectorProps {
    value: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    className?: string;
}

const PAYMENT_METHODS = [
    { value: 'cash' as const, label: 'Espèces', icon: '💵' },
    { value: 'card' as const, label: 'Carte', icon: '💳' },
    { value: 'mobile_money' as const, label: 'Mobile Money', icon: '📱' }
];

export function PaymentMethodSelector({ value, onChange, className = '' }: PaymentMethodSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);

    const selectedMethod = PAYMENT_METHODS.find(m => m.value === value) || PAYMENT_METHODS[0];

    return (
        <div className={className}>
            {/* Bouton collapse */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-left transition-colors hover:bg-amber-100"
                type="button"
            >
                <div className="flex items-center gap-2">
                    <span className="text-base">{selectedMethod.icon}</span>
                    <div>
                        <div className="text-xs text-gray-600">Mode de paiement</div>
                        <div className="text-sm font-medium text-gray-800">{selectedMethod.label}</div>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-amber-500 text-xs"
                >
                    ▼
                </motion.div>
            </button>

            {/* Options (collapse) */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {PAYMENT_METHODS.map(method => (
                                <button
                                    key={method.value}
                                    onClick={() => {
                                        onChange(method.value);
                                        setIsOpen(false);
                                    }}
                                    className={`p-2 text-sm rounded-lg border-2 transition-colors ${value === method.value
                                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                    type="button"
                                >
                                    <div className="text-center">
                                        <div className="text-xl mb-1">{method.icon}</div>
                                        <div className="text-xs font-medium">{method.label}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
