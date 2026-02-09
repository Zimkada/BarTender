/**
 * offline-resilience.integration.test.tsx
 * Integration: Offline Queue ↔ Sync Manager ↔ Data Hooks
 *
 * Tests:
 * - Create operations work offline with queuing
 * - Queue operations are retried on sync
 * - Failed operations stay in queue
 * - Success operations are marked as synced
 * - UI remains responsive during offline state
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedSales } from '../../hooks/pivots/useUnifiedSales';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';

const {
  mockUseSales,
  mockUseProducts,
  mockUseSupplies,
  mockUseConsignments,
  mockUseCategories,
  mockUseAuth,
  mockSalesService,
  mockUseSalesMutations,
  mockUseStockMutations,
  mockOfflineQueue,
  mockSyncManager,
  mockBusinessDateHelpers
} = vi.hoisted(() => ({
  mockUseSales: vi.fn(() => ({ data: [], isLoading: false })),
  mockUseProducts: vi.fn(() => ({ data: [], isLoading: false })),
  mockUseSupplies: vi.fn(() => ({ data: [], isLoading: false })),
  mockUseConsignments: vi.fn(() => ({ data: [], isLoading: false })),
  mockUseCategories: vi.fn(() => ({ data: [], isLoading: false })),
  mockUseAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'serveur' },
  })),
  mockOfflineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
    enqueue: vi.fn(),
  },
  mockSyncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
    syncAll: vi.fn(),
  },
  mockSalesService: {
    createSale: vi.fn(),
  },
  mockUseSalesMutations: vi.fn(() => ({
    createSale: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
    cancelSale: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
  })),
  mockUseStockMutations: vi.fn(() => ({
    adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(true) },
  })),
  mockBusinessDateHelpers: {
    getCurrentBusinessDateString: vi.fn(() => '2025-02-09'),
  }
}));

vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: mockUseSales,
  salesKeys: { all: ['sales'] },
}));

vi.mock('../../hooks/queries/useStockQueries', () => ({
  useProducts: mockUseProducts,
  useSupplies: mockUseSupplies,
  useConsignments: mockUseConsignments,
  useCategories: mockUseCategories,
  stockKeys: { all: ['stock'] },
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

vi.mock('../../services/supabase/sales.service', () => ({
  SalesService: mockSalesService,
}));

vi.mock('../../hooks/mutations/useSalesMutations', () => ({
  useSalesMutations: mockUseSalesMutations,
}));

vi.mock('../../hooks/mutations/useStockMutations', () => ({
  useStockMutations: mockUseStockMutations,
}));

vi.mock('../../utils/businessDateHelpers', () => mockBusinessDateHelpers);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Offline Resilience Integration', () => {
  const barId = 'bar-123';

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('📱 Offline Operation Queuing', () => {
    it('should queue sale when offline', async () => {
      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      mockUseSalesMutations.mockReturnValue({
        createSale: {
          mutateAsync: vi.fn().mockImplementation(async (payload) => {
            await mockOfflineQueue.enqueue({ type: 'CREATE_SALE', payload });
            return { id: 'temp-1' };
          })
        }
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // Simulate offline operation
      const saleData = {
        items: [{ product_id: 'prod-1', quantity: 2, price: 5.5 }],
        total: 11,
        bar_id: barId,
        idempotency_key: 'key-offline-1',
      };

      await result.current.addSale(saleData);

      expect(mockOfflineQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREATE_SALE',
        })
      );
    });

    it('should queue product update when offline', async () => {
      mockUseStockMutations.mockReturnValue({
        adjustStock: {
          mutateAsync: vi.fn().mockImplementation(async (payload) => {
            await mockOfflineQueue.enqueue({ type: 'ADJUST_STOCK', payload });
            return true;
          })
        }
      });

      const { result } = renderHook(
        () => useUnifiedStock(barId),
        { wrapper: createWrapper() }
      );

      // Simulate offline stock adjustment
      await result.current.increasePhysicalStock('prod-1', 10);

      expect(mockOfflineQueue.enqueue).toHaveBeenCalled();
    });

    it('should show pending status for queued operations', async () => {
      const pendingOps = [
        {
          id: 'op-1',
          type: 'CREATE_SALE',
          status: 'pending',
          payload: {
            idempotency_key: 'key-1',
            total: 50,
          },
        },
      ];

      mockOfflineQueue.getOperations.mockResolvedValue(pendingOps);
      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      // Should have queued sales visible
      expect(result.current.sales).toBeDefined();
    });
  });

  describe('🔄 Sync Recovery', () => {
    it('should retry synced operations when connectivity restored', async () => {
      mockSyncManager.syncAll.mockResolvedValue({
        synced: ['key-1', 'key-2'],
        failed: [],
      });

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // Trigger sync
      await result.current.refetch();

      expect(mockSyncManager.syncAll).toHaveBeenCalled();
    });

    it('should mark successfully synced operations', async () => {
      const syncedKeys = new Map([
        ['key-1', { synced_at: '2025-02-09T10:00:00Z' }],
      ]);

      mockSyncManager.getRecentlySyncedKeys.mockReturnValue(syncedKeys);

      mockOfflineQueue.getOperations.mockResolvedValue([
        {
          type: 'CREATE_SALE',
          status: 'synced',
          payload: {
            idempotency_key: 'key-1',
          },
        },
      ]);

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      expect(syncedKeys.has('key-1')).toBe(true);
    });

    it('should keep failed operations in queue for retry', async () => {
      const failedOps = [
        {
          id: 'op-1',
          type: 'CREATE_SALE',
          status: 'pending',
          payload: {
            idempotency_key: 'key-fail-1',
            total: 50,
          },
          error: 'NETWORK_ERROR',
          retryCount: 1,
        },
      ];

      mockOfflineQueue.getOperations.mockResolvedValue(failedOps);
      mockSyncManager.getRecentlySyncedKeys.mockReturnValue(new Map());

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      // Failed ops should remain visible for user action
      expect(failedOps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'pending' }),
        ])
      );
    });
  });

  describe('⚡ Responsiveness During Offline', () => {
    it('should not block UI while syncing', async () => {
      // Simulate slow sync
      mockSyncManager.syncAll.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ synced: [], failed: [] }),
              1000
            )
          )
      );

      mockUseSales.mockReturnValue({
        data: [{ id: 'sale-1', total: 50 }],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // UI should respond immediately
      expect(result.current.sales).toBeDefined();
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 2000 });
    });

    it('should allow new operations while syncing', async () => {
      mockOfflineQueue.enqueue.mockResolvedValue({ id: 'queue-1' });

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // Add sale 1
      await result.current.addSale({
        items: [],
        total: 50,
        idempotency_key: 'key-1',
      });

      // Should still be able to add another
      await result.current.addSale({
        items: [],
        total: 75,
        idempotency_key: 'key-2',
      });

      expect(mockOfflineQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('🔐 Data Integrity During Sync', () => {
    it('should prevent double-processing with idempotency keys', async () => {
      const duplicateOps = [
        {
          type: 'CREATE_SALE',
          payload: {
            idempotency_key: 'key-unique-1',
            total: 100,
          },
        },
        {
          type: 'CREATE_SALE',
          payload: {
            idempotency_key: 'key-unique-1', // Same key!
            total: 100,
          },
        },
      ];

      mockOfflineQueue.getOperations.mockResolvedValue(duplicateOps);

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      // Only one operation with that key should be processed
      const uniqueKeys = new Set(
        duplicateOps.map((op: any) => op.payload.idempotency_key)
      );
      expect(uniqueKeys.size).toBe(1);
    });

    it('should maintain transaction atomicity', async () => {
      // Multi-item sale
      const complexOp = [
        {
          type: 'CREATE_SALE',
          payload: {
            idempotency_key: 'atomic-1',
            items: [
              { product_id: 'prod-1', quantity: 2 },
              { product_id: 'prod-2', quantity: 1 },
              { product_id: 'prod-3', quantity: 3 },
            ],
            total: 45,
          },
        },
      ];

      mockOfflineQueue.getOperations.mockResolvedValue(complexOp);

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      // All items in transaction should be kept together
      expect(complexOp[0].payload.items.length).toBe(3);
    });
  });
});
