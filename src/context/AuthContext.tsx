import React, { createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, RolePermissions } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { AuthService, LoginResult } from '../services/supabase/auth.service'; // Import LoginResult
import { supabase } from '../lib/supabase';

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
  impersonate: (userId: string, barId: string, role: UserRole) => void;
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
          firstLogin: authUser.first_login
        };
        setCurrentSession(session);
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
                firstLogin: authUser.first_login
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
          firstLogin: authUser.first_login
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
          firstLogin: authUser.first_login
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

  // Impersonation: Se connecter en tant qu'un autre user (pour super admin)
  const impersonate = useCallback((_userId: string, _barId: string, _role: UserRole) => {
    // TODO: Implémenter avec Supabase
    console.warn('[AuthContext] Impersonation not yet implemented with Supabase');
  }, []);

  // Stop impersonation: Revenir à la session super admin
  const stopImpersonation = useCallback(() => {
    if (!isImpersonating || !originalSession) {
      console.error('Not currently impersonating');
      return;
    }

    // Log impersonation stop (avant de changer session)
    if (currentSession) {
      auditLogger.log({
        event: 'IMPERSONATE_STOP',
        severity: 'info',
        userId: originalSession.userId,
        userName: originalSession.userName,
        userRole: originalSession.role,
        barId: currentSession.barId,
        description: `Impersonation terminée: Retour au compte Super Admin`,
        metadata: {
          impersonatedUserId: currentSession.userId,
          impersonatedUserName: currentSession.userName,
          impersonatedRole: currentSession.role,
        },
      });
    }

    // Restore session originale
    setCurrentSession(originalSession);
    setOriginalSession(null);
    setIsImpersonating(false);

    console.log('[Impersonation] Returned to admin session');
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
          firstLogin: user.first_login
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