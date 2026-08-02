/**
 * SupplyForm.test.tsx
 *
 * ⭐ DEUX COMPORTEMENTS PORTENT LA VALEUR DE CE FORMULAIRE :
 *
 * 1. La CLÉ D'IDEMPOTENCE est STABLE pendant toute la saisie. Générée au clic,
 *    chaque double-clic produirait sa propre clé — donc deux lots, un stock
 *    doublé, une marge fausse, SANS aucune erreur visible.
 *
 * 2. La CONVERSION conditionnement → unité de stock est juste. Une erreur ici
 *    fausserait le coût matière que tout le module promet d'être exact.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupplyForm, type SupplyFormValues } from '../../components/kitchen/SupplyForm';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({
    formatPrice: (value: number) => `${value} FCFA`,
  }),
}));

const makeIngredient = (over: Partial<IngredientWithAlerts> = {}): IngredientWithAlerts => ({
  id: 'ing-riz',
  bar_id: 'bar-1',
  name: 'Riz',
  unit: 'kg',
  cost_mode: 'direct',
  flat_cost_per_dish: null,
  current_stock: 10,
  last_unit_cost: 500,
  min_stock_alert: null,
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  isLowStock: false,
  hasDebt: false,
  expiringLotsCount: 0,
  ...over,
});

/** Remplit le formulaire : 2 sacs de 25 kg à 12 000 F le sac. */
const fillForm = (opts?: { count?: string; size?: string; price?: string }) => {
  fireEvent.change(screen.getByLabelText(/ingrédient/i), { target: { value: 'ing-riz' } });
  fireEvent.change(screen.getByLabelText(/nombre de conditionnements/i), {
    target: { value: opts?.count ?? '2' },
  });
  fireEvent.change(screen.getByLabelText(/contenu/i), { target: { value: opts?.size ?? '25' } });
  fireEvent.change(screen.getByLabelText(/prix payé/i), {
    target: { value: opts?.price ?? '12000' },
  });
};

describe('SupplyForm', () => {
  // ⚠️ Types explicites : `ReturnType<typeof vi.fn>` produit une signature
  // trop large que TypeScript refuse d'assigner aux props du composant.
  let onSubmit: Mock<(values: SupplyFormValues) => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onCancel = vi.fn();
  });

  const renderForm = (ingredients = [makeIngredient()]) =>
    render(<SupplyForm ingredients={ingredients} onSubmit={onSubmit} onCancel={onCancel} />);

  describe('⭐ Conversion conditionnement → unité de stock', () => {
    it('2 sacs de 25 kg à 12 000 F → 50 kg à 480 F/kg', () => {
      renderForm();
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const values = onSubmit.mock.calls[0][0];

      expect(values.qty).toBe(50);        // 2 × 25
      expect(values.unitCost).toBe(480);  // 12000 / 25
    });

    it('⚠️ un prix non divisible n\'est PAS arrondi', () => {
      // 10 000 / 3 = 3333,33… Arrondir ici ferait dériver le coût matière à
      // chaque livraison — le RPC accepte les décimales, on les lui passe.
      renderForm();
      fillForm({ count: '1', size: '3', price: '10000' });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      const values = onSubmit.mock.calls[0][0];
      expect(values.unitCost).toBeCloseTo(3333.333, 2);
    });

    it('⚠️ un conditionnement à 0 ne produit pas Infinity', () => {
      // Sans garde, 12000 / 0 = Infinity remonterait jusqu'au RPC.
      renderForm();
      fillForm({ size: '0' });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(onSubmit, 'Une taille nulle doit bloquer la soumission').not.toHaveBeenCalled();
    });

    it('affiche le récapitulatif de ce qui sera enregistré', () => {
      renderForm();
      fillForm();

      // La conversion doit être VISIBLE : un calcul silencieux oblige à faire
      // confiance, celui-ci se vérifie d'un coup d'œil.
      expect(screen.getByText(/50 kg/)).toBeTruthy();
      expect(screen.getByText(/24000 FCFA/)).toBeTruthy(); // 2 × 12000
    });
  });

  describe('⭐ Clé d\'idempotence', () => {
    it('reste STABLE pendant toute la saisie', () => {
      renderForm();

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
      const firstKey = onSubmit.mock.calls[0][0].idempotencyKey;

      expect(firstKey).toBeTruthy();
      expect(firstKey.length).toBeGreaterThan(10);
    });

    it('⛔ un DOUBLE-CLIC envoie la MÊME clé', () => {
      // ⭐ LE test qui justifie tout le mécanisme. Régénérer la clé à la
      // soumission — le réflexe naturel — ANNULERAIT la protection : deux
      // clics produiraient deux clés, donc deux lots, donc un stock doublé.
      // La clé ne se renouvelle qu'après un succès CONFIRMÉ (resetSignal).
      renderForm();
      fillForm();

      const submit = screen.getByRole('button', { name: /enregistrer/i });
      fireEvent.click(submit);
      fireEvent.click(submit);

      expect(onSubmit).toHaveBeenCalledTimes(2);
      const key1 = onSubmit.mock.calls[0][0].idempotencyKey;
      const key2 = onSubmit.mock.calls[1][0].idempotencyKey;

      expect(
        key2,
        'Un double-clic doit envoyer la MÊME clé — sinon deux lots sont créés'
      ).toBe(key1);
    });

    it('resetSignal renouvelle la clé pour une seconde livraison', () => {
      // Sans renouvellement, la deuxième livraison serait vue comme un rejeu
      // de la première et silencieusement ignorée par le RPC.
      const { rerender } = render(
        <SupplyForm
          ingredients={[makeIngredient()]}
          onSubmit={onSubmit}
          onCancel={onCancel}
          resetSignal={0}
        />
      );

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
      const key1 = onSubmit.mock.calls[0][0].idempotencyKey;

      // Le parent confirme l'enregistrement et prépare la saisie suivante.
      rerender(
        <SupplyForm
          ingredients={[makeIngredient()]}
          onSubmit={onSubmit}
          onCancel={onCancel}
          resetSignal={1}
        />
      );

      fillForm({ count: '3' });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
      const key2 = onSubmit.mock.calls[1][0].idempotencyKey;

      expect(key2).not.toBe(key1);
    });
  });

  describe('🚨 Avertissement de dette', () => {
    it('⭐ signale qu\'un stock négatif sera soldé EN PREMIER', () => {
      // §13.2 : le RPC solde les dettes avant de créer le lot. Sans cet
      // avertissement, le gérant s'étonnerait d'un stock final inférieur à
      // ce qu'il a saisi.
      renderForm([makeIngredient({ hasDebt: true, current_stock: -4 })]);
      fireEvent.change(screen.getByLabelText(/ingrédient/i), { target: { value: 'ing-riz' } });

      expect(screen.getByText(/soldera d'abord le manque/i)).toBeTruthy();
    });

    it('aucun avertissement sur un stock sain', () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/ingrédient/i), { target: { value: 'ing-riz' } });

      expect(screen.queryByText(/soldera d'abord le manque/i)).toBeNull();
    });
  });

  describe('⛔ Validation', () => {
    it('ne soumet pas sans ingrédient', () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/nombre de conditionnements/i), {
        target: { value: '2' },
      });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('ne soumet pas une quantité nulle', () => {
      renderForm();
      fillForm({ count: '0' });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('permet d\'annuler', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });
});
