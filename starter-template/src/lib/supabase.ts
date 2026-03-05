/**
 * Supabase Client — Singleton
 *
 * Timeout de 10s sur toutes les requêtes pour éviter d'attendre 30s+
 * si un RPC côté serveur timeout.
 */

import { createClient } from '@supabase/supabase-js';
// import type { Database } from './database.types'; // Décommenter après `npx supabase gen types typescript`
import { env } from './env';

export const supabase = createClient(
  // Si Database généré : createClient<Database>(...)
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      storage:            window.localStorage,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        // ⚠️ À adapter : nom de l'application
        'x-application-name': 'my-app',
      },
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 10_000);

        return fetch(url, { ...options, signal: controller.signal })
          .finally(() => clearTimeout(timeoutId));
      },
    },
  }
);
