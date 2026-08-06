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
   * `ready` consomme des ingrédients par FEFO : les lots changent, donc les
   * coûts matière de TOUS les plats qui partagent ces ingrédients changent
   * aussi. Sans cette invalidation, l'écran Plats afficherait des marges
   * calculées sur des lots déjà consommés.
   *
   * ⚠️ Volontairement PAS appliquée aux autres transitions : `accept` ne touche
   * à rien, et élargir sans raison ferait refetcher le catalogue à chaque clic
   * du cuisinier — l'inverse des trois vagues d'optimisation d'egress (§3).
   */
  const invalidateStockDependent = () => {
    invalidateQueue();
    queryClient.invalidateQueries({ queryKey: dishKeys.all });
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
    onError: (error) => {
      console.error('Acceptation échouée:', getErrorMessage(error));
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
     * ⭐ SERVI SANS LOT — le cuisinier doit le savoir (§4.4, `batch_finish`).
     *
     * ⚠️ On ne refuse jamais : le plat est déjà cuisiné quand la RPC
     * s'exécute. Mais laisser passer en silence cacherait deux choses — une
     * production oubliée, et un coût matière ESTIMÉ plutôt que réel.
     * ⚠️ Aucun message dans le cas nominal : un toast à chaque plat prêt
     * rendrait l'écran de service inutilisable.
     */
    onSuccess: (result) => {
      const debt = result.batch_debt_qty ?? 0;
      if (debt <= 0) return;

      import('react-hot-toast').then(({ default: toast }) => {
        toast(
          `Servi, mais le lot était vide (${debt} portion${debt > 1 ? 's' : ''} manquante${debt > 1 ? 's' : ''}). Pensez à produire un lot.`,
          { icon: '⚠️', duration: 6000 }
        );
      });
    },
    onError: (error) => {
      console.error('Passage en prêt échoué:', getErrorMessage(error));
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
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
    onError: (error) => {
      console.error('Annulation échouée:', getErrorMessage(error));
    },
  });

  return { createOrder, acceptItem, markReady, serveItem, cancelItem };
}
