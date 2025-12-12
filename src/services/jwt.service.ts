/**
 * Service pour signer les JWT tokens pour l'impersonnation
 * Appelle l'Edge Function Supabase (sign-impersonate-token) pour signer les tokens
 */

import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/sign-impersonate-token`;

/**
 * Appelle l'Edge Function pour signer un JWT token pour l'impersonnation
 * La clé secrète JWT reste sécurisée sur le serveur (Supabase)
 *
 * @param userId ID de l'utilisateur à impersonner
 * @param email Email de l'utilisateur
 * @param role Rôle de l'utilisateur (promoteur, gerant, serveur, etc)
 * @param barId ID du bar dans lequel l'impersonation est effectuée
 * @param expiresAt Date d'expiration du token (ISO format)
 * @returns JWT token signé
 */
export async function signImpersonationToken(
  userId: string,
  email: string,
  role: string,
  barId: string,
  expiresAt: string
): Promise<string> {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
      body: JSON.stringify({
        impersonated_user_id: userId,
        impersonated_user_email: email,
        impersonated_user_role: role,
        bar_id: barId,
        expires_at: expiresAt,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Edge Function error: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error: any) {
    console.error('[JWT Service] Error calling Edge Function:', error);
    throw new Error('Failed to sign impersonation token: ' + error.message);
  }
}
