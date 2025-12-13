import React, { createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, RolePermissions } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { AuthService, LoginResult } from '../services/supabase/auth.service'; // Import LoginResult
import { supabase } from '../lib/supabase';
import { signImpersonationToken } from '../services/jwt.service';

interface AuthContextType {
  currentSession: UserSession | null;
  isAuthenticated: boolean;
  // users: User[]; // Removed as it's not used and not part of AuthContext's core responsibility
  login: (email: string, password: string) => Promise<LoginResult>; // Updated return type
  verifyMfa: (factorId: string, code: string) => Promise<LoginResult>; // New MFA verification function
  logout: () => void;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  refreshSession: () => Promise<void>;
  // createUser: (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole) => Promise<User | null>; // Moved out of AuthContext
  // updateUser: (userId: string, updates: Partial<User>) => Promise<void>; // Moved out of AuthContext
  changePassword: (newPassword: string) => Promise<void>;
  // getUserById: (userId: string) => User | undefined; // Moved out of AuthContext
  // Impersonation
  isImpersonating: boolean;
  originalSession: UserSession | null;
  impersonate: (userId: string, barId: string, role: UserRole) => Promise<void>;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentSession, setCurrentSession] = useDataStore<UserSession | null>('bar-current-session', null);
  const [originalSession, setOriginalSession] = useDataStore<UserSession | null>('bar-original-session', null);
  const [isImpersonating, setIsImpersonating] = useDataStore<boolean>('bar-is-impersonating', false);

  // 🧹 Nettoyer la session si elle contient des données invalides (ex: ID '1')
  useEffect(() => {
    if (currentSession?.userId === '1') {
      console.warn('[AuthContext] Detected invalid legacy session (ID=1), clearing...');
      setCurrentSession(null);
    }
  }, [currentSession, setCurrentSession]);

  // 🔐 Initialiser la session Supabase RLS au démarrage
  useEffect(() => {
    AuthService.initializeSession().then(authUser => {
      if (authUser) {
        const session: UserSession = {
          userId: authUser.id,
          userName: authUser.name,
          role: authUser.role,
          barId: authUser.barId,
          barName: authUser.barName,
          loginTime: new Date(),
          permissions: getPermissionsByRole(authUser.role),
          firstLogin: authUser.first_login ?? false
        };
        setCurrentSession(session);
      } else {
        // Si aucune session valide trouvée (ou token expiré), on nettoie
        console.log('[AuthContext] No valid session found during init, clearing state');
        if (currentSession) {
          sessionStorage.setItem('session_expired', 'true');
        }
        if (currentSession) {
          // Notification seulement si on avait une session (donc expiration)
          // Note: need to import useNotifications or use a global toaster if available, or just rely on redirect.
          // Since useNotifications is likely a hook relative to a provider, and AuthProvider is at top level, 
          // we might need to be careful. 
          // Actually, AuthProvider is usually above NotificationProvider? Let's check App.tsx or use a simpler alert/console for now, 
          // or better: let the user know they are redirected.
          // The user requested a message.
        }
        setCurrentSession(null);
      }
    }).catch(err => {
      console.error('[AuthContext] Failed to initialize Supabase session:', err);
    });
  }, [setCurrentSession]);

  // 🔐 Écouter les changements d'authentification Supabase
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] Auth state changed:', event, session?.user?.id);

        // Get current user from localStorage (source of truth during transitions)
        const currentUser = AuthService.getCurrentUser();

        // 🔒 PROTECTION: Ignore SIGNED_IN if someone else is already logged in
        // This prevents session hijacking during account creation (promoter/manager creating new users)
        if (event === 'SIGNED_IN' && session && currentUser) {
          if (currentUser.id !== session.user.id) {
            console.log(
              '[AuthContext] 🛡️ Ignoring SIGNED_IN for different user',
              `(current: ${currentUser.id}, new: ${session.user.id})`,
              '- Account creation in progress'
            );
            return; // ⛔ Ignore this event - account creation flow
          }
        }

        // 🔒 PROTECTION: Ignore SIGNED_OUT if we still have a valid session
        // This prevents session loss during account creation cleanup
        if (event === 'SIGNED_OUT') {
          if (currentUser) {
            console.log(
              '[AuthContext] 🛡️ Ignoring SIGNED_OUT - Valid session exists',
              `(user: ${currentUser.id})`,
              '- Account creation cleanup in progress'
            );
            return; // ⛔ Ignore this event - account creation cleanup
          }
          // Legitimate logout - clear session
          setCurrentSession(null);
        } else if (event === 'TOKEN_REFRESHED') {
          // Le token JWT a été rafraîchi automatiquement
          console.log('[AuthContext] Token refreshed');
        } else if (event === 'SIGNED_IN' && session) {
          // Legitimate login (same user or no one logged in)
          console.log('[AuthContext] ✅ User signed in:', session.user.id);
          // Re-initialize session to get full AuthUser data
          AuthService.initializeSession().then(authUser => {
            if (authUser) {
              const newSession: UserSession = {
                userId: authUser.id,
                userName: authUser.name,
                role: authUser.role,
                barId: authUser.barId,
                barName: authUser.barName,
                loginTime: new Date(),
                permissions: getPermissionsByRole(authUser.role),
                firstLogin: authUser.first_login ?? false
              };
              setCurrentSession(newSession);
            }
          });
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [setCurrentSession]);

  // 🔐 Login avec Supabase Auth (email + password)
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const result = await AuthService.login({ email, password });

      if (result.user) {
        const authUser = result.user;
        const session: UserSession = {
          userId: authUser.id,
          userName: authUser.name,
          role: authUser.role,
          barId: authUser.barId,
          barName: authUser.barName,
          loginTime: new Date(),
          permissions: getPermissionsByRole(authUser.role),
          firstLogin: authUser.first_login ?? false
        };
        setCurrentSession(session);

        auditLogger.log({
          event: 'LOGIN_SUCCESS',
          severity: 'info',
          userId: authUser.id,
          userName: authUser.name,
          userRole: authUser.role,
          barId: session.barId !== 'admin_global' ? session.barId : undefined,
          barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
          description: `Connexion réussie en tant que ${authUser.role}`,
          metadata: { email },
        });
        return { user: authUser };
      } else if (result.mfaRequired) {
        // MFA est requis, retourner le résultat pour que le composant de login le gère
        return result;
      } else if (result.error) {
        // Erreur de connexion
        auditLogger.log({
          event: 'LOGIN_FAILED',
          severity: 'warning',
          userId: email,
          userName: email,
          userRole: 'serveur' as UserRole, // Default role for logging
          description: `Tentative de connexion échouée: ${result.error}`,
          metadata: { email, error: result.error },
        });
        return { error: result.error };
      }
      return { error: 'Une erreur inattendue est survenue lors de la connexion.' };
    } catch (error: any) {
      console.error('[AuthContext] Login failed:', error);
      auditLogger.log({
        event: 'LOGIN_FAILED',
        severity: 'warning',
        userId: email,
        userName: email,
        userRole: 'serveur' as UserRole,
        description: `Tentative de connexion échouée: ${error.message}`,
        metadata: { email, error: error.message },
      });
      return { error: error.message || 'Erreur lors de la connexion' };
    }
  }, [setCurrentSession]);

  // 🔐 Vérification MFA
  const verifyMfa = useCallback(async (factorId: string, code: string): Promise<LoginResult> => {
    try {
      const result = await AuthService.verifyMfa(factorId, code);

      if (result.user) {
        const authUser = result.user;
        const session: UserSession = {
          userId: authUser.id,
          userName: authUser.name,
          role: authUser.role,
          barId: authUser.barId,
          barName: authUser.barName,
          loginTime: new Date(),
          permissions: getPermissionsByRole(authUser.role),
          firstLogin: authUser.first_login ?? false
        };
        setCurrentSession(session);

        auditLogger.log({
          event: 'LOGIN_SUCCESS',
          severity: 'info',
          userId: authUser.id,
          userName: authUser.name,
          userRole: authUser.role,
          barId: session.barId !== 'admin_global' ? session.barId : undefined,
          barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
          description: `Connexion MFA réussie en tant que ${authUser.role}`,
          metadata: { userId: authUser.id },
        });
        return { user: authUser };
      } else if (result.error) {
        auditLogger.log({
          event: 'LOGIN_FAILED',
          severity: 'warning',
          userId: 'unknown', // User ID might not be available yet
          userName: 'unknown',
          userRole: 'serveur' as UserRole,
          description: `Tentative de connexion MFA échouée: ${result.error}`,
          metadata: { factorId, error: result.error },
        });
        return { error: result.error };
      }
      return { error: 'Une erreur inattendue est survenue lors de la vérification MFA.' };
    } catch (error: any) {
      console.error('[AuthContext] MFA verification failed:', error);
      return { error: error.message || 'Erreur lors de la vérification MFA' };
    }
  }, [setCurrentSession]);


  const logout = useCallback(async () => {
    if (currentSession) {
      // Log déconnexion
      auditLogger.log({
        event: 'LOGOUT',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
        barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
        description: 'Déconnexion',
      });
    }

    await AuthService.logout();
    setCurrentSession(null);
  }, [currentSession, setCurrentSession]);

  const hasPermission = useCallback((permission: keyof RolePermissions) => {
    return currentSession?.permissions?.[permission] ?? false;
  }, [currentSession]);

  // const createUser = useCallback(async (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole): Promise<User | null> => {
  //   if (!currentSession) return null;

  //   if (role === 'gerant' && !hasPermission('canCreateManagers')) return null;
  //   if (role === 'serveur' && !hasPermission('canCreateServers')) return null;

  //   try {
  //     // Créer via Supabase AuthService
  //     const newUser = await AuthService.signup(
  //       {
  //         email: userData.email || `${userData.username}@bartender.local`, // Email requis
  //         password: userData.password || 'TempPassword123!', // Mot de passe temporaire
  //         name: userData.name,
  //         phone: userData.phone,
  //         username: userData.username,
  //       },
  //       currentSession.barId,
  //       role as 'gerant' | 'serveur'
  //     );

  //     const user: User = {
  //       id: newUser.id,
  //       username: newUser.username,
  //       password: '', // Pas exposé
  //       name: newUser.name,
  //       phone: newUser.phone,
  //       email: undefined,
  //       createdAt: new Date(newUser.created_at),
  //       isActive: newUser.is_active,
  //       firstLogin: newUser.first_login,
  //       lastLoginAt: newUser.last_login_at ? new Date(newUser.last_login_at) : undefined,
  //       createdBy: currentSession.userId,
  //     };

  //     // Log création utilisateur
  //     auditLogger.log({
  //       event: 'USER_CREATED',
  //       severity: 'info',
  //       userId: currentSession.userId,
  //       userName: currentSession.userName,
  //       userRole: currentSession.role,
  //       barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
  //       barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
  //       description: `Création utilisateur: ${user.name} (${role})`,
  //       metadata: {
  //         newUserId: user.id,
  //         newUserName: user.name,
  //         newUserRole: role,
  //         newUserUsername: user.username,
  //       },
  //       relatedEntityId: user.id,
  //       relatedEntityType: 'user',
  //     });

  //     return user;
  //   } catch (error) {
  //     console.error('[AuthContext] Error creating user:', error);
  //     return null;
  //   }
  // }, [currentSession, hasPermission]);

  // const updateUser = useCallback(async (userId: string, updates: Partial<User>): Promise<void> => {
  //   if (!currentSession) return;

  //   try {
  //     // Convertir les updates au format Supabase
  //     const supabaseUpdates: any = {};
  //     if (updates.name) supabaseUpdates.name = updates.name;
  //     if (updates.phone) supabaseUpdates.phone = updates.phone;
  //     if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;

  //     const updatedUser = await AuthService.updateProfile(userId, supabaseUpdates);

  //     // Log mise à jour utilisateur
  //     auditLogger.log({
  //       event: 'USER_UPDATED',
  //       severity: 'info',
  //       userId: currentSession.userId,
  //       userName: currentSession.userName,
  //       userRole: currentSession.role,
  //       barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
  //       barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
  //       description: `Mise à jour utilisateur: ${updatedUser.name}`,
  //       metadata: {
  //         targetUserId: userId,
  //         targetUserName: updatedUser.name,
  //         updates: updates,
  //       },
  //       relatedEntityId: userId,
  //       relatedEntityType: 'user',
  //     });
  //   } catch (error) {
  //     console.error('[AuthContext] Error updating user:', error);
  //   }
  // }, [currentSession]);

  const changePassword = useCallback(async (newPassword: string): Promise<void> => {
    if (!currentSession) {
      throw new Error('Session non trouvée');
    }

    try {
      // Changer le mot de passe via AuthService (Supabase Auth)
      await AuthService.changePassword(newPassword);

      // Mettre à jour firstLogin dans la session
      setCurrentSession({
        ...currentSession,
        firstLogin: false
      });

      // Log changement mot de passe
      auditLogger.log({
        event: 'PASSWORD_RESET',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
        barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
        description: `${currentSession.userName} a modifié son propre mot de passe`,
        metadata: {
          targetUserId: currentSession.userId,
          isSelfChange: true,
          changedBy: currentSession.userName,
        },
        relatedEntityId: currentSession.userId,
        relatedEntityType: 'user',
      });
    } catch (error: any) {
      console.error('[AuthContext] Error changing password:', error);
      throw new Error(error.message || 'Erreur lors du changement de mot de passe');
    }
  }, [currentSession, setCurrentSession]);

  // const getUserById = useCallback((_userId: string) => {
  //   // TODO: Implémenter avec Supabase
  //   console.warn('[AuthContext] getUserById not yet implemented with Supabase');
  //   return undefined;
  // }, []);

  // Impersonation: Se connecter en tant qu'un autre user avec JWT custom (pour super admin)
  const impersonate = useCallback(async (userId: string, barId: string, role: UserRole) => {
    if (!currentSession) {
      console.error('[Impersonation] No current session');
      return;
    }

    // Vérifier que l'utilisateur actuel est super_admin
    if (currentSession.role !== 'super_admin') {
      console.error('[Impersonation] Only super_admin can impersonate');
      alert('Seul le Super Admin peut utiliser cette fonctionnalité');
      return;
    }

    try {
      // 1. Valider l'impersonation avec le RPC et récupérer les données de l'utilisateur
      const { data: validationData, error: validationError } = await supabase.rpc(
        'validate_and_get_impersonate_data',
        {
          p_super_admin_id: currentSession.userId,
          p_impersonated_user_id: userId,
          p_bar_id: barId,
        }
      );

      if (validationError) {
        console.error('[Impersonation] Validation RPC error:', validationError);
        alert('Erreur lors de la validation: ' + validationError.message);
        return;
      }

      if (!Array.isArray(validationData) || validationData.length === 0) {
        alert('Données de validation invalides');
        return;
      }

      const result = validationData[0] as any;

      if (!result.success) {
        console.error('[Impersonation] Validation failed:', result.error_message);
        alert(result.error_message || 'Impossible d\'impersonater cet utilisateur');
        return;
      }

      // 2. Récupérer le bar name depuis la validation data
      const { data: barData, error: barError } = await supabase
        .from('bars')
        .select('name')
        .eq('id', barId)
        .single();

      if (barError || !barData) {
        console.error('[Impersonation] Failed to fetch bar data:', barError);
        alert('Impossible de récupérer les informations du bar');
        return;
      }

      // 3. Récupérer le user name
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        console.error('[Impersonation] Failed to fetch user data:', userError);
        alert('Impossible de récupérer les informations de l\'utilisateur');
        return;
      }

      // 4. Sauvegarder la session originale si ce n'est pas déjà une impersonation
      if (!isImpersonating) {
        setOriginalSession(currentSession);
      }

      // 5. Signer un JWT token valide pour l'impersonnation
      // Ce JWT sera reconnu par Supabase et utilisé pour les vérifications RLS
      const jwtToken = await signImpersonationToken(
        userId,
        result.impersonated_user_email,
        result.impersonated_user_role,
        barId,
        result.expires_at
      );

      // 6. Créer l'objet session custom pour Supabase
      const customSession = {
        access_token: jwtToken,
        token_type: 'Bearer',
        expires_in: 86400, // 24 heures en secondes
        expires_at: Math.floor((new Date(result.expires_at).getTime()) / 1000),
        refresh_token: '',
        user: {
          id: userId,
          email: result.impersonated_user_email,
          user_metadata: {
            name: userData.name,
            impersonation: true,
          },
          app_metadata: {
            provider: 'custom_impersonate',
            impersonated_by: currentSession.userId,
            bar_id: barId,
            bar_role: result.impersonated_user_role,
          },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        } as any,
      };

      // 7. Appliquer le JWT signé à la session Supabase
      // Maintenant, le JWT est valide et Supabase le reconnaîtra
      await supabase.auth.setSession(customSession as any);

      // 7b. Force Supabase to recognize the new user ID by reinitializing auth state
      // This ensures subsequent RLS queries use the impersonated user's ID
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[Impersonation] Current session user ID after setSession:', session?.user?.id);

      // 8. Créer la nouvelle session pour l'utilisateur cible
      const impersonatedSession: UserSession = {
        userId: userData.id,
        userName: userData.name,
        role: role,
        barId: barId,
        barName: barData.name,
        loginTime: new Date(),
        permissions: getPermissionsByRole(role),
        firstLogin: false
      };

      // 9. Appliquer la nouvelle session UI
      setCurrentSession(impersonatedSession);
      setIsImpersonating(true);

      // 10. Log impersonation start
      auditLogger.log({
        event: 'IMPERSONATE_START',
        severity: 'warning',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: barId,
        barName: barData.name,
        description: `Impersonation démarrée: ${currentSession.userName} → ${userData.name} (${role}) au bar ${barData.name}. JWT signé valide appliqué.`,
        metadata: {
          targetUserId: userId,
          targetUserName: userData.name,
          targetBarId: barId,
          targetBarName: barData.name,
          targetRole: role,
          jwtSigned: true,
          tokenExpiry: result.expires_at,
        },
      });

      console.log('[Impersonation] Started impersonating user with signed JWT:', userData.name);
    } catch (error: any) {
      console.error('[Impersonation] Error:', error);
      alert('Erreur lors de l\'impersonation: ' + error.message);
    }
  }, [currentSession, isImpersonating, setCurrentSession, setOriginalSession, setIsImpersonating]);

  // Stop impersonation: Revenir à la session super admin avec JWT original
  const stopImpersonation = useCallback(async () => {
    if (!isImpersonating || !originalSession) {
      console.error('Not currently impersonating');
      return;
    }

    try {
      // Log impersonation stop (avant de changer session)
      if (currentSession) {
        auditLogger.log({
          event: 'IMPERSONATE_STOP',
          severity: 'info',
          userId: originalSession.userId,
          userName: originalSession.userName,
          userRole: originalSession.role,
          barId: currentSession.barId,
          barName: currentSession.barName,
          description: `Impersonation terminée: Retour au compte Super Admin`,
          metadata: {
            impersonatedUserId: currentSession.userId,
            impersonatedUserName: currentSession.userName,
            impersonatedRole: currentSession.role,
          },
        });
      }

      // Récupérer la session originale du Super Admin depuis le localStorage
      // Car on a perdu le token Supabase original quand on a appelé setSession avec le token custom
      const originalSupabaseSession = localStorage.getItem('sb-' + import.meta.env.VITE_SUPABASE_URL?.replace('https://', '').split('.')[0] + '-auth-token');

      if (originalSupabaseSession) {
        try {
          const sessionData = JSON.parse(originalSupabaseSession);
          if (sessionData && sessionData.session) {
            // Restaurer la session originale
            await supabase.auth.setSession(sessionData.session);
          }
        } catch (e) {
          console.warn('[Impersonation] Could not restore original Supabase session from localStorage:', e);
          // Continuer quand même avec la session UI
        }
      }

      // Restore session UI originale
      setCurrentSession(originalSession);
      setOriginalSession(null);
      setIsImpersonating(false);

      console.log('[Impersonation] Returned to admin session');
    } catch (error: any) {
      console.error('[Impersonation] Error stopping impersonation:', error);
      // Forcer la restauration même en cas d'erreur
      setCurrentSession(originalSession);
      setOriginalSession(null);
      setIsImpersonating(false);
    }
  }, [isImpersonating, originalSession, currentSession, setCurrentSession, setOriginalSession, setIsImpersonating]);

  const value: AuthContextType = {
    currentSession,
    isAuthenticated: !!currentSession,
    // users: [], // Plus de mock users
    login,
    verifyMfa, // Add verifyMfa to context value
    logout,
    hasPermission,
    // createUser, // Removed from context value
    // updateUser, // Removed from context value
    changePassword,
    // getUserById, // Removed from context value
    isImpersonating,
    originalSession,
    impersonate,
    stopImpersonation,
    refreshSession: async () => {
      const user = await AuthService.initializeSession();
      if (user) {
        const session: UserSession = {
          userId: user.id,
          userName: user.name,
          role: user.role,
          barId: user.barId,
          barName: user.barName,
          loginTime: new Date(),
          permissions: getPermissionsByRole(user.role),
          firstLogin: user.first_login ?? false
        };
        setCurrentSession(session);
      }
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};