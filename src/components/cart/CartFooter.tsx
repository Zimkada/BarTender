import { Trash2, Users, Check, CreditCard } from 'lucide-react';
import { EnhancedButton } from '../EnhancedButton';
import { Select, SelectOption } from '../ui/Select';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { PaymentMethodSelector, PaymentMethod } from './PaymentMethodSelector';

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

    return (
        <div className={`space-y-3 ${isMobile ? '' : 'bg-gray-50/50'}`}>
            {/* Server Selection (Simplified Mode) */}
            {isSimplifiedMode && (
                <Select
                    label="Serveur"
                    options={serverOptions}
                    value={selectedServer}
                    onChange={(e) => onServerChange(e.target.value)}
                    size={isMobile ? 'lg' : 'default'}
                    leftIcon={<Users size={16} className="text-amber-500" />}
                />
            )}

            {/* Payment Method */}
            <PaymentMethodSelector
                value={paymentMethod}
                onChange={onPaymentMethodChange}
            />

            {/* Total Row */}
            <div className="flex justify-between items-end pt-1">
                <span className="text-gray-500 font-medium">Total à payer</span>
                <span className="text-3xl font-black text-amber-600 font-mono tracking-tight">
                    {formatPrice(total)}
                </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
                <EnhancedButton
                    onClick={onCheckout}
                    loading={isLoading}
                    success={showSuccess}
                    disabled={!hasItems}
                    size="xl"
                    variant="primary"
                    className="flex-1 shadow-lg shadow-amber-200"
                    icon={showSuccess ? <Check size={20} /> : <CreditCard size={20} />}
                >
                    {showSuccess ? 'Validé !' : 'Valider la vente'}
                </EnhancedButton>

                <button
                    onClick={() => {
                        if (confirm('Vider le panier ?')) onClear();
                    }}
                    disabled={!hasItems}
                    className="w-14 h-14 flex items-center justify-center bg-white border-2 border-gray-200 text-gray-400 rounded-2xl hover:bg-red-50 hover:border-red-100 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Vider le panier"
                >
                    <Trash2 size={24} />
                </button>
            </div>
        </div>
    );
}
