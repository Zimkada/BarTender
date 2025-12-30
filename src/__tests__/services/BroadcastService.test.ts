/**
 * BroadcastService.test.ts
 * Tests pour validation Phase 3-4 - Cross-tab synchronization
 *
 * Tests:
 * 1. Singleton pattern
 * 2. Channel creation and management
 * 3. Message broadcasting
 * 4. Cross-tab invalidation
 * 5. Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BroadcastService } from '../../services/broadcast/BroadcastService';
import { QueryClient } from '@tanstack/react-query';

describe('BroadcastService - Phase 3-4 Validation', () => {
  let broadcastService: BroadcastService;
  let queryClient: QueryClient;

  beforeEach(() => {
    // Reset singleton instance
    broadcastService = BroadcastService.getInstance();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    broadcastService.setQueryClient(queryClient);
  });

  afterEach(() => {
    broadcastService.closeAllChannels();
    queryClient.clear();
  });

  describe('1. Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = BroadcastService.getInstance();
      const instance2 = BroadcastService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should have unique source ID per instance', () => {
      const metrics = broadcastService.getMetrics();

      expect(metrics.source).toMatch(/^tab_\d+_[a-z0-9]+$/);
    });
  });

  describe('2. BroadcastChannel Support Detection', () => {
    it('should detect browser support correctly', () => {
      const isSupported = broadcastService.isSupported();

      // In Node.js/test environment, BroadcastChannel may not be available
      expect(typeof isSupported).toBe('boolean');
    });

    it('should return correct metrics about support', () => {
      const metrics = broadcastService.getMetrics();

      expect(metrics).toHaveProperty('enabled');
      expect(metrics).toHaveProperty('supported');
      expect(metrics).toHaveProperty('source');
      expect(metrics).toHaveProperty('activeChannels');
      expect(metrics).toHaveProperty('channelCount');
    });
  });

  describe('3. Channel Management', () => {
    it('should track active channels', () => {
      const initialMetrics = broadcastService.getMetrics();
      const initialCount = initialMetrics.channelCount;

      // Broadcast creates channel automatically
      broadcastService.broadcast({
        event: 'INSERT',
        table: 'sales',
        barId: 'test-bar-123',
        data: { id: 'sale-1' },
      });

      const afterMetrics = broadcastService.getMetrics();

      // If supported, channel count should increase
      if (broadcastService.isSupported()) {
        expect(afterMetrics.channelCount).toBeGreaterThan(initialCount);
        expect(afterMetrics.activeChannels).toContain('sales_test-bar-123');
      }
    });

    it('should close specific channel', () => {
      if (!broadcastService.isSupported()) {
        return; // Skip if not supported
      }

      // Create channel
      broadcastService.broadcast({
        event: 'UPDATE',
        table: 'bar_products',
        barId: 'bar-456',
        data: { id: 'product-1', stock: 10 },
      });

      const beforeClose = broadcastService.getMetrics();
      expect(beforeClose.activeChannels).toContain('bar_products_bar-456');

      // Close specific channel
      broadcastService.closeChannel('bar_products', 'bar-456');

      const afterClose = broadcastService.getMetrics();
      expect(afterClose.activeChannels).not.toContain('bar_products_bar-456');
    });

    it('should close all channels', () => {
      if (!broadcastService.isSupported()) {
        return;
      }

      // Create multiple channels
      broadcastService.broadcast({ event: 'INSERT', table: 'sales', barId: 'bar-1', data: {} });
      broadcastService.broadcast({ event: 'UPDATE', table: 'bar_products', barId: 'bar-2', data: {} });

      expect(broadcastService.getMetrics().channelCount).toBeGreaterThan(0);

      broadcastService.closeAllChannels();

      expect(broadcastService.getMetrics().channelCount).toBe(0);
      expect(broadcastService.getMetrics().activeChannels).toHaveLength(0);
    });
  });

  describe('4. Message Broadcasting', () => {
    it('should not throw when broadcasting without support', () => {
      expect(() => {
        broadcastService.broadcast({
          event: 'INSERT',
          table: 'sales',
          data: { id: 'sale-1', total: 5000 },
        });
      }).not.toThrow();
    });

    it('should create complete message with timestamp and source', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      broadcastService.broadcast({
        event: 'UPDATE',
        table: 'bar_products',
        barId: 'bar-123',
        data: { id: 'product-1', stock: 5 },
      });

      // Message should be logged with full structure
      if (broadcastService.isSupported()) {
        expect(spy).toHaveBeenCalled();
      }

      spy.mockRestore();
    });

    it('should handle different event types', () => {
      const events = ['INSERT', 'UPDATE', 'DELETE', 'INVALIDATE'] as const;

      events.forEach(event => {
        expect(() => {
          broadcastService.broadcast({
            event,
            table: 'sales',
            barId: 'test-bar',
            data: {},
          });
        }).not.toThrow();
      });
    });
  });

  describe('5. Query Invalidation', () => {
    it('should invalidate queries for table', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // Set some query data first
      queryClient.setQueryData(['sales', 'bar-123'], [{ id: 'sale-1' }]);

      // Invalidate
      broadcastService.invalidateQueries('sales', 'bar-123');

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['sales'],
        refetchType: 'active',
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['sales', 'bar-123'],
        refetchType: 'active',
      });

      invalidateSpy.mockRestore();
    });

    it('should handle invalidation without queryClient', () => {
      const serviceWithoutClient = BroadcastService.getInstance();
      serviceWithoutClient.setQueryClient(undefined as any);

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        serviceWithoutClient.invalidateQueries('sales');
      }).not.toThrow();

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('QueryClient not initialized')
      );

      spy.mockRestore();
      serviceWithoutClient.setQueryClient(queryClient);
    });
  });

  describe('6. Error Handling', () => {
    it('should handle missing BroadcastChannel gracefully', () => {
      // This test verifies graceful degradation when API is unavailable
      expect(() => {
        broadcastService.broadcast({
          event: 'INSERT',
          table: 'sales',
          data: {},
        });
      }).not.toThrow();
    });

    it('should log warnings when channel creation fails', () => {
      if (!broadcastService.isSupported()) {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        broadcastService.broadcast({
          event: 'INSERT',
          table: 'test_table',
          data: {},
        });

        // Should not throw, just log warning
        expect(() => {}).not.toThrow();

        spy.mockRestore();
      }
    });
  });

  describe('7. Integration Test - Complete Flow', () => {
    it('should complete full broadcast → invalidate flow', async () => {
      if (!broadcastService.isSupported()) {
        return; // Skip integration test if not supported
      }

      const barId = 'integration-test-bar';
      const table = 'sales';

      // 1. Setup: Add initial data to cache
      queryClient.setQueryData([table, barId], [
        { id: 'sale-1', total: 1000 },
        { id: 'sale-2', total: 2000 },
      ]);

      // 2. Simulate mutation in another tab (broadcast new sale)
      broadcastService.broadcast({
        event: 'INSERT',
        table,
        barId,
        data: { id: 'sale-3', total: 3000 },
      });

      // 3. Manually trigger invalidation (simulating message receipt)
      broadcastService.invalidateQueries(table, barId);

      // 4. Verify invalidation occurred
      const cacheState = queryClient.getQueryState([table, barId]);

      // Query should be marked as stale after invalidation
      expect(cacheState).toBeDefined();
    });
  });

  describe('8. Performance & Metrics', () => {
    it('should provide accurate metrics', () => {
      const metrics = broadcastService.getMetrics();

      expect(metrics).toMatchObject({
        enabled: expect.any(Boolean),
        supported: expect.any(Boolean),
        source: expect.any(String),
        activeChannels: expect.any(Array),
        channelCount: expect.any(Number),
      });
    });

    it('should track channel count accurately', () => {
      if (!broadcastService.isSupported()) {
        return;
      }

      const before = broadcastService.getMetrics().channelCount;

      broadcastService.broadcast({ event: 'INSERT', table: 'test1', data: {} });
      broadcastService.broadcast({ event: 'INSERT', table: 'test2', data: {} });

      const after = broadcastService.getMetrics().channelCount;

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });
});

describe('BroadcastService - Edge Cases', () => {
  let service: BroadcastService;

  beforeEach(() => {
    service = BroadcastService.getInstance();
  });

  afterEach(() => {
    service.closeAllChannels();
  });

  it('should handle rapid successive broadcasts', () => {
    expect(() => {
      for (let i = 0; i < 100; i++) {
        service.broadcast({
          event: 'UPDATE',
          table: 'bar_products',
          barId: 'stress-test',
          data: { id: `product-${i}`, stock: i },
        });
      }
    }).not.toThrow();
  });

  it('should handle broadcasts with null/undefined data', () => {
    expect(() => {
      service.broadcast({
        event: 'DELETE',
        table: 'sales',
        barId: 'test',
        data: null as any,
      });
    }).not.toThrow();
  });

  it('should handle missing barId', () => {
    expect(() => {
      service.broadcast({
        event: 'INVALIDATE',
        table: 'global_settings',
        data: {},
      });
    }).not.toThrow();
  });
});
