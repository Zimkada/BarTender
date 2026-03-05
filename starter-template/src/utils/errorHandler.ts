/**
 * Gestion d'erreurs type-safe
 *
 * Règle : toujours utiliser getErrorMessage() dans les blocs catch.
 * Ne jamais faire `(error as any).message`.
 */

// ⚠️ À enrichir avec les messages d'erreur de ton domaine
const ERROR_TRANSLATIONS: Record<string, string> = {
  'unauthorized':                'Accès non autorisé',
  'invalid login credentials':   'Email ou mot de passe incorrect',
  'email not confirmed':         'Veuillez confirmer votre adresse email',
  'user already exists':         'Cet utilisateur existe déjà',
  'network error':               'Erreur réseau, vérifiez votre connexion',
  'fetch error':                 'Impossible de contacter le serveur',
  'user not found':              'Utilisateur introuvable',
  'invalid refresh token':       'Session expirée, veuillez vous reconnecter',
  'refresh token not found':     'Session expirée, veuillez vous reconnecter',
  'database error':              'Erreur de base de données',
  'permission denied':           'Permission refusée',
};

function translateError(message: string): string {
  if (!message) return message;
  const lower = message.toLowerCase().trim();

  if (ERROR_TRANSLATIONS[lower]) return ERROR_TRANSLATIONS[lower];

  for (const [key, translation] of Object.entries(ERROR_TRANSLATIONS)) {
    if (lower.includes(key)) return translation;
  }

  return message;
}

/**
 * Extrait un message lisible depuis une erreur de type inconnu.
 */
export function getErrorMessage(error: unknown): string {
  let message = 'Une erreur inattendue s\'est produite';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof (error as Record<string, unknown>).message === 'string') {
      message = (error as Record<string, unknown>).message as string;
    } else if ('error' in error && typeof (error as Record<string, unknown>).error === 'string') {
      message = (error as Record<string, unknown>).error as string;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  return translateError(message);
}

/**
 * Extrait les détails structurés d'une erreur Supabase.
 */
export interface SupabaseError {
  message: string;
  code?:    string;
  details?: string;
  hint?:    string;
}

export function getSupabaseError(error: unknown): SupabaseError {
  const message = getErrorMessage(error);

  if (typeof error === 'object' && error !== null) {
    return {
      message,
      code:    'code'    in error ? String((error as Record<string, unknown>).code)    : undefined,
      details: 'details' in error ? String((error as Record<string, unknown>).details) : undefined,
      hint:    'hint'    in error ? String((error as Record<string, unknown>).hint)    : undefined,
    };
  }

  return { message };
}

/**
 * Vérifie si l'erreur est une erreur réseau temporaire (candidat pour retry).
 */
export function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const code    = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as Record<string, unknown>).code)
    : '';

  return (
    message.includes('network')     ||
    message.includes('timeout')     ||
    message.includes('fetch')       ||
    code.includes('NETWORK')        ||
    code.includes('TIMEOUT')        ||
    code.includes('ECONNREFUSED')
  );
}
