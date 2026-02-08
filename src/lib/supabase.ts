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
      // Ajouter timeout de 10s pour toutes les requêtes Supabase
      // Évite d'attendre 30s si le RPC timeout côté serveur (3s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
});

/**
 * Helper pour gérer les erreurs Supabase
 */
export function handleSupabaseError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Une erreur inattendue s\'est produite';
}
