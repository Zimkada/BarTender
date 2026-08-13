/**
 * useDishMutations
 * Couche MUTATIONS des plats — écriture (§13.15, architecture 3 couches).
 *
 * ⚠️ Aucune mise à jour optimiste : la valeur d'un plat vient du calcul serveur
 * (coût matière FEFO, `production_mode` dérivé de la recette). Afficher un état
 * deviné puis le corriger produirait un clignotement de marge — exactement ce
 * qu'un promoteur ne doit pas voir sur un chiffre d'argent.
 *
 * ⚠️ Pas de file offline (§13.5) : comme pour les ingrédients, ces opérations
 * exigent le réseau. Le service refuse tôt avec un message clair.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { getErrorMessage } from '../../utils/errorHandler';
import { dishKeys } from '../queries/useDishesQueries';
import { CategoriesService } from '../../services/supabase/categories.service';
import {
  DishesService,
  type DishRow,
  type DishInput,
  type RecipeLineInput,
  type ComponentLineInput,
  type DishProductionMode,
  type SetDishActiveResult,
} from '../../services/supabase/dishes.service';

interface ReplaceRecipeInput {
  dishId: string;
  /** Recette COMPLÈTE. Un tableau vide efface la recette. */
  lines: RecipeLineInput[];
}

interface ReplaceRecipeOutcome {
  dish_id: string;
  line_count: number;
  production_mode: DishProductionMode;
  has_finish_stage: boolean;
}

interface ReplaceComponentsInput {
  dishId: string;
  /** Composition COMPLÈTE. Un tableau vide efface la composition. */
  lines: ComponentLineInput[];
}

interface ReplaceComponentsOutcome {
  dish_id: string;
  component_count: number;
  production_mode: DishProductionMode;
}

/**
 * Libellés en LANGAGE CLAIR (§16.8) — jamais le nom technique.
 *
 * ⚠️ Le §16.8 est explicite : « Libellés UI en langage clair, JAMAIS le nom
 * technique ». Un cuisinier n'a aucune raison de savoir ce que signifie
 * « batch_finish » — et c'est le serveur qui a décidé, pas lui.
 */
const PRODUCTION_MODE_LABELS: Record<DishProductionMode, string> = {
  on_order: 'préparé à la commande',
  batch: 'cuisiné en grande quantité',
  batch_finish: 'précuit puis fini à la commande',
};

