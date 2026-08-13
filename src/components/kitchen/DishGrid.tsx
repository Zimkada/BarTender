/**
 * DishGrid
 * Grille de sélection des plats — pendant de `ProductGrid` pour la cuisine.
 *
 * ⭐⭐ COMPOSANT SÉPARÉ, ET C'EST LA DÉCISION CENTRALE (§3).
 *
 * `ProductGrid` est typé sur `Product`, consommé par 11 fichiers du flux de
 * vente que TOUS les bars utilisent. Y faire entrer un plat — qui n'a ni
 * `stock`, ni `volume`, ni `categoryId` de produit — traverserait tout ce code
 * pour un gain d'ergonomie nul : l'utilisateur, lui, voit deux grilles
 * alignées sous un même sélecteur.
 *
 * ⚠️ Même profil de risque que le renommage `product_id → item_id`, écarté
 * pour les mêmes raisons. Un bar pur ne rend JAMAIS ce composant.
 *
 * ⭐ PAS DE STOCK AFFICHÉ, contrairement aux boissons. Un plat n'a pas de
 * stock : sa disponibilité dépend de ses ingrédients, et le calcul serveur ne
 * se fait qu'au `mark_ready`. Afficher un nombre ici serait inventer une
 * donnée. Le seul signal fiable est `is_available` — le toggle « Coupé ».
 */

import { memo } from 'react';
import { UtensilsCrossed, Plus, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import type { DishRow } from '../../services/supabase/dishes.service';
import { hasPriceOptions, formatPriceRange } from './priceOptionHelpers';

interface Props {
  dishes: DishRow[];
  onAddDish: (dish: DishRow) => void;
  /** Quantité déjà sélectionnée, par `dish_id`. */
  quantities?: Record<string, number>;
  isLoading?: boolean;
  /** Nom de la catégorie filtrée — affiné le message d'état vide. */
  categoryName?: string;
}

interface CardProps {
  dish: DishRow;
  quantity: number;
  onAdd: () => void;
}

const DishCard = memo<CardProps>(function DishCard({ dish, quantity, onAdd }) {
  const { formatPrice } = useCurrencyFormatter();

  // ⭐ « Coupé » (§9) : le plat existe mais n'est plus servable ce soir. La
  // carte reste VISIBLE — la masquer ferait croire à une erreur de saisie.
  const isOut = !dish.is_available;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={isOut}
      className={cn(
        'relative flex flex-col rounded-xl border p-3 text-left transition-colors',
        isOut
          ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-900'
          : 'border-gray-200 bg-white hover:border-brand-primary dark:border-gray-700 dark:bg-gray-800'
      )}
    >
      {/* Pastille de quantité — même repère visuel que les boissons. */}
      {quantity > 0 && (
        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-primary px-1.5 text-xs font-bold text-white">
          {quantity}
        </span>
      )}

      <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-brand-subtle">
        {dish.photo_url ? (
          <img
            src={dish.photo_url}
            alt=""
            className="h-full w-full rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <UtensilsCrossed className="h-7 w-7 text-brand-primary opacity-70" />
        )}
      </div>

      <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        {dish.name}
      </p>

      <div className="mt-1 flex items-baseline justify-between gap-1">
        {/* ⭐ §19.5 — FOURCHETTE pour un plat à formats. Afficher `dish.price`
            montrerait un prix que RIEN ne facture : pour ces plats, c'est une
            valeur technique que la base exige (NOT NULL) mais que
            `create_kitchen_order` ignore au profit du format choisi. */}
        <span className="text-sm font-semibold text-brand-primary">
          {hasPriceOptions(dish.dish_price_options)
            ? formatPriceRange(dish.dish_price_options, formatPrice)
            : formatPrice(dish.price)}
        </span>
        {/* ⭐ Le DÉLAI est l'information la plus utile au serveur en salle :
            elle lui permet d'annoncer une attente au client au lieu de la
            subir. Plus utile ici qu'un coût matière, qui ne le concerne pas. */}
        {dish.preparation_time_min ? (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            {dish.preparation_time_min} min
          </span>
        ) : null}
      </div>

      {isOut ? (
        <span className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          Coupé
        </span>
      ) : (
        <span className="mt-1 flex items-center gap-0.5 text-xs text-gray-400">
          <Plus className="h-3 w-3" />
          Ajouter
        </span>
      )}
    </button>
  );
});

export function DishGrid({
  dishes,
  onAddDish,
  quantities = {},
  isLoading = false,
  categoryName,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
          />
        ))}
      </div>
    );
  }

  if (dishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <UtensilsCrossed className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-body">
          {categoryName ? `Aucun plat dans « ${categoryName} ».` : 'Aucun plat au menu'}
        </p>
      </div>
    );
  }

  return (
    /* ⚠️ MÊME grille que `ProductGrid` (2/3/4/5 colonnes) : les deux
       s'affichent l'une sous l'autre en portée « Tout ». Des grilles
       divergentes casseraient l'alignement et se liraient comme deux écrans. */
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
      {dishes.map((dish) => (
        <DishCard
          key={dish.id}
          dish={dish}
          quantity={quantities[dish.id] ?? 0}
          onAdd={() => onAddDish(dish)}
        />
      ))}
    </div>
  );
}
