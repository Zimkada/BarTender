/**
 * DishesPage
 * Page « Plats » du groupe Cuisine — issue du découpage de `IngredientsPage`
 * (arbitrage du 03/08/2026, cf. §9 « Menu latéral »).
 *
 * ⭐ POURQUOI UNE PAGE ET NON UN ONGLET
 * La page Cuisine atteignait 3 onglets et en aurait eu 5 en phase 3 (+ Service,
 * + Appro), dont un à masquer au cuisinier. Trois raisons ont tranché :
 *   1. cinq onglets ne tiennent pas sur mobile ;
 *   2. Service (temps réel, cuisinier en rush) et Plats (configuration,
 *      promoteur) ont des rythmes d'usage opposés ;
 *   3. un onglet masqué reste dans le bundle ET dans le DOM ; une route gardée
 *      par `ProtectedRoute` ne se charge pas du tout.
 *
 * ⚠️ §3 — RISQUE PROPRE AU DÉCOUPAGE
 * Chaque route est un chunk lazy. Avant, UNE seule route cuisine était à tenir
 * hors préchargement pour les bars purs ; il y en a désormais plusieurs. La
 * garde vit à deux niveaux : `ProtectedRoute requiresRestaurant` sur la route,
 * et `enabled: hasRestaurant` sur chaque query.
 */

import { useMemo } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SimplePageHeader } from '../components/common/PageHeader';
import { DishesTab } from '../components/kitchen/DishesTab';
import { useBarContext } from '../context/BarContext';
import { useUnifiedDishes } from '../hooks/pivots/useUnifiedDishes';
import { useDishCategories } from '../hooks/queries/useDishesQueries';

export default function DishesPage() {
  const navigate = useNavigate();
  const { currentBar } = useBarContext();

  const { dishes, availableIngredients, isLoading } = useUnifiedDishes(currentBar?.id);
  const { data: dishCategoryRows = [] } = useDishCategories(currentBar?.id);

  /**
   * ⚠️ Normalisation ici et non dans la query : une catégorie de plats est
   * toujours custom (pas de catalogue global de plats), mais le type de la
   * table autorise `custom_name` à être NULL. Le repli garantit qu'aucune
   * option de sélecteur ne s'affiche vide.
   */
  const dishCategories = useMemo(
    () =>
      dishCategoryRows.map((c) => ({
        id: c.id,
        name: c.custom_name || c.name || 'Sans nom',
      })),
    [dishCategoryRows]
  );

  return (
    <div className="min-h-screen bg-brand-subtle pb-20">
      <SimplePageHeader
        title="Plats"
        subtitle={`${dishes.length} plat${dishes.length > 1 ? 's' : ''} au menu`}
        icon={<UtensilsCrossed size={22} />}
        onBack={() => navigate('/')}
      />

      <div className="px-4 sm:px-6 mt-4">
        <DishesTab
          barId={currentBar?.id}
          dishes={dishes}
          ingredients={availableIngredients}
          categories={dishCategories}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
