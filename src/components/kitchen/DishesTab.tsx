/**
 * DishesTab
 * Onglet « Plats » de la page Cuisine — §9.
 *
 * ⚠️⚠️ ÉCART ASSUMÉ AVEC LA MAQUETTE DU §9
 * Le plan dessine la marge sur CHAQUE ligne de la liste :
 *     🍗 Poulet braisé    2 500 F • coût 1 450 F • marge 42 %
 * C'est infaisable sans dégrader : le coût vient de `calculate_dish_cost`, un
 * appel serveur PAR PLAT. Une carte de 40 plats = 40 requêtes à chaque
 * affichage (N+1), sur un projet qui a mené 3 vagues d'optimisation pour
 * ramener l'egress à ~200 MB/j.
 *
 * → La marge est affichée pour le plat OUVERT, où elle est réellement lue.
 *   Un promoteur qui compare ses plats a besoin d'un classement de
 *   rentabilité — un écran distinct, avec son RPC groupé retournant tous les
 *   plats en UN appel. Le bâtir maintenant, sans cet écran, reviendrait à
 *   deviner ce qu'il doit montrer.
 *
 * ⭐ CE QUI EST TENU DU §9 : le toggle Dispo/Coupé est IMMÉDIAT, sans modale —
 *   c'est le geste le plus fréquent du service.
 */

