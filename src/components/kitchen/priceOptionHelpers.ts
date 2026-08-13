/**
 * priceOptionHelpers — règles d'affichage des formats de prix (§19.5).
 *
 * ⭐ SOURCE UNIQUE DE LA RÈGLE. Le prix d'un plat s'affiche à TROIS endroits
 * (grille de vente, liste des plats, panier). Si chacun décidait seul quoi
 * montrer pour un plat à formats, ils divergeraient — et le promoteur ne
 * saurait pas lequel croire.
 *
 * ⚠️ Fichier SÉPARÉ d'un composant : exporter des fonctions à côté d'un
 * composant casse le Fast Refresh de Vite. Même parti pris que `scopeHelpers`.
 */

import type { DishPriceOptionRow } from '../../services/supabase/dishes.service';

/** Un plat propose-t-il plusieurs formats ? */
export function hasPriceOptions(
  options: DishPriceOptionRow[] | undefined
): options is DishPriceOptionRow[] {
  /**
   * ⚠️ `> 1` ET NON `> 0` — la base REFUSE un format unique (un choix unique
   * n'est pas un choix), mais une donnée héritée ou un import pourrait en
   * produire un. Dans ce cas on retombe sur le prix ferme plutôt que
   * d'imposer au serveur une étape à choix unique.
   */
  return !!options && options.length > 1;
}

/**
 * Ce qu'on affiche à la place d'un prix unique.
 *
 * ⭐ UNE FOURCHETTE, pas le prix le plus bas ni celui du premier format :
 * « à partir de 1 000 F » sous-estime la carte, et le prix du premier format
 * serait arbitraire. La fourchette dit la vérité sans rien trancher.
 */
export function formatPriceRange(
  options: DishPriceOptionRow[],
  formatPrice: (v: number) => string
): string {
  const prices = options.map((o) => o.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // ⚠️ Deux formats au MÊME prix est légitime (« Grand » et « Familial » à
  // 2 000 F) : afficher « 2 000 - 2 000 F » serait absurde.
  if (min === max) return formatPrice(min);

  return `${formatPrice(min)} - ${formatPrice(max)}`;
}

/**
 * Prix effectif d'une ligne : celui du format choisi, sinon celui du plat.
 *
 * ⚠️ INDICATIF CÔTÉ CLIENT UNIQUEMENT. Le prix FAISANT FOI est relu en base
 * par `create_kitchen_order` — le client n'envoie qu'un identifiant, jamais un
 * montant. Cette fonction sert à l'affichage du panier, pas à la facturation.
 */
export function effectivePrice(
  dishPrice: number,
  option: DishPriceOptionRow | undefined
): number {
  return option?.price ?? dishPrice;
}
