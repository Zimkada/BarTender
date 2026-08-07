/**
 * useRecipeShortfall
 * Ce qui MANQUE pour préparer un plat, avant de lancer le geste (§4.4).
 *
 * ⭐⭐ POURQUOI CET AVERTISSEMENT EXISTE
 * Le serveur ne BLOQUE JAMAIS sur un ingrédient manquant, et c'est voulu :
 * « en cuisine réelle, le cuisinier voit ce qu'il a. Un stock théorique à 0 ne
 * doit pas empêcher un plat de sortir » (§4.4). Il enregistre une DETTE
 * (`ingredient_stock_debts`), pas un stock négatif.
 *
 * ⛔ CE HOOK NE BLOQUE DONC RIEN NON PLUS. Il rend l'écart VISIBLE AVANT le
 * geste. Sans lui, la production réussit, et la dette apparaît sans que le
 * cuisinier ait rien vu venir : l'anomalie se découvre après coup, dans un
 * écran qu'il n'ouvre pas.
 *
 * ⚠️ ESTIMATION D'ALERTE, PAS UNE SIMULATION FEFO.
 * Le vrai prélèvement se fait lot par lot sur le serveur. Ce calcul compare des
 * TOTAUX — il dit « il manquera à peu près ça », jamais un coût. Le §8 est
 * explicite : ne jamais répliquer le calcul serveur côté client, car deux
 * implémentations divergeraient et c'est justement l'écart théorique/réel qui
 * est la métrique du module.
 *
 * ⚠️ AUCUNE REQUÊTE SUPPLÉMENTAIRE : `useIngredients` et `useDishRecipe` sont
 * déjà en cache sur l'écran appelant (l'egress a fait l'objet de 3 vagues
 * d'optimisation).
 *
 * ⛔⛔ DEUX IMPLÉMENTATIONS COEXISTENT — DETTE ASSUMÉE, À CONNAÎTRE.
 * `get_kitchen_queue_shortfalls` (SQL) répond à la même question pour l'écran
 * Service. Elles ne sont PAS interchangeables :
 *   · la RPC part de la FILE (plats déjà commandés, `pending`/`accepted`) ;
 *   · ce hook part d'un plat HYPOTHÉTIQUE, pas encore commandé — c'est
 *     précisément ce qu'est une production à venir.
 * Étendre la RPC à un plat hypothétique lui ferait porter deux questions
 * distinctes, et la Production ferait un aller-retour réseau par frappe.
 *
 * ⚠️ LE POINT DE DIVERGENCE À SURVEILLER est la source du DISPONIBLE :
 *   · la RPC calcule Σ lots actifs − Σ dettes ouvertes ;
 *   · ce hook lit `current_stock`, un CACHE que `consume_ingredients_fefo`
 *     recalcule avec CETTE MÊME formule (20260802160000, l. 431-441).
 * Les deux convergent donc — tant que le cache est frais, ce qu'assure
 * l'invalidation de `ingredientKeys` sur toute mutation consommatrice.
 * ⛔ Si la formule de `current_stock` changeait côté serveur, CE HOOK
 * DEVIENDRAIT FAUX EN SILENCE : aucun test client ne le verrait.
 */

import { useMemo } from 'react';
import { useIngredients } from './queries/useIngredientsQueries';
import { useDishRecipe } from './queries/useDishesQueries';
import type { ConsumedAtStage } from '../services/supabase/dishes.service';

export interface IngredientShortfall {
  ingredientId: string;
  name: string;
  unit: string;
  /** Quantité BRUTE requise, `yield_factor` déjà appliqué. */
  required: number;
  /** Stock au moment du calcul. Jamais négatif : le serveur crée une dette. */
  available: number;
  /** `required - available`, toujours > 0 — les lignes couvertes sont exclues. */
  missing: number;
}

interface Options {
  /**
   * ⭐ Filtre de STADE (§16.8). Produire un lot ne consomme que les lignes
   * `batch` ; finir une assiette ne consomme que les `finish`. Avertir sur des
   * lignes qui ne seront pas prélevées serait une fausse alerte.
   * `undefined` = tous les stades (plat préparé à la commande).
   */
  stage?: ConsumedAtStage;
  /** Nombre de portions visées. Multiplie chaque ligne de recette. */
  quantity: number;
  /** Ne calcule rien tant que l'appelant n'en a pas besoin. */
  enabled?: boolean;
}

export function useRecipeShortfall(
  barId: string | undefined,
  dishId: string | undefined,
  { stage, quantity, enabled = true }: Options
) {
  const shouldLoad = enabled && !!barId && !!dishId && quantity > 0;

  const { data: recipe = [], isLoading: isLoadingRecipe } = useDishRecipe(
    barId,
    shouldLoad ? dishId : undefined
  );
  const { data: ingredients = [], isLoading: isLoadingIngredients } =
    useIngredients(shouldLoad ? barId : undefined);

  const shortfalls = useMemo<IngredientShortfall[]>(() => {
    if (!shouldLoad || recipe.length === 0 || ingredients.length === 0) return [];

    const byId = new Map(ingredients.map((i) => [i.id, i]));

    return recipe.reduce<IngredientShortfall[]>((acc, line) => {
      const ingredient = byId.get(line.ingredient_id);
      if (!ingredient) return acc;

      /**
       * ⛔ SEUL `direct` DÉCRÉMENTE (§16.3, §4.4). `global` (sel, eau),
       * `per_dish_flat` (huile) et `cost_only` ne touchent pas au stock —
       * personne ne pèse l'huile. Les signaler en rupture serait une alerte
       * sur une quantité que le serveur ne prélèvera jamais.
       */
      if (ingredient.cost_mode !== 'direct') return acc;

      // ⚠️ Le stade doit correspondre : voir `Options.stage`.
      if (stage !== undefined && line.consumed_at_stage !== stage) return acc;

      /**
       * ⛔ `is_optional` N'EST PAS FILTRÉ ICI, et c'est contre-intuitif.
       *
       * Il exclut une ligne du CALCUL DE COÛT (`dish_cost_rpc`), pas de la
       * CONSOMMATION : `mark_ready` et `produce_batch` prélèvent toutes les
       * lignes du stade, optionnelles comprises. Les écarter de l'alerte
       * tairait un manque que le serveur transformera bel et bien en dette.
       */

      /**
       * ⭐ QUANTITÉ BRUTE = `quantity / yield_factor` — la règle du serveur.
       * 0.8 signifie 20 % de perte à l'épluchage : il faut sortir 1.25 kg pour
       * en utiliser 1. Ignorer ce facteur sous-estimerait le manque, et
       * l'avertissement raterait précisément les cas limites.
       * ⚠️ Garde sur 0 : une division par zéro donnerait `Infinity` et
       * afficherait un manque absurde.
       */
      const factor = line.yield_factor > 0 ? line.yield_factor : 1;
      const required = (line.quantity / factor) * quantity;

      const available = ingredient.current_stock;
      const missing = required - available;
      if (missing <= 0) return acc;

      acc.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        required,
        available,
        missing,
      });
      return acc;
    }, []);
  }, [shouldLoad, recipe, ingredients, stage, quantity]);

  return {
    shortfalls,
    hasShortfall: shortfalls.length > 0,
    /**
     * ⚠️ Exposé pour que l'appelant n'affiche PAS « tout va bien » pendant le
     * chargement. Une liste vide non encore chargée se lit comme une absence
     * de manque — le piège s'est déjà produit trois fois sur ce module.
     */
    isLoading: shouldLoad && (isLoadingRecipe || isLoadingIngredients),
  };
}
