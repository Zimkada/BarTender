/**
 * PriceOptionSizeLinker — associe un format de plat à une taille (§19.6).
 *
 * ⭐⭐ POURQUOI ICI ET NON DANS LA FICHE DU PLAT (arbitrage du 11/08/2026).
 *
 * Le réglage semble appartenir au plat, et le placer dans `DishForm` paraît
 * plus naturel. Deux faits l'emportent :
 *
 *   1. À LA CRÉATION D'UN PLAT, ses formats n'existent pas encore en base -
 *      l'association y serait donc IMPOSSIBLE au moment même où le gérant
 *      configure tout. Le parcours « naturel » donnerait l'illusion d'être
 *      complet en obligeant à un second passage.
 *   2. L'association se règle UNE FOIS, à la mise en place, et ne bouge plus.
 *      Dans `DishForm` elle s'afficherait à CHAQUE modification de plat -
 *      changement de prix, plat coupé, renommage - soit des dizaines de fois
 *      pour un réglage qu'on ne retouchera jamais.
 *
 * ⭐ Ici, elle vit à côté du rapprochement QU'ELLE SERT : un gérant qui voit
 * « aucun mouvement » comprend immédiatement ce qui lui manque.
 *
 * ⚠️ AUCUNE REQUÊTE SUPPLÉMENTAIRE : `useDishes` charge déjà les formats et
 * leur taille associée, `useIngredients` les ingrédients. On dérive.
 */

import { memo, useMemo } from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIngredientMutations } from '../../hooks/mutations/useIngredientMutations';
import type { DishRow } from '../../services/supabase/dishes.service';
import type { IngredientSizeRow } from '../../services/supabase/ingredients.service';

interface Props {
  dishes: DishRow[];
  /** Toutes les tailles du bar, avec le nom de leur ingrédient. */
  sizes: Array<IngredientSizeRow & { ingredient_name: string }>;
}

export const PriceOptionSizeLinker = memo(function PriceOptionSizeLinker({
  dishes,
  sizes,
}: Props) {
  const { setPriceOptionSize } = useIngredientMutations();

  /**
   * ⭐ Seuls les plats à FORMATS sont concernés — un plat à prix ferme n'a
   * rien à associer, et l'afficher noierait la liste.
   *
   * ⚠️ `> 1` comme partout (`hasPriceOptions`) : la base refuse un format
   * unique, mais une donnée héritée pourrait en produire un.
   */
  const rows = useMemo(
    () =>
      dishes
        .filter((d) => (d.dish_price_options?.length ?? 0) > 1)
        .flatMap((d) =>
          (d.dish_price_options ?? []).map((o) => ({ dish: d, option: o }))
        ),
    [dishes]
  );

  // ⚠️ Ni formats ni tailles : rien à régler, le bloc ne se rend pas.
  if (rows.length === 0 || sizes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3">
        <h4 className="flex items-center gap-2 text-body font-semibold">
          <Link2 size={16} className="text-brand-primary" />
          Quel format consomme quelle taille
        </h4>
        <p className="mt-1 text-caption text-muted-foreground">
          À régler une fois. Sans cette correspondance, le contrôle ci-dessous
          ne peut pas rapprocher vos livraisons de vos ventes.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {rows.map(({ dish, option }) => (
          <li
            key={option.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {dish.name} — {option.label}
              </p>
            </div>

            {/*
              ⚠️ `value ?? ''` : un format NON associé doit afficher l'option
              vide, pas la première taille de la liste. Sans le repli, React
              rendrait un select non contrôlé et le navigateur choisirait
              lui-même — le gérant croirait une association qui n'existe pas.
            */}
            <select
              value={option.size_id ?? ''}
              onChange={(e) =>
                setPriceOptionSize.mutate({
                  priceOptionId: option.id,
                  // ⭐ Chaîne vide = RETIRER l'association. La RPC accepte NULL
                  // explicitement : un format peut cesser d'être suivi.
                  sizeId: e.target.value || null,
                })
              }
              disabled={setPriceOptionSize.isPending}
              className={cn(
                'rounded-lg border border-border bg-background px-3 py-2 text-sm',
                'focus:border-brand-primary focus:outline-none'
              )}
              aria-label={`Taille consommée par ${dish.name} ${option.label}`}
            >
              <option value="">Non suivi</option>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ingredient_name} — {s.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
});

PriceOptionSizeLinker.displayName = 'PriceOptionSizeLinker';
