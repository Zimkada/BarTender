/**
 * useRevenueStatsWindow.test.tsx
 * Tests du clamp de la fenêtre du fallback local (egress vague 3) :
 * useRevenueStats ne doit plus monter une fenêtre de tiering 7-60j permanente
 * (Header) NI propager des bornes historiques brutes (AccountingOverview,
 * startDate 2020-01-01 → fetch paginé de tout l'historique). La fenêtre du
 * fallback = intersection [startDate, endDate] ∩ [tieringStart, +∞).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ===== Mocks des dépendances =====

let mockSales: unknown[] = [];
const mockUseUnifiedSales = vi.fn(() => ({ sales: mockSales }));
vi.mock('../../hooks/pivots/useUnifiedSales', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../hooks/pivots/useUnifiedSales')>();
    return {
        ...actual, // getTieringWindowStart réel — c'est le clamp qu'on teste
        useUnifiedSales: (...args: unknown[]) => mockUseUnifiedSales(...(args as [])),
    };
});

vi.mock('../../hooks/pivots/useUnifiedReturns', () => ({
    useUnifiedReturns: vi.fn(() => ({ returns: [] })),
}));

vi.mock('../../context/BarContext', () => ({
    useBarContext: vi.fn(() => ({
        currentBar: { id: 'bar-123', closingHour: 6, settings: { dataTier: 'lite' } },
        operatingMode: 'full',
    })),
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        currentSession: { userId: 'user-123', role: 'gerant' },
    })),
}));

vi.mock('../../lib/supabase', () => {
    const makeChain = () => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        ['select', 'eq', 'gte', 'lte', 'order', 'in', 'or'].forEach(m => {
            chain[m] = vi.fn(self);
        });
        chain.range = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return chain;
    };
    return { supabase: { from: vi.fn(() => makeChain()) } };
});

vi.mock('../../services/supabase/sales.service', () => ({
    SalesService: { getOfflineSales: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('../../services/supabase/returns.service', () => ({
    ReturnsService: { getReturns: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('../../services/SyncManager', () => ({
    syncManager: { getRecentlySyncedKeys: vi.fn(() => new Map()) },
}));

import { useRevenueStats } from '../../hooks/useRevenueStats';
import { getTieringWindowStart } from '../../hooks/pivots/useUnifiedSales';
import { getCurrentBusinessDateString } from '../../utils/businessDateHelpers';

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};

/** Options du dernier appel à useUnifiedSales */
const lastUnifiedSalesOptions = () => {
    const calls = mockUseUnifiedSales.mock.calls as unknown as [string, {
        startDate?: string; endDate?: string; includeItems?: boolean; enabled?: boolean;
    }][];
    return calls[calls.length - 1]?.[1];
};

describe('useRevenueStats — clamp de la fenêtre du fallback local', () => {
    const today = getCurrentBusinessDateString(6);
    const tieringStart = getTieringWindowStart('lite', 6);

    beforeEach(() => {
        mockUseUnifiedSales.mockClear();
        mockSales = [];
    });

    it('Header (sans options) : fenêtre = jour commercial courant, plus jamais la fenêtre de tiering 7-60j', () => {
        renderHook(() => useRevenueStats(), { wrapper: createWrapper() });

        const opts = lastUnifiedSalesOptions();
        expect(opts).toMatchObject({
            startDate: today,
            endDate: today,
            includeItems: false,
            enabled: true,
        });
    });

    it('plage historique brute (2020) : les bornes ne sont JAMAIS propagées telles quelles (anti fetch historique complet)', () => {
        renderHook(
            () => useRevenueStats({ startDate: '2020-01-01', endDate: '2020-02-01' }),
            { wrapper: createWrapper() }
        );

        const opts = lastUnifiedSalesOptions();
        // startDate clampé au tiering — jamais 2020-01-01
        expect(opts.startDate).toBe(tieringStart);
        // Intersection vide (la plage est entièrement plus ancienne que le
        // tiering) : le fetch d'avant ne contribuait aucune ligne à cette plage
        // → requête désactivée, zéro egress.
        expect(opts.enabled).toBe(false);
    });

    it('plage chevauchant le tiering : borne basse clampée, requête active', () => {
        renderHook(
            () => useRevenueStats({ startDate: '2020-01-01', endDate: today }),
            { wrapper: createWrapper() }
        );

        const opts = lastUnifiedSalesOptions();
        expect(opts.startDate).toBe(tieringStart);
        expect(opts.endDate).toBe(today);
        expect(opts.enabled).toBe(true);
    });

    it('plage récente dans le tiering : bornes passées telles quelles', () => {
        renderHook(
            () => useRevenueStats({ startDate: today, endDate: today }),
            { wrapper: createWrapper() }
        );

        const opts = lastUnifiedSalesOptions();
        expect(opts.startDate).toBe(today);
        expect(opts.endDate).toBe(today);
        expect(opts.enabled).toBe(true);
    });

    it('enabled: false du consommateur : propagé au fallback (aucun fetch)', () => {
        renderHook(
            () => useRevenueStats({ enabled: false }),
            { wrapper: createWrapper() }
        );

        expect(lastUnifiedSalesOptions().enabled).toBe(false);
    });
});

