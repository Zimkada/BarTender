/**
 * DishCatalogList
 * Liste des plats dans le CATALOGUE (onglet Produits de l'inventaire).
 *
 * ⭐ LECTURE SEULE — décision assumée.
 * L'édition d'un plat vit sur la page Cuisine, qui a le contexte nécessaire
 * (ingrédients, recette, coût). Dupliquer ici un formulaire de plat créerait
 * deux chemins d'écriture pour le même objet, donc deux endroits à corriger et
 * deux ergonomies à maintenir. Cet écran répond à « qu'est-ce que je vends ? »,
 * pas à « comment je le fabrique ? ».
 *
 * ⚠️ PAS de réutilisation d'`InventoryList` : ce composant est construit pour
 * des produits STOCKÉS (stock courant, coût d'achat, ajustements, historique
 * de mouvements). Un plat n'a rien de tout cela — c'est précisément pourquoi
 * `dishes` est une table autonome (§4.5). Y faire entrer des plats exigerait
 * des champs mensongers.
 */

import { ChefHat, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { EmptyState } from '../common/EmptyState';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { cn } from '../../lib/utils';
import type { DishRow } from '../../services/supabase/dishes.service';

interface Props {
  dishes: DishRow[];
  /** Nom de catégorie par id — les plats n'embarquent que `category_id`. */
  categoryNames: Map<string, string>;
  searchTerm?: string;
  isLoading?: boolean;
}

export function DishCatalogList({ dishes, categoryNames, searchTerm, isLoading }: Props) {
  const navigate = useNavigate();
  const { formatPrice } = useCurrencyFormatter();

  if (isLoading) {
    return (
      <p className="text-center text-muted-foreground py-8 text-sm">
        Chargement des plats…
      </p>
    );
  }

  if (dishes.length === 0) {
    return (
      <EmptyState
        icon={ChefHat}
        message={searchTerm ? 'Aucun plat trouvé' : 'Aucun plat'}
        subMessage={
          searchTerm
            ? 'Aucun plat ne correspond à cette recherche.'
            : 'Créez vos plats depuis la page Cuisine pour les voir apparaître ici.'
        }
        action={
          searchTerm ? undefined : (
            <Button onClick={() => navigate('/kitchen/ingredients')}>
              <ChefHat size={16} className="mr-1.5" />
              Aller à la Cuisine
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {dishes.map((dish) => {
        const categoryName = dish.category_id
          ? categoryNames.get(dish.category_id)
          : undefined;

        return (
          <button
            key={dish.id}
            type="button"
            // L'édition se fait sur la page Cuisine — un seul chemin d'écriture.
            onClick={() => navigate('/kitchen/ingredients')}
            className={cn(
              'w-full text-left rounded-lg border bg-card p-3 flex items-center gap-3 transition-colors hover:bg-accent',
              dish.is_available ? 'border-border' : 'border-dashed border-border opacity-70'
            )}
          >
            <ChefHat size={18} className="text-brand-primary flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{dish.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {formatPrice(dish.price)}
                {categoryName ? ` • ${categoryName}` : ''}
              </p>
            </div>

            {/* ⚠️ Statut affiché mais NON modifiable ici : le toggle vit sur la
                page Cuisine. Deux boutons faisant la même chose sur deux écrans
                différents finiraient par diverger. */}
            <span
              className={cn(
                'text-xs font-medium px-2 py-1 rounded-md flex-shrink-0',
                dish.is_available
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
              )}
            >
              {dish.is_available ? 'Dispo' : 'Coupé'}
            </span>

            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
