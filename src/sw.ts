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
declare const self: ServiceWorkerGlobalScope;

// ✨ Workbox injectera le manifest ici au build
declare const self: any;
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

// 2. Supabase API - NetworkFirst
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 15 // 15 minutes
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
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

console.log('[SW] Background Sync Service Worker loaded - BarTender v2.0');
