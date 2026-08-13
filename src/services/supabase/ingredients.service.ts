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
import { dateToYYYYMMDD } from '../../utils/businessDateHelpers';
import type { Json } from '../../lib/database.types';

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
/**
 * §19.6 — taille d'un ingrédient acheté en gros (Grand / Moyen / Petit…).
 *
 * ⭐ Sur l'INGRÉDIENT et non sur le plat : un même carton alimente plusieurs
 * plats (poisson braisé ET frit), et « Grand » est une caractéristique du
 * poisson, pas d'une recette.
 */
export interface IngredientSizeRow {
  id: string;
  ingredient_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

/** Comptage d'un lot par taille — déclaratif, sans effet sur le stock. */
export interface LotCountRow {
  id: string;
  lot_id: string;
  size_id: string;
  counted_qty: number;
}

/**
 * Une ligne de rapprochement : reçus, vendus, écart.
 *
 * ⚠️ `gap` POSITIF = il reste ; NÉGATIF = on a vendu plus qu'on n'a reçu.
 * C'est le second cas qui intéresse — erreur de tri, ou facturation d'un
 * grand pour un moyen servi.
 */
export interface SizeReconciliationRow {
  size_id: string;
  size_label: string;
  ingredient_id: string;
  ingredient_name: string;
  received: number;
  sold: number;
  gap: number;
}

interface SizeReconciliationResult extends RpcEnvelope {
  start: string;
  end: string;
  rows: SizeReconciliationRow[];
}

interface ReplaceSizesResult extends RpcEnvelope {
  ingredient_id: string;
  sizes_count: number;
  retired_count: number;
}

interface RecordLotCountsResult extends RpcEnvelope {
  lot_id: string;
  lines_count: number;
  counted_total: number;
  lot_qty: number;
  /** ⭐ Signale un comptage supérieur au lot — avertissement, jamais refus. */
  exceeds_lot: boolean;
}

interface SetPriceOptionSizeResult extends RpcEnvelope {
  price_option_id: string;
  linked: boolean;
}

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

/**
 * Résultat d'une perte PARTIELLE sur un lot d'ingrédient (09/08/2026).
 *
 * ⚠️ Distinct de `DiscardResult` : ici le lot CONTINUE de servir, sauf si la
 * perte l'a vidé - auquel cas `status` vaut `depleted`.
 * ⛔ Pas d'`idempotent_replay` : une perte partielle N'EST PAS idempotente.
 * Deux déclarations de 2 kg font 4 kg perdus, et c'est le comportement voulu -
 * contrairement à une sortie de lot, qui ne peut avoir lieu qu'une fois.
 */
export interface IngredientLotLossResult extends RpcEnvelope {
  lot_id: string;
  /** Quantité déclarée à CET appel, pas le cumul. */
  lost_qty: number;
  /** Ce qu'il reste dans le lot APRÈS la perte. */
  remaining_qty: number;
  /** `active` si le lot sert encore, `depleted` si la perte l'a vidé. */
  status: IngredientLotStatus;
  /** ⚠️ MONTANT : à n'afficher qu'avec `canViewKitchenCosts` (§8). */
  loss_value: number;
}

/**
 * Résultat d'un retrait ou d'une remise au catalogue (09/08/2026).
 *
 * ⚠️ `remaining_stock` n'est renseigné QUE sur un refus : il dit COMBIEN
 * reste, pour que l'écran n'ait pas à le recalculer.
 */
export interface SetIngredientActiveResult extends RpcEnvelope {
  ingredient_id: string;
  ingredient_name?: string;
  is_active: boolean;
  /** `true` si l'ingrédient était déjà dans cet état. */
  unchanged?: boolean;
  remaining_stock?: number;
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

/**
 * Champs modifiables d'un ingrédient. `id` absent = création.
 *
 * ⚠️ `current_stock` et `last_unit_cost` sont ABSENTS volontairement : ce sont
 * des caches alimentés par les RPC de lot. Les exposer permettrait de
 * « corriger » un stock à la main, contournant le FEFO et la table des dettes
 * (§13.2) — le RPC les refuse de toute façon.
 */
export interface IngredientInput {
  id?: string;
  name: string;
  /** kg, L, pièce… ⚠️ FIGÉE dès qu'un lot ou une recette existe. */
  unit: string;
  cost_mode?: IngredientCostMode;
  /** Obligatoire si `cost_mode = 'per_dish_flat'`, interdit sinon. */
  flat_cost_per_dish?: number | null;
  min_stock_alert?: number | null;
}

interface UpsertIngredientResult extends RpcEnvelope {
  ingredient: IngredientRow;
}

export class IngredientsService {
  // ===== LECTURE =====

