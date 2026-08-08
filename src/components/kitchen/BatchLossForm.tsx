/**
 * BatchLossForm
 * Déclarer une perte sur un lot - partielle ou totale.
 *
 * ⭐⭐ CE QUE CET ÉCRAN RÉSOUT
 * « Des éléments du lot expirés avant, et non déclarer tout le stock restant
 * expiré » : 4 portions ont tourné, les 10 autres sont bonnes. Sans lui, il
 * fallait choisir entre tout jeter (perte surévaluée) ou ne rien déclarer
 * (perte invisible, écart constaté plus tard sans cause identifiable).
 *
 * ⭐ DEUX MOTIFS, PAS UN. Ils n'appellent pas le même geste correctif :
 *   · JETÉ (invendu)  → on a produit TROP     → ajuster le volume ;
 *   · PÉRIMÉ          → on a produit TROP TÔT → ajuster le moment.
 * Les fondre en un seul masquerait lequel corriger.
 *
 * ⚠️ AUCUN MONTANT ici (§8) : le cuisinier saisit des portions. La valeur de
 * la perte est retournée par le serveur et affichée dans le toast, seulement
 * à qui a `canViewKitchenCosts`.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';

/** ⭐ Le motif détermine le statut si la perte vide le lot. */
export type LossReason = 'discarded' | 'expired';

export interface BatchLossValues {
  qty: number;
  reason: LossReason;
}

interface Props {
  dishName: string;
  /** Portions restantes - borne haute de la saisie. */
  remainingQty: number;
  onSubmit: (values: BatchLossValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const MOTIFS: ReadonlyArray<{ value: LossReason; label: string; hint: string }> = [
  {
    value: 'expired',
    label: 'Périmé',
    hint: 'Le plat a tourné, il n’est plus consommable.',
  },
  {
    value: 'discarded',
    label: 'Invendu',
    hint: 'Encore bon, mais personne ne l’a commandé.',
  },
];

export function BatchLossForm({
  dishName,
  remainingQty,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Props) {
  const [qty, setQty] = useState('');
  /**
   * ⚠️ `expired` par défaut : c'est le motif qui amène le plus souvent à
   * déclarer une perte PARTIELLE en cours de service. Un invendu se constate
   * plutôt en fin de journée, sur le lot entier.
   */
  const [reason, setReason] = useState<LossReason>('expired');

  const qtyNum = Number(qty);
  const isValid = qty !== '' && qtyNum > 0 && qtyNum <= remainingQty;
  /** ⚠️ Message distinct du simple « invalide » : dire CE QUI cloche. */
  const tooMuch = qty !== '' && qtyNum > remainingQty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({ qty: qtyNum, reason });
  };

  /** ⭐ Tout déclarer perdu est un cas courant : un raccourci évite la saisie. */
  const isTotal = qtyNum === remainingQty;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-caption text-muted-foreground">
        {dishName} - {remainingQty} portion{remainingQty > 1 ? 's' : ''} en stock.
      </p>

      <div>
        <label htmlFor="loss-qty" className="mb-1.5 block text-body-sm font-medium">
          Portions perdues
        </label>
        <div className="flex gap-2">
          <Input
            id="loss-qty"
            type="number"
            inputMode="decimal"
            min="0.001"
            max={remainingQty}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="flex-1"
          />
          {/* ⚠️ `ghost` : c'est un raccourci de saisie, pas l'action nominale. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQty(String(remainingQty))}
            className="flex-shrink-0"
          >
            Tout ({remainingQty})
          </Button>
        </div>

        {tooMuch && (
          <p className="mt-1 text-caption text-red-600 dark:text-red-400">
            Il ne reste que {remainingQty} portion{remainingQty > 1 ? 's' : ''}.
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-body-sm font-medium">Motif</legend>
        {MOTIFS.map((m) => (
          <label
            key={m.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              reason === m.value
                ? 'border-brand-primary bg-brand-subtle'
                : 'border-border hover:bg-accent'
            )}
          >
            <input
              type="radio"
              name="loss-reason"
              checked={reason === m.value}
              onChange={() => setReason(m.value)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-medium">{m.label}</span>
              <span className="block text-caption text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* ⭐ On annonce la CONSÉQUENCE avant le geste : une perte est
          irréversible, et déclarer tout le reste clôture le lot. */}
      {isValid && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
          />
          <p className="text-caption text-amber-900 dark:text-amber-200">
            {isTotal
              ? 'Tout le reste sera compté en perte, et le lot sera épuisé.'
              : `${qtyNum} portion${qtyNum > 1 ? 's' : ''} comptée${qtyNum > 1 ? 's' : ''} en perte. Le lot continue avec ${remainingQty - qtyNum}.`}
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting} className="flex-1">
          {isSubmitting ? 'Enregistrement…' : 'Déclarer la perte'}
        </Button>
      </div>
    </form>
  );
}

BatchLossForm.displayName = 'BatchLossForm';
