/**
 * KitchenService
 * File de production cuisine — lecture directe, transitions par RPC.
 *
 * Voir PLAN_MODULE_RESTAURATION.md §6 (machine d'état), §9 (écran Service).
 *
 * ⭐⭐ POURQUOI AUCUNE ÉCRITURE DIRECTE
 * `authenticated` n'a que SELECT sur `kitchen_orders` / `kitchen_order_items`.
 * Chaque transition porte des EFFETS DE BORD indissociables du statut :
 *   ready  → décrément FEFO + coût figé + horodatage d'idempotence
 *   served → création d'une VENTE + mise à jour du ticket
 * Un UPDATE direct changerait le statut SANS ces effets : la matière ne serait
 * jamais décomptée, ou un plat partirait sans vente. La machine d'état n'est
 * donc pas contournable — c'est une garantie de la BASE, pas du client.
 *
 * ⚠️ OFFLINE : comme les ingrédients (§13.5), ces opérations NE SONT PAS mises
 * en file. `mark_ready` dépend de l'état réel des lots ; hors ligne sur deux
 * appareils, il produirait deux réalités de stock irréconciliables.
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import type { Json } from '../../lib/database.types';

// ===== TYPES =====

/**
 * Statut d'une LIGNE — le statut canonique (§4.3).
 * ⚠️ `kitchen_orders` n'a volontairement PAS de colonne `status` : il est
 * dérivé par la vue `kitchen_order_status`, jamais stocké.
 */
export type KitchenItemStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

/** Statut DÉRIVÉ d'une commande. `empty` signale une commande sans ligne. */
export type KitchenOrderStatus =
  | 'empty'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

export type ServiceMode = 'dine_in' | 'takeaway';

/** Motifs structurés, jamais du texte libre (§16.4) : catégoriser rend actionnable. */
export type KitchenCancelReason =
  | 'out_of_stock'
  | 'kitchen_error'
  | 'server_input_error'
  | 'customer_cancelled'
  | 'substitution_offered';

export interface KitchenOrderItemRow {
  id: string;
  bar_id: string;
  kitchen_order_id: string;
  dish_id: string;
  quantity: number;
  status: KitchenItemStatus;
  accepted_by: string | null;
  accepted_at: string | null;
  ready_by: string | null;
  ready_at: string | null;
  served_by: string | null;
  served_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: KitchenCancelReason | null;
  cancel_note: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  modifiers: Json | null;
  unit_price: number;
  /** ⭐ Coût figé à `ready` — le coût RÉELLEMENT consommé, pas une estimation. */
  computed_cost: number | null;
  /** ⭐ Horodatage du décrément. Sert de garde d'idempotence côté serveur. */
  consumed_at: string | null;
  /** ⭐ NULL alors que `consumed_at` est renseigné ⟹ PERTE (§8). */
  sale_id: string | null;
  created_at: string;
}

/**
 * Une ligne de la file, enrichie de son contexte d'affichage.
 *
 * ⚠️ Le nom du plat et le numéro de table sont RÉSOLUS PAR LE SERVEUR dans la
 * même requête. Les recomposer côté client imposerait de charger la liste des
 * plats et celle des tickets pour un simple affichage — trois requêtes là où
 * une suffit, sur l'écran le plus rafraîchi du module.
 */
export interface KitchenQueueItem extends KitchenOrderItemRow {
  dish_name: string;
  ticket_id: string;
  /** ⚠️ NULLABLE en base — une commande peut n'avoir aucune table (§9). */
  table_number: number | null;
  customer_name: string | null;
  service_mode: ServiceMode;
  order_notes: string | null;
  order_created_at: string;
}

interface RpcEnvelope {
  success: boolean;
  error?: string;
  invariant_violation?: boolean;
}

interface CreateOrderResult extends RpcEnvelope {
  kitchen_order_id: string;
  items_created: number;
}

interface TransitionResult extends RpcEnvelope {
  item_id: string;
  status: KitchenItemStatus;
}

interface MarkReadyResult extends TransitionResult {
  computed_cost: number;
  /** `true` si la ligne était déjà prête — le double-clic est le cas NOMINAL. */
  already_ready?: boolean;
  /**
   * ⛔ `true` si un lot était épuisé — la ligne N'EST PAS passée à `ready`.
   *
   * ⚠️ Ce cas doit rester RARE : `accept_kitchen_item` vérifie la
   * disponibilité au DÉMARRAGE de la préparation, quand rien n'est encore
   * engagé. Arriver ici signifie que le lot s'est vidé entre-temps, par une
   * commande concurrente. C'est le dernier filet, pas la protection.
   */
  batch_empty?: boolean;
}

