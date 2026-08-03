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
import {
  DishesService,
  type DishRow,
  type DishInput,
  type RecipeLineInput,
  type DishProductionMode,
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
          `Recette enregistrée (${result.line_count} ingrédient${result.line_count > 1 ? 's' : ''}) — ` +
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

  return {
    upsertDish,
    replaceRecipe,
    /** Exposé pour l'UI : traduire un mode dérivé en langage clair. */
    getProductionModeLabel: (mode: DishProductionMode) => PRODUCTION_MODE_LABELS[mode],
  };
}
