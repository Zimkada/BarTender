/**
 * IngredientsService
 * Accès aux ingrédients cuisine — lecture directe, écriture par RPC.
 *
 * Voir PLAN_MODULE_RESTAURATION.md §13.15 (conventions) et §16.13 (FEFO).
 *
 * ⚠️ TOUTES les mutations passent par des RPC SECURITY DEFINER : `authenticated`
 * n'a que SELECT sur ces tables. Un INSERT direct contournerait le calcul FEFO,
 * le solde des dettes et le recalcul du cache — donc produirait un stock faux.
 *
 * ⚠️ OFFLINE : contrairement aux ventes, les opérations d'ingrédients NE SONT
 * PAS mises en file (§13.5). `consume` et `discard` dépendent de l'état réel des
 * lots : hors ligne sur plusieurs appareils, ils produiraient deux réalités de
 * stock irréconciliables. Message clair plutôt que file d'attente trompeuse.
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { getErrorMessage } from '../../utils/errorHandler';

// ===== TYPES =====

/** Typologie à 4 niveaux — remplace le booléen `is_transversal` (§16.3). */
export type IngredientCostMode = 'direct' | 'global' | 'per_dish_flat' | 'cost_only';

export type IngredientLotStatus = 'active' | 'depleted' | 'expired' | 'discarded';

/** Motifs structurés, jamais du texte libre (§16.4) : catégoriser rend actionnable. */
export type DiscardReason = 'expired' | 'spoiled' | 'damaged' | 'inventory_correction';

export interface IngredientRow {
  id: string;
  bar_id: string;
  name: string;
  unit: string;
  cost_mode: IngredientCostMode;
  flat_cost_per_dish: number | null;
  /** ⚠️ CACHE. Source de vérité : Σ lots actifs − Σ dettes ouvertes. */
  current_stock: number;
  last_unit_cost: number | null;
  min_stock_alert: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngredientLotRow {
  id: string;
  bar_id: string;
  ingredient_id: string;
  initial_qty: number;
  remaining_qty: number;
  unit_cost: number;
  received_at: string;
  /** NULL = ne périme pas. Ces lots sortent EN DERNIER en FEFO. */
  expires_at: string | null;
  business_date: string;
  status: IngredientLotStatus;
  discarded_qty: number | null;
  discarded_at: string | null;
}

/**
 * Divergence détectée entre le cache et la source de vérité (§13.11).
 *
 * ⚠️ Champs nullables : PostgreSQL ne pose aucune contrainte NOT NULL sur les
 * colonnes d'une vue, et les types générés le reflètent. En pratique une ligne
 * retournée a toujours ses valeurs — c'est une anomalie détectée, pas une
 * ligne partielle — mais le typage reste fidèle au schéma plutôt qu'optimiste.
 */
export interface StockConsistencyViolation {
  ingredient_id: string | null;
  bar_id: string | null;
  name: string | null;
  cached_stock: number | null;
  computed_stock: number | null;
  /** Écart cache − source de vérité. Non nul par définition d'une violation. */
  drift: number | null;
}

/** Détail lot par lot — alimente l'écran de coût, obligatoire dès la V1 (§16.13). */
export interface LotBreakdownEntry {
  lot_id: string | null;
  qty: number;
  unit_cost: number;
  expires_at?: string | null;
  from_debt?: boolean;
  loss_reason?: DiscardReason;
  skipped_reason?: string;
  cost_mode?: IngredientCostMode;
}

// ===== RÉSULTATS DE RPC =====
// ⚠️ Les RPC cuisine renvoient du JSONB `{success, error?, ...}` et non une
// ligne typée : ils doivent pouvoir refuser une opération sans lever
// d'exception SQL. Le service traduit ce contrat en exception applicative.

interface RpcEnvelope {
  success: boolean;
  error?: string;
  invariant_violation?: boolean;
}

export interface SupplyResult extends RpcEnvelope {
  lot_id: string | null;
  idempotent_replay: boolean;
  /**
   * ⚠️ ABSENTS sur un REJEU (`idempotent_replay === true`).
   *
   * Le RPC ne retourne alors que `success`, `lot_id` et `idempotent_replay` :
   * les quantités du premier appel ne sont pas relues, ce qui évite une lecture
   * inutile. Les déclarer non-optionnels ferait mentir le type — l'appelant
   * lirait `undefined` sans que TypeScript ne le signale.
   *
   * ⭐ Toujours tester `idempotent_replay` avant de les utiliser.
   */
  qty_received?: number;
  qty_settled_debts?: number;
  qty_stocked?: number;
}

export interface ConsumptionItem {
  ingredient_id: string;
  qty_consumed: number;
  computed_cost: number;
  qty_from_debt?: number;
  lot_breakdown?: LotBreakdownEntry[];
  skipped?: boolean;
  cost_mode?: IngredientCostMode;
}

export interface ConsumeResult extends RpcEnvelope {
  total_cost: number;
  /**
   * ⚠️ Peut être `null` : sur le chemin de rejeu, le RPC construit ce tableau
   * par `jsonb_agg`, qui retourne NULL si aucune ligne n'est agrégée. Le garde
   * `v_existing > 0` rend ce cas inatteignable aujourd'hui, mais la garantie
   * repose sur deux blocs SQL distincts — le type reste fidèle au contrat
   * réel plutôt qu'à ce qui est probable.
   */
  items: ConsumptionItem[] | null;
  idempotent_replay: boolean;
}

export interface DiscardResult extends RpcEnvelope {
  lot_id: string;
  lost_qty: number;
  lost_value: number;
  status: IngredientLotStatus;
  idempotent_replay: boolean;
  /** ⚠️ ABSENTS sur un rejeu — le RPC ne relit pas le lot d'origine. */
  ingredient_id?: string;
  reason?: DiscardReason;
  /**
   * ⭐ Présent UNIQUEMENT sur rejeu. `true` si l'appelant demandait une cause
   * différente de celle déjà figée : la perte n'est PAS re-catégorisée.
   * Sans ce champ, une correction de motif échouerait silencieusement — or
   * c'est la distinction subie/évitable qui fait la valeur de la métrique.
   */
  reason_mismatch?: boolean;
}

/**
 * Déballe le contrat `{success, error}` des RPC cuisine.
 *
 * ⚠️ `invariant_violation` signale un INVARIANT CASSÉ (lot négatif, dette
 * sur-soldée), pas un cas métier — le message est préfixé pour que l'incident
 * soit reconnaissable dans les logs et non confondu avec un refus ordinaire.
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
 * Les opérations de stock cuisine exigent le réseau (§13.5).
 *
 * ⚠️ `shouldBlockNetworkOps()` et NON `isOnline()` : ce dernier renvoie `false`
 * dès l'état `unstable`, c'est-à-dire sur une connexion DÉGRADÉE MAIS PRÉSENTE.
 * Le projet a explicitement tranché que `unstable` ne bloque pas — on laisse
 * les services tenter avec leurs timeouts propres (NetworkManager:366).
 * Utiliser `isOnline()` refuserait un appro légitime en zone de réseau faible,
 * ce qui est le quotidien du terrain visé.
 */
function assertNetworkAvailable(operation: string): void {
  if (networkManager.shouldBlockNetworkOps()) {
    throw new Error(
      `Connexion requise pour ${operation}. Les opérations de stock cuisine ne peuvent pas être mises en attente.`
    );
  }
}

export class IngredientsService {
  // ===== LECTURE =====

