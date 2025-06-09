import React from 'react';
import { ShoppingCart, Plus, Minus, Trash2, X } from 'lucide-react';
import { CartItem } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useFeedback } from '../hooks/useFeedback';
import { FeedbackButton } from './FeedbackButton';
import { AnimatedCounter } from './AnimatedCounter';


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
  const { setLoading, isLoading, showSuccess, cartCleared } = useFeedback();
  const total = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);


  return (
    <>
      {/* Cart Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={onToggle}
          className="bg-orange-500 text-white p-4 rounded-full shadow-lg hover:bg-orange-600 transition-all duration-200 hover:transform hover:scale-110"
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
      <div className={`fixed bottom-0 right-0 w-full max-w-md bg-white border-l border-orange-200 transition-transform duration-300 z-40 ${
        isOpen ? 'transform translate-x-0' : 'transform translate-x-full'
      }`} style={{ height: 'calc(100vh - 2rem)' }}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-orange-200">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <ShoppingCart size={20} />
              Panier ({totalItems})
            </h2>
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Votre panier est vide</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.product.id} className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-800">{item.product.name}</h3>
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
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-orange-200 space-y-3">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span className="text-gray-800">Total:</span>
                <AnimatedCounter 
                  value={total} 
                  prefix="FCFA " 
                  className="text-orange-600"
                />
              </div>
              
              <div className="flex gap-2">
                <FeedbackButton
                  onClick={async () => {
                    setLoading('checkout', true);
                    await onCheckout();
                    showSuccess('🎉 Vente finalisée !');
                    setLoading('checkout', false);
                  }}
                  isLoading={isLoading('checkout')}
                  loadingText="Finalisation..."
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600"
                >
                  Valider la vente
                </FeedbackButton>
                
                
                <FeedbackButton
                  onClick={() => {
                    if (confirm('Vider le panier ?')) {
                      onClear();
                      cartCleared();
                    }
                  }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"
                >
                  Vider
                </FeedbackButton>
                

              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}