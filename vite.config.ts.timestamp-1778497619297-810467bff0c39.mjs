// vite.config.ts
import { defineConfig } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/@vitejs/plugin-react/dist/index.js";
import { visualizer } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import { VitePWA } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/vite-plugin-pwa/dist/index.js";
import { sentryVitePlugin } from "file:///C:/Users/HP%20ELITEBOOK/DEV/BarTender/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
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
      // Mode injectManifest: Workbox injectera le precache manifest dans notre SW personnalisé
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Prevent build error from large HTML files (stats.html)
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
        // 5 MB
      },
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
        globIgnores: [
          "**/stats.html"
          // Rollup visualizer - too large for PWA cache
        ],
        // Increase limit to allow large HTML files (stats.html is 2.3MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // 5 MB instead of default 2 MB
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
    }),
    // Sentry Source Maps Upload (production builds only)
    // Requires SENTRY_AUTH_TOKEN env var or --release flag
    sentryVitePlugin({
      org: "zimkada-ingenuity",
      project: "bartendera",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      debug: false,
      release: {
        name: `bartender@${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`
      }
    })
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  build: {
    // Source Maps for Sentry (hidden = generated but not exposed in bundle)
    sourcemap: "hidden",
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
          // Core React — needed first, cached long-term
          "vendor-react": ["react", "react-dom"],
          // Routing — needed for initial navigation
          "vendor-router": ["react-router-dom"],
          // Animation — used widely but deferrable via HTTP/2 parallel load
          "vendor-motion": ["framer-motion"],
          // Backend — auth + data
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-react-query": ["@tanstack/react-query", "@tanstack/query-persist-client-core"],
          // Utilities — dates, icons, UI primitives
          "vendor-date-fns": ["date-fns"],
          "vendor-icons": ["lucide-react"],
          "vendor-ui": ["@radix-ui/react-checkbox", "@radix-ui/react-radio-group", "@radix-ui/react-slot", "class-variance-authority", "clsx", "tailwind-merge"],
          // Monitoring — deferred init, not needed for first paint
          "vendor-sentry": ["@sentry/react"],
          // Validation
          "vendor-zod": ["zod"]
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
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIUCBFTElURUJPT0tcXFxcREVWXFxcXEJhclRlbmRlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcSFAgRUxJVEVCT09LXFxcXERFVlxcXFxCYXJUZW5kZXJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL0hQJTIwRUxJVEVCT09LL0RFVi9CYXJUZW5kZXIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcclxuaW1wb3J0IHsgdmlzdWFsaXplciB9IGZyb20gJ3JvbGx1cC1wbHVnaW4tdmlzdWFsaXplcic7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xyXG5pbXBvcnQgeyBzZW50cnlWaXRlUGx1Z2luIH0gZnJvbSAnQHNlbnRyeS92aXRlLXBsdWdpbic7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxyXG4gICAgfSxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICB2aXN1YWxpemVyKHtcclxuICAgICAgZmlsZW5hbWU6ICcuL2Rpc3Qvc3RhdHMuaHRtbCcsXHJcbiAgICAgIG9wZW46IGZhbHNlLFxyXG4gICAgICBnemlwU2l6ZTogdHJ1ZSxcclxuICAgICAgYnJvdGxpU2l6ZTogdHJ1ZSxcclxuICAgIH0pLFxyXG4gICAgVml0ZVBXQSh7XHJcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ3Byb21wdCcsIC8vIFVzZXIgbXVzdCBhY2NlcHQgdXBkYXRlXHJcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnaWNvbnMvKi5wbmcnLCAnZmF2aWNvbi5pY28nXSxcclxuICAgICAgLy8gTW9kZSBpbmplY3RNYW5pZmVzdDogV29ya2JveCBpbmplY3RlcmEgbGUgcHJlY2FjaGUgbWFuaWZlc3QgZGFucyBub3RyZSBTVyBwZXJzb25uYWxpc1x1MDBFOVxyXG4gICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxyXG4gICAgICBzcmNEaXI6ICdzcmMnLFxyXG4gICAgICBmaWxlbmFtZTogJ3N3LnRzJyxcclxuICAgICAgLy8gUHJldmVudCBidWlsZCBlcnJvciBmcm9tIGxhcmdlIEhUTUwgZmlsZXMgKHN0YXRzLmh0bWwpXHJcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XHJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUgKiAxMDI0ICogMTAyNCwgLy8gNSBNQlxyXG4gICAgICB9LFxyXG5cclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBuYW1lOiAnQmFyVGVuZGVyIC0gR2VzdGlvbiBkZSBCYXInLFxyXG4gICAgICAgIHNob3J0X25hbWU6ICdCYXJUZW5kZXInLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXBwbGljYXRpb24gZGUgZ2VzdGlvbiBjb21wbFx1MDBFOHRlIHBvdXIgYmFycyBldCByZXN0YXVyYW50cyBhdmVjIHN1aXZpIGRlcyBzdG9ja3MsIHZlbnRlcyBldCBhbmFseXRpY3MnLFxyXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnI2Y1OWUwYicsXHJcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNmZmZmZmYnLFxyXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcclxuICAgICAgICBvcmllbnRhdGlvbjogJ3BvcnRyYWl0JyxcclxuICAgICAgICBzdGFydF91cmw6ICcvJyxcclxuICAgICAgICBzY29wZTogJy8nLFxyXG4gICAgICAgIGljb25zOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHNyYzogJy9pY29ucy9pY29uLTE5MngxOTIucG5nJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICcxOTJ4MTkyJyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICcvaWNvbnMvaWNvbi01MTJ4NTEyLnBuZycsXHJcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXHJcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICBwdXJwb3NlOiAnYW55J1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiAnL2ljb25zL2FwcGxlLXRvdWNoLWljb24ucG5nJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICcxODB4MTgwJyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnknXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICBzY3JlZW5zaG90czogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICcvaWNvbnMvc2NyZWVuc2hvdC1pY29uLTM5MHg4NDQucG5nJyxcclxuICAgICAgICAgICAgc2l6ZXM6ICczOTB4ODQ0JyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIGZvcm1fZmFjdG9yOiAnbmFycm93J1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiAnL2ljb25zL3NjcmVlbnNob3QtaWNvbi0xMjgweDcyMC5wbmcnLFxyXG4gICAgICAgICAgICBzaXplczogJzEyODB4NzIwJyxcclxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgIGZvcm1fZmFjdG9yOiAnd2lkZSdcclxuICAgICAgICAgIH1cclxuICAgICAgICBdLFxyXG4gICAgICAgIGNhdGVnb3JpZXM6IFsnYnVzaW5lc3MnLCAncHJvZHVjdGl2aXR5JywgJ2ZpbmFuY2UnXSxcclxuICAgICAgICBzaG9ydGN1dHM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogJ0Rhc2hib2FyZCcsXHJcbiAgICAgICAgICAgIHNob3J0X25hbWU6ICdEYXNoYm9hcmQnLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FjY1x1MDBFOHMgcmFwaWRlIGF1IHRhYmxlYXUgZGUgYm9yZCcsXHJcbiAgICAgICAgICAgIHVybDogJy9kYXNoYm9hcmQnLFxyXG4gICAgICAgICAgICBpY29uczogW3sgc3JjOiAnL2ljb25zL2ljb24tOTZ4OTYucG5nJywgc2l6ZXM6ICc5Nng5NicgfV1cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdJbnZlbnRhaXJlJyxcclxuICAgICAgICAgICAgc2hvcnRfbmFtZTogJ0ludmVudGFpcmUnLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0dlc3Rpb24gZGVzIHN0b2NrcycsXHJcbiAgICAgICAgICAgIHVybDogJy9pbnZlbnRvcnknLFxyXG4gICAgICAgICAgICBpY29uczogW3sgc3JjOiAnL2ljb25zL2ljb24tOTZ4OTYucG5nJywgc2l6ZXM6ICc5Nng5NicgfV1cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdWZW50ZXMnLFxyXG4gICAgICAgICAgICBzaG9ydF9uYW1lOiAnVmVudGVzJyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdIaXN0b3JpcXVlIGRlcyB2ZW50ZXMnLFxyXG4gICAgICAgICAgICB1cmw6ICcvc2FsZXMtaGlzdG9yeScsXHJcbiAgICAgICAgICAgIGljb25zOiBbeyBzcmM6ICcvaWNvbnMvaWNvbi05Nng5Ni5wbmcnLCBzaXplczogJzk2eDk2JyB9XVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIF1cclxuICAgICAgfSxcclxuXHJcbiAgICAgIHdvcmtib3g6IHtcclxuICAgICAgICAvLyBTdHJhdFx1MDBFOWdpZSBNSU5JTUFMRSBkZSBwcmVjYWNoZSAoc2V1bGVtZW50IH44MCBLQilcclxuICAgICAgICAvLyBCYXNcdTAwRTkgc3VyIGF1ZGl0OiBIVE1MICsgQ1NTICsgbWFuaWZlc3Qgc2V1bGVtZW50XHJcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbXHJcbiAgICAgICAgICAnKiovKi57Y3NzLGh0bWwsanNvbn0nIC8vIENTUyAoODAgS0IpICsgSFRNTCArIG1hbmlmZXN0IE9OTFlcclxuICAgICAgICAgIC8vIEpTIGNodW5rcyBzb250IHZvbG9udGFpcmVtZW50IEVYQ0xVUyBkdSBwcmVjYWNoZVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZ2xvYklnbm9yZXM6IFtcclxuICAgICAgICAgICcqKi9zdGF0cy5odG1sJywgLy8gUm9sbHVwIHZpc3VhbGl6ZXIgLSB0b28gbGFyZ2UgZm9yIFBXQSBjYWNoZVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgLy8gSW5jcmVhc2UgbGltaXQgdG8gYWxsb3cgbGFyZ2UgSFRNTCBmaWxlcyAoc3RhdHMuaHRtbCBpcyAyLjNNQilcclxuICAgICAgICBtYXhpbXVtRmlsZVNpemVUb0NhY2hlSW5CeXRlczogNSAqIDEwMjQgKiAxMDI0LCAvLyA1IE1CIGluc3RlYWQgb2YgZGVmYXVsdCAyIE1CXHJcblxyXG4gICAgICAgIC8vIFRvdXMgbGVzIEpTIGNodW5rcyBlbiBydW50aW1lIGNhY2hlIChTdGFsZVdoaWxlUmV2YWxpZGF0ZSlcclxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xyXG4gICAgICAgICAgLy8gMS4gSlMgQ2h1bmtzIC0gQ2FjaGUtZmlyc3QgYXZlYyBtaXNlIFx1MDBFMCBqb3VyIGJhY2tncm91bmRcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL14uKlxcLihqc3xqc3h8dHN8dHN4KSQvLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnanMtY2h1bmtzLWNhY2hlJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAxMDAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiA3IC8vIDcgam91cnNcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7XHJcbiAgICAgICAgICAgICAgICBzdGF0dXNlczogWzAsIDIwMF1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgLy8gMi4gU3VwYWJhc2UgQVBJIC0gTmV0d29yay1maXJzdCBhdmVjIGZhbGxiYWNrIGNhY2hlICgxNSBtaW4gVFRMKVxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcLy4qXFwuc3VwYWJhc2VcXC5jb1xcL3Jlc3RcXC92MVxcLy4qLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ05ldHdvcmtGaXJzdCcsXHJcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdzdXBhYmFzZS1hcGktY2FjaGUnLFxyXG4gICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogMTAsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogMjAwLFxyXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiAxNSAvLyAxNSBtaW51dGVzIChhanVzdFx1MDBFOSBzZWxvbiBmZWVkYmFjaylcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7XHJcbiAgICAgICAgICAgICAgICBzdGF0dXNlczogWzAsIDIwMF1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgLy8gMy4gU3VwYWJhc2UgQXV0aCAtIE5ldHdvcmstb25seSAoSkFNQUlTIGNhY2hcdTAwRTkpXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvLipcXC5zdXBhYmFzZVxcLmNvXFwvYXV0aFxcL3YxXFwvLiovLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknXHJcbiAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgIC8vIDQuIFN1cGFiYXNlIFN0b3JhZ2UgLSBDYWNoZS1maXJzdCBwb3VyIGltYWdlcy9maWNoaWVyc1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcLy4qXFwuc3VwYWJhc2VcXC5jb1xcL3N0b3JhZ2VcXC92MVxcLy4qLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3VwYWJhc2Utc3RvcmFnZS1jYWNoZScsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNTAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzMCAvLyAzMCBqb3Vyc1xyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgIHN0YXR1c2VzOiBbMCwgMjAwXVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAvLyA1LiBJbWFnZXMgZXQgYXNzZXRzIHN0YXRpcXVlc1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwuKD86cG5nfGpwZ3xqcGVnfHN2Z3xnaWZ8d2VicHxpY28pJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2ltYWdlcy1jYWNoZScsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogMTAwLFxyXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzAgLy8gMzAgam91cnNcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgLy8gNi4gRm9udHNcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcLig/OndvZmZ8d29mZjJ8dHRmfGVvdCkkLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZm9udHMtY2FjaGUnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcclxuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDIwLFxyXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IC8vIDEgYW5cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICBdLFxyXG5cclxuICAgICAgICAvLyBDb25maWd1cmF0aW9uIGdsb2JhbGVcclxuICAgICAgICBjbGVhbnVwT3V0ZGF0ZWRDYWNoZXM6IHRydWUsXHJcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxyXG4gICAgICAgIHNraXBXYWl0aW5nOiBmYWxzZSwgLy8gTmUgcGFzIGZvcmNlciB1cGRhdGUgKFVYKVxyXG5cclxuICAgICAgICAvLyBOYXZpZ2F0aW9uIGZhbGxiYWNrIHBvdXIgU1BBXHJcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogJy9pbmRleC5odG1sJyxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL2FwaS8sIC9eXFwvYXV0aC9dXHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBkZXZPcHRpb25zOiB7XHJcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSwgLy8gQWN0aXZlciBlbiBkZXYgcG91ciB0ZXN0ZXJcclxuICAgICAgICB0eXBlOiAnbW9kdWxlJyxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnL2luZGV4Lmh0bWwnXHJcbiAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgLy8gU2VudHJ5IFNvdXJjZSBNYXBzIFVwbG9hZCAocHJvZHVjdGlvbiBidWlsZHMgb25seSlcclxuICAgIC8vIFJlcXVpcmVzIFNFTlRSWV9BVVRIX1RPS0VOIGVudiB2YXIgb3IgLS1yZWxlYXNlIGZsYWdcclxuICAgIHNlbnRyeVZpdGVQbHVnaW4oe1xyXG4gICAgICBvcmc6ICd6aW1rYWRhLWluZ2VudWl0eScsXHJcbiAgICAgIHByb2plY3Q6ICdiYXJ0ZW5kZXJhJyxcclxuICAgICAgYXV0aFRva2VuOiBwcm9jZXNzLmVudi5TRU5UUllfQVVUSF9UT0tFTixcclxuICAgICAgdGVsZW1ldHJ5OiBmYWxzZSxcclxuICAgICAgZGVidWc6IGZhbHNlLFxyXG4gICAgICByZWxlYXNlOiB7XHJcbiAgICAgICAgbmFtZTogYGJhcnRlbmRlckAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdfWAsXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgXSxcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGV4Y2x1ZGU6IFsnbHVjaWRlLXJlYWN0J10sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgLy8gU291cmNlIE1hcHMgZm9yIFNlbnRyeSAoaGlkZGVuID0gZ2VuZXJhdGVkIGJ1dCBub3QgZXhwb3NlZCBpbiBidW5kbGUpXHJcbiAgICBzb3VyY2VtYXA6ICdoaWRkZW4nLFxyXG4gICAgLy8gTWluaWZpY2F0aW9uIGV0IG9wdGltaXNhdGlvblxyXG4gICAgbWluaWZ5OiAndGVyc2VyJyxcclxuICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgY29tcHJlc3M6IHtcclxuICAgICAgICBkcm9wX2NvbnNvbGU6IHRydWUsXHJcbiAgICAgICAgZHJvcF9kZWJ1Z2dlcjogdHJ1ZSxcclxuICAgICAgICBwdXJlX2Z1bmNzOiBbJ2NvbnNvbGUuaW5mbycsICdjb25zb2xlLmRlYnVnJ11cclxuICAgICAgfSxcclxuICAgICAgbWFuZ2xlOiB7XHJcbiAgICAgICAgc2FmYXJpMTA6IHRydWUsXHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIG1hbnVhbENodW5rczoge1xyXG4gICAgICAgICAgLy8gQ29yZSBSZWFjdCBcdTIwMTQgbmVlZGVkIGZpcnN0LCBjYWNoZWQgbG9uZy10ZXJtXHJcbiAgICAgICAgICAndmVuZG9yLXJlYWN0JzogWydyZWFjdCcsICdyZWFjdC1kb20nXSxcclxuICAgICAgICAgIC8vIFJvdXRpbmcgXHUyMDE0IG5lZWRlZCBmb3IgaW5pdGlhbCBuYXZpZ2F0aW9uXHJcbiAgICAgICAgICAndmVuZG9yLXJvdXRlcic6IFsncmVhY3Qtcm91dGVyLWRvbSddLFxyXG4gICAgICAgICAgLy8gQW5pbWF0aW9uIFx1MjAxNCB1c2VkIHdpZGVseSBidXQgZGVmZXJyYWJsZSB2aWEgSFRUUC8yIHBhcmFsbGVsIGxvYWRcclxuICAgICAgICAgICd2ZW5kb3ItbW90aW9uJzogWydmcmFtZXItbW90aW9uJ10sXHJcbiAgICAgICAgICAvLyBCYWNrZW5kIFx1MjAxNCBhdXRoICsgZGF0YVxyXG4gICAgICAgICAgJ3ZlbmRvci1zdXBhYmFzZSc6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXHJcbiAgICAgICAgICAndmVuZG9yLXJlYWN0LXF1ZXJ5JzogWydAdGFuc3RhY2svcmVhY3QtcXVlcnknLCAnQHRhbnN0YWNrL3F1ZXJ5LXBlcnNpc3QtY2xpZW50LWNvcmUnXSxcclxuICAgICAgICAgIC8vIFV0aWxpdGllcyBcdTIwMTQgZGF0ZXMsIGljb25zLCBVSSBwcmltaXRpdmVzXHJcbiAgICAgICAgICAndmVuZG9yLWRhdGUtZm5zJzogWydkYXRlLWZucyddLFxyXG4gICAgICAgICAgJ3ZlbmRvci1pY29ucyc6IFsnbHVjaWRlLXJlYWN0J10sXHJcbiAgICAgICAgICAndmVuZG9yLXVpJzogWydAcmFkaXgtdWkvcmVhY3QtY2hlY2tib3gnLCAnQHJhZGl4LXVpL3JlYWN0LXJhZGlvLWdyb3VwJywgJ0ByYWRpeC11aS9yZWFjdC1zbG90JywgJ2NsYXNzLXZhcmlhbmNlLWF1dGhvcml0eScsICdjbHN4JywgJ3RhaWx3aW5kLW1lcmdlJ10sXHJcbiAgICAgICAgICAvLyBNb25pdG9yaW5nIFx1MjAxNCBkZWZlcnJlZCBpbml0LCBub3QgbmVlZGVkIGZvciBmaXJzdCBwYWludFxyXG4gICAgICAgICAgJ3ZlbmRvci1zZW50cnknOiBbJ0BzZW50cnkvcmVhY3QnXSxcclxuICAgICAgICAgIC8vIFZhbGlkYXRpb25cclxuICAgICAgICAgICd2ZW5kb3Item9kJzogWyd6b2QnXSxcclxuICAgICAgICAgIC8vIE5vdGU6IHhsc3ggYW5kIHJlY2hhcnRzIGFyZSBsYXp5LWxvYWRlZCB2aWEgcGFnZSBjaHVua3NcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICAvLyBDU1MgTWluaWZpY2F0aW9uXHJcbiAgICBjc3NNaW5pZnk6IHRydWUsXHJcbiAgICAvLyBJbmNyZWFzZSBjaHVuayBzaXplIHdhcm5pbmcgbGltaXQgKGd1aWRlcyAmIG9mZmxpbmUgYWRkIHNpZ25pZmljYW50IGJ1bmRsZSBzaXplKVxyXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA2MDBcclxuICB9XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXVTLFNBQVMsb0JBQW9CO0FBQ3BVLE9BQU8sV0FBVztBQUNsQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsT0FBTyxVQUFVO0FBTGpCLElBQU0sbUNBQW1DO0FBUXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFdBQVc7QUFBQSxNQUNULFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxJQUNkLENBQUM7QUFBQSxJQUNELFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQTtBQUFBLE1BQ2QsZUFBZSxDQUFDLGVBQWUsYUFBYTtBQUFBO0FBQUEsTUFFNUMsWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBO0FBQUEsTUFFVixnQkFBZ0I7QUFBQSxRQUNkLCtCQUErQixJQUFJLE9BQU87QUFB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
