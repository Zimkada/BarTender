import React from 'react';
import { ShoppingCart, Plus, Minus, Trash2, X } from 'lucide-react';
import { CartItem } from '../types';
import { useSettings } from '../hooks/useSettings';

interface CartProps {
  items: CartItem[];
  isOpen: boolean;
  onToggle: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
  onClear: () => void;
}

export function Cart({ 
  items, 
  isOpen, 
  onToggle, 
  onUpdateQuantity, 
  onRemoveItem, 
  onCheckout,
  onClear 
}: CartProps) {
  const { formatPrice } = useSettings();
  const total = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Cart Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={onToggle}
          className="bg-teal-600 text-white p-4 rounded-full shadow-lg hover:bg-teal-500 transition-all duration-200 hover:transform hover:scale-110"
        >
          <div className="relative">
            <ShoppingCart size={24} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Cart Panel */}
      <div className={`fixed bottom-0 right-0 w-full max-w-md bg-gray-900 border-l border-gray-700 transition-transform duration-300 z-40 ${
        isOpen ? 'transform translate-x-0' : 'transform translate-x-full'
      }`} style={{ height: 'calc(100vh - 2rem)' }}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <ShoppingCart size={20} />
              Panier ({totalItems})
            </h2>
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Votre panier est vide</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.product.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-white">{item.product.name}</h3>
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
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-gray-700 space-y-3">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span className="text-white">Total:</span>
                <span className="text-teal-400">{formatPrice(total)}</span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={onClear}
                  className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  Vider
                </button>
                <button
                  onClick={onCheckout}
                  className="flex-2 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition-colors"
                >
                  Valider la vente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}