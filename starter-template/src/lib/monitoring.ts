/**
 * Monitoring & Error Tracking — Sentry Integration
 *
 * Wrapper centralisé pour Sentry.
 * Ne jamais utiliser Sentry directement dans l'app — toujours passer par ce module.
 * Actif uniquement en production si VITE_SENTRY_DSN est défini.
 */

import * as Sentry from '@sentry/react';
import { env } from './env';

const IS_PRODUCTION = import.meta.env.PROD;

/**
 * Initialise Sentry. À appeler une seule fois dans main.tsx, avant le rendu.
 */
export function initMonitoring(): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) {
    console.log('[Monitoring] Sentry désactivé (dev ou DSN manquant)');
    return;
  }

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: 'production',

    // 10% des transactions (navigation, page loads)
    tracesSampleRate: 0.1,
    // 100% des erreurs
    sampleRate: 1.0,

    // Désactiver Session Replay (données sensibles)
    integrations: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    beforeSend(event, hint) {
      // Ignorer les erreurs client 4xx (bruit de dev, non-actionnable)
      const exception = hint.originalException;
      if (exception instanceof Error) {
        if (/\b40[134]\b/.test(exception.message)) return null;
      }
      return event;
    },

    // ⚠️ À adapter : URLs de production autorisées
    allowUrls: [
      /^https:\/\/your-domain\.com/,
      /^https:\/\/your-project\.vercel\.app/,
    ],
  });

  console.log('[Monitoring] Sentry initialisé');
}

/**
 * Capture une erreur. Remplace console.error pour les erreurs à tracker.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) {
    console.error('[Error]', error, context);
    return;
  }

  if (error instanceof Error) {
    Sentry.captureException(error, {
      contexts: context ? { app: context } : undefined,
    });
  } else {
    Sentry.captureMessage(String(error), {
      level: 'error',
      contexts: context ? { app: context } : undefined,
    });
  }
}

/**
 * Capture un message (warning, info, etc.)
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) {
    console.log(`[${level.toUpperCase()}]`, message);
    return;
  }
  Sentry.captureMessage(message, { level });
}

/**
 * Associe un utilisateur aux futures erreurs. À appeler après login.
 */
export function setUserContext(userId: string, email?: string): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) return;
  Sentry.setUser({ id: userId, email });
}

/**
 * Efface le contexte utilisateur. À appeler à la déconnexion.
 */
export function clearUserContext(): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) return;
  Sentry.setUser(null);
}

/**
 * Ajoute un fil d'Ariane pour enrichir le contexte des erreurs.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!IS_PRODUCTION || !env.VITE_SENTRY_DSN) return;
  Sentry.addBreadcrumb({ message, data, level: 'info', timestamp: Date.now() / 1000 });
}
