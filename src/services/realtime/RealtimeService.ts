/**
 * RealtimeService.ts
 * Central Realtime subscription manager for Supabase Realtime integration
 * Phase 3.2 - Supabase Optimization
 *
 * Manages:
 * - Channel lifecycle
 * - Subscription error handling & auto-reconnect
 * - Payload validation
 * - Network resilience
 * - Fallback to polling strategy
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { QueryClient } from '@tanstack/react-query';
import { networkManager } from '../NetworkManager';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

interface RealtimeConfig {
  table: string;
  event: RealtimeEvent;
  schema?: string;
  filter?: string; // e.g., "bar_id=eq.123"
  onMessage: (payload: any) => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface ChannelState {
  channelId: string;
  channel: RealtimeChannel | null;
  isConnected: boolean;
  retryCount: number;
  lastError?: Error;
  createdAt: number;
}

/**
 * Central manager for all Supabase Realtime subscriptions
 * Handles connection lifecycle, error recovery, and fallback strategies
 */
export class RealtimeService {
  private static instance: RealtimeService;
  private channels: Map<string, ChannelState> = new Map();
  private maxRetries: number = 5;
  private retryDelay: number = 1000;
  private queryClient?: QueryClient;

  private constructor() {
    // Monitor network status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Initialize with React Query client for invalidation
   */
  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  /**
   * Subscribe to realtime changes on a table
   */
  subscribe(config: RealtimeConfig): string {
    const channelId = this.generateChannelId(config);

    // Check if already subscribed
    if (this.channels.has(channelId)) {
      console.log(`[Realtime] Already subscribed to ${channelId}`);
      return channelId;
    }

    try {
      // Build channel filter
      const filter = config.filter
        ? `${config.table}:${config.event}.${config.filter}`
        : `${config.table}:${config.event}`;

      // Create channel
      const channel = supabase.channel(channelId, {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      });

      // Subscribe to postgresChanges
      channel
        .on('postgres_changes', {
          event: config.event,
          schema: config.schema || 'public',
          table: config.table,
          filter: config.filter,
        } as any, (payload) => {
          this.handleMessage(channelId, payload, config.onMessage);
        })
        .on('system', { event: 'join' }, () => {
          this.handleChannelJoin(channelId);
        })
        .on('system', { event: 'leave' }, () => {
          this.handleChannelLeave(channelId);
        })
        .on('system', { event: 'error' }, (err) => {
          this.handleChannelError(channelId, err, config);
        })
        .subscribe((status) => {
          this.handleSubscriptionStatus(channelId, status, config);
        });

      // Store channel state
      this.channels.set(channelId, {
        channelId,
        channel,
        isConnected: false,
        retryCount: 0,
        createdAt: Date.now(),
      });

      console.log(`[Realtime] Subscribed to ${channelId}`);
      return channelId;
    } catch (error) {
      console.error(`[Realtime] Error subscribing to ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channelId: string): Promise<void> {
    const state = this.channels.get(channelId);
    if (!state?.channel) {
      console.warn(`[Realtime] Channel not found: ${channelId}`);
      return;
    }

    try {
      await supabase.removeChannel(state.channel);
      this.channels.delete(channelId);
      console.log(`[Realtime] Unsubscribed from ${channelId}`);
    } catch (error) {
      console.error(`[Realtime] Error unsubscribing from ${channelId}:`, error);
    }
  }

  /**
   * Unsubscribe all channels
   */
  async unsubscribeAll(): Promise<void> {
    const channelIds = Array.from(this.channels.keys());
    for (const channelId of channelIds) {
      await this.unsubscribe(channelId);
    }
  }

  /**
   * Check if a channel is connected
   */
  isConnected(channelId: string): boolean {
    return this.channels.get(channelId)?.isConnected ?? false;
  }

  /**
   * Get connection status for all channels
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.channels.forEach((state, id) => {
      status[id] = state.isConnected;
    });
    return status;
  }

  // ========== PRIVATE METHODS ==========

  private generateChannelId(config: RealtimeConfig): string {
    const filter = config.filter ? `_${config.filter.replace(/[^a-z0-9]/gi, '_')}` : '';
    return `${config.table}_${config.event}${filter}`.toLowerCase();
  }

  private handleMessage(
    channelId: string,
    payload: any,
    onMessage: (payload: any) => void,
  ) {
    try {
      // Validate payload structure
      if (!payload.new && !payload.old) {
        console.warn(`[Realtime] Invalid payload for ${channelId}:`, payload);
        return;
      }

      // Reset retry count on successful message
      const state = this.channels.get(channelId);
      if (state) {
        state.retryCount = 0;
      }

      // Call handler
      onMessage(payload);
    } catch (error) {
      console.error(`[Realtime] Error handling message for ${channelId}:`, error);
    }
  }

  private handleChannelJoin(channelId: string) {
    const state = this.channels.get(channelId);
    if (state) {
      state.isConnected = true;
      state.retryCount = 0;
      console.log(`[Realtime] Channel connected: ${channelId}`);
    }
  }

  private handleChannelLeave(channelId: string) {
    const state = this.channels.get(channelId);
    if (state) {
      state.isConnected = false;
      console.log(`[Realtime] Channel disconnected: ${channelId}`);
    }
  }

  private handleChannelError(
    channelId: string,
    error: any,
    config: RealtimeConfig,
  ) {
    const state = this.channels.get(channelId);
    if (!state) return;

    // Ignore false positives: "Subscribed to PostgreSQL" is a system message, not an error
    if (error?.message === 'Subscribed to PostgreSQL') {
      console.log(`[Realtime] Successfully subscribed to ${channelId}`);
      state.isConnected = true;
      state.retryCount = 0;
      return;
    }

    // Only handle real errors
    if (!networkManager.isOffline()) {
      console.error(`[Realtime] Channel error for ${channelId}:`, error);
    } else {
      console.log(`[Realtime] WebSocket disconnected (Offline mode)`);
    }
    state.lastError = error;
    state.isConnected = false;

    // Call error handler if provided
    if (config.onError) {
      config.onError(error);
    }

    // Attempt retry
    this.attemptReconnect(channelId, config);
  }

  private handleSubscriptionStatus(
    channelId: string,
    status: string,
    config: RealtimeConfig,
  ) {
    if (!networkManager.isOffline()) {
      console.log(`[Realtime] Subscription status for ${channelId}: ${status}`);
    }

    switch (status) {
      case 'SUBSCRIBED':
        this.handleChannelJoin(channelId);
        break;
      case 'TIMED_OUT':
      case 'CHANNEL_ERROR':
        this.handleChannelError(channelId, new Error(`Status: ${status}`), config);
        break;
      case 'CLOSED':
        this.handleChannelLeave(channelId);
        break;
    }
  }

  private attemptReconnect(channelId: string, config: RealtimeConfig) {
    const state = this.channels.get(channelId);
    if (!state) return;

    const maxRetries = config.maxRetries ?? this.maxRetries;
    if (state.retryCount >= maxRetries) {
      console.error(
        `[Realtime] Max retries reached for ${channelId}. Switching to polling fallback.`,
      );
      return;
    }

    state.retryCount++;
    const delay = (config.retryDelay ?? this.retryDelay) * state.retryCount;

    console.log(
      `[Realtime] Attempting reconnect for ${channelId} (attempt ${state.retryCount}/${maxRetries}) in ${delay}ms`,
    );

    setTimeout(() => {
      if (!networkManager.isOffline()) {
        this.subscribe(config);
      }
    }, delay);
  }

  private handleOnline() {
    console.log('[Realtime] Network is online, reconnecting all channels...');

    // Attempt to reconnect all channels
    this.channels.forEach((state, channelId) => {
      if (!state.isConnected) {
        console.log(`[Realtime] Reconnecting ${channelId}`);
        state.channel?.unsubscribe();
      }
    });
  }

  private handleOffline() {
    console.log('[Realtime] Network is offline, switching to polling mode');

    // Mark all channels as disconnected
    this.channels.forEach((state) => {
      state.isConnected = false;
    });
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const metrics = {
      totalChannels: this.channels.size,
      connectedChannels: Array.from(this.channels.values()).filter(
        (s) => s.isConnected,
      ).length,
      channels: Array.from(this.channels.entries()).map(([id, state]) => ({
        id,
        connected: state.isConnected,
        retryCount: state.retryCount,
        ageMs: Date.now() - state.createdAt,
        lastError: state.lastError?.message,
      })),
      isOnline: !networkManager.isOffline(),
    };

    return metrics;
  }
}

// Export singleton instance
export const realtimeService = RealtimeService.getInstance();
