import React from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Send } from 'lucide-react';
import { CartItem } from '../types';
import { useSettings } from '../hooks/useSettings';

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
  const total = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-40">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShoppingCart size={20} />
            Commande ({totalItems})
          </h3>
          {tableNumber && (
            <span className="text-sm text-teal-400 bg-teal-600/20 px-2 py-1 rounded">
              {tableNumber}
            </span>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {items.map((item) => (
            <div key={item.product.id} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-white">{item.product.name}</h4>
                  <p className="text-sm text-gray-400">{item.product.volume}</p>
                </div>
                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                    className="w-8 h-8 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-white font-medium w-8 text-center">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    className="w-8 h-8 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <span className="text-teal-400 font-semibold">
                  {formatPrice(item.product.price * item.quantity)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center text-lg font-semibold mb-4 pt-3 border-t border-gray-700">
          <span className="text-white">Total:</span>
          <span className="text-teal-400">{formatPrice(total)}</span>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClear}
            className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
          >
            Vider
          </button>
          <button
            onClick={onLaunchOrder}
            className="flex-2 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors flex items-center justify-center gap-2"
          >
            <Send size={16} />
            Lancer la commande
          </button>
        </div>
      </div>
    </div>
  );
}