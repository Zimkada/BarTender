/**
 * useUnifiedKitchen.test.tsx
 *
 * ⭐ CE QU'ON TESTE : les calculs qui deviendront des décisions du promoteur.
 *
 * `expiringValue` répond à « combien vais-je perdre si je n'agis pas ». Un
 * chiffre faux ici serait pire qu'une absence de chiffre — il orienterait des
 * achats sur une base erronée.
 *
 * ⚠️ On teste aussi que le pivot HÉRITE de l'invariance §3 : monté sur un bar
 * pur, il ne doit émettre aucune requête. La garde vit dans les queries, mais
 * c'est ici qu'on vérifie qu'elle n'est pas contournée.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import type { IngredientRow, IngredientLotRow } from '../../services/supabase/ingredients.service';

// ===== Mocks =====

const mockGetIngredients = vi.fn<() => Promise<IngredientRow[]>>(() => Promise.resolve([]));
const mockGetExpiringLots = vi.fn<() => Promise<IngredientLotRow[]>>(() => Promise.resolve([]));

vi.mock('../../services/supabase/ingredients.service', () => ({
  IngredientsService: {
    getIngredients: () => mockGetIngredients(),
    getExpiringLots: () => mockGetExpiringLots(),
    getLotsFefo: vi.fn(() => Promise.resolve([])),
    getStockConsistencyViolations: vi.fn(() => Promise.resolve([])),
  },
}));

let mockHasRestaurant = true;
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    hasRestaurant: mockHasRestaurant,
  }),
}));

import { useUnifiedKitchen } from '../../hooks/pivots/useUnifiedKitchen';

const BAR_ID = 'bar-123';

const makeIngredient = (over: Partial<IngredientRow> = {}): IngredientRow => ({
  id: 'ing-1',
  bar_id: BAR_ID,
  name: 'Tomate',
  unit: 'kg',
  cost_mode: 'direct',
  flat_cost_per_dish: null,
  current_stock: 10,
  last_unit_cost: 500,
  min_stock_alert: null,
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
});

const makeLot = (over: Partial<IngredientLotRow> = {}): IngredientLotRow => ({
  id: 'lot-1',
  bar_id: BAR_ID,
  ingredient_id: 'ing-1',
  initial_qty: 10,
  remaining_qty: 10,
  unit_cost: 500,
  received_at: '2026-08-01T00:00:00Z',
  expires_at: '2026-08-05',
  business_date: '2026-08-01',
  status: 'active',
  discarded_qty: null,
  discarded_at: null,
  ...over,
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUnifiedKitchen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRestaurant = true;
    mockGetIngredients.mockResolvedValue([]);
    mockGetExpiringLots.mockResolvedValue([]);
  });

  describe('⭐ expiringValue — le chiffre qui déclenche l\'action', () => {
    it('valorise chaque lot à SON coût d\'achat, pas à une moyenne', async () => {
      // C'est ce que le FEFO permet et que le CUMP interdit : deux lots du même
      // ingrédient achetés à des prix différents gardent leur valeur propre.
      mockGetExpiringLots.mockResolvedValue([
        makeLot({ id: 'lot-a', remaining_qty: 4, unit_cost: 300 }),
        makeLot({ id: 'lot-b', remaining_qty: 2, unit_cost: 800 }),
      ]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        // (4 × 300) + (2 × 800) = 2800, et non 6 × moyenne
        expect(result.current.expiringValue).toBe(2800);
      });
    });

    it('vaut 0 quand rien ne périme', async () => {
      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.expiringValue).toBe(0);
    });
  });

  describe('🚨 Alertes de stock', () => {
    it('signale un stock sous le seuil', async () => {
      mockGetIngredients.mockResolvedValue([
        makeIngredient({ id: 'ing-1', current_stock: 2, min_stock_alert: 5 }),
        makeIngredient({ id: 'ing-2', current_stock: 20, min_stock_alert: 5 }),
      ]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.lowStockIngredients).toHaveLength(1);
      });
      expect(result.current.lowStockIngredients[0].id).toBe('ing-1');
    });

    it('⚠️ un seuil à 0 ou nul signifie « pas d\'alerte », pas « alerte permanente »', async () => {
      mockGetIngredients.mockResolvedValue([
        makeIngredient({ id: 'ing-1', current_stock: 0, min_stock_alert: null }),
        makeIngredient({ id: 'ing-2', current_stock: 0, min_stock_alert: 0 }),
      ]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.ingredients).toHaveLength(2);
      });
      expect(result.current.lowStockIngredients).toHaveLength(0);
    });

    it('⭐ un stock NÉGATIF est une dette, pas une erreur d\'affichage', async () => {
      // §13.2 : on a consommé sans stock. L'écart doit rester VISIBLE.
      mockGetIngredients.mockResolvedValue([
        makeIngredient({ id: 'ing-1', current_stock: -2 }),
        makeIngredient({ id: 'ing-2', current_stock: 5 }),
      ]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.ingredientsInDebt).toHaveLength(1);
      });
      expect(result.current.ingredientsInDebt[0].id).toBe('ing-1');
      expect(result.current.ingredientsInDebt[0].hasDebt).toBe(true);
    });
  });

  describe('🔗 Croisement ingrédients / lots', () => {
    it('compte les lots qui périment par ingrédient', async () => {
      mockGetIngredients.mockResolvedValue([
        makeIngredient({ id: 'ing-1', name: 'Tomate' }),
        makeIngredient({ id: 'ing-2', name: 'Riz' }),
      ]);
      mockGetExpiringLots.mockResolvedValue([
        makeLot({ id: 'lot-a', ingredient_id: 'ing-1' }),
        makeLot({ id: 'lot-b', ingredient_id: 'ing-1' }),
        makeLot({ id: 'lot-c', ingredient_id: 'ing-2' }),
      ]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.ingredients).toHaveLength(2);
      });

      expect(result.current.getIngredientById('ing-1')?.expiringLotsCount).toBe(2);
      expect(result.current.getIngredientById('ing-2')?.expiringLotsCount).toBe(1);
      expect(result.current.getExpiringLotsFor('ing-1')).toHaveLength(2);
    });

    it('un ingrédient sans lot qui périme est à 0, pas undefined', async () => {
      mockGetIngredients.mockResolvedValue([makeIngredient({ id: 'ing-1' })]);

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.ingredients).toHaveLength(1);
      });
      expect(result.current.ingredients[0].expiringLotsCount).toBe(0);
      expect(result.current.getExpiringLotsFor('ing-inconnu')).toEqual([]);
    });
  });

  describe('⛔ Invariance §3 — héritée des queries', () => {
    it('sur un bar PUR, aucune requête et des données vides', async () => {
      mockHasRestaurant = false;

      const { result } = renderHook(() => useUnifiedKitchen(BAR_ID), { wrapper: createWrapper() });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(
        mockGetIngredients,
        'Le pivot ne doit PAS contourner la garde des queries'
      ).not.toHaveBeenCalled();
      expect(mockGetExpiringLots).not.toHaveBeenCalled();
      expect(result.current.ingredients).toEqual([]);
      expect(result.current.expiringValue).toBe(0);
    });

    it('sans barId, rien ne part', async () => {
      renderHook(() => useUnifiedKitchen(undefined), { wrapper: createWrapper() });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockGetIngredients).not.toHaveBeenCalled();
    });
  });
});
