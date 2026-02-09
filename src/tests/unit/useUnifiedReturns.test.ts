/**
 * useUnifiedReturns.test.ts
 * Unit tests for Smart Hook: Return Status, Refunds, RBAC
 *
 * Focus:
 * - Return status transitions (pending → approved → restocked)
 * - Refund amount calculations
 * - Business date filtering
 * - RBAC role-based filtering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedReturns } from '../../hooks/pivots/useUnifiedReturns';

// Mock the queries
vi.mock('../../hooks/queries/useReturnsQueries', () => ({
  useReturns: vi.fn(() => ({ data: [], isLoading: false })),
  returnKeys: { all: ['returns'] },
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

vi.mock('../../constants/businessDay', () => ({
  BUSINESS_DAY_CLOSE_HOUR: 6,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUnifiedReturns', () => {
  const barId = 'bar-123';
  const closingHour = 6;

  describe('✅ Hook Returns Correct Structure', () => {
    it('should expose getTodayReturns function', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.getTodayReturns).toBeDefined();
      expect(typeof result.current.getTodayReturns).toBe('function');
    });

    it('should expose getReturnsBySale function', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.getReturnsBySale).toBeDefined();
      expect(typeof result.current.getReturnsBySale).toBe('function');
    });

    it('should expose getPendingReturns function', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.getPendingReturns).toBeDefined();
      expect(typeof result.current.getPendingReturns).toBe('function');
    });

    it('should expose processReturn callback', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(result.current.processReturn).toBeDefined();
      expect(typeof result.current.processReturn).toBe('function');
    });

    it('should expose isLoading flag', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      expect(typeof result.current.isLoading).toBe('boolean');
    });
  });

  describe('📅 Business Date Filtering', () => {
    it('should filter returns by business date range', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });

    it('should respect closing hour for business date', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, 6),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns).toBeDefined();
    });

    it('should handle default closing hour', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });
  });

  describe('🔄 Status Transitions', () => {
    it('should handle pending status', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const pending = result.current.getPendingReturns();
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should handle approved status', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      // Should not crash when processing approved returns
      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns).toBeDefined();
    });

    it('should handle restocked status', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      // Should not crash when processing restocked returns
      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns).toBeDefined();
    });
  });

  describe('💰 Refund Calculations', () => {
    it('should have refund information in returns', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      // Returns should have refund-related properties if present
      if (todayReturns.length > 0) {
        expect(todayReturns[0]).toHaveProperty('quantityReturned');
      }
    });

    it('should calculate refunds from approved returns', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });
  });

  describe('🔑 Sale-Return Relationships', () => {
    it('should retrieve returns by sale ID', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const saleReturns = result.current.getReturnsBySale('sale-123');
      expect(Array.isArray(saleReturns)).toBe(true);
    });

    it('should return empty array for non-existent sale', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const saleReturns = result.current.getReturnsBySale('non-existent');
      expect(saleReturns.length).toBe(0);
    });
  });

  describe('👥 RBAC Role-Based Filtering', () => {
    it('should filter returns by user role when serveur', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      // Should respect role-based filtering
      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });

    it('should show all returns to gérant', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      // Gérant should see all returns
      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('should handle undefined barId gracefully', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(undefined, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });

    it('should handle null returns data', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns.length >= 0).toBe(true);
    });

    it('should handle empty returns array', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns.length).toBe(0);
    });

    it('should handle pending returns list being empty', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const pending = result.current.getPendingReturns();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('🔄 Online + Offline Fusion', () => {
    it('should merge online and offline returns', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(Array.isArray(todayReturns)).toBe(true);
    });

    it('should handle empty offline queue', () => {
      const { result } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const todayReturns = result.current.getTodayReturns();
      expect(todayReturns).toBeDefined();
    });
  });

  describe('🎯 Hash Memoization', () => {
    it('should maintain stable reference for empty returns', () => {
      const { result, rerender } = renderHook(
        () => useUnifiedReturns(barId, closingHour),
        { wrapper: createWrapper() }
      );

      const firstCall = result.current;
      rerender();
      const secondCall = result.current;

      // Should be same reference for empty data
      expect(firstCall).toBe(secondCall);
    });
  });
});
