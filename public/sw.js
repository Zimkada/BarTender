// Service Worker - Optimisé pour Bénin/Afrique de l'Ouest
// Autonomie offline 7 jours + sync intelligente

const CACHE_VERSION = 'bartender-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const OFFLINE_CACHE = `${CACHE_VERSION}-offline`;

// Assets essentiels à mettre en cache immédiatement
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/offline.html' // Page fallback offline
];

// Données critiques à synchroniser
const SYNC_TAGS = {
  SALES: 'sync-sales',
  INVENTORY: 'sync-inventory',
  SETTINGS: 'sync-settings'
};

// Installation - Cache des assets statiques
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting(); // Force activation
      })
  );
});

// Activation - Cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Supprimer les anciens caches
              return cacheName.startsWith('bartender-') &&
                     !cacheName.includes(CACHE_VERSION);
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Cache cleanup completed');
        return self.clients.claim(); // Prendre contrôle immédiat
      })
  );
});

// Fetch - Stratégie cache intelligente
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Stratégie selon type de ressource
  if (request.method === 'GET') {
    if (isStaticAsset(url)) {
      // Assets statiques : Cache First
      event.respondWith(cacheFirst(request));
    } else if (isApiCall(url)) {
      // API calls : Network First avec fallback
      event.respondWith(networkFirst(request));
    } else if (isNavigation(request)) {
      // Navigation : App Shell
      event.respondWith(appShell(request));
    }
  }
});

// Background Sync - Pour connexions instables
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  switch (event.tag) {
    case SYNC_TAGS.SALES:
      event.waitUntil(syncSales());
      break;
    case SYNC_TAGS.INVENTORY:
      event.waitUntil(syncInventory());
      break;
    case SYNC_TAGS.SETTINGS:
      event.waitUntil(syncSettings());
      break;
    default:
      console.log('[SW] Unknown sync tag:', event.tag);
  }
});

// Push notifications (pour futures notifications)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();

    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: data.url,
      actions: [
        {
          action: 'view',
          title: 'Voir',
          icon: '/view-icon.png'
        },
        {
          action: 'dismiss',
          title: 'Ignorer'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// ===== STRATEGIES DE CACHE =====

// Cache First - Pour assets statiques
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    return new Response('Asset not available offline', { status: 408 });
  }
}

// Network First - Pour API calls
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Mettre en cache pour usage offline
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fallback pour requêtes critiques
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'Données non disponibles hors ligne',
        timestamp: Date.now()
      }),
      {
        status: 408,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// App Shell - Pour navigation
async function appShell(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, serving app shell');

    const cachedResponse = await caches.match('/');
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fallback offline page
    return caches.match('/offline.html');
  }
}

// ===== SYNC FUNCTIONS =====

async function syncSales() {
  try {
    console.log('[SW] Syncing sales...');

    // Récupérer ventes en attente depuis IndexedDB
    const pendingSales = await getPendingSales();

    if (pendingSales.length > 0) {
      // Envoyer au serveur (Supabase)
      const response = await fetch('/api/sales/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales: pendingSales })
      });

      if (response.ok) {
        // Marquer comme synchronisées
        await markSalesAsSynced(pendingSales.map(s => s.id));
        console.log('[SW] Sales synced successfully');
      }
    }
  } catch (error) {
    console.error('[SW] Sales sync failed:', error);
    throw error; // Retry automatique
  }
}

async function syncInventory() {
  try {
    console.log('[SW] Syncing inventory...');

    const pendingInventory = await getPendingInventory();

    if (pendingInventory.length > 0) {
      const response = await fetch('/api/inventory/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: pendingInventory })
      });

      if (response.ok) {
        await markInventoryAsSynced(pendingInventory.map(i => i.id));
        console.log('[SW] Inventory synced successfully');
      }
    }
  } catch (error) {
    console.error('[SW] Inventory sync failed:', error);
    throw error;
  }
}

async function syncSettings() {
  try {
    console.log('[SW] Syncing settings...');
    // Implémentation sync settings
  } catch (error) {
    console.error('[SW] Settings sync failed:', error);
    throw error;
  }
}

// ===== UTILITY FUNCTIONS =====

function isStaticAsset(url) {
  return url.pathname.includes('/static/') ||
         url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.png') ||
         url.pathname.endsWith('.jpg') ||
         url.pathname.endsWith('.ico');
}

function isApiCall(url) {
  return url.pathname.startsWith('/api/') ||
         url.hostname.includes('supabase');
}

function isNavigation(request) {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept').includes('text/html'));
}

// Helpers pour IndexedDB (à implémenter)
async function getPendingSales() {
  // Récupérer depuis IndexedDB
  return [];
}

async function markSalesAsSynced(ids) {
  // Marquer comme synchronisé dans IndexedDB
}

async function getPendingInventory() {
  return [];
}

async function markInventoryAsSynced(ids) {
  // Marquer comme synchronisé dans IndexedDB
}

// Message aux clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded - Bartender Africa v1.0');