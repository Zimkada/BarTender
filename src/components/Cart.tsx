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
import { useKitchenMutations } from '../hooks/mutations/useKitchenMutations';

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
  // ⭐ Envoi en cuisine — jamais appele sur un bar pur (kitchenItems vide).
  const { createOrder: createKitchenOrder } = useKitchenMutations();

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
    // ⚠️ Les DEUX paniers vides : rien à valider.
    if (items.length === 0 && kitchenItems.length === 0) return false;

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

    /**
     * ⚠️ DÉCLARÉ AVANT LE `try` — scoping ES2020, piège documenté dans le
     * CLAUDE.md du projet : une variable du `try` est inaccessible au
     * `catch`.
     *
     * ⭐ `kitchenItems` sera vidé dès l'envoi confirmé ; sans ce drapeau, le
     * `catch` ne saurait pas si les plats sont partis — donc ne pourrait pas
     * dire au serveur s'il doit tout recommencer.
     */
    let kitchenSent = false;

    setLoading('checkout', true);
    try {
      /**
       * ⭐⭐ VALIDATION UNIFIÉE — ticket, puis CUISINE, puis boissons (§16.7).
       *
       * ⚠️ L'ORDRE EST LE POINT CENTRAL, et il est CONTRE-INTUITIF.
       * La cuisine passe AVANT la vente : si les boissons échouent après, les
       * plats sont en cuisine et leur vente naîtra au `serve` de toute façon
       * (§6) — RIEN n'est encaissé à tort. L'ordre inverse aurait facturé des
       * boissons pour une commande dont les plats n'existent nulle part.
       * Entre « le client attend une boisson » et « le client paie ce qu'il
       * n'aura pas », le premier se rattrape.
       *
       * ⚠️ Sur un bar pur, `kitchenItems` est vide : ce bloc entier est sauté
       * et le chemin reste EXACTEMENT celui d'avant (§3).
       */
      let effectiveTicketId = ticketId;

      if (kitchenItems.length > 0) {
        /**
         * ÉTAPE 1 — BON IMPLICITE (§16.7).
         * `kitchen_orders.ticket_id` est NOT NULL : sans bon, le plat n'aurait
         * aucun support pendant ses 10 à 40 min de préparation. Le serveur ne
         * devrait pas avoir à comprendre qu'un plat « exige un bon » — la
         * règle est déductible par le système.
         */
        if (!effectiveTicketId) {
          const created = await handleCreateBon(serverId ?? null);
          if (!created) {
            // ⛔ Sans bon, la commande cuisine ne peut PAS exister. On arrête
            // AVANT toute vente : mieux vaut ne rien faire que vendre des
            // boissons dont les plats sont perdus.
            toast.error('Impossible de créer le bon. Commande non enregistrée.');
            return false;
          }
          effectiveTicketId = created;
        }

        // ÉTAPE 2 — LES PLATS PARTENT EN CUISINE.
        await createKitchenOrder.mutateAsync({
          ticketId: effectiveTicketId,
          items: kitchenItems.map(i => ({
            dish_id: i.dish.id,
            quantity: i.quantity,
            modifiers: i.modifiers && i.modifiers.length > 0 ? i.modifiers : undefined,
          })),
        });

        // ⚠️ Vidé DÈS l'envoi confirmé : si la vente des boissons échoue
        // ensuite, l'utilisateur ne doit PAS pouvoir renvoyer les mêmes plats
        // en réessayant — ils sont déjà en cuisine.
        clearKitchenCart();
        kitchenSent = true;
      }

      // ÉTAPE 3 — LES BOISSONS. Rien à vendre si le panier n'en contient pas.
      if (items.length === 0) {
        showSuccess('🍽️ Commande envoyée en cuisine', 1500);
        onToggle();
        return true;
      }

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
        // ⚠️ Le ticket CREE a l etape 1, pas celui recu en parametre : sinon
        // la vente partirait sans bon alors que les plats en ont un — deux
        // additions la ou le §16.7 en exige UNE.
        ticketId: effectiveTicketId
      });
      showSuccess('🎉 Vente validée !', 1000);
      onToggle();
      return true;
    } catch (e) {
      console.error(e); // Error handled by mutation
      /**
       * ⚠️⚠️ DIRE OÙ ON EN EST — c'est ici que le serveur doit comprendre.
       *
       * Le panier cuisine a été vidé DÈS l'envoi confirmé. S'il est vide alors
       * qu'il contenait des plats, c'est que l'étape 2 a RÉUSSI et que l'échec
       * vient des boissons : les plats sont en cuisine, il ne faut PAS
       * recommencer la commande entière.
       *
       * ⛔ Sans ce message, le serveur relancerait tout et le client recevrait
       * ses plats en DOUBLE — le RPC n'a aucune idempotence sur ce chemin.
       */
      if (kitchenSent) {
        toast.error(
          'Les plats sont bien partis en cuisine, mais la vente des boissons a echoue. Ne recommencez pas la commande — vendez les boissons seules.',
          { duration: 8000 }
        );
      }
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
