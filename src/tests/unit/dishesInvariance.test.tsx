/**
 * dishesInvariance.test.tsx
 *
 * ⭐⭐ TEST D'INVARIANCE DES BARS PURS — PLAN_MODULE_RESTAURATION.md §3.
 *
 * Pendant de `ingredientsInvariance.test.tsx` pour la phase 2 (plats).
 *
 * §3 est la contrainte de plus haut niveau du chantier : un bar sans cuisine
 * doit être STRICTEMENT identique à aujourd'hui, pas « presque ».
 *
 * ⚠️ CE QU'ON TESTE ICI : que le SERVICE n'est jamais appelé. Pas que le hook
 * retourne un tableau vide — un hook peut très bien renvoyer `[]` APRÈS avoir
 * émis la requête. C'est l'appel réseau lui-même qui coûte, donc c'est lui
 * qu'il faut observer.
 *
 * ⚠️ POURQUOI CE TEST EST INDISPENSABLE : un `enabled` oublié ne produit
 * AUCUNE erreur, aucun test rouge, aucun symptôme visible. Le §3 le dit :
 * l'egress supplémentaire ne se remarquerait « pas avant la facture Supabase ».
 * Sans ce test, `enabled: hasRestaurant` n'est qu'une intention.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ===== Mocks =====

// ⭐ Frontière réseau : si une de ces fonctions est appelée, une requête serait
// partie en conditions réelles.
const mockGetDishes = vi.fn(() => Promise.resolve([]));
const mockGetDishRecipe = vi.fn(() => Promise.resolve([]));
const mockGetDishCost = vi.fn(() => Promise.resolve({ success: true }));
const mockGetAllDishCosts = vi.fn(() => Promise.resolve([]));
const mockGetDailyScopeTotals = vi.fn(() => Promise.resolve({ success: true }));
const mockGetDishCategories = vi.fn(() => Promise.resolve([]));

vi.mock('../../services/supabase/dishes.service', () => ({
  DishesService: {
    getDishes: (...args: unknown[]) => mockGetDishes(...(args as [])),
    getDishRecipe: (...args: unknown[]) => mockGetDishRecipe(...(args as [])),
    getDishCost: (...args: unknown[]) => mockGetDishCost(...(args as [])),
    getAllDishCosts: (...args: unknown[]) => mockGetAllDishCosts(...(args as [])),
    getDailyScopeTotals: (...args: unknown[]) => mockGetDailyScopeTotals(...(args as [])),
  },
}));

vi.mock('../../services/supabase/categories.service', () => ({
  CategoriesService: {
    getDishCategories: (...args: unknown[]) => mockGetDishCategories(...(args as [])),
  },
}));

// `hasRestaurant` est piloté par test.
let mockHasRestaurant = false;
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    operatingMode: 'full',
    hasRestaurant: mockHasRestaurant,
  }),
}));

import {
  useDishes,
  useDishRecipe,
  useDishCost,
  useAllDishCosts,
  useDailyScopeTotals,
  useDishCategories,
} from '../../hooks/queries/useDishesQueries';

const BAR_ID = 'bar-123';
const DISH_ID = 'dish-789';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** Laisse à React Query le temps d'émettre une requête, s'il devait en émettre. */
const letQueriesSettle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('Invariance des bars purs — aucune requête plats (§3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('⛔ hasRestaurant = false — AUCUN appel réseau', () => {
    beforeEach(() => {
      mockHasRestaurant = false;
    });

    it('useDishes n\'appelle PAS le service', async () => {
      renderHook(() => useDishes(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetDishes,
        'Une requête dishes est partie sur un bar PUR — egress injustifié (§3)'
      ).not.toHaveBeenCalled();
    });

    it('useDishRecipe n\'appelle PAS le service', async () => {
      renderHook(() => useDishRecipe(BAR_ID, DISH_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDishRecipe).not.toHaveBeenCalled();
    });

    it('useDishCost n\'appelle PAS le service', async () => {
      renderHook(() => useDishCost(BAR_ID, DISH_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDishCost).not.toHaveBeenCalled();
    });

    it('⭐ useAllDishCosts n\'appelle PAS le service', async () => {
      // ⚠️ Query la PLUS coûteuse du module : elle parcourt tous les plats,
      // toutes leurs recettes et tous les lots. La laisser partir sur un bar
      // pur serait le pire des cas d'egress injustifié.
      renderHook(() => useAllDishCosts(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetAllDishCosts,
        'La query de marges est partie sur un bar PUR — c\'est la plus lourde du module (§3)'
      ).not.toHaveBeenCalled();
    });

    it('⭐ useDailyScopeTotals n\'appelle PAS le service', async () => {
      // ⚠️ C'est LA « query agrégée supplémentaire » que le §9 autorise
      // UNIQUEMENT quand has_restaurant = true. Sur un bar pur elle n'a rien à
      // ventiler — la laisser partir serait de l'egress sans contrepartie.
      renderHook(() => useDailyScopeTotals(BAR_ID, '2026-08-04'), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetDailyScopeTotals,
        'La ventilation Bar/Restau est partie sur un bar PUR (§3)'
      ).not.toHaveBeenCalled();
    });

    it('⭐ useDishCategories n\'appelle PAS le service', async () => {
      // ⚠️ Cette query lit `bar_categories`, une table que les bars PURS
      // utilisent déjà pour leurs boissons. La garde §3 est donc encore plus
      // importante ici : sans elle, la requête paraîtrait légitime.
      renderHook(() => useDishCategories(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetDishCategories,
        'Une requête de catégories de plats est partie sur un bar PUR (§3)'
      ).not.toHaveBeenCalled();
    });
  });

  describe('✅ hasRestaurant = true — les requêtes partent', () => {
    beforeEach(() => {
      mockHasRestaurant = true;
    });

    // ⚠️ Ce volet est ce qui empêche le test précédent d'être trivialement vert :
    // sans lui, un `enabled: false` codé en dur passerait toutes les assertions
    // « ne doit pas être appelé » — le test mesurerait du vide.
    it('useDishes appelle bien le service', async () => {
      renderHook(() => useDishes(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetDishes,
        'Aucune requête sur un bar AVEC cuisine — la garde §3 est trop restrictive'
      ).toHaveBeenCalledWith(BAR_ID, expect.anything());
    });

    it('useDishCategories appelle bien le service', async () => {
      renderHook(() => useDishCategories(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDishCategories).toHaveBeenCalledWith(BAR_ID);
    });

    it('useAllDishCosts appelle bien le service', async () => {
      renderHook(() => useAllDishCosts(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetAllDishCosts).toHaveBeenCalledWith(BAR_ID);
    });

    it('useDailyScopeTotals appelle bien le service', async () => {
      renderHook(() => useDailyScopeTotals(BAR_ID, '2026-08-04'), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDailyScopeTotals).toHaveBeenCalledWith(BAR_ID, '2026-08-04');
    });

    it('⭐ useDailyScopeTotals exige une businessDate', async () => {
      // Le RPC refuse une date nulle : autant ne pas partir du tout.
      renderHook(() => useDailyScopeTotals(BAR_ID, undefined), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDailyScopeTotals).not.toHaveBeenCalled();
    });

    it('useDishRecipe et useDishCost exigent un dishId', async () => {
      // ⭐ Garde supplémentaire : même avec la cuisine active, une query sans
      // cible ne doit rien émettre. Sinon l'écran de liste déclencherait une
      // requête de coût « à vide » à chaque rendu.
      renderHook(() => useDishRecipe(BAR_ID, undefined), { wrapper: createWrapper() });
      renderHook(() => useDishCost(BAR_ID, undefined), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetDishRecipe).not.toHaveBeenCalled();
      expect(mockGetDishCost).not.toHaveBeenCalled();
    });
  });
});
