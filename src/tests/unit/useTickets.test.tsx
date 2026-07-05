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

const mockGetOpenTickets = vi.fn<[], Promise<TicketRow[]>>();

vi.mock('../../services/supabase/tickets.service', () => ({
  TicketsService: {
    getOpenTickets: (...args: unknown[]) => mockGetOpenTickets(...(args as [])),
  },
}));

let mockSales: Partial<Sale>[] = [];
vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: vi.fn(() => ({ data: mockSales })),
}));

vi.mock('../../hooks/useServerMappings', () => ({
  useServerMappings: vi.fn(() => ({ mappings: [] })),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'gerant' },
  })),
}));

vi.mock('../../services/supabase/sales.service', () => ({
  SalesService: {
    getOfflineSales: vi.fn(() => Promise.resolve([])),
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
