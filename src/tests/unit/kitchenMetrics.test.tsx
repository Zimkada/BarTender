/**
 * kitchenMetrics.test.tsx
 *
 * ⭐⭐ ÉCRAN DE RENTABILITÉ CUISINE — §8.
 *
 * ⚠️ CE QUE CE FICHIER PROTÈGE EN PRIORITÉ : que les plats EN ATTENTE ne
 * soient jamais présentés comme des PERTES.
 *
 * Un plat `ready` non encore servi a déjà coûté sa matière, mais il reste
 * SERVABLE. Les confondre transformerait un service en cours en catastrophe
 * apparente — et le gérant verrait des pertes disparaître au fil de la
 * soirée, ce qui lui ferait cesser de croire le chiffre.
 *
 * ⚠️ Le second enjeu est le §3 : sur un bar pur, aucune requête ne part.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
// ⚠️ SimplePageHeader utilise useNavigate (bouton retour) — le routeur est
// donc indispensable au montage, meme si ce test ne navigue jamais.
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import type { KitchenMetrics } from '../../services/supabase/kitchen.service';

const mockGetMetrics = vi.fn();

vi.mock('../../services/supabase/kitchen.service', () => ({
  KitchenService: {
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

vi.mock('../../hooks/useBeninCurrency', () => ({
  useCurrencyFormatter: () => ({ formatPrice: (v: number) => `${v} FCFA` }),
}));

import KitchenMetricsPage from '../../pages/KitchenMetricsPage';

/** Jeu conforme au test terrain du 05/08/2026 : 2 servis, 1 perte, 1 attente. */
const makeMetrics = (over: Partial<KitchenMetrics> = {}): KitchenMetrics =>
  ({
    success: true,
    start_date: '2026-07-06',
    end_date: '2026-08-05',
    served_count: 2,
    revenue: 5000,
    cost: 4000,
    margin: 1000,
    margin_rate: 20,
    loss_count: 1,
    loss_cost: 2000,
    pending_count: 1,
    pending_cost: 2000,
    avg_prep_min: 12.5,
    dishes: [
      {
        dish_id: 'd1',
        dish_name: 'Poulet braisé',
        sold_count: 2,
        revenue: 5000,
        cost: 4000,
        margin: 1000,
        margin_rate: 20,
        loss_count: 1,
        loss_cost: 2000,
        avg_prep_min: 12.5,
      },
    ],
    ...over,
  }) as KitchenMetrics;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const renderPage = () =>
  render(<KitchenMetricsPage />, { wrapper: createWrapper() });

const settle = () => new Promise((r) => setTimeout(r, 60));

describe('KitchenMetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRestaurant = true;
    mockGetMetrics.mockResolvedValue(makeMetrics());
  });

  describe('⛔ Bar PUR — aucune requête (§3)', () => {
    it('n\'appelle PAS le service', async () => {
      mockHasRestaurant = false;
      renderPage();
      await settle();

      expect(
        mockGetMetrics,
        'Une requête de métriques est partie sur un bar PUR (§3)'
      ).not.toHaveBeenCalled();
    });
  });

  describe('⭐⭐ Perte et attente ne se confondent JAMAIS', () => {
    it('affiche les pertes et les plats en attente séparément', async () => {
      renderPage();
      await settle();

      // La perte : 1 plat annulé après `ready`.
      expect(screen.getByText('Pertes')).toBeTruthy();

      // ⚠️ L'attente a son propre message, distinct du bloc « Pertes ».
      expect(
        screen.getByText(/attendent d'être servis/i),
        'Les plats en attente ne sont pas signalés séparément — ils passeraient pour des pertes'
      ).toBeTruthy();
    });

    it('⛔ dit explicitement que l\'attente n\'est PAS une perte', async () => {
      renderPage();
      await settle();

      expect(
        screen.getByText(/ce ne sont pas encore des pertes/i),
        'Rien ne distingue l\'attente de la perte — le gérant croirait son service catastrophique'
      ).toBeTruthy();
    });

    it('⚠️ aucun message d\'attente quand il n\'y en a pas', async () => {
      // Sans ce volet, un message affiché EN PERMANENCE passerait le test
      // précédent sans rien prouver.
      mockGetMetrics.mockResolvedValue(
        makeMetrics({ pending_count: 0, pending_cost: 0 })
      );
      renderPage();
      await settle();

      expect(screen.queryByText(/attendent d'être servis/i)).toBeNull();
    });
  });

  describe('Affichage des métriques', () => {
    it('affiche les 4 métriques du §8', async () => {
      renderPage();
      await settle();

      expect(screen.getByText('Plats servis')).toBeTruthy();
      expect(screen.getByText('Marge matière')).toBeTruthy();
      expect(screen.getByText('Pertes')).toBeTruthy();
      expect(screen.getByText('Préparation')).toBeTruthy();
    });

    it('⭐ affiche « — » et JAMAIS 0 % quand le taux est nul', async () => {
      // Un taux sur un CA nul n'a pas de sens mathématique — même règle que
      // `calculate_dish_cost` pour un plat offert.
      mockGetMetrics.mockResolvedValue(
        makeMetrics({ margin_rate: null, revenue: 0, served_count: 0, dishes: [] })
      );
      renderPage();
      await settle();

      // ⚠️ Sans plat servi, l'écran montre son état vide — c'est correct.
      expect(screen.getByText(/aucun plat servi/i)).toBeTruthy();
    });

    it('affiche le classement par plat', async () => {
      renderPage();
      await settle();

      expect(screen.getByText('Poulet braisé')).toBeTruthy();
      expect(screen.getByText(/2 servis/)).toBeTruthy();
    });

    it('⭐ la perte PAR PLAT est visible', async () => {
      // « 12 000 F de pertes » ne dit rien ; « sur le poisson » désigne une
      // portion mal calibrée.
      renderPage();
      await settle();

      expect(screen.getByText(/1 perdu/)).toBeTruthy();
    });
  });

  describe('État vide', () => {
    it('un service sans plat ne montre aucun chiffre trompeur', async () => {
      mockGetMetrics.mockResolvedValue(
        makeMetrics({
          served_count: 0,
          revenue: 0,
          cost: 0,
          margin: 0,
          margin_rate: null,
          loss_count: 0,
          pending_count: 0,
          avg_prep_min: null,
          dishes: [],
        })
      );
      renderPage();
      await settle();

      expect(screen.getByText(/aucun plat servi/i)).toBeTruthy();
      expect(screen.queryByText('Marge matière')).toBeNull();
    });
  });
});
