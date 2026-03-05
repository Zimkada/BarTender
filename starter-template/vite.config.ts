import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

/**
 * Vite Config — Template production-ready
 *
 * Inclus :
 * - Alias @ → src/
 * - Source maps hidden pour Sentry
 * - Upload source maps Sentry (auth token via env)
 * - Chunking manuel des vendors
 * - Terser avec suppression console.log en prod
 *
 * Optionnel (décommenter si besoin) :
 * - VitePWA : support offline / installable
 * - visualizer : analyse du bundle
 */

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  plugins: [
    react(),

    // ⚠️ À adapter : org et project Sentry
    sentryVitePlugin({
      org:       process.env.SENTRY_ORG       ?? 'your-org',
      project:   process.env.SENTRY_PROJECT   ?? 'your-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      debug:     false,
      release: {
        name: `app@${new Date().toISOString().split('T')[0]}`,
      },
    }),

    // Décommenter pour analyse du bundle :
    // visualizer({ filename: './dist/stats.html', open: false, gzipSize: true }),
  ],

  build: {
    // Source maps générés mais non exposés dans le bundle (pour Sentry)
    sourcemap: 'hidden',

    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console:  true,
        drop_debugger: true,
        pure_funcs:    ['console.info', 'console.debug'],
      },
      mangle: {
        safari10: true,
      },
    },

    rollupOptions: {
      output: {
        // Chunking manuel : séparer les vendors lourds du code app
        manualChunks: {
          'vendor-react':       ['react', 'react-dom'],
          'vendor-router':      ['react-router-dom'],
          'vendor-query':       ['@tanstack/react-query'],
          'vendor-supabase':    ['@supabase/supabase-js'],
          // 'vendor-motion':   ['framer-motion'],  // si utilisé
          // 'vendor-date':     ['date-fns'],        // si utilisé
        },
      },
    },

    cssMinify:              true,
    chunkSizeWarningLimit:  600,
  },

  optimizeDeps: {
    // Ajouter les packages qui causent des problèmes de pre-bundling
    exclude: [],
  },
});
