/**
 * IngredientForm
 * Création et modification d'un ingrédient.
 *
 * ⭐ CE FORMULAIRE ÉTAIT LE CHAÎNON MANQUANT de la phase 1 : sans lui, aucun
 * ingrédient ne pouvait naître hors d'un INSERT manuel en SQL — donc pas
 * d'appro, pas de recette, pas de marge.
 *
 * ⭐⭐ POURQUOI IL N'Y A PAS DE VERSION « RAPIDE »
 * Un ingrédient n'est pas qu'un nom : `unit` conditionne toutes les quantités,
 * `cost_mode` décide s'il entre au coût du plat. Créer un ingrédient « à la
 * volée » avec un mode deviné produirait une marge FAUSSE sans aucun signal —
 * exactement le défaut que le §16.3 combat en remplaçant `is_transversal`.
 * Ce même formulaire sert donc partout, y compris en création depuis une
 * recette.
 */

import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type {
  IngredientRow,
  IngredientInput,
  IngredientCostMode,
} from '../../services/supabase/ingredients.service';

interface Props {
  /** `undefined` = création. */
  ingredient?: IngredientRow;
  isSaving: boolean;
  onSave: (ingredient: IngredientInput) => void;
  onCancel: () => void;
  /**
   * ⚠️ Nombre de lots/recettes utilisant cet ingrédient. > 0 fige l'unité :
   * les quantités enregistrées sont exprimées dedans, les convertir
   * fausserait stock et coûts d'un facteur 1000 (kg→g).
   * Le serveur refuse de toute façon — on l'indique AVANT la saisie plutôt
   * que de laisser l'utilisateur découvrir le refus après coup.
   */
  isUnitLocked?: boolean;
}

/**
 * §16.3 — les 4 modes, en LANGAGE CLAIR.
 *
 * ⚠️ Les noms techniques (`per_dish_flat`…) ne sortent JAMAIS dans l'UI. Le
 * libellé doit dire ce que le mode FAIT au coût du plat, puisque c'est la
 * seule conséquence visible pour l'utilisateur.
 */
const COST_MODES: ReadonlyArray<{
  value: IngredientCostMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'direct',
    label: 'Compté à la recette',
    hint: 'Décompté du stock selon la quantité de chaque plat (poulet, riz, poisson).',
  },
  {
    value: 'per_dish_flat',
    label: 'Forfait par plat',
    hint: 'Un montant fixe par plat, sans pesée (huile de friture, charbon, emballage).',
  },
  {
    value: 'global',
    label: 'Consommable général',
    hint: 'Suivi en stock avec alerte, mais n\'entre pas dans le coût d\'un plat (sel, gaz, eau).',
  },
  {
    value: 'cost_only',
    label: 'Coût seul, sans stock',
    hint: 'Entre dans le coût du plat mais n\'est pas suivi en quantité.',
  },
];

/** Unités courantes — la saisie libre reste possible. */
const COMMON_UNITS = ['kg', 'g', 'L', 'cL', 'pièce', 'sac', 'bidon', 'bouteille'];

