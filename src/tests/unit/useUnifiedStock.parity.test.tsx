/**
 * useUnifiedStock.parity.test.ts
 * Parity Test: Verifies that Unified Stock = Online + Offline Operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';
import { NotificationsProvider } from '../../components/Notifications';

const {
    mockUseProducts,
    mockUseSupplies,
    mockUseConsignments,
    mockUseCategories,
    mockUseStockMutations,
    mockUseAuth,
    mockOfflineQueue,
    mockSyncManager
} = vi.hoisted(() => ({
    mockUseProducts: vi.fn(() => ({
        data: [
            { id: 'prod-1', name: 'Heineken', stock: 10, barId: 'bar-123' },
            { id: 'prod-2', name: 'Coca Cola', stock: 50, barId: 'bar-123' }
        ], isLoading: false
    })),
    mockUseSupplies: vi.fn(() => ({ data: [], isLoading: false })),
    mockUseConsignments: vi.fn(() => ({ data: [], isLoading: false })),
    mockUseCategories: vi.fn(() => ({ data: [], isLoading: false })),
    mockUseStockMutations: vi.fn(() => ({
        createProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
        updateProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
        deleteProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
        adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn() },
    })),
    mockUseAuth: vi.fn(() => ({
        currentSession: { userId: 'user-123', role: 'gérant' },
    })),
    mockOfflineQueue: {
        getOperations: vi.fn(() => Promise.resolve([
            {
                type: 'CREATE_SALE',
                payload: {
                    id: 'offline-sale-1',
                    idempotency_key: 'key-1',
                    items: [
                        { product_id: 'prod-1', total_price: 11, quantity: 2 },
                        { product_id: 'prod-2', total_price: 5, quantity: 5 }
                    ]
                }
            }
        ])),
    },
    mockSyncManager: {
        getRecentlySyncedKeys: vi.fn(() => new Set()),
    }
}));

vi.mock('../../hooks/queries/useStockQueries', () => ({
    useProducts: mockUseProducts,
    useSupplies: mockUseSupplies,
    useConsignments: mockUseConsignments,
    useCategories: mockUseCategories,
    stockKeys: { all: ['stock'], products: () => ['stock', 'products'] },
}));

vi.mock('../../hooks/mutations/useStockMutations', () => ({
    useStockMutations: mockUseStockMutations,
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('../../services/offlineQueue', () => ({
    offlineQueue: mockOfflineQueue,
}));

vi.mock('../../services/SyncManager', () => ({
    syncManager: mockSyncManager,
}));

vi.mock('../../utils/calculations', () => ({
    calculateAvailableStock: (stock: number, consigned: number) => stock - consigned,
}));

// 2. Test Setup
const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <NotificationsProvider>{children}</NotificationsProvider>
        </QueryClientProvider>
    );
};

describe('useUnifiedStock Parity Test', () => {
    const barId = 'bar-123';

    it('✅ should correctly merge Online Stock and Offline Sales', async () => {
        const { result } = renderHook(() => useUnifiedStock(barId), {
            wrapper: createWrapper(),
        });

        // Wait for async offline queue fetch to reflect in calculations
        await waitFor(() => {
            const heineken = result.current.getProductStockInfo('prod-1');
            expect(heineken?.availableStock).toBe(8);
        });

        // 3. Verify Heineken logic
        // Online Stock: 10
        // Offline Sold: 2
        // Unified Should Be: 8
        const heineken = result.current.getProductStockInfo('prod-1');
        expect(heineken).toBeDefined();
        expect(heineken?.physicalStock).toBe(10); // Physical (Source of Truth DB)
        expect(heineken?.availableStock).toBe(8); // Available (After Offline Deduction)

        // 4. Verify Coca Cola logic
        // Online Stock: 50
        // Offline Sold: 5
        // Unified Should Be: 45
        const coca = result.current.getProductStockInfo('prod-2');
        expect(coca).toBeDefined();
        expect(coca?.physicalStock).toBe(50);
        expect(coca?.availableStock).toBe(45);
    });

    it('should not double-deduct synced operations still in offline queue', async () => {
        // Scénario: une vente key-1 est à la fois dans offlineSales ET recentlySyncedKeys.
        // Le stock DB n'a pas encore refetch → physicalStock = 10 (pré-sync).
        // La vente doit être comptée UNE SEULE FOIS (via recentlySyncedKeys skip dans étape 1).
        const testMap = new Map([
            ['key-1', {
                total: 11,
                timestamp: Date.now(),
                payload: {
                    idempotency_key: 'key-1',
                    items: [
                        { product_id: 'prod-1', quantity: 2, total_price: 11 },
                        { product_id: 'prod-2', quantity: 5, total_price: 5 }
                    ]
                }
            }]
        ]);
        mockSyncManager.getRecentlySyncedKeys.mockReturnValue(testMap);

        const { result } = renderHook(() => useUnifiedStock(barId), {
            wrapper: createWrapper(),
        });

        // La queue offline a aussi key-1 (mock par défaut). Mais l'offline query est async
        // et ne se résout pas dans ce test. recentlySyncedKeys couvre le "flash hole"
        // → la vente est déduite via étape 1.5, résultat: 10 - 2 = 8
        await waitFor(() => {
            const heineken = result.current.getProductStockInfo('prod-1');
            return heineken?.availableStock === 8;
        });

        const heineken = result.current.getProductStockInfo('prod-1');
        expect(heineken?.availableStock).toBe(8);

        const coca = result.current.getProductStockInfo('prod-2');
        expect(coca?.availableStock).toBe(45);
    });
});
