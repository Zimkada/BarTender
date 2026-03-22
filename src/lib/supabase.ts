/**
 * Supabase Client Configuration
 * Singleton instance pour gérer la connexion à Supabase
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file.'
  );
}

/**
 * Client Supabase avec types générés automatiquement
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-application-name': 'BarTender Pro',
    },
    fetch: (url, options = {}) => {
      // Timeout global pour toutes les requêtes Supabase.
      // Doit être supérieur au timeout max de retry dans SalesService (12s)
      // pour ne pas couper les requêtes en cours de retry.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
});

import { getErrorMessage } from '../utils/errorHandler';

/**
 * Helper pour gérer les erreurs Supabase
 */
export function handleSupabaseError(error: unknown): string {
  return getErrorMessage(error);
}
