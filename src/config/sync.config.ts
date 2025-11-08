// sync.config.ts - Configuration du système de synchronisation
// Permet de basculer entre mode local et mode cloud

/**
 * Configuration de synchronisation
 */
export const SYNC_CONFIG = {
  /**
   * Activer la synchronisation avec Supabase
   *
   * - `true`: Sync avec Supabase (production, staging)
   * - `false`: Mode local uniquement (dev, tests)
   *
   * @default false (pour développement local)
   */
  ENABLE_SUPABASE: import.meta.env.VITE_USE_SUPABASE === 'true',

  /**
   * URL du projet Supabase
   */
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',

  /**
   * Clé publique Supabase (anon key)
   */
  SUPABASE_KEY: import.meta.env.VITE_SUPABASE_KEY || '',

  /**
   * Intervalle de synchronisation automatique (ms)
   * @default 5000 (5 secondes)
   */
  SYNC_INTERVAL: Number(import.meta.env.VITE_SYNC_INTERVAL) || 5000,

  /**
   * Nombre maximum de tentatives de retry
   * @default 5
   */
  MAX_RETRIES: Number(import.meta.env.VITE_SYNC_MAX_RETRIES) || 5,

  /**
   * Mode debug (logs détaillés)
   * @default false
   */
  DEBUG: import.meta.env.DEV || import.meta.env.VITE_SYNC_DEBUG === 'true',
} as const;

/**
 * Vérifie si Supabase est configuré et activé
 */
export function isSupabaseEnabled(): boolean {
  return SYNC_CONFIG.ENABLE_SUPABASE &&
         Boolean(SYNC_CONFIG.SUPABASE_URL) &&
         Boolean(SYNC_CONFIG.SUPABASE_KEY);
}

/**
 * Log de configuration au démarrage (mode debug)
 */
if (SYNC_CONFIG.DEBUG) {
  console.group('🔧 [Sync Config]');
  console.log('Supabase enabled:', SYNC_CONFIG.ENABLE_SUPABASE);
  console.log('Supabase configured:', isSupabaseEnabled());
  console.log('Sync interval:', SYNC_CONFIG.SYNC_INTERVAL, 'ms');
  console.log('Max retries:', SYNC_CONFIG.MAX_RETRIES);
  console.groupEnd();
}