// 🛡️ Régression contre-analyse (08/07/2026) : le commentaire du code affirme
// "Données de fallback identiques" au fetch d'avant, mais aucun test ne
// vérifiait les VALEURS RevenueStats réellement calculées — seulement les
// options passées à useUnifiedSales. Un bug de borne dans fallbackStartDate/
// fallbackWindowEmpty (ex: off-by-one) pourrait silencieusement fausser
// netRevenue/grossRevenue sans faire échouer aucun test. Ici, mockSales est
// rempli avec de vraies ventes positionnées PRÉCISÉMENT à la frontière du
// clamp, et on vérifie calculateLocalStats() via result.current (exposé en
// placeholderData avant résolution de la query serveur — cf. useRevenueStats.ts
// ligne ~494 : `previousData || calculateLocalStats()`).
describe('useRevenueStats — valeurs RevenueStats réellement calculées (pas seulement le plumbing)', () => {
    const today = getCurrentBusinessDateString(6);
    const tieringStart = getTieringWindowStart('lite', 6); // dataTier 'lite' → 7 jours

    beforeEach(() => {
        mockUseUnifiedSales.mockClear();
        mockSales = [];
    });

    const makeSale = (overrides: Record<string, unknown> = {}) => ({
        status: 'validated',
        total: 1000,
        businessDate: today,
        paymentMethod: 'cash',
        soldBy: 'user-123',
        idempotency_key: null,
        ...overrides,
    });

    it('agrège correctement des ventes réelles dans la fenêtre [startDate, endDate] demandée (cas simple, sans clamp)', () => {
        mockSales = [
            makeSale({ total: 1000, paymentMethod: 'cash' }),
            makeSale({ total: 2500, paymentMethod: 'mobile_money' }),
            makeSale({ total: 500, paymentMethod: 'card' }),
        ];

        const { result } = renderHook(
            () => useRevenueStats({ startDate: today, endDate: today }),
            { wrapper: createWrapper() }
        );

        // Lu synchrone : placeholderData = calculateLocalStats() avant résolution
        // de la query serveur (mockée pour renvoyer [] — cf. mock supabase du fichier).
        expect(result.current.saleCount).toBe(3);
        expect(result.current.grossRevenue).toBe(4000);
        expect(result.current.netRevenue).toBe(4000); // pas de retours mockés
        expect(result.current.cashRevenue).toBe(1000);
        expect(result.current.mobileRevenue).toBe(2500);
        expect(result.current.cardRevenue).toBe(500);
    });

    it('ignore les ventes hors de [startDate, endDate], même si dans la fenêtre réseau fetchée', () => {
        // Une vente d'hier ne doit jamais entrer dans les stats du jour demandé,
        // même si elle est techniquement présente dans `sales` (le mock simule
        // ici un sur-fetch réseau ; calculateLocalStats doit re-filtrer strictement).
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        mockSales = [
            makeSale({ total: 1000, businessDate: today }),
            makeSale({ total: 9999, businessDate: yesterdayStr }),
        ];

        const { result } = renderHook(
            () => useRevenueStats({ startDate: today, endDate: today }),
            { wrapper: createWrapper() }
        );

        expect(result.current.saleCount).toBe(1);
        expect(result.current.grossRevenue).toBe(1000);
    });

    it('exclut les ventes non "validated" (statut pending/rejected) du calcul', () => {
        mockSales = [
            makeSale({ total: 1000, status: 'validated' }),
            makeSale({ total: 5000, status: 'pending' }),
            makeSale({ total: 3000, status: 'rejected' }),
        ];

        const { result } = renderHook(
            () => useRevenueStats({ startDate: today, endDate: today }),
            { wrapper: createWrapper() }
        );

        expect(result.current.saleCount).toBe(1);
        expect(result.current.grossRevenue).toBe(1000);
    });

    it('à la frontière exacte du clamp (plage chevauchant le tiering) : les ventes dans [tieringStart, endDate] sont comptées, garantissant que le clamp du FETCH ne prive pas calculateLocalStats de données réellement dans la plage demandée', () => {
        // Plage demandée : très ancienne (2020) → aujourd'hui. fallbackStartDate
        // est clampé à tieringStart (le fetch réseau ne remonte pas avant), donc
        // seule une vente à/après tieringStart peut légitimement apparaître dans
        // `sales`. calculateLocalStats filtre ensuite sur [startDate, endDate]
        // (la plage BRUTE demandée) — une vente à tieringStart doit passer les
        // deux filtres et être comptée.
        mockSales = [
            makeSale({ total: 750, businessDate: tieringStart }),
        ];

        const { result } = renderHook(
            () => useRevenueStats({ startDate: '2020-01-01', endDate: today }),
            { wrapper: createWrapper() }
        );

        expect(result.current.saleCount).toBe(1);
        expect(result.current.grossRevenue).toBe(750);
    });
});
