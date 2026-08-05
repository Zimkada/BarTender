/**
 * kitchenVigilancePermission.test.tsx
 *
 * ⭐⭐ LE STOCK D'INGRÉDIENTS NE PART PAS CHEZ LE SERVEUR — défaut trouvé à
 * la code review du 05/08/2026.
 *
 * Le SERVEUR accède au Dashboard et peut basculer en portée Restau. Mais il
 * n'a PAS accès à l'écran Ingrédients (menu réservé promoteur / gérant /
 * cuisinier). Charger ces données pour lui ÉLARGIRAIT une exposition qui
 * n'existe nulle part ailleurs : les lots portent `unit_cost`, un montant.
 *
 * ⛔ CE QUI EST VÉRIFIÉ ICI, C'EST L'ABSENCE D'APPEL RÉSEAU — pas le masquage
 * visuel. Masquer une carte dont les données sont déjà arrivées dans le cache
 * du navigateur ne protège rien : il suffit d'ouvrir l'onglet Réseau. La garde
 * doit couper la requête À LA SOURCE, et c'est cela seul qui fait foi.
 *
 * ⚠️ Deux chemins mènent aux mêmes données, donc deux tests : la CARTE
 * (`KitchenSummaryCards`) et la LISTE (`KitchenVigilanceList`). Le premier
 * correctif n'avait couvert que la carte — la liste rouvrait la faille.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

const mockGetIngredients = vi.fn(() => Promise.resolve([]));
const mockGetExpiringLots = vi.fn(() => Promise.resolve([]));

vi.mock('../../services/supabase/ingredients.service', () => ({
  IngredientsService: {
    getIngredients: (...a: unknown[]) => mockGetIngredients(...(a as [])),
    getExpiringLots: (...a: unknown[]) => mockGetExpiringLots(...(a as [])),
    getLotsFefo: vi.fn(() => Promise.resolve([])),
    getStockConsistencyViolations: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
    getQueue: vi.fn(() => Promise.resolve([])),
    getMetrics: vi.fn(() =>
      Promise.resolve({
        dishes_sold: 0,
        dishes_revenue: 0,
        loss_count: 0,
        loss_cost: 0,
        pending_count: 0,
        avg_prep_minutes: null,
      })
    ),
  },
}));

vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    operatingMode: 'full',
    hasRestaurant: true,
  }),
}));

/** Rôle simulé : le serveur n'a NI le stock ingrédients NI les coûts. */
let mockRole = 'serveur';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', role: mockRole },
    hasPermission: (p: string) => {
      if (p === 'canManageIngredientStock' || p === 'canViewKitchenCosts') {
        return mockRole !== 'serveur';
      }
      return true;
    },
  }),
}));

import {
  KitchenSummaryCards,
  KitchenVigilanceList,
} from '../../components/dashboard/KitchenSummaryCards';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Laisse React Query résoudre ses effets avant l'assertion. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Stock ingrédients — exposition réseau selon le rôle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'serveur';
  });

  it('ne déclenche AUCUNE requête ingrédients pour un serveur (cartes)', async () => {
    render(<KitchenSummaryCards barId="bar-123" businessDate="2026-08-05" />, {
      wrapper,
    });
    await settle();

    expect(mockGetIngredients).not.toHaveBeenCalled();
    expect(mockGetExpiringLots).not.toHaveBeenCalled();
  });

  it('ne déclenche AUCUNE requête ingrédients pour un serveur (liste de vigilance)', async () => {
    render(<KitchenVigilanceList barId="bar-123" />, { wrapper });
    await settle();

    expect(mockGetIngredients).not.toHaveBeenCalled();
    expect(mockGetExpiringLots).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ Le panneau ne doit pas AFFIRMER que tout va bien : sans données, dire
   * « aucune alerte » serait un mensonge sur un écran de vigilance.
   */
  it('n’affiche pas un état rassurant au serveur, mais un message explicite', async () => {
    render(<KitchenVigilanceList barId="bar-123" />, { wrapper });
    await settle();

    // `getByText` lève déjà si l'élément manque ; on s'en tient à une
    // assertion native plutôt que d'importer jest-dom pour ce seul appel.
    expect(screen.getByText(/réservé à la gestion/i)).toBeTruthy();
  });

  /**
   * ⭐ CONTRE-ÉPREUVE : sans elle, un composant qui ne chargerait JAMAIS rien
   * passerait les trois tests ci-dessus. C'est ce test qui prouve que la
   * garde discrimine le rôle au lieu de tout couper.
   */
  it('charge bien les ingrédients pour un gérant', async () => {
    mockRole = 'gerant';
    render(<KitchenVigilanceList barId="bar-123" />, { wrapper });
    await settle();

    expect(mockGetIngredients).toHaveBeenCalled();
  });
});
