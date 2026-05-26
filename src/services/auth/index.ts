/**
 * Auth Service Wrapper — Portable Layer
 *
 * Ce module est la **porte d'entrée unique** pour les primitives d'authentification.
 *
 * 🎯 BUT : Isoler Supabase Auth derrière une API portable. Le jour où on migre
 *         vers Auth0/Clerk/Cognito, seul ce fichier change.
 *
 * 📖 RÈGLE : Tout NOUVEAU code utilisant l'auth doit passer par `authPrimitives`.
 *           Le code existant (`AuthService` métier + appels directs `supabase.auth.*`)
 *           sera migré progressivement quand chaque fichier sera touché pour autre chose.
 *
 * ⚠️  Ne PAS confondre avec `src/services/supabase/auth.service.ts` (logique métier :
 *     login, signup, MFA business flow, gestion des membres). Ce wrapper ici expose
 *     uniquement les **primitives bas-niveau** de l'auth provider.
 */

import { supabase } from '../../lib/supabase';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

export const authPrimitives = {
  // ===== Session =====
  getSession: () => supabase.auth.getSession(),
  getUser: () => supabase.auth.getUser(),

  // ===== Auth state listener =====
  onAuthChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
    supabase.auth.onAuthStateChange(callback),

  // ===== Password management =====
  updateUser: (attributes: { password?: string; email?: string; data?: Record<string, unknown> }) =>
    supabase.auth.updateUser(attributes),
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) =>
    supabase.auth.resetPasswordForEmail(email, options),

  // ===== MFA (TOTP) =====
  mfa: {
    listFactors: () => supabase.auth.mfa.listFactors(),
    enroll: (params: { factorType: 'totp' }) => supabase.auth.mfa.enroll(params),
    challengeAndVerify: (params: { factorId: string; code: string }) =>
      supabase.auth.mfa.challengeAndVerify(params),
    unenroll: (params: { factorId: string }) => supabase.auth.mfa.unenroll(params),
  },

  // ===== Sign in/out (low-level) =====
  // Note: high-level login flows live in `src/services/supabase/auth.service.ts`
  signInWithPassword: (credentials: { email: string; password: string }) =>
    supabase.auth.signInWithPassword(credentials),
  signOut: () => supabase.auth.signOut(),
};

// Re-export types for convenience — also portable
export type { AuthChangeEvent, Session, User };
