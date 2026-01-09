import { useState } from 'react';
import { ShoppingCart, X, Users, Trash2 } from 'lucide-react';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { EnhancedButton } from './EnhancedButton';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { useServerMappings } from '../hooks/useServerMappings';
import { PaymentMethodSelector, PaymentMethod } from './cart/PaymentMethodSelector';
import { CartShared } from './cart/CartShared';
import { useCartLogic } from '../hooks/useCartLogic';
import { Select, SelectOption } from './ui/Select';

interface CartProps {
  isOpen: boolean;
  onToggle: () => void;
  hideFloatingButton?: boolean; // Masquer le bouton quand QuickSale est ouvert
}

export function Cart({
  isOpen,
  onToggle,
  hideFloatingButton = false
}: CartProps) {
  const { formatPrice } = useCurrencyFormatter();
  const { setLoading, isLoading, showSuccess, cartCleared } = useFeedback();
  const { isMobile } = useViewport();
  const { currentBar, isSimplifiedMode } = useBarContext();
  const { currentSession } = useAuth();

  // NEW: Get cart data and functions from AppContext
  const {
    cart: items,
    updateCartQuantity: onUpdateQuantity, // aliasing to match existing code
    removeFromCart: onRemoveItem,        // aliasing to match existing code
    addSale,
    clearCart: onClear                       // aliasing to match existing code
  } = useAppContext();

  // NEW: Wrapper for onCheckout
  const onCheckout = async (assignedTo?: string, paymentMethod?: PaymentMethod) => {
    if (items.length === 0) return;

    // ✨ NOUVEAU: Résoudre le nom du serveur vers UUID en mode simplifié
    let serverId: string | undefined;
    if (isSimplifiedMode && assignedTo && currentBar?.id) {
      // Extraire le nom du serveur (format: "Serveur Name" ou "Moi (UserName)")
      const serverName = assignedTo.startsWith('Moi (')
        ? (currentSession?.userName || assignedTo)
        : assignedTo;

      try {
        const resolvedId = await ServerMappingsService.getUserIdForServerName(
          currentBar.id,
          serverName
        );
        serverId = resolvedId || undefined;

        // 🔴 BUG #1-2 FIX: BLOQUER la création si mapping échoue
        if (!serverId) {
          const errorMessage =
            `⚠️ Erreur Critique:\n\n` +
            `Le serveur "${serverName}" n'existe pas ou n'est pas mappé.\n\n` +
            `Actions:\n` +
            `1. Créer un compte pour ce serveur en Gestion Équipe\n` +
            `2. Mapper le compte dans Paramètres > Opérationnel > Correspondance Serveurs\n` +
            `3. Réessayer la vente`;

          alert(errorMessage);
          console.error(`[Cart] Blocking sale creation: No mapping for "${serverName}"`);
          return; // ← BLOQUER LA CRÉATION
        }
      } catch (error: unknown) {
          const errorMessage =
            `❌ Impossible d'attribuer la vente:\n\n` +
            `${error instanceof Error ? error.message : 'Erreur réseau lors de la résolution du serveur'}\n\n` +
            `Réessayez ou contactez l'administrateur.`;

        alert(errorMessage);
        console.error('[Cart] Error resolving server ID:', error);
        return; // ← BLOQUER LA CRÉATION
      }
    }

    await addSale({
      items: calculatedItems,
      paymentMethod,
      assignedTo: assignedTo, // Pass assignedTo, which might be used by addSale logic
      serverId // ✨ NOUVEAU: Passer le server_id résolu
    });
  };

  // ✨ Utiliser la logique partagée pour les calculs de prix et promotions
  const { total, totalItems, calculatedItems } = useCartLogic({
    items,
    barId: currentBar?.id
  });

  const [selectedServer, setSelectedServer] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const isServerRole = currentSession?.role === 'serveur';

  // Fetch server mappings from database instead of settings
  const { serverNames } = useServerMappings(isSimplifiedMode ? currentBar?.id : undefined);

  // Préparer les options pour le select serveur
  const serverOptions: SelectOption[] = [
    { value: '', label: 'Sélectionner un serveur...' },
    { value: `Moi (${currentSession?.userName})`, label: `Moi (${currentSession?.userName})` },
    ...serverNames.map(serverName => ({
      value: serverName,
      label: serverName
    }))
  ];

  // ==================== VERSION MOBILE (99% utilisateurs Bénin) ====================
  if (isMobile) {
    return (
      <>
        {/* Bouton panier flottant - Masqué quand QuickSale est ouvert ou en mode simplifié (serveurs) */}
        {!hideFloatingButton && !(isSimplifiedMode && isServerRole) && (
          <button
            onClick={onToggle}
            className="fixed bottom-20 right-4 z-50 w-16 h-16 bg-amber-500 text-white rounded-full shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
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

        {/* Modal panier FULL-SCREEN Android natif - Masqué pour serveurs en mode simplifié */}
        {isOpen && !(isSimplifiedMode && isServerRole) && (
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

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <CartShared
                items={calculatedItems}
                onUpdateQuantity={onUpdateQuantity}
                onRemoveItem={onRemoveItem}
                variant="mobile"
                showTotalReductions={true}
              />
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingCart size={64} className="text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">Votre panier est vide</p>
                </div>
              )}
            </div>

            {/* Footer fixe sticky - TOUJOURS VISIBLE */}
            {items.length > 0 && (
              <div className="flex-shrink-0 sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
                {/* Sélecteur serveur (mode simplifié uniquement) */}
                {isSimplifiedMode && (
                  <div className="mb-4">
                    <Select
                      label="Serveur qui a servi"
                      options={serverOptions}
                      value={selectedServer}
                      onChange={(e) => setSelectedServer(e.target.value)}
                      size="lg"
                      leftIcon={<Users size={16} className="text-amber-500" />}
                    />
                  </div>
                )}

                {/* Mode de paiement */}
                <PaymentMethodSelector
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  className="mb-4"
                />

                {/* Total */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-900 text-lg font-semibold">Total:</span>
                  <span className="text-amber-600 font-bold text-2xl font-mono">
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
                      try {
                        await onCheckout(isSimplifiedMode ? selectedServer : undefined);
                        setSelectedServer(''); // Reset
                        showSuccess('🎉 Vente finalisée !', 1000);
                        onToggle(); // ✨ Fermer le panier après succès
                      } catch (error) {
                        // Error handled by mutation onError
                      } finally {
                        setLoading('checkout', false);
                      }
                    }}
                    disabled={isLoading('checkout')}
                    className="flex-1 h-14 bg-amber-500 text-white font-bold text-lg rounded-2xl active:bg-amber-600 disabled:bg-gray-400 transition-colors flex items-center justify-center"
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
        className="fixed bottom-4 right-4 z-50 w-16 h-16 bg-amber-500 text-white rounded-full shadow-lg hover:bg-amber-600 hover:scale-110 transition-all"
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
        className={`fixed bottom-0 right-0 top-0 w-full max-w-md bg-white border-l border-amber-200 shadow-2xl transition-transform duration-300 z-40 ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-amber-200">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <ShoppingCart size={20} />
              Panier ({totalItems})
            </h2>
            <button
              onClick={onToggle}
              className="text-gray-600 hover:text-gray-600 transition-colors p-2"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <CartShared
              items={calculatedItems}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
              variant="desktop"
              showTotalReductions={true}
            />
            {items.length === 0 && (
              <div className="text-center py-8">
                <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Votre panier est vide</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-amber-200 space-y-3">
              {/* Sélecteur serveur (mode simplifié uniquement) */}
              {isSimplifiedMode && (
                <Select
                  label="Serveur"
                  options={serverOptions}
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  size="sm"
                  leftIcon={<Users size={14} className="text-amber-500" />}
                />
              )}

              {/* Mode de paiement */}
              <PaymentMethodSelector
                value={paymentMethod}
                onChange={setPaymentMethod}
                className="mb-4"
              />

              <div className="flex justify-between items-center">
                <span className="text-gray-800 text-lg font-semibold">Total:</span>
                <span className="text-amber-600 text-2xl font-bold font-mono">
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
                    await onCheckout(isSimplifiedMode ? selectedServer : undefined, paymentMethod);
                    setSelectedServer(''); // Reset
                    showSuccess('🎉 Vente finalisée !', 1000);
                    onToggle(); // ✨ Fermer le panier après succès
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
      {
        isOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-20 z-30"
            onClick={onToggle}
          />
        )
      }
    </>
  );
}
