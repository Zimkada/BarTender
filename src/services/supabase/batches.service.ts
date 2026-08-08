/**
 * batches.service.ts
 * Lots de production — §16.8, phase 3B.1.
 *
 * ⭐⭐ UN LOT EST UNE INSTANCE DATÉE, PAS UN STOCK.
 * Deux lots du même plat produits à une semaine d'écart n'ont ni le même
 * coût unitaire (les prix bougent) ni la même péremption. Un plat vendu
 * prélève le coût DE SON LOT — c'est ce qui rend la marge exacte.
 *
 * ⚠️ ÉCRITURE PAR RPC UNIQUEMENT. La table n'accorde que SELECT au client :
 * un INSERT direct créerait un lot SANS consommer d'ingrédients, avec un
 * coût inventé.
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import type { Json } from '../../lib/database.types';

/** États d'un lot — §13.3. Le chiffre dit combien, le statut dit pourquoi. */
export type BatchStatus = 'active' | 'depleted' | 'expired' | 'discarded' | 'closed';

/**
 * ⭐ Origine d'un lot — §19.3, découverte terrain du 08/08/2026.
 *
 * Un maquis PRODUIT son akassa certains jours et l'ACHÈTE d'autres jours.
 * Même article vendu, deux économies :
 *   · `produced`  — ingrédients consommés en FEFO, coût calculé
 *   · `purchased` — AUCUN ingrédient consommé, coût = prix payé
 *
 * ⚠️ Le PRÉLÈVEMENT ne distingue pas l'origine : les deux lots sont dans le
 * même bac, on sert le plus ancien (FIFO). Chaque assiette prend le coût de
 * SON lot, donc le coût reste exact des deux côtés.
 */
export type BatchSource = 'produced' | 'purchased';

export interface ProductionBatchRow {
  id: string;
  bar_id: string;
  /** Le plat-BASE qui produit le lot, jamais le plat vendu. */
  dish_id: string;
  produced_qty: number;
  remaining_qty: number;
  /** ⭐ Coût matière réel / portions produites, FIGÉ à la production. */
  unit_cost: number;
  status: BatchStatus;
  /** ⭐ `purchased` = lot acheté prêt, aucun ingrédient consommé (§19.3). */
  source: BatchSource;
  produced_at: string;
  produced_by: string | null;
  business_date: string;
  /** ⚠️ INFORMATIF — n'entraîne aucun changement de statut automatique. */
  expires_at: string | null;
  discarded_qty: number | null;
  discarded_at: string | null;
  discard_reason: string | null;
  notes: string | null;
}

/** Un lot enrichi du nom de son plat — ce que l'écran Production affiche. */
export interface BatchWithDish extends ProductionBatchRow {
  dish_name: string;
}

interface RpcEnvelope {
  success: boolean;
  error?: string;
}

export interface ProduceBatchResult extends RpcEnvelope {
  batch_id: string;
  dish_name?: string;
  produced_qty: number;
  remaining_qty: number;
  total_cost?: number;
  unit_cost: number;
  business_date?: string;
  status: BatchStatus;
  source?: BatchSource;
  /** ⭐ `true` si la clé d'idempotence avait déjà servi — aucun second lot. */
  idempotent_replay: boolean;
  /** Signale une contrainte cassée plutôt qu'un refus métier. */
  invariant_violation?: boolean;
}

/**
 * ⚠️ Les trois sorties d'une clôture manuelle. `depleted` en est ABSENT : il
 * se pose automatiquement au prélèvement, l'accepter ici permettrait de
 * déclarer « épuisé par les ventes » un lot dont il reste 15 portions.
 */
export type BatchCloseStatus = Exclude<BatchStatus, 'active' | 'depleted'>;

export interface CloseBatchResult extends RpcEnvelope {
  batch_id: string;
  status: BatchStatus;
  /** Portions réellement jetées — 0 pour une clôture « terminé ». */
  discarded_qty?: number;
  /** ⚠️ MONTANT : à n'afficher qu'avec `canViewKitchenCosts` (§8). */
  loss_amount?: number;
  /** ⭐ `true` si le lot était déjà clos — aucun second comptage de perte. */
  already_closed: boolean;
}

/**
 * Résultat d'une perte PARTIELLE (§ perte partielle, 09/08/2026).
 *
 * ⚠️ Distinct de `CloseBatchResult` : ici le lot CONTINUE de servir, sauf si
 * la perte l'a vidé — auquel cas `status` vaut `depleted`.
 */
export interface BatchLossResult extends RpcEnvelope {
  batch_id: string;
  /** Portions déclarées perdues à CET appel, pas le cumul. */
  lost_qty: number;
  /** Ce qu'il reste APRÈS la perte. */
  remaining_qty: number;
  /** `active` si le lot sert encore, `depleted` si la perte l'a vidé. */
  status: BatchStatus;
  /** ⚠️ MONTANT : à n'afficher qu'avec `canViewKitchenCosts` (§8). */
  loss_value?: number;
}

/**
 * ⚠️ Reprise du contrat des RPC du module : `{success, error?}` en JSONB
 * plutôt qu'une exception SQL, pour pouvoir refuser avec un message métier.
 * Le service traduit ce contrat en exception applicative.
 */
function unwrapRpc<T extends RpcEnvelope>(data: unknown, context: string): T {
  const result = data as T | null;
  if (!result) throw new Error(`${context} : réponse vide du serveur`);
  if (!result.success) throw new Error(result.error ?? `${context} : échec`);
  return result;
}

/**
 * ⛔ CRÉER UN LOT NE PEUT PAS SE FAIRE HORS LIGNE (§13.5, comme les
 * ingrédients). Un lot PRODUIT consomme du stock en FEFO : le rejouer depuis
 * une file offline donnerait un coût calculé sur un état de stock périmé.
 * ⚠️ Un lot ACHETÉ ne consomme rien, mais reste bloqué hors ligne : deux
 * appareils déconnectés créeraient deux lots pour un seul achat, et
 * l'idempotence ne les départagerait pas (clés différentes).
 *
 * ⚠️ `shouldBlockNetworkOps()` et NON `isOnline()` : ce dernier renvoie
 * `false` dès l'état `unstable`, c'est-à-dire sur une connexion DÉGRADÉE MAIS
 * PRÉSENTE. L'utiliser refuserait une production légitime en zone de réseau
 * faible — cas courant au Bénin.
 */
function assertNetworkAvailable(operation: string): void {
  if (networkManager.shouldBlockNetworkOps()) {
    throw new Error(
      `Connexion requise pour ${operation}. Un lot ne peut pas être produit hors ligne.`
    );
  }
}

export const BatchesService = {
  /**
   * Produit un lot : consomme les ingrédients `'batch'` en FEFO et fige le
   * coût unitaire.
   *
   * ⚠️ `idempotencyKey` OBLIGATOIRE et générée par l'appelant AVANT l'appel
   * (§ IDs stables pré-générés). Un double-clic sur « Produire » créerait
   * sinon un second lot dont la matière aurait été consommée par le premier —
   * un lot fantôme, à coût nul, qui fausserait toutes les portions servies.
   */
  async produce(params: {
    barId: string;
    dishId: string;
    producedQty: number;
    idempotencyKey: string;
    expiresAt?: string | null;
    notes?: string | null;
    businessDate?: string;
    /** ⭐ §19.3 — `purchased` pour un lot acheté prêt. Défaut : `produced`. */
    source?: BatchSource;
    /**
     * ⚠️ Prix TOTAL payé, jamais unitaire — c'est ce qui figure sur le reçu
     * du fournisseur. Le serveur divise par les portions.
     * ⛔ OBLIGATOIRE si `source = 'purchased'` : sans lui, `unit_cost`
     * vaudrait 0 et chaque portion afficherait 100 % de marge.
     */
    totalCost?: number;
  }): Promise<ProduceBatchResult> {
    assertNetworkAvailable('produire un lot');

    try {
      const { data, error } = await supabase.rpc('produce_batch', {
        p_bar_id: params.barId,
        p_dish_id: params.dishId,
        p_produced_qty: params.producedQty,
        p_idempotency_key: params.idempotencyKey,
        // ⚠️ `undefined` et non `null` : le RPC applique son propre défaut
        // quand le paramètre est absent.
        p_expires_at: params.expiresAt ?? undefined,
        p_notes: params.notes ?? undefined,
        p_business_date: params.businessDate ?? undefined,
        p_source: params.source ?? undefined,
        p_total_cost: params.totalCost ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<ProduceBatchResult>(data as Json, 'Production du lot');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Clôture MANUELLE d'un lot — §13.3.
   *
   * ⭐ Aucune fermeture automatique dans le module : une sauce se conserve
   * trois jours, clôturer à la journée compterait en perte ce qui est encore
   * en cuisine.
   *
   * ⚠️ Jette CE QUI RESTE, jamais un nombre saisi : le RPC prend
   * `remaining_qty` et le met à zéro. Laisser saisir une quantité permettrait
   * de jeter plus qu'il ne reste, ou moins sans dire où passe le solde.
   * ⚠️ Un lot clos ne se rouvre pas — en cas d'erreur, on produit un nouveau
   * lot. C'est plus honnête et ça laisse une trace.
   */
  async close(params: {
    barId: string;
    batchId: string;
    status: Exclude<BatchStatus, 'active' | 'depleted'>;
    reason?: string | null;
  }): Promise<CloseBatchResult> {
    assertNetworkAvailable('clôturer un lot');

    try {
      const { data, error } = await supabase.rpc('close_batch', {
        p_bar_id: params.barId,
        p_batch_id: params.batchId,
        p_status: params.status,
        p_reason: params.reason ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<CloseBatchResult>(data as Json, 'Clôture du lot');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * ⭐ Perte PARTIELLE sur un lot qui reste en service.
   *
   * « 4 portions ont tourné, les 10 autres sont bonnes » : le service
   * continue. Distinct de `close`, qui met `remaining_qty` à zéro et clôture.
   *
   * ⚠️ Le serveur CUMULE les pertes successives et REFUSE une quantité
   * supérieure au reste — une saisie trop grande est une erreur, pas une
   * perte totale.
   */
  async recordLoss(params: {
    barId: string;
    batchId: string;
    qty: number;
    reason?: string | null;
  }): Promise<BatchLossResult> {
    assertNetworkAvailable('déclarer une perte sur un lot');

    try {
      const { data, error } = await supabase.rpc('record_batch_loss', {
        p_bar_id: params.barId,
        p_batch_id: params.batchId,
        p_qty: params.qty,
        p_reason: params.reason ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<BatchLossResult>(data as Json, 'Déclaration de perte');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },

  /**
   * Lots ACTIFS du bar, avec le nom de leur plat.
   *
   * ⚠️ Seulement `active` : les lots clos s'accumulent indéfiniment et
   * n'intéressent plus le service. L'historique se consulte par période.
   * ⭐ Trié par ancienneté : le plus vieux lot se prélève en premier (même
   * esprit que le FEFO des ingrédients).
   */
  async getActiveBatches(barId: string): Promise<BatchWithDish[]> {
    try {
      const { data, error } = await supabase
        .from('production_batches')
        .select('*, dishes!inner(name)')
        .eq('bar_id', barId)
        .eq('status', 'active')
        .order('produced_at', { ascending: true });

      if (error) throw error;

      return ((data ?? []) as unknown as (ProductionBatchRow & {
        dishes: { name: string } | null;
      })[]).map((row) => ({
        ...row,
        dish_name: row.dishes?.name ?? '—',
      }));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  },
};
