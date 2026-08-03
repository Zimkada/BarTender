/**
 * RecipeEditor
 * Éditeur de recette d'un plat — cœur de la phase 2.
 *
 * ⭐⭐ §13.12 — LA VALEUR DOIT APPARAÎTRE APRÈS LE PREMIER PLAT
 * « La saisie initiale est le principal risque d'abandon, pas la technique.
 *   30 plats × 8 ingrédients = 240 saisies avant la première information utile. »
 * D'où le parti pris central de cet écran : le coût et la marge sont affichés
 * EN HAUT, en permanence, et se mettent à jour dès l'enregistrement. Le
 * cuisinier voit ce que son travail produit sans attendre la 30e recette.
 *
 * ⚠️ Le coût vient du SERVEUR (`calculate_dish_cost`, simulation FEFO). Il n'est
 * jamais recalculé ici : deux implémentations de la même règle divergeraient,
 * et c'est leur ÉCART qui est la métrique clé du module (§8).
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../common/EmptyState';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { cn } from '../../lib/utils';
import type {
  DishRow,
  DishIngredientRow,
  RecipeLineInput,
  ConsumedAtStage,
  DishCostResult,
} from '../../services/supabase/dishes.service';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

/**
 * Seuil d'alerte de marge (§9 : « la marge est l'élément central de la carte,
 * avec seuil d'alerte »).
 *
 * ⚠️ 25 % est une valeur de départ, pas une vérité comptable. Elle signale
 * « regardez ce plat », elle ne dit pas « ce plat est mauvais » : un plat
 * d'appel à faible marge peut être délibéré.
 */
const LOW_MARGIN_THRESHOLD = 25;

interface RecipeLineDraft extends RecipeLineInput {
  /** Clé de rendu stable — l'ingredient_id ne l'est pas (il peut être vide). */
  key: string;
}

interface Props {
  dish: DishRow;
  /** Recette actuelle, chargée à la demande. */
  recipe: DishIngredientRow[];
  /** Ingrédients du bar, déjà en cache via le pivot cuisine. */
  ingredients: IngredientWithAlerts[];
  /** Coût serveur du plat. `undefined` tant qu'il n'est pas chargé. */
  cost?: DishCostResult;
  isLoadingCost: boolean;
  isSaving: boolean;
  onSave: (lines: RecipeLineInput[]) => void;
  onCancel: () => void;
}

let draftCounter = 0;
const nextKey = () => `line-${++draftCounter}`;

