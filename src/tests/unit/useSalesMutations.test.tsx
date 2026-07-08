/**
 * useSalesMutations.test.tsx
 * Tests d'intégration (vrai QueryClient) du remplacement des invalidations
 * par préfixe (egress vague 3, diagnostic 07/07/2026) : chaque mutation vente
 * doit PATCHER les variantes de salesKeys.list en cache au lieu de toutes les
 * refetcher, avec repli invalidation préfixe quand le patch est impossible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import type { Sale } from '../../types';

// ===== Mocks des dépendances =====

const mockCreateSale = vi.fn();
const mockValidateSale = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockRejectSale = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockCancelSale = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockDeleteSale = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockRejectMultipleSales = vi.fn();

vi.mock('../../services/supabase/sales.service', () => ({
    SalesService: {
        createSale: (...args: unknown[]) => mockCreateSale(...args),
        validateSale: (...args: unknown[]) => mockValidateSale(...args),
        rejectSale: (...args: unknown[]) => mockRejectSale(...args),
        cancelSale: (...args: unknown[]) => mockCancelSale(...args),
        deleteSale: (...args: unknown[]) => mockDeleteSale(...args),
        rejectMultipleSales: (...args: unknown[]) => mockRejectMultipleSales(...args),
    },
}));

vi.mock('../../services/supabase/analytics.service', () => ({
    AnalyticsService: { refreshView: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        currentSession: { userId: 'user-123', role: 'gerant' },
    })),
}));

vi.mock('../../context/BarContext', () => ({
    useBarContext: vi.fn(() => ({
        currentBar: { id: 'bar-123', closingHour: 6 },
        isSimplifiedMode: false,
    })),
}));

vi.mock('../../hooks/useCanWorkOffline', () => ({
    useCanWorkOffline: vi.fn(() => true),
}));

vi.mock('../../services/NetworkManager', () => ({
    networkManager: { getDecision: vi.fn(() => ({ shouldBlock: false })) },
}));

vi.mock('../../services/broadcast/BroadcastService', () => ({
    broadcastService: { isSupported: vi.fn(() => false), broadcast: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

// Clés voisines : formes minimales, on ne teste que la famille salesKeys.list
vi.mock('../../hooks/queries/useStockQueries', () => ({
    stockKeys: { products: (barId: string) => ['stock', 'products', barId] as const },
}));
vi.mock('../../hooks/queries/useAnalyticsQueries', () => ({
    analyticsKeys: { barPredicate: () => () => false },
}));
// Isole useSalesQueries du client Supabase/realtime (comme patchSalesListVariants.test)
vi.mock('../../hooks/useSmartSync', () => ({ useSmartSync: vi.fn() }));

import { useSalesMutations } from '../../hooks/mutations/useSalesMutations';
import { salesKeys, type UseSalesOptions } from '../../hooks/queries/useSalesQueries';
import { calculateBusinessDate, dateToYYYYMMDD } from '../../utils/businessDateHelpers';

const BAR_ID = 'bar-123';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

/** Journée commerciale courante réelle (mêmes helpers que le code de prod) */
const todayBusinessDate = dateToYYYYMMDD(calculateBusinessDate(new Date(), 6));

const makeSaleRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'sale-new',
    bar_id: BAR_ID,
    items: [{ product_id: PRODUCT_ID, product_name: 'Bière Flag', quantity: 2, unit_price: 500, total_price: 1000 }],
    subtotal: 1000,
    discount_total: 0,
    total: 1000,
    payment_method: 'cash',
    status: 'validated',
    created_by: 'user-123',
    sold_by: 'user-123',
    server_id: null,
    ticket_id: null,
    validated_by: 'user-123',
    validated_at: new Date().toISOString(),
    rejected_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    business_date: todayBusinessDate,
    customer_name: null,
    customer_phone: null,
    notes: null,
    source_return_id: null,
    idempotency_key: 'idem-1',
    ...overrides,
});

const makeCachedSale = (overrides: Partial<Sale> = {}): Sale => ({
    id: 'sale-1',
    barId: BAR_ID,
    items: [{ product_id: PRODUCT_ID, product_name: 'Bière Flag', quantity: 1, unit_price: 500, total_price: 500 }] as unknown as Sale['items'],
    total: 500,
    currency: 'XOF',
    paymentMethod: 'cash',
    status: 'pending',
    createdBy: 'user-123',
    soldBy: 'user-123',
    createdAt: new Date(),
    businessDate: new Date(todayBusinessDate),
    ...overrides,
});