  /**
   * Ingrédients d'un bar - ACTIFS par défaut.
   * ⚠️ N'appeler que si `hasRestaurant` — §3 : pas un octet d'egress sur un bar pur.
   *
   * ⛔ `includeRetired` AJOUTÉ en code review le 09/08/2026 : sans lui, un
   * ingrédient retiré disparaissait de TOUS les écrans et ne pouvait plus être
   * remis au catalogue. Le retrait était annoncé réversible sans l'être.
   */
  static async getIngredients(
    barId: string,
    includeRetired = false
  ): Promise<IngredientRow[]> {
    try {
      let query = supabase
        .from('ingredients')
        .select('*')
        .eq('bar_id', barId);

      // ⚠️ Le défaut reste ACTIFS : les recettes et l'appro ne doivent pas
      // proposer un ingrédient retiré du catalogue.
      if (!includeRetired) query = query.eq('is_active', true);

      const { data, error } = await query.order('name');

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

    // ⚠️ `dateToYYYYMMDD` et NON `toISOString().split('T')[0]` : ce dernier
    // convertit en UTC. Au Bénin (UTC+1), un appel à 00h30 locale produirait
    // la date de la VEILLE — la fenêtre serait décalée d'un jour et un lot
    // périmant le jour même serait manqué. Le helper utilise les getters locaux.
    const limitDate = dateToYYYYMMDD(limit);

    try {
      const { data, error } = await supabase
        .from('ingredient_lots')
        .select('*')
        .eq('bar_id', barId)
        .eq('status', 'active')
        .gt('remaining_qty', 0)
        .not('expires_at', 'is', null)
        .lte('expires_at', limitDate)
        .order('expires_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as IngredientLotRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // ===== ÉCRITURE (RPC uniquement) =====

  // ===== ÉCRITURE (RPC) =====

  /**
   * Crée ou modifie un ingrédient.
   *
   * ⭐ Chaînon qui MANQUAIT à la phase 1 : sans lui, aucun ingrédient ne
   * pouvait naître hors d'un INSERT manuel en SQL — donc pas d'appro, pas de
   * recette, pas de marge. Tout le module en dépendait.
   *
   * ⚠️ L'UNITÉ est FIGÉE dès qu'un lot ou une recette existe. Le RPC refuse le
   * changement plutôt que de convertir : passer « kg » à « g » ne convertit
   * RIEN, un stock de 12,5 kg deviendrait 12,5 g. Coût faux d'un facteur 1000,
   * sans la moindre erreur.
   */
  static async upsertIngredient(
    barId: string,
    ingredient: IngredientInput
  ): Promise<IngredientRow> {
    assertNetworkAvailable('enregistrer un ingrédient');

    try {
      const { data, error } = await supabase.rpc('upsert_ingredient', {
        p_bar_id: barId,
        // ⚠️ `Json` et non `Record<string, unknown>` : ce dernier n'est pas
        // assignable à Json, dont l'index signature est récursive.
        p_ingredient: ingredient as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<UpsertIngredientResult>(data, 'Enregistrement de l\'ingrédient').ingredient;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

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
  /**
   * ⭐ Perte PARTIELLE sur un lot qui reste en stock (09/08/2026).
   *
   * « 2 kg sur 10 ont pourri, les 8 autres sont bons » : le lot continue de
   * servir. Distinct de `discardLot`, qui sort le lot ENTIER.
   *
   * ⭐ Le LOT est choisi par l'utilisateur, jamais deviné en FEFO : deux lots
   * du même ingrédient ont des coûts différents, et c'est celui du lot
   * réellement abîmé qui doit être valorisé.
   *
   * ⚠️ Le serveur CUMULE les pertes successives et REFUSE une quantité
   * supérieure au reste - une saisie trop grande est une erreur, pas une
   * perte totale.
   */
  /**
   * ⭐ Retire un ingrédient du catalogue, ou l'y remet (09/08/2026).
   *
   * ⛔ Le serveur REFUSE le retrait s'il reste du STOCK : ces quantités
   * disparaîtraient des comptes sans être comptées en perte. Le message donne
   * la quantité restante et oriente vers la déclaration de perte.
   *
   * ⚠️ Ne bloque PAS si l'ingrédient est utilisé dans une recette : la ligne
   * reste, le plat affichera un coût incomplet. Bloquer là obligerait à
   * démonter toutes les recettes avant de retirer un ingrédient du catalogue.
   */
  static async setActive(
    barId: string,
    ingredientId: string,
    active: boolean
  ): Promise<SetIngredientActiveResult> {
    assertNetworkAvailable('retirer un ingrédient');

    try {
      const { data, error } = await supabase.rpc('set_ingredient_active', {
        p_bar_id: barId,
        p_ingredient_id: ingredientId,
        p_active: active,
      });

      if (error) throw error;
      return unwrapRpc<SetIngredientActiveResult>(data, 'Retrait de l’ingrédient');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  static async recordLotLoss(params: {
    barId: string;
    lotId: string;
    qty: number;
    reason: DiscardReason;
    notes?: string;
    businessDate?: string;
  }): Promise<IngredientLotLossResult> {
    assertNetworkAvailable('déclarer une perte sur un lot');

    try {
      const { data, error } = await supabase.rpc('record_ingredient_lot_loss', {
        p_bar_id: params.barId,
        p_lot_id: params.lotId,
        p_qty: params.qty,
        p_reason: params.reason,
        p_notes: params.notes ?? undefined,
        p_business_date: params.businessDate ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<IngredientLotLossResult>(data, 'Déclaration de perte');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

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

  // ═══════════════════════════════════════════════════════════════════
  // §19.6 — TAILLES ET RAPPROCHEMENT CARTON ↔ VENTES
  // ═══════════════════════════════════════════════════════════════════
  //
  // ⭐ Un carton de poisson acheté en gros contient des tailles différentes.
  // Le restaurateur trie et compte à la réception : ce comptage ne VALORISE
  // rien (le carton entre à son prix global, chaque unité porte le CUMP) — il
  // sert au CONTRÔLE A POSTERIORI, exactement comme son cahier.

  /**
   * TOUTES les tailles actives du bar, avec le nom de leur ingrédient.
   *
   * ⭐ UN appel, pas un par ingrédient : l'écran d'association liste les
   * tailles de tout le bar dans un sélecteur. Une query par ingrédient serait
   * un N+1 sur un écran de configuration.
   */
  static async getAllSizes(
    barId: string
  ): Promise<Array<IngredientSizeRow & { ingredient_name: string }>> {
    try {
      const { data, error } = await supabase
        .from('ingredient_sizes')
        .select('id, ingredient_id, label, sort_order, is_active, ingredients!inner(name)')
        .eq('bar_id', barId)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;

      type Row = IngredientSizeRow & { ingredients: { name: string } | null };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        ingredient_id: r.ingredient_id,
        label: r.label,
        sort_order: r.sort_order,
        is_active: r.is_active,
        // ⚠️ Repli : `!inner` garantit la jointure, mais un ingrédient sans nom
        // afficherait une option vide dans le sélecteur.
        ingredient_name: r.ingredients?.name ?? 'Ingrédient',
      }));
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /** Tailles ACTIVES d'un ingrédient, triées. */
  static async getSizes(barId: string, ingredientId: string): Promise<IngredientSizeRow[]> {
    try {
      const { data, error } = await supabase
        .from('ingredient_sizes')
        .select('id, ingredient_id, label, sort_order, is_active')
        .eq('bar_id', barId)
        .eq('ingredient_id', ingredientId)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Déclare les tailles d'un ingrédient — liste COMPLÈTE, la RPC réconcilie.
   *
   * ⚠️ Une taille absente est RETIRÉE, jamais supprimée : elle est référencée
   * par des comptages réels, et « combien de Grands ai-je reçus en juillet »
   * doit continuer de répondre.
   */
  static async replaceSizes(
    barId: string,
    ingredientId: string,
    sizes: Array<{ label: string; sort_order?: number }>
  ): Promise<ReplaceSizesResult> {
    assertNetworkAvailable('enregistrer les tailles');

    try {
      const { data, error } = await supabase.rpc('replace_ingredient_sizes', {
        p_bar_id: barId,
        p_ingredient_id: ingredientId,
        p_sizes: sizes as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<ReplaceSizesResult>(data, 'Enregistrement des tailles');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /** Comptage par taille déjà saisi pour un lot. */
  static async getLotCounts(barId: string, lotId: string): Promise<LotCountRow[]> {
    try {
      const { data, error } = await supabase
        .from('ingredient_lot_counts')
        .select('id, lot_id, size_id, counted_qty')
        .eq('bar_id', barId)
        .eq('lot_id', lotId);

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Compte un lot par taille — « ce carton : 12 grands, 20 moyens, 8 petits ».
   *
   * ⚠️ DÉCLARATIF : aucun effet sur `remaining_qty`, `unit_cost` ni le stock.
   * Le lot garde ses 40 unités et son coût moyen.
   *
   * ⚠️ Compter PLUS que le lot ne contient n'est PAS refusé (§4.4) : un carton
   * annoncé pour 40 poissons peut en contenir 42. Le résultat porte
   * `exceeds_lot` pour que l'UI le signale sans bloquer.
   */
  static async recordLotCounts(
    barId: string,
    lotId: string,
    counts: Array<{ size_id: string; qty: number }>
  ): Promise<RecordLotCountsResult> {
    assertNetworkAvailable('compter un approvisionnement');

    try {
      const { data, error } = await supabase.rpc('record_lot_counts', {
        p_bar_id: barId,
        p_lot_id: lotId,
        p_counts: counts as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<RecordLotCountsResult>(data, 'Comptage de l\'approvisionnement');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Associe un format de plat à une taille d'ingrédient.
   *
   * ⚠️ `sizeId = null` RETIRE l'association — un format peut cesser d'être
   * suivi sans qu'on supprime quoi que ce soit.
   *
   * ⭐ Plusieurs formats peuvent pointer la MÊME taille : c'est le cas
   * nominal (braisé et frit consomment tous deux du poisson grand), et le
   * rapprochement les additionne.
   */
  static async setPriceOptionSize(
    barId: string,
    priceOptionId: string,
    sizeId: string | null
  ): Promise<SetPriceOptionSizeResult> {
    assertNetworkAvailable('associer un format à une taille');

    try {
      const { data, error } = await supabase.rpc('set_price_option_size', {
        p_bar_id: barId,
        p_price_option_id: priceOptionId,
        p_size_id: sizeId ?? undefined,
      });

      if (error) throw error;
      return unwrapRpc<SetPriceOptionSizeResult>(data, 'Association du format');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Rapprochement reçus ↔ vendus par taille, sur une période.
   *
   * ⚠️ PAR PÉRIODE, PAS PAR CARTON : un carton reçu la veille et vendu le
   * lendemain apparaît dans deux périodes différentes. L'écran doit donc dire
   * « sur la période », jamais « il manque X ».
   */
  static async getSizeReconciliation(
    barId: string,
    start: string,
    end: string
  ): Promise<SizeReconciliationRow[]> {
    try {
      const { data, error } = await supabase.rpc('get_size_reconciliation', {
        p_bar_id: barId,
        p_start: start,
        p_end: end,
      });

      if (error) throw error;
      const result = unwrapRpc<SizeReconciliationResult>(data, 'Rapprochement des tailles');
      return result.rows ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }
}
