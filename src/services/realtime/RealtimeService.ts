/**
 * RealtimeService.ts
 * Central Realtime subscription manager for Supabase Realtime integration
 * Phase 3.2 - Supabase Optimization
 *
 * Manages:
 * - Channel lifecycle with reference counting
 * - Subscription error handling & auto-reconnect (infinite retry with exponential backoff)
 * - Payload validation
 * - Network resilience via NetworkManager integration
 * - WebSocket zombie detection via native Supabase heartbeat monitoring
 * - Staggered reconnection to protect 2G/3G networks
 * - Fallback to polling strategy
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { networkManager } from '../NetworkManager';
import { QueryClient } from '@tanstack/react-query';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeConfig {
  table: string;
  event: RealtimeEvent;
  schema?: string;
  filter?: string; // e.g., "bar_id=eq.123"
  onMessage: (payload: any) => void;
  onError?: (error: unknown) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface ChannelState {
  channelId: string;
  channel: RealtimeChannel | null;
  config: RealtimeConfig; // Store config for re-subscribe on network recovery
  isConnected: boolean;
  retryCount: number;
  subscribers: number; // Track how many components are using this channel
  lastError?: Error | unknown;
  createdAt: number;
}

// ========== HEARTBEAT CONSTANTS ==========

/** How often to check if heartbeat is still alive (ms) */
const HEARTBEAT_WATCHDOG_INTERVAL = 45_000;

/**
 * Max time without a heartbeat 'ok' before we consider the connection zombie (ms).
 * Supabase native heartbeat interval is 25s. We allow ~2 missed heartbeats (60s)
 * to account for 2G latency where a single heartbeat roundtrip can take 10-15s.
 */
const HEARTBEAT_STALE_THRESHOLD = 60_000;

/** Delay between each channel re-subscription during reconnectAll (ms) */
const RECONNECT_STAGGER_DELAY = 200;

/**
 * Central manager for all Supabase Realtime subscriptions
 * Handles connection lifecycle, error recovery, and fallback strategies
 */
export class RealtimeService {
  private static instance: RealtimeService;
  private channels: Map<string, ChannelState> = new Map();
  private maxRetries: number = 5; // Only for initial subscription errors (bad config)
  private retryDelay: number = 1000;
  private queryClient?: QueryClient;
  private networkUnsubscribe?: () => void;
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // ⭐ Heartbeat monitoring state
  private lastHeartbeatOkAt: number = 0;
  private heartbeatWatchdogTimer?: ReturnType<typeof setInterval>;
  private isReconnectingFromHeartbeat: boolean = false;

  private constructor() {
    // 1. NetworkManager integration for validated network status
    this.networkUnsubscribe = networkManager.subscribe((status) => {
      if (status === 'online') this.reconnectAll();
      if (status === 'offline') this.handleOffline();
    });

    // 2. Hook into Supabase native heartbeat for zombie WebSocket detection
    this.initHeartbeatMonitor();
  }

