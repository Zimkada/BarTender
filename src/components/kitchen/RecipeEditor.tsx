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

import { useState, useEffect, useMemo, useRef } from 'react';
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
import type { IngredientWithAlerts, } from '../../hooks/pivots/useUnifiedKitchen';
import type { IngredientInput } from '../../services/supabase/ingredients.service';
import { IngredientForm } from './IngredientForm';

/**
 * Seuil d'alerte de marge (§9 : « la marge est l'élément central de la carte,
 * avec seuil d'alerte »).
 *
 * ⚠️ 25 % est une valeur de départ, pas une vérité comptable. Elle signale
 * « regardez ce plat », elle ne dit pas « ce plat est mauvais » : un plat
 * d'appel à faible marge peut être délibéré.
 *
 * ⭐ EXPORTÉ et consommé par `DishesTab` : deux constantes séparées
 * finiraient par diverger, et la liste alerterait sur des plats que la recette
 * juge sains — ou l'inverse.
 */
export const LOW_MARGIN_THRESHOLD = 25;

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
  /**
   * ⭐ Création d'ingrédient EN LIGNE — §13.12.
   *
   * « La saisie initiale est le principal risque d'abandon. » Un cuisinier qui
   * découvre au milieu de sa recette qu'il lui manque « piment » ne doit pas
   * avoir à tout abandonner pour aller le créer ailleurs.
   *
   * ⚠️ Le formulaire ouvert est le MÊME que celui de l'écran Ingrédients, pas
   * une version « rapide » : `unit` et `cost_mode` conditionnent le coût du
   * plat. Un ingrédient créé sans eux produirait une marge fausse sans signal.
   *
   * Retourne l'id créé pour que la ligne en cours le sélectionne aussitôt.
   */
  onCreateIngredient: (ingredient: IngredientInput) => Promise<string | null>;
  isCreatingIngredient: boolean;
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
  onCreateIngredient,
  isCreatingIngredient,
}: Props) {
  const { formatPrice } = useCurrencyFormatter();

  const [lines, setLines] = useState<RecipeLineDraft[]>([]);

  /**
   * Clé de la ligne qui a demandé un nouvel ingrédient — `null` si le
   * formulaire est fermé.
   *
   * ⚠️ On mémorise la LIGNE et non un simple booléen : l'ingrédient créé doit
   * être affecté à la ligne qui l'a demandé, pas à la dernière ni à la
   * première. Avec plusieurs lignes vides, un booléen se tromperait de cible.
   */
  const [creatingForLine, setCreatingForLine] = useState<string | null>(null);

  /**
   * ⚠️⚠️ Le brouillon est initialisé UNE SEULE FOIS par plat.
   *
   * Défaut trouvé à la code review : dépendre de `recipe` (le tableau de React
   * Query) faisait ÉCRASER LA SAISIE EN COURS à chaque refetch en arrière-plan
   * — expiration du staleTime, retour de focus sur la fenêtre, invalidation
   * déclenchée par une autre mutation. Le cuisinier perdait sa recette en
   * train d'être écrite, sans avoir rien fait.
   *
   * ⭐ Le ref mémorise le plat déjà initialisé : les rafraîchissements
   * ultérieurs du MÊME plat ne touchent plus au brouillon, tandis qu'ouvrir un
   * AUTRE plat le recharge. `recipe` peut donc rester dans les dépendances
   * (première valeur utile à l'arrivée des données) sans effet destructeur.
   */
  const initializedForDishId = useRef<string | null>(null);

  useEffect(() => {
    // Attendre les données : initialiser sur un tableau vide figerait le
    // brouillon avant l'arrivée de la recette réelle.
    if (isLoadingCost && recipe.length === 0) return;
    if (initializedForDishId.current === dish.id) return;

    initializedForDishId.current = dish.id;
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
  }, [dish.id, recipe, isLoadingCost]);

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
    // ⚠️ Si la ligne supprimée attendait un ingrédient, refermer le formulaire :
    // il n'aurait plus de cible à qui affecter la création.
    if (creatingForLine === key) setCreatingForLine(null);
  };

  const handleCreateIngredient = async (values: IngredientInput) => {
    const lineKey = creatingForLine;
    if (!lineKey) return;

    const createdId = await onCreateIngredient(values);

    // ⚠️ En cas d'échec (nom déjà pris), le formulaire RESTE ouvert avec sa
    // saisie : l'utilisateur corrige au lieu de tout retaper. Le toast d'erreur
    // vient de la mutation.
    if (createdId) {
      updateLine(lineKey, { ingredient_id: createdId });
      setCreatingForLine(null);
    }
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

  /**
   * ⭐⭐ COÛT NUL ≠ COÛT CONNU (signalé en test terrain le 04/08/2026).
   *
   * Un plat dont aucun ingrédient n'a de prix connu renvoie `total_cost = 0`,
   * donc une marge de 100 %. Affiché en VERT, cela se lit « plat très
   * rentable » — la lecture exactement inverse de la réalité, qui est
   * « je ne sais pas encore ce que ce plat coûte ».
   *
   * ⚠️ Un plat réellement gratuit à produire n'existe pas : tout ce qui
   * compose une assiette a été acheté. Un coût à 0 signale donc TOUJOURS une
   * donnée manquante, jamais une bonne nouvelle.
   *
   * ⚠️ Distinct de `has_estimated_cost`, qui couvre les lacunes PARTIELLES
   * (un ingrédient sur trois sans stock). Ici, il n'y a rien du tout.
   */
  const costIsUnknown = cost != null && cost.total_cost === 0;

  return (
    <div className="space-y-4">
      {/* ⭐ §13.12 — LA VALEUR D'ABORD. Coût et marge en tête, jamais en bas :
          le cuisinier doit voir ce que sa saisie produit. */}
      <div
        className={cn(
          'rounded-xl border p-4',
          // ⚠️ NEUTRE quand le coût est inconnu : ni vert (« tout va bien »)
          // ni rouge (« problème de marge »). On ne sait simplement pas.
          costIsUnknown
            ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
            : marginIsLow
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
        )}
      >
        {isLoadingCost ? (
          <p className="text-sm text-muted-foreground">Calcul du coût…</p>
        ) : costIsUnknown ? (
          /* ⭐ Dire « je ne sais pas » plutôt qu'afficher une marge flatteuse
             et fausse. Le message indique AUSSI quoi faire — un constat sans
             action laisse le promoteur devant un écran qui l'accuse. */
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Coût inconnu pour l'instant</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Prix de vente {formatPrice(cost.price)}. La marge s'affichera dès
                qu'un approvisionnement aura donné un prix aux ingrédients de ce
                plat.
              </p>
            </div>
          </div>
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

                  {/* ⭐ §13.12 — créer l'ingrédient SANS quitter la recette.
                      Le cuisinier qui découvre qu'il lui manque « piment » ne
                      doit pas abandonner sa saisie pour aller le créer.
                      ⚠️ Masqué si la ligne a déjà un ingrédient : le bouton
                      n'aurait plus de sens. */}
                  {!line.ingredient_id && (
                    <button
                      type="button"
                      onClick={() =>
                        setCreatingForLine(creatingForLine === line.key ? null : line.key)
                      }
                      className={cn(
                        'h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-md border transition-colors',
                        creatingForLine === line.key
                          ? 'border-brand-primary bg-brand-subtle text-brand-primary'
                          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                      aria-label="Créer un nouvel ingrédient"
                      aria-expanded={creatingForLine === line.key}
                      title="Nouvel ingrédient"
                    >
                      <Plus size={18} />
                    </button>
                  )}

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

                {/* ⭐ Formulaire EN LIGNE, jamais une seconde modale.
                    `RecipeEditor` vit DÉJÀ dans une modale (z-[1000] fixe, avec
                    focus trap) : en imbriquer une seconde ferait se superposer
                    deux couches au même niveau, et les deux focus traps se
                    disputeraient le clavier.
                    ⚠️ C'est le MÊME formulaire que l'écran Ingrédients, pas une
                    version « rapide » : `unit` et `cost_mode` conditionnent le
                    coût du plat. */}
                {creatingForLine === line.key && (
                  <div
                    className="mt-3 pt-3 border-t border-border"
                    onKeyDown={(e) => {
                      // ⚠️⚠️ `Modal` écoute Escape sur `document` SANS filtrer la
                      // cible. Sans stopPropagation, Échap fermerait TOUTE la
                      // modale de recette : l'utilisateur perdrait à la fois sa
                      // saisie d'ingrédient (6 champs) ET son brouillon de
                      // recette — pour un geste qui ne devait fermer qu'un
                      // sous-formulaire.
                      // ⭐ Même défaut trouvé ce matin sur la création de
                      // catégorie ; le contexte est ici plus coûteux.
                      // ⚠️ Placé sur le CONTENEUR et non dans IngredientForm :
                      // celui-ci sert aussi hors modale (écran Ingrédients), où
                      // il ne doit rien intercepter.
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setCreatingForLine(null);
                      }
                    }}
                  >
                    <p className="text-sm font-medium mb-3">Nouvel ingrédient</p>
                    <IngredientForm
                      isSaving={isCreatingIngredient}
                      onSave={handleCreateIngredient}
                      onCancel={() => setCreatingForLine(null)}
                    />
                  </div>
                )}
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
