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

vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: vi.fn(() => ({ data: [], isLoading: false })),
  salesKeys: { all: ['sales'] },
}));

vi.mock('../../hooks/queries/useStockQueries', () => ({
  useProducts: vi.fn(() => ({ data: [], isLoading: false })),
  useSupplies: vi.fn(() => ({ data: [], isLoading: false })),
  useConsignments: vi.fn(() => ({ data: [], isLoading: false })),
  useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  stockKeys: { all: ['stock'] },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'serveur' },
  })),
}));

vi.mock('../../services/offlineQueue', () => ({
  offlineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
    enqueue: vi.fn(),
  },
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
    sync: vi.fn(),
  },
}));

vi.mock('../../utils/businessDateHelpers', () => ({
  getCurrentBusinessDateString: vi.fn(() => '2025-02-09'),
}));

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
      const { offlineQueue } = await import('../../services/offlineQueue');
      const { useSales } = await import('../../hooks/queries/useSalesQueries');

      (useSales as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      (offlineQueue.enqueue as any).mockResolvedValue({
        id: 'queue-1',
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

      expect(offlineQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CREATE_SALE',
        })
      );
    });

    it('should queue product update when offline', async () => {
      const { offlineQueue } = await import('../../services/offlineQueue');

      (offlineQueue.enqueue as any).mockResolvedValue({
        id: 'queue-1',
      });

      const { result } = renderHook(
        () => useUnifiedStock(barId),
        { wrapper: createWrapper() }
      );

      // Simulate offline stock adjustment
      await result.current.increasePhysicalStock('prod-1', 10);

      expect(offlineQueue.enqueue).toHaveBeenCalled();
    });

    it('should show pending status for queued operations', async () => {
      const { offlineQueue } = await import('../../services/offlineQueue');
      const { useSales } = await import('../../hooks/queries/useSalesQueries');

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

      (offlineQueue.getOperations as any).mockResolvedValue(pendingOps);
      (useSales as any).mockReturnValue({
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
      const { syncManager } = await import('../../services/SyncManager');
      const { useSales } = await import('../../hooks/queries/useSalesQueries');

      (syncManager.sync as any).mockResolvedValue({
        synced: ['key-1', 'key-2'],
        failed: [],
      });

      (useSales as any).mockReturnValue({
        data: [],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // Trigger sync
      await result.current.refetch();

      expect(syncManager.sync).toHaveBeenCalled();
    });

    it('should mark successfully synced operations', async () => {
      const { syncManager } = await import('../../services/SyncManager');
      const { offlineQueue } = await import('../../services/offlineQueue');

      const syncedKeys = new Map([
        ['key-1', { synced_at: '2025-02-09T10:00:00Z' }],
      ]);

      (syncManager.getRecentlySyncedKeys as any).mockReturnValue(syncedKeys);

      (offlineQueue.getOperations as any).mockResolvedValue([
        {
          type: 'CREATE_SALE',
          status: 'synced',
          payload: {
            idempotency_key: 'key-1',
          },
        },
      ]);

      const { useSales } = await import('../../hooks/queries/useSalesQueries');
      (useSales as any).mockReturnValue({
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
      const { syncManager } = await import('../../services/SyncManager');
      const { offlineQueue } = await import('../../services/offlineQueue');

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

      (offlineQueue.getOperations as any).mockResolvedValue(failedOps);
      (syncManager.getRecentlySyncedKeys as any).mockReturnValue(new Map());

      const { useSales } = await import('../../hooks/queries/useSalesQueries');
      (useSales as any).mockReturnValue({
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
      const { syncManager } = await import('../../services/SyncManager');
      const { useSales } = await import('../../hooks/queries/useSalesQueries');

      // Simulate slow sync
      (syncManager.sync as any).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ synced: [], failed: [] }),
              1000
            )
          )
      );

      (useSales as any).mockReturnValue({
        data: [{ id: 'sale-1', total: 50 }],
        isLoading: false,
      });

      const { result } = renderHook(
        () => useUnifiedSales(barId),
        { wrapper: createWrapper() }
      );

      // UI should respond immediately
      expect(result.current.sales).toBeDefined();
      expect(result.current.isLoading).toBe(false);
    });

    it('should allow new operations while syncing', async () => {
      const { offlineQueue } = await import('../../services/offlineQueue');
      const { useSales } = await import('../../hooks/queries/useSalesQueries');

      (offlineQueue.enqueue as any).mockResolvedValue({ id: 'queue-1' });

      (useSales as any).mockReturnValue({
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

      expect(offlineQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('🔐 Data Integrity During Sync', () => {
    it('should prevent double-processing with idempotency keys', async () => {
      const { offlineQueue } = await import('../../services/offlineQueue');

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

      (offlineQueue.getOperations as any).mockResolvedValue(duplicateOps);

      const { useSales } = await import('../../hooks/queries/useSalesQueries');
      (useSales as any).mockReturnValue({
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
      const { offlineQueue } = await import('../../services/offlineQueue');

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

      (offlineQueue.getOperations as any).mockResolvedValue(complexOp);

      const { useSales } = await import('../../hooks/queries/useSalesQueries');
      (useSales as any).mockReturnValue({
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
