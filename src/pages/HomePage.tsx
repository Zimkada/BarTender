import { useState, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useBarContext } from '../context/BarContext';
import { ProductGrid } from '../components/ProductGrid';
import { CategoryFilter } from '../components/CategoryFilter';
import { SearchBar } from '../components/common/SearchBar';
import { CategoryModal } from '../components/CategoryModal';
import { ConfirmModal } from '../components/ui/Modal';
import { Product } from '../types';
import { useFilteredProducts } from '../hooks/useFilteredProducts';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useStock } from '../context/hooks/useStock';
import { ProductGridSkeleton } from '../components/skeletons';
import { DishGrid } from '../components/kitchen/DishGrid';
import {
  CatalogScopeSwitcher,
  type CatalogScope,
} from '../components/inventory/CatalogScopeSwitcher';
import { useDishes, useDishCategories } from '../hooks/queries/useDishesQueries';

export default function HomePage() {
  const { addToCart, cart, addDish, kitchenQuantities } = useAppContext();
  const { currentBar, hasRestaurant } = useBarContext();

  const { products, categories, getProductStockInfo, isLoading } = useStock();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * ⭐ Portée du catalogue — §9. `all` par défaut : le serveur voit tout et
   * n'a rien à activer. Le sélecteur ne s'affiche QUE si le bar a une cuisine.
   *
   * ⚠️ Sur un bar pur, `hasRestaurant` est `false` : le sélecteur ne rend
   * rien, les queries plats ne partent pas, et la portée reste `all` — donc
   * la grille produits s'affiche exactement comme aujourd'hui (§3).
   */
  const [scope, setScope] = useState<CatalogScope>('all');

  // ⭐ §3 — `enabled: hasRestaurant` dans les queries : ZÉRO requête sur un
  // bar pur. La garde vit dans le hook, pas ici.
  const { data: dishes = [], isLoading: isLoadingDishes } = useDishes(currentBar?.id);
  const { data: dishCategories = [] } = useDishCategories(currentBar?.id);

  const productsWithAvailableStock = useMemo(() => {
    return products.map(product => {
      const stockInfo = getProductStockInfo(product.id);
      return {
        ...product,
        stock: stockInfo?.availableStock ?? 0 // Override 'stock' with availableStock
      };
    });
  }, [products, getProductStockInfo]);

  const {
    isCategoryModalOpen,
    editingCategory,
    deleteCategoryModalOpen,
    categoryToDelete,
    closeAddEditModal,
    closeDeleteModal,
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleSaveCategory,
    handleLinkGlobalCategory,
    handleConfirmDeleteCategory,
  } = useCategoryManagement();

  const filteredProducts = useFilteredProducts({
    products: productsWithAvailableStock,
    searchQuery,
    selectedCategory,
    onlyInStock: false
  });

  /**
   * ⭐ Filtrage des plats — même recherche, mêmes règles que les produits.
   *
   * ⚠️ `selectedCategory` est PARTAGÉ entre les deux catalogues, et c'est
   * voulu : leurs catégories sont disjointes (`bar_categories.type`). Choisir
   * une catégorie de boissons vide donc la grille plats, et inversement — ce
   * qui est exactement le comportement attendu d'un filtre.
   */
  const filteredDishes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return dishes.filter((dish) => {
      // ⛔ Les plats INACTIFS ne sont pas au menu. `is_available` (« coupé »)
      // en revanche les laisse VISIBLES mais non commandables — le serveur
      // doit pouvoir dire au client « c'est terminé pour ce soir ».
      if (!dish.is_active) return false;
      if (selectedCategory !== 'all' && dish.category_id !== selectedCategory) return false;
      if (query && !dish.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [dishes, searchQuery, selectedCategory]);

  /**
   * Catégories de plats au format applicatif attendu par `CategoryFilter`.
   *
   * ⚠️ Repli sur `custom_name || name` comme dans `DishesPage` : une catégorie
   * de plats est toujours custom, mais la table autorise `custom_name` à être
   * NULL. Sans repli, une option de filtre s'afficherait vide.
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

  /**
   * ⭐ Portée EFFECTIVE — retombe sur « Tout » si la cuisine disparaît.
   *
   * ⚠️ Défaut trouvé à la code review du 04/08/2026 : avec `scope = 'dishes'`
   * et `hasRestaurant` repassé à `false`, `showProducts` ET `showDishes`
   * valaient `false` — ÉCRAN ENTIÈREMENT VIDE, sans explication.
   * Le cas n'est pas théorique : changer de bar via le sélecteur d'en-tête, ou
   * désactiver la cuisine depuis un autre onglet, suffit à le produire.
   *
   * ⚠️ Corrigé en DÉRIVANT plutôt qu'en synchronisant l'état dans un effet :
   * un `useEffect` qui remet `scope` à `'all'` provoquerait un rendu
   * intermédiaire vide avant de se corriger.
   */
  const effectiveScope: CatalogScope = hasRestaurant ? scope : 'all';

  /**
   * Ce que la portée courante donne à voir.
   *
   * ⚠️ SYMÉTRIQUE de `showDishes` — signalé en test le 04/08/2026 : en portée
   * « Tout », filtrer sur une catégorie de PLATS laissait la section boissons
   * affichée avec son état vide (« Aucun produit dans cette catégorie »).
   *
   * ⛔ Le défaut PRÉEXISTAIT : le bloc testait `products.length === 0`, le
   * catalogue COMPLET, au lieu du résultat FILTRÉ. Il ne se manifestait jamais
   * tant que chaque catégorie contenait des produits — le module restauration
   * l'a rendu atteignable en introduisant des catégories qui n'en ont aucun.
   */
  const showProducts =
    (effectiveScope === 'products') ||
    (effectiveScope === 'all' && (isLoading || filteredProducts.length > 0));
  /**
   * ⚠️ En portée « Tout », la grille plats est masquée quand elle est VIDE :
   * filtrer sur une catégorie de boissons afficherait sinon « Aucun plat au
   * menu » sous les produits — un message qui accuse à tort alors que les
   * plats ne sont simplement pas le sujet.
   * En portée « Restau », l'état vide est au contraire la bonne réponse : on
   * a demandé à voir les plats, il faut dire qu'il n'y en a pas.
   */
  const showDishes =
    hasRestaurant &&
    (effectiveScope === 'dishes' ||
      (effectiveScope === 'all' && (isLoadingDishes || filteredDishes.length > 0)));

  // 2. Le retour anticipé est placé après tous les hooks
  if (!currentBar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-foreground p-4">
        <h1 className="text-display text-brand-dark mb-3">Bienvenue sur BarTender</h1>
        <p className="text-body text-muted-foreground">Sélectionnez un bar pour commencer.</p>
      </div>
    );
  }

  const handleAddToCart = (product: Product) => {
    addToCart(product);
  };

  // 3. Le reste du rendu du composant
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      {/* Header — typographie 2026, hiérarchie claire */}
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-micro text-muted-foreground uppercase mb-1">{currentBar.name}</p>
            <h1 className="text-h1 text-foreground">
              Vente <span className="text-brand-primary">rapide</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-subtle rounded-full border border-brand-subtle flex-shrink-0">
            <ShoppingCart size={14} className="text-brand-primary" />
            {/* ⚠️ Le compteur suit la PORTÉE : afficher « 12 produits » en
                portée Restau contredirait l'écran. Sur un bar pur, `scope`
                vaut toujours `all` et `dishes` est vide — le libellé reste
                donc « produits », strictement comme aujourd'hui (§3). */}
            <span className="text-caption text-brand-text">
              <span className="font-semibold">
                {effectiveScope === 'dishes'
                  ? dishes.length
                  : effectiveScope === 'products'
                    ? products.length
                    : products.length + dishes.length}
              </span>
              <span className="text-muted-foreground ml-1">
                {effectiveScope === 'dishes'
                  ? 'plats'
                  : effectiveScope === 'products' || dishes.length === 0
                    ? 'produits'
                    : 'articles'}
              </span>
            </span>
          </div>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          /* ⚠️ Suit la portée : sur un bar pur, `hasRestaurant` est false et le
             libellé reste identique a aujourd hui (§3). */
          placeholder={
            !hasRestaurant || effectiveScope === 'products'
              ? 'Rechercher un produit...'
              : effectiveScope === 'dishes'
                ? 'Rechercher un plat...'
                : 'Rechercher un produit ou un plat...'
          }
          className="w-full"
        />
      </div>

      {/* ⭐ Sélecteur de portée — ne rend RIEN sans cuisine (§3). Placé entre
          la recherche et les catégories : il filtre plus largement qu'elles.
          ⚠️ Reçoit `effectiveScope` et non `scope` : le bouton actif doit
          refléter ce qui est RÉELLEMENT affiché, sinon « Restau » resterait
          surligné après la disparition de la cuisine. */}
      <CatalogScopeSwitcher
        scope={effectiveScope}
        onScopeChange={(next) => {
          setScope(next);
          // ⚠️ Réinitialiser la CATÉGORIE au changement de portée : les
          // catégories sont disjointes entre boissons et plats. Garder
          // « Bières » en passant sur Restau afficherait une grille vide
          // sans que rien n'explique pourquoi.
          setSelectedCategory('all');
        }}
        hasRestaurant={hasRestaurant}
        productCount={products.length}
        dishCount={dishes.length}
      />

      {/* Category Filter */}
      <CategoryFilter
        categories={effectiveScope === 'dishes' ? dishCategoriesUi : categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddCategory={handleAddCategory}
        productCounts={
          effectiveScope === 'dishes'
            ? dishes.reduce((acc: Record<string, number>, d) => {
                if (d.category_id) acc[d.category_id] = (acc[d.category_id] || 0) + 1;
                return acc;
              }, {})
            : products.reduce((acc: Record<string, number>, p) => {
                acc[p.categoryId] = (acc[p.categoryId] || 0) + 1;
                return acc;
              }, {})
        }
      />

      {/* Product Grid — plate, sans encadrement (aération) */}
      <div className="min-h-[600px] space-y-6">
        {/* ⭐⭐ ÉTAT VIDE GLOBAL — indispensable depuis que les DEUX sections
            peuvent se masquer indépendamment. Sans lui, une recherche sans
            résultat en portée « Tout » laisserait un écran BLANC : le défaut
            corrigé plus haut, réintroduit par sa propre correction.
            ⚠️ `isLoading` exclu : pendant le chargement, les squelettes
            s'affichent — annoncer « rien trouvé » serait faux. */}
        {!showProducts && !showDishes && !isLoading && !isLoadingDishes && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-body">
              {/* ⚠️ TROIS messages distincts : « rien trouvé » n'a pas le même
                  sens selon qu'on a cherché, filtré, ou que le catalogue est
                  vide. Un message unique enverrait le promoteur chercher un
                  filtre qu'il n'a pas posé. */}
              {searchQuery.trim()
                ? `Aucun résultat pour « ${searchQuery.trim()} »`
                : selectedCategory !== 'all'
                  ? 'Aucun article dans cette catégorie'
                  : 'Aucun produit trouvé'}
            </p>
          </div>
        )}

        {showProducts && (
          isLoading ? (
            <ProductGridSkeleton count={12} />
          ) : (
            /* ⚠️ Le test `products.length === 0` a été RETIRÉ : il portait sur
               le catalogue COMPLET et non sur le résultat filtré, ce qui
               affichait « Aucun produit trouvé » là où l'état vide global dit
               désormais la même chose, une seule fois et pour les deux
               sections. */
            <ProductGrid
              products={filteredProducts}
              onAddToCart={handleAddToCart}
              cart={cart}
              getAvailableStock={(productId) => getProductStockInfo(productId)?.availableStock}
              categoryName={
                selectedCategory === 'all'
                  ? undefined
                  : categories.find(c => c.id === selectedCategory)?.name
              }
            />
          )
        )}

        {/* ⭐ Grille des PLATS — jamais rendue sur un bar pur. */}
        {showDishes && (
          <div className="space-y-3">
            {/* ⚠️ Titre affiché UNIQUEMENT en portée « Tout » : c'est là que
                les deux grilles se suivent et qu'il faut les distinguer. En
                portée « Restau », le sélecteur dit déjà ce qu'on regarde. */}
            {effectiveScope === 'all' && filteredDishes.length > 0 && (
              <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                Cuisine
              </h2>
            )}
            <DishGrid
              dishes={filteredDishes}
              onAddDish={addDish}
              quantities={kitchenQuantities}
              isLoading={isLoadingDishes}
              categoryName={
                selectedCategory === 'all'
                  ? undefined
                  : dishCategoriesUi.find(c => c.id === selectedCategory)?.name
              }
            />
          </div>
        )}
      </div>

      {/* Category Modal for Add/Edit */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={closeAddEditModal}
        onSave={handleSaveCategory}
        onLinkGlobal={handleLinkGlobalCategory}
        category={editingCategory || undefined}
      />

      {/* Confirm Modal for Delete Category */}
      <ConfirmModal
        open={deleteCategoryModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDeleteCategory}
        title="Supprimer la catégorie"
        description={`Êtes-vous sûr de vouloir supprimer la catégorie "${categoryToDelete?.name}" ?`}
        requireConfirmation={true}
        confirmationValue={categoryToDelete?.name || ''}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
      />
    </div>
  );
}
