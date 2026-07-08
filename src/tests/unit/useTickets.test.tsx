/**
 * useTickets.test.tsx
 * Unit tests: filtrage des "bons fantômes" (toutes les ventes rejetées/annulées)
 * vs conservation des bons neufs jamais utilisés.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useTickets, SALES_WINDOW_RECHECK_MS } from '../../hooks/queries/useTickets';
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

// 🕐 Contrôle de la journée commerciale : par défaut délègue à l'implémentation
// réelle (les tests existants restent inchangés) ; les tests de bascule de
// journée fixent businessDateOverride pour simuler le passage du temps.
let businessDateOverride: Date | null = null;
vi.mock('../../utils/businessDateHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/businessDateHelpers')>();
  return {
    ...actual,
    // Retourne une copie : le caller mute la date retournée (setDate -1)
    calculateBusinessDate: (date: Date, closeHour?: number) =>
      businessDateOverride ? new Date(businessDateOverride) : actual.calculateBusinessDate(date, closeHour),
  };
});

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

    await waitFor(() => expect(mockGetSalesByTicketIds).toHaveBeenCalled());
    // 3e argument = beforeDate, obligatoire pour garder staleSales disjoint de `sales`
    const callArgs = mockGetSalesByTicketIds.mock.calls[0] as [string[], string, string];
    expect(callArgs[0]).toEqual([oldTicketId]);
    expect(callArgs[1]).toBe(barId);
    expect(callArgs[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === oldTicketId);
      expect(ticket).toBeDefined();
      expect(ticket?.totalAmount).toBe(2500);
      expect(ticket?.productSummary).not.toBe('Bon vide');
    });
  });

  // 🛡️ Régression contre-analyse #2 (08/07/2026) : un bon ancien avec une
  // vente RÉCENTE ne doit JAMAIS compter cette vente deux fois. `sales`
  // (fenêtre récente) et `staleSales` (fetch ciblé par ticket_id) doivent
  // rester des ensembles disjoints — sinon totalAmount/salesCount doublent,
  // un risque direct de surfacturation client à l'encaissement.
  it('ne compte pas deux fois une vente récente d\'un bon ancien (pas de double-comptage)', async () => {
    const mixedTicketId = 'ticket-mixed';
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    mockGetOpenTickets.mockResolvedValue([
      makeTicketRow({ id: mixedTicketId, created_at: threeDaysAgo }),
    ]);
    // La vente récente arrive via `sales` (fenêtre courante), comme en prod
    mockSales = [makeSale({ id: 'sale-recent', ticketId: mixedTicketId, status: 'validated', total: 1000 })];
    mockGetSalesByTicketIds.mockClear();
    // Le mock simule bien la borne beforeDate : ne retourne QUE la vente ancienne
    mockGetSalesByTicketIds.mockResolvedValue([
      { ...makeSale({ id: 'sale-old', ticketId: mixedTicketId, status: 'validated', total: 1500 }), ticket_id: mixedTicketId } as unknown as Partial<Sale>,
    ]);

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === mixedTicketId);
      expect(ticket).toBeDefined();
      expect(ticket?.salesCount).toBe(2); // sale-recent + sale-old, chacune UNE fois
      expect(ticket?.totalAmount).toBe(2500); // 1000 + 1500, jamais 3500 ou plus
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

// 🛡️ Régression fenêtre figée (08/07/2026) : salesWindowStart était calculé une
// seule fois au montage (useMemo []). Un onglet POS resté ouvert d'un jour à
// l'autre gardait la fenêtre de la veille — la portée réelle de useSales
// s'élargissait silencieusement au fil des jours (dérive egress). La fenêtre
// doit être recalculée quand la journée commerciale bascule pendant que le
// composant reste monté.
describe('useTickets — rafraîchissement de la fenêtre commerciale', () => {
  const barId = 'bar-123';

  const lastUseSalesStartDate = (): string | undefined => {
    const calls = mockUseSales.mock.calls as unknown as [string, { startDate?: string }][];
    return calls[calls.length - 1]?.[1]?.startDate;
  };

  afterEach(() => {
    businessDateOverride = null;
  });

  it('recalcule salesWindowStart quand la journée commerciale bascule (session longue sans reload)', async () => {
    businessDateOverride = new Date('2026-07-07T00:00:00'); // journée commerciale du 7 juillet
    mockGetOpenTickets.mockResolvedValue([]);
    mockSales = [];
    mockUseSales.mockClear();

    renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(mockUseSales).toHaveBeenCalled());
    expect(lastUseSalesStartDate()).toBe('2026-07-06'); // veille de la journée courante

    // Le composant reste monté, la journée commerciale passe au 8 juillet
    businessDateOverride = new Date('2026-07-08T00:00:00');
    act(() => {
      window.dispatchEvent(new Event('focus')); // retour de focus → recheck
    });

    await waitFor(() => expect(lastUseSalesStartDate()).toBe('2026-07-07'));
  });

  it('garde une valeur stable tant que la journée n\'a pas changé (pas de refetch parasite)', async () => {
    businessDateOverride = new Date('2026-07-07T00:00:00');
    mockGetOpenTickets.mockResolvedValue([]);
    mockSales = [];
    mockUseSales.mockClear();

    renderHook(() => useTickets(barId), { wrapper: createWrapper() });
    await waitFor(() => expect(mockUseSales).toHaveBeenCalled());
    expect(lastUseSalesStartDate()).toBe('2026-07-06');

    // Rechecks répétés sans bascule de journée : la valeur ne doit pas bouger
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(lastUseSalesStartDate()).toBe('2026-07-06');
  });

  // 🛡️ Couverture du chemin setInterval seul (tablette kiosque toujours au
  // premier plan : jamais de 'focus'/'visibilitychange', seul le minuteur
  // périodique peut détecter la bascule de journée). Les 4 tests précédents ne
  // déclenchent recheck() que via des événements DOM — une régression qui
  // casserait uniquement l'enregistrement du setInterval (ligne supprimée,
  // mauvaise constante, cleanup prématuré) ne serait détectée par aucun d'eux.
  it('recalcule salesWindowStart via le minuteur périodique seul, sans focus/visibilitychange', async () => {
    // shouldAdvanceTime: le setInterval enregistré par le composant doit être
    // un fake timer dès le montage pour que advanceTimersByTime puisse
    // l'atteindre ; shouldAdvanceTime laisse néanmoins avancer l'horloge réelle
    // en tâche de fond pour que waitFor (basé sur de vraies micro-attentes)
    // continue de fonctionner normalement.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      businessDateOverride = new Date('2026-07-07T00:00:00');
      mockGetOpenTickets.mockResolvedValue([]);
      mockSales = [];
      mockUseSales.mockClear();

      renderHook(() => useTickets(barId), { wrapper: createWrapper() });
      await waitFor(() => expect(mockUseSales).toHaveBeenCalled());
      expect(lastUseSalesStartDate()).toBe('2026-07-06');

      // La journée commerciale bascule pendant que l'écran reste au premier
      // plan sans jamais perdre le focus (aucun dispatchEvent ici).
      businessDateOverride = new Date('2026-07-08T00:00:00');
      act(() => {
        vi.advanceTimersByTime(SALES_WINDOW_RECHECK_MS);
      });

      expect(lastUseSalesStartDate()).toBe('2026-07-07');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne recalcule pas avant l\'échéance du minuteur (pas de recheck anticipé)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      businessDateOverride = new Date('2026-07-07T00:00:00');
      mockGetOpenTickets.mockResolvedValue([]);
      mockSales = [];
      mockUseSales.mockClear();

      renderHook(() => useTickets(barId), { wrapper: createWrapper() });
      await waitFor(() => expect(mockUseSales).toHaveBeenCalled());
      expect(lastUseSalesStartDate()).toBe('2026-07-06');

      businessDateOverride = new Date('2026-07-08T00:00:00');
      act(() => {
        vi.advanceTimersByTime(SALES_WINDOW_RECHECK_MS - 1000);
      });

      // La journée a changé côté horloge simulée, mais le minuteur n'a pas
      // encore atteint son échéance : la fenêtre ne doit pas bouger.
      expect(lastUseSalesStartDate()).toBe('2026-07-06');
    } finally {
      vi.useRealTimers();
    }
  });

  it('déplace la borne beforeDate de staleSales quand la fenêtre avance (frontière récent/ancien cohérente)', async () => {
    businessDateOverride = new Date('2026-07-07T00:00:00');
    const oldTicketId = 'ticket-old-window';
    mockGetOpenTickets.mockResolvedValue([
      makeTicketRow({ id: oldTicketId, created_at: '2026-07-01T12:00:00' }),
    ]);
    mockSales = [];
    mockGetSalesByTicketIds.mockClear();
    mockGetSalesByTicketIds.mockResolvedValue([]);

    renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetSalesByTicketIds).toHaveBeenCalled());
    let callArgs = mockGetSalesByTicketIds.mock.calls.at(-1) as [string[], string, string];
    expect(callArgs[2]).toBe('2026-07-06'); // beforeDate = fenêtre initiale

    // Bascule de journée : la frontière récent/ancien doit suivre — staleSales
    // refetch avec le nouveau beforeDate = nouveau startDate de useSales
    // (ensembles toujours disjoints, cf. getSalesByTicketIds).
    businessDateOverride = new Date('2026-07-08T00:00:00');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      callArgs = mockGetSalesByTicketIds.mock.calls.at(-1) as [string[], string, string];
      expect(callArgs[2]).toBe('2026-07-07');
    });
  });

  // 🛡️ Pendant la bascule, useSales garde l'ancienne fenêtre en placeholderData
  // le temps de son refetch alors que staleSales peut déjà avoir résolu avec le
  // nouveau beforeDate : une même vente peut transiter dans les deux sources.
  // Le merge doit dédoublonner par id — jamais de double-comptage financier.
  it('ne compte pas deux fois une vente présente dans la fenêtre récente ET staleSales (transition)', async () => {
    businessDateOverride = new Date('2026-07-07T00:00:00');
    const mixedTicketId = 'ticket-transition';
    mockGetOpenTickets.mockResolvedValue([
      makeTicketRow({ id: mixedTicketId, created_at: '2026-07-01T12:00:00' }),
    ]);
    // sale-dup présent des deux côtés (placeholder ancienne fenêtre + staleSales frais)
    mockSales = [makeSale({ id: 'sale-dup', ticketId: mixedTicketId, status: 'validated', total: 1000 })];
    mockGetSalesByTicketIds.mockClear();
    mockGetSalesByTicketIds.mockResolvedValue([
      { ...makeSale({ id: 'sale-dup', ticketId: mixedTicketId, status: 'validated', total: 1000 }), ticket_id: mixedTicketId } as unknown as Partial<Sale>,
      { ...makeSale({ id: 'sale-old', ticketId: mixedTicketId, status: 'validated', total: 1500 }), ticket_id: mixedTicketId } as unknown as Partial<Sale>,
    ]);

    const { result } = renderHook(() => useTickets(barId), { wrapper: createWrapper() });

    await waitFor(() => {
      const ticket = result.current.tickets.find(t => t.id === mixedTicketId);
      expect(ticket).toBeDefined();
      expect(ticket?.salesCount).toBe(2); // sale-dup UNE fois + sale-old
      expect(ticket?.totalAmount).toBe(2500); // 1000 + 1500, jamais 3500
    });
  });
});
