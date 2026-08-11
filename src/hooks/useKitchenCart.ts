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
import type { DishRow, DishPriceOptionRow } from '../services/supabase/dishes.service';

export interface KitchenCartItem {
  dish: DishRow;
  quantity: number;
  /**
   * « sans piment », « bien cuit ». L'information qui coûte le plus cher
   * quand elle est manquée (§9) — une assiette refaite.
   */
  modifiers?: string[];
  /**
   * ⭐ §19.5 — format choisi, `undefined` pour un plat à prix ferme.
   *
   * ⚠️ On garde l'OPTION ENTIÈRE et non son seul id : le panier doit afficher
   * « Grand — 2 000 F » sans re-chercher le libellé dans le plat à chaque
   * rendu. Seul l'`id` part au serveur, qui relit le prix en base.
   */
  priceOption?: DishPriceOptionRow;
}

/**
 * ⛔⛔ CLÉ DE LIGNE — LE DÉFAUT LE PLUS GRAVE QUE §19.5 AURAIT INTRODUIT.
 *
 * Le panier indexait sur `dish.id` SEUL. Un grand et un petit poisson y
 * fusionnaient donc en « 2 × Poisson braisé » au même prix, AVANT même
 * l'envoi au serveur : la perte de données était irrattrapable côté base.
 *
 * ⭐ Une clé COMPOSITE, et une fonction unique plutôt qu'une comparaison à
 * deux champs répétée dans cinq fonctions — c'est là que les divergences
 * s'installent.
 *
 * ⚠️ Les MODIFICATEURS n'entrent PAS dans la clé, volontairement : « sans
 * piment » se règle APRÈS l'ajout, sur une ligne existante. Les y inclure
 * empêcherait de retrouver la ligne qu'on vient de modifier.
 */
export function lineKey(dishId: string, priceOptionId?: string): string {
  return priceOptionId ? `${dishId}::${priceOptionId}` : dishId;
}

function itemKey(item: KitchenCartItem): string {
  return lineKey(item.dish.id, item.priceOption?.id);
}

export function useKitchenCart() {
  const [items, setItems] = useState<KitchenCartItem[]>([]);

  const addDish = useCallback((dish: DishRow, priceOption?: DishPriceOptionRow) => {
    /**
     * ⛔ MIROIR EXACT de la passe 1 de `create_kitchen_order`, qui exige
     * `is_active` ET `is_available`.
     *
     * ⚠️ `is_active` AJOUTÉ à la code review du 04/08/2026 : la garde était
     * asymétrique. Le filtrage `is_active` vivait dans `HomePage`, donc un
     * plat retiré du menu n'apparaissait pas — mais toute autre source
     * appelant `addDish` (QuickSaleFlow, un futur écran) l'aurait laissé
     * entrer. L'erreur ne serait tombée qu'à la validation, APRÈS que le
     * serveur l'ait annoncé au client.
     *
     * ⚠️ Les deux champs disent des choses DIFFÉRENTES :
     *   is_active    → le plat existe-t-il au menu ? (suppression logique)
     *   is_available → est-il servable ce soir ? (« coupé », §9)
     * Un plat coupé reste VISIBLE dans la grille — le serveur doit pouvoir
     * dire « c'est terminé ». Un plat inactif n'y est plus du tout.
     */
    if (!dish.is_active || !dish.is_available) return;

    const key = lineKey(dish.id, priceOption?.id);

    setItems((current) => {
      const existing = current.find((i) => itemKey(i) === key);
      if (existing) {
        return current.map((i) =>
          itemKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...current, { dish, quantity: 1, priceOption }];
    });
  }, []);

  /**
   * ⚠️ SIGNATURE ÉLARGIE (§19.5) : ces quatre fonctions prennent désormais la
   * CLÉ DE LIGNE, pas un `dishId`. Un même plat peut occuper plusieurs lignes
   * (un Grand et un Petit) — agir par `dishId` toucherait les deux, ou la
   * mauvaise.
   */
  const updateQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) => {
      // ⚠️ Quantité nulle ou négative = retrait. Laisser une ligne à 0
      // enverrait une commande de zéro plat en cuisine.
      if (quantity <= 0) return current.filter((i) => itemKey(i) !== key);
      return current.map((i) => (itemKey(i) === key ? { ...i, quantity } : i));
    });
  }, []);

  const removeDish = useCallback((key: string) => {
    setItems((current) => current.filter((i) => itemKey(i) !== key));
  }, []);

  const setModifiers = useCallback((key: string, modifiers: string[]) => {
    setItems((current) =>
      current.map((i) =>
        itemKey(i) === key
          ? { ...i, modifiers: modifiers.length > 0 ? modifiers : undefined }
          : i
      )
    );
  }, []);

  const clearKitchenCart = useCallback(() => setItems([]), []);

  /**
   * Quantités par `dish_id` — alimente les pastilles de `DishGrid`.
   *
   * ⭐ §19.5 — on CUMULE les formats d'un même plat : la grille montre une
   * carte par PLAT, pas par format. Un Grand et deux Petits doivent y afficher
   * « 3 ». Une affectation simple (`map[id] = qty`) écraserait le premier
   * format par le second et sous-compterait la pastille.
   */
  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.dish.id] = (map[item.dish.id] ?? 0) + item.quantity;
    }
    return map;
  }, [items]);

  /**
   * ⚠️ Sous-total INDICATIF, à deux titres.
   *
   * 1. Ces plats ne sont PAS encore vendus : leur vente naît au `serve` (§6).
   *    Le montant dit ce que le client paiera, pas ce qui est encaissé.
   *
   * 2. ⭐ Le prix FAISANT FOI est `dishes.price` LU PAR LE SERVEUR à la
   *    commande — `create_kitchen_order` insère `d.price`, jamais la valeur
   *    envoyée par le client. Si le promoteur re-tarife un plat entre la
   *    sélection et la validation, ce total diverge de la commande réelle.
   *    Écart marginal (quelques secondes, prix rarement changé en plein
   *    service) et sans risque : le serveur est la seule autorité. Ajouter un
   *    rafraîchissement à chaque frappe coûterait plus que le défaut évité.
   */
  const kitchenTotal = useMemo(
    // ⭐ §19.5 — prix du FORMAT choisi, sinon celui du plat. Sommer
    // `dish.price` afficherait le prix technique d'un plat à formats.
    () => items.reduce((sum, i) => sum + (i.priceOption?.price ?? i.dish.price) * i.quantity, 0),
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
    /**
     * ⭐ §19.5 — EXPOSÉE pour que l'UI identifie une ligne du panier.
     * Le composant ne doit pas reconstruire cette clé lui-même : deux
     * implémentations finiraient par diverger, et les lignes deviendraient
     * intouchables.
     */
    lineKey,
  };
}
