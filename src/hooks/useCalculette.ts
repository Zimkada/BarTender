/**
 * useCalculette — sélection de produits et de plats pour CHIFFRER, jamais vendre.
 *
 * ⭐ POURQUOI UN ÉTAT À PART ET NON `useCart` / `useKitchenCart` :
 *
 *   `useKitchenCart` refuse en dur un plat `is_available = false` (« coupé »).
 *   Garde JUSTE pour une commande — le client attendrait une assiette
 *   impossible. Mais ANNONCER le prix d'un plat coupé est légitime : « c'est
 *   2 500, mais c'est terminé pour ce soir ». Son test se déclare « LE test le
 *   plus important du fichier » ; on ne l'ouvre pas, on ne passe pas par lui.
 *
 *   `useCart` aurait convenu pour les boissons (`maxStockLookup` est
 *   optionnel), mais il faudrait de toute façon ce fichier pour les plats, et
 *   deux hooks pour un seul écran dont les deux moitiés doivent se vider
 *   ensemble multiplieraient les points d'oubli.
 *
 * ⛔ CE HOOK N'ÉCRIT RIEN. Pas de mutation, pas de service, pas de stock
 * décrémenté. Sa seule sortie est un nombre à lire à voix haute.
 *
 * ⭐ `lineKey` est IMPORTÉ de `useKitchenCart`, jamais réécrit : un même plat
 * peut occuper deux lignes (un Grand et un Petit), et cette clé composite a
 * déjà coûté un défaut grave en revue. Deux copies divergeraient.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Product, CartItem } from '../types';
import type { DishRow, DishPriceOptionRow } from '../services/supabase/dishes.service';
import { lineKey } from './useKitchenCart';
import { useCartLogic } from './useCartLogic';

export interface CalculetteDishLine {
  dish: DishRow;
  quantity: number;
  /** Format choisi — `undefined` pour un plat à prix ferme. */
  priceOption?: DishPriceOptionRow;
}

