import { useState } from 'react';
import { ShoppingCart, Send, Tag } from 'lucide-react';
import { CartItem } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { AnimatedCounter } from './AnimatedCounter';
import { useBarContext } from '../context/BarContext';
import { PaymentMethodSelector, PaymentMethod } from './cart/PaymentMethodSelector';
import { CartShared } from './cart/CartShared';
import { useCartLogic } from '../hooks/useCartLogic';
import { useAppContext } from '../context/AppContext';

interface ServerCartProps {
  items: CartItem[];
  tableNumber: string;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClear: () => void;
}

export function ServerCart({
  items,
  tableNumber,
  onUpdateQuantity,
  onRemoveItem,
  onClear
}: ServerCartProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { setLoading, isLoading, showSuccess } = useFeedback();
  const { currentBar } = useBarContext();
  const { addSale } = useAppContext();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  
  const { total, totalDiscount, totalItems, calculatedItems } = useCartLogic({
    items,
    barId: currentBar?.id
  });

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-md bg-white border border-amber-200 rounded-2xl shadow-xl z-40">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={20} />
            Commande ({totalItems})
          </h3>
          {tableNumber && (
            <span className="text-sm text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
              {tableNumber}
            </span>
          )}
        </div>

        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          <CartShared
            items={calculatedItems}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveItem={onRemoveItem}
            variant="desktop"
          />
        </div>

        {/* Total */}
        {totalDiscount > 0 && (
          <div className="flex justify-between items-center text-green-600 text-sm mb-2">
            <span className="flex items-center gap-1">
              <Tag size={14} />
              Économie:
            </span>
            <span className="font-semibold">-{formatPrice(totalDiscount)}</span>
          </div>
        )}

        {/* Mode de paiement */}
        <PaymentMethodSelector
          value={paymentMethod}
          onChange={setPaymentMethod}
          className="mb-4"
        />

        <div className="flex justify-between items-center text-lg font-semibold mb-4 pt-3 border-t border-amber-200">
          <span className="text-gray-800">Total:</span>
          <AnimatedCounter
            value={total}
            prefix="FCFA "
            className="text-amber-600"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <EnhancedButton
            onClick={async () => {
              setLoading('launchOrder', true);
              await addSale({ items: calculatedItems, paymentMethod });
              showSuccess('🚀 Commande lancée !');
              setLoading('launchOrder', false);
            }}
            loading={isLoading('launchOrder')}
            className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 flex items-center justify-center gap-2"
          >
            <Send size={16} />
            Lancer la commande
          </EnhancedButton>

          <button
            onClick={() => {
              if (confirm('Annuler la commande ?')) {
                onClear();
              }
            }}
            className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}