/**
 * Monitoring & Error Tracking - Sentry Integration
 *
 * Centralizes error reporting, performance monitoring, and exception handling
 * Only active in production (VITE_SENTRY_DSN must be set)
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN;
const IS_PRODUCTION = import.meta.env.PROD;

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Only initializes if DSN is configured AND running in production
 */
export function initMonitoring(): void {
  if (!IS_PRODUCTION || !DSN) {
    console.log('[Monitoring] Sentry disabled (dev environment or DSN missing)');
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: IS_PRODUCTION ? 'production' : 'development',

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions (users, page loads, etc.)

    // Error Sampling (catch 100% of errors)
    sampleRate: 1.0,

    // Disable Session Replay (POS app - sensitive data, no need for replays)
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    replaysSessionSampleRate: 0, // Don't record sessions
    replaysOnErrorSampleRate: 0, // Don't record on errors either

    // Source maps configuration
    // Note: source maps are uploaded by @sentry/vite-plugin during build
    // The plugin handles everything automatically

    // PII Scrubbing - don't send user IPs, emails, etc.
    beforeSend(event, hint) {
      // Don't send 4xx errors (client errors) - just development noise
      if (event.exception) {
        const exception = hint.originalException;
        if (exception instanceof Error) {
          // Skip network errors like 404, 403
          if (exception.message?.includes('404') ||
            exception.message?.includes('403') ||
            exception.message?.includes('401')) {
            return null;
          }
        }
      }
      return event;
    },

    allowUrls: [
      /^https:\/\/bartenderpro-africa\.com/,   // Custom domain (production)
      /^https:\/\/bar-tender-ten\.vercel\.app/, // Vercel URL (fallback)
    ],
  });

  console.log('[Monitoring] Sentry initialized for error tracking');
}

/**
 * Centralized error capture function
 * Use this instead of console.error for errors you want to track
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!IS_PRODUCTION || !DSN) {
    // In dev, just log to console
    console.error('Error:', error, context);
    return;
  }

  if (error instanceof Error) {
    Sentry.captureException(error, {
      contexts: context ? { app: context } : undefined,
    });
  } else {
    Sentry.captureMessage(String(error), {
      level: 'error',
      contexts: context ? { app: context } : undefined,
    });
  }
}

/**
 * Capture a message for monitoring (warnings, info, etc.)
 */
function captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'): void {
  if (!IS_PRODUCTION || !DSN) {
    console.log(`[${level.toUpperCase()}]`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for better context in error traces
 * Use this to track user actions before an error occurs
 */
function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!IS_PRODUCTION || !DSN) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context for error reports
 * Call this after user logs in
 */
export function setUserContext(userId: string, email?: string): void {
  if (!IS_PRODUCTION || !DSN) {
    return;
  }

  Sentry.setUser({
    id: userId,
    email: email,
  });
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  if (!IS_PRODUCTION || !DSN) {
    return;
  }

  Sentry.setUser(null);
}
