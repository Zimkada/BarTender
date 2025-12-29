import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'prompt', // User must accept update
      includeAssets: ['icons/*.png', 'favicon.ico'],

      manifest: {
        name: 'BarTender - Gestion de Bar',
        short_name: 'BarTender',
        description: 'Application de gestion complète pour bars et restaurants avec suivi des stocks, ventes et analytics',
        theme_color: '#f59e0b',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ],
        categories: ['business', 'productivity', 'finance'],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'Accès rapide au tableau de bord',
            url: '/dashboard',
            icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }]
          },
          {
            name: 'Inventaire',
            short_name: 'Inventaire',
            description: 'Gestion des stocks',
            url: '/inventory',
            icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }]
          },
          {
            name: 'Ventes',
            short_name: 'Ventes',
            description: 'Historique des ventes',
            url: '/sales-history',
            icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }]
          }
        ]
      },

      workbox: {
        // Stratégie MINIMALE de precache (seulement ~80 KB)
        // Basé sur audit: HTML + CSS + manifest seulement
        globPatterns: [
          '**/*.{css,html,json}' // CSS (80 KB) + HTML + manifest ONLY
          // JS chunks sont volontairement EXCLUS du precache
        ],

        // Tous les JS chunks en runtime cache (StaleWhileRevalidate)
        runtimeCaching: [
          // 1. JS Chunks - Cache-first avec mise à jour background
          {
            urlPattern: /^.*\.(js|jsx|ts|tsx)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'js-chunks-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 jours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },

          // 2. Supabase API - Network-first avec fallback cache (15 min TTL)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 15 // 15 minutes (ajusté selon feedback)
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },

          // 3. Supabase Auth - Network-only (JAMAIS caché)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/v1\/.*/,
            handler: 'NetworkOnly'
          },

          // 4. Supabase Storage - Cache-first pour images/fichiers
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },

          // 5. Images et assets statiques
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
              }
            }
          },

          // 6. Fonts
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 an
              }
            }
          }
        ],

        // Configuration globale
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false, // Ne pas forcer update (UX)

        // Navigation fallback pour SPA
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/]
      },

      devOptions: {
        enabled: true, // Activer en dev pour tester
        type: 'module',
        navigateFallback: '/index.html'
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-react-query': ['@tanstack/react-query'],
          'vendor-date-fns': ['date-fns'],
          // Note: xlsx and recharts are lazy loaded, so they're not in manualChunks
        }
      }
    }
  }
});