interface ServeResult extends TransitionResult {
  sale_id: string;
}

interface CancelResult extends TransitionResult {
  /** ⭐ `true` si la matière avait déjà été consommée : cette annulation COÛTE. */
  was_loss: boolean;
  lost_cost: number | null;
}

/**
 * Rentabilité d'un plat sur la période — §8.
 *
 * ⚠️ Tous les compteurs sont en ASSIETTES (`SUM(quantity)`), jamais en lignes
 * de commande : « 3 × Poulet braisé » vaut 3.
 */
export interface DishMetrics {
  dish_id: string;
  dish_name: string;
  sold_count: number;
  revenue: number;
  cost: number;
  margin: number;
  /** ⚠️ `null` si aucun CA — l'UI affiche « — », JAMAIS 0 %. */
  margin_rate: number | null;
  /** ⭐ Perte DÉFINITIVE : matière sortie, plat annulé après `ready`. */
  loss_count: number;
  loss_cost: number;
  /** ⚠️ `null` si aucun plat n'a atteint `ready` sur la période. */
  avg_prep_min: number | null;
}

/**
 * Les 4 métriques du §8 sur une période bornée (30 jours par défaut).
 *
 * ⭐⭐ `loss_*` est la métrique qu'aucun tableur ne calcule : matière sortie,
 * vente jamais née. Elle n'existe que parce que la machine d'état du §6
 * dissocie `ready` (consommation) de `served` (CA).
 *
 * ⚠️ NE JAMAIS ADDITIONNER `pending_*` À `loss_*`. Un plat en attente a déjà
 * coûté sa matière mais reste SERVABLE — c'est un signal d'action (« sortez
 * ces assiettes »), pas un constat comptable. Les confondre transformerait un
 * service en cours en catastrophe apparente.
 */
export interface KitchenMetrics extends RpcEnvelope {
  start_date: string;
  end_date: string;
  served_count: number;
  revenue: number;
  cost: number;
  margin: number;
  /** ⚠️ `null` si aucun CA sur la période. */
  margin_rate: number | null;
  loss_count: number;
  loss_cost: number;
  /**
   * ⭐ PERTES DE LOT — distinctes des pertes de PLAT, et volontairement.
   *
   * Les deux n'appellent pas le même geste correctif : un plat cuisiné puis
   * annulé signale une erreur de commande ; un lot jeté signale qu'on a
   * produit trop, ou trop tôt. Les additionner masquerait lequel corriger.
   */
  batch_loss_count: number;
  batch_loss_cost: number;
  /** ⭐ Plats prêts NON encore servis — distinct de la perte. */
  pending_count: number;
  pending_cost: number;
  /** ⚠️ `null` si aucun plat n'a atteint `ready`. */
  avg_prep_min: number | null;
  /** Trié : plats avec ventes d'abord, puis par marge décroissante. */
  dishes: DishMetrics[];
}

/**
 * Un plat dans l'activité du cuisinier — QUANTITÉS SEULES.
 *
 * ⚠️ Volontairement PLUS PAUVRE que `DishMetrics` : ni `revenue`, ni `cost`,
 * ni `margin`, ni `loss_cost`. Ce n'est pas un oubli — c'est la raison d'être
 * du type. Y ajouter un montant rouvrirait la fuite que ce type existe pour
 * fermer (§8 : « il voit les quantités, pas les montants »).
 */
export interface DishProduction {
  dish_id: string;
  dish_name: string;
  served_count: number;
  /** ⭐ Perte DÉFINITIVE : matière sortie, plat annulé après `ready`. */
  loss_count: number;
  /** ⚠️ `null` si aucun plat n'a atteint `ready` — l'UI affiche « — ». */
  avg_prep_min: number | null;
}

/**
 * L'activité de production sur une période — le pendant SANS MONTANTS de
 * `KitchenMetrics`.
 *
 * ⭐ Répond aux trois questions du cuisinier : ce qui l'attend (`todo_count`,
 * `pending_count`), ce qu'il a fait (`served_count`, `avg_prep_min`), ce qui
 * est perdu (`loss_count`).
 *
 * ⚠️ NE JAMAIS ADDITIONNER `pending_count` À `loss_count`. Un plat prêt non
 * servi a coûté sa matière mais reste SERVABLE : c'est un signal d'action,
 * pas un constat. Les confondre ferait passer un service en cours pour une
 * catastrophe.
 */
