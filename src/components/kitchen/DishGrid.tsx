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

import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { UtensilsCrossed, Plus, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import type { DishRow } from '../../services/supabase/dishes.service';
import { hasPriceOptions, formatPriceRange } from './priceOptionHelpers';
import { QuantityPad } from '../common/QuantityPad';

interface Props {
  dishes: DishRow[];
  /**
   * ⭐ `quantity` REMPLACE la quantité de la ligne (pavé). Absente : +1.
   * ⚠️ Pour un plat à FORMATS, la quantité traverse `PriceOptionPicker` :
   * elle ne s'applique qu'une fois le format choisi (cf. `HomePage`).
   */
  onAddDish: (dish: DishRow, quantity?: number) => void;
  /** Quantité déjà sélectionnée, par `dish_id`. */
  quantities?: Record<string, number>;
  isLoading?: boolean;
  /** Nom de la catégorie filtrée — affiné le message d'état vide. */
  categoryName?: string;
}

interface CardProps {
  dish: DishRow;
  quantity: number;
  onAdd: (quantity?: number) => void;
}

const DishCard = memo<CardProps>(function DishCard({ dish, quantity, onAdd }) {
  const { formatPrice } = useCurrencyFormatter();
  const [isPadOpen, setIsPadOpen] = useState(false);

  // ⭐ « Coupé » (§9) : le plat existe mais n'est plus servable ce soir. La
  // carte reste VISIBLE — la masquer ferait croire à une erreur de saisie.
  const isOut = !dish.is_available;

  return (
    /**
     * ⛔⛔ WRAPPER INDISPENSABLE — défaut trouvé en revue le 13/09/2026.
     *
     * Le pavé et le badge déclencheur étaient rendus DANS le `<button>` de la
     * carte. Or `Modal` n'utilise AUCUN portal (aucun `createPortal` dans
     * `components/ui`) : le HTML résultant imbriquait donc des `<button>` et un
     * `<input>` à l'intérieur d'un `<button>`. Les navigateurs REMONTENT ce
     * balisage invalide hors du bouton parent, et un bouton imbriqué ne reçoit
     * pas les clics de façon fiable : les taps du pavé ne faisaient rien, ou
     * atteignaient la carte (+1 plat parasite).
     *
     * ⭐ Le bouton, le badge et le pavé sont désormais FRÈRES. `ProductCard`
     * n'avait pas ce défaut parce que sa racine est un `motion.div`, pas un
     * `<button>` — la différence ne se voyait pas à la lecture d'un seul des
     * deux fichiers.
     */
    <div className="relative">
      <button
        type="button"
        onClick={() => onAdd()}
        disabled={isOut}
        className={cn(
          'flex w-full flex-col rounded-xl border p-3 text-left transition-colors',
          isOut
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-900'
            : 'border-gray-200 bg-white hover:border-brand-primary dark:border-gray-700 dark:bg-gray-800'
        )}
      >
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

      {/* ⭐⭐ DÉCLENCHEUR DU PAVÉ — FRÈRE du bouton, jamais dedans (cf. wrapper).
          Même geste que les boissons : en portée « Tout », les deux grilles se
          suivent à l'écran et deux gestes différents pour la même intention se
          verraient immédiatement.
          ⚠️ `stopPropagation` conservé : le badge est superposé à la carte, un
          clic dessus ne doit pas déclencher le +1 du bouton en dessous.
          ⭐ Affiché MÊME à quantité nulle (un « + » discret) : un plat n'a pas
          de badge de stock permanent qui pourrait porter le geste. */}
      {!isOut && (
        <button
          type="button"
          aria-label={`Saisir une quantité pour ${dish.name}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsPadOpen(true);
          }}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-6 min-w-6 items-center',
            'justify-center rounded-full px-1.5 text-xs font-bold transition-transform active:scale-90',
            quantity > 0
              ? 'bg-brand-primary text-white ring-1 ring-white/40'
              : 'bg-brand-subtle text-brand-primary ring-1 ring-brand-primary/20'
          )}
        >
          {quantity > 0 ? quantity : <Plus className="h-3 w-3" strokeWidth={3} />}
        </button>
      )}

      {/* ⚠️ Pastille NON interactive quand le plat est coupé : le repère
          visuel doit rester, mais rien ne doit s'ouvrir. */}
      {isOut && quantity > 0 && (
        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-primary px-1.5 text-xs font-bold text-white">
          {quantity}
        </span>
      )}

      {/* ⭐ Pavé de quantité — FRÈRE du bouton (cf. wrapper).
          ⛔⛔ MONTÉ SOUS CONDITION, jamais en permanence (revue du 13/09/2026).
          Sans le `isPadOpen &&`, CHAQUE plat de la grille montait son propre
          `Modal`. Or `Modal` remet `document.body.style.overflow = ''` dans un
          cleanup INCONDITIONNEL : démonter une carte (recherche, changement de
          catégorie, refetch) libérait le verrou de défilement d'un pavé encore
          ouvert. S'y ajoutaient N listeners ESC et N focus-traps pour un seul
          dialogue visible.
          ⚠️ PAS de `maxQuantity` : un plat n'a PAS de stock — sa disponibilité
          dépend de ses ingrédients et n'est calculée qu'au `mark_ready`.
          Afficher un plafond ici inventerait une donnée (cf. en-tête du
          fichier : « le seul signal fiable est is_available »).
          ⛔ `currentQuantity={0}` et NON `quantity` : `quantities` CUMULE les
          formats d'un même plat (un Grand + deux Petits → 3), alors que le pavé
          REMPLACE UNE SEULE ligne. Annoncer « 3 » puis appliquer 6 à la ligne
          Grand aurait donné 8 au panier — un chiffre que l'utilisateur n'a ni
          demandé ni vu. À 0, le pavé pose simplement « combien en servez-vous »,
          ce qui est exact quel que soit le format visé.
          ⭐⭐ RENDU PAR UN PORTAL, comme `ProductCard` — signalé en test terrain
          le 13/09/2026 sur les boissons : un pavé rendu DANS la carte hérite de
          ses contraintes de mise en page (`overflow-hidden`, transform Framer
          Motion), qui ROGNENT l'overlay `fixed inset-0` du Modal et rendent le
          dialogue impossible à fermer. Cette carte-ci n'a aujourd'hui ni l'un ni
          l'autre, mais rien ne garantit qu'un futur style de grille ne les
          introduira pas — et le symptôme serait le même : un serveur bloqué en
          plein service, sans aucun moyen de sortir de l'écran.
          ⛔ Un dialogue se rend sous `document.body`, PAS dans la cellule qui
          l'ouvre. Les deux grilles suivent désormais la même règle. */}
      {isPadOpen && createPortal(
        <QuantityPad
          open={isPadOpen}
          onClose={() => setIsPadOpen(false)}
          itemName={dish.name}
          currentQuantity={0}
          onPick={(picked) => onAdd(picked)}
        />,
        document.body
      )}
    </div>
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
          onAdd={(quantity) => onAddDish(dish, quantity)}
        />
      ))}
    </div>
  );
}
