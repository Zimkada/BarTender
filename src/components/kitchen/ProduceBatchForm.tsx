/**
 * ProduceBatchForm
 * Saisie d'un lot de production — §16.8, phase 3B.1.
 *
 * ⭐⭐ CE FORMULAIRE DÉCLENCHE UNE CONSOMMATION DE STOCK RÉELLE.
 * Valider sort la matière du stock ingrédients en FEFO et fige le coût du
 * lot. Ce n'est pas une saisie déclarative qu'on corrige ensuite : c'est un
 * mouvement comptable.
 * ⚠️ D'où le récapitulatif AVANT validation — le cuisinier doit voir ce qu'il
 * s'apprête à sortir, pas le découvrir après.
 */

import { useState, useMemo } from 'react';
import { ChefHat, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import type { DishRow } from '../../services/supabase/dishes.service';

export interface ProduceBatchValues {
  dishId: string;
  producedQty: number;
  expiresAt: string | null;
  notes: string | null;
}

interface Props {
  /** ⚠️ Uniquement les plats-BASES : eux seuls produisent un lot. */
  baseDishes: DishRow[];
  onSubmit: (values: ProduceBatchValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ProduceBatchForm({
  baseDishes,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Props) {
  const [dishId, setDishId] = useState('');
  const [qty, setQty] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const selectedDish = useMemo(
    () => baseDishes.find((d) => d.id === dishId),
    [baseDishes, dishId]
  );

  /**
   * ⭐ Le rendement de la fiche technique est proposé PAR DÉFAUT, jamais
   * imposé : un cuisinier qui braise 12 poulets au lieu des 20 prévus doit
   * pouvoir le saisir. Le coût sera divisé par ce qu'il a RÉELLEMENT produit.
   */
  const handleDishChange = (id: string) => {
    setDishId(id);
    const dish = baseDishes.find((d) => d.id === id);
    if (dish?.portions_per_batch) setQty(String(dish.portions_per_batch));
  };

  const qtyNum = Number(qty);
  const isValid = dishId !== '' && qtyNum > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({
      dishId,
      producedQty: qtyNum,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      notes: notes.trim() || null,
    });
  };

  if (baseDishes.length === 0) {
    return (
      <div className="space-y-4">
        {/* ⚠️ Message EXPLICITE plutôt qu'une liste vide : sans plat-base, ce
            n'est pas une erreur, c'est une étape manquante — et on dit
            laquelle. */}
        <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-center">
          <ChefHat size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-body-sm text-foreground/80">
            Aucun plat préparé d’avance
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            Pour produire un lot, un plat doit être marqué « préparé d’avance »
            avec un nombre de portions, dans l’écran Plats.
          </p>
        </div>
        <Button variant="outline" onClick={onCancel} className="w-full">
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="batch-dish" className="mb-1.5 block text-body-sm font-medium">
          Plat produit
        </label>
        <select
          id="batch-dish"
          value={dishId}
          onChange={(e) => handleDishChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-body-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          required
        >
          <option value="">Choisir un plat…</option>
          {baseDishes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="batch-qty" className="mb-1.5 block text-body-sm font-medium">
          Portions produites
        </label>
        <Input
          id="batch-qty"
          type="number"
          inputMode="decimal"
          min="0.001"
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="20"
          required
        />
        {/* ⭐ On explique POURQUOI le chiffre compte : sans cela, le cuisinier
            corrigerait rarement la valeur proposée. */}
        {selectedDish?.portions_per_batch != null && (
          <p className="mt-1 text-caption text-muted-foreground">
            Fiche technique : {selectedDish.portions_per_batch} portions.
            Corrigez si vous en avez fait plus ou moins — le coût sera divisé
            par ce que vous saisissez ici.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="batch-expires" className="mb-1.5 block text-body-sm font-medium">
          À consommer avant <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <Input
          id="batch-expires"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        {/* ⚠️ On dit franchement que la date ne ferme rien : sinon le
            cuisinier croirait que le lot se clôture tout seul et laisserait
            traîner des restes. */}
        <p className="mt-1 text-caption text-muted-foreground">
          Sert d’alerte. Le lot ne se ferme jamais tout seul — c’est vous qui
          décidez quand il est terminé.
        </p>
      </div>

      <div>
        <label htmlFor="batch-notes" className="mb-1.5 block text-body-sm font-medium">
          Note <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <Input
          id="batch-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Grande marmite, cuisson longue…"
        />
      </div>

      {/* ⭐⭐ AVERTISSEMENT AVANT VALIDATION — ce bouton sort de la matière. */}
      {isValid && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3',
            'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          )}
        >
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
          />
          <p className="text-caption text-amber-900 dark:text-amber-200">
            Les ingrédients de {selectedDish?.name} seront sortis du stock pour{' '}
            {qtyNum} portion{qtyNum > 1 ? 's' : ''}. Cette opération ne
            s’annule pas.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting} className="flex-1">
          {isSubmitting ? 'Production…' : 'Produire le lot'}
        </Button>
      </div>
    </form>
  );
}

ProduceBatchForm.displayName = 'ProduceBatchForm';
