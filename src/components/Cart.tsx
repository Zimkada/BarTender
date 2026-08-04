import { ShoppingCart } from 'lucide-react';
import { toast } from 'react-hot-toast';
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
import { useTickets } from '../hooks/queries/useTickets';
import { TicketsService } from '../services/supabase/tickets.service';
import { useStock } from '../context/hooks/useStock';
import { networkManager } from '../services/NetworkManager';

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
  const { currentSession, hasPermission } = useAuth();
  const { getProductStockInfo } = useStock();
  const { serverNames, mappings } = useServerMappings(isSimplifiedMode ? currentBar?.id : undefined);
  const { tickets: ticketsWithSummary, refetchTickets } = useTickets(currentBar?.id);

  // --- CONNECT TO APP CONTEXT ---
  const {
    cart: items,
    updateCartQuantity,
    removeFromCart,
    addSale,
    clearCart,
    // ⭐ Panier CUISINE — vide sur un bar pur, la section ne rend alors rien (§3).
    kitchenItems,
    updateKitchenQuantity,
    removeDish,
    clearKitchenCart,
    kitchenTotal,
    kitchenItemCount
  } = useAppContext();

  // --- USE CART LOGIC ---
  const { total, totalItems, calculatedItems } = useCartLogic({
    items,
    barId: currentBar?.id
  });

  // --- CREATE BON ---
  const handleCreateBon = async (serverId: string | null, tableNumber?: number, customerName?: string): Promise<string | null> => {
    if (!currentBar || !currentSession) return null;
    try {
      const ticket = await TicketsService.createTicket(
        currentBar.id,
        currentSession.userId,
        undefined,  // notes deprecated
        serverId || undefined,
        currentBar.closingHour,
        tableNumber,
        customerName
      );
      refetchTickets();
      return ticket.id;
    } catch (e) {
      console.error('Erreur création bon:', e);
      return null;
    }
  };

  // --- CHECKOUT WRAPPER ---
  const handleCheckout = async (assignedTo?: string, paymentMethod?: PaymentMethod, ticketId?: string): Promise<boolean> => {
    /**
     * ⚠️⚠️ ÉTAT TRANSITOIRE — la validation unifiée n'existe PAS ENCORE.
     *
     * `handleCheckout` ne vend que les BOISSONS. Les plats du panier cuisine
     * ne partent nulle part : ils resteront sélectionnés après la vente.
     *
     * ⛔ Sans ce message, un panier de plats SEULS renvoyait `false` en
     * silence : bouton actif, clic sans effet, aucune explication. Défaut
     * trouvé à la code review du 04/08/2026.
     *
     * ⭐ À REMPLACER par l'enchaînement ticket → cuisine → boissons. Ce garde
     * disparaîtra alors entièrement : c'est le point d'entrée de l'étape
     * suivante.
     */
    if (items.length === 0) {
      if (kitchenItems.length > 0) {
        toast('L\'envoi en cuisine arrive bientôt. Ajoutez une boisson pour valider cette vente.', {
          icon: 'ℹ️',
          duration: 5000,
        });
      }
      return false;
    }

    // ⚠️ Panier MIXTE : les boissons partent, les plats RESTENT dans le panier.
    // Le serveur doit le savoir, sinon il croira la commande cuisine envoyée.
    if (kitchenItems.length > 0) {
      toast('Les boissons sont vendues. Les plats restent en attente — l\'envoi en cuisine arrive bientôt.', {
        icon: 'ℹ️',
        duration: 5000,
      });
    }

    // ⛔ Dernier rempart client : sans canSell, aucune vente n'est tentée.
    //    create_sale_idempotent la refuserait de toute façon (guard liste
    //    blanche), mais autant ne pas laisser l'utilisateur aller jusque-là.
    if (!!currentSession && !hasPermission('canSell')) {
      toast.error("Votre rôle ne permet pas d'enregistrer une vente.", { duration: 4000 });
      return false;
    }

    let serverId: string | undefined;

    // 🔴 BLOCKING LOGIC : SERVER OFFLINE MODE
    // Utilise networkManager pour respecter la grace period (état "unstable" != offline)
    const isOffline = networkManager.getDecision().shouldBlock;
    // 🛡️ Piloté par PERMISSION, jamais par rôle brut : qui ne peut pas valider ses
    // propres ventes ne peut pas non plus les créer hors ligne (elles resteraient
    // 'pending' sans que le gérant les voie). Cf. MATRICE_RBAC_CUISINIER §6 zone 4.
    const isServer = !!currentSession && !hasPermission('canValidateSales');

    if (isOffline && isServer) {
      toast.error(
        "MODE HORS LIGNE RESTREINT\n\nVérifiez d'abord votre connexion internet.\n\nSi le problème persiste, demandez au Gérant de passer en MODE SIMPLIFIÉ.",
        { duration: 6000, icon: '🚫' }
      );
      return false;
    }

    if (isSimplifiedMode && assignedTo && currentBar?.id) {
      if (assignedTo.startsWith('Moi (')) {
        serverId = currentSession?.userId;
      } else {
        try {
          const resolvedId = await ServerMappingsService.getUserIdForServerName(
            currentBar.id,
            assignedTo
          );
          serverId = resolvedId || undefined;

          if (!serverId) {
            alert(`Serveur inconnu: "${assignedTo}". Veuillez vérifier le mapping.`);
            return false;
          }
        } catch (error) {
          console.error(error);
          alert('Erreur lors de la résolution du serveur.');
          return false;
        }
      }
    }

    setLoading('checkout', true);
    try {
      const saleItems = calculatedItems.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        product_volume: item.product.volume,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        original_unit_price: item.original_unit_price,
        discount_amount: item.discount_amount,
        promotion_id: item.promotion_id
      }));

      await addSale({
        items: saleItems,
        paymentMethod,
        assignedTo,
        serverId,
        ticketId
      });
      showSuccess('🎉 Vente validée !', 1000);
      onToggle();
      return true;
    } catch (e) {
      console.error(e); // Error handled by mutation
      return false;
    } finally {
      setLoading('checkout', false);
    }
  };

  // 🛡️ En mode simplifié, le panier est masqué à qui ne crée pas les ventes —
  // même règle que QuickSaleFlow et create_sale_idempotent. Par permission.
  const isServerRole = !!currentSession && !hasPermission('canValidateSales');
  // ⛔ Qui n'a PAS canSell ne voit JAMAIS le panier, quel que soit le mode
  //    (constat du 02/08/2026 : un cuisinier y accédait en mode complet).
  const cannotSell = !!currentSession && !hasPermission('canSell');
  const shouldHide = hideFloatingButton || cannotSell || (isSimplifiedMode && isServerRole);

  // --- RENDER ---
  return (
    <>
      {/* FLOATING BUTTON */}
      {!shouldHide && (
        <button
          onClick={onToggle}
          className={`
            glass-page-icon
            fixed z-50 rounded-full active:scale-95 transition-all duration-200 flex items-center justify-center
            hover:scale-105
            ${isMobile
              ? 'bottom-20 right-4 w-14 h-14'
              : 'bottom-8 right-8 w-16 h-16'
            }
          `}
          aria-label="Panier"

        >
          <div className="relative">
            <ShoppingCart size={isMobile ? 24 : 28} strokeWidth={2.5} />
            {/* ⭐⭐ COMPTE LES DEUX PANIERS — defaut le plus grave de cette
                etape s il n en comptait qu un : une commande de PLATS SEULS
                n aurait affiche AUCUN badge, donc aucun signal qu il reste
                quelque chose a valider. Le serveur aurait quitte l ecran en
                croyant avoir termine.
                ⚠️ `kitchenItemCount` vaut 0 sur un bar pur : l'expression est
                alors identique à `totalItems`, comme avant (§3). */}
            {totalItems + kitchenItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow-sm">
                {totalItems + kitchenItemCount}
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
          // ⚠️ Vider les DEUX : « Vider le panier » qui laisserait la commande
          // cuisine ferait partir des plats que le serveur croit annules.
          clearKitchenCart();
          cartCleared();
        }}
        onCheckout={handleCheckout}
        isSimplifiedMode={isSimplifiedMode}
        serverNames={serverNames}
        currentServerName={currentSession?.userName}
        serverMappings={mappings}
        ticketsWithSummary={ticketsWithSummary}
        onCreateBon={handleCreateBon}
        isLoading={isLoading('checkout')}
        kitchenItems={kitchenItems}
        onUpdateKitchenQuantity={updateKitchenQuantity}
        onRemoveDish={removeDish}
        kitchenTotal={kitchenTotal}
        maxStockLookup={(id) => getProductStockInfo(id)?.availableStock ?? Infinity}
      />
    </>
  );
}
