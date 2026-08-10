/**
 * useKitchenMutations
 * Couche MUTATIONS de la file cuisine — transitions d'état (§6, §13.15).
 *
 * ⚠️ Aucune mise à jour optimiste. Chaque transition dépend d'un CALCUL SERVEUR
 * qui peut refuser : `mark_ready` échoue si le stock est insuffisant, `serve`
 * si la vente ne peut être créée. Afficher un plat comme prêt puis revenir en
 * arrière ferait douter le cuisinier de ce qu'il voit à l'écran — sur un poste
 * où il agit vite et sans relire.
 *
 * ⚠️ Pas de file offline (§13.5) : le service refuse tôt avec un message clair.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { getErrorMessage } from '../../utils/errorHandler';
import { kitchenKeys } from '../queries/useKitchenQueries';
import { dishKeys } from '../queries/useDishesQueries';
import { ingredientKeys } from '../queries/useIngredientsQueries';
import { batchKeys } from '../queries/useBatchQueries';
// ⚠️ Clés IMPORTÉES et non écrites en dur : un littéral `['sales']` ne suivrait
// pas un renommage et invaliderait silencieusement dans le vide — la pire
// classe de bug de cache, car rien ne casse, l'écran affiche juste du périmé.
import { salesKeys } from '../queries/useSalesQueries';
import { ticketKeys } from '../queries/useTickets';
import {
  KitchenService,
  type KitchenCancelReason,
  type KitchenOrderLineInput,
  type ServiceMode,
} from '../../services/supabase/kitchen.service';

/** Motifs d'annulation en LANGAGE CLAIR (§16.8) — jamais le nom technique. */
export const CANCEL_REASON_LABELS: Record<KitchenCancelReason, string> = {
  out_of_stock: 'ingrédient manquant',
  kitchen_error: 'erreur de cuisine',
  server_input_error: 'erreur de saisie du serveur',
  customer_cancelled: 'annulé par le client',
  substitution_offered: 'remplacé par un autre plat',
};

