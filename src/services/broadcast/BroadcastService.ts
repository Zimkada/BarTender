/**
 * BroadcastService.ts
 * Cross-tab synchronization via Broadcast Channel API
 * Phase 3.3 - Supabase Optimization & Cost Reduction
 *
 * Purpose:
 * - Sync state between multiple browser tabs/windows (same origin)
 * - Reduce Supabase queries by 50% when user has multiple tabs open
 * - Zero cost communication (browser memory only)
 * - Seamless integration with React Query
 *
 * Architecture:
 * - Central channel manager (singleton)
 * - Per-table broadcast channels
 * - Automatic invalidation on message receipt
 * - Event-driven design
 */

import { QueryClient } from '@tanstack/react-query';

export type BroadcastEventType = 'INSERT' | 'UPDATE' | 'DELETE' | 'INVALIDATE';

export interface BroadcastMessage {
  event: BroadcastEventType;
  table: string;
  barId?: string;
  data?: any;
  timestamp: number;
  source: string; // unique identifier for this tab
}

/**
 * Service for managing cross-tab communication via Broadcast Channel API
 * Automatically invalidates React Query caches when changes occur in other tabs
 */
export class BroadcastService {
  private static instance: BroadcastService;
  private channels: Map<string, BroadcastChannel> = new Map();
  private queryClient?: QueryClient;
  private source: string = this.generateSourceId();
  private enabled: boolean = this.isBroadcastChannelSupported();

  private constructor() {
    if (!this.enabled) {
      console.warn(
        '[Broadcast] BroadcastChannel API not supported. Cross-tab sync disabled.',
      );
    }
  }

  static getInstance(): BroadcastService {
    if (!BroadcastService.instance) {
      BroadcastService.instance = new BroadcastService();
    }
    return BroadcastService.instance;
  }

  /**
   * Initialize with React Query client for automatic cache invalidation
   */
  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
    console.log('[Broadcast] Initialized with React Query client');
  }

  /**
   * Create or get a broadcast channel for a table
   */
  private getOrCreateChannel(channelName: string): BroadcastChannel | null {
    if (!this.enabled) {
      return null;
    }

    if (!this.channels.has(channelName)) {
      try {
        const channel = new BroadcastChannel(channelName);
        channel.onmessage = (event) => this.handleMessage(event.data);
        channel.onmessageerror = (event) => this.handleError(event);
        this.channels.set(channelName, channel);
        console.log(`[Broadcast] Created channel: ${channelName}`);
      } catch (error) {
        console.error(`[Broadcast] Failed to create channel ${channelName}:`, error);
        return null;
      }
    }

    return this.channels.get(channelName) ?? null;
  }

  /**
   * Broadcast a change event to other tabs
   * Call this after mutations (create, update, delete)
   *
   * @example
   * ```typescript
   * // After creating a sale
   * await salesService.create(saleData);
   * broadcastService.broadcast({
   *   event: 'INSERT',
   *   table: 'sales',
   *   barId: currentBar.id,
   *   data: newSale,
   * });
   * ```
   */
  broadcast(message: Omit<BroadcastMessage, 'timestamp' | 'source'>): void {
    if (!this.enabled) {
      return;
    }

    const channelName = this.getChannelName(message.table, message.barId);
    const channel = this.getOrCreateChannel(channelName);

    if (!channel) {
      console.warn(`[Broadcast] Channel not available for ${channelName}`);
      return;
    }

    const fullMessage: BroadcastMessage = {
      ...message,
      timestamp: Date.now(),
      source: this.source,
    };

    try {
      channel.postMessage(fullMessage);
      console.log(`[Broadcast] Sent message:`, fullMessage);
    } catch (error) {
      console.error(`[Broadcast] Error broadcasting message:`, error);
    }
  }

  /**
   * Manually invalidate React Query caches for a table
   * Called when receiving broadcast messages from other tabs
   */
  invalidateQueries(table: string, barId?: string): void {
    if (!this.queryClient) {
      console.warn('[Broadcast] QueryClient not initialized. Cannot invalidate queries.');
      return;
    }

    try {
      // Invalidate all queries for this table
      this.queryClient.invalidateQueries({
        queryKey: [table],
        refetchType: 'active', // Only refetch if currently in use
      });

      // If barId provided, also invalidate bar-specific queries
      if (barId) {
        this.queryClient.invalidateQueries({
          queryKey: [table, barId],
          refetchType: 'active',
        });
      }

      console.log(`[Broadcast] Invalidated queries for ${table}${barId ? ` (${barId})` : ''}`);
    } catch (error) {
      console.error('[Broadcast] Error invalidating queries:', error);
    }
  }

  /**
   * Close a channel when it's no longer needed
   */
  closeChannel(table: string, barId?: string): void {
    if (!this.enabled) {
      return;
    }

    const channelName = this.getChannelName(table, barId);
    const channel = this.channels.get(channelName);

    if (channel) {
      try {
        channel.close();
        this.channels.delete(channelName);
        console.log(`[Broadcast] Closed channel: ${channelName}`);
      } catch (error) {
        console.error(`[Broadcast] Error closing channel ${channelName}:`, error);
      }
    }
  }

  /**
   * Close all channels
   */
  closeAllChannels(): void {
    if (!this.enabled) {
      return;
    }

    this.channels.forEach((channel, channelName) => {
      try {
        channel.close();
      } catch (error) {
        console.error(`[Broadcast] Error closing channel ${channelName}:`, error);
      }
    });

    this.channels.clear();
    console.log('[Broadcast] Closed all channels');
  }

  /**
   * Check if BroadcastChannel API is available in this browser
   */
  isSupported(): boolean {
    return this.enabled;
  }

  /**
   * Get list of active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  // ========== PRIVATE METHODS ==========

  private handleMessage(message: BroadcastMessage): void {
    // Ignore messages from this tab
    if (message.source === this.source) {
      return;
    }

    console.log('[Broadcast] Received message from another tab:', message);

    switch (message.event) {
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
        this.invalidateQueries(message.table, message.barId);
        break;
      case 'INVALIDATE':
        this.invalidateQueries(message.table, message.barId);
        break;
    }
  }

  private handleError(event: MessageEvent): void {
    console.error('[Broadcast] Channel error:', event.data);
  }

  private getChannelName(table: string, barId?: string): string {
    return barId ? `${table}_${barId}` : table;
  }

  private generateSourceId(): string {
    // Unique ID for this tab instance
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isBroadcastChannelSupported(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    return {
      enabled: this.enabled,
      supported: this.isBroadcastChannelSupported(),
      source: this.source,
      activeChannels: this.getActiveChannels(),
      channelCount: this.channels.size,
    };
  }
}

// Export singleton instance
export const broadcastService = BroadcastService.getInstance();
