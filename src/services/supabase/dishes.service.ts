/**
 * DishesService
 * Accès aux plats et à leurs recettes — lecture directe, écriture par RPC.
 *
 * Voir PLAN_MODULE_RESTAURATION.md §4.1 (coût dérivé), §4.5 (entité autonome),
 * §16.8 (régimes de production).
 *
 * ⚠️ TOUTES les mutations passent par des RPC SECURITY DEFINER : `authenticated`
 * n'a que SELECT sur `dishes` et `dish_ingredients`. Un INSERT direct
 * contournerait la validation d'isolation par bar, le contrôle du type de
 * catégorie et la dérivation du `production_mode`.
 *
 * ⭐ AUCUN COÛT N'EST STOCKÉ (§4.1). Le coût matière se demande au serveur via
 * `getDishCost` — il n'existe nulle part en base. Un coût stocké se
 * désynchroniserait dès qu'un prix d'ingrédient bouge, sans que personne ne le
 * voie.
 */

import { supabase, handleSupabaseError } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import type { Json } from '../../lib/database.types';

// ===== TYPES =====

/**
 * §16.8 — trois régimes en V1. `precooked` a été retiré du périmètre : c'est un
 * produit fini revendu en l'état, donc un `bar_product`, pas un plat.
 *
 * ⚠️ JAMAIS demandé à l'utilisateur : l'UI propose « à la commande » ou
 * « préparé d'avance », et le serveur DÉRIVE batch/batch_finish de la recette.
 */
export type DishProductionMode = 'on_order' | 'batch' | 'batch_finish';

/** §16.8 — à quel moment l'ingrédient est consommé dans un régime batch_finish. */
export type ConsumedAtStage = 'batch' | 'finish';