export interface KitchenProduction extends RpcEnvelope {
  start_date: string;
  end_date: string;
  served_count: number;
  loss_count: number;
  /**
   * ⭐ Portions de LOT jetées ou périmées sur la période.
   *
   * ⛔ QUANTITÉ SEULE — pas de `batch_loss_cost` ici, contrairement à
   * `KitchenMetrics`. C'est la propriété qui justifie l'existence de cette
   * RPC : le cuisinier voit les quantités, jamais les montants (§8).
   * ⭐ Distincte de `loss_count` : celle-ci compte des PLATS annulés, celle-là
   * des portions produites d'avance et non écoulées. Deux causes, deux gestes.
   */
  batch_loss_count: number;
  /** ⭐ Plats prêts en attente de service — distinct de la perte. */
  pending_count: number;
  /** ⚠️ Ce qui reste À PRÉPARER : pending + accepted + preparing. */
  todo_count: number;
  /** ⚠️ `null` si aucun plat n'a atteint `ready`. */
  avg_prep_min: number | null;
  /** Trié : plats les plus PERDUS d'abord — c'est l'information actionnable. */
  dishes: DishProduction[];
}

/** Une ligne à commander. `modifiers` porte « sans piment », « bien cuit ». */
export interface KitchenOrderLineInput {
  dish_id: string;
  quantity: number;
  modifiers?: Json;
}

// ===== HELPERS =====

/**
 * Déballe l'enveloppe `{ success, error }` des RPC.
 *
 * ⚠️ Un RPC qui renvoie `success: false` n'est PAS une erreur Supabase : sans ce
 * contrôle, un échec métier passerait pour un succès et l'UI afficherait un
 * plat comme prêt alors que le stock a refusé la sortie.
 */
function unwrapRpc<T extends RpcEnvelope>(data: unknown, context: string): T {
  const result = data as T | null;

  if (!result) {
    throw new Error(`${context} : réponse vide du serveur`);
  }

  if (!result.success) {
    const prefix = result.invariant_violation ? '[INVARIANT] ' : '';
    throw new Error(`${prefix}${result.error ?? `${context} : échec sans motif`}`);
  }

  return result;
}

/**
 * ⚠️ Les transitions cuisine ne sont PAS mises en file offline (§13.5).
 * Un message clair vaut mieux qu'une file d'attente trompeuse : le cuisinier
 * croirait le plat enregistré alors que le stock n'a rien décompté.
 */
function assertNetworkAvailable(operation: string): void {
  if (networkManager.shouldBlockNetworkOps()) {
    throw new Error(
      `Connexion requise pour ${operation}. Les opérations cuisine ne peuvent pas être mises en attente.`
    );
  }
}

// ===== SERVICE =====

