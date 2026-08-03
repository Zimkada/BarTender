/**
 * DishForm
 * Création et modification d'un plat.
 *
 * ⭐⭐ §16.8 — DEUX CHOIX, PAS TROIS
 * Le plan est explicite : « La distinction batch / batch_finish N'A PAS À ÊTRE
 * DEMANDÉE : si la recette contient des ingrédients marqués
 * consumed_at_stage='finish', il y a une finition ; sinon, non. Le système le
 * DÉDUIT au lieu de l'exiger. »
 * Ce formulaire ne propose donc que « à la commande » ou « préparé d'avance ».
 * Le régime précis est dérivé par le serveur à l'enregistrement de la recette.
 *
 * ⚠️ Les libellés techniques (`on_order`, `batch_finish`) ne sortent JAMAIS
 * dans l'UI (§16.8 : « Libellés UI en langage clair, jamais le nom technique »).
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { DishRow, DishInput } from '../../services/supabase/dishes.service';

interface DishCategoryOption {
  id: string;
  name: string;
}

interface Props {
  /** `undefined` = création. */
  dish?: DishRow;
  categories: DishCategoryOption[];
  isSaving: boolean;
  onSave: (dish: DishInput) => void;
  onCancel: () => void;
}

export function DishForm({ dish, categories, isSaving, onSave, onCancel }: Props) {
  const [name, setName] = useState(dish?.name ?? '');
  const [price, setPrice] = useState<string>(dish ? String(dish.price) : '');
  const [categoryId, setCategoryId] = useState(dish?.category_id ?? '');
  const [prepTime, setPrepTime] = useState<string>(
    dish?.preparation_time_min ? String(dish.preparation_time_min) : ''
  );

  /**
   * ⭐ « Préparé d'avance » = `is_batch_base` (le plat produit un lot).
   * C'est le SEUL des deux axes que l'utilisateur déclare ; `production_mode`
   * est dérivé par le serveur.
   */
  const [preparedInAdvance, setPreparedInAdvance] = useState(dish?.is_batch_base ?? false);
  const [portions, setPortions] = useState<string>(
    dish?.portions_per_batch ? String(dish.portions_per_batch) : ''
  );

  const priceValue = parseFloat(price);
  const portionsValue = parseInt(portions, 10);

  /**
   * Validation en miroir des contraintes serveur — évite un aller-retour
   * réseau pour une erreur évidente. Le serveur reste la seule autorité.
   */
  const validationError = (() => {
    if (!name.trim()) return 'Le nom du plat est obligatoire';
    if (!price || Number.isNaN(priceValue) || priceValue < 0) {
      return 'Indiquez un prix de vente';
    }
    // ⚠️ Miroir de `dishes_batch_portions_coherence` : sans rendement, le coût
    // d'une portion serait une division par NULL, donc silencieusement nul.
    if (preparedInAdvance && (!portions || Number.isNaN(portionsValue) || portionsValue <= 0)) {
      return 'Indiquez combien de portions donne une préparation';
    }
    return null;
  })();

  const handleSubmit = () => {
    if (validationError) return;

    onSave({
      id: dish?.id,
      name: name.trim(),
      price: priceValue,
      category_id: categoryId || null,
      preparation_time_min: prepTime ? parseInt(prepTime, 10) : null,
      is_batch_base: preparedInAdvance,
      // ⚠️ `null` obligatoire quand le plat n'est pas préparé d'avance : la
      // contrainte SQL refuse un rendement sur un plat qui n'en produit pas.
      portions_per_batch: preparedInAdvance ? portionsValue : null,
      is_available: dish?.is_available ?? true,
    });
  };

  const inputClass =
    'w-full h-11 rounded-md border border-border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dish-name" className="block text-sm font-medium mb-1.5">
          Nom du plat
        </label>
        <input
          id="dish-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Poulet braisé"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dish-price" className="block text-sm font-medium mb-1.5">
            Prix de vente
          </label>
          <input
            id="dish-price"
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
            placeholder="2500"
          />
        </div>

        <div>
          <label htmlFor="dish-prep" className="block text-sm font-medium mb-1.5">
            Temps de préparation
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="dish-prep"
              type="number"
              inputMode="numeric"
              min={1}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              className={inputClass}
              placeholder="25"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="dish-category" className="block text-sm font-medium mb-1.5">
          Catégorie
        </label>
        <select
          id="dish-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          <option value="">Sans catégorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {categories.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Aucune catégorie de plats pour l'instant — vous pourrez en créer plus tard.
          </p>
        )}
      </div>

      {/* ⭐ §16.8 — DEUX choix seulement. Le troisième régime (batch_finish)
          est DÉDUIT de la recette par le serveur, jamais demandé ici. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1.5">Mode de préparation</legend>

        {[
          {
            value: false,
            label: 'Préparé à la commande',
            hint: 'Le plat est cuisiné quand le client le commande.',
          },
          {
            value: true,
            label: 'Préparé d\'avance',
            hint: 'Cuisiné en quantité, puis servi à la portion.',
          },
        ].map((option) => (
          <label
            key={String(option.value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              preparedInAdvance === option.value
                ? 'border-brand-primary bg-brand-subtle'
                : 'border-border hover:bg-accent'
            )}
          >
            <input
              type="radio"
              name="preparation-mode"
              checked={preparedInAdvance === option.value}
              onChange={() => setPreparedInAdvance(option.value)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {preparedInAdvance && (
        <div>
          <label htmlFor="dish-portions" className="block text-sm font-medium mb-1.5">
            Portions par préparation
          </label>
          <input
            id="dish-portions"
            type="number"
            inputMode="numeric"
            min={1}
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            className={inputClass}
            placeholder="20"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Combien d'assiettes donne une préparation ? Sert à calculer le coût d'une portion.
          </p>
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
          onClick={handleSubmit}
          className="flex-1"
          disabled={isSaving || !!validationError}
        >
          {isSaving ? 'Enregistrement…' : dish ? 'Enregistrer' : 'Créer le plat'}
        </Button>
      </div>
    </div>
  );
}