  static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Initialize with React Query client
   */
  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
    console.log('[Realtime] Initialized with React Query client');
  }

  /**
   * Subscribe to realtime changes on a table
   */
  subscribe(config: RealtimeConfig): string {
    const channelId = this.generateChannelId(config);

    // Check if already subscribed — increment reference count
    if (this.channels.has(channelId)) {
      const state = this.channels.get(channelId)!;
      state.subscribers++;
      console.log(`[Realtime] Already subscribed to ${channelId}. Subscribers: ${state.subscribers}`);
      return channelId;
    }

    try {
      // Create channel
      const channel = supabase.channel(channelId, {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      });

      // Subscribe to postgresChanges + system events
      channel
        .on('postgres_changes', {
          event: config.event,
          schema: config.schema || 'public',
          table: config.table,
          filter: config.filter,
        } as any, (payload: any) => {
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

      // Store channel state (including config for network recovery re-subscribe)
      this.channels.set(channelId, {
        channelId,
        channel,
        config,
        isConnected: false,
        retryCount: 0,
        subscribers: 1,
        createdAt: Date.now(),
      });

      // Ensure heartbeat watchdog is running when we have channels
      this.ensureHeartbeatWatchdog();

      console.log(`[Realtime] Subscribed to ${channelId}`);
      return channelId;
    } catch (error) {
      console.error(`[Realtime] Error subscribing to ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel (decrements ref count, closes when 0)
   */
  async unsubscribe(channelId: string): Promise<void> {
    const state = this.channels.get(channelId);
    if (!state?.channel) {
      console.warn(`[Realtime] Channel not found: ${channelId}`);
      return;
    }

    try {
      state.subscribers--;

      if (state.subscribers > 0) {
        console.log(`[Realtime] ${channelId} still has ${state.subscribers} subscribers. Holding connection.`);
        return;
      }

      console.log(`[Realtime] No more subscribers for ${channelId}. Closing connection.`);
      await supabase.removeChannel(state.channel);
      this.channels.delete(channelId);
      console.log(`[Realtime] Unsubscribed from ${channelId}`);
    } catch (error) {
      console.error(`[Realtime] Error unsubscribing from ${channelId}:`, error);
    }
  }

  /**
   * Unsubscribe all channels and cancel all timers
   */
  async unsubscribeAll(): Promise<void> {
    // Cancel all pending reconnect timers
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    // Stop heartbeat watchdog (will be restarted on next subscribe if needed)
    if (this.heartbeatWatchdogTimer) {
      clearInterval(this.heartbeatWatchdogTimer);
      this.heartbeatWatchdogTimer = undefined;
    }

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

  /**
   * Get metrics for monitoring (includes heartbeat status)
   */
  getMetrics() {
    const now = Date.now();
    const heartbeatAge = this.lastHeartbeatOkAt > 0
      ? now - this.lastHeartbeatOkAt
      : -1; // -1 = never received

    return {
      totalChannels: this.channels.size,
      connectedChannels: Array.from(this.channels.values()).filter(
        (s) => s.isConnected,
      ).length,
      channels: Array.from(this.channels.entries()).map(([id, state]) => ({
        id,
        connected: state.isConnected,
        retryCount: state.retryCount,
        ageMs: now - state.createdAt,
        lastError: state.lastError && typeof state.lastError === 'object' && 'message' in state.lastError
          ? (state.lastError as { message: string }).message
          : state.lastError ? String(state.lastError) : undefined,
      })),
      isOnline: !networkManager.getDecision().shouldShowBanner,
      heartbeat: {
        lastOkAt: this.lastHeartbeatOkAt,
        ageMs: heartbeatAge,
        isStale: heartbeatAge > HEARTBEAT_STALE_THRESHOLD,
      },
    };
  }

  // ========== HEARTBEAT MONITORING ==========

  /**
   * ⭐ Hook into Supabase's native WebSocket heartbeat (Phoenix protocol, 25s interval).
   *
   * The native heartbeat sends a ping every 25s. On timeout (no pong in 25s),
   * Supabase closes the WebSocket and reconnects. We monitor the heartbeat callback
   * to detect zombie connections faster than waiting for channel error events to propagate.
   *
   * Additionally, a watchdog timer checks periodically that we've received a heartbeat 'ok'
   * within the last 60s. If not, we proactively mark channels as disconnected. This catches
   * edge cases where the WebSocket is dead but no timeout event fires (observed on 2G networks
   * with TCP half-open connections).
   */
  private initHeartbeatMonitor(): void {
    // Hook into native heartbeat callback
    try {
      supabase.realtime.onHeartbeat((status) => {
        this.handleHeartbeatStatus(status);
      });
      console.log('[Realtime] Heartbeat monitor initialized');
    } catch (err) {
      // Graceful degradation — if onHeartbeat isn't available (older SDK version),
      // we still have channel error events as fallback
      console.warn('[Realtime] Could not initialize heartbeat monitor:', err);
    }

    // Start watchdog timer
    this.heartbeatWatchdogTimer = setInterval(() => {
      this.checkHeartbeatLiveness();
    }, HEARTBEAT_WATCHDOG_INTERVAL);
  }

  /**
   * Ensure the heartbeat watchdog is running.
   * Called after subscribe to restart it if it was stopped by unsubscribeAll.
   */
  private ensureHeartbeatWatchdog(): void {
    if (this.heartbeatWatchdogTimer) return; // Already running
    this.heartbeatWatchdogTimer = setInterval(() => {
      this.checkHeartbeatLiveness();
    }, HEARTBEAT_WATCHDOG_INTERVAL);
  }

  /**
   * Handle native heartbeat status changes.
   * Called by Supabase's internal heartbeat mechanism.
   */
  private handleHeartbeatStatus(status: string): void {
    switch (status) {
      case 'ok':
        // Connection confirmed alive — update timestamp
        this.lastHeartbeatOkAt = Date.now();
        this.isReconnectingFromHeartbeat = false;
        break;

      case 'timeout':
        // ⭐ WebSocket zombie detected — Supabase will close the socket.
        // Immediately mark all channels as disconnected (don't wait for error events).
        console.warn('[Realtime] Heartbeat timeout — marking all channels disconnected');
        this.markAllChannelsDisconnected();
        // Native client handles socket reconnection; our NetworkManager listener
        // will call reconnectAll() once the new socket is up.
        break;

      case 'disconnected':
        // Socket is not connected — mark channels accordingly
        this.markAllChannelsDisconnected();
        break;

      case 'error':
        // Heartbeat response was not 'ok' — connection is degraded
        console.warn('[Realtime] Heartbeat error response');
        break;

      // 'sent' — just a ping sent, no action needed
    }
  }

  /**
   * Watchdog: periodically verify heartbeat liveness.
   * Catches edge cases where the WebSocket is silently dead and no timeout fires.
   */
  private checkHeartbeatLiveness(): void {
    // Skip if no channels are subscribed
    if (this.channels.size === 0) return;

    // Skip if network is offline (no heartbeat expected)
    const { shouldBlock } = networkManager.getDecision();
    if (shouldBlock) return;

    // Skip if we never received a heartbeat (channels might still be connecting)
    if (this.lastHeartbeatOkAt === 0) return;

    // Skip if already handling a heartbeat reconnection
    if (this.isReconnectingFromHeartbeat) return;

    const elapsed = Date.now() - this.lastHeartbeatOkAt;
    const hasConnectedChannels = Array.from(this.channels.values()).some((s) => s.isConnected);

    if (elapsed > HEARTBEAT_STALE_THRESHOLD && hasConnectedChannels) {
      console.warn(
        `[Realtime] Heartbeat watchdog: no 'ok' in ${Math.round(elapsed / 1000)}s — forcing reconnection`,
      );
      this.isReconnectingFromHeartbeat = true;
      this.markAllChannelsDisconnected();
      this.reconnectAll();
    }
  }

  /**
   * Mark all channels as disconnected without closing them.
   * Used by heartbeat monitor for immediate state update.
   */
  private markAllChannelsDisconnected(): void {
    this.channels.forEach((state) => {
      state.isConnected = false;
    });
  }

  // ========== CHANNEL EVENT HANDLERS ==========

  private generateChannelId(config: RealtimeConfig): string {
    const filter = config.filter ? `_${config.filter.replace(/[^a-z0-9]/gi, '_')}` : '';
    return `${config.table}_${config.event}${filter}`.toLowerCase();
  }

  private handleMessage(
    channelId: string,
    payload: unknown,
    onMessage: (payload: any) => void,
  ) {
    try {
      // Validate payload structure
      const data = payload as { new?: unknown; old?: unknown };
      if (!data.new && !data.old) {
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
    error: Error | { message: string } | unknown,
    config: RealtimeConfig,
  ) {
    const state = this.channels.get(channelId);
    if (!state) return;

    // Ignore false positives: "Subscribed to PostgreSQL" is a system message, not an error
    const errObj = error as { message?: string };
    if (errObj?.message === 'Subscribed to PostgreSQL') {
      console.log(`[Realtime] Successfully subscribed to ${channelId}`);
      state.isConnected = true;
      state.retryCount = 0;
      return;
    }

    // Only handle real errors
    const { shouldShowBanner: isOffline } = networkManager.getDecision();
    if (!isOffline) {
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
    const { shouldShowBanner: isOffline } = networkManager.getDecision();
    if (!isOffline) {
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

  // ========== RECONNECTION ==========

  private attemptReconnect(channelId: string, config: RealtimeConfig) {
    const state = this.channels.get(channelId);
    if (!state) return;

    // Clear any existing reconnect timer for this channel
    const existingTimer = this.reconnectTimers.get(channelId);
    if (existingTimer) clearTimeout(existingTimer);

    // ⭐ Network recovery retries are INFINITE (never abandon in 2G/3G zones)
    // Only cap retries for initial subscription errors (bad config, auth issues)
    const { shouldBlock } = networkManager.getDecision();
    const isNetworkRecovery = shouldBlock || state.retryCount > 0;

    if (!isNetworkRecovery) {
      const maxRetries = config.maxRetries ?? this.maxRetries;
      if (state.retryCount >= maxRetries) {
        console.error(
          `[Realtime] Max retries reached for ${channelId}. Switching to polling fallback.`,
        );
        return;
      }
    }

    state.retryCount++;

    // ⭐ Exponential backoff with cap: 1s → 2s → 4s → 8s → 15s → 30s → 30s...
    const MAX_DELAY = 30000;
    const delay = Math.min(
      (config.retryDelay ?? this.retryDelay) * Math.pow(2, state.retryCount - 1),
      MAX_DELAY,
    );

    console.log(
      `[Realtime] Attempting reconnect for ${channelId} (attempt ${state.retryCount}) in ${delay}ms`,
    );

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(channelId);
      const { shouldBlock: blocked } = networkManager.getDecision();
      if (!blocked) {
        this.subscribe(config);
      } else {
        // Network still offline — retry again with backoff (will be reset on reconnectAll)
        this.attemptReconnect(channelId, config);
      }
    }, delay);

    this.reconnectTimers.set(channelId, timer);
  }

  /**
   * ⭐ Reconnect ALL disconnected channels on network recovery.
   * Resets retry counters and forces fresh subscriptions.
   * Called by NetworkManager when status transitions to 'online',
   * or by heartbeat watchdog when zombie connection detected.
   *
   * Uses staggered re-subscription (200ms between each channel) to avoid
   * overwhelming 2G/3G networks with burst of Phoenix JOIN messages.
   * All channels share one WebSocket, but each JOIN is a protocol message.
   */
  private async reconnectAll(): Promise<void> {
    // Cancel all pending reconnect timers (we're doing a fresh reconnect)
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    const disconnected = Array.from(this.channels.entries())
      .filter(([, state]) => !state.isConnected);

    if (disconnected.length === 0) {
      console.log('[Realtime] Network restored — all channels already connected');
      return;
    }

    console.log(
      `[Realtime] Reconnecting ${disconnected.length} disconnected channel(s) with ${RECONNECT_STAGGER_DELAY}ms stagger...`,
    );

    for (let idx = 0; idx < disconnected.length; idx++) {
      const [channelId, state] = disconnected[idx];

      // Stagger: wait before each reconnection (except the first)
      if (idx > 0) {
        await this.delay(RECONNECT_STAGGER_DELAY);
      }

      // Abort if we went offline again during the staggered reconnection
      const { shouldBlock } = networkManager.getDecision();
      if (shouldBlock) {
        console.log('[Realtime] Network lost during staggered reconnection — aborting remaining');
        break;
      }

      console.log(`[Realtime] Reconnecting ${channelId} (${idx + 1}/${disconnected.length})`);

      // Reset retry counter for fresh start
      state.retryCount = 0;

      // Close old dead channel
      if (state.channel) {
        try {
          await supabase.removeChannel(state.channel);
        } catch (err) {
          console.warn(`[Realtime] Error removing stale channel ${channelId}:`, err);
        }
      }

      // Remove old state and re-subscribe with stored config
      const { config, subscribers } = state;
      this.channels.delete(channelId);

      try {
        const newChannelId = this.subscribe(config);
        // Restore subscriber count (other components still reference this channel)
        const newState = this.channels.get(newChannelId);
        if (newState) {
          newState.subscribers = subscribers;
        }
      } catch (err) {
        console.error(`[Realtime] Failed to reconnect ${channelId}:`, err);
      }
    }
  }

  private handleOffline() {
    console.log('[Realtime] Network is offline, switching to polling mode');

    // Cancel pending reconnect timers (no point retrying while offline)
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    // Mark all channels as disconnected
    this.markAllChannelsDisconnected();
  }

  // ========== UTILITIES ==========

  /** Promise-based delay for staggered reconnection */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const realtimeService = RealtimeService.getInstance();
