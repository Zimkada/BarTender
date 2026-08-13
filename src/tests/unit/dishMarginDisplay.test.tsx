/**
 * dishMarginDisplay.test.tsx
 *
 * ⭐⭐ COÛT NUL ≠ COÛT CONNU — défaut signalé en test terrain le 04/08/2026.
 *
 * Un plat dont aucun ingrédient n'a de prix connu renvoie `total_cost = 0`,
 * donc une marge de 100 %. Affichée en VERT, elle se lit « plat très
 * rentable » — la lecture exactement inverse de la réalité, qui est « je ne
 * sais pas encore ce que ce plat coûte ».
 *
 * ⚠️ Un plat gratuit à produire N'EXISTE PAS : tout ce qui compose une
 * assiette a été acheté. Un coût à 0 signale donc TOUJOURS une donnée
 * manquante, jamais une bonne nouvelle.
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE : que le promoteur ne prenne jamais une
 * décision de prix sur une marge inventée. C'est le livrable de la phase 2
 * (« découvrir la marge réelle de ses plats ») qui se joue là.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeEditor } from '../../components/kitchen/RecipeEditor';
import type { DishRow, DishCostResult } from '../../services/supabase/dishes.service';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({
    formatPrice: (v: number) => `${v} FCFA`,
  }),
}));

const dish = {
  id: 'dish-1',
  bar_id: 'bar-1',
  name: 'Poulet braisé',
  price: 2500,
  is_available: true,
  is_batch_base: false,
  production_mode: 'on_order',
  category_id: null,
  photo_url: null,
  preparation_time_min: 30,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
} as unknown as DishRow;

const ingredients: IngredientWithAlerts[] = [
  {
    id: 'ing-poulet',
    bar_id: 'bar-1',
    name: 'Poulet',
    unit: 'pièce',
    cost_mode: 'direct',
    flat_cost_per_dish: null,
    current_stock: 0,
    last_unit_cost: null,
    min_stock_alert: null,
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    isLowStock: false,
    hasDebt: false,
    expiringLotsCount: 0,
  },
];

/** Construit un résultat de coût serveur. */
const makeCost = (over: Partial<DishCostResult> = {}): DishCostResult =>
  ({
    success: true,
    dish_id: 'dish-1',
    dish_name: 'Poulet braisé',
    price: 2500,
    total_cost: 2000,
    margin: 500,
    margin_rate: 20,
    has_estimated_cost: false,
    estimated_reason: null,
    lines: [],
    line_count: 1,
    ...over,
  }) as DishCostResult;

const renderEditor = (cost?: DishCostResult) =>
  render(
    <RecipeEditor
      dish={dish}
      recipe={[]}
      ingredients={ingredients}
      cost={cost}
      isLoadingCost={false}
      isSaving={false}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onCreateIngredient={vi.fn()}
      isCreatingIngredient={false}
    />
  );

describe('Affichage de la marge d\'un plat', () => {
  describe('⭐⭐ Coût inconnu — jamais présenté comme une marge', () => {
    it('⛔ n\'affiche PAS « 100 % » quand le coût est à 0', () => {
      // ⚠️ LE test du défaut terrain : recette saisie, ingrédients jamais
      // approvisionnés. Le serveur renvoie 0, donc 100 % de marge.
      renderEditor(makeCost({ total_cost: 0, margin: 2500, margin_rate: 100 }));

      expect(
        screen.queryByText(/100 %/),
        'Une marge de 100 % est affichée alors que le coût est simplement INCONNU — le promoteur lirait « plat très rentable »'
      ).toBeNull();
    });

    it('dit explicitement que le coût est inconnu', () => {
      renderEditor(makeCost({ total_cost: 0, margin: 2500, margin_rate: 100 }));

      expect(screen.getByText(/coût inconnu/i)).toBeTruthy();
    });

    it('⭐ indique QUOI FAIRE, pas seulement ce qui manque', () => {
      // Un constat sans action laisse le promoteur devant un écran qui
      // l'accuse sans l'aider.
      renderEditor(makeCost({ total_cost: 0, margin: 2500, margin_rate: 100 }));

      expect(screen.getByText(/approvisionnement/i)).toBeTruthy();
    });

    it('rappelle le prix de vente, seule donnée connue', () => {
      renderEditor(makeCost({ total_cost: 0, margin: 2500, margin_rate: 100 }));

      expect(screen.getByText(/2500 FCFA/)).toBeTruthy();
    });
  });

  describe('✅ Coût connu — la marge s\'affiche normalement', () => {
    // ⚠️ Volet indispensable : sans lui, masquer TOUJOURS la marge passerait
    // les assertions précédentes — le test mesurerait du vide.
    it('affiche le taux quand le coût est réel', () => {
      renderEditor(makeCost());

      expect(screen.getByText(/20 %/)).toBeTruthy();
      expect(screen.getByText(/2000 FCFA/)).toBeTruthy();
    });

    it('⭐ signale une marge FAIBLE sous le seuil', () => {
      renderEditor(makeCost({ margin_rate: 20 }));

      expect(screen.getByText(/marge faible/i)).toBeTruthy();
    });

    it('ne signale rien sur une marge saine', () => {
      renderEditor(makeCost({ total_cost: 700, margin: 1800, margin_rate: 72 }));

      expect(screen.queryByText(/marge faible/i)).toBeNull();
      expect(screen.getByText(/72 %/)).toBeTruthy();
    });

    it('⚠️ un plat OFFERT (prix 0) affiche « — », jamais 0 %', () => {
      // `margin_rate` est NULL côté serveur : un taux n'a pas de sens
      // mathématique quand le prix est nul. Mais le coût, lui, est CONNU —
      // ce cas ne doit donc pas basculer dans « coût inconnu ».
      renderEditor(
        makeCost({ price: 0, total_cost: 700, margin: -700, margin_rate: null })
      );

      expect(screen.getByText(/—/)).toBeTruthy();
    });
  });

  describe('⚠️ Coût partiellement estimé', () => {
    it('signale l\'estimation sans masquer la marge', () => {
      // Distinct du coût INCONNU : ici une partie des ingrédients est
      // valorisée. La marge a un sens, mais elle est approximative.
      renderEditor(
        makeCost({ has_estimated_cost: true, estimated_reason: ['Piment'] })
      );

      expect(screen.getByText(/coût estimé/i)).toBeTruthy();
      expect(screen.getByText(/piment/i)).toBeTruthy();
      // ⭐ La marge reste affichée : approximative n'est pas inconnue.
      expect(screen.getByText(/20 %/)).toBeTruthy();
    });
  });
});
