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
  // ⚠️ Libellés en langage clair depuis le 04/08/2026 : « conditionnement »
  // était du vocabulaire de logistique. Le riz étant suivi en `kg` (unité de
  // MESURE), les deux niveaux restent visibles — cf. le volet « unité
  // dénombrable » plus bas, où le champ « contient » est masqué.
  fireEvent.change(screen.getByLabelText(/combien de lots/i), {
    target: { value: opts?.count ?? '2' },
  });
  fireEvent.change(screen.getByLabelText(/chaque lot contient/i), {
    target: { value: opts?.size ?? '25' },
  });
  fireEvent.change(screen.getByLabelText(/prix d'un lot/i), {
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
      fireEvent.change(screen.getByLabelText(/combien de lots/i), {
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

  /**
   * ⭐⭐ MODE D'ACHAT — décision du 04/08/2026, issue du test terrain.
   *
   * ⛔ REMPLACE une détection automatique sur la nature de l'unité
   * (« morceau ⟹ pas de contenant »), FAUSSE au premier contre-exemple : de
   * la viande ACHETÉE AU KILO mais SERVIE AU MORCEAU. Le suivi est en
   * morceaux, l'achat en kg, et c'est le champ « contient » qui porte la
   * conversion. Le masquer automatiquement supprimait le seul endroit où
   * cette conversion s'exprime.
   *
   * Le critère n'est pas l'unité mais le MODE D'ACHAT — que seul
   * l'utilisateur connaît. D'où une case à cocher, DÉCOCHÉE par défaut.
   */
  describe('⭐⭐ Mode d\'achat — la case décide, jamais l\'unité', () => {
    const viande = () =>
      makeIngredient({ id: 'ing-viande', name: 'Viande de boeuf', unit: 'morceau' });

    const selectViande = () => {
      renderForm([viande()]);
      fireEvent.change(screen.getByLabelText(/ingrédient/i), {
        target: { value: 'ing-viande' },
      });
    };

    it('⭐⭐ DÉCOCHÉ par défaut, même sur une unité dénombrable', () => {
      // ⚠️ LE test qui protège le cas « acheté au kilo, servi au morceau ».
      // Si le champ disparaissait automatiquement pour « morceau », il
      // deviendrait impossible de saisir « ce lot fait 33 morceaux ».
      selectViande();

      expect(
        screen.getByLabelText(/chaque lot contient/i),
        'Le champ de conversion a disparu sur une unité dénombrable — impossible de saisir un achat en gros'
      ).toBeTruthy();
    });

    it('⭐ acheté au kilo, suivi au morceau : 1 lot = 33 morceaux', () => {
      selectViande();
      fireEvent.change(screen.getByLabelText(/combien de lots/i), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText(/chaque lot contient/i), {
        target: { value: '33' },
      });
      fireEvent.change(screen.getByLabelText(/prix d'un lot/i), {
        target: { value: '60000' },
      });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      const values = onSubmit.mock.calls[0][0];
      expect(values.qty).toBe(33);
      // 60 000 / 33 — non arrondi, le coût matière dériverait sinon.
      expect(values.unitCost).toBeCloseTo(1818.18, 1);
    });

    it('coché : le champ disparaît et les libellés nomment l\'unité', () => {
      selectViande();
      fireEvent.click(screen.getByLabelText(/j'achète au morceau/i));

      expect(screen.queryByLabelText(/chaque lot contient/i)).toBeNull();
      expect(screen.getByLabelText(/combien de morceaux/i)).toBeTruthy();
      expect(screen.getByLabelText(/prix d'un morceau/i)).toBeTruthy();
    });

    it('⭐⭐ coché : soumet malgré le champ masqué — contenu forcé à 1', () => {
      // ⚠️ Le forçage est la partie CRITIQUE : la validation exige
      // `packageSize > 0`. Sans lui, le formulaire serait bloqué par un champ
      // INVISIBLE — « Enregistrer » sans effet, aucune cause visible.
      selectViande();
      fireEvent.click(screen.getByLabelText(/j'achète au morceau/i));
      fireEvent.change(screen.getByLabelText(/combien de morceaux/i), {
        target: { value: '3' },
      });
      fireEvent.change(screen.getByLabelText(/prix d'un morceau/i), {
        target: { value: '12000' },
      });
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

      expect(
        onSubmit,
        'Formulaire bloqué par un champ INVISIBLE — le forçage à 1 ne s\'applique pas'
      ).toHaveBeenCalledTimes(1);

      const values = onSubmit.mock.calls[0][0];
      expect(values.qty).toBe(3);            // 3 × 1
      expect(values.unitCost).toBe(12000);   // 12000 / 1
    });

    it('la case n\'apparaît PAS tant qu\'aucun ingrédient n\'est choisi', () => {
      // Elle nomme l'unité (« J'achète au morceau ») — sans ingrédient, elle
      // n'aurait rien à nommer.
      renderForm([viande()]);

      expect(screen.queryByLabelText(/j'achète au/i)).toBeNull();
    });
  });
});
