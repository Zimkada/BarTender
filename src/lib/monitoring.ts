/**
 * Monitoring & Error Tracking - Sentry Integration (Lazy-loaded)
 *
 * Sentry is loaded dynamically to avoid blocking the initial render.
 * All public functions are safe to call before Sentry loads — they queue
 * or no-op gracefully.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN;
const IS_PRODUCTION = import.meta.env.PROD;

// Lazy-loaded Sentry module reference
let _Sentry: typeof import('@sentry/react') | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Load Sentry dynamically (deferred from critical path)
 */
function loadSentry(): Promise<typeof import('@sentry/react')> {
  return import('@sentry/react');
}

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Only initializes if DSN is configured AND running in production.
 * Loads Sentry lazily to reduce initial bundle size (~30-40KB gzip saved).
 */
export function initMonitoring(): void {
  if (!IS_PRODUCTION || !DSN) {
    console.log('[Monitoring] Sentry disabled (dev environment or DSN missing)');
    return;
  }

  // Start loading Sentry asynchronously — does not block render
  _initPromise = loadSentry().then((Sentry) => {
    _Sentry = Sentry;

    Sentry.init({
      dsn: DSN,
      environment: IS_PRODUCTION ? 'production' : 'development',

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions

      // Error Sampling (catch 100% of errors)
      sampleRate: 1.0,

      // Disable Session Replay (POS app - sensitive data)
      integrations: [
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,

      beforeSend(event, hint) {
        // Don't send 4xx errors (client errors) - just noise
        if (event.exception) {
          const exception = hint.originalException;
          if (exception instanceof Error) {
            if (exception.message?.includes('404') ||
              exception.message?.includes('403') ||
              exception.message?.includes('401')) {
              return null;
            }

            // SW: image/storage offline → comportement attendu, pas une erreur app
            if ((exception.message?.includes('no-response') ||
              exception.message?.includes('Cache.put() encountered a network error')) &&
              event.contexts?.app?.source === 'service-worker') {
              return null;
            }

            // IDB: connexion fermée par onversionchange → transitoire (autre onglet a upgradé la DB)
            // Gardé précis : uniquement ce message exact, pas les vrais timeouts ni corruptions
            if (exception.message === 'Failed to execute \'transaction\' on \'IDBDatabase\': The database connection is closing.') {
              return null;
            }
          }
        }
        return event;
      },

      allowUrls: [
        /^https:\/\/bartenderpro-africa\.com/,
        /^https:\/\/bar-tender-ten\.vercel\.app/,
      ],
    });

    console.log('[Monitoring] Sentry initialized for error tracking');
  }).catch((err) => {
    console.warn('[Monitoring] Failed to load Sentry:', err);
  });
}

/**
 * Centralized error capture function
 * Safe to call before Sentry is loaded — errors before init are logged to console.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!IS_PRODUCTION || !DSN) {
    console.error('Error:', error, context);
    return;
  }

  if (!_Sentry) {
    // Sentry not loaded yet — log to console (will be rare, only during first ~100ms)
    console.error('[Monitoring] Error before Sentry init:', error, context);
    return;
  }

  if (error instanceof Error) {
    _Sentry.captureException(error, {
      contexts: context ? { app: context } : undefined,
    });
  } else {
    _Sentry.captureMessage(String(error), {
      level: 'error',
      contexts: context ? { app: context } : undefined,
    });
  }
}

/**
 * Set user context for error reports
 * Call this after user logs in
 */
export function setUserContext(userId: string, email?: string): void {
  if (!IS_PRODUCTION || !DSN) return;

  // If Sentry isn't loaded yet, wait for it
  if (!_Sentry) {
    _initPromise?.then(() => {
      _Sentry?.setUser({ id: userId, email });
    });
    return;
  }

  _Sentry.setUser({ id: userId, email });
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  if (!IS_PRODUCTION || !DSN) return;

  if (!_Sentry) {
    _initPromise?.then(() => {
      _Sentry?.setUser(null);
    });
    return;
  }

  _Sentry.setUser(null);
}
