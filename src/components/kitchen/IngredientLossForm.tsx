/**
 * IngredientLossForm
 * Déclarer une perte sur un lot d'ingrédient - partielle ou totale.
 *
 * ⭐⭐ CE QUE CET ÉCRAN RÉSOUT
 * « 2 kg sur 10 ont pourri, les 8 autres sont bons. » Sans lui, il fallait
 * choisir entre tout sortir du stock (perte surévaluée de 8 kg) ou ne rien
 * déclarer - et l'écart apparaissait à l'inventaire sans cause identifiable.
 *
 * ⭐⭐ L'UTILISATEUR CHOISIT LE LOT, arbitrage de l'exploitant (09/08/2026) :
 * > « c'est identifiable, et même dans le cas contraire, c'est mieux que
 * >   l'utilisateur choisisse le lot. »
 * Un prélèvement FEFO automatique aurait DEVINÉ l'origine. Or deux lots du
 * même ingrédient ont des coûts d'achat différents, et c'est celui du lot
 * réellement abîmé qui doit être valorisé.
 *
 * ⚠️ AUCUN MONTANT ici (§8) : on saisit des quantités. La valeur de la perte
 * est calculée par le serveur et n'est annoncée qu'à qui a
 * `canViewKitchenCosts`.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import { useIngredientLots } from '../../hooks/queries/useIngredientsQueries';
import type {
  DiscardReason,
  IngredientLotRow,
} from '../../services/supabase/ingredients.service';

export interface IngredientLossValues {
  lotId: string;
  qty: number;
  reason: DiscardReason;
}

interface Props {
  ingredientName: string;
  unit: string;
  /** Lots ACTIFS, déjà triés en FEFO par la query. */
  lots: IngredientLotRow[];
  onSubmit: (values: IngredientLossValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/**
 * ⭐ TROIS MOTIFS, et chacun désigne une CAUSE différente - donc un geste
 * correctif différent :
 *   · périmé  → acheté en trop grande quantité, ou trop tôt ;
 *   · abîmé   → problème de conservation (panne, chaleur, mauvais stockage) ;
 *   · casse   → accident ponctuel.
 *
 * ⚠️ `inventory_correction` n'est PAS proposé : ce n'est pas une perte
 * constatée mais un ajustement d'inventaire, qui relève d'un autre geste.
 * Le mêler ici rendrait la métrique « pertes » inexploitable.
 */
const MOTIFS: ReadonlyArray<{ value: DiscardReason; label: string; hint: string }> = [
  {
    value: 'expired',
    label: 'Périmé',
    hint: 'La date est dépassée, ou le produit n’est plus consommable.',
  },
  {
    value: 'spoiled',
    label: 'Abîmé',
    hint: 'Mal conservé - chaleur, humidité, panne de froid.',
  },
  {
    value: 'damaged',
    label: 'Casse',
    hint: 'Renversé, tombé, emballage percé.',
  },
];

/** Date lisible pour distinguer deux lots du même ingrédient. */
function formatLotDate(iso: string | null): string {
  if (!iso) return 'sans date';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function IngredientLossForm({
  ingredientName,
  unit,
  lots,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Props) {
  /**
   * ⭐ Le PREMIER lot est présélectionné : la query les trie en FEFO, donc
   * c'est celui qui périme le plus tôt - le plus probablement concerné.
   * ⚠️ Présélection, pas imposition : l'utilisateur peut en changer.
   */
  const [lotId, setLotId] = useState(lots[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<DiscardReason>('expired');

  const selectedLot = lots.find((l) => l.id === lotId);
  const maxQty = selectedLot?.remaining_qty ?? 0;

  /**
   * ⚠️ La virgule est acceptée : c'est ce que produit un clavier français, et
   * `parseFloat('0,5')` vaut 0. Même correction que l'éditeur de recette.
   */
  const qtyNum = (() => {
    const n = parseFloat(qty.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  })();

  const isValid = qty !== '' && qtyNum > 0 && qtyNum <= maxQty && lotId !== '';
  const tooMuch = qty !== '' && qtyNum > maxQty;
  const isTotal = qtyNum === maxQty && maxQty > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({ lotId, qty: qtyNum, reason });
  };

  if (lots.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-body-sm text-muted-foreground">
          Aucun lot en stock pour {ingredientName}. Il n’y a rien à déclarer.
        </p>
        <Button variant="outline" onClick={onCancel} className="w-full">
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ⭐ LE LOT D'ABORD : c'est lui qui détermine la quantité maximale ET
          le coût de la perte. Le demander après la quantité obligerait à
          ressaisir si le lot choisi en contient moins. */}
      <div>
        <label htmlFor="loss-lot" className="mb-1.5 block text-body-sm font-medium">
          Quel lot ?
        </label>
        <select
          id="loss-lot"
          value={lotId}
          onChange={(e) => {
            setLotId(e.target.value);
            // ⚠️ La quantité est REMISE À ZÉRO au changement de lot : une
            // saisie de 8 valide sur un lot de 10 ne l'est plus sur un lot
            // de 3, et laisser le champ rempli afficherait une erreur que
            // l'utilisateur n'a pas commise.
            setQty('');
          }}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-body-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        >
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {/* ⭐ Reçu le … + quantité : les deux repères qui distinguent
                  deux lots du même ingrédient à l'œil. */}
              {formatLotDate(lot.received_at)} - {lot.remaining_qty} {unit}
              {lot.expires_at ? ` (périme le ${formatLotDate(lot.expires_at)})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="loss-qty" className="mb-1.5 block text-body-sm font-medium">
          Quantité perdue
        </label>
        <div className="flex gap-2">
          <Input
            id="loss-qty"
            type="number"
            inputMode="decimal"
            min="0.001"
            max={maxQty}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="flex-1"
          />
          <span className="flex items-center text-body-sm text-muted-foreground">
            {unit}
          </span>
          {/* ⚠️ `ghost` : raccourci de saisie, pas l'action nominale. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQty(String(maxQty))}
            className="flex-shrink-0"
          >
            Tout
          </Button>
        </div>

        {tooMuch && (
          <p className="mt-1 text-caption text-red-600 dark:text-red-400">
            Ce lot ne contient que {maxQty} {unit}.
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
              name="ingredient-loss-reason"
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
          irréversible, et vider un lot le sort du stock. */}
      {isValid && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
          />
          <p className="text-caption text-amber-900 dark:text-amber-200">
            {isTotal
              ? `Tout le lot sera compté en perte, et il sortira du stock.`
              : `${qtyNum} ${unit} comptés en perte. Le lot continue avec ${Number((maxQty - qtyNum).toFixed(3))} ${unit}.`}
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

IngredientLossForm.displayName = 'IngredientLossForm';

/**
 * Conteneur qui CHARGE les lots de l'ingrédient.
 *
 * ⭐ Séparé du formulaire pour une raison précise : `useIngredientLots` ne doit
 * s'exécuter QUE lorsque la modale est ouverte. Appelé depuis la page, il
 * partirait pour chaque ingrédient de la liste - ou obligerait à un hook
 * conditionnel, interdit par React.
 *
 * ⚠️ `IngredientLossForm` reste PRÉSENTATIONNEL et testable seul : il reçoit
 * ses lots, il n'en cherche pas.
 */
export function IngredientLossFormLoader({
  barId,
  ingredientId,
  ingredientName,
  unit,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  barId: string | undefined;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  onSubmit: (values: IngredientLossValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}) {
  const { data: lots = [], isLoading } = useIngredientLots(barId, ingredientId);

  if (isLoading) {
    return (
      <p className="py-6 text-center text-caption text-muted-foreground">
        Chargement des lots…
      </p>
    );
  }

  return (
    <IngredientLossForm
      ingredientName={ingredientName}
      unit={unit}
      /**
       * ⛔ SEULS LES LOTS ACTIFS. Un lot déjà sorti a `remaining_qty = 0` et le
       * RPC le refuserait : le proposer ferait découvrir l'interdit APRÈS le
       * geste, par un message d'erreur.
       */
      lots={lots.filter((l) => l.status === 'active' && l.remaining_qty > 0)}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

IngredientLossFormLoader.displayName = 'IngredientLossFormLoader';
