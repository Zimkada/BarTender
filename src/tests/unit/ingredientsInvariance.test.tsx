/**
 * ingredientsInvariance.test.tsx
 *
 * ⭐⭐ TEST D'INVARIANCE DES BARS PURS — PLAN_MODULE_RESTAURATION.md §3.
 *
 * §3 est la contrainte de plus haut niveau du chantier : un bar sans cuisine
 * doit être STRICTEMENT identique à aujourd'hui, pas « presque ». Elle exige
 * explicitement « un test montant l'app avec has_restaurant = false, vérifiant
 * qu'aucune requête resto n'est émise ».
 *
 * ⚠️ CE QU'ON TESTE ICI : que le SERVICE n'est jamais appelé. Pas que le hook
 * retourne un tableau vide — un hook peut très bien renvoyer `[]` APRÈS avoir
 * émis la requête. C'est l'appel réseau lui-même qui coûte, et c'est donc lui
 * qu'il faut observer.
 *
 * ⚠️ POURQUOI CE TEST EST INDISPENSABLE : un `enabled` oublié ne produit
 * AUCUNE erreur, aucun test rouge, aucun symptôme visible. Le §3 le dit :
 * l'egress supplémentaire ne se remarquerait « pas avant la facture Supabase ».
 * Sans ce test, `enabled: hasRestaurant` n'est qu'une intention.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ===== Mocks =====

// ⭐ Le service est entièrement mocké : chaque appel est comptabilisé.
// C'est la frontière réseau — si une de ces fonctions est appelée, une requête
// serait partie en conditions réelles.
const mockGetIngredients = vi.fn(() => Promise.resolve([]));
const mockGetLotsFefo = vi.fn(() => Promise.resolve([]));
const mockGetExpiringLots = vi.fn(() => Promise.resolve([]));
const mockGetViolations = vi.fn(() => Promise.resolve([]));

vi.mock('../../services/supabase/ingredients.service', () => ({
  IngredientsService: {
    getIngredients: (...args: unknown[]) => mockGetIngredients(...(args as [])),
    getLotsFefo: (...args: unknown[]) => mockGetLotsFefo(...(args as [])),
    getExpiringLots: (...args: unknown[]) => mockGetExpiringLots(...(args as [])),
    getStockConsistencyViolations: (...args: unknown[]) => mockGetViolations(...(args as [])),
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
  useIngredients,
  useIngredientLots,
  useExpiringLots,
  useStockConsistencyCheck,
} from '../../hooks/queries/useIngredientsQueries';

const BAR_ID = 'bar-123';
const INGREDIENT_ID = 'ing-456';

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

describe('Invariance des bars purs — aucune requête cuisine (§3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('⛔ hasRestaurant = false — AUCUN appel réseau', () => {
    beforeEach(() => {
      mockHasRestaurant = false;
    });

    it('useIngredients n\'appelle PAS le service', async () => {
      renderHook(() => useIngredients(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(
        mockGetIngredients,
        'Une requête ingredients est partie sur un bar PUR — egress injustifié (§3)'
      ).not.toHaveBeenCalled();
    });

    it('useIngredientLots n\'appelle PAS le service', async () => {
      renderHook(() => useIngredientLots(BAR_ID, INGREDIENT_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetLotsFefo).not.toHaveBeenCalled();
    });

    it('useExpiringLots n\'appelle PAS le service', async () => {
      renderHook(() => useExpiringLots(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetExpiringLots).not.toHaveBeenCalled();
    });

    it('useStockConsistencyCheck n\'appelle PAS le service, même demandé', async () => {
      // Même avec enabled=true côté appelant : §3 prime sur la demande locale.
      renderHook(() => useStockConsistencyCheck(BAR_ID, true), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetViolations).not.toHaveBeenCalled();
    });

    it('⭐ les 4 hooks montés ENSEMBLE n\'émettent aucune requête', async () => {
      // Reproduit un écran qui les consommerait tous — le cas réel.
      renderHook(
        () => ({
          ingredients: useIngredients(BAR_ID),
          lots: useIngredientLots(BAR_ID, INGREDIENT_ID),
          expiring: useExpiringLots(BAR_ID),
          consistency: useStockConsistencyCheck(BAR_ID, true),
        }),
        { wrapper: createWrapper() }
      );
      await letQueriesSettle();

      const totalCalls =
        mockGetIngredients.mock.calls.length +
        mockGetLotsFefo.mock.calls.length +
        mockGetExpiringLots.mock.calls.length +
        mockGetViolations.mock.calls.length;

      expect(totalCalls, 'Aucune requête cuisine ne doit partir sur un bar pur').toBe(0);
    });
  });

  describe('✅ hasRestaurant = true — les requêtes partent', () => {
    beforeEach(() => {
      mockHasRestaurant = true;
    });

    it('useIngredients appelle le service', async () => {
      renderHook(() => useIngredients(BAR_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        // ⚠️ `getIngredients` prend un second argument depuis le 09/08/2026.
        // L'invariant tient : ce qui compte est que la requête PARTE.
        expect(mockGetIngredients).toHaveBeenCalledWith(BAR_ID, expect.anything());
      });
    });

    it('useIngredientLots appelle le service avec l\'ingrédient ciblé', async () => {
      renderHook(() => useIngredientLots(BAR_ID, INGREDIENT_ID), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockGetLotsFefo).toHaveBeenCalledWith(BAR_ID, INGREDIENT_ID);
      });
    });

    it('useExpiringLots transmet la fenêtre demandée', async () => {
      renderHook(() => useExpiringLots(BAR_ID, 7), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockGetExpiringLots).toHaveBeenCalledWith(BAR_ID, 7);
      });
    });
  });

  describe('🔒 Gardes secondaires — indépendantes de hasRestaurant', () => {
    beforeEach(() => {
      mockHasRestaurant = true;
    });

    it('sans barId, aucune requête', async () => {
      renderHook(() => useIngredients(undefined), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetIngredients).not.toHaveBeenCalled();
    });

    it('sans ingredientId, useIngredientLots ne part pas', async () => {
      renderHook(() => useIngredientLots(BAR_ID, undefined), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetLotsFefo).not.toHaveBeenCalled();
    });

    it('⭐ la vue d\'audit reste silencieuse tant qu\'elle n\'est pas demandée', async () => {
      // C'est un outil de DIAGNOSTIC : la faire tourner en permanence serait de
      // l'egress pur, puisqu'elle ne renvoie normalement RIEN.
      renderHook(() => useStockConsistencyCheck(BAR_ID), { wrapper: createWrapper() });
      await letQueriesSettle();

      expect(mockGetViolations).not.toHaveBeenCalled();
    });

    it('la vue d\'audit part quand elle est explicitement demandée', async () => {
      renderHook(() => useStockConsistencyCheck(BAR_ID, true), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockGetViolations).toHaveBeenCalledWith(BAR_ID);
      });
    });
  });
});