export const KitchenService = {
  /**
   * File de production du jour — LA requête de l'écran Service.
   *
   * ⭐ UNE seule requête avec jointures imbriquées, et non trois recomposées
   * côté client. C'est l'écran le plus rafraîchi du module : y multiplier les
   * allers-retours annulerait une partie des trois vagues d'optimisation
   * d'egress (§3).
   *
   * ⚠️ Les lignes `served` et `cancelled` sont EXCLUES : elles ne sont plus à
   * produire. L'historique se consulte ailleurs — la file doit rester courte,
   * sinon le cuisinier scrolle pour trouver ce qui l'attend.
   */
  async getQueue(barId: string): Promise<KitchenQueueItem[]> {
    try {
      const { data, error } = await supabase
        .from('kitchen_order_items')
        .select(
          `*,
           dishes!inner ( name ),
           kitchen_orders!inner (
             ticket_id, service_mode, notes, created_at,
             tickets!inner ( table_number, customer_name )
           )`
        )
        .eq('bar_id', barId)
        .in('status', ['pending', 'accepted', 'preparing', 'ready'])
        // ⭐ Ordre de PRODUCTION : le plus ancien d'abord. Une file cuisine se
        // sert dans l'ordre d'arrivée, sinon les premières tables attendent
        // pendant que les dernières sont servies.
        .order('created_at', { ascending: true });

      if (error) throw error;

      type QueueRow = KitchenOrderItemRow & {
        dishes: { name: string } | null;
        kitchen_orders: {
          ticket_id: string;
          service_mode: ServiceMode;
          notes: string | null;
          created_at: string;
          tickets: { table_number: number | null; customer_name: string | null } | null;
        } | null;
      };

      return ((data ?? []) as QueueRow[]).map((row) => {
        const { dishes, kitchen_orders, ...item } = row;
        return {
          ...item,
          dish_name: dishes?.name ?? 'Plat inconnu',
          ticket_id: kitchen_orders?.ticket_id ?? '',
          table_number: kitchen_orders?.tickets?.table_number ?? null,
          customer_name: kitchen_orders?.tickets?.customer_name ?? null,
          service_mode: kitchen_orders?.service_mode ?? 'dine_in',
          order_notes: kitchen_orders?.notes ?? null,
          order_created_at: kitchen_orders?.created_at ?? item.created_at,
        };
      });
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * ⭐ Les 4 métriques du §8 — LECTURE, pas de garde réseau.
   *
   * ⚠️ Pas d'`assertNetworkAvailable` : consulter des métriques hors ligne
   * n'a aucune conséquence sur les données. Le cache React Query sert alors
   * le dernier état connu, ce qui vaut mieux qu'un écran d'erreur.
   *
   * ⚠️ Dates au format `YYYY-MM-DD`. Omises = 30 derniers jours, borne
   * appliquée CÔTÉ SERVEUR — un agrégat non borné grossirait indéfiniment.
   */
  async getMetrics(
    barId: string,
    startDate?: string,
    endDate?: string
  ): Promise<KitchenMetrics> {
    try {
      const { data, error } = await supabase.rpc('get_kitchen_metrics', {
        p_bar_id: barId,
        // ⚠️ `undefined` et non `null` : le RPC applique son propre défaut
        // quand le paramètre est absent.
        p_start_date: startDate ?? undefined,
        p_end_date: endDate ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<KitchenMetrics>(data, 'Lecture des métriques cuisine');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Activité de production sur une fenêtre bornée — SANS AUCUN MONTANT.
   *
   * ⭐⭐ Le pendant de `getMetrics` pour le rôle CUISINIER. La distinction
   * n'est pas cosmétique : `get_kitchen_metrics` calcule revenue / cost /
   * margin, que le cuisinier n'a pas le droit de voir (§8, `canViewKitchenCosts:
   * false`). Ici la protection tient à ce que la RPC NE CALCULE PAS ces
   * colonnes — ce qui n'est pas sélectionné ne peut pas fuir.
   *
   * ⛔ NE JAMAIS « factoriser » les deux appels vers `get_kitchen_metrics` en
   * filtrant les montants côté client : ils transiteraient quand même sur le
   * réseau et seraient lisibles dans l'onglet Réseau du navigateur.
   */
  async getProduction(
    barId: string,
    startDate?: string,
    endDate?: string
  ): Promise<KitchenProduction> {
    try {
      const { data, error } = await supabase.rpc('get_kitchen_production', {
        p_bar_id: barId,
        // ⚠️ `undefined` et non `null` : le RPC applique son propre défaut
        // (30 jours) quand le paramètre est absent.
        p_start_date: startDate ?? undefined,
        p_end_date: endDate ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<KitchenProduction>(data, 'Lecture de l’activité cuisine');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Crée la commande cuisine d'un ticket.
   * ⚠️ Un ticket ne peut porter QU'UNE commande (index unique) : le RPC
   * réutilise la commande existante plutôt que d'échouer.
   */
  async createOrder(
    barId: string,
    ticketId: string,
    items: KitchenOrderLineInput[],
    serviceMode: ServiceMode = 'dine_in',
    notes?: string
  ): Promise<CreateOrderResult> {
    assertNetworkAvailable('envoyer une commande en cuisine');

    try {
      const { data, error } = await supabase.rpc('create_kitchen_order', {
        p_bar_id: barId,
        p_ticket_id: ticketId,
        // ⚠️ `Json` et non `Record<string, unknown>[]` : ce dernier n'est pas
        // assignable à Json, dont l'index signature est récursive.
        p_items: items as unknown as Json,
        p_service_mode: serviceMode,
        p_notes: notes ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<CreateOrderResult>(data, 'Envoi en cuisine');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /** `pending` | `accepted` → `preparing`. Le cuisinier prend la ligne en charge. */
  async acceptItem(barId: string, itemId: string): Promise<TransitionResult> {
    assertNetworkAvailable('accepter un plat');

    try {
      const { data, error } = await supabase.rpc('accept_kitchen_item', {
        p_bar_id: barId,
        p_item_id: itemId,
      });

      if (error) throw error;
      return unwrapRpc<TransitionResult>(data, 'Acceptation du plat');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * ⭐⭐ → `ready` : c'est ICI que la MATIÈRE est consommée (§6), pas au service.
   *
   * Le décrément FEFO, le figement du coût et l'horodatage se font en une
   * transaction serveur. Si le stock est insuffisant, la transition ÉCHOUE —
   * on ne déclare pas prêt un plat qu'on n'a pas pu produire.
   *
   * ⚠️ Idempotent : un second appel renvoie `already_ready` sans reconsommer.
   * Le double-clic d'un cuisinier pressé est le cas NOMINAL, pas l'exception.
   */
  async markReady(
    barId: string,
    itemId: string,
    businessDate?: Date
  ): Promise<MarkReadyResult> {
    assertNetworkAvailable('déclarer un plat prêt');

    try {
      const { data, error } = await supabase.rpc('mark_kitchen_item_ready', {
        p_bar_id: barId,
        p_item_id: itemId,
        // ⚠️ `undefined` et non `null` : le RPC applique son propre défaut
        // (journée comptable courante) quand le paramètre est absent.
        p_business_date: businessDate
          ? businessDate.toISOString().slice(0, 10)
          : undefined,
      });

      if (error) throw error;
      return unwrapRpc<MarkReadyResult>(data, 'Passage en prêt');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * ⭐ → `served` : c'est ICI que naît le CA. La matière est DÉJÀ sortie.
   *
   * Le RPC délègue à `create_sale_idempotent` — jamais de réimplémentation :
   * deux chemins de création de vente finiraient par diverger.
   *
   * ⭐⭐ LA VENTE NAÎT EN `validated`, JAMAIS EN `pending` — ET C'EST VOULU.
   *
   * ⛔ NE PAS « corriger » en alignant sur `create_sale_idempotent`, qui met
   * une vente de serveur en `pending` en mode complet. Ce n'est pas un oubli.
   *
   * La validation gérant contrôle la DISPONIBILITÉ PHYSIQUE : le gérant vérifie
   * que le casier existe avant d'entériner la sortie. Une boisson peut être
   * vendue puis se révéler absente — d'où le contrôle a posteriori.
   *
   * Pour un plat, cette vérification est DÉJÀ FAITE, plus tôt et plus
   * sûrement : `mark_ready` appelle `consume_ingredients_fefo`, qui REFUSE la
   * transition si le stock est insuffisant. Garde transactionnelle, pas
   * vérification humaine.
   *
   * ⚠️ Et un plat ne peut PAS être servi sans être passé par `ready` : aucune
   * vente cuisine ne peut donc naître sans que la matière soit sortie. Une
   * validation a posteriori arriverait après la cuisson, après le service et
   * après le décrément — trop tard pour tout.
   *
   * Décision tranchée le 04/08/2026, après le test terrain de la phase 3A.
   */
  async serveItem(
    barId: string,
    itemId: string,
    paymentMethod?: string,
    idempotencyKey?: string,
    businessDate?: Date
  ): Promise<ServeResult> {
    assertNetworkAvailable('servir un plat');

    try {
      const { data, error } = await supabase.rpc('serve_kitchen_item', {
        p_bar_id: barId,
        p_item_id: itemId,
        p_payment_method: paymentMethod ?? undefined,
        p_idempotency_key: idempotencyKey ?? undefined,
        p_business_date: businessDate
          ? businessDate.toISOString().slice(0, 10)
          : undefined,
      });

      if (error) throw error;
      return unwrapRpc<ServeResult>(data, 'Service du plat');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Annule une ligne.
   *
   * ⭐ `was_loss` distingue les deux cas que tout oppose : annuler AVANT `ready`
   * ne coûte rien, annuler APRÈS a déjà consommé la matière. L'UI doit le dire
   * au gérant au moment où ça se produit — sinon la perte reste invisible.
   *
   * ⚠️ Le motif est OBLIGATOIRE et structuré : « annulé » sans cause ne permet
   * de corriger aucun processus.
   */
  async cancelItem(
    barId: string,
    itemId: string,
    reason: KitchenCancelReason,
    note?: string
  ): Promise<CancelResult> {
    assertNetworkAvailable('annuler un plat');

    try {
      const { data, error } = await supabase.rpc('cancel_kitchen_item', {
        p_bar_id: barId,
        p_item_id: itemId,
        p_reason: reason,
        p_note: note ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<CancelResult>(data, 'Annulation du plat');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },
};