export function RecipeEditor({
  dish,
  recipe,
  ingredients,
  cost,
  isLoadingCost,
  isSaving,
  onSave,
  onCancel,
}: Props) {
  const { formatPrice } = useCurrencyFormatter();

  const [lines, setLines] = useState<RecipeLineDraft[]>([]);

  /**
   * ⚠️ Synchronise le brouillon sur la recette chargée.
   *
   * Dépend de `recipe` seul : ajouter `lines` créerait une boucle (setLines
   * déclenche l'effet qui rappelle setLines). L'utilisateur qui modifie son
   * brouillon ne doit PAS le voir écrasé par un refetch en arrière-plan.
   */
  useEffect(() => {
    setLines(
      recipe.map((r) => ({
        key: nextKey(),
        ingredient_id: r.ingredient_id,
        quantity: r.quantity,
        yield_factor: r.yield_factor,
        is_optional: r.is_optional,
        consumed_at_stage: r.consumed_at_stage,
      }))
    );
  }, [recipe]);

  /** Index O(1) — évite un `find` par ligne rendue. */
  const ingredientsById = useMemo(() => {
    const map = new Map<string, IngredientWithAlerts>();
    for (const i of ingredients) map.set(i.id, i);
    return map;
  }, [ingredients]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        ingredient_id: '',
        quantity: 0,
        yield_factor: 1,
        is_optional: false,
        consumed_at_stage: 'batch',
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<RecipeLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  /**
   * ⭐ Validation LOCALE, en miroir de celle du serveur.
   *
   * ⚠️ Elle ne REMPLACE pas la validation serveur (qui reste la seule
   * autorité) : elle évite un aller-retour réseau pour une erreur évidente.
   * Le doublon est vérifié sur le TRIPLET, comme l'index unique en base — le
   * même ingrédient à deux stades différents reste légitime (huile à la
   * cuisson ET à la finition).
   */
  const validationError = useMemo(() => {
    const seen = new Set<string>();

    for (const line of lines) {
      if (!line.ingredient_id) return 'Chaque ligne doit désigner un ingrédient';
      if (!line.quantity || line.quantity <= 0) {
        const name = ingredientsById.get(line.ingredient_id)?.name ?? 'un ingrédient';
        return `Indiquez une quantité pour ${name}`;
      }

      const key = `${line.ingredient_id}|${line.consumed_at_stage ?? 'batch'}`;
      if (seen.has(key)) {
        const name = ingredientsById.get(line.ingredient_id)?.name ?? 'Un ingrédient';
        return `${name} apparaît deux fois au même stade — regroupez les quantités`;
      }
      seen.add(key);
    }

    return null;
  }, [lines, ingredientsById]);

  const handleSave = () => {
    if (validationError) return;
    onSave(
      lines.map(({ key: _key, ...line }) => line)
    );
  };

  /** Le plat produit-il un lot ? Conditionne l'affichage du stade. */
  const showStageSelector = dish.is_batch_base;

  const marginIsLow =
    cost?.margin_rate != null && cost.margin_rate < LOW_MARGIN_THRESHOLD;

  return (
    <div className="space-y-4">
      {/* ⭐ §13.12 — LA VALEUR D'ABORD. Coût et marge en tête, jamais en bas :
          le cuisinier doit voir ce que sa saisie produit. */}
      <div
        className={cn(
          'rounded-xl border p-4',
          marginIsLow
            ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
            : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
        )}
      >
        {isLoadingCost ? (
          <p className="text-sm text-muted-foreground">Calcul du coût…</p>
        ) : cost ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-sm text-muted-foreground">
                Prix {formatPrice(cost.price)}
              </span>
              <span className="text-sm text-muted-foreground">
                Coût {formatPrice(cost.total_cost)}
              </span>
              <span
                className={cn(
                  'text-lg font-bold',
                  marginIsLow ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'
                )}
              >
                {/* ⚠️ `margin_rate` est NULL si le prix est 0 (plat offert) :
                    un taux n'a alors aucun sens mathématique. Afficher « — »
                    plutôt que 0 %, qui laisserait croire à une marge nulle. */}
                Marge {cost.margin_rate != null ? `${cost.margin_rate} %` : '—'}
              </span>
              {marginIsLow && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
                  <AlertTriangle size={14} />
                  Marge faible
                </span>
              )}
            </div>

            {/* ⭐ Une marge approximative présentée comme exacte est PIRE
                qu'une marge absente. Le signal est obligatoire, pas décoratif. */}
            {cost.has_estimated_cost && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Coût estimé : stock ou prix manquant pour{' '}
                  {cost.estimated_reason?.join(', ') ?? 'certains ingrédients'}.
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp size={16} />
            Ajoutez des ingrédients pour connaître le coût de ce plat.
          </p>
        )}
      </div>

      {/* ── Lignes de recette ── */}
      {lines.length === 0 ? (
        <EmptyState
          icon={Plus}
          message="Aucun ingrédient"
          subMessage="Ajoutez les ingrédients de ce plat pour connaître sa marge."
          action={
            <Button onClick={addLine}>
              <Plus size={16} className="mr-1.5" />
              Ajouter un ingrédient
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {lines.map((line) => {
            const ingredient = ingredientsById.get(line.ingredient_id);

            return (
              <div
                key={line.key}
                className="rounded-lg border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <select
                    value={line.ingredient_id}
                    onChange={(e) => updateLine(line.key, { ingredient_id: e.target.value })}
                    className="flex-1 min-w-0 h-10 rounded-md border border-border bg-background px-2 text-sm"
                    aria-label="Ingrédient"
                  >
                    <option value="">Choisir un ingrédient…</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>

                  {/* ⚠️ Zone de tap ≥ 44px (§9) : mains humides ou grasses. */}
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                    aria-label="Retirer cet ingrédient"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={line.quantity || ''}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: parseFloat(e.target.value) || 0 })
                      }
                      className="h-10 w-24 rounded-md border border-border bg-background px-2 text-sm"
                      aria-label="Quantité"
                      placeholder="Qté"
                    />
                    <span className="text-sm text-muted-foreground">
                      {ingredient?.unit ?? ''}
                    </span>
                  </div>

                  {/* ⭐ Rendement — le champ le plus mal compris de l'écran, d'où
                      le libellé en pourcentage de PERTE plutôt qu'en facteur :
                      « 20 % de perte » parle, « 0.8 » non. */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={
                        line.yield_factor != null
                          ? Math.round((1 - line.yield_factor) * 100)
                          : 0
                      }
                      onChange={(e) => {
                        const lossPct = Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0));
                        updateLine(line.key, { yield_factor: 1 - lossPct / 100 });
                      }}
                      className="h-10 w-20 rounded-md border border-border bg-background px-2 text-sm"
                      aria-label="Pourcentage de perte à la préparation"
                    />
                    <span className="text-sm text-muted-foreground">% perte</span>
                  </div>

                  {/* Le stade n'a de sens que si le plat produit un lot. */}
                  {showStageSelector && (
                    <select
                      value={line.consumed_at_stage ?? 'batch'}
                      onChange={(e) =>
                        updateLine(line.key, {
                          consumed_at_stage: e.target.value as ConsumedAtStage,
                        })
                      }
                      className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                      aria-label="Moment de consommation"
                    >
                      <option value="batch">À la cuisson</option>
                      <option value="finish">À l'assiette</option>
                    </select>
                  )}

                  <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={line.is_optional ?? false}
                      onChange={(e) => updateLine(line.key, { is_optional: e.target.checked })}
                      className="h-4 w-4 accent-brand"
                    />
                    Facultatif
                  </label>
                </div>
              </div>
            );
          })}

          <Button variant="outline" onClick={addLine} className="w-full">
            <Plus size={16} className="mr-1.5" />
            Ajouter un ingrédient
          </Button>
        </div>
      )}

      {validationError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle size={15} />
          {validationError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isSaving}>
          Annuler
        </Button>
        <Button
          onClick={handleSave}
          className="flex-1"
          disabled={isSaving || !!validationError}
        >
          {isSaving ? 'Enregistrement…' : 'Enregistrer la recette'}
        </Button>
      </div>
    </div>
  );
}
