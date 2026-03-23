/**
 * Service Worker - Gestion Background Sync
 *
 * Workbox va injecter automatiquement le manifest de precache
 * (WORKBOX_MANIFEST constant sera remplacée au build par Workbox)
 *
 * Responsabilités:
 * - Gestion des événements de sync en arrière-plan (app fermée)
 * - Communication avec l'app via postMessage
 * - Gestion du precache et runtime caching (via Workbox)
 */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Déclarer les types TypeScript pour les event listeners
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any[] };

const WORKBOX_MANIFEST = self.__WB_MANIFEST || [];

// Configurer le precache avec le manifest injecté par Workbox
precacheAndRoute(WORKBOX_MANIFEST);

// ✨ Runtime Caching Strategies (mirroring vite.config.ts)

// 1. JS Chunks - StaleWhileRevalidate
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'js-chunks-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
      })
    ]
  })
);

// 2. Supabase API - NetworkFirst avec fallback offline
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 15 // 15 minutes
      }),
      new CacheableResponsePlugin({
        // 🛡️ FIX: Exclure status 0 (opaque) — cause Cache.put() network error
        statuses: [200]
      }),
      {
        // 🛡️ FIX: Fallback quand réseau ET cache échouent → JSON vide au lieu de "no-response"
        // React Query traitera [] comme une liste vide plutôt qu'un crash
        handlerDidError: async () => new Response('[]', {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-SW-Fallback': 'offline-empty' }
        }),
        // Ignorer silencieusement les Cache.put() failures (réponse trop large, etc.)
        cacheDidUpdate: async () => { /* no-op — supprime l'erreur Cache.put() */ },
      }
    ]
  })
);

// 3. Supabase Storage - CacheFirst
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/'),
  new CacheFirst({
    cacheName: 'supabase-storage-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
      })
    ]
  })
);

// 4. Images - CacheFirst
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
      })
    ]
  })
);

/**
 * 🔔 Événement Background Sync
 * Déclenché par le navigateur quand:
 * 1. La connexion revient (app peut être fermée)
 * 2. Le tag "sync-pending-operations" a été enregistré en app
 *
 * Communicates avec l'app via postMessage pour déclencer syncAll()
 */
self.addEventListener('sync', (event: any) => {
  console.log('[SW] Background Sync triggered:', event.tag);

  if (event.tag === 'sync-pending-operations') {
    // Notifier TOUS les clients (onglets/instances) que sync est demandé
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        console.log(`[SW] Notifying ${clients.length} client(s) to sync`);

        // Envoyer un message à chaque client (instance de l'app)
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_REQUEST',
            tag: 'sync-pending-operations',
            timestamp: Date.now()
          });
        });

        // Retourner success au browser (sync completed)
        return Promise.resolve();
      })
    );
  }
});

/**
 * 🔔 Événement Message
 * Reçoit des messages de l'app (ex: SKIP_WAITING pour les updates)
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const { data } = event;

  if (data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received - updating service worker');
    self.skipWaiting();
  }
});

/**
 * 🔔 SW Error Handler (own scope)
 * SW runs in isolated scope and cannot directly call Sentry
 * So we catch errors and send them to the app via postMessage
 */
self.addEventListener('error', (event: ErrorEvent) => {
  console.error('[SW Error Event]', event.error);

  // Send error to app for Sentry capture
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'SENTRY_ERROR',
        error: event.error?.message || String(event.error),
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  });
});

/**
 * 🔔 SW Unhandled Promise Rejection Handler
 * Captures async errors in background sync and other async operations
 */
self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[SW Unhandled Promise Rejection]', event.reason);

  // Send error to app for Sentry capture
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'SENTRY_ERROR',
        error: event.reason?.message || String(event.reason),
        context: {
          type: 'unhandledPromiseRejection',
          promise: event.promise?.toString(),
        },
      });
    });
  });
});

console.log('[SW] Background Sync Service Worker loaded - BarTender v2.0 with Error Tracking');