import { useState, useMemo } from 'react';
import { ChefHat, Plus, Pencil, UtensilsCrossed, TrendingDown, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../common/EmptyState';
import { DishForm } from './DishForm';
import { RecipeEditor, LOW_MARGIN_THRESHOLD } from './RecipeEditor';
import { useDishRecipe, useDishCost, useAllDishCosts } from '../../hooks/queries/useDishesQueries';
import { useDishMutations } from '../../hooks/mutations/useDishMutations';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { cn } from '../../lib/utils';
import type {
  DishRow,
  DishInput,
  RecipeLineInput,
  DishCostSummary,
} from '../../services/supabase/dishes.service';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

interface DishCategoryOption {
  id: string;
  name: string;
}

interface Props {
  barId: string | undefined;
  dishes: DishRow[];
  ingredients: IngredientWithAlerts[];
  categories: DishCategoryOption[];
  isLoading: boolean;
}

type ModalMode = { kind: 'none' } | { kind: 'dish'; dish?: DishRow } | { kind: 'recipe'; dish: DishRow };

export function DishesTab({ barId, dishes, ingredients, categories, isLoading }: Props) {
  const { formatPrice } = useCurrencyFormatter();
  const { upsertDish, replaceRecipe, createDishCategory, getProductionModeLabel } =
    useDishMutations();

  /**
   * Crée une catégorie et retourne son id, pour que le formulaire la
   * sélectionne aussitôt.
   *
   * ⚠️ `mutateAsync` et non `mutate` : le formulaire a besoin du RÉSULTAT pour
   * pré-sélectionner la catégorie créée. Le `catch` est indispensable —
   * `mutateAsync` rejette, et une promesse rejetée non capturée remonterait en
   * erreur non gérée. Le toast d'erreur est déjà émis par la mutation.
   */
  const handleCreateCategory = async (name: string): Promise<string | null> => {
    try {
      const created = await createDishCategory.mutateAsync({ name });
      return created.id;
    } catch {
      return null;
    }
  };

  const [modal, setModal] = useState<ModalMode>({ kind: 'none' });
  /** Tri par marge croissante — désactivé par défaut (ordre alphabétique). */
  const [sortByMargin, setSortByMargin] = useState(false);

  /**
   * ⚠️ Le plat ouvert en recette pilote DEUX queries à la demande.
   * `undefined` quand aucune recette n'est ouverte → aucune requête (la garde
   * `!!dishId` est dans les hooks).
   */
  const openRecipeDishId = modal.kind === 'recipe' ? modal.dish.id : undefined;

  const { data: recipe = [], isLoading: isLoadingRecipe } = useDishRecipe(barId, openRecipeDishId);
  const { data: cost, isLoading: isLoadingCost } = useDishCost(barId, openRecipeDishId);

  /**
   * ⭐ Coûts de TOUS les plats — UN appel, pas un par ligne.
   * C'est ce qui permet la marge sur chaque carte (§9) sans N+1.
   */
  const { data: allCosts = [] } = useAllDishCosts(barId);

  /** Index O(1) — évite un `find` par ligne rendue. */
  const costsByDishId = useMemo(() => {
    const map = new Map<string, DishCostSummary>();
    for (const c of allCosts) map.set(c.dish_id, c);
    return map;
  }, [allCosts]);

  /**
   * ⭐ Tri par marge CROISSANTE — les plats à problème remontent d'eux-mêmes.
   *
   * Ce n'est pas dans le §9, mais c'est ce qui transforme une liste en outil de
   * décision : la question du promoteur est « lequel me fait perdre de
   * l'argent ? », pas « quels plats ai-je ? ».
   *
   * ⚠️ Les plats SANS recette (`line_count === 0`) sont placés EN DERNIER et
   * non en tête : leur marge apparente est de 100 % — un artefact du coût
   * inconnu, pas une performance. Les trier avec les autres les ferait passer
   * pour les plus rentables.
   */
  const sortedDishes = useMemo(() => {
    if (!sortByMargin) return dishes;

    return [...dishes].sort((a, b) => {
      const ca = costsByDishId.get(a.id);
      const cb = costsByDishId.get(b.id);

      const aUnknown = !ca || ca.line_count === 0 || ca.margin_rate == null;
      const bUnknown = !cb || cb.line_count === 0 || cb.margin_rate == null;

      if (aUnknown && bUnknown) return a.name.localeCompare(b.name);
      if (aUnknown) return 1;
      if (bUnknown) return -1;

      return (ca.margin_rate as number) - (cb.margin_rate as number);
    });
  }, [dishes, costsByDishId, sortByMargin]);

  /**
   * ⭐ Toggle Dispo/Coupé — IMMÉDIAT, sans modale (§9).
   *
   * ⚠️ On renvoie le plat COMPLET et non un patch : `upsert_dish` remplace les
   * champs qu'il reçoit. N'envoyer que `is_available` effacerait la catégorie,
   * le temps de préparation et le rendement.
   *
   * ⭐ `photo_url` est volontairement OMIS — et c'est SÛR depuis
   * 20260803130000 : le RPC ne l'écrit que si la CLÉ est présente dans le
   * payload. Avant ce correctif, chaque bascule effaçait la photo du plat.
   * ⚠️ Ne pas « compléter » ce payload avec `photo_url: dish.photo_url` en
   * croyant bien faire : `DishRow.photo_url` peut être NULL, ce qui
   * réintroduirait l'effacement par un autre chemin.
   */
  const toggleAvailability = (dish: DishRow) => {
    upsertDish.mutate({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      category_id: dish.category_id,
      preparation_time_min: dish.preparation_time_min,
      is_batch_base: dish.is_batch_base,
      portions_per_batch: dish.portions_per_batch,
      is_available: !dish.is_available,
    });
  };

  const handleSaveDish = (dish: DishInput) => {
    upsertDish.mutate(dish, {
      onSuccess: () => setModal({ kind: 'none' }),
    });
  };

  const handleSaveRecipe = (lines: RecipeLineInput[]) => {
    if (modal.kind !== 'recipe') return;
    replaceRecipe.mutate(
      { dishId: modal.dish.id, lines },
      { onSuccess: () => setModal({ kind: 'none' }) }
    );
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {/* ⭐ Tri par marge — n'apparaît qu'à partir de 2 plats : trier une
            liste d'un seul élément serait un contrôle sans effet. */}
        {dishes.length > 1 ? (
          <button
            type="button"
            onClick={() => setSortByMargin((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption transition-all border',
              sortByMargin
                ? 'bg-card text-brand-primary border-brand-primary/40 shadow-sm font-semibold'
                : 'bg-card text-foreground/80 border-border hover:bg-accent font-medium'
            )}
            aria-pressed={sortByMargin}
          >
            <TrendingDown size={14} />
            <span>Marge faible d'abord</span>
          </button>
        ) : (
          <span />
        )}

        <Button size="sm" onClick={() => setModal({ kind: 'dish' })}>
          <Plus size={16} className="mr-1.5" />
          Nouveau plat
        </Button>
      </div>

      {dishes.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          message="Aucun plat"
          // ⭐ §13.12 — ne JAMAIS présenter un formulaire vide de 30 plats à
          // remplir. Le message oriente vers UN plat, et la valeur (coût,
          // marge) apparaît dès celui-là.
          subMessage="Commencez par un seul plat : sa marge s'affichera dès sa recette saisie."
          action={
            <Button onClick={() => setModal({ kind: 'dish' })}>
              <Plus size={16} className="mr-1.5" />
              Créer un plat
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sortedDishes.map((dish) => {
            const dishCost = costsByDishId.get(dish.id);
            // ⚠️ Une recette vide donne une marge de 100 % — artefact du coût
            // INCONNU, pas une performance. On n'affiche donc PAS de marge.
            const hasRecipe = !!dishCost && dishCost.line_count > 0;
            const marginIsLow =
              hasRecipe &&
              dishCost.margin_rate != null &&
              dishCost.margin_rate < LOW_MARGIN_THRESHOLD;

            return (
            <div
              key={dish.id}
              className={cn(
                'rounded-lg border bg-card p-3',
                dish.is_available ? 'border-border' : 'border-dashed border-border opacity-70'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{dish.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(dish.price)}
                    {' • '}
                    {getProductionModeLabel(dish.production_mode)}
                    {dish.preparation_time_min ? ` • ${dish.preparation_time_min} min` : ''}
                  </p>

                  {/* ⭐ §9 — LA MARGE EST L'ÉLÉMENT CENTRAL DE LA CARTE.
                      C'est le livrable de la phase 2 : « le promoteur découvre
                      la marge réelle de ses plats ». */}
                  {hasRecipe ? (
                    <p className="text-sm mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="text-muted-foreground">
                        coût {formatPrice(dishCost.total_cost)}
                      </span>
                      <span
                        className={cn(
                          'font-semibold',
                          marginIsLow
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-green-700 dark:text-green-400'
                        )}
                      >
                        marge{' '}
                        {dishCost.margin_rate != null ? `${dishCost.margin_rate} %` : '—'}
                      </span>
                      {marginIsLow && (
                        <AlertTriangle size={13} className="text-red-600 dark:text-red-400" />
                      )}
                      {/* ⚠️ Une marge approximative présentée comme exacte est
                          pire qu'une marge absente. */}
                      {dishCost.has_estimated_cost && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          (estimée)
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {dishCost.line_count} ingrédient{dishCost.line_count > 1 ? 's' : ''}
                      </span>
                    </p>
                  ) : (
                    // ⭐ §13.12 — ce qui reste à faire doit être VISIBLE : c'est
                    // le prochain geste utile, pas un manque à cacher.
                    <p className="text-sm mt-0.5 text-muted-foreground italic">
                      Recette non saisie — marge inconnue
                    </p>
                  )}
                </div>

                {/* ⭐ Toggle IMMÉDIAT (§9). Zone de tap ≥ 44px : mains humides. */}
                <button
                  type="button"
                  onClick={() => toggleAvailability(dish)}
                  disabled={upsertDish.isPending}
                  className={cn(
                    'h-11 px-3 rounded-md text-xs font-medium transition-colors flex-shrink-0',
                    dish.is_available
                      ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300'
                      : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300'
                  )}
                  aria-label={
                    dish.is_available
                      ? `Marquer ${dish.name} comme coupé`
                      : `Remettre ${dish.name} en service`
                  }
                >
                  {dish.is_available ? 'Dispo' : 'Coupé'}
                </button>
              </div>

              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ kind: 'dish', dish })}
                  className="flex-1"
                >
                  <Pencil size={14} className="mr-1.5" />
                  Modifier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModal({ kind: 'recipe', dish })}
                  className="flex-1"
                >
                  <ChefHat size={14} className="mr-1.5" />
                  Recette
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modal.kind === 'dish'}
        onClose={() => setModal({ kind: 'none' })}
        title={modal.kind === 'dish' && modal.dish ? 'Modifier le plat' : 'Nouveau plat'}
        size="default"
      >
        {modal.kind === 'dish' && (
          <DishForm
            dish={modal.dish}
            categories={categories}
            isSaving={upsertDish.isPending}
            onSave={handleSaveDish}
            onCancel={() => setModal({ kind: 'none' })}
            onCreateCategory={handleCreateCategory}
            isCreatingCategory={createDishCategory.isPending}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'recipe'}
        onClose={() => setModal({ kind: 'none' })}
        title={modal.kind === 'recipe' ? `Recette — ${modal.dish.name}` : 'Recette'}
        size="lg"
      >
        {modal.kind === 'recipe' && (
          <RecipeEditor
            dish={modal.dish}
            recipe={recipe}
            ingredients={ingredients}
            cost={cost}
            isLoadingCost={isLoadingCost || isLoadingRecipe}
            isSaving={replaceRecipe.isPending}
            onSave={handleSaveRecipe}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
      </Modal>
    </div>
  );
}