const variantKey = (options: UseSalesOptions) => [...salesKeys.list(BAR_ID), options];

/** Une invalidation a-t-elle visé la famille salesKeys.list (préfixe OU variante) ? */
const salesListInvalidations = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter((call) => {
        const arg = call[0] as { queryKey?: readonly unknown[] } | undefined;
        const key = arg?.queryKey;
        return Array.isArray(key) && key[0] === 'sales' && key[1] === 'list';
    });

describe('useSalesMutations — patch de cache au lieu d\'invalidation préfixe', () => {
    let queryClient: QueryClient;
    let invalidateSpy: ReturnType<typeof vi.spyOn>;

    const createWrapper = () => {
        return ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    });

    it('createSale (online) : insère la vente retournée dans les variantes compatibles, SANS invalidation préfixe', async () => {
        mockCreateSale.mockResolvedValue(makeSaleRow());
        const windowVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(windowVariant, []);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.createSale.mutateAsync({
            items: [{ product_id: PRODUCT_ID, product_name: 'Bière Flag', quantity: 2, unit_price: 500, total_price: 1000 }] as unknown as Sale['items'],
        });

        await waitFor(() => {
            const cached = queryClient.getQueryData<Sale[]>(windowVariant);
            expect(cached?.map(s => s.id)).toEqual(['sale-new']);
        });
        // La vente patchée porte l'idempotencyKey (dédup avec l'événement Realtime suivant)
        expect(queryClient.getQueryData<Sale[]>(windowVariant)?.[0].idempotencyKey).toBe('idem-1');
        expect(salesListInvalidations(invalidateSpy)).toHaveLength(0);
    });

    it('createSale (offline/optimistic) : conserve le repli invalidation préfixe (la vente vit dans l\'overlay offline)', async () => {
        mockCreateSale.mockResolvedValue(makeSaleRow({ id: 'sync_abc123', status: 'pending', validated_by: null, validated_at: null }));
        const windowVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(windowVariant, []);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.createSale.mutateAsync({
            items: [{ product_id: PRODUCT_ID, product_name: 'Bière Flag', quantity: 2, unit_price: 500, total_price: 1000 }] as unknown as Sale['items'],
        });

        await waitFor(() => expect(salesListInvalidations(invalidateSpy).length).toBeGreaterThan(0));
        // Aucun id fantôme 'sync_...' injecté dans le cache serveur
        expect(queryClient.getQueryData<Sale[]>(windowVariant)).toEqual([]);
    });

    it('validateSale : patche le statut depuis le clone en cache (la vente migre pending → validated), sans invalidation préfixe', async () => {
        const pendingSale = makeCachedSale({ id: 'sale-1', status: 'pending' });
        const pendingVariant = variantKey({ startDate: todayBusinessDate, status: 'pending' });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(pendingVariant, [pendingSale]);
        queryClient.setQueryData(allVariant, [pendingSale]);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.validateSale.mutateAsync({ id: 'sale-1', validatorId: 'user-999' });

        await waitFor(() => {
            expect(queryClient.getQueryData<Sale[]>(pendingVariant)).toEqual([]); // sortie de la variante pending
        });
        const inAll = queryClient.getQueryData<Sale[]>(allVariant);
        expect(inAll?.[0].status).toBe('validated');
        expect(inAll?.[0].validatedBy).toBe('user-999');
        expect(salesListInvalidations(invalidateSpy)).toHaveLength(0);
    });

    it('validateSale : vente introuvable en cache → repli invalidation préfixe (comportement historique)', async () => {
        queryClient.setQueryData(variantKey({ startDate: todayBusinessDate }), []);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.validateSale.mutateAsync({ id: 'sale-inconnu', validatorId: 'user-999' });

        await waitFor(() => expect(salesListInvalidations(invalidateSpy).length).toBeGreaterThan(0));
    });

    it('rejectSale : patche le statut rejected avec traçabilité', async () => {
        const sale = makeCachedSale({ id: 'sale-1', status: 'pending' });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(allVariant, [sale]);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.rejectSale.mutateAsync({ id: 'sale-1', rejectorId: 'user-999' });

        await waitFor(() => {
            const cached = queryClient.getQueryData<Sale[]>(allVariant);
            expect(cached?.[0].status).toBe('rejected');
            expect(cached?.[0].rejectedBy).toBe('user-999');
        });
        expect(salesListInvalidations(invalidateSpy)).toHaveLength(0);
    });

    it('deleteSale : retire la vente des variantes en cache, sans invalidation préfixe', async () => {
        const sale = makeCachedSale({ id: 'sale-1' });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(allVariant, [sale, makeCachedSale({ id: 'sale-2' })]);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.deleteSale.mutateAsync('sale-1');

        await waitFor(() => {
            expect(queryClient.getQueryData<Sale[]>(allVariant)?.map(s => s.id)).toEqual(['sale-2']);
        });
        expect(salesListInvalidations(invalidateSpy)).toHaveLength(0);
    });

    it('rejectMultipleSales : tous réussis → patch de chaque vente, sans invalidation préfixe', async () => {
        mockRejectMultipleSales.mockResolvedValue({ success: 2, failed: 0 });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(allVariant, [
            makeCachedSale({ id: 'sale-1', status: 'pending' }),
            makeCachedSale({ id: 'sale-2', status: 'pending' }),
        ]);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.rejectMultipleSales.mutateAsync({ saleIds: ['sale-1', 'sale-2'], rejectorId: 'user-999' });

        await waitFor(() => {
            const cached = queryClient.getQueryData<Sale[]>(allVariant);
            expect(cached?.every(s => s.status === 'rejected')).toBe(true);
        });
        expect(salesListInvalidations(invalidateSpy)).toHaveLength(0);
    });

    it('rejectMultipleSales : un id absent du cache au MILIEU du lot ne bloque pas le patch des ids suivants', async () => {
        // 🛡️ Régression contre-analyse (08/07/2026) : le RPC batch réussit
        // intégralement (result.failed === 0) mais 'sale-2' n'est présent dans
        // AUCUNE variante en cache (ex: gc'd, composant démonté). Avant le fix,
        // un `break` sur cet id manquant abandonnait aussi 'sale-3', pourtant
        // parfaitement patchable — il restait affiché 'pending' jusqu'au refetch
        // asynchrone du repli. Ce test fige le comportement corrigé : chaque id
        // est traité indépendamment (continue, pas break).
        mockRejectMultipleSales.mockResolvedValue({ success: 3, failed: 0 });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        queryClient.setQueryData(allVariant, [
            makeCachedSale({ id: 'sale-1', status: 'pending' }),
            // 'sale-2' volontairement absent de cette variante (et d'aucune autre)
            makeCachedSale({ id: 'sale-3', status: 'pending' }),
        ]);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.rejectMultipleSales.mutateAsync({
            saleIds: ['sale-1', 'sale-2', 'sale-3'],
            rejectorId: 'user-999',
        });

        await waitFor(() => {
            const cached = queryClient.getQueryData<Sale[]>(allVariant);
            // sale-1 ET sale-3 doivent être patchés — sale-2 (absent) ne doit pas
            // faire perdre le patch de sale-3, situé APRÈS lui dans le lot.
            expect(cached?.find(s => s.id === 'sale-1')?.status).toBe('rejected');
            expect(cached?.find(s => s.id === 'sale-3')?.status).toBe('rejected');
        });
        // sale-2 absent du cache → repli invalidation préfixe déclenché pour lui
        expect(salesListInvalidations(invalidateSpy).length).toBeGreaterThan(0);
    });

    it('rejectMultipleSales : échecs partiels → repli invalidation préfixe (on ne sait pas QUELS ids ont échoué)', async () => {
        mockRejectMultipleSales.mockResolvedValue({ success: 1, failed: 1 });
        const allVariant = variantKey({ startDate: todayBusinessDate });
        const before = [
            makeCachedSale({ id: 'sale-1', status: 'pending' }),
            makeCachedSale({ id: 'sale-2', status: 'pending' }),
        ];
        queryClient.setQueryData(allVariant, before);

        const { result } = renderHook(() => useSalesMutations(BAR_ID), { wrapper: createWrapper() });
        await result.current.rejectMultipleSales.mutateAsync({ saleIds: ['sale-1', 'sale-2'], rejectorId: 'user-999' });

        await waitFor(() => expect(salesListInvalidations(invalidateSpy).length).toBeGreaterThan(0));
        // Aucun patch hasardeux : les statuts en cache ne sont pas touchés localement
        expect(queryClient.getQueryData<Sale[]>(allVariant)?.every(s => s.status === 'pending')).toBe(true);
    });
});
