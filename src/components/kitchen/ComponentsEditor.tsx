/**
 * ComponentsEditor
 * Composition d'un plat — quels LOTS il prélève (§13.8, §12.4.d).
 *
 * ⭐⭐ DISTINCT DE `RecipeEditor`, ET C'EST VOULU.
 *   · la RECETTE dit quels INGRÉDIENTS le plat consomme (huile, sauce) ;
 *   · la COMPOSITION dit quels LOTS il prélève (1 portion de spaghetti cuits).
 * Un spaghetti-poulet a les deux. Les fondre dans un seul écran mélangerait
 * deux gestes métier — et `RecipeEditor` est déjà dense.
 *
 * ⭐ COMPOSER UN PLAT CHANGE SON RÉGIME. Le serveur le re-dérive : dès qu'un
 * composant existe, le plat devient « précuit puis fini à la commande ». On
 * l'annonce, on ne le laisse pas découvrir.
 *
 * ⛔ UN SEUL NIVEAU (§13.8). Un plat-base ne peut pas être lui-même composé,
 * et un plat composé ne peut pas servir de base. Le RPC refuse les deux sens —
 * cette UI n'affiche donc que les plats-bases ÉLIGIBLES.
 */

import { useState, useMemo } from 'react';
import { Plus, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { DishRow, ComponentLineInput, DishComponentRow } from '../../services/supabase/dishes.service';

interface Props {
  dish: DishRow;
  /** Composition actuelle, chargée à la demande. */
  components: DishComponentRow[];
  /** Tous les plats du bar — filtrés ici sur les bases éligibles. */
  dishes: DishRow[];
  isSaving: boolean;
  onSave: (lines: ComponentLineInput[]) => void;
  onCancel: () => void;
}

interface Draft {
  key: string;
  baseDishId: string;
  quantity: string;
}

let counter = 0;
const nextKey = () => `comp-${++counter}`;

export function ComponentsEditor({
  dish,
  components,
  dishes,
  isSaving,
  onSave,
  onCancel,
}: Props) {
  const [lines, setLines] = useState<Draft[]>(() =>
    components.length > 0
      ? components.map((c) => ({
          key: nextKey(),
          baseDishId: c.base_dish_id,
          quantity: String(c.quantity),
        }))
      : [{ key: nextKey(), baseDishId: '', quantity: '1' }]
  );

  /**
   * ⭐ Plats-bases ÉLIGIBLES uniquement — le RPC refuserait les autres, autant
   * ne pas les proposer.
   * ⚠️ On exclut le plat lui-même : un plat ne peut pas se contenir.
   * ⛔ On exclut aussi les plats DÉJÀ COMPOSÉS : ils créeraient un second
   * niveau. L'UI ne peut pas le savoir sans charger leur composition — le RPC
   * reste donc le garde-fou, cette liste n'est qu'une commodité.
   */
  const eligibleBases = useMemo(
    () => dishes.filter((d) => d.is_batch_base && d.is_active && d.id !== dish.id),
    [dishes, dish.id]
  );

  const addLine = () =>
    setLines((prev) => [...prev, { key: nextKey(), baseDishId: '', quantity: '1' }]);

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  const updateLine = (key: string, patch: Partial<Draft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** ⚠️ Les lignes vides sont ignorées, pas rejetées : une ligne oubliée ne
      doit pas bloquer l'enregistrement du reste. */
  const validLines = lines.filter((l) => l.baseDishId !== '' && Number(l.quantity) > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    onSave(
      validLines.map((l) => ({
        base_dish_id: l.baseDishId,
        quantity: Number(l.quantity),
      }))
    );
  };

  if (eligibleBases.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-center">
          <Layers size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-body-sm text-foreground/80">Aucun plat préparé d’avance</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Pour composer un plat, il faut d’abord un plat marqué « préparé
            d’avance » avec un nombre de portions - par exemple « spaghetti
            cuits » ou « poulet bouilli ».
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
      <p className="text-caption text-muted-foreground">
        Indiquez ce que {dish.name} prélève dans les plats préparés d’avance.
        Ses propres ingrédients (huile, sauce…) restent dans sa recette.
      </p>

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.key} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-caption text-muted-foreground">
                Plat préparé d’avance
              </label>
              <select
                value={line.baseDishId}
                onChange={(e) => updateLine(line.key, { baseDishId: e.target.value })}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-body-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="">Choisir…</option>
                {eligibleBases.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-24 flex-shrink-0">
              <label className="mb-1 block text-caption text-muted-foreground">
                Portions
              </label>
              <Input
                type="number"
                inputMode="decimal"
                min="0.001"
                step="any"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeLine(line.key)}
              aria-label="Retirer cette ligne"
              className="mb-0.5 flex-shrink-0"
            >
              <Trash2 size={16} className="text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        <Plus size={14} className="mr-1" />
        Ajouter une base
      </Button>

      {/* ⭐ On ANNONCE le changement de régime : le plat va se comporter
          différemment au service, l'utilisateur doit comprendre pourquoi. */}
      {validLines.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
          />
          <p className="text-caption text-amber-900 dark:text-amber-200">
            {dish.name} deviendra « précuit puis fini à la commande » : il
            prélèvera dans un lot au lieu de tout cuisiner sur place. Pensez à
            produire un lot avant le service.
          </p>
        </div>
      )}

      {/* ⚠️ Vider la composition est une action DÉLIBÉRÉE, pas une erreur : on
          la permet, en disant ce qu'elle implique. */}
      {validLines.length === 0 && components.length > 0 && (
        <p className="text-caption text-muted-foreground">
          En enregistrant sans aucune base, {dish.name} redeviendra un plat
          préparé entièrement à la commande.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" disabled={isSaving} className="flex-1">
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

ComponentsEditor.displayName = 'ComponentsEditor';
