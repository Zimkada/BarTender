/**
 * Utilitaires de gestion d'erreurs type-safe
 * Pattern utilisé par les grandes applications (Google, Meta, etc.)
 */

const ERROR_TRANSLATIONS: Record<string, string> = {
  'unauthorized: user is not a member or owner of this bar': 'Accès refusé : Vous n\'êtes pas membre ou propriétaire de ce bar',
  'unauthorized': 'Accès non autorisé',
  'invalid login credentials': 'Email ou mot de passe incorrect',
  'email not confirmed': 'Veuillez confirmer votre adresse email',
  'user already exists': 'Cet utilisateur existe déjà',
  'network error': 'Erreur réseau, veuillez vérifier votre connexion',
  'fetch error': 'Impossible de contacter le serveur',
  'user not found': 'Utilisateur introuvable',
  'invalid refresh token': 'Session expirée, veuillez vous reconnecter',
  'refresh token not found': 'Session expirée, veuillez vous reconnecter',
  'database error': 'Erreur de base de données',
  'permission denied': 'Permission refusée',
};

/**
 * Traduit un message d'erreur technique en français si une correspondance existe
 */
function translateError(message: string): string {
  if (!message) return message;
  const lowerMsg = message.toLowerCase().trim();

  // Recherche exacte
  if (ERROR_TRANSLATIONS[lowerMsg]) {
    return ERROR_TRANSLATIONS[lowerMsg];
  }

  // Recherche partielle pour les messages contenant des patterns connus
  for (const [key, translation] of Object.entries(ERROR_TRANSLATIONS)) {
    if (lowerMsg.includes(key)) {
      return translation;
    }
  }

  return message;
}

/**
 * Extrait le message d'une erreur inconnue de manière type-safe
 */
export function getErrorMessage(error: unknown): string {
  let message = 'Une erreur inattendue s\'est produite';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    } else if ('error' in error && typeof error.error === 'string') {
      message = error.error;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  return translateError(message);
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

/**
 * Classification d'erreur Supabase pour retry de mutations React Query.
 * Alignée sur SyncManager.shouldRetryError() (mêmes codes/patterns).
 *
 * Erreurs permanentes (ne PAS retry) :
 * - PGRST116 (no rows), 23xxx (PG constraints), 4xx sauf 408/429
 *
 * Erreurs transitoires (retry) :
 * - PGRST000, 5xx, 429, 408, network/timeout/fetch errors
 *
 * @param maxRetries Nombre max de tentatives (défaut: 2)
 */
export function mutationRetryFn(failureCount: number, error: unknown, maxRetries = 2): boolean {
  if (failureCount >= maxRetries) return false;

  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  const errorStatus = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 0;
  const errorMessage = getErrorMessage(error);

  // --- Erreurs permanentes (ne PAS retry) ---
  if (errorCode === 'PGRST116') return false;
  if (errorCode.startsWith('23')) return false;
  if (errorStatus >= 400 && errorStatus < 500 && errorStatus !== 408 && errorStatus !== 429) return false;

  // --- Erreurs transitoires (retry) ---
  if (errorCode === 'PGRST000') return true;
  if (errorStatus >= 500) return true;
  if (errorStatus === 429 || errorStatus === 408) return true;
  if (errorCode.includes('NETWORK') || errorCode.includes('TIMEOUT')) return true;
  if (errorCode.includes('QUOTA') || errorCode.includes('RATE_LIMIT')) return true;
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) return true;
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) return true;
  if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) return true;
  if (/\bconnection\b/i.test(errorMessage) && !errorMessage.includes('disconnect')) return true;

  return false;
}
