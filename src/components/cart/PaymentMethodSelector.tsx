import { CreditCard, Banknote, Smartphone } from 'lucide-react';

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'credit';

interface PaymentMethodSelectorProps {
    value: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    className?: string;
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
    { id: 'cash', label: 'Espèces', icon: Banknote },
    { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
    { id: 'card', label: 'Carte', icon: CreditCard },
];

export function PaymentMethodSelector({ value, onChange, className = '' }: PaymentMethodSelectorProps) {

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const isSelected = value === method.id;

                return (
                    <button
                        key={method.id}
                        onClick={() => onChange(method.id)}
                        className={`
                            flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border transition-all duration-200
                            ${isSelected
                                ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-brand-primary/30 hover:bg-gray-50'
                            }
                        `}
                    >
                        <div className={`${isSelected ? 'text-white' : 'text-gray-400'}`}>
                            <Icon size={16} strokeWidth={2.5} />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-tight leading-none text-center">
                            {method.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
