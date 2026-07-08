/**
 * useTickets.test.tsx
 * Unit tests: filtrage des "bons fantômes" (toutes les ventes rejetées/annulées)
 * vs conservation des bons neufs jamais utilisés.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useTickets } from '../../hooks/queries/useTickets';
import type { TicketRow } from '../../services/supabase/tickets.service';
import type { Sale } from '../../types';

// ===== Mocks des dépendances =====

const mockGetOpenTickets = vi.fn<(...args: unknown[]) => Promise<TicketRow[]>>();

vi.mock('../../services/supabase/tickets.service', () => ({
  TicketsService: {
    getOpenTickets: (...args: unknown[]) => mockGetOpenTickets(...args),
  },
}));

let mockSales: Partial<Sale>[] = [];
const mockUseSales = vi.fn(() => ({ data: mockSales }));
vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: (...args: unknown[]) => mockUseSales(...(args as [])),
  // mapSalesData réel non mocké : re-import du module réel pour la logique de mapping
  mapSalesData: (dbSales: unknown[]) => dbSales as Sale[],
}));

vi.mock('../../hooks/useServerMappings', () => ({
  useServerMappings: vi.fn(() => ({ mappings: [] })),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'gerant' },
  })),
}));

const mockGetSalesByTicketIds = vi.fn<(...args: unknown[]) => Promise<Partial<Sale>[]>>(() => Promise.resolve([]));
vi.mock('../../services/supabase/sales.service', () => ({
  SalesService: {
    getOfflineSales: vi.fn(() => Promise.resolve([])),
    getSalesByTicketIds: (...args: unknown[]) => mockGetSalesByTicketIds(...args),
  },
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
  },
}));

vi.mock('../../services/offlineQueue', () => ({
  offlineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../hooks/pivots/useUnifiedReturns', () => ({
  useUnifiedReturns: vi.fn(() => ({ returns: [] })),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const makeTicketRow = (overrides: Partial<TicketRow> = {}): TicketRow => ({
  id: 'ticket-1',
  bar_id: 'bar-123',
  status: 'open',
  created_by: 'user-123',
  server_id: null,
  created_at: new Date().toISOString(),
  paid_at: null,
  paid_by: null,
  payment_method: null,
  ticket_number: 1,
  notes: null,
  table_number: null,
  customer_name: null,
  ...overrides,
});

const makeSale = (overrides: Partial<Sale> = {}): Sale => ({
  id: 'sale-1',
  barId: 'bar-123',
  items: [{ product_id: 'p1', product_name: 'Bière Flag', quantity: 1, unit_price: 500, total_price: 500 }] as unknown as Sale['items'],
  total: 500,
  currency: 'XOF',
  status: 'validated',
  createdBy: 'user-123',
  soldBy: 'user-123',
  createdAt: new Date().toISOString(),
  businessDate: new Date().toISOString(),
  ...overrides,
});

describe('useTickets — filtrage des bons fantômes', () => {
  const barId = 'bar-123';

  // ⚡ Egress: useTickets DOIT borner sa fenêtre de dates. Sans startDate,
  // getBarSales tombe dans le Cas 2 (bar_id seul, sans filtre business_date) :
  // scan de tout l'historique de ventes du bar (items jsonb inclus) plafonné à
  // 500 lignes — coûteux car le tri sur l'historique complet précède la
  // troncature. Ce test fige la borne pour éviter une régression silencieuse.
  it('appelle useSales avec une fenêtre de dates bornée (pas un fetch nu sans options)', async () => {
    mockGetOpenTickets.mockResolvedValue([]);
    mockSales = [];
    mockUseSales.mockClear();

    renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(mockUseSales).toHaveBeenCalled());
    const callArgs = mockUseSales.mock.calls[0] as unknown as [string, { startDate?: string }];
    const options = callArgs[1];
    expect(options).toBeDefined();
    expect(options.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // 🛡️ Un bon reste trouvable et réglable quel que soit son âge — pay_ticket
  // propage payment_method aux ventes rattachées (moyen réel), les rendre
  // inaccessibles bloquerait ce règlement (écart de caisse 5711 permanent).
  // getOpenTickets ne doit donc JAMAIS recevoir de borne de date.
  it('récupère TOUS les bons ouverts, sans borne de date (un bon reste toujours réglable)', async () => {
    mockGetOpenTickets.mockResolvedValue([]);
    mockSales = [];
    mockUseSales.mockClear();
    mockGetOpenTickets.mockClear();

    renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetOpenTickets).toHaveBeenCalled());
    const ticketArgs = mockGetOpenTickets.mock.calls[0] as [string];
    expect(ticketArgs).toHaveLength(1); // barId seul, pas de 2e argument de date
  });

  // 🛡️ Régression contre-analyse (08/07/2026) : un bon créé AVANT la fenêtre
  // des ventes (journée + veille) doit quand même afficher son vrai total —
  // pas "Bon vide / 0 XOF". Le hook doit fetcher ses ventes à part par
  // ticket_id (getSalesByTicketIds), indépendamment de la fenêtre de dates.
  it('affiche le vrai total d\'un bon plus vieux que la fenêtre des ventes (fetch ciblé)', async () => {
    const oldTicketId = 'ticket-old';
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    mockGetOpenTickets.mockResolvedValue([
      makeTicketRow({ id: oldTicketId, created_at: threeDaysAgo }),
    ]);
    mockSales = []; // la fenêtre récente ne contient pas la vente du bon ancien
    mockGetSalesByTicketIds.mockClear();
    mockGetSalesByTicketIds.mockResolvedValue([
      { ...makeSale({ id: 'sale-old', ticketId: oldTicketId, status: 'validated', total: 2500 }), ticket_id: oldTicketId } as unknown as Partial<Sale>,
    ]);

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetSalesByTicketIds).toHaveBeenCalledWith([oldTicketId], barId));
    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === oldTicketId);
      expect(ticket).toBeDefined();
      expect(ticket?.totalAmount).toBe(2500);
      expect(ticket?.productSummary).not.toBe('Bon vide');
    });
  });

  it('masque un bon dont l\'unique vente a été rejetée', async () => {
    mockGetOpenTickets.mockResolvedValue([makeTicketRow({ id: 'ticket-1' })]);
    mockSales = [makeSale({ id: 'sale-1', ticketId: 'ticket-1', status: 'rejected' })];

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => {
      expect(result.current.tickets.find(t => t.id === 'ticket-1')).toBeUndefined();
    });
  });

  it('masque un bon dont l\'unique vente a été annulée', async () => {
    mockGetOpenTickets.mockResolvedValue([makeTicketRow({ id: 'ticket-1' })]);
    mockSales = [makeSale({ id: 'sale-1', ticketId: 'ticket-1', status: 'cancelled' })];

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => {
      expect(result.current.tickets.find(t => t.id === 'ticket-1')).toBeUndefined();
    });
  });

  it('conserve un bon avec au moins une vente active malgré une vente rejetée', async () => {
    mockGetOpenTickets.mockResolvedValue([makeTicketRow({ id: 'ticket-1' })]);
    mockSales = [
      makeSale({ id: 'sale-1', ticketId: 'ticket-1', status: 'rejected', total: 500 }),
      makeSale({ id: 'sale-2', ticketId: 'ticket-1', status: 'validated', total: 1000 }),
    ];

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === 'ticket-1');
      expect(ticket).toBeDefined();
      expect(ticket?.salesCount).toBe(1);
      expect(ticket?.totalAmount).toBe(1000);
    });
  });

  it('conserve un bon neuf jamais utilisé (aucune vente associée)', async () => {
    mockGetOpenTickets.mockResolvedValue([makeTicketRow({ id: 'ticket-1' })]);
    mockSales = [];

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === 'ticket-1');
      expect(ticket).toBeDefined();
      expect(ticket?.salesCount).toBe(0);
      expect(ticket?.productSummary).toBe('Bon vide');
    });
  });
});
