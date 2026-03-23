import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
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
      // Mode injectManifest: Workbox injectera le precache manifest dans notre SW personnalisé
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Prevent build error from large HTML files (stats.html)
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },

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
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ],
        screenshots: [
          {
            src: '/icons/screenshot-icon-390x844.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow'
          },
          {
            src: '/icons/screenshot-icon-1280x720.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide'
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
        globIgnores: [
          '**/stats.html', // Rollup visualizer - too large for PWA cache
        ],
        // Increase limit to allow large HTML files (stats.html is 2.3MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB instead of default 2 MB

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
    }),
    // Sentry Source Maps Upload (production builds only)
    // Requires SENTRY_AUTH_TOKEN env var or --release flag
    sentryVitePlugin({
      org: 'zimkada-ingenuity',
      project: 'bartendera',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      debug: false,
      release: {
        name: `bartender@${new Date().toISOString().split('T')[0]}`,
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Source Maps for Sentry (hidden = generated but not exposed in bundle)
    sourcemap: 'hidden',
    // Minification et optimisation
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.debug']
      },
      mangle: {
        safari10: true,
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — needed first, cached long-term
          'vendor-react': ['react', 'react-dom'],
          // Routing — needed for initial navigation
          'vendor-router': ['react-router-dom'],
          // Animation — used widely but deferrable via HTTP/2 parallel load
          'vendor-motion': ['framer-motion'],
          // Backend — auth + data
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-react-query': ['@tanstack/react-query', '@tanstack/query-persist-client-core'],
          // Utilities — dates, icons, UI primitives
          'vendor-date-fns': ['date-fns'],
          'vendor-icons': ['lucide-react'],
          'vendor-ui': ['@radix-ui/react-checkbox', '@radix-ui/react-radio-group', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          // Monitoring — deferred init, not needed for first paint
          'vendor-sentry': ['@sentry/react'],
          // Validation
          'vendor-zod': ['zod'],
          // Note: xlsx and recharts are lazy-loaded via page chunks
        }
      }
    },
    // CSS Minification
    cssMinify: true,
    // Increase chunk size warning limit (guides & offline add significant bundle size)
    chunkSizeWarningLimit: 600
  }
});