export function useDishMutations() {
  const queryClient = useQueryClient();
  const { currentBar } = useBarContext();

  /**
   * Invalide le cache après une écriture.
   *
   * ⚠️ Invalidation LARGE (`dishKeys.all`) et non ciblée, volontairement :
   * modifier une recette change le coût du plat, et modifier un plat change sa
   * place dans la liste. Énumérer les clés une par une créerait un point
   * d'oubli à chaque nouvelle query — et une marge affichée fausse est pire
   * qu'un refetch de plus.
   *
   * ⚠️ Branchée sur `onSettled` et NON `onSuccess` : une mutation peut réussir
   * CÔTÉ SERVEUR puis échouer côté réseau (timeout après le commit). Le RPC est
   * transactionnel, donc la base est cohérente — mais le cache client resterait
   * périmé et afficherait un plat ou une marge faux.
   */
  const invalidateDishes = () => {
    queryClient.invalidateQueries({ queryKey: dishKeys.all });
  };

  /**
   * Crée ou modifie un plat.
   *
   * ⚠️ N'écrit pas `production_mode` : c'est `replaceRecipe` qui le dérive,
   * lui seul voyant la recette complète (§16.8).
   */
  const upsertDish = useMutation<DishRow, Error, DishInput>({
    meta: { suppressGlobalError: true }, // onError local gère le toast
    mutationFn: async (dish) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return DishesService.upsertDish(barId, dish);
    },
    onSettled: invalidateDishes,
    onSuccess: (dish) => {
      import('react-hot-toast').then(({ default: toast }) => {
        toast.success(`« ${dish.name} » enregistré`);
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  /**
   * Remplace ATOMIQUEMENT la recette d'un plat.
   *
   * ⭐ Le serveur DÉRIVE `production_mode` de la recette et le retourne. On
   * l'annonce à l'utilisateur : sans cela, un plat basculerait de « cuisiné en
   * grande quantité » à « précuit puis fini » sans que personne ne comprenne
   * pourquoi. Le système déduit, mais il ne doit pas décider en silence.
   */
  const replaceRecipe = useMutation<ReplaceRecipeOutcome, Error, ReplaceRecipeInput>({
    meta: { suppressGlobalError: true },
    mutationFn: async ({ dishId, lines }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      const result = await DishesService.replaceRecipe(barId, dishId, lines);
      return {
        dish_id: result.dish_id,
        line_count: result.line_count,
        production_mode: result.production_mode,
        has_finish_stage: result.has_finish_stage,
      };
    },
    onSettled: invalidateDishes,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // Une recette vidée est une action délibérée, pas un succès à fêter :
        // le message doit refléter ce qui vient réellement de se passer.
        if (result.line_count === 0) {
          toast('Recette effacée', { icon: '🗑️' });
          return;
        }

        toast.success(
          `Recette enregistrée (${result.line_count} ingrédient${result.line_count > 1 ? 's' : ''}) - ` +
          `plat ${PRODUCTION_MODE_LABELS[result.production_mode]}`,
          { duration: 5000 }
        );
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  /**
   * Remplace ATOMIQUEMENT la COMPOSITION d'un plat — quels lots il prélève.
   *
   * ⭐ Distinct de `replaceRecipe` : la recette dit quels INGRÉDIENTS le plat
   * consomme, la composition quels LOTS il prélève dans d'autres plats. Un
   * spaghetti-poulet a les deux.
   *
   * ⚠️ Le serveur RE-DÉRIVE `production_mode` et on l'annonce, comme pour la
   * recette : composer un plat le fait basculer en « précuit puis fini », et
   * l'utilisateur doit comprendre pourquoi son plat a changé de régime.
   */
  const replaceComponents = useMutation<
    ReplaceComponentsOutcome,
    Error,
    ReplaceComponentsInput
  >({
    meta: { suppressGlobalError: true },
    mutationFn: async ({ dishId, lines }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      const result = await DishesService.replaceComponents(barId, dishId, lines);
      return {
        dish_id: result.dish_id,
        component_count: result.component_count,
        production_mode: result.production_mode,
      };
    },
    onSettled: invalidateDishes,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // Vider une composition est délibéré, pas un succès à fêter — même
        // règle que pour la recette.
        if (result.component_count === 0) {
          toast('Composition effacée', { icon: '🗑️' });
          return;
        }

        toast.success(
          `Composition enregistrée (${result.component_count} base${result.component_count > 1 ? 's' : ''}) - ` +
          `plat ${PRODUCTION_MODE_LABELS[result.production_mode]}`,
          { duration: 5000 }
        );
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  /**
   * Crée une catégorie de PLATS (`type = 'dish'`).
   *
   * ⚠️ Écriture DIRECTE en table, sans RPC — contrairement aux plats et aux
   * recettes. C'est cohérent avec l'existant : `bar_categories` accorde déjà
   * INSERT à `authenticated` pour les catégories de boissons, et la RLS filtre
   * par bar. Créer un RPC ici pour un seul INSERT sans logique métier serait
   * une abstraction pour usage unique.
   *
   * ⚠️ Invalide UNIQUEMENT `dishKeys.categories` : créer une catégorie de plats
   * ne doit pas refetcher le catalogue de boissons, qui vit sous `stockKeys`.
   */
  const createDishCategory = useMutation<
    { id: string },
    Error,
    { name: string; color?: string }
  >({
    meta: { suppressGlobalError: true },
    mutationFn: async (data) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return CategoriesService.createDishCategory(barId, data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dishKeys.categories(currentBar?.id ?? ''),
      });
    },
    onSuccess: () => {
      import('react-hot-toast').then(({ default: toast }) => {
        toast.success('Catégorie créée');
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(msg);
      });
    },
  });

  /**
   * ⭐ Retire un plat de la carte, ou l'y remet (09/08/2026).
   *
   * ⛔ Le serveur REFUSE le retrait si le plat sert de base a un plat compose
   * encore actif. Le message NOMME ces plats - un refus qui ne dit pas QUI
   * bloque oblige a chercher dans toute la carte.
   */
  const setDishActive = useMutation<
    SetDishActiveResult,
    Error,
    { dishId: string; active: boolean }
  >({
    meta: { suppressGlobalError: true },
    mutationFn: async ({ dishId, active }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');

      return DishesService.setActive(barId, dishId, active);
    },
    onSettled: invalidateDishes,
    onSuccess: (result) => {
      import('react-hot-toast').then(({ default: toast }) => {
        // ⚠️ Un double-clic n'annonce rien de neuf : le taire eviterait de
        // faire croire a une seconde action.
        if (result.unchanged) return;

        toast.success(
          result.is_active
            ? `« ${result.dish_name} » est de nouveau au menu`
            : `« ${result.dish_name} » a été retiré du menu`
        );
      });
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        // ⭐ Duree longue : le message nomme les plats bloquants, il faut le
        // temps de les lire.
        toast.error(msg, { duration: 7000 });
      });
    },
  });

  /**
   * Formats de prix d'un plat — §19.5.
   *
   * ⚠️ APPEL SÉPARÉ de `upsertDish`, et non fusionné : `upsert_dish` ne connaît
   * pas les formats, et les lui faire connaître aurait modifié une RPC utilisée
   * par tous les plats pour un besoin qui ne concerne que certains.
   *
   * ⚠️ `meta.suppressGlobalError` : l'erreur est affichée par l'appelant, qui
   * garde le formulaire ouvert pour que le gérant corrige au lieu de tout
   * ressaisir. Même règle que `replaceComponents`.
   */
  const replacePriceOptions = useMutation({
    meta: { suppressGlobalError: true },
    mutationFn: async (input: {
      dishId: string;
      options: Array<{ label: string; price: number; sort_order: number }>;
    }) => {
      const barId = currentBar?.id;
      if (!barId) throw new Error('Aucun bar sélectionné');
      return DishesService.replacePriceOptions(barId, input.dishId, input.options);
    },
    // ⭐ Les formats sont chargés AVEC les plats (`getDishes`) : c'est la liste
    // des plats qu'il faut rafraîchir, pas une clé dédiée.
    onSettled: invalidateDishes,
    /**
     * ⛔⛔ SANS CE HANDLER, L'ÉCHEC ÉTAIT SILENCIEUX - défaut trouvé à la code
     * review. `suppressGlobalError` coupe le toast générique, et rien ne le
     * remplaçait : la modale restait ouverte SANS message, le gérant sans
     * savoir pourquoi son enregistrement ne se terminait pas.
     *
     * ⚠️ C'est le pire cas de ce chantier : le PLAT est déjà créé à cet
     * instant (premier appel réussi), seuls ses formats manquent. Un gérant
     * qui abandonne croirait son poisson configuré, et il se vendrait au prix
     * technique - un chiffre que personne n'a choisi.
     */
    onError: (error) => {
      const msg = getErrorMessage(error);
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(`Plat enregistré, mais ses formats n'ont pas pu l'être : ${msg}`);
      });
    },
  });

  return {
    upsertDish,
    setDishActive,
    replaceRecipe,
    replaceComponents,
    replacePriceOptions,
    createDishCategory,
    /** Exposé pour l'UI : traduire un mode dérivé en langage clair. */
    getProductionModeLabel: (mode: DishProductionMode) => PRODUCTION_MODE_LABELS[mode],
  };
}
