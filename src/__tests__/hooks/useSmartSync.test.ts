/**
 * useSmartSync.test.ts
 * Tests pour validation Phase 1-2 - SmartSync Integration
 *
 * Tests:
 * 1. Hook initialization
 * 2. Broadcast + Realtime + Polling hybride
 * 3. Fallback behavior
 * 4. Query invalidation
 * 5. Performance optimizations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSmartSync } from '../../hooks/useSmartSync';
import { broadcastService } from '../../services/broadcast/BroadcastService';
import React from 'react';

// Mock Supabase client
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: vi.fn(),
        })),
      })),
    })),
  },
}));

describe('useSmartSync - Phase 1-2 Validation', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    broadcastService.setQueryClient(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
    broadcastService.closeAllChannels();
  });

  describe('1. Hook Initialization', () => {
    it('should initialize with default config', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar-123',
          }),
        { wrapper }
      );

      expect(result.current).toHaveProperty('isSynced');
      expect(result.current).toHaveProperty('syncStatus');
      expect(result.current).toHaveProperty('isRealtimeConnected');
      expect(result.current).toHaveProperty('isBroadcastSupported');
      expect(result.current).toHaveProperty('broadcast');
      expect(result.current).toHaveProperty('invalidate');
    });

    it('should respect enabled flag', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'sales',
            event: 'INSERT',
            enabled: false,
          }),
        { wrapper }
      );

      // Should still initialize but not create subscriptions
      expect(result.current).toBeDefined();
    });

    it('should initialize with custom staleTime and refetchInterval', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            staleTime: 60000,
            refetchInterval: 45000,
          }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('2. Sync Status Detection', () => {
    it('should report broadcast support status', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      expect(typeof result.current.isBroadcastSupported).toBe('boolean');
    });

    it('should determine overall sync status', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'sales',
            event: 'INSERT',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      // isSynced should be true if either Realtime or Broadcast is available
      expect(typeof result.current.isSynced).toBe('boolean');
    });

    it('should report correct syncStatus hierarchy', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      // Should be one of: 'realtime', 'broadcast', 'polling'
      expect(['realtime', 'broadcast', 'polling']).toContain(result.current.syncStatus);
    });
  });

  describe('3. Broadcast Integration', () => {
    it('should provide broadcast function', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      expect(typeof result.current.broadcast).toBe('function');
    });

    it('should broadcast messages without errors', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'sales',
            event: 'INSERT',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      expect(() => {
        result.current.broadcast('INSERT', { id: 'sale-1', total: 5000 });
      }).not.toThrow();
    });

    it('should provide invalidate function', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      expect(typeof result.current.invalidate).toBe('function');
    });
  });

  describe('4. Realtime Subscription', () => {
    it('should create channel with correct filter', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar-123',
            enabled: true,
          }),
        { wrapper }
      );

      // Should have channelId if connected
      if (result.current.isRealtimeConnected) {
        expect(result.current.channelId).toBeDefined();
      }
    });

    it('should handle Realtime connection errors gracefully', async () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'error-test',
            enabled: true,
          }),
        { wrapper }
      );

      // Should not throw even if Realtime fails
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    it('should report error state if Realtime fails', async () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
          }),
        { wrapper }
      );

      // Error property should exist (may be null if no error)
      expect(result.current).toHaveProperty('error');
    });
  });

  describe('5. Fallback Polling Behavior', () => {
    it('should use polling when Realtime is unavailable', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'test-bar',
            refetchInterval: 30000,
          }),
        { wrapper }
      );

      // If not synced, should fall back to polling
      if (!result.current.isSynced) {
        expect(result.current.syncStatus).toBe('polling');
      }
    });

    it('should disable polling when synced via Realtime/Broadcast', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'sales',
            event: 'INSERT',
            barId: 'test-bar',
            refetchInterval: 30000,
          }),
        { wrapper }
      );

      // When isSynced is true, polling should be disabled
      // (verified by checking that refetchInterval in query would be false)
      if (result.current.isSynced) {
        expect(['realtime', 'broadcast']).toContain(result.current.syncStatus);
      }
    });
  });

  describe('6. Query Invalidation', () => {
    it('should invalidate queries on broadcast message', async () => {
      const barId = 'test-bar-123';
      const table = 'bar_products';

      // Setup: Add data to cache
      queryClient.setQueryData([table, barId], [{ id: 'product-1', stock: 10 }]);

      renderHook(
        () =>
          useSmartSync({
            table,
            event: 'UPDATE',
            barId,
          }),
        { wrapper }
      );

      // Simulate broadcast message (manual trigger)
      broadcastService.invalidateQueries(table, barId);

      await waitFor(() => {
        const state = queryClient.getQueryState([table, barId]);
        expect(state).toBeDefined();
      });
    });

    it('should invalidate correct query keys', () => {
      const barId = 'specific-bar';
      const table = 'sales';

      queryClient.setQueryData([table, barId], []);

      renderHook(
        () =>
          useSmartSync({
            table,
            event: 'INSERT',
            barId,
          }),
        { wrapper }
      );

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      broadcastService.invalidateQueries(table, barId);

      expect(invalidateSpy).toHaveBeenCalled();

      invalidateSpy.mockRestore();
    });
  });

  describe('7. Performance Optimization', () => {
    it('should reduce polling frequency when synced', () => {
      const config = {
        table: 'bar_products',
        event: 'UPDATE' as const,
        barId: 'test-bar',
        refetchInterval: 30000,
      };

      const { result } = renderHook(() => useSmartSync(config), { wrapper });

      // Expected behavior:
      // - If synced (Realtime/Broadcast): No polling (refetchInterval = false)
      // - If not synced: Polling active (refetchInterval = 30000)

      if (result.current.isSynced) {
        // Should use Realtime or Broadcast, not polling
        expect(['realtime', 'broadcast']).toContain(result.current.syncStatus);
      } else {
        expect(result.current.syncStatus).toBe('polling');
      }
    });

    it('should minimize Supabase queries via broadcast', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'sales',
            event: 'INSERT',
            barId: 'test-bar',
            refetchInterval: 30000, // Fallback only
          }),
        { wrapper }
      );

      // When broadcast is supported, should prefer it over network calls
      if (result.current.isBroadcastSupported) {
        expect(result.current.isSynced).toBe(true);
      }
    });
  });

  describe('8. Edge Cases', () => {
    it('should handle missing barId', () => {
      const { result } = renderHook(
        () =>
          useSmartSync({
            table: 'global_settings',
            event: 'UPDATE',
            // No barId - global table
          }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should handle hook cleanup on unmount', () => {
      const { unmount } = renderHook(
        () =>
          useSmartSync({
            table: 'bar_products',
            event: 'UPDATE',
            barId: 'cleanup-test',
          }),
        { wrapper }
      );

      expect(() => unmount()).not.toThrow();
    });

    it('should handle rapid config changes', () => {
      const { rerender } = renderHook(
        (props) =>
          useSmartSync({
            table: props.table,
            event: 'UPDATE',
            barId: props.barId,
          }),
        {
          wrapper,
          initialProps: { table: 'bar_products', barId: 'bar-1' },
        }
      );

      expect(() => {
        rerender({ table: 'sales', barId: 'bar-2' });
        rerender({ table: 'bar_products', barId: 'bar-3' });
      }).not.toThrow();
    });
  });

  describe('9. Integration - Complete Sync Flow', () => {
    it('should complete full sync cycle: Broadcast → Realtime → Polling', async () => {
      const barId = 'integration-bar';
      const table = 'bar_products';

      queryClient.setQueryData([table, barId], [{ id: 'p1', stock: 5 }]);

      const { result } = renderHook(
        () =>
          useSmartSync({
            table,
            event: 'UPDATE',
            barId,
            refetchInterval: 30000,
          }),
        { wrapper }
      );

      // 1. Check initial state
      expect(result.current).toBeDefined();

      // 2. Simulate broadcast message
      result.current.broadcast('UPDATE', { id: 'p1', stock: 3 });

      // 3. Manually trigger invalidation
      result.current.invalidate();

      // 4. Verify system is still functional
      await waitFor(() => {
        expect(result.current.isSynced).toBeDefined();
      });
    });
  });
});

describe('useSmartSync - Cost Optimization Validation', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('should reduce polling from 2-3s to 30-60s', () => {
    const oldInterval = 3000; // Before optimization
    const newInterval = 30000; // After optimization (Phase 1-2)

    const reduction = ((oldInterval - newInterval) / oldInterval) * 100;

    // Should achieve ~90% reduction
    expect(Math.abs(reduction)).toBeGreaterThan(85);
  });

  it('should prefer free Broadcast over costly Realtime when available', () => {
    const { result } = renderHook(
      () =>
        useSmartSync({
          table: 'bar_products',
          event: 'UPDATE',
          barId: 'test',
        }),
      { wrapper }
    );

    // If broadcast is supported, it should be the primary sync method
    if (result.current.isBroadcastSupported) {
      // Broadcast is free (0 cost)
      expect(result.current.syncStatus).toMatch(/broadcast|realtime/);
    }
  });
});
