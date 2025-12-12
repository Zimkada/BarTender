/**
 * Service pour signer les JWT tokens pour l'impersonnation
 * Utilise la libraire jose pour créer des tokens valides
 */

import * as jose from 'jose';

// La clé secrète JWT de Supabase (service_role secret)
// NOTE: En production, cette clé ne doit JAMAIS être exposée au frontend
// Pour la production, créer une Edge Function qui signe les tokens côté serveur
const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || '';

if (!JWT_SECRET) {
  console.warn('[JWT Service] VITE_JWT_SECRET not configured - impersonation will not work');
}

/**
 * Signe un JWT token pour l'impersonnation
 * @param userId ID de l'utilisateur à impersonner
 * @param email Email de l'utilisateur
 * @param role Rôle de l'utilisateur (promoteur, gerant, serveur, etc)
 * @param expiresIn Durée d'expiration du token (défaut: 24 heures)
 */
export async function signImpersonationToken(
  userId: string,
  email: string,
  role: string,
  expiresIn: string = '24h'
): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);

    const payload = {
      sub: userId,
      email: email,
      role: role,
      aud: 'authenticated',
      iss: 'https://yekomwjdznvtnialpdcz.supabase.co',
      app_metadata: {
        provider: 'custom_impersonate',
        impersonated_at: new Date().toISOString(),
      },
      user_metadata: {
        impersonation: true,
      },
    };

    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(expiresIn)
      .setIssuedAt()
      .sign(secret);

    return token;
  } catch (error: any) {
    console.error('[JWT Service] Error signing token:', error);
    throw new Error('Failed to sign impersonation token: ' + error.message);
  }
}

/**
 * Valide et décode un JWT token (utile pour debug)
 */
export async function verifyToken(token: string): Promise<any> {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const verified = await jose.jwtVerify(token, secret);
    return verified.payload;
  } catch (error: any) {
    console.error('[JWT Service] Token verification failed:', error);
    throw new Error('Invalid token: ' + error.message);
  }
}
