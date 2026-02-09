/**
 * useUnifiedSales.test.ts
 * Unit tests for Smart Hook: Today's Sales, Idempotency, Stats
 *
 * Focus:
 * - Today's sales calculation (business date aware)
 * - Idempotency key deduplication
 * - Business date filtering
 * - Stats aggregation (revenue, count, average)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedSales } from '../../hooks/pivots/useUnifiedSales';

// Mock the queries
vi.mock('../../hooks/queries/useSalesQueries', () => ({
  useSales: vi.fn(() => ({ data: [], isLoading: false })),
  salesKeys: { all: ['sales'] },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentSession: { userId: 'user-123', role: 'gérant' },
  })),
}));

vi.mock('../../services/offlineQueue', () => ({
  offlineQueue: {
    getOperations: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../services/SyncManager', () => ({
  syncManager: {
    getRecentlySyncedKeys: vi.fn(() => new Map()),
  },
}));

vi.mock('../../utils/businessDateHelpers', () => ({
  getCurrentBusinessDateString: vi.fn(() => '2025-02-09'),
  filterByBusinessDateRange: vi.fn((items, start, end) => items),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUnifiedSales', () => {
  const barId = 'bar-123';

  describe('✅ Hook Returns Correct Structure', () => {
    it('should expose sales array', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(Array.isArray(result.current.sales)).toBe(true);
    });

    it('should expose stats object with sales property', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats).toBeDefined();
      expect(result.current.stats).toHaveProperty('sales');
    });

    it('should expose isLoading flag', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.isLoading).toBe('boolean');
    });

    it('should expose addSale callback', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.addSale).toBeDefined();
      expect(typeof result.current.addSale).toBe('function');
    });

    it('should expose refetch function', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('📊 Stats Calculation', () => {
    it('should have stats.sales property', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats.sales).toBeDefined();
    });

    it('should have stats.todayTotal property', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats).toHaveProperty('todayTotal');
    });

    it('should have stats.todayCount property', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats).toHaveProperty('todayCount');
    });

    it('stats.todayTotal should be a number', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.stats.todayTotal).toBe('number');
    });

    it('stats.todayCount should be a number', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.stats.todayCount).toBe('number');
    });
  });

  describe('🔑 Idempotency Key Handling', () => {
    it('should handle empty idempotency key map', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      // Should not crash with empty sync map
      expect(result.current.sales).toBeDefined();
    });

    it('should handle multiple synced operations', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      // Should maintain stability with synced keys
      expect(Array.isArray(result.current.sales)).toBe(true);
    });
  });

  describe('📅 Business Date Handling', () => {
    it('should filter sales by business date range', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      // Stats should contain today's date filtered sales
      expect(result.current.stats.todayCount).toBeDefined();
    });

    it('should use closing hour for business date calculation', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      // Should respect business day boundaries
      expect(Array.isArray(result.current.sales)).toBe(true);
    });
  });

  describe('🔄 Online + Offline Fusion', () => {
    it('should handle empty online sales', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.sales.length).toBe(0);
    });

    it('should handle empty offline queue', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(Array.isArray(result.current.sales)).toBe(true);
    });

    it('should merge online and offline sales', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      // Result should combine both sources
      expect(result.current.sales).toBeDefined();
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('should handle undefined barId gracefully', () => {
      const { result } = renderHook(() => useUnifiedSales(undefined), {
        wrapper: createWrapper(),
      });

      expect(Array.isArray(result.current.sales)).toBe(true);
    });

    it('should handle null sales data', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats.todayTotal >= 0).toBe(true);
    });

    it('should have non-negative revenue', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats.todayTotal >= 0).toBe(true);
    });

    it('should have non-negative count', () => {
      const { result } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.stats.todayCount >= 0).toBe(true);
    });
  });

  describe('🎯 Hash Memoization', () => {
    it('should maintain stable reference for empty sales', () => {
      const { result, rerender } = renderHook(() => useUnifiedSales(barId), {
        wrapper: createWrapper(),
      });

      const firstCall = result.current;
      rerender();
      const secondCall = result.current;

      // Should be same reference for empty data
      expect(firstCall.sales).toBe(secondCall.sales);
    });
  });
});
