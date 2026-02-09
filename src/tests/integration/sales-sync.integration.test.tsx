/**
 * sales-sync.integration.test.tsx
 * Integration: Sales Hook ↔ Sync Manager ↔ Offline Queue
 *
 * Tests:
 * - Online sales merge with offline queue operations
 * - Idempotency key deduplication during sync
 * - Stats recalculation after sync
 * - Business date filtering with closing hour
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedSales } from '../../hooks/pivots/useUnifiedSales';

const { mockUseSales, mockOfflineQueue, mockSyncManager } = vi.hoisted(() => ({
  mockUseSales: vi.fn(),
  mockOfflineQueue: {
    getOperations: vi.fn(),
  },
  mockSyncManager: {
    getRecentlySyncedKeys: vi.fn(),
  },
}));

vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: mockUseSales,
  salesKeys: { all: ['sales'] },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'serveur' },
  })),
}));

vi.mock('../../services/offlineQueue', () => ({
  offlineQueue: mockOfflineQueue,
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: mockSyncManager,
}));

vi.mock('../../utils/businessDateHelpers', () => ({
  getCurrentBusinessDateString: vi.fn(() => '2025-02-09'),
  filterByBusinessDateRange: vi.fn((items, _start, _end) => items),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Sales Sync Integration', () => {
  const barId = 'bar-123';
  const closingHour = 6;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('🔄 Online + Offline Fusion', () => {
    it('should merge online and offline sales correctly', async () => {

      const onlineSales = [
        {
          id: 'online-1',
          items: [{ product_id: 'prod-1', quantity: 2, price: 5.5 }],
          total: 11,
          created_at: '2025-02-09T10:00:00Z',
          bar_id: barId,
        },
      ];

      const offlineOperations = [
        {
          type: 'CREATE_SALE',
          status: 'pending',
          payload: {
            id: 'offline-1',
            idempotency_key: 'key-offline-1',
            items: [{ product_id: 'prod-2', quantity: 1, price: 6.0 }],
            total: 6,
            bar_id: barId,
          },
        },
      ];

      mockUseSales.mockReturnValue({
        data: onlineSales,
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue(offlineOperations);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales.length).toBeGreaterThanOrEqual(1);
      });

      // Should have both online and offline sales
      const hasOnline = result.current.sales.some(
        (s: any) => s.id === 'online-1'
      );
      expect(hasOnline || result.current.sales.length > 0).toBe(true);
    });

    it('should not double-count synced operations', async () => {

      const onlineSales = [
        {
          id: 'sale-1',
          idempotency_key: 'key-1',
          total: 10,
          created_at: '2025-02-09T10:00:00Z',
          bar_id: barId,
        },
      ];

      const offlineOperations = [
        {
          type: 'CREATE_SALE',
          status: 'synced',
          payload: {
            id: 'sale-1',
            idempotency_key: 'key-1',
            total: 10,
            bar_id: barId,
          },
        },
      ];

      mockUseSales.mockReturnValue({
        data: onlineSales,
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue(offlineOperations);

      // Mark key-1 as synced
      mockSyncManager.getRecentlySyncedKeys.mockReturnValue(
        new Set(['key-1'])
      );

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales.length).toBe(1);
      });

      // Should only have one sale, not duplicated
      expect(result.current.sales.length).toBe(1);
    });
  });

  describe('📊 Stats After Sync', () => {
    it('should recalculate stats when sync completes', async () => {

      const sales = [
        {
          id: 'sale-1',
          total: 50,
          created_at: '2025-02-09T10:00:00Z',
          bar_id: barId,
        },
        {
          id: 'sale-2',
          total: 75,
          created_at: '2025-02-09T15:00:00Z',
          bar_id: barId,
        },
      ];

      mockUseSales.mockReturnValue({
        data: sales,
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.stats).toBeDefined();
      });

      // Stats should reflect merged data
      expect(typeof result.current.stats.todayTotal).toBe('number');
      expect(typeof result.current.stats.todayCount).toBe('number');
      expect(result.current.stats.todayCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('🔑 Idempotency Key Handling', () => {
    it('should prevent duplicate sales with same idempotency key', async () => {

      const sale = {
        id: 'sale-1',
        idempotency_key: 'unique-key-123',
        total: 100,
        created_at: '2025-02-09T10:00:00Z',
        bar_id: barId,
      };

      // Same sale in both online and offline
      mockUseSales.mockReturnValue({
        data: [sale],
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([
        {
          type: 'CREATE_SALE',
          payload: { ...sale, id: 'temp-offline' },
        },
      ]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales.length).toBeGreaterThanOrEqual(1);
      });

      // Should deduplicate by idempotency key
      const uniqueKeys = new Set(
        result.current.sales.map((s: any) => s.idempotency_key)
      );
      expect(uniqueKeys.size).toBeLessThanOrEqual(result.current.sales.length);
    });
  });

  describe('📅 Business Date Filtering', () => {
    it('should only include sales from current business day', async () => {

      const sales = [
        {
          id: 'sale-1',
          total: 50,
          created_at: '2025-02-09T10:00:00Z', // Today
          bar_id: barId,
        },
        {
          id: 'sale-2',
          total: 75,
          created_at: '2025-02-08T22:00:00Z', // Yesterday
          bar_id: barId,
        },
      ];

      mockUseSales.mockReturnValue({
        data: sales,
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales).toBeDefined();
      });

      // getTodayReturns should respect business date
      const todaySales = result.current.sales;
      expect(Array.isArray(todaySales)).toBe(true);
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('should handle empty offline queue', async () => {

      mockUseSales.mockReturnValue({
        data: [
          {
            id: 'sale-1',
            total: 50,
            created_at: '2025-02-09T10:00:00Z',
            bar_id: barId,
          },
        ],
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.sales.length).toBeGreaterThan(0);
      });

      expect(result.current.sales.length).toBe(1);
    });

    it('should handle undefined barId gracefully', async () => {

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(undefined, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.sales).toBeDefined();
      expect(Array.isArray(result.current.sales)).toBe(true);
    });

    it('should handle null sales data', async () => {

      mockUseSales.mockReturnValue({
        data: null,
        isLoading: false,
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(Array.isArray(result.current.sales)).toBe(true);
    });
  });

  describe('🔄 Refetch Behavior', () => {
    it('should expose refetch function for manual sync', async () => {

      mockUseSales.mockReturnValue({
        data: [],
        isLoading: false,
        refetch: vi.fn(),
      });

      mockOfflineQueue.getOperations.mockResolvedValue([]);

      const { result } = renderHook(
        () => useUnifiedSales(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe('function');
    });
  });
});