export function useCalculette(barId?: string) {
  /**
   * ⭐ Les produits sont stockés en `CartItem` — le type est trivial
   * (`{ product, quantity }`, le reste optionnel) et c'est ce qui permet de
   * passer la liste telle quelle à `useCartLogic`, donc d'obtenir les
   * PROMOTIONS du bar sans en réimplémenter une ligne.
   */
  const [productLines, setProductLines] = useState<CartItem[]>([]);
  const [dishLines, setDishLines] = useState<CalculetteDishLine[]>([]);

  /**
   * ⛔⛔ PURGE AU CHANGEMENT DE BAR — SANS ELLE L'ÉCRAN MENT.
   *
   * `BarSelector` vit dans le `Header`, au-dessus de l'`Outlet` : changer de
   * bar NE DÉMONTE PAS cette page. Les lignes du bar A resteraient donc à
   * l'écran pendant que `useCartLogic` leur applique les PROMOTIONS DU BAR B
   * — un total qui ne correspond à aucun des deux bars, sous une grille qui
   * affiche déjà le catalogue de B.
   *
   * ⚠️ `AppProvider` vide ses DEUX paniers sur `[currentBar?.id]` pour
   * exactement cette raison (« éviter les mélanges »). Cet état est le
   * troisième du même genre ; il lui fallait la même garde.
   */
  useEffect(() => {
    setProductLines([]);
    setDishLines([]);
  }, [barId]);

  /**
   * @param quantity REMPLACE la quantité de la ligne (pavé), comme partout
   * ailleurs dans l'app. Absente : +1. Un double tap sur « 6 » laisse 6.
   *
   * ⭐ AUCUNE garde de stock : un produit épuisé reste chiffrable. C'est le
   * cas d'usage même — on annonce un prix, on ne sert pas.
   */
  const addProduct = useCallback((product: Product, quantity?: number) => {
    // ⛔ Quantité explicite ≤ 0 = refus, jamais un retrait déguisé : le retrait
    // a sa fonction dédiée (`setProductQuantity`), visible et réversible.
    if (quantity !== undefined && quantity <= 0) return;

    setProductLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      if (existing) {
        return current.map((l) =>
          l.product.id === product.id
            ? { ...l, quantity: quantity !== undefined ? quantity : l.quantity + 1 }
            : l
        );
      }
      return [...current, { product, quantity: quantity ?? 1 }];
    });
  }, []);

  const setProductQuantity = useCallback((productId: string, quantity: number) => {
    setProductLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.product.id !== productId)
        : current.map((l) => (l.product.id === productId ? { ...l, quantity } : l))
    );
  }, []);

  /**
   * ⭐ Le plat COUPÉ (`is_available = false`) est accepté — voir l'en-tête.
   *
   * ⛔ MAIS `is_active` EST REFUSÉ, en miroir de `useKitchenCart` : un plat
   * retiré du menu n'a aucun prix à annoncer au client. La garde vit ICI et
   * pas seulement dans le filtre de la page — `useDishes` accepte un
   * `includeRetired`, et une future source d'appel n'aurait aucune raison de
   * deviner cette règle. C'est l'asymétrie exacte qu'une revue du 04/08/2026 a
   * corrigée dans le hook voisin.
   *
   * ⚠️ La quantité s'applique à la LIGNE (plat + format) : un Grand à 6 laisse
   * le Petit intact.
   */
  const addDish = useCallback((dish: DishRow, priceOption?: DishPriceOptionRow, quantity?: number) => {
    if (!dish.is_active) return;
    if (quantity !== undefined && quantity <= 0) return;

    const key = lineKey(dish.id, priceOption?.id);
    setDishLines((current) => {
      const existing = current.find((l) => lineKey(l.dish.id, l.priceOption?.id) === key);
      if (existing) {
        return current.map((l) =>
          lineKey(l.dish.id, l.priceOption?.id) === key
            ? { ...l, quantity: quantity !== undefined ? quantity : l.quantity + 1 }
            : l
        );
      }
      return [...current, { dish, quantity: quantity ?? 1, priceOption }];
    });
  }, []);

  const setDishQuantity = useCallback((key: string, quantity: number) => {
    setDishLines((current) =>
      quantity <= 0
        ? current.filter((l) => lineKey(l.dish.id, l.priceOption?.id) !== key)
        : current.map((l) =>
            lineKey(l.dish.id, l.priceOption?.id) === key ? { ...l, quantity } : l
          )
    );
  }, []);

  const clear = useCallback(() => {
    setProductLines([]);
    setDishLines([]);
  }, []);

  /**
   * ⭐ PROMOTIONS : `useCartLogic` applique les promos actives du bar et
   * retourne le prix remisé ET le prix barré. Le chiffrage annonce donc le
   * prix que le client paiera RÉELLEMENT — l'ignorer ferait annoncer un
   * montant plus élevé que la caisse.
   */
  const { calculatedItems, total: productsTotal, totalDiscount } = useCartLogic({
    items: productLines,
    barId,
  });

  /**
   * ⭐⭐ PRIX UNITAIRE PROMOTIONNEL PAR PRODUIT, pour les CARTES de la grille.
   *
   * ⛔ SANS CECI L'ÉCRAN AFFICHE DEUX PRIX CONTRADICTOIRES. La carte montrerait
   * `product.price` (prix de base) pendant que le total du bas applique la
   * remise : sur « 2 achetés = -20 % », le serveur lit « 1 000 » sur la carte,
   * annonce « 4 000 pour 4 », et la barre affiche 3 200. Le panier de vente
   * échappe au piège parce qu'il LISTE chaque ligne avec son prix remisé ;
   * cette barre-ci n'affiche qu'un agrégat, donc la carte est le SEUL endroit
   * où un prix unitaire se lit.
   *
   * ⚠️ Indexé par `product.id` et non par ligne : une carte = un produit.
   */
  const productUnitPrices = useMemo(() => {
    const map: Record<string, { unit: number; original: number; hasPromotion: boolean }> = {};
    for (const item of calculatedItems) {
      map[item.product.id] = {
        unit: item.unit_price,
        original: item.original_unit_price,
        hasPromotion: item.hasPromotion,
      };
    }
    return map;
  }, [calculatedItems]);

  /**
   * ⚠️ Prix du FORMAT choisi, sinon celui du plat. `dish.price` est une valeur
   * TECHNIQUE quand le plat a des formats : la sommer afficherait un montant
   * qui ne correspond à aucune carte.
   *
   * ⛔ Pas de promotions sur les plats — elles ne s'y appliquent pas dans
   * l'app (arbitrage du 04/07/2026). Chiffrer ce que la caisse ferait payer
   * reste donc exact.
   */
  const dishesTotal = useMemo(
    () => dishLines.reduce((sum, l) => sum + (l.priceOption?.price ?? l.dish.price) * l.quantity, 0),
    [dishLines]
  );

  /** Quantités par `product.id` / `dish.id` — alimentent les pastilles des grilles. */
  const productQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of productLines) map[l.product.id] = l.quantity;
    return map;
  }, [productLines]);

  /**
   * ⭐ On CUMULE les formats d'un même plat : la grille montre une carte par
   * PLAT, pas par format. Un Grand et deux Petits doivent y afficher « 3 ».
   *
   * ⛔ C'est PRÉCISÉMENT pourquoi la carte d'un plat à formats doit passer
   * `padCurrentQuantity={0}` au pavé : celui-ci remplace UNE ligne, pas le
   * cumul.
   */
  const dishQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of dishLines) map[l.dish.id] = (map[l.dish.id] ?? 0) + l.quantity;
    return map;
  }, [dishLines]);

  const itemCount = useMemo(
    () =>
      productLines.reduce((s, l) => s + l.quantity, 0) +
      dishLines.reduce((s, l) => s + l.quantity, 0),
    [productLines, dishLines]
  );

  return {
    productLines: calculatedItems,
    dishLines,
    productQuantities,
    productUnitPrices,
    dishQuantities,
    total: productsTotal + dishesTotal,
    totalDiscount,
    itemCount,
    isEmpty: productLines.length === 0 && dishLines.length === 0,
    addProduct,
    setProductQuantity,
    addDish,
    setDishQuantity,
    clear,
    lineKey,
  };
}