export interface DishRow {
  id: string;
  bar_id: string;
  name: string;
  category_id: string | null;
  price: number;
  production_mode: DishProductionMode;
  preparation_time_min: number | null;
  /** `true` = ce plat PRODUIT un lot (riz cuit, poulet bouilli). */
  is_batch_base: boolean;
  portions_per_batch: number | null;
  /** Le cuisinier coupe un plat en rupture, sans le supprimer. */
  is_available: boolean;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DishIngredientRow {
  id: string;
  bar_id: string;
  dish_id: string;
  ingredient_id: string;
  quantity: number;
  is_optional: boolean;
  /** 0.8 = 20 % de perte à l'épluchage. Quantité brute = quantity / yield_factor. */
  yield_factor: number;
  consumed_at_stage: ConsumedAtStage;
}

/** Ligne de recette telle que saisie dans le formulaire. */
export interface RecipeLineInput {
  ingredient_id: string;
  quantity: number;
  yield_factor?: number;
  is_optional?: boolean;
  consumed_at_stage?: ConsumedAtStage;
}

/**
 * Un composant de recette — le lien plat composé → plat-base (§12.4.d).
 *
 * ⭐ « Spaghetti-poulet contient 1 portion de spaghetti cuits ».
 * ⚠️ AUCUN coût ici : c'est le MODÈLE. Le coût vit sur l'INSTANCE
 * (`kitchen_item_batch_consumptions`), car il change à chaque lot produit.
 */
export interface DishComponentRow {
  id: string;
  bar_id: string;
  dish_id: string;
  base_dish_id: string;
  quantity: number;
}

/** Ligne de composition telle que saisie dans le formulaire. */
export interface ComponentLineInput {
  base_dish_id: string;
  quantity: number;
}

/** Champs modifiables d'un plat. `id` absent = création. */
export interface DishInput {
  id?: string;
  name: string;
  price: number;
  category_id?: string | null;
  preparation_time_min?: number | null;
  is_batch_base?: boolean;
  portions_per_batch?: number | null;
  is_available?: boolean;
  photo_url?: string | null;
}

// ===== RÉSULTATS DE RPC =====
// ⚠️ Même contrat que les RPC ingrédients : JSONB `{success, error?}` plutôt
// qu'une exception SQL, pour pouvoir refuser une opération avec un message
// métier. Le service traduit ce contrat en exception applicative.

interface RpcEnvelope {
  success: boolean;
  error?: string;
}

interface UpsertDishResult extends RpcEnvelope {
  dish: DishRow;
}

interface ReplaceRecipeResult extends RpcEnvelope {
  dish_id: string;
  line_count: number;
  /** ⭐ Mode DÉRIVÉ par le serveur — l'UI l'affiche, ne le décide pas. */
  production_mode: DishProductionMode;
  has_finish_stage: boolean;
  /** Présent uniquement en cas d'échec sur doublon. */
  duplicate_ingredients?: string[];
  /** Présent uniquement en cas d'échec sur isolation. */
  invalid_ingredient_ids?: string[];
}

interface ReplaceComponentsResult extends RpcEnvelope {
  dish_id: string;
  component_count: number;
  /** ⭐ Mode DÉRIVÉ par le serveur — l'UI l'affiche, ne le décide pas. */
  production_mode: DishProductionMode;
  /** Présent uniquement en cas d'échec sur doublon. */
  duplicate_base_dishes?: string[];
  /** Présent en cas d'échec : plat d'un autre bar, inactif, ou non plat-base. */
  invalid_base_dishes?: string[];
  /** ⭐ Présent si un plat-base est LUI-MÊME composé — niveau unique (§13.8). */
  nested_base_dishes?: string[];
  /** ⭐ Présent si CE plat sert déjà de base — garde symétrique du niveau unique. */
  used_as_base_by?: string[];
}

/** Une ligne du détail de coût, telle que retournée par `calculate_dish_cost`. */
export interface DishCostLine {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  cost_mode: string;
  consumed_at_stage: ConsumedAtStage;
  /** Quantité de la recette. */
  quantity_net: number;
  /** ⭐ Quantité réellement sortie du stock = net / yield_factor. */
  quantity_gross: number;
  yield_factor: number;
  is_optional: boolean;
  line_cost: number;
  /** `false` pour les optionnels : ils n'entrent pas dans le coût de référence. */
  counted_in_total: boolean;
}

/**
 * Coût d'un plat dans la vue de LISTE — sans le détail ligne par ligne.
 *
 * ⚠️ Volontairement plus pauvre que `DishCostResult` : 40 plats × 8 ingrédients
 * feraient 320 objets que la liste n'affiche pas.
 */
export interface DishCostSummary {
  dish_id: string;
  price: number;
  total_cost: number;
  margin: number;
  /** `null` si le prix est 0 (plat offert) — l'UI affiche « — », jamais 0 %. */
  margin_rate: number | null;
  /**
   * ⭐ 0 = recette NON SAISIE. La marge vaut alors le prix entier, ce que l'UI
   * doit distinguer d'une marge réellement excellente : c'est « coût inconnu »,
   * pas « très rentable ».
   */
  line_count: number;
  has_estimated_cost: boolean;
}

interface AllDishCostsResult extends RpcEnvelope {
  costs: DishCostSummary[];
  count: number;
}

/**
 * Ventilation Bar / Restau d'une journée comptable (§9).
 *
 * ⚠️ Les montants sont BRUTS : `refunds_total` est retourné à part et n'est
 * PAS ventilé. Un remboursement porte sur une vente entière, pas sur un item —
 * le répartir serait une fausse précision. L'appelant le déduit du total.
 */
export interface DailyScopeTotals extends RpcEnvelope {
  business_date: string;
  revenue_bar: number;
  revenue_kitchen: number;
  revenue_total: number;
  items_bar: number;
  items_kitchen: number;
  items_total: number;
  /** ⚠️ GLOBAL, non ventilable. À déduire du total, jamais d'une portée. */
  refunds_total: number;
}

export interface DishCostResult extends RpcEnvelope {
  dish_id: string;
  dish_name: string;
  price: number;
  total_cost: number;
  margin: number;
  /**
   * ⚠️ `null` si le prix est 0 (plat offert) : un taux n'a alors pas de sens
   * mathématique. L'UI doit afficher « — », JAMAIS 0 %.
   */
  margin_rate: number | null;
  /**
   * ⭐ `true` = le coût est une ESTIMATION (stock ou prix manquant).
   * L'UI DOIT le signaler : une marge approximative présentée comme exacte est
   * pire qu'une marge absente.
   */
  has_estimated_cost: boolean;
  /** Noms des ingrédients ayant motivé l'estimation. */
  estimated_reason: string[] | null;
  lines: DishCostLine[];
  line_count: number;
}

// ===== HELPERS =====

/**
 * Traduit le contrat JSONB `{success, error}` en exception applicative.
 *
 * ⚠️ Volontairement dupliqué depuis ingredients.service : factoriser
 * imposerait un module partagé pour ~12 lignes, et les deux contrats peuvent
 * diverger (les RPC plats renvoient des champs de diagnostic que les RPC
 * ingrédients n'ont pas). Trois lignes similaires valent mieux qu'une
 * abstraction prématurée.
 */
function unwrapRpc<T extends RpcEnvelope>(data: unknown, context: string): T {
  const result = data as T | null;

  if (!result) {
    throw new Error(`${context} : réponse vide du serveur`);
  }

  if (!result.success) {
    throw new Error(result.error ?? `${context} : échec sans motif`);
  }

  return result;
}

/**
 * ⚠️ `shouldBlockNetworkOps()` et NON `isOnline()` : ce dernier renvoie `false`
 * dès l'état `unstable`, c'est-à-dire sur une connexion DÉGRADÉE MAIS PRÉSENTE.
 * Utiliser `isOnline()` refuserait une saisie de recette légitime en zone de
 * réseau faible — cas courant au Bénin.
 */
function assertNetworkAvailable(operation: string): void {
  if (networkManager.shouldBlockNetworkOps()) {
    throw new Error(
      `Connexion requise pour ${operation}. Les plats ne peuvent pas être modifiés hors ligne.`
    );
  }
}

export class DishesService {
  // ===== LECTURE =====

