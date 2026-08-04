/**
 * useKitchenCart
 * Sélection de plats en cours de commande — pendant cuisine de `useCart`.
 *
 * ⭐⭐ ÉTAT SÉPARÉ, PAS UNE EXTENSION DE `CartItem` (§3).
 *
 * `CartItem.product` est typé `Product` et consommé par 11 fichiers du flux de
 * vente que TOUS les bars utilisent. Y faire entrer un plat — sans `stock`,
 * `volume` ni `categoryId` — traverserait tout ce code. Même profil de risque
 * que le renommage `product_id → item_id`, écarté pour les mêmes raisons.
 *
 * ⚠️ Sur un bar pur, ce hook n'est jamais monté : sa liste reste vide et
 * aucune section cuisine ne s'affiche. L'invariance est STRUCTURELLE.
 *
 * ⭐ VOLONTAIREMENT PLUS SIMPLE que `useCart` :
 *   pas de stock     — un plat n'en a pas (§ dispo = ingrédients, calculée
 *                      au `mark_ready` seulement)
 *   pas de promotion — hors périmètre V1 (§ promotions, arbitrage 04/07/2026)
 * Ajouter ces mécanismes « par symétrie » créerait du code sans usage.
 */

import { useState, useCallback, useMemo } from 'react';
import type { DishRow } from '../services/supabase/dishes.service';

export interface KitchenCartItem {
  dish: DishRow;
  quantity: number;
  /**
   * « sans piment », « bien cuit ». L'information qui coûte le plus cher
   * quand elle est manquée (§9) — une assiette refaite.
   */
  modifiers?: string[];
}

export function useKitchenCart() {
  const [items, setItems] = useState<KitchenCartItem[]>([]);

  const addDish = useCallback((dish: DishRow) => {
    // ⛔ Un plat « coupé » n'entre pas dans la commande. Le RPC le refuserait
    // de toute façon — autant ne pas laisser le serveur l'annoncer au client.
    if (!dish.is_available) return;

    setItems((current) => {
      const existing = current.find((i) => i.dish.id === dish.id);
      if (existing) {
        return current.map((i) =>
          i.dish.id === dish.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...current, { dish, quantity: 1 }];
    });
  }, []);

  const updateQuantity = useCallback((dishId: string, quantity: number) => {
    setItems((current) => {
      // ⚠️ Quantité nulle ou négative = retrait. Laisser une ligne à 0
      // enverrait une commande de zéro plat en cuisine.
      if (quantity <= 0) return current.filter((i) => i.dish.id !== dishId);
      return current.map((i) => (i.dish.id === dishId ? { ...i, quantity } : i));
    });
  }, []);

  const removeDish = useCallback((dishId: string) => {
    setItems((current) => current.filter((i) => i.dish.id !== dishId));
  }, []);

  const setModifiers = useCallback((dishId: string, modifiers: string[]) => {
    setItems((current) =>
      current.map((i) =>
        i.dish.id === dishId
          ? { ...i, modifiers: modifiers.length > 0 ? modifiers : undefined }
          : i
      )
    );
  }, []);

  const clearKitchenCart = useCallback(() => setItems([]), []);

  /** Quantités par `dish_id` — alimente les pastilles de `DishGrid`. */
  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) map[item.dish.id] = item.quantity;
    return map;
  }, [items]);

  /**
   * ⚠️ Sous-total INDICATIF. Ces plats ne sont PAS encore vendus : leur vente
   * naît au `serve` (§6). Le montant dit ce que le client paiera, pas ce qui
   * est encaissé — l'écran doit le formuler ainsi.
   */
  const kitchenTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.dish.price * i.quantity, 0),
    [items]
  );

  const kitchenItemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  return {
    kitchenItems: items,
    addDish,
    updateQuantity,
    removeDish,
    setModifiers,
    clearKitchenCart,
    quantities,
    kitchenTotal,
    kitchenItemCount,
  };
}
