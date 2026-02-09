/**
 * useUnifiedStock.test.ts
 * Unit tests for Smart Hook: Hash Memoization, CRUD, Stock Calculations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUnifiedStock } from '../../hooks/pivots/useUnifiedStock';

// Mock the hooks
vi.mock('../../hooks/queries/useStockQueries', () => ({
  useProducts: vi.fn(() => ({ data: [], isLoading: false })),
  useSupplies: vi.fn(() => ({ data: [], isLoading: false })),
  useConsignments: vi.fn(() => ({ data: [], isLoading: false })),
  useCategories: vi.fn(() => ({ data: [], isLoading: false })),
  stockKeys: { all: ['stock'] },
}));

vi.mock('../../hooks/mutations/useStockMutations', () => ({
  useStockMutations: vi.fn(() => ({
    createProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteProduct: { mutate: vi.fn(), mutateAsync: vi.fn() },
    adjustStock: { mutate: vi.fn(), mutateAsync: vi.fn() },
  })),
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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useUnifiedStock', () => {
  const barId = 'bar-123';

  describe('🔴 Hash-Based Memoization', () => {
    it('should maintain same reference when data hash unchanged', () => {
      const { result, rerender } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      const firstCall = result.current;
      rerender();
      const secondCall = result.current;

      expect(firstCall.products).toBe(secondCall.products);
    });
  });

  describe('✅ Product CRUD Operations', () => {
    it('should expose addProduct callback', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.addProduct).toBeDefined();
      expect(typeof result.current.addProduct).toBe('function');
    });

    it('should expose updateProduct callback', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.updateProduct).toBeDefined();
    });

    it('should expose deleteProduct callback', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.deleteProduct).toBeDefined();
    });

    it('should expose addProducts (batch) callback', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.addProducts).toBeDefined();
    });
  });

  describe('📊 Stock Info Methods', () => {
    it('should expose getProductStockInfo method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.getProductStockInfo).toBeDefined();
    });

    it('should expose increasePhysicalStock method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.increasePhysicalStock).toBeDefined();
    });

    it('should expose decreasePhysicalStock method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.decreasePhysicalStock).toBeDefined();
    });
  });

  describe('🎁 Consignment Operations', () => {
    it('should expose createConsignment method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.createConsignment).toBeDefined();
    });

    it('should expose claimConsignment method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.claimConsignment).toBeDefined();
    });

    it('should expose forfeitConsignment method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.forfeitConsignment).toBeDefined();
    });

    it('should expose checkAndExpireConsignments method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.checkAndExpireConsignments).toBeDefined();
    });

    it('should expose getActiveConsignments method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.getActiveConsignments).toBeDefined();
    });
  });

  describe('📦 Supply Operations', () => {
    it('should expose processSupply method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.processSupply).toBeDefined();
    });
  });

  describe('🏷️ Categories', () => {
    it('should expose categories array', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(Array.isArray(result.current.categories)).toBe(true);
    });

    it('should expose addCategories method', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.addCategories).toBeDefined();
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('should handle undefined barId gracefully', () => {
      const { result } = renderHook(() => useUnifiedStock(undefined), {
        wrapper: createWrapper(),
      });

      expect(Array.isArray(result.current.products)).toBe(true);
    });

    it('should handle empty data arrays', () => {
      const { result } = renderHook(() => useUnifiedStock(barId), {
        wrapper: createWrapper(),
      });

      expect(result.current.products.length).toBe(0);
      expect(result.current.categories.length).toBe(0);
    });
  });
});
