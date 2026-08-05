/**
 * kitchenProductionPanel.test.tsx
 *
 * ⭐⭐ « MON ACTIVITÉ » — l'écran qui rend les pertes visibles au CUISINIER.
 *
 * Ce fichier protège trois règles, par ordre de gravité :
 *
 * 1. ⛔⛔ AUCUN MONTANT NE PART VERS LE CUISINIER. Le §8 est explicite :
 *    « il voit les quantités, pas les montants ». La protection tient à ce
 *    que la RPC `get_kitchen_production` ne CALCULE aucun montant — pas à un
 *    masquage d'affichage, qui laisserait les montants lisibles dans l'onglet
 *    Réseau. Le test vérifie donc quelle RPC est appelée, pas ce qui est
 *    peint à l'écran.
 *
 * 2. ⭐ LE CUISINIER, LUI, DOIT VOIR L'ÉCRAN. Il a `canViewKitchenCosts:
 *    false` : brancher ce panneau sur `useKitchenMetrics` le lui aurait
 *    entièrement fermé. C'est tout l'intérêt d'une seconde RPC.
 *
 * 3. ⚠️ RIEN NE PART TANT QUE LE PANNEAU EST REPLIÉ. Cet écran sert pendant
 *    le service : charger un agrégat que personne ne regarde coûterait de
 *    l'egress pour rien (§3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

const mockGetProduction = vi.fn();
const mockGetMetrics = vi.fn();

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
    getProduction: (...a: unknown[]) => mockGetProduction(...(a as [])),
    getMetrics: (...a: unknown[]) => mockGetMetrics(...(a as [])),
    getQueue: vi.fn(() => Promise.resolve([])),
  },
}));

let mockHasRestaurant = true;
vi.mock('../../context/BarContext', () => ({
  useBarContext: () => ({
    currentBar: { id: 'bar-123', closingHour: 6 },
    operatingMode: 'full',
    hasRestaurant: mockHasRestaurant,
  }),
}));

/**
 * ⭐ Le cuisinier RÉEL : `canViewKitchenOrders` oui, `canViewKitchenCosts`
 * NON. C'est exactement la combinaison définie dans ROLE_PERMISSIONS.
 */
let mockRole = 'cuisinier';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentSession: { userId: 'u-1', role: mockRole },
    hasPermission: (p: string) => {
      if (p === 'canViewKitchenCosts') return mockRole !== 'cuisinier' && mockRole !== 'serveur';
      if (p === 'canViewKitchenOrders') return true;
      return true;
    },
  }),
}));

import { KitchenProductionPanel } from '../../components/kitchen/KitchenProductionPanel';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

const PRODUCTION = {
  success: true,
  start_date: '2026-08-06',
  end_date: '2026-08-06',
  served_count: 24,
  loss_count: 2,
  pending_count: 3,
  todo_count: 5,
  avg_prep_min: 14,
  dishes: [
    { dish_id: 'd1', dish_name: 'Poisson braisé', served_count: 4, loss_count: 2, avg_prep_min: 18 },
    { dish_id: 'd2', dish_name: 'Poulet braisé', served_count: 12, loss_count: 0, avg_prep_min: 12 },
  ],
};

describe('Mon activité — le cuisinier voit ses quantités, jamais les montants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'cuisinier';
    mockHasRestaurant = true;
    mockGetProduction.mockResolvedValue(PRODUCTION);
    mockGetMetrics.mockResolvedValue({ success: true, revenue: 999999 });
  });

  /**
   * ⛔⛔ LE TEST CENTRAL. `getMetrics` renvoie des marges et des coûts : si le
   * panneau l'appelait, les montants arriveraient dans le cache réseau du
   * cuisinier, même invisibles à l'écran.
   */
  it('appelle get_kitchen_production et JAMAIS get_kitchen_metrics', async () => {
    render(<KitchenProductionPanel barId="bar-123" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /mon activité/i }));
    await settle();

    expect(mockGetProduction).toHaveBeenCalled();
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });

  /**
   * ⭐ Sans cette contre-épreuve, un panneau qui n'appellerait JAMAIS rien
   * passerait le test précédent.
   */
  it('affiche bien les quantités du cuisinier', async () => {
    render(<KitchenProductionPanel barId="bar-123" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /mon activité/i }));

    // ⚠️ `waitFor` et non un simple tick : la query doit résoudre ET le
    // composant se re-rendre avant que les chiffres existent dans le DOM.
    await waitFor(() => expect(screen.getByText('24')).toBeTruthy());

    expect(screen.getByText('Poisson braisé')).toBeTruthy();
    expect(screen.getByText(/2 perdus/)).toBeTruthy();
  });

  /**
   * ⚠️ §3 + egress : replié, le panneau ne doit RIEN charger. Un agrégat que
   * personne ne regarde est du trafic pur.
   */
  it('ne charge rien tant que le panneau est replié', async () => {
    render(<KitchenProductionPanel barId="bar-123" />, { wrapper });
    await settle();

    expect(mockGetProduction).not.toHaveBeenCalled();
  });

  /**
   * ⛔ §3 — un bar PUR n'émet aucune requête cuisine, quel que soit l'état du
   * panneau. La garde vit dans le hook (`enabled: hasRestaurant`).
   */
  it('ne charge rien sur un bar pur, même déplié', async () => {
    mockHasRestaurant = false;
    render(<KitchenProductionPanel barId="bar-123" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /mon activité/i }));
    await settle();

    expect(mockGetProduction).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ « — » et JAMAIS « 0 min » : une moyenne sur zéro mesure n'existe pas,
   * et « 0 min » se lirait comme une cuisson instantanée.
   */
  it('affiche « — » quand aucun plat n’a atteint ready', async () => {
    mockGetProduction.mockResolvedValue({
      ...PRODUCTION,
      avg_prep_min: null,
      dishes: [],
    });
    render(<KitchenProductionPanel barId="bar-123" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /mon activité/i }));

    await waitFor(() => expect(screen.getByText('—')).toBeTruthy());
    expect(screen.queryByText('0 min')).toBeNull();
  });
});
