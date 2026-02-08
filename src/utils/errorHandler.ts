/**
 * Utilitaires de gestion d'erreurs type-safe
 * Pattern utilisé par les grandes applications (Google, Meta, etc.)
 */

/**
 * Extrait le message d'une erreur inconnue de manière type-safe
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    // Gestion des erreurs Supabase
    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error occurred';
}

/**
 * Extrait les détails d'une erreur Supabase
 */
export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function getSupabaseError(error: unknown): SupabaseError {
  const message = getErrorMessage(error);

  if (typeof error === 'object' && error !== null) {
    return {
      message,
      code: 'code' in error ? String(error.code) : undefined,
      details: 'details' in error ? String(error.details) : undefined,
      hint: 'hint' in error ? String(error.hint) : undefined,
    };
  }

  return { message };
}

/**
 * Vérifie si une erreur est une erreur réseau temporaire
 */
export function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const errorObj = typeof error === 'object' && error !== null ? error : {};
  const code = 'code' in errorObj ? String(errorObj.code) : '';

  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch') ||
    code.includes('NETWORK') ||
    code.includes('TIMEOUT') ||
    code.includes('ECONNREFUSED')
  );
}

/**
 * Vérifie si une erreur mérite un retry
 */
export function shouldRetryError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();

  // Erreurs temporaires de base de données
  return (
    message.includes('lock') ||
    message.includes('deadlock') ||
    message.includes('too many connections') ||
    message.includes('connection reset')
  );
}