export function useKitchenMutations() {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();
  const barId = currentBar?.id;

  /**
   * Invalide la file après une transition.
   *
   * ⚠️ Branchée sur `onSettled` et NON `onSuccess` : une transition peut
   * réussir CÔTÉ SERVEUR puis échouer côté réseau (timeout après le commit). Le
   * RPC est transactionnel, donc la base est cohérente — mais la file resterait
   * périmée et le cuisinier reverrait un plat qu'il vient de terminer.
   */
  const invalidateQueue = () => {
    queryClient.invalidateQueries({ queryKey: kitchenKeys.all });
  };

  /**
   * ⭐ Invalidation ÉLARGIE, réservée aux transitions qui touchent le STOCK.
   *
   * `ready` sort de la matière, et TROIS choses en dépendent :
   *   · les COÛTS de tous les plats partageant ces ingrédients (`dishKeys`) ;
   *   · le STOCK d'ingrédients (`ingredientKeys`) ;
   *   · les LOTS DE PRODUCTION (`batchKeys`), depuis que `batch` et
   *     `batch_finish` y prélèvent (20260808200000).
   * Chacun a été oublié à son tour - et à chaque fois le symptôme était le
   * même : un écran qui affiche un chiffre déjà faux, sans erreur visible.
   *
   * ⚠️ Volontairement PAS appliquée aux autres transitions : `accept` ne touche
   * à rien, et élargir sans raison ferait refetcher le catalogue à chaque clic
   * du cuisinier — l'inverse des trois vagues d'optimisation d'egress (§3).
   */
  const invalidateStockDependent = () => {
    invalidateQueue();
    queryClient.invalidateQueries({ queryKey: dishKeys.all });

    /**
     * ⛔ OUBLI CORRIGÉ le 08/08/2026 : cette fonction invalidait les COÛTS
     * dérivés (`dishKeys`) mais pas le STOCK qui vient d'être consommé.
     *
     * `useIngredients` porte `CACHE_STRATEGY.products` (30 min) parce que le
     * RÉFÉRENTIEL bouge peu — mais `current_stock` y vit et bouge à chaque
     * `ready`. L'écran Ingrédients affichait donc un stock périmé pendant tout
     * un service, et l'avertissement de rupture aurait rassuré à tort.
     *
     * ⚠️ `ingredientKeys.list` et non `.all` : les LOTS d'ingrédients ne sont
     * pas affichés pendant le service. Élargir ferait refetcher des données
     * que personne ne regarde, contre les 3 vagues d'egress (§3).
     */
    if (barId) {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.list(barId) });

      /**
       * ⛔⛔ SECOND OUBLI, MÊME MOTIF - trouvé au test du 09/08/2026 :
       * « ça a finalement été décrémenté, mais pas automatiquement ».
       *
       * Les LOTS DE PRODUCTION sont désormais décrémentés par `mark_ready`
       * (migration 20260808200000 : un plat `batch` prélève dans son lot, un
       * `batch_finish` dans ceux de ses composants). L'écran Production
       * affichait donc des portions déjà servies jusqu'au prochain
       * rafraîchissement manuel.
       *
       * ⚠️ `useActiveBatches` n'a NI `useSmartSync` NI `refetchInterval` - il
       * a été écrit quand seule la production alimentait cet écran. Cette
       * invalidation est le seul chemin par lequel le service le met à jour.
       *
       * ⭐ Coût nul en pratique : l'écran Production n'est pas monté pendant
       * le service. React Query n'émet une requête que si la clé est observée.
       */
      queryClient.invalidateQueries({ queryKey: batchKeys.active(barId) });
    }
  };

  /** Envoie les plats d'un ticket en cuisine. */
  const createOrder = useMutation({
    mutationFn: async (input: {
      ticketId: string;
      items: KitchenOrderLineInput[];
      serviceMode?: ServiceMode;
      notes?: string;
    }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.createOrder(
        barId,
        input.ticketId,
        input.items,
        input.serviceMode ?? 'dine_in',
        input.notes
      );
    },
    /**
     * ⚠️ INVALIDE AUSSI LES TICKETS — défaut trouvé à la code review du
     * 04/08/2026.
     *
     * `create_kitchen_order` passe le ticket en `fulfillment_status =
     * 'pending'` (§13.7) : il n'est PLUS CLÔTURABLE tant que ses plats ne
     * sont pas servis. Sans cette invalidation, le cache garde l'ancienne
     * valeur et le gérant croirait pouvoir encaisser un bon dont la cuisine
     * n'a rien produit.
     */
    onSettled: () => {
      invalidateQueue();
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
    onError: (error) => {
      console.error('Envoi en cuisine échoué:', getErrorMessage(error));
    },
  });

  /** `pending` | `accepted` → `preparing`. */
  const acceptItem = useMutation({
    mutationFn: async (itemId: string) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.acceptItem(barId, itemId);
    },
    onSettled: invalidateQueue,
    /**
     * ⭐⭐ C'EST ICI QUE LE CUISINIER DOIT VOIR L'ALTERNATIVE.
     *
     * `accept_kitchen_item` refuse un plat `batch_finish` dont le lot est
     * épuisé, AU DÉMARRAGE de la préparation — le moment où rien n'est encore
     * engagé et où le choix reste possible (produire un lot, préparer à la
     * commande, déclarer indisponible).
     *
     * ⚠️ Le message du serveur NOMME déjà l'alternative : on l'affiche tel
     * quel plutôt que de le reformuler. Un `console.error` seul laisserait le
     * cuisinier devant un bouton qui ne fait rien.
     */
    onError: (error) => {
      const msg = getErrorMessage(error);
      console.error('Acceptation échouée:', msg);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg, { duration: 6000 });
      });
    },
  });

  /**
   * ⭐ Bascule une ligne en préparation à la commande — §16.9.
   *
   * C'est la SORTIE qu'annonce le refus de lot : « produisez un lot, ou
   * préparez ce plat à la commande ». Sans cette mutation, la seconde option
   * n'était qu'une phrase dans un message d'erreur.
   *
   * ⚠️ Le plat n'est PAS modifié : seule CETTE assiette change de mode. Le
   * coût reste exact — la recette entière est consommée, aucune estimation.
   */
  const forceOnOrder = useMutation({
    mutationFn: async (itemId: string) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.forceOnOrder(barId, itemId);
    },
    onSettled: invalidateQueue,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // ⚠️ Un rejeu n'est pas une nouvelle bascule : le dire évite que le
        // cuisinier croie avoir agi deux fois.
        if (result.already_forced) {
          toast('Ce plat est déjà préparé à la commande', { icon: 'ℹ️' });
          return;
        }
        toast.success(
          `${result.dish_name ?? 'Ce plat'} sera préparé à la commande - délai plus long`,
          { duration: 5000 }
        );
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      console.error('Bascule à la commande échouée:', msg);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg, { duration: 6000 });
      });
    },
  });

  /**
   * ⭐⭐ → `ready` : consomme la MATIÈRE (§6). Invalidation élargie obligatoire.
   */
  const markReady = useMutation({
    mutationFn: async (input: { itemId: string; businessDate?: Date }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.markReady(barId, input.itemId, input.businessDate);
    },
    onSettled: invalidateStockDependent,
    /**
     * ⚠️ AUCUN message dans le cas nominal : un toast à chaque plat prêt
     * rendrait l'écran de service inutilisable.
     *
     * ⛔ Le refus « lot épuisé » remonte par `onError` avec son message
     * métier — la ligne n'est PAS passée à `ready`, contrairement à la
     * première version qui servait avec une dette (corrigée le 07/08/2026 :
     * un lot manquant a une ALTERNATIVE, contrairement à un ingrédient).
     */
    onError: (error) => {
      const msg = getErrorMessage(error);
      console.error('Passage en prêt échoué:', msg);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg, { duration: 6000 });
      });
    },
  });

  /**
   * ⭐ → `served` : crée la VENTE. La matière est déjà sortie.
   *
   * ⚠️ Invalide aussi les VENTES : une vente vient d'être créée, et le
   * Dashboard comme l'Historique afficheraient un CA en retard sans cela.
   */
  const serveItem = useMutation({
    mutationFn: async (input: {
      itemId: string;
      paymentMethod?: string;
      idempotencyKey?: string;
      businessDate?: Date;
    }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.serveItem(
        barId,
        input.itemId,
        input.paymentMethod,
        input.idempotencyKey,
        input.businessDate
      );
    },
    onSettled: () => {
      invalidateQueue();
      // ⭐ Une VENTE a été créée : le CA du jour a changé.
      queryClient.invalidateQueries({ queryKey: salesKeys.all });
      // ⚠️ Le ticket aussi : `serve` met à jour son `fulfillment_status`.
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      // La ventilation Bar/Restau du Dashboard vit sous `dishKeys`.
      queryClient.invalidateQueries({ queryKey: dishKeys.all });
    },
    onError: (error) => {
      console.error('Service échoué:', getErrorMessage(error));
    },
  });

  /**
   * Annule une ligne.
   *
   * ⚠️ Invalidation ÉLARGIE : si la ligne était déjà `ready`, la matière a été
   * consommée et NE revient PAS en stock (§6) — mais la perte doit apparaître
   * dans les coûts. Le résultat porte `was_loss` pour que l'UI le signale.
   */
  const cancelItem = useMutation({
    mutationFn: async (input: {
      itemId: string;
      reason: KitchenCancelReason;
      note?: string;
    }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.cancelItem(barId, input.itemId, input.reason, input.note);
    },
    /**
     * ⚠️ LES TICKETS AUSSI — défaut trouvé à la code review du 04/08/2026.
     *
     * Annuler la DERNIÈRE ligne en cours repasse le ticket en
     * `fulfillment_status = 'fulfilled'` (§13.7) : il redevient clôturable.
     * Sans cette invalidation, le gérant verrait un bon encore bloqué en
     * cuisine alors que plus rien n'y est attendu.
     *
     * ⚠️ `markReady` n'en a PAS besoin : il ne touche pas au ticket. Élargir
     * son invalidation « par symétrie » ferait refetcher les tickets à chaque
     * plat terminé, sur l'écran le plus sollicité du service.
     */
    onSettled: () => {
      invalidateStockDependent();
      /**
       * ⭐ §19.4 - annuler un plat DÉJÀ PRÊT le fait ENTRER dans la file des
       * récupérables. Sans cette invalidation, le gérant ne l'y verrait qu'au
       * rechargement suivant, c'est-à-dire au moment où il est trop tard pour
       * en faire quelque chose.
       * ⚠️ Non couvert par `invalidateStockDependent`, qui ne touche que
       * `batchKeys.active`.
       */
      if (barId) {
        queryClient.invalidateQueries({ queryKey: batchKeys.recoverable(barId) });
      }
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
    onError: (error) => {
      console.error('Annulation échouée:', getErrorMessage(error));
    },
  });

  /**
   * Remet en vente un plat annulé dont la matière était déjà partie (§19.4).
   *
   * ⭐ `invalidateStockDependent` SUFFIT pour les lots : il invalide déjà
   * `batchKeys.active(barId)`, la seule clé que l'écran Production lise.
   * C'est important ici - cette mutation ne fait QUE créer un lot, et sans
   * cette invalidation le plat récupéré n'apparaîtrait qu'au rechargement
   * suivant, laissant croire que le bouton n'a rien fait.
   *
   * ⚠️ `ticketKeys` en revanche est nécessaire, comme pour `cancelItem` :
   * la ligne reste `cancelled` mais son `cancel_note` change (il porte
   * désormais la référence du lot), et l'écran du bon doit le refléter.
   */
  const recoverCancelledDish = useMutation({
    mutationFn: async (input: { itemId: string; note?: string }) => {
      if (!barId) throw new Error('Aucun bar sélectionné');
      return KitchenService.recoverCancelledDish(barId, input.itemId, input.note);
    },
    onSettled: () => {
      invalidateStockDependent();
      /**
       * ⛔ EXPLICITE : `invalidateStockDependent` invalide
       * `batchKeys.active(barId)`, jamais `batchKeys.all` - la file des
       * récupérables n'en fait donc PAS partie. Sans cette ligne, le plat
       * resterait affiché comme récupérable après l'avoir récupéré.
       */
      if (barId) {
        queryClient.invalidateQueries({ queryKey: batchKeys.recoverable(barId) });
      }
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
    onError: (error) => {
      console.error('Récupération échouée:', getErrorMessage(error));
    },
  });

  return {
    createOrder, acceptItem, forceOnOrder, markReady, serveItem, cancelItem,
    recoverCancelledDish,
  };
}
