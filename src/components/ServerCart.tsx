import React from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Send } from 'lucide-react';
import { CartItem } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useFeedback } from '../hooks/useFeedback';
import { FeedbackButton } from './FeedbackButton';
import { AnimatedCounter } from './AnimatedCounter';

interface ServerCartProps {
  items: CartItem[];
  tableNumber: string;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onLaunchOrder: () => void;
  onClear: () => void;
}

export function ServerCart({ 
  items, 
  tableNumber,
  onUpdateQuantity, 
  onRemoveItem, 
  onLaunchOrder,
  onClear 
}: ServerCartProps) {
  const { formatPrice } = useSettings();
  const { setLoading, isLoading, showSuccess } = useFeedback();
  const total = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-md bg-white border border-orange-200 rounded-2xl shadow-xl z-40">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={20} />
            Commande ({totalItems})
          </h3>
          {tableNumber && (
            <span className="text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
              {tableNumber}
            </span>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {items.map((item) => (
            <div key={item.product.id} className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-gray-800">{item.product.name}</h4>
                  <p className="text-sm text-gray-600">{item.product.volume}</p>
                </div>
                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  className="text-red-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                    className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center hover:bg-orange-300 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-gray-800 font-medium w-8 text-center">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    className="w-8 h-8 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center hover:bg-orange-300 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <span className="text-orange-600 font-semibold">
                  {formatPrice(item.product.price * item.quantity)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center text-lg font-semibold mb-4 pt-3 border-t border-orange-200">
          <span className="text-gray-800">Total:</span>
          <AnimatedCounter 
            value={total} 
            prefix="FCFA " 
            className="text-orange-600"
          />
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <FeedbackButton
            onClick={async () => {
              setLoading('launchOrder', true);
              await onLaunchOrder();
              showSuccess('🚀 Commande lancée !');
              setLoading('launchOrder', false);
            }}
            isLoading={isLoading('launchOrder')}
            loadingText="Envoi..."
            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 flex items-center justify-center gap-2"
          >
            <Send size={16} />
            Lancer la commande
          </FeedbackButton>

          <FeedbackButton
            onClick={() => {
              if (confirm('Annuler la commande ?')) {
                onClear();
              }
            }}
            className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"
          >
            Annuler
          </FeedbackButton>
        </div>
      </div>
    </div>
  );
}