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
  /** ⭐ `true` si la clé d'idempotence avait déjà servi — aucun second lot. */
  idempotent_replay: boolean;
  /** Signale une contrainte cassée plutôt qu'un refus métier. */
  invariant_violation?: boolean;
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
 * ⛔ PRODUIRE UN LOT NE PEUT PAS SE FAIRE HORS LIGNE (§13.5, comme les
 * ingrédients). La production consomme du stock en FEFO et fige un coût : la
 * rejouer depuis une file offline donnerait un coût calculé sur un état de
 * stock périmé, et la marge de tout ce que le lot sert en dépendrait.
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
      });

      if (error) throw error;
      return unwrapRpc<ProduceBatchResult>(data as Json, 'Production du lot');
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
