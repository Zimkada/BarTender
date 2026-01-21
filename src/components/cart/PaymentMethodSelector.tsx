import { CreditCard, Banknote, Smartphone } from 'lucide-react';

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'credit';

interface PaymentMethodSelectorProps {
    value: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    className?: string;
}

export function PaymentMethodSelector({ value, onChange, className = '' }: PaymentMethodSelectorProps) {
    const methods: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
        { id: 'cash', label: 'Espèces', icon: Banknote },
        { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
        { id: 'card', label: 'Carte', icon: CreditCard },
        // { id: 'credit', label: 'À crédit', icon: Users }, // Disabled for now as per previous logic implied
    ];

    return (
        <div className={`grid grid-cols-3 gap-2 ${className}`}>
            {methods.map((method) => {
                const Icon = method.icon;
                const isSelected = value === method.id;

                return (
                    <button
                        key={method.id}
                        onClick={() => onChange(method.id)}
                        className={`
                            flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200
                            ${isSelected
                                ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-amber-200 hover:bg-gray-50'
                            }
                        `}
                    >
                        <div className={`mb-1.5 ${isSelected ? 'text-amber-500' : 'text-gray-400'}`}>
                            <Icon size={20} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-tight leading-none text-center">
                            {method.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
