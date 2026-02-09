/**
 * useUnifiedStock.parity.test.ts
 * Parity Test: Verifies that Unified Stock = Online + Offline Operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';

// 1. Mock dependencies
const mockProducts = [
    { id: 'prod-1', name: 'Heineken', stock: 10, barId: 'bar-123' },
    { id: 'prod-2', name: 'Coca Cola', stock: 50, barId: 'bar-123' }
];

const mockOfflineSales = [
    {
        type: 'CREATE_SALE',
        payload: {
            id: 'offline-sale-1',
            idempotency_key: 'key-1',
            items: [
                { product_id: 'prod-1', quantity: 2 }, // Sold 2 Heinekens offline
                { product_id: 'prod-2', quantity: 5 }  // Sold 5 Coca Colas offline
            ]
        }
    }
];

vi.mock('../../hooks/queries/useStockQueries', () => ({
    useProducts: vi.fn(() => ({ data: mockProducts, isLoading: false })),
    useSupplies: vi.fn(() => ({ data: [], isLoading: false })),
    useConsignments: vi.fn(() => ({ data: [], isLoading: false })),
    useCategories: vi.fn(() => ({ data: [], isLoading: false })),
    stockKeys: { all: ['stock'], products: () => ['stock', 'products'] },
}));

vi.mock('../../hooks/mutations/useStockMutations', () => ({
    useStockMutations: vi.fn(() => ({
        createProduct: { mutate: vi.fn() },
        updateProduct: { mutate: vi.fn() },
        deleteProduct: { mutate: vi.fn() },
        adjustStock: { mutate: vi.fn() },
    })),
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        currentSession: { userId: 'user-123', role: 'gérant' },
    })),
}));

vi.mock('../../services/offlineQueue', () => ({
    offlineQueue: {
        getOperations: vi.fn(() => Promise.resolve(mockOfflineSales)),
    },
}));

vi.mock('../../services/SyncManager', () => ({
    syncManager: {
        getRecentlySyncedKeys: vi.fn(() => new Set()), // No keys synced yet
    },
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
        <QueryClientProvider client={queryClient} > {children} </QueryClientProvider>
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

    it('should ignore already synced operations', async () => {
        // Mock SyncManager to say 'key-1' is already synced
        const { syncManager } = await import('../../services/SyncManager');
        (syncManager.getRecentlySyncedKeys as any).mockReturnValue(new Set(['key-1']));

        const { result, rerender } = renderHook(() => useUnifiedStock(barId), {
            wrapper: createWrapper(),
        });

        await waitFor(() => {
            const heineken = result.current.getProductStockInfo('prod-1');
            // If synced, availableStock should equal physicalStock (10) because DB is already updated (simulator scenario where DB updated but queue not cleared yet)
            // OR in this mock scenario: physical stock is still 10 (mock), but we ignore the offline op.
            // So expected: 10
            return heineken?.availableStock === 10;
        });

        const heineken = result.current.getProductStockInfo('prod-1');
        expect(heineken?.availableStock).toBe(10);
    });
});