  /**
   * Ingrédients actifs d'un bar.
   * ⚠️ N'appeler que si `hasRestaurant` — §3 : pas un octet d'egress sur un bar pur.
   */
  static async getIngredients(barId: string): Promise<IngredientRow[]> {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('bar_id', barId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as IngredientRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Lots CONSOMMABLES d'un ingrédient, dans l'ordre FEFO.
   *
   * ⭐ `expires_at` ASC avec NULLS LAST : ce qui périme sort d'abord, les
   * non-périssables (sel, épices) en dernier. C'est l'ordre exact qu'applique
   * `consume_ingredients_fefo` — l'UI doit montrer la même chose que le calcul.
   */
  static async getLotsFefo(barId: string, ingredientId: string): Promise<IngredientLotRow[]> {
    try {
      const { data, error } = await supabase
        .from('ingredient_lots')
        .select('*')
        .eq('bar_id', barId)
        .eq('ingredient_id', ingredientId)
        .eq('status', 'active')
        .gt('remaining_qty', 0)
        .order('expires_at', { ascending: true, nullsFirst: false })
        .order('received_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as IngredientLotRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Lots arrivant à expiration — alimente l'alerte de péremption.
   * @param withinDays fenêtre en jours (défaut 3)
   */
  static async getExpiringLots(barId: string, withinDays = 3): Promise<IngredientLotRow[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + withinDays);

    try {
      const { data, error } = await supabase
        .from('ingredient_lots')
        .select('*')
        .eq('bar_id', barId)
        .eq('status', 'active')
        .gt('remaining_qty', 0)
        .not('expires_at', 'is', null)
        .lte('expires_at', limit.toISOString().split('T')[0])
        .order('expires_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as IngredientLotRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // ===== ÉCRITURE (RPC uniquement) =====

  /**
   * Enregistre un approvisionnement.
   *
   * ⭐ Le RPC solde les dettes ouvertes AVANT de créer le lot (§13.2) : la
   * quantité qui solde une dette n'a jamais été disponible, elle ne doit pas
   * entrer dans le stock — sinon le FEFO consommerait deux fois la même matière.
   *
   * @param idempotencyKey UUID généré par l'appelant AVANT l'appel. Un
   *   double-clic créerait sinon deux lots — stock doublé, marge fausse, et
   *   AUCUNE erreur visible.
   */
  static async receiveSupply(params: {
    barId: string;
    ingredientId: string;
    qty: number;
    unitCost: number;
    idempotencyKey: string;
    expiresAt?: string;
    businessDate?: string;
    notes?: string;
  }): Promise<SupplyResult> {
    assertNetworkAvailable('enregistrer un approvisionnement');

    try {
      const { data, error } = await supabase.rpc('receive_ingredient_supply', {
        p_bar_id: params.barId,
        p_ingredient_id: params.ingredientId,
        p_qty: params.qty,
        p_unit_cost: params.unitCost,
        p_idempotency_key: params.idempotencyKey,
        // ⚠️ `undefined` et jamais `null` pour les params RPC (§13.15).
        p_expires_at: params.expiresAt ?? undefined,
        p_business_date: params.businessDate ?? undefined,
        p_notes: params.notes ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<SupplyResult>(data, 'Approvisionnement');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /**
   * Consomme des ingrédients en FEFO et fige le coût matière.
   *
   * ⚠️ JAMAIS BLOQUANT (§4.4) : un stock théorique à 0 n'empêche pas la
   * consommation — une DETTE est créée au dernier prix connu. En cuisine
   * réelle, le cuisinier voit ce qu'il a. C'est l'inverse du stock de boissons.
   *
   * @param referenceKey clé d'idempotence de l'opération appelante. En phase 3
   *   ce sera le `kitchen_order_item_id` (§11).
   */
  static async consumeFefo(params: {
    barId: string;
    items: Array<{ ingredient_id: string; qty: number }>;
    referenceKey: string;
    referenceType?: 'kitchen_order_item' | 'production_batch' | 'inventory_adjustment' | 'manual';
    businessDate?: string;
  }): Promise<ConsumeResult> {
    assertNetworkAvailable('consommer du stock cuisine');

    try {
      const { data, error } = await supabase.rpc('consume_ingredients_fefo', {
        p_bar_id: params.barId,
        p_items: params.items,
        p_reference_key: params.referenceKey,
        p_reference_type: params.referenceType ?? 'kitchen_order_item',
        p_business_date: params.businessDate ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<ConsumeResult>(data, 'Consommation');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /**
   * Sort un lot du stock et valorise la perte à son coût d'achat réel (§8).
   *
   * ⚠️ `reason` distingue une cause SUBIE ('expired' — achats surdimensionnés)
   * d'une cause ÉVITABLE ('spoiled'/'damaged' — panne, accident). Les confondre
   * rendrait la métrique inexploitable.
   *
   * ⚠️ Sur rejeu, vérifier `reason_mismatch` : la cause est FIGÉE à la première
   * sortie. Un second appel avec un autre motif ne la corrige pas — sans ce
   * champ, la correction échouerait silencieusement.
   */
  static async discardLot(params: {
    barId: string;
    lotId: string;
    reason: DiscardReason;
    notes?: string;
    businessDate?: string;
  }): Promise<DiscardResult> {
    assertNetworkAvailable('sortir un lot du stock');

    try {
      const { data, error } = await supabase.rpc('discard_ingredient_lot', {
        p_bar_id: params.barId,
        p_lot_id: params.lotId,
        p_reason: params.reason,
        p_notes: params.notes ?? undefined,
        p_business_date: params.businessDate ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<DiscardResult>(data, 'Sortie de lot');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // ===== AUDIT =====

  /**
   * Divergences entre le cache `current_stock` et la source de vérité (§13.11).
   *
   * ⭐ Toute ligne retournée est une ANOMALIE. Un cache sans détecteur de
   * divergence est une bombe à retardement — la leçon du CUMP (vague 4c) est
   * qu'un écart silencieux se découvre des mois plus tard, sur des données déjà
   * corrompues.
   */
  static async getStockConsistencyViolations(barId: string): Promise<StockConsistencyViolation[]> {
    try {
      const { data, error } = await supabase
        .from('ingredient_stock_consistency_violations')
        .select('*')
        .eq('bar_id', barId);

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
