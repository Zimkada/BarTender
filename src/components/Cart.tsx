import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, X, Users } from 'lucide-react';
import { CartItem } from '../types';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';

interface CartProps {
  items: CartItem[];
  isOpen: boolean;
  onToggle: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: (assignedTo?: string) => void;
  onClear: () => void;
  hideFloatingButton?: boolean; // Masquer le bouton quand QuickSale est ouvert
}

export function Cart({
  items,
  isOpen,
  onToggle,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onClear,
  hideFloatingButton = false
}: CartProps) {
  const formatPrice = useCurrencyFormatter();
  const { setLoading, isLoading, showSuccess, cartCleared } = useFeedback();
  const { isMobile } = useViewport();
  const { currentBar } = useBarContext();
  const { currentSession } = useAuth();
  const total = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const [selectedServer, setSelectedServer] = useState<string>('');
  const isSimplifiedMode = currentBar?.settings?.operatingMode === 'simplified';

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  if (isMobile) {
    return (
      <>
        {/* Bouton panier flottant - Masqué quand QuickSale est ouvert */}
        {!hideFloatingButton && (
          <button
            onClick={onToggle}
            className="fixed bottom-20 right-4 z-50 w-16 h-16 bg-orange-500 text-white rounded-full shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
            aria-label="Panier"
          >
            <div className="relative">
              <ShoppingCart size={28} strokeWidth={2.5} />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </div>
          </button>
        )}

        {/* Modal panier FULL-SCREEN Android natif */}
        {isOpen && (
          <div className="fixed inset-0 bg-white z-50 flex flex-col">
            {/* Header fixe sticky */}
            <div className="flex-shrink-0 sticky top-0 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingCart size={24} />
                  Panier ({totalItems})
                </h2>
                <button
                  onClick={onToggle}
                  className="p-2 text-gray-600 active:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Fermer"
                >
                  <X size={28} />
                </button>
              </div>
            </div>

            {/* Liste items - scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingCart size={64} className="text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">Votre panier est vide</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.product.id}
                      className="bg-orange-50 rounded-2xl p-4 border border-orange-200"
                    >
                      {/* Nom + bouton supprimer */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-base">
                            {item.product.name}
                          </h3>
                          <p className="text-sm text-gray-600">{item.product.volume}</p>
                        </div>
                        <button
                          onClick={() => onRemoveItem(item.product.id)}
                          className="p-2 text-red-500 active:bg-red-100 rounded-lg transition-colors"
                          aria-label="Supprimer"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>

                      {/* Quantité + Prix */}
                      <div className="flex items-center justify-between">
                        {/* Contrôles quantité */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                            className="w-12 h-12 bg-orange-200 text-orange-700 rounded-xl active:bg-orange-300 transition-colors flex items-center justify-center"
                            aria-label="Diminuer quantité"
                          >
                            <Minus size={20} strokeWidth={3} />
                          </button>
                          <span className="text-gray-900 font-bold text-xl min-w-[40px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                            className="w-12 h-12 bg-orange-200 text-orange-700 rounded-xl active:bg-orange-300 transition-colors flex items-center justify-center"
                            aria-label="Augmenter quantité"
                          >
                            <Plus size={20} strokeWidth={3} />
                          </button>
                        </div>

                        {/* Prix total item */}
                        <span className="text-orange-600 font-bold text-xl font-mono">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer fixe sticky - TOUJOURS VISIBLE */}
            {items.length > 0 && (
              <div className="flex-shrink-0 sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
                {/* Sélecteur serveur (mode simplifié uniquement) */}
                {isSimplifiedMode && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Users size={16} className="text-orange-500" />
                      Serveur qui a servi
                    </label>
                    <select
                      value={selectedServer}
                      onChange={(e) => setSelectedServer(e.target.value)}
                      className="w-full px-4 py-3 border border-orange-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-base"
                    >
                      <option value="">Sélectionner un serveur...</option>
                      <option value={`Moi (${currentSession?.userName})`}>
                        Moi ({currentSession?.userName})
                      </option>
                      {currentBar?.settings?.serversList?.map((serverName) => (
                        <option key={serverName} value={serverName}>
                          {serverName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-900 text-lg font-semibold">Total:</span>
                  <span className="text-orange-600 font-bold text-2xl font-mono">
                    {formatPrice(total)}
                  </span>
                </div>

                {/* Boutons actions */}
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (isSimplifiedMode && !selectedServer) {
                        alert('Veuillez sélectionner le serveur qui a effectué la vente');
                        return;
                      }
                      setLoading('checkout', true);
                      await onCheckout(isSimplifiedMode ? selectedServer : undefined);
                      setSelectedServer(''); // Reset
                      showSuccess('🎉 Vente finalisée !');
                      setLoading('checkout', false);
                    }}
                    disabled={isLoading('checkout')}
                    className="flex-1 h-14 bg-orange-500 text-white font-bold text-lg rounded-2xl active:bg-orange-600 disabled:bg-gray-400 transition-colors flex items-center justify-center"
                  >
                    {isLoading('checkout') ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                    ) : (
                      'Valider la vente'
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('Vider le panier ?')) {
                        onClear();
                        cartCleared();
                      }
                    }}
                    className="w-14 h-14 bg-gray-200 text-gray-700 rounded-2xl active:bg-gray-300 transition-colors flex items-center justify-center"
                    aria-label="Vider le panier"
                  >
                    <Trash2 size={24} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overlay (optionnel pour mobile - on utilise déjà full-screen) */}
      </>
    );
  }

  // ==================== VERSION DESKTOP (1% promoteurs avec PC) ====================
  return (
    <>
      {/* Bouton panier desktop */}
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 w-16 h-16 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 hover:scale-110 transition-all"
        aria-label="Panier"
      >
        <div className="relative flex items-center justify-center">
          <ShoppingCart size={24} />
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
              {totalItems}
            </span>
          )}
        </div>
      </button>

      {/* Panel desktop (slide-in from right) */}
      <div
        className={`fixed bottom-0 right-0 top-0 w-full max-w-md bg-white border-l border-orange-200 shadow-2xl transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-orange-200">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <ShoppingCart size={20} />
              Panier ({totalItems})
            </h2>
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
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
                  <div
                    key={item.product.id}
                    className="bg-orange-50 rounded-xl p-3 border border-orange-100"
                  >
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
                          className="w-8 h-8 bg-orange-200 text-orange-700 rounded-lg hover:bg-orange-300 transition-colors flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-gray-800 font-medium min-w-[32px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                          className="w-8 h-8 bg-orange-200 text-orange-700 rounded-lg hover:bg-orange-300 transition-colors flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="text-orange-600 font-bold font-mono">
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
              {/* Sélecteur serveur (mode simplifié uniquement) */}
              {isSimplifiedMode && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                    <Users size={14} className="text-orange-500" />
                    Serveur
                  </label>
                  <select
                    value={selectedServer}
                    onChange={(e) => setSelectedServer(e.target.value)}
                    className="w-full px-3 py-2 border border-orange-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    <option value={`Moi (${currentSession?.userName})`}>
                      Moi ({currentSession?.userName})
                    </option>
                    {currentBar?.settings?.serversList?.map((serverName) => (
                      <option key={serverName} value={serverName}>
                        {serverName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-gray-800 text-lg font-semibold">Total:</span>
                <span className="text-orange-600 text-2xl font-bold font-mono">
                  {formatPrice(total)}
                </span>
              </div>

              <div className="flex gap-2">
                <EnhancedButton
                  onClick={async () => {
                    if (isSimplifiedMode && !selectedServer) {
                      alert('Veuillez sélectionner le serveur qui a effectué la vente');
                      return;
                    }
                    setLoading('checkout', true);
                    await onCheckout(isSimplifiedMode ? selectedServer : undefined);
                    setSelectedServer(''); // Reset
                    showSuccess('🎉 Vente finalisée !');
                    setLoading('checkout', false);
                  }}
                  loading={isLoading('checkout')}
                  size="lg"
                  variant="primary"
                  className="flex-1"
                >
                  Valider la vente
                </EnhancedButton>

                <EnhancedButton
                  onClick={() => {
                    if (confirm('Vider le panier ?')) {
                      onClear();
                      cartCleared();
                    }
                  }}
                  size="lg"
                  variant="secondary"
                  className="flex-1"
                >
                  Vider
                </EnhancedButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay desktop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}