export function IngredientForm({
  ingredient,
  isSaving,
  onSave,
  onCancel,
  isUnitLocked = false,
}: Props) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? '');
  const [costMode, setCostMode] = useState<IngredientCostMode>(
    ingredient?.cost_mode ?? 'direct'
  );
  const [flatCost, setFlatCost] = useState<string>(
    ingredient?.flat_cost_per_dish != null ? String(ingredient.flat_cost_per_dish) : ''
  );
  const [minAlert, setMinAlert] = useState<string>(
    ingredient?.min_stock_alert != null ? String(ingredient.min_stock_alert) : ''
  );

  const flatCostValue = parseFloat(flatCost);

  /**
   * Validation en miroir du RPC — évite un aller-retour réseau pour une erreur
   * évidente. Le serveur reste la seule autorité.
   */
  const validationError = (() => {
    if (!name.trim()) return 'Le nom de l\'ingrédient est obligatoire';
    if (!unit.trim()) return 'L\'unité est obligatoire (kg, L, pièce…)';
    // ⚠️ Miroir de `ingredients_flat_cost_coherence`. Sans forfait, l'ingrédient
    // entrerait au coût pour 0 F et la marge du plat serait fausse SANS signal.
    if (costMode === 'per_dish_flat' && (!flatCost || Number.isNaN(flatCostValue) || flatCostValue < 0)) {
      return 'Indiquez le coût forfaitaire par plat';
    }
    return null;
  })();

  const handleSubmit = () => {
    if (validationError || isSaving) return;

    onSave({
      id: ingredient?.id,
      name: name.trim(),
      unit: unit.trim(),
      cost_mode: costMode,
      // ⚠️ `null` hors per_dish_flat : la contrainte SQL refuse un forfait sur
      // un autre mode.
      flat_cost_per_dish: costMode === 'per_dish_flat' ? flatCostValue : null,
      min_stock_alert: minAlert ? parseFloat(minAlert) : null,
    });
  };

  const inputClass = 'w-full h-11 rounded-md border border-border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ing-name" className="block text-sm font-medium mb-1.5">
          Nom
        </label>
        <input
          id="ing-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Poulet, Riz, Huile…"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="ing-unit" className="block text-sm font-medium mb-1.5">
          Unité de suivi
        </label>
        <input
          id="ing-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className={cn(inputClass, isUnitLocked && 'opacity-60 cursor-not-allowed')}
          placeholder="kg"
          list="common-units"
          disabled={isUnitLocked}
        />
        <datalist id="common-units">
          {COMMON_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        {isUnitLocked ? (
          // ⭐ Expliquer AVANT la saisie plutôt que de laisser découvrir le
          // refus après coup. Le serveur refuse de toute façon.
          <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              L'unité ne peut plus changer : des stocks ou des recettes sont déjà
              enregistrés dans cette unité.
            </span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Celle dans laquelle vous comptez ce produit. Elle ne pourra plus
            changer une fois des stocks enregistrés.
          </p>
        )}
      </div>

      {/* ⭐ §16.3 — les 4 modes. C'est le champ le plus déterminant du
          formulaire : il décide si l'ingrédient entre au coût du plat. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1.5">Comment le compter ?</legend>

        {COST_MODES.map((mode) => (
          <label
            key={mode.value}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              costMode === mode.value
                ? 'border-brand-primary bg-brand-subtle'
                : 'border-border hover:bg-accent'
            )}
          >
            <input
              type="radio"
              name="cost-mode"
              checked={costMode === mode.value}
              onChange={() => setCostMode(mode.value)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{mode.label}</span>
              <span className="block text-xs text-muted-foreground">{mode.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {costMode === 'per_dish_flat' && (
        <div>
          <label htmlFor="ing-flat" className="block text-sm font-medium mb-1.5">
            Coût forfaitaire par plat
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="ing-flat"
              type="number"
              inputMode="numeric"
              min={0}
              value={flatCost}
              onChange={(e) => setFlatCost(e.target.value)}
              className={inputClass}
              placeholder="50"
            />
            <span className="text-sm text-muted-foreground">FCFA</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ce montant s'ajoutera au coût de chaque plat contenant cet ingrédient.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="ing-alert" className="block text-sm font-medium mb-1.5">
          Alerte de stock bas
          <span className="ml-1 font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="ing-alert"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={minAlert}
            onChange={(e) => setMinAlert(e.target.value)}
            className={inputClass}
            placeholder="5"
          />
          <span className="text-sm text-muted-foreground">{unit || '—'}</span>
        </div>
      </div>

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
          onClick={handleSubmit}
          className="flex-1"
          disabled={isSaving || !!validationError}
        >
          {isSaving ? 'Enregistrement…' : ingredient ? 'Enregistrer' : 'Créer l\'ingrédient'}
        </Button>
      </div>
    </div>
  );
}