  /**
   * Plats actifs d'un bar.
   * ⚠️ N'appeler que si `hasRestaurant` — §3 : pas un octet d'egress sur un bar pur.
   */
  static async getDishes(barId: string): Promise<DishRow[]> {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select('*')
        .eq('bar_id', barId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as DishRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Recette d'un plat.
   *
   * ⚠️ Retourne les lignes BRUTES, sans jointure sur `ingredients` : le pivot
   * dispose déjà des ingrédients via `useUnifiedKitchen` et fait la
   * correspondance en mémoire. Joindre ici referait descendre des données déjà
   * en cache — l'egress a fait l'objet de 3 vagues d'optimisation.
   */
  static async getDishRecipe(barId: string, dishId: string): Promise<DishIngredientRow[]> {
    try {
      const { data, error } = await supabase
        .from('dish_ingredients')
        .select('*')
        .eq('bar_id', barId)
        .eq('dish_id', dishId);

      if (error) throw error;
      return (data ?? []) as DishIngredientRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * ⭐ Coût matière THÉORIQUE d'un plat — calculé serveur, jamais stocké (§4.1).
   *
   * ⚠️ NE JAMAIS appeler en boucle sur une liste de plats (N+1 : 40 plats = 40
   * requêtes). Réservé à l'écran d'ÉDITION d'un plat, où l'utilisateur attend
   * un chiffre sur un plat précis. Un classement de rentabilité exigera un RPC
   * dédié retournant tous les plats en UN appel.
   *
   * ⭐ Le serveur simule le FEFO dans le MÊME ORDRE que la consommation réelle.
   * Ne jamais répliquer ce calcul côté client : deux implémentations de la même
   * règle finiraient par diverger, et c'est l'ÉCART théorique/réel qui est la
   * métrique clé du module (§8).
   */
  static async getDishCost(barId: string, dishId: string): Promise<DishCostResult> {
    try {
      const { data, error } = await supabase.rpc('calculate_dish_cost', {
        p_bar_id: barId,
        p_dish_id: dishId,
      });

      if (error) throw error;
      return unwrapRpc<DishCostResult>(data, 'Calcul du coût du plat');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * ⭐ Coûts et marges de TOUS les plats, en UN appel.
   *
   * C'est ce qui permet d'afficher la marge sur chaque ligne de la liste (§9)
   * sans produire un N+1 : 40 plats en une requête, pas 40 requêtes.
   *
   * ⚠️ Le serveur garantit un calcul IDENTIQUE à `getDishCost` (même ordre
   * FEFO, mêmes cost_mode, même division par yield_factor). Une divergence
   * afficherait deux marges différentes pour le même plat selon l'écran — la
   * concordance est vérifiée au post-vol de la migration.
   */
  static async getAllDishCosts(barId: string): Promise<DishCostSummary[]> {
    try {
      const { data, error } = await supabase.rpc('calculate_all_dish_costs', {
        p_bar_id: barId,
      });

      if (error) throw error;
      return unwrapRpc<AllDishCostsResult>(data, 'Calcul des marges').costs ?? [];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * ⭐ Ventilation Bar / Restau du CA et des articles pour UNE journée (§9).
   *
   * ⚠️ Agrégation SERVEUR, et c'est le point : le Dashboard charge les ventes
   * avec `includeItems: false` — une optimisation d'egress délibérée. Ventiler
   * côté client exigerait de charger le détail de toutes les ventes du jour.
   * Ce RPC retourne 4 nombres au lieu de 200 tickets.
   *
   * ⚠️ `businessDate` est OBLIGATOIRE et calculée par l'appelant : l'heure de
   * clôture est propre à chaque bar. Le serveur la recalculerait avec un seuil
   * codé en dur, produisant un CA faux pour tout bar ne fermant pas à 6 h.
   *
   * ⭐ Appelé UNE fois par journée : changer de portée ne redemande rien (§9).
   */
  static async getDailyScopeTotals(
    barId: string,
    businessDate: string
  ): Promise<DailyScopeTotals> {
    try {
      const { data, error } = await supabase.rpc('get_daily_scope_totals', {
        p_bar_id: barId,
        p_business_date: businessDate,
      });

      if (error) throw error;
      return unwrapRpc<DailyScopeTotals>(data, 'Calcul de la ventilation du jour');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  // ===== ÉCRITURE (RPC) =====

  /**
   * Crée ou modifie un plat.
   *
   * ⚠️ N'écrit PAS `production_mode` : le serveur le dérive de la recette
   * (§16.8). Un plat créé est toujours `on_order` jusqu'à ce que sa recette
   * soit saisie.
   */
  static async upsertDish(barId: string, dish: DishInput): Promise<DishRow> {
    assertNetworkAvailable('enregistrer un plat');

    try {
      const { data, error } = await supabase.rpc('upsert_dish', {
        p_bar_id: barId,
        // ⚠️ `Json` (type généré Supabase) et non `Record<string, unknown>` :
        // ce dernier n'est pas assignable à Json, dont l'index signature est
        // récursive. Le double cast passe par `unknown` car DishInput contient
        // des `undefined` optionnels, absents de Json.
        p_dish: dish as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<UpsertDishResult>(data, 'Enregistrement du plat').dish;
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Remplace ATOMIQUEMENT la recette d'un plat.
   *
   * ⭐ La recette entière est envoyée, pas des ajouts ligne par ligne : c'est
   * ainsi que le cuisinier pense, et cela évite tout état intermédiaire
   * incohérent. Le serveur valide TOUT avant d'écrire — une faute de saisie ne
   * détruit pas la recette précédente.
   *
   * ⭐ Retourne le `production_mode` DÉRIVÉ : l'UI l'affiche en langage clair
   * (« préparé d'avance, avec finition »), elle ne le décide pas.
   *
   * @param lines Recette complète. Un tableau VIDE efface la recette.
   */
  static async replaceRecipe(
    barId: string,
    dishId: string,
    lines: RecipeLineInput[]
  ): Promise<ReplaceRecipeResult> {
    assertNetworkAvailable('enregistrer une recette');

    try {
      const { data, error } = await supabase.rpc('replace_dish_recipe', {
        p_bar_id: barId,
        p_dish_id: dishId,
        p_lines: lines as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<ReplaceRecipeResult>(data, 'Enregistrement de la recette');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Remplace la COMPOSITION d'un plat — quels plats-bases il prélève (§13.8).
   *
   * ⭐ Distinct de `replaceRecipe` : la recette dit quels INGRÉDIENTS le plat
   * consomme, la composition quels LOTS il prélève. Un spaghetti-poulet a les
   * deux — une portion du lot de spaghetti cuits, plus son huile et sa sauce.
   *
   * ⚠️ Le serveur RE-DÉRIVE le `production_mode` : composer un plat le fait
   * passer en `batch_finish`, retirer tous ses composants le fait retomber.
   * L'UI affiche ce mode, elle ne le décide jamais.
   */
  static async replaceComponents(
    barId: string,
    dishId: string,
    lines: ComponentLineInput[]
  ): Promise<ReplaceComponentsResult> {
    assertNetworkAvailable('enregistrer une composition');

    try {
      const { data, error } = await supabase.rpc('replace_dish_components', {
        p_bar_id: barId,
        p_dish_id: dishId,
        p_lines: lines as unknown as Json,
      });

      if (error) throw error;
      return unwrapRpc<ReplaceComponentsResult>(data, 'Enregistrement de la composition');
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Composition d'un plat — lecture directe, la RLS filtre par bar.
   *
   * ⚠️ `bar_id` filtré explicitement EN PLUS de la RLS : convention du projet
   * (défense en profondeur), et cela permet à la requête d'utiliser
   * `idx_drc_bar` plutôt que de s'en remettre au seul prédicat de policy.
   */
  static async getComponents(
    barId: string,
    dishId: string
  ): Promise<DishComponentRow[]> {
    try {
      const { data, error } = await supabase
        .from('dish_recipe_components')
        .select('id, bar_id, dish_id, base_dish_id, quantity')
        .eq('bar_id', barId)
        .eq('dish_id', dishId);

      if (error) throw error;
      return (data ?? []) as DishComponentRow[];
    } catch (error) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Retire un plat du menu (soft delete).
   *
   * ⚠️ SOFT delete via `upsert_dish` impossible : le RPC ne gère pas
   * `is_active`. On passe donc par une mise à jour directe — mais
   * `authenticated` n'a que SELECT sur la table.
   *
   * ⛔ NON IMPLÉMENTÉ VOLONTAIREMENT : ajouter un GRANT UPDATE ouvrirait
   * l'écriture directe et contournerait toutes les validations. La suppression
   * exigera son propre RPC (`deactivate_dish`), à écrire quand l'écran en aura
   * besoin. `is_available = false` (rupture) couvre déjà le cas courant et
   * passe, lui, par `upsertDish`.
   */
}
