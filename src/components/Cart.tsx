import { useState, useCallback } from 'react';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useFeedback } from '../hooks/useFeedback';
import { useViewport } from '../hooks/useViewport';
import { useBarContext } from '../context/BarContext';
import { useCounterContext } from '../context/CounterContext';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { useServerMappings } from '../hooks/useServerMappings';
import { PaymentMethod } from './cart/PaymentMethodSelector';
import { useCartLogic } from '../hooks/useCartLogic';
import { CartDrawer } from './cart/CartDrawer';
import { SaleSuccessOverlay } from './cart/SaleSuccessOverlay';
import { buildSaleSuccess, type SaleSuccess, type SaleSuccessContext } from './cart/saleSuccess';
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
  const { setLoading, isLoading, cartCleared } = useFeedback();
  // ⭐ Moment « vente validée » (lot 2) : remplace les toasts de fin de vente.
  const [saleSuccess, setSaleSuccess] = useState<SaleSuccess | null>(null);
  const clearSaleSuccess = useCallback(() => setSaleSuccess(null), []);
  const { isMobile } = useViewport();
  const { pathname } = useLocation();
  const { formatPrice } = useCurrencyFormatter();
  const { currentBar, isSimplifiedMode } = useBarContext();
  // Comptoir actif : sert a filtrer les serveurs proposes a la caisse.
  const { currentCounterId } = useCounterContext();
  const { currentSession, hasPermission } = useAuth();
  const { getProductStockInfo } = useStock();
  // ⭐ Filtre par COMPTOIR actif (09/10/2026) : ne proposer que les serveurs
  // affectes la ou l'on encaisse, pour eviter une attribution par erreur.
  // ⚠️ A comptoir unique, tout le monde est affecte au comptoir principal
  // (trigger trg_assign_primary_counter) : la liste est donc inchangee.
  const { serverNames, mappings } = useServerMappings(
    isSimplifiedMode ? currentBar?.id : undefined,
    false,
    currentCounterId ?? undefined
  );
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

    /**
     * ⛔⛔ LA CUISINE N'EST JAMAIS DISPONIBLE HORS LIGNE — §13.5.
     *
     * `createKitchenOrder` appelle `assertNetworkAvailable` et REFUSE hors
     * ligne : le décrément FEFO dépend de l'état réel des lots, et deux
     * appareils hors ligne produiraient deux réalités de stock
     * irréconciliables.
     *
     * ⚠️ Défaut trouvé à la code review du 04/08/2026 : la garde ci-dessous
     * ne couvre que les SERVEURS. Un gérant hors ligne passait, créait le bon
     * à l'étape 1, puis voyait l'étape 2 échouer — laissant un TICKET
     * ORPHELIN, vide, dans la liste des bons ouverts.
     *
     * ⭐ Bloqué ICI, AVANT toute écriture : rien de partiel ne se crée.
     */
    if (isOffline && kitchenItems.length > 0) {
      toast.error(
        "Connexion requise pour envoyer une commande en cuisine.\n\nLes boissons seules restent possibles.",
        { duration: 6000, icon: '📡' }
      );
      return false;
    }

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
            toast.error(`Serveur inconnu : « ${assignedTo} ». Vérifiez les noms sur vente dans Équipe.`, { duration: 5000 });
            return false;
          }
        } catch (error) {
          console.error(error);
          toast.error('Impossible de retrouver le serveur choisi. Réessayez.');
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

    /**
     * ⭐ Instantané pour le moment « vente validée », pris AVANT toute
     * écriture : `addSale` vide le panier de façon optimiste, et le total
     * vaudrait 0 une fois la vente partie.
     */
    const successContext: SaleSuccessContext = {
      canValidate: hasPermission('canValidateSales'),
      hasDrinks: items.length > 0,
      hasKitchen: kitchenItems.length > 0,
      // Le bon CHOISI par l'utilisateur, pas le bon implicite de la cuisine.
      hasTicket: !!ticketId,
      ticketNumber: ticketsWithSummary.find(t => t.id === ticketId)?.ticketNumber,
      isOffline,
      amount: total + kitchenTotal,
    };

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
          /**
           * ⭐⭐ §20 — LE SERVEUR CHOISI SUIT LE PLAT, MÊME SUR UN BON EXISTANT.
           *
           * ⛔ Défaut trouvé à l'audit du 18/08 : `serverId` n'était transmis
           * qu'à la CRÉATION du bon (ligne ~198). Sur un bon EXISTANT à
           * `server_id = NULL` — ceux d'avant ce chantier, ou créés en mode
           * complet puis repris après bascule — `handleCreateBon` n'est jamais
           * appelé, et le RPC comblait avec `auth.uid()` : le GÉRANT.
           *
           * ⚠️ La boisson de la MÊME commande partait, elle, sur le serveur
           * choisi (`addSale` reçoit `serverId`). Une commande, deux
           * imputations — et « Mon équipe » réclamait au mauvais serveur.
           *
           * ⭐ Le RPC n'écrase jamais un serveur déjà posé, et VALIDE
           * l'appartenance au bar : ce paramètre vient du client.
           */
          serverId,
          items: kitchenItems.map(i => ({
            dish_id: i.dish.id,
            quantity: i.quantity,
            modifiers: i.modifiers && i.modifiers.length > 0 ? i.modifiers : undefined,
            /**
             * ⭐⭐ §19.5 — ON ENVOIE L'IDENTIFIANT, JAMAIS LE PRIX.
             *
             * `create_kitchen_order` relit le montant en base à partir de cet
             * id. C'est la garantie anti-fraude d'origine, préservée : un
             * serveur ne peut que DÉSIGNER un format que le gérant a créé, il
             * ne peut pas en fabriquer le prix.
             *
             * ⚠️ `undefined` pour un plat à prix ferme — le serveur retombe
             * alors sur `dishes.price`, exactement comme avant.
             */
            price_option_id: i.priceOption?.id,
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
        setSaleSuccess(buildSaleSuccess(successContext));
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
      setSaleSuccess(buildSaleSuccess(successContext));
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

  /**
   * ⭐ BARRE PANIER COLLANTE (audit UI/UX, lot 2, 10/10/2026).
   *
   * Sur l'écran de vente mobile, le total reste sous le pouce pendant toute la
   * prise de commande, au lieu d'un bouton rond sans montant.
   * ⚠️ Écran de vente (`/`) UNIQUEMENT : c'est le seul où l'on remplit le
   * panier, et ailleurs d'autres barres sont déjà fixées en bas (commande
   * fournisseur, paramètres...). Une barre pleine largeur y ferait collision ;
   * le bouton rond historique y reste.
   * ⚠️ Masquée quand le panier est vide : elle n'aurait rien à dire.
   */
  const totalUnits = totalItems + kitchenItemCount;
  // ⚠️ Même total que le pied du panier : boissons ET plats (cf. CartDrawer).
  const displayTotal = total + kitchenTotal;
  const showStickyBar = isMobile && pathname === '/' && totalUnits > 0;

  // --- RENDER ---
  return (
    <>
      <AnimatePresence>
        {!shouldHide && showStickyBar && (
          <motion.button
            key="cart-sticky-bar"
            type="button"
            onClick={onToggle}
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="fixed left-3 right-3 bottom-[4.5rem] z-40 flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: 'var(--brand-gradient)' }}
            aria-label={`Voir le panier : ${totalUnits} ${totalUnits > 1 ? 'articles' : 'article'}, ${formatPrice(displayTotal)}`}
          >
            <ShoppingCart size={22} strokeWidth={2.5} className="flex-shrink-0" />
            <span className="flex-1 min-w-0 text-left leading-tight">
              <span className="block text-micro text-white/85">
                {totalUnits} {totalUnits > 1 ? 'articles' : 'article'}
              </span>
              {/* ⭐ Rebond du total à chaque ajout : il confirme que l'ajout a
                  compté, sans toast. `key` = montant, transform seul. */}
              <motion.span
                key={displayTotal}
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
                className="block origin-left text-body font-bold tabular-nums whitespace-nowrap"
              >
                {formatPrice(displayTotal)}
              </motion.span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-0.5 text-body-sm font-semibold">
              Voir
              <ChevronRight size={18} strokeWidth={2.5} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* FLOATING BUTTON : hors de l'écran de vente mobile (cf. barre collante) */}
      {!shouldHide && !(isMobile && pathname === '/') && (
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

      <SaleSuccessOverlay success={saleSuccess} onDone={clearSaleSuccess} />
    </>
  );
}
