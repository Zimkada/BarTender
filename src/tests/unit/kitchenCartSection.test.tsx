/**
 * kitchenCartSection.test.tsx
 *
 * ⭐⭐ SECTION CUISINE DU PANIER — §16.7, §6.
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE EN PRIORITÉ : la mention de PAIEMENT DIFFÉRÉ.
 * Sans elle, le serveur lit un total, choisit un moyen de paiement, et croit
 * la commande entièrement réglée. Les plats seraient servis sans jamais être
 * encaissés — une perte invisible, puisque la vente n'existe simplement pas.
 *
 * ⚠️ Le second enjeu est l'invariance (§3) : sur un bar pur, `items` est vide
 * et la section ne doit rendre RIEN — pas un en-tête vide, pas un sous-total
 * à 0.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KitchenCartSection } from '../../components/cart/KitchenCartSection';
import type { KitchenCartItem } from '../../hooks/useKitchenCart';
import type { DishRow } from '../../services/supabase/dishes.service';

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({ formatPrice: (v: number) => `${v} FCFA` }),
}));

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

const renderSection = (items: KitchenCartItem[], subtotal = 2500) =>
  render(
    <KitchenCartSection
      items={items}
      onUpdateQuantity={vi.fn()}
      onRemove={vi.fn()}
      subtotal={subtotal}
    />
  );

describe('KitchenCartSection', () => {
  describe('⛔ Panier cuisine VIDE — la section n\'existe pas (§3)', () => {
    it('ne rend AUCUN élément', () => {
      const { container } = renderSection([]);

      expect(
        container.firstChild,
        'La section cuisine se rend alors qu\'aucun plat n\'est commandé — un bar pur verrait un bloc vide'
      ).toBeNull();
    });
  });

  describe('⭐⭐ Le paiement différé est DIT', () => {
    it('annonce que les plats seront encaissés au service', () => {
      // ⚠️ LE test le plus important. Le moyen de paiement choisi plus bas ne
      // vaut que pour les boissons : un plat est encaissé au `serve` (§6).
      renderSection([{ dish: makeDish(), quantity: 1 }]);

      expect(
        screen.getByText(/encaissés au moment où ils seront servis/i),
        'La mention de paiement différé a disparu — le serveur croirait la commande entièrement réglée'
      ).toBeTruthy();
    });

    it('affiche le sous-total cuisine séparément', () => {
      renderSection([{ dish: makeDish(), quantity: 2 }], 5000);

      expect(screen.getByText(/sous-total cuisine/i)).toBeTruthy();
      expect(screen.getByText('5000 FCFA')).toBeTruthy();
    });
  });

  describe('Contenu des lignes', () => {
    it('affiche le plat, son prix unitaire et sa quantité', () => {
      renderSection([{ dish: makeDish(), quantity: 3 }]);

      expect(screen.getByText('Poulet braisé')).toBeTruthy();
      expect(screen.getByText(/2500 FCFA × 3/)).toBeTruthy();
    });

    it('⭐ les modificateurs restent VISIBLES', () => {
      // §9 : dernière occasion de corriger « sans piment » avant que la
      // commande ne parte en cuisine.
      renderSection([
        { dish: makeDish(), quantity: 1, modifiers: ['sans piment', 'bien cuit'] },
      ]);

      expect(screen.getByText(/sans piment • bien cuit/i)).toBeTruthy();
    });

    it('⭐ annonce le délai le PLUS LONG de la commande', () => {
      // Les plats sont préparés en parallèle : c'est le plus lent qui
      // détermine l'attente réelle du client.
      renderSection([
        { dish: makeDish({ preparation_time_min: 15 }), quantity: 1 },
        { dish: makeDish({ id: 'd2', preparation_time_min: 45 }), quantity: 1 },
      ]);

      expect(screen.getByText(/~45 min/)).toBeTruthy();
      expect(screen.queryByText(/~15 min/)).toBeNull();
    });

    it('n\'affiche pas de délai si aucun plat n\'en déclare', () => {
      renderSection([
        { dish: makeDish({ preparation_time_min: null }), quantity: 1 },
      ]);

      expect(screen.queryByText(/min/)).toBeNull();
    });
  });

  describe('Actions', () => {
    it('permet de retirer une ligne', () => {
      const onRemove = vi.fn();
      render(
        <KitchenCartSection
          items={[{ dish: makeDish(), quantity: 1 }]}
          onUpdateQuantity={vi.fn()}
          onRemove={onRemove}
          subtotal={2500}
        />
      );

      screen.getByLabelText(/supprimer poulet braisé/i).click();

      expect(onRemove).toHaveBeenCalledWith('dish-1');
    });

    it('permet d\'ajuster la quantité dans les deux sens', () => {
      const onUpdateQuantity = vi.fn();
      render(
        <KitchenCartSection
          items={[{ dish: makeDish(), quantity: 2 }]}
          onUpdateQuantity={onUpdateQuantity}
          onRemove={vi.fn()}
          subtotal={5000}
        />
      );

      screen.getByLabelText(/ajouter un poulet braisé/i).click();
      expect(onUpdateQuantity).toHaveBeenCalledWith('dish-1', 3);

      screen.getByLabelText(/retirer un poulet braisé/i).click();
      expect(onUpdateQuantity).toHaveBeenCalledWith('dish-1', 1);
    });
  });
});
