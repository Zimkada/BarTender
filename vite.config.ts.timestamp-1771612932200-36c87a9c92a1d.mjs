// vite.config.ts
import { defineConfig } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/@vitejs/plugin-react/dist/index.js";
import { visualizer } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import { VitePWA } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/vite-plugin-pwa/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\HP ELITEBOOK\\DEV\\BarTender";
var vite_config_default = defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  plugins: [
    react(),
    visualizer({
      filename: "./dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true
    }),
    VitePWA({
      registerType: "prompt",
      // User must accept update
      includeAssets: ["icons/*.png", "favicon.ico"],
      manifest: {
        name: "BarTender - Gestion de Bar",
        short_name: "BarTender",
        description: "Application de gestion compl\xE8te pour bars et restaurants avec suivi des stocks, ventes et analytics",
        theme_color: "#f59e0b",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any"
          }
        ],
        screenshots: [
          {
            src: "/icons/screenshot-icon-390x844.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow"
          },
          {
            src: "/icons/screenshot-icon-1280x720.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide"
          }
        ],
        categories: ["business", "productivity", "finance"],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            description: "Acc\xE8s rapide au tableau de bord",
            url: "/dashboard",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }]
          },
          {
            name: "Inventaire",
            short_name: "Inventaire",
            description: "Gestion des stocks",
            url: "/inventory",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }]
          },
          {
            name: "Ventes",
            short_name: "Ventes",
            description: "Historique des ventes",
            url: "/sales-history",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }]
          }
        ]
      },
      workbox: {
        // Stratégie MINIMALE de precache (seulement ~80 KB)
        // Basé sur audit: HTML + CSS + manifest seulement
        globPatterns: [
          "**/*.{css,html,json}"
          // CSS (80 KB) + HTML + manifest ONLY
          // JS chunks sont volontairement EXCLUS du precache
        ],
        // Tous les JS chunks en runtime cache (StaleWhileRevalidate)
        runtimeCaching: [
          // 1. JS Chunks - Cache-first avec mise à jour background
          {
            urlPattern: /^.*\.(js|jsx|ts|tsx)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "js-chunks-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
                // 7 jours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 2. Supabase API - Network-first avec fallback cache (15 min TTL)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 15
                // 15 minutes (ajusté selon feedback)
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 3. Supabase Auth - Network-only (JAMAIS caché)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/v1\/.*/,
            handler: "NetworkOnly"
          },
          // 4. Supabase Storage - Cache-first pour images/fichiers
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30
                // 30 jours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // 5. Images et assets statiques
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
                // 30 jours
              }
            }
          },
          // 6. Fonts
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
                // 1 an
              }
            }
          }
        ],
        // Configuration globale
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        // Ne pas forcer update (UX)
        // Navigation fallback pour SPA
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/auth/]
      },
      devOptions: {
        enabled: true,
        // Activer en dev pour tester
        type: "module",
        navigateFallback: "/index.html"
      }
    })
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  build: {
    // Minification et optimisation
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.info", "console.debug"]
      },
      mangle: {
        safari10: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-motion": ["framer-motion"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-react-query": ["@tanstack/react-query"],
          "vendor-date-fns": ["date-fns"]
          // Note: xlsx and recharts are lazy loaded, so they're not in manualChunks
        }
      }
    },
    // CSS Minification
    cssMinify: true,
    // Increase chunk size warning limit (guides & offline add significant bundle size)
    chunkSizeWarningLimit: 600
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUCBFTElURUJPT0tcXFxcREVWXFxcXEJhclRlbmRlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcSFAgRUxJVEVCT09LXFxcXERFVlxcXFxCYXJUZW5kZXJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL0hQJTIwRUxJVEVCT09LL0RFVi9CYXJUZW5kZXIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcclxuaW1wb3J0IHsgdmlzdWFsaXplciB9IGZyb20gJ3JvbGx1cC1wbHVnaW4tdmlzdWFsaXplcic7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdCgpLFxyXG4gICAgdmlzdWFsaXplcih7XHJcbiAgICAgIGZpbGVuYW1lOiAnLi9kaXN0L3N0YXRzLmh0bWwnLFxyXG4gICAgICBvcGVuOiBmYWxzZSxcclxuICAgICAgZ3ppcFNpemU6IHRydWUsXHJcbiAgICAgIGJyb3RsaVNpemU6IHRydWUsXHJcbiAgICB9KSxcclxuICAgIFZpdGVQV0Eoe1xyXG4gICAgICByZWdpc3RlclR5cGU6ICdwcm9tcHQnLCAvLyBVc2VyIG11c3QgYWNjZXB0IHVwZGF0ZVxyXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ2ljb25zLyoucG5nJywgJ2Zhdmljb24uaWNvJ10sXHJcblxyXG4gICAgICBtYW5pZmVzdDoge1xyXG4gICAgICAgIG5hbWU6ICdCYXJUZW5kZXIgLSBHZXN0aW9uIGRlIEJhcicsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogJ0JhclRlbmRlcicsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdBcHBsaWNhdGlvbiBkZSBnZXN0aW9uIGNvbXBsXHUwMEU4dGUgcG91ciBiYXJzIGV0IHJlc3RhdXJhbnRzIGF2ZWMgc3VpdmkgZGVzIHN0b2NrcywgdmVudGVzIGV0IGFuYWx5dGljcycsXHJcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjZjU5ZTBiJyxcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI2ZmZmZmZicsXHJcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxyXG4gICAgICAgIG9yaWVudGF0aW9uOiAncG9ydHJhaXQnLFxyXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxyXG4gICAgICAgIHNjb3BlOiAnLycsXHJcbiAgICAgICAgaWNvbnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiAnL2ljb25zL2ljb24tMTkyeDE5Mi5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgcHVycG9zZTogJ2FueSdcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHNyYzogJy9pY29ucy9pY29uLTUxMng1MTIucG5nJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICcvaWNvbnMvYXBwbGUtdG91Y2gtaWNvbi5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzE4MHgxODAnLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgcHVycG9zZTogJ2FueSdcclxuICAgICAgICAgIH1cclxuICAgICAgICBdLFxyXG4gICAgICAgIHNjcmVlbnNob3RzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHNyYzogJy9pY29ucy9zY3JlZW5zaG90LWljb24tMzkweDg0NC5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzM5MHg4NDQnLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgZm9ybV9mYWN0b3I6ICduYXJyb3cnXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICcvaWNvbnMvc2NyZWVuc2hvdC1pY29uLTEyODB4NzIwLnBuZycsXHJcbiAgICAgICAgICAgIHNpemVzOiAnMTI4MHg3MjAnLFxyXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgZm9ybV9mYWN0b3I6ICd3aWRlJ1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY2F0ZWdvcmllczogWydidXNpbmVzcycsICdwcm9kdWN0aXZpdHknLCAnZmluYW5jZSddLFxyXG4gICAgICAgIHNob3J0Y3V0czogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBuYW1lOiAnRGFzaGJvYXJkJyxcclxuICAgICAgICAgICAgc2hvcnRfbmFtZTogJ0Rhc2hib2FyZCcsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQWNjXHUwMEU4cyByYXBpZGUgYXUgdGFibGVhdSBkZSBib3JkJyxcclxuICAgICAgICAgICAgdXJsOiAnL2Rhc2hib2FyZCcsXHJcbiAgICAgICAgICAgIGljb25zOiBbeyBzcmM6ICcvaWNvbnMvaWNvbi05Nng5Ni5wbmcnLCBzaXplczogJzk2eDk2JyB9XVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogJ0ludmVudGFpcmUnLFxyXG4gICAgICAgICAgICBzaG9ydF9uYW1lOiAnSW52ZW50YWlyZScsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2VzdGlvbiBkZXMgc3RvY2tzJyxcclxuICAgICAgICAgICAgdXJsOiAnL2ludmVudG9yeScsXHJcbiAgICAgICAgICAgIGljb25zOiBbeyBzcmM6ICcvaWNvbnMvaWNvbi05Nng5Ni5wbmcnLCBzaXplczogJzk2eDk2JyB9XVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogJ1ZlbnRlcycsXHJcbiAgICAgICAgICAgIHNob3J0X25hbWU6ICdWZW50ZXMnLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0hpc3RvcmlxdWUgZGVzIHZlbnRlcycsXHJcbiAgICAgICAgICAgIHVybDogJy9zYWxlcy1oaXN0b3J5JyxcclxuICAgICAgICAgICAgaWNvbnM6IFt7IHNyYzogJy9pY29ucy9pY29uLTk2eDk2LnBuZycsIHNpemVzOiAnOTZ4OTYnIH1dXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgXVxyXG4gICAgICB9LFxyXG5cclxuICAgICAgd29ya2JveDoge1xyXG4gICAgICAgIC8vIFN0cmF0XHUwMEU5Z2llIE1JTklNQUxFIGRlIHByZWNhY2hlIChzZXVsZW1lbnQgfjgwIEtCKVxyXG4gICAgICAgIC8vIEJhc1x1MDBFOSBzdXIgYXVkaXQ6IEhUTUwgKyBDU1MgKyBtYW5pZmVzdCBzZXVsZW1lbnRcclxuICAgICAgICBnbG9iUGF0dGVybnM6IFtcclxuICAgICAgICAgICcqKi8qLntjc3MsaHRtbCxqc29ufScgLy8gQ1NTICg4MCBLQikgKyBIVE1MICsgbWFuaWZlc3QgT05MWVxyXG4gICAgICAgICAgLy8gSlMgY2h1bmtzIHNvbnQgdm9sb250YWlyZW1lbnQgRVhDTFVTIGR1IHByZWNhY2hlXHJcbiAgICAgICAgXSxcclxuXHJcbiAgICAgICAgLy8gVG91cyBsZXMgSlMgY2h1bmtzIGVuIHJ1bnRpbWUgY2FjaGUgKFN0YWxlV2hpbGVSZXZhbGlkYXRlKVxyXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXHJcbiAgICAgICAgICAvLyAxLiBKUyBDaHVua3MgLSBDYWNoZS1maXJzdCBhdmVjIG1pc2UgXHUwMEUwIGpvdXIgYmFja2dyb3VuZFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXi4qXFwuKGpzfGpzeHx0c3x0c3gpJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScsXHJcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdqcy1jaHVua3MtY2FjaGUnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcclxuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDEwMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDcgLy8gNyBqb3Vyc1xyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgIHN0YXR1c2VzOiBbMCwgMjAwXVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAvLyAyLiBTdXBhYmFzZSBBUEkgLSBOZXR3b3JrLWZpcnN0IGF2ZWMgZmFsbGJhY2sgY2FjaGUgKDE1IG1pbiBUVEwpXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvLipcXC5zdXBhYmFzZVxcLmNvXFwvcmVzdFxcL3YxXFwvLiovLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3N1cGFiYXNlLWFwaS1jYWNoZScsXHJcbiAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiAxMCxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAyMDAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDE1IC8vIDE1IG1pbnV0ZXMgKGFqdXN0XHUwMEU5IHNlbG9uIGZlZWRiYWNrKVxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgIHN0YXR1c2VzOiBbMCwgMjAwXVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAvLyAzLiBTdXBhYmFzZSBBdXRoIC0gTmV0d29yay1vbmx5IChKQU1BSVMgY2FjaFx1MDBFOSlcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC8uKlxcLnN1cGFiYXNlXFwuY29cXC9hdXRoXFwvdjFcXC8uKi8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrT25seSdcclxuICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgLy8gNC4gU3VwYWJhc2UgU3RvcmFnZSAtIENhY2hlLWZpcnN0IHBvdXIgaW1hZ2VzL2ZpY2hpZXJzXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvLipcXC5zdXBhYmFzZVxcLmNvXFwvc3RvcmFnZVxcL3YxXFwvLiovLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXHJcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdzdXBhYmFzZS1zdG9yYWdlLWNhY2hlJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiA1MCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDMwIC8vIDMwIGpvdXJzXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgc3RhdHVzZXM6IFswLCAyMDBdXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgIC8vIDUuIEltYWdlcyBldCBhc3NldHMgc3RhdGlxdWVzXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC4oPzpwbmd8anBnfGpwZWd8c3ZnfGdpZnx3ZWJwfGljbykkLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnaW1hZ2VzLWNhY2hlJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAxMDAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzMCAvLyAzMCBqb3Vyc1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAvLyA2LiBGb250c1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwuKD86d29mZnx3b2ZmMnx0dGZ8ZW90KSQvLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXHJcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdmb250cy1jYWNoZScsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogMjAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgLy8gMSBhblxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIF0sXHJcblxyXG4gICAgICAgIC8vIENvbmZpZ3VyYXRpb24gZ2xvYmFsZVxyXG4gICAgICAgIGNsZWFudXBPdXRkYXRlZENhY2hlczogdHJ1ZSxcclxuICAgICAgICBjbGllbnRzQ2xhaW06IHRydWUsXHJcbiAgICAgICAgc2tpcFdhaXRpbmc6IGZhbHNlLCAvLyBOZSBwYXMgZm9yY2VyIHVwZGF0ZSAoVVgpXHJcblxyXG4gICAgICAgIC8vIE5hdmlnYXRpb24gZmFsbGJhY2sgcG91ciBTUEFcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnL2luZGV4Lmh0bWwnLFxyXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2tEZW55bGlzdDogWy9eXFwvYXBpLywgL15cXC9hdXRoL11cclxuICAgICAgfSxcclxuXHJcbiAgICAgIGRldk9wdGlvbnM6IHtcclxuICAgICAgICBlbmFibGVkOiB0cnVlLCAvLyBBY3RpdmVyIGVuIGRldiBwb3VyIHRlc3RlclxyXG4gICAgICAgIHR5cGU6ICdtb2R1bGUnLFxyXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6ICcvaW5kZXguaHRtbCdcclxuICAgICAgfVxyXG4gICAgfSlcclxuICBdLFxyXG4gIG9wdGltaXplRGVwczoge1xyXG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICAvLyBNaW5pZmljYXRpb24gZXQgb3B0aW1pc2F0aW9uXHJcbiAgICBtaW5pZnk6ICd0ZXJzZXInLFxyXG4gICAgdGVyc2VyT3B0aW9uczoge1xyXG4gICAgICBjb21wcmVzczoge1xyXG4gICAgICAgIGRyb3BfY29uc29sZTogdHJ1ZSxcclxuICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlLFxyXG4gICAgICAgIHB1cmVfZnVuY3M6IFsnY29uc29sZS5pbmZvJywgJ2NvbnNvbGUuZGVidWcnXVxyXG4gICAgICB9LFxyXG4gICAgICBtYW5nbGU6IHtcclxuICAgICAgICBzYWZhcmkxMDogdHJ1ZSxcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XHJcbiAgICAgICAgICAndmVuZG9yLXJlYWN0JzogWydyZWFjdCcsICdyZWFjdC1kb20nXSxcclxuICAgICAgICAgICd2ZW5kb3ItbW90aW9uJzogWydmcmFtZXItbW90aW9uJ10sXHJcbiAgICAgICAgICAndmVuZG9yLXN1cGFiYXNlJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcclxuICAgICAgICAgICd2ZW5kb3ItcmVhY3QtcXVlcnknOiBbJ0B0YW5zdGFjay9yZWFjdC1xdWVyeSddLFxyXG4gICAgICAgICAgJ3ZlbmRvci1kYXRlLWZucyc6IFsnZGF0ZS1mbnMnXSxcclxuICAgICAgICAgIC8vIE5vdGU6IHhsc3ggYW5kIHJlY2hhcnRzIGFyZSBsYXp5IGxvYWRlZCwgc28gdGhleSdyZSBub3QgaW4gbWFudWFsQ2h1bmtzXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgLy8gQ1NTIE1pbmlmaWNhdGlvblxyXG4gICAgY3NzTWluaWZ5OiB0cnVlLFxyXG4gICAgLy8gSW5jcmVhc2UgY2h1bmsgc2l6ZSB3YXJuaW5nIGxpbWl0IChndWlkZXMgJiBvZmZsaW5lIGFkZCBzaWduaWZpY2FudCBidW5kbGUgc2l6ZSlcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNjAwXHJcbiAgfVxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF1UyxTQUFTLG9CQUFvQjtBQUNwVSxPQUFPLFdBQVc7QUFDbEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sVUFBVTtBQUpqQixJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixXQUFXO0FBQUEsTUFDVCxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsTUFDTixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsSUFDZCxDQUFDO0FBQUEsSUFDRCxRQUFRO0FBQUEsTUFDTixjQUFjO0FBQUE7QUFBQSxNQUNkLGVBQWUsQ0FBQyxlQUFlLGFBQWE7QUFBQSxNQUU1QyxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsVUFDTDtBQUFBLFlBQ0UsS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLFVBQ1g7QUFBQSxVQUNBO0FBQUEsWUFDRSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDWDtBQUFBLFVBQ0E7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNM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
