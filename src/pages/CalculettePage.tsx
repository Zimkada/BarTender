/**
 * CalculettePage — chiffrer un lot d'articles, sans rien vendre.
 *
 * ⭐ Le serveur tape sur les images, l'écran additionne, il annonce le prix.
 * Sert aussi, par extension, à chiffrer ce qu'il a écoulé sur un service.
 *
 * ⛔⛔ CET ÉCRAN N'ÉCRIT RIEN — ni vente, ni commande, ni stock. Aucun service,
 * aucune mutation, aucun RPC n'est appelé d'ici. C'est vérifiable d'un coup
 * d'oeil sur les imports : il n'y a que des lectures.
 *
 * ⛔ IL NE RÉUTILISE PAS LA GRILLE DE VENTE. `ProductCard` est construit autour
 * du stock (badge, seuil d'alerte, plafond du pavé) ; ici le stock n'existe pas.
 * Voir `CalculetteCard` pour le détail — c'est un choix, pas un oubli.
 *
 * ⛔⛔ LE PRIX AFFICHÉ EST LE PRIX QUE LA CAISSE FACTURERA, sans exception.
 * C'est la SEULE fonction de cet écran, et trois pièges distincts la menacent :
 *   · un plat à formats       → FOURCHETTE via `formatPriceRange`, jamais
 *                               `dish_price_options[0]` (ordre arbitraire)
 *   · un produit en promotion → prix REMISÉ sur la carte, pas `product.price`
 *   · le pavé sur un plat     → `padCurrentQuantity={0}` (cumul ≠ ligne)
 * Chacun a été introduit puis corrigé ici ; ne pas les réintroduire.
 *
 * ⚠️ RISQUE PRINCIPAL ASSUMÉ : cet écran montre les mêmes images et les mêmes
 * prix que la vente. Tout ce qui l'en distingue est délibéré — pastille de
 * quantité au lieu du stock, bandeau permanent, une seule action de sortie
 * (« Effacer »), et `RootLayout` qui masque le bouton du panier sur cette
 * route. Ne jamais y ajouter un bouton qui valide quoi que ce soit.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calculator, Info, X } from 'lucide-react';
import { useBarContext } from '../context/BarContext';
import { useStock } from '../context/hooks/useStock';
import { useCalculette } from '../hooks/useCalculette';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { useCurrencyFormatter } from '../hooks/useBeninCurrency';
import { useDishes, useDishCategories } from '../hooks/queries/useDishesQueries';
import { SimplePageHeader } from '../components/common/PageHeader/patterns/SimplePageHeader';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { CalculetteCard } from '../components/calculette/CalculetteCard';
import { CalculetteTotal } from '../components/calculette/CalculetteTotal';
import { PriceOptionPicker } from '../components/kitchen/PriceOptionPicker';
import { hasPriceOptions, formatPriceRange } from '../components/kitchen/priceOptionHelpers';
import { ProductGridSkeleton } from '../components/skeletons';
import type { Product } from '../types';
import type { DishRow } from '../services/supabase/dishes.service';

export default function CalculettePage() {
  const { currentBar, hasRestaurant } = useBarContext();
  const { formatPrice } = useCurrencyFormatter();
  const { products, categories, isLoading } = useStock();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const {
    productQuantities,
    productUnitPrices,
    dishQuantities,
    productLines,
    dishLines,
    total,
    totalDiscount,
    itemCount,
    addProduct,
    setProductQuantity,
    addDish,
    setDishQuantity,
    clear,
    lineKey,
  } = useCalculette(currentBar?.id);

  // ⭐ `enabled: hasRestaurant` vit dans le hook : ZÉRO requête sur un bar pur.
  const { data: dishes = [], isLoading: isLoadingDishes } = useDishes(currentBar?.id);
  const { data: dishCategories = [] } = useDishCategories(currentBar?.id);

  /**
   * ⛔⛔ FILTRES REMIS À ZÉRO AU CHANGEMENT DE BAR.
   *
   * `BarSelector` vit dans le `Header` : changer de bar NE DÉMONTE PAS cette
   * page. Une catégorie du bar A resterait sélectionnée sur le catalogue du
   * bar B — aucun identifiant ne correspondrait, les deux grilles seraient
   * VIDES, et AUCUN chip ne paraîtrait sélectionné (« Tout » compris) : le
   * message « Aucun article dans cette catégorie » désignerait une catégorie
   * invisible et impossible à désélectionner.
   *
   * ⚠️ La recherche aussi : « Aucun résultat pour « Beaufort » » sur un bar
   * qui n'en vend pas, à propos d'un mot tapé contre un AUTRE catalogue.
   */
  useEffect(() => {
    setSearchQuery('');
    setSelectedCategory('all');
  }, [currentBar?.id]);

  /**
   * ⛔ Une catégorie de PLATS reste sélectionnée si la restauration est coupée
   * en cours de route : plus aucun chip ne la porte, et la grille produits se
   * vide sans explication.
   */
  useEffect(() => {
    if (!hasRestaurant) setSelectedCategory('all');
  }, [hasRestaurant]);

  /**
   * ⭐ §19.5 — le plat dont on attend le choix du format, et la quantité mise
   * en attente le temps de ce choix.
   *
   * ⛔ L'ORDRE DES DEUX QUESTIONS EST IMPOSÉ : la quantité porte sur une LIGNE
   * (plat + format), qui n'existe pas tant que le format n'est pas choisi.
   */
  const [dishAwaitingFormat, setDishAwaitingFormat] = useState<DishRow | null>(null);
  const [quantityAwaitingFormat, setQuantityAwaitingFormat] = useState<number | undefined>(undefined);

  const handleAddDish = useCallback((dish: DishRow, quantity?: number) => {
    if (hasPriceOptions(dish.dish_price_options)) {
      setDishAwaitingFormat(dish);
      setQuantityAwaitingFormat(quantity);
      return;
    }
    addDish(dish, undefined, quantity);
  }, [addDish]);

  /**
   * ⭐ `onlyInStock: false` — UN PRODUIT ÉPUISÉ RESTE CHIFFRABLE. C'est le cas
   * d'usage même : on annonce un prix, ou on recompte ce qui vient d'être
   * écoulé. Le masquer priverait l'écran de sa raison d'être.
   */
  const filteredProducts = useFilteredProducts({
    products,
    searchQuery,
    selectedCategory,
    onlyInStock: false,
  });

  /**
   * ⭐ LE PLAT « COUPÉ » (`is_available = false`) EST GARDÉ, contrairement à la
   * grille de vente : « c'est 2 500, mais c'est terminé pour ce soir » est une
   * réponse légitime. La carte le SIGNALE (`unavailableLabel`) sans le
   * désactiver — le garder sans le dire serait pire que l'exclure.
   *
   * ⛔ `hasRestaurant` EN TÊTE DE FILTRE — défaut documenté par `HomePage`
   * (04/08/2026) : `enabled: false` sur une query React Query NE VIDE PAS son
   * cache. Sans cette garde, les plats du dernier fetch resteraient affichés
   * après désactivation de la restauration, alors que leurs chips de catégorie
   * auraient disparu — donc sans aucun filtre capable de les atteindre.
   */
  const filteredDishes = useMemo(() => {
    if (!hasRestaurant) return [];
    const query = searchQuery.trim().toLowerCase();
    return dishes.filter((dish) => {
      if (!dish.is_active) return false;
      if (dish.is_sellable === false) return false;
      if (selectedCategory !== 'all' && dish.category_id !== selectedCategory) return false;
      /**
       * ⚠️ ASYMÉTRIE ASSUMÉE avec `useFilteredProducts`, qui cherche AUSSI
       * dans le volume (« 65 », « 1L »). Un plat n'a pas de volume : son
       * équivalent serait le LIBELLÉ DE FORMAT (« Grand », « Petit »), champ
       * distinct qu'on pourrait joindre ici. Écarté pour l'instant : aucun bar
       * en restauration à ce jour, donc aucun usage pour arbitrer si « grand »
       * doit ramener tous les plats à formats.
       */
      if (query && !dish.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [hasRestaurant, dishes, searchQuery, selectedCategory]);

  /**
   * Catégories de plats au format attendu par `CategoryFilter`.
   * ⚠️ Repli `custom_name || name` : la table autorise `custom_name` NULL, et
   * sans repli une option de filtre s'afficherait vide.
   */
  const dishCategoriesUi = useMemo(
    () =>
      dishCategories.map((c) => ({
        id: c.id,
        name: c.custom_name || c.name || 'Sans nom',
        barId: c.bar_id,
        color: c.custom_color || c.color || '#f59e0b',
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
      })),
    [dishCategories]
  );

  // ⚠️ Aucun doublon possible : `bar_categories.type` rend les deux listes
  // disjointes par construction.
  const visibleCategories = useMemo(
    () => (hasRestaurant ? [...categories, ...dishCategoriesUi] : categories),
    [hasRestaurant, categories, dishCategoriesUi]
  );

  /**
   * ⛔ COMPTEURS OBLIGATOIRES : `CategoryFilter` fait `productCounts[id] || 0`
   * SANS condition. Omettre la prop affiche « Bières (0) » sur TOUS les chips
   * d'une grille pleine — le filtre paraît cassé et l'utilisateur n'y touche
   * plus.
   *
   * ⚠️ MÊME FILTRE que les grilles, `=== false` compris : un compteur qui ne
   * compte pas ce qu'il affiche est pire que pas de compteur.
   */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
    }
    if (hasRestaurant) {
      for (const d of dishes) {
        if (!d.is_active) continue;
        if (d.is_sellable === false) continue;
        if (!d.category_id) continue;
        counts[d.category_id] = (counts[d.category_id] || 0) + 1;
      }
    }
    return counts;
  }, [products, hasRestaurant, dishes]);

  /**
   * ⛔ `isLoadingDishes` DANS LE CALCUL : sans lui, un bar avec restauration
   * dont les produits sont résolus et les plats encore en vol afficherait
   * SIMULTANÉMENT « Aucun article à chiffrer » et un squelette de chargement.
   */
  const isEmpty =
    !isLoadingDishes && filteredProducts.length === 0 && filteredDishes.length === 0;

  /**
   * ⭐ Handlers STABLES — des arrows en ligne dans le `map` annuleraient le
   * `memo()` de `CalculetteCard` : chaque frappe dans la recherche re-rendrait
   * toutes les cartes montées, avec leur `motion.div`.
   */
  const handleAddProduct = useCallback(
    (product: Product, quantity?: number) => addProduct(product, quantity),
    [addProduct]
  );

  // ⚠️ Le retour anticipé est placé APRÈS tous les hooks.
  if (!currentBar) {
    return (
      <div className="flex min-h-[calc(100vh-100px)] flex-col items-center justify-center p-4 text-center">
        <Calculator size={32} className="mb-3 text-muted-foreground/50" />
        <p className="text-body text-muted-foreground">
          Sélectionnez un bar pour chiffrer un lot.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-44">
      <SimplePageHeader
        title="Calculette"
        subtitle="Chiffrer un lot sans vendre"
        icon={<Calculator size={20} />}
      />

      {/*
        ⭐⭐ BANDEAU PERMANENT, PAS UN TOAST. C'est la garde principale contre
        la confusion avec l'écran de vente : il doit rester lisible tant que
        l'écran est ouvert, y compris pour quelqu'un qui y arrive en plein
        service sans avoir lu le titre.
      */}
      <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
        <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-caption text-muted-foreground">
          Aucune vente n&apos;est enregistrée ici. Les stocks ne bougent pas.
        </p>
      </div>

      <div className="px-4 pt-3">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Rechercher un article..."
        />
      </div>

      <div className="pt-3">
        <CategoryFilter
          categories={visibleCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          productCounts={categoryCounts}
        />
      </div>

      {/*
        ⛔⛔ LISTE DES LIGNES CHOISIES — sans elle, corriger UNE ligne mal
        tapée obligeait à tout effacer et tout ressaisir, devant le client.
        `QuantityPad` refuse 0 et ses presets commencent à 1 : le retrait n'a
        aucun autre chemin.
      */}
      {itemCount > 0 && (
        <div className="mx-4 mt-4 space-y-1.5 rounded-xl border border-border bg-card p-3">
          {productLines.map((line) => (
            <div key={line.product.id} className="flex items-center gap-2 text-caption">
              <span className="w-8 shrink-0 font-black tabular-nums text-foreground">
                {line.quantity}×
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{line.product.name}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatPrice(line.total_price)}
              </span>
              <button
                type="button"
                onClick={() => setProductQuantity(line.product.id, 0)}
                aria-label={`Retirer ${line.product.name}`}
                className="shrink-0 rounded-full p-1 text-muted-foreground active:scale-90"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {dishLines.map((line) => {
            const key = lineKey(line.dish.id, line.priceOption?.id);
            const unit = line.priceOption?.price ?? line.dish.price;
            return (
              <div key={key} className="flex items-center gap-2 text-caption">
                <span className="w-8 shrink-0 font-black tabular-nums text-foreground">
                  {line.quantity}×
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {line.dish.name}
                  {line.priceOption && (
                    <span className="text-muted-foreground"> · {line.priceOption.label}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-foreground">
                  {formatPrice(unit * line.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => setDishQuantity(key, 0)}
                  aria-label={`Retirer ${line.dish.name}`}
                  className="shrink-0 rounded-full p-1 text-muted-foreground active:scale-90"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-5 px-4 pt-4">
        {isLoading ? (
          <ProductGridSkeleton count={12} />
        ) : isEmpty ? (
          <div className="py-16 text-center">
            <p className="text-body-sm text-muted-foreground">
              {searchQuery.trim()
                ? `Aucun résultat pour « ${searchQuery.trim()} »`
                : selectedCategory !== 'all'
                  ? 'Aucun article dans cette catégorie'
                  : 'Aucun article à chiffrer'}
            </p>
          </div>
        ) : (
          <>
            {filteredProducts.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {filteredProducts.map((product, index) => {
                  /**
                   * ⛔⛔ PRIX REMISÉ, PAS `product.price`. La barre du bas
                   * applique les promotions ; afficher ici le prix de base
                   * ferait annoncer « 1 000 la bouteille, 4 000 les quatre »
                   * au-dessus d'un total de 3 200. Cette carte est le SEUL
                   * endroit où un prix UNITAIRE se lit sur cet écran.
                   */
                  const promo = productUnitPrices[product.id];
                  const hasPromo = !!promo?.hasPromotion;
                  return (
                    <CalculetteCard
                      key={product.id}
                      name={product.name}
                      priceLabel={formatPrice(hasPromo ? promo.unit : product.price)}
                      originalPriceLabel={hasPromo ? formatPrice(promo.original) : undefined}
                      image={product.image}
                      quantity={productQuantities[product.id] ?? 0}
                      unavailableLabel={product.stock <= 0 ? 'Épuisé' : undefined}
                      onPick={(quantity) => handleAddProduct(product, quantity)}
                      priority={index < 4}
                    />
                  );
                })}
              </div>
            )}

            {filteredDishes.length > 0 && (
              <div className="space-y-3">
                {filteredProducts.length > 0 && (
                  <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    Cuisine
                  </h2>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredDishes.map((dish, index) => {
                    const multiFormat = hasPriceOptions(dish.dish_price_options);
                    return (
                      <CalculetteCard
                        key={dish.id}
                        name={dish.name}
                        /**
                         * ⛔ FOURCHETTE via le helper, JAMAIS
                         * `dish_price_options[0]` : l'ordre vient de
                         * `sort_order` puis du prix DÉCROISSANT, donc « [0] »
                         * peut être le format le PLUS CHER. `priceOptionHelpers`
                         * se déclare source unique de cette règle.
                         */
                        priceLabel={
                          multiFormat
                            ? formatPriceRange(dish.dish_price_options!, formatPrice)
                            : formatPrice(dish.price)
                        }
                        image={dish.photo_url}
                        quantity={dishQuantities[dish.id] ?? 0}
                        /**
                         * ⛔ 0 POUR UN PLAT À FORMATS : la pastille cumule les
                         * formats, le pavé remplace UNE ligne. Annoncer « 3 »
                         * puis appliquer 6 au Grand donnerait 8.
                         */
                        padCurrentQuantity={multiFormat ? 0 : undefined}
                        unavailableLabel={!dish.is_available ? 'Coupé' : undefined}
                        onPick={(quantity) => handleAddDish(dish, quantity)}
                        priority={filteredProducts.length === 0 && index < 4}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {isLoadingDishes && !isLoading && filteredProducts.length === 0 && (
          <ProductGridSkeleton count={6} />
        )}
      </div>

      {dishAwaitingFormat && (
        <PriceOptionPicker
          dish={dishAwaitingFormat}
          formatPrice={formatPrice}
          onPick={(option) => {
            addDish(dishAwaitingFormat, option, quantityAwaitingFormat);
            setDishAwaitingFormat(null);
            // ⚠️ Remis à `undefined` à CHAQUE issue : une quantité oubliée ici
            // s'appliquerait silencieusement au plat suivant.
            setQuantityAwaitingFormat(undefined);
          }}
          onCancel={() => {
            setDishAwaitingFormat(null);
            setQuantityAwaitingFormat(undefined);
          }}
        />
      )}

      <CalculetteTotal
        total={total}
        itemCount={itemCount}
        totalDiscount={totalDiscount}
        formatPrice={formatPrice}
        onClear={clear}
      />
    </div>
  );
}
