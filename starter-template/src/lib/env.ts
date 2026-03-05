/**
 * Validation des variables d'environnement — Fail-fast
 *
 * Centralise et valide toutes les variables VITE_* au démarrage.
 * En dev   : warning non-bloquant (console.warn) pour ne pas bloquer le travail local.
 * En prod  : throw immédiat si une variable requise est absente ou invalide.
 *
 * Usage dans les autres modules :
 *   import { env } from './env';
 *   const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
 *
 * Dépendance : zod (déjà dans package.json)
 */

import { z } from 'zod';

// ─── Schéma de validation ─────────────────────────────────────────────────────

const envSchema = z.object({
  // Supabase — requis (l'app est inutilisable sans)
  VITE_SUPABASE_URL:      z.string().url('Doit être une URL valide (ex: https://xxx.supabase.co)'),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'Clé anon Supabase manquante ou trop courte'),

  // URL de l'app — requis en production (liens emails, redirections OAuth)
  VITE_APP_URL: z.string().url('Doit être une URL valide (ex: https://mon-app.com)').optional(),

  // Sentry — optionnel (monitoring désactivé si absent, pas d'erreur)
  VITE_SENTRY_DSN: z.string().url('Doit être une URL Sentry valide').optional(),
});

// ─── Type exporté ─────────────────────────────────────────────────────────────

export type Env = z.infer<typeof envSchema>;

// ─── Validation ───────────────────────────────────────────────────────────────

function validateEnv(): Env {
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ✗ ${String(i.path[0])}: ${i.message}`)
      .join('\n');

    const message =
      `[env] Variables d'environnement invalides :\n${issues}\n\n` +
      `→ Vérifier .env.production et les variables Vercel Dashboard.`;

    if (import.meta.env.DEV) {
      // Dev : warning non-bloquant pour ne pas casser le HMR
      console.warn(message);
      return import.meta.env as unknown as Env;
    }

    // Production : crash immédiat avec message clair
    throw new Error(message);
  }

  return result.data;
}

export const env = validateEnv();
