import { ShoppingCart } from 'lucide-react';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { useServerMappings } from '../hooks/useServerMappings';
import { PaymentMethod } from './cart/PaymentMethodSelector';
import { useCartLogic } from '../hooks/useCartLogic';
import { CartDrawer } from './cart/CartDrawer';

interface CartProps {
  isOpen: boolean;
  onToggle: () => void;
  hideFloatingButton?: boolean;
}

export function Cart({
  isOpen,
  onToggle,
  hideFloatingButton = false
}: CartProps) {
  const { setLoading, isLoading, showSuccess, cartCleared } = useFeedback();
  const { isMobile } = useViewport();
  const { currentBar, isSimplifiedMode } = useBarContext();
  const { currentSession } = useAuth();
  const { serverNames } = useServerMappings(isSimplifiedMode ? currentBar?.id : undefined);

  // --- CONNECT TO APP CONTEXT ---
  const {
    cart: items,
    updateCartQuantity,
    removeFromCart,
    addSale,
    clearCart
  } = useAppContext();

  // --- USE CART LOGIC ---
  const { total, totalItems, calculatedItems } = useCartLogic({
    items,
    barId: currentBar?.id
  });

  // --- CHECKOUT WRAPPER ---
  const handleCheckout = async (assignedTo?: string, paymentMethod?: PaymentMethod) => {
    if (items.length === 0) return;

    let serverId: string | undefined;
    if (isSimplifiedMode && assignedTo && currentBar?.id) {
      const serverName = assignedTo.startsWith('Moi (')
        ? (currentSession?.userName || assignedTo)
        : assignedTo;

      try {
        const resolvedId = await ServerMappingsService.getUserIdForServerName(
          currentBar.id,
          serverName
        );
        serverId = resolvedId || undefined;

        if (!serverId) {
          alert(`Serveur inconnu: "${serverName}". Veuillez vérifier le mapping.`);
          return;
        }
      } catch (error) {
        console.error(error);
        alert('Erreur lors de la résolution du serveur.');
        return;
      }
    }

    setLoading('checkout', true);
    try {
      await addSale({
        items: calculatedItems,
        paymentMethod,
        assignedTo,
        serverId
      });
      showSuccess('🎉 Vente validée !', 1000);
      onToggle();
    } catch (e) {
      console.error(e); // Error handled by mutation
    } finally {
      setLoading('checkout', false);
    }
  };

  const isServerRole = currentSession?.role === 'serveur';
  const shouldHide = hideFloatingButton || (isSimplifiedMode && isServerRole);

  // --- RENDER ---
  return (
    <>
      {/* FLOATING BUTTON */}
      {!shouldHide && (
        <button
          onClick={onToggle}
          className={`
            fixed z-50 rounded-full shadow-2xl active:scale-95 transition-transform flex items-center justify-center
            ${isMobile
              ? 'bottom-20 right-4 w-14 h-14 bg-amber-500 text-white'
              : 'bottom-8 right-8 w-16 h-16 bg-amber-600 text-white hover:bg-amber-700 hover:scale-110'
            }
          `}
          aria-label="Panier"
        >
          <div className="relative">
            <ShoppingCart size={isMobile ? 24 : 28} strokeWidth={2.5} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                {totalItems}
              </span>
            )}
          </div>
        </button>
      )}

      {/* DRAWER UNIFIED */}
      <CartDrawer
        isOpen={isOpen && !shouldHide}
        onClose={onToggle}
        items={calculatedItems}
        total={total}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onClear={() => {
          clearCart();
          cartCleared();
        }}
        onCheckout={handleCheckout}
        isSimplifiedMode={isSimplifiedMode}
        serverNames={serverNames}
        currentServerName={currentSession?.userName}
        isLoading={isLoading('checkout')}
      />
    </>
  );
}
