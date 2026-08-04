/**
 * SupplyForm
 * Saisie d'un approvisionnement d'ingrédient.
 *
 * ⭐ DEUX POINTS PORTENT LA VALEUR DE CE FORMULAIRE :
 *
 * 1. La CLÉ D'IDEMPOTENCE est fixée à l'OUVERTURE, pas à la soumission.
 *    Générée au clic, chaque double-clic produirait sa propre clé — donc deux
 *    lots, un stock doublé et une marge fausse, SANS aucune erreur visible.
 *    C'est la limite documentée dans useIngredientMutations.
 *
 * 2. La saisie se fait au CONDITIONNEMENT (§16.6 appliqué à l'appro).
 *    Le promoteur achète « 2 sacs de 25 kg à 12 000 F le sac ». Lui demander
 *    un prix au kilo l'obligerait à diviser de tête à chaque livraison —
 *    donc à arrondir, donc à fausser le coût matière que le module promet
 *    d'être juste. La conversion est faite ici, une fois, sans arrondi.
 */

import { useState, useMemo, useEffect } from 'react';
import { Package, Calendar, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { generateUUID } from '../../utils/crypto';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

export interface SupplyFormValues {
  ingredientId: string;
  qty: number;
  unitCost: number;
  expiresAt?: string;
  notes?: string;
  idempotencyKey: string;
}

interface SupplyFormProps {
  ingredients: IngredientWithAlerts[];
  onSubmit: (values: SupplyFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /** Pré-sélection depuis une alerte de stock bas. */
  initialIngredientId?: string;
  /**
   * Incrémenter cette valeur APRÈS un enregistrement confirmé : nouvelle clé
   * d'idempotence + formulaire ENTIÈREMENT vidé, ingrédient compris.
   *
   * ⭐ Le formulaire vide est le SIGNAL DE RÉUSSITE. Des champs encore
   * remplis se lisent comme un échec et provoquent un second envoi — qui
   * créerait un vrai second lot, la clé ayant été renouvelée (04/08/2026).
   *
   * ⚠️ NE PAS incrémenter sur ERREUR : la modale doit alors garder la MÊME
   * clé pour que le retry soit reconnu comme un rejeu.
   */
  resetSignal?: number;
}

export function SupplyForm({
  ingredients,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialIngredientId,
  resetSignal,
}: SupplyFormProps) {
  const { formatPrice } = useCurrencyFormatter();

  const [ingredientId, setIngredientId] = useState(initialIngredientId ?? '');
  /** Nombre de conditionnements reçus (sacs, cartons, bidons…). */
  const [packageCount, setPackageCount] = useState('1');
  /** Contenu d'un conditionnement, dans l'unité de stock de l'ingrédient. */
  const [packageSize, setPackageSize] = useState('');
  /** Prix payé pour UN conditionnement. */
  const [packagePrice, setPackagePrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  /**
   * ⭐ Clé fixée à l'ouverture et STABLE pour toute la durée du formulaire.
   * `useState` avec initialiseur paresseux : elle n'est générée qu'une fois,
   * même si le composant re-rend. Un double-clic sur « Enregistrer » enverra
   * donc DEUX FOIS LA MÊME CLÉ — le RPC reconnaîtra le rejeu et ne créera
   * qu'un seul lot.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateUUID());

  const selected = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId]
  );

  /**
   * Pré-remplit la taille du conditionnement au changement d'ingrédient.
   * ⚠️ Sans cela, l'utilisateur devrait ressaisir « 25 » à chaque livraison de
   * riz — la friction la plus sûre pour qu'un module de stock soit abandonné.
   */
  useEffect(() => {
    if (!selected) return;
    setPackageSize((current) => (current === '' ? '1' : current));
  }, [selected]);

  /**
   * Prépare une seconde livraison après un enregistrement CONFIRMÉ.
   *
   * ⚠️ Nouvelle clé d'idempotence : sans elle, le second appro serait vu comme
   * un rejeu du premier et silencieusement ignoré par le RPC.
   * L'ingrédient sélectionné est CONSERVÉ — on enchaîne souvent plusieurs
   * livraisons du même produit.
   */
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === 0) return;
    setIdempotencyKey(generateUUID());
    // ⭐⭐ REMISE À ZÉRO COMPLÈTE, y compris l'ingrédient et le
    //    conditionnement — décision du 04/08/2026.
    //
    // ⚠️ Un formulaire qui reste rempli après validation ne dit pas « c'est
    // enregistré » : il dit « rien ne s'est passé ». Le geste naturel est de
    // re-cliquer — et comme la clé d'idempotence vient d'être RENOUVELÉE, ce
    // second envoi crée un VRAI second lot. Le stock doublerait sans aucun
    // message d'erreur.
    //
    // ⚠️ La garde d'idempotence ne couvre QUE le retry d'une opération
    // échouée (même clé conservée, cf. `onSuccess` de la page). Elle
    // n'a jamais protégé du renvoi APRÈS succès.
    //
    // Le champ vide est donc le signal de réussite : il n'y a plus rien à
    // envoyer. Coût assumé : re-sélectionner l'ingrédient pour une seconde
    // livraison du même produit — un clic contre un stock faux.
    setIngredientId('');
    setPackageSize('');
    setPackageCount('1');
    setPackagePrice('');
    setExpiresAt('');
    setNotes('');
  }, [resetSignal]);

  // ===== Conversion — le cœur du formulaire =====

  const qtyTotal = useMemo(() => {
    const count = parseFloat(packageCount);
    const size = parseFloat(packageSize);
    if (!Number.isFinite(count) || !Number.isFinite(size)) return 0;
    return count * size;
  }, [packageCount, packageSize]);

  const unitCost = useMemo(() => {
    const price = parseFloat(packagePrice);
    const size = parseFloat(packageSize);
    // ⚠️ Division par zéro : une taille de conditionnement à 0 n'a pas de sens
    // et produirait Infinity, qui remonterait jusqu'au RPC.
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return 0;
    return price / size;
  }, [packagePrice, packageSize]);

  const totalCost = useMemo(() => {
    const count = parseFloat(packageCount);
    const price = parseFloat(packagePrice);
    if (!Number.isFinite(count) || !Number.isFinite(price)) return 0;
    return count * price;
  }, [packageCount, packagePrice]);

  // ===== Validation =====

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!ingredientId) list.push('Sélectionnez un ingrédient');
    if (qtyTotal <= 0) list.push('La quantité doit être supérieure à 0');
    if (parseFloat(packagePrice) < 0) list.push('Le prix ne peut pas être négatif');
    if (parseFloat(packageSize) <= 0) list.push('Le conditionnement doit être supérieur à 0');
    return list;
  }, [ingredientId, qtyTotal, packagePrice, packageSize]);

  const canSubmit = errors.length === 0 && !isSubmitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    onSubmit({
      ingredientId,
      qty: qtyTotal,
      unitCost,
      expiresAt: expiresAt || undefined,
      notes: notes || undefined,
      idempotencyKey,
    });

    // ⛔ NE PAS régénérer la clé ici.
    //
    // Le faire à la soumission ANNULERAIT la protection : un double-clic
    // enverrait deux clés distinctes, donc deux lots — précisément ce que la
    // clé existe pour empêcher.
    //
    // La clé n'est renouvelée qu'après un succès CONFIRMÉ, via `resetKey`
    // exposé au parent. Tant que le serveur n'a pas répondu, tout renvoi est
    // un rejeu de la même opération — et c'est le RPC qui tranche.
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Ingrédient */}
      <div className="space-y-2">
        <Label htmlFor="supply-ingredient">Ingrédient</Label>
        <select
          id="supply-ingredient"
          value={ingredientId}
          onChange={(e) => setIngredientId(e.target.value)}
          className={cn(
            'flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <option value="">— Choisir —</option>
          {ingredients.map((ingredient) => (
            <option key={ingredient.id} value={ingredient.id}>
              {ingredient.name} ({ingredient.unit})
              {ingredient.hasDebt ? ' — dette à régulariser' : ''}
            </option>
          ))}
        </select>

        {/* ⭐ Une dette signale qu'on a consommé sans stock : l'appro va la
            solder AVANT de créer le lot (§13.2). Le dire ici évite que le
            gérant s'étonne d'un stock final inférieur à ce qu'il a saisi. */}
        {selected?.hasDebt && (
          <p className="flex items-start gap-1.5 text-caption text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Stock négatif ({selected.current_stock} {selected.unit}) : cet approvisionnement
              soldera d'abord le manque avant d'alimenter le stock disponible.
            </span>
          </p>
        )}
      </div>

      {/* Conditionnement */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="supply-count">Nombre de conditionnements</Label>
          <Input
            id="supply-count"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={packageCount}
            onChange={(e) => setPackageCount(e.target.value)}
            placeholder="2"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="supply-size">
            Contenu {selected ? `(${selected.unit})` : ''}
          </Label>
          <Input
            id="supply-size"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={packageSize}
            onChange={(e) => setPackageSize(e.target.value)}
            placeholder="25"
          />
        </div>
      </div>

      {/* Prix */}
      <div className="space-y-2">
        <Label htmlFor="supply-price">Prix payé par conditionnement</Label>
        <Input
          id="supply-price"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={packagePrice}
          onChange={(e) => setPackagePrice(e.target.value)}
          placeholder="12000"
        />
      </div>

      {/* ⭐ Récapitulatif — rend la conversion VISIBLE.
          Un formulaire qui calcule en silence oblige à faire confiance ;
          celui-ci montre ce qui sera enregistré. */}
      {qtyTotal > 0 && (
        <div className="rounded-lg bg-brand-subtle p-3 space-y-1">
          <div className="flex justify-between text-body-sm">
            <span className="text-muted-foreground">Quantité totale</span>
            <span className="font-semibold">
              {qtyTotal} {selected?.unit ?? ''}
            </span>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-muted-foreground">Coût unitaire</span>
            <span className="font-semibold">
              {formatPrice(Math.round(unitCost))} / {selected?.unit ?? 'unité'}
            </span>
          </div>
          <div className="flex justify-between text-body-sm border-t border-border/50 pt-1 mt-1">
            <span className="text-muted-foreground">Total de la livraison</span>
            <span className="font-bold text-brand-primary">{formatPrice(totalCost)}</span>
          </div>
        </div>
      )}

      {/* Péremption */}
      <div className="space-y-2">
        <Label htmlFor="supply-expiry" className="flex items-center gap-1.5">
          <Calendar size={14} />
          Date de péremption
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <Input
          id="supply-expiry"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        {/* ⚠️ Sans date, le lot ne périme jamais et sort EN DERNIER en FEFO.
            C'est le bon comportement pour le sel — pas pour du poisson. */}
        <p className="text-caption text-muted-foreground">
          Sans date, ce lot sera consommé après ceux qui périment.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="supply-notes">
          Notes <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <Input
          id="supply-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Fournisseur, n° de facture…"
        />
      </div>

      {/* Erreurs */}
      {errors.length > 0 && ingredientId !== '' && (
        <ul className="space-y-1">
          {errors.map((error) => (
            <li key={error} className="flex items-center gap-1.5 text-caption text-destructive">
              <AlertTriangle size={13} />
              {error}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          <Package size={16} className="mr-2" />
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

SupplyForm.displayName = 'SupplyForm';
