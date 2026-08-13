/**
 * kitchenCart.test.ts
 *
 * ⭐⭐ PANIER CUISINE — état séparé du panier boissons (§3, §16.7).
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE EN PRIORITÉ : qu'un plat « coupé » n'entre
 * JAMAIS dans une commande. Le serveur l'annoncerait au client, le cuisinier
 * découvrirait qu'il ne peut pas le produire, et le client attendrait un plat
 * qui n'existe pas.
 *
 * ⚠️ Le sous-total est INDICATIF : ces plats ne sont pas encore vendus, leur
 * vente naît au `serve` (§6). Un test le verrouille pour que personne ne le
 * confonde un jour avec du CA encaissé.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKitchenCart } from '../../hooks/useKitchenCart';
import type { DishRow } from '../../services/supabase/dishes.service';

const makeDish = (over: Partial<DishRow> = {}): DishRow =>
  ({
    id: 'dish-1',
    bar_id: 'bar-1',
    name: 'Poulet braisé',
    category_id: null,
    price: 2500,
    production_mode: 'on_order',
    preparation_time_min: 30,
    is_batch_base: false,
    portions_per_batch: null,
    is_available: true,
    photo_url: null,
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }) as DishRow;

describe('useKitchenCart', () => {
  describe('⛔ Un plat COUPÉ n\'entre pas dans la commande', () => {
    it('refuse l\'ajout d\'un plat non disponible', () => {
      // ⚠️ LE test le plus important du fichier. Sans cette garde, le serveur
      // annoncerait au client un plat que la cuisine ne peut pas produire.
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish({ is_available: false }));
      });

      expect(
        result.current.kitchenItems,
        'Un plat coupé a été ajouté — le client attendrait un plat qui n\'existe pas'
      ).toHaveLength(0);
    });

    it('✅ accepte un plat disponible', () => {
      // ⚠️ Volet indispensable : sans lui, un `addDish` qui ne ferait RIEN
      // passerait l'assertion précédente.
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
      });

      expect(result.current.kitchenItems).toHaveLength(1);
    });
  });

  describe('Quantités', () => {
    it('un second ajout incrémente au lieu de dupliquer', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
        result.current.addDish(makeDish());
      });

      expect(result.current.kitchenItems).toHaveLength(1);
      expect(result.current.kitchenItems[0].quantity).toBe(2);
      expect(result.current.kitchenItemCount).toBe(2);
    });

    it('⭐ une quantité à 0 RETIRE la ligne', () => {
      // ⚠️ Laisser une ligne à 0 enverrait une commande de zéro plat en
      // cuisine — le cuisinier verrait une carte vide dans sa file.
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
      });
      act(() => {
        result.current.updateQuantity('dish-1', 0);
      });

      expect(result.current.kitchenItems).toHaveLength(0);
    });

    it('une quantité négative retire aussi la ligne', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
      });
      act(() => {
        result.current.updateQuantity('dish-1', -3);
      });

      expect(result.current.kitchenItems).toHaveLength(0);
    });

    it('expose les quantités par dish_id pour les pastilles', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
        result.current.addDish(makeDish({ id: 'dish-2', name: 'Riz sauce' }));
        result.current.addDish(makeDish());
      });

      expect(result.current.quantities).toEqual({ 'dish-1': 2, 'dish-2': 1 });
    });
  });

  describe('⭐ Sous-total — indicatif, pas du CA', () => {
    it('somme prix × quantité', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
        result.current.addDish(makeDish());
        result.current.addDish(makeDish({ id: 'dish-2', price: 1500 }));
      });

      // 2 × 2500 + 1 × 1500
      expect(result.current.kitchenTotal).toBe(6500);
    });

    it('un panier vide totalise 0', () => {
      const { result } = renderHook(() => useKitchenCart());

      expect(result.current.kitchenTotal).toBe(0);
      expect(result.current.kitchenItemCount).toBe(0);
    });
  });

  describe('Modificateurs', () => {
    it('⭐ « sans piment » est conservé sur la ligne', () => {
      // §9 : l'information qui coûte le plus cher quand elle est manquée.
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
      });
      act(() => {
        result.current.setModifiers('dish-1', ['sans piment']);
      });

      expect(result.current.kitchenItems[0].modifiers).toEqual(['sans piment']);
    });

    it('une liste vide efface les modificateurs', () => {
      // ⚠️ `undefined` plutôt qu'un tableau vide : le RPC reçoit alors une
      // absence, pas une liste de zéro élément à interpréter.
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
      });
      act(() => {
        result.current.setModifiers('dish-1', ['bien cuit']);
      });
      act(() => {
        result.current.setModifiers('dish-1', []);
      });

      expect(result.current.kitchenItems[0].modifiers).toBeUndefined();
    });
  });

  describe('Vidage', () => {
    it('clearKitchenCart vide tout', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
        result.current.addDish(makeDish({ id: 'dish-2' }));
      });
      act(() => {
        result.current.clearKitchenCart();
      });

      expect(result.current.kitchenItems).toHaveLength(0);
      expect(result.current.kitchenTotal).toBe(0);
    });

    it('removeDish ne retire QUE la ligne visée', () => {
      const { result } = renderHook(() => useKitchenCart());

      act(() => {
        result.current.addDish(makeDish());
        result.current.addDish(makeDish({ id: 'dish-2', name: 'Riz sauce' }));
      });
      act(() => {
        result.current.removeDish('dish-1');
      });

      expect(result.current.kitchenItems).toHaveLength(1);
      expect(result.current.kitchenItems[0].dish.id).toBe('dish-2');
    });
  });
});
