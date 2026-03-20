import React, { createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, RolePermissions } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { AuthService, LoginResult } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import { CacheManagerService } from '../services/cacheManager.service';
import { OfflineStorage } from '../utils/offlineStorage';
import { networkManager } from '../services/NetworkManager';
import { notificationService } from '../services/NotificationService';
import { setUserContext, clearUserContext } from '../lib/monitoring';

interface AuthContextType {
  currentSession: UserSession | null;
  isAuthenticated: boolean;
  // users: User[]; // Removed as it's not used and not part of AuthContext's core responsibility
  login: (email: string, password: string) => Promise<LoginResult>; // Updated return type
  verifyMfa: (factorId: string, code: string) => Promise<LoginResult>; // New MFA verification function
  logout: () => void;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  refreshSession: () => Promise<void>;
  updateCurrentBar: (barId: string, barName: string, role?: UserRole) => void; // UPDATED: Support role update
  // createUser: (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole) => Promise<User | null>; // Moved out of AuthContext
  // updateUser: (userId: string, updates: Partial<User>) => Promise<void>; // Moved out of AuthContext
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  // 🧹 Nettoyer la session si elle contient des données invalides (ex: ID '1')
  useEffect(() => {
    if (currentSession?.userId === '1') {
      console.warn('[AuthContext] Detected invalid legacy session (ID=1), clearing...');
      setCurrentSession(null);
    }
  }, [currentSession?.userId]);

  // 🔔 Initialiser le service de notifications avec l'utilisateur courant
  useEffect(() => {
    if (currentSession?.userId) {
      notificationService.initForUser(currentSession.userId);
    } else {
      notificationService.clearSession();
    }
  }, [currentSession?.userId]);

  // 🔐 Initialiser la session Supabase RLS au démarrage (une seule fois)
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
          firstLogin: authUser.first_login ?? false,
          hasCompletedOnboarding: authUser.has_completed_onboarding ?? false // Map pending training status
        };
        setCurrentSession(session);
      } else {
        // Si aucune session valide trouvée (ou token expiré), on nettoie
        console.log('[AuthContext] No valid session found during init, clearing state');
        sessionStorage.setItem('session_expired', 'true');
        setCurrentSession(null);
      }
    }).catch(err => {
      console.error('[AuthContext] Failed to initialize Supabase session:', err);

      // 🌐 MODE HORS LIGNE: Garder la session en cache si elle existe
      if (networkManager.getDecision().shouldBlock) {
        console.log('[AuthContext] 📵 Mode hors ligne détecté - conservation de la session en cache');
        // Ne pas effacer la session existante en mode hors ligne
      } else {
        setCurrentSession(null);
      }
    });
    // ⚠️ S'exécuter une seule fois au montage
  }, []);

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
                firstLogin: authUser.first_login ?? false,
                hasCompletedOnboarding: authUser.has_completed_onboarding ?? false
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

  // 🔄 Écouter l'événement custom de token expiré (depuis RootLayout heartbeat)
  useEffect(() => {
    const handleTokenExpired = async () => {
      // ⭐ RÉSILIENCE OFFLINE: Si on est hors-ligne, on ne déconnecte PAS.
      // On garde la session en mémoire pour permettre le travail local (Optimisme Résilient).
      if (networkManager.getDecision().shouldBlock) {
        console.warn('[AuthContext] Token expiré mais conservé (Mode Offline)');
        return;
      }

      console.warn('[AuthContext] 🔴 Token expiré détecté, forçage du logout');
      try {
        await AuthService.logout();
      } catch (err) {
        console.warn('[AuthContext] Erreur lors de la déconnexion Supabase:', err);
      }

      try {
        // 🧹 Purger les caches uniquement si on ne bloque pas les op réseau (confirmé online)
        if (!networkManager.shouldBlockNetworkOps()) {
          console.log('[AuthContext] Purge des caches après token expiré (Online)');
          await CacheManagerService.fullCleanup();
        } else {
          console.warn('[AuthContext] Purge des caches annulée (Offline) pour préserver les données');
        }
      } catch (err) {
        console.error('[AuthContext] Cache cleanup failed:', err);
      } finally {
        // ⭐ CRITICAL: Toujours libérer la session React pour éviter le mode "Zombie"
        setCurrentSession(null);
        console.log('[AuthContext] Session locale libérée (finally)');
      }
    };

    window.addEventListener('token-expired', handleTokenExpired);
    return () => window.removeEventListener('token-expired', handleTokenExpired);
  }, [setCurrentSession]);

  // 🔐 Login avec Supabase Auth (email + password)
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    // 🌐 Vérifier la connexion internet (respecte la grace period — "unstable" ne bloque pas)
    if (networkManager.getDecision().shouldBlock) {
      console.warn('[AuthContext] 📵 Tentative de connexion en mode hors ligne');
      return {
        error: 'Connexion internet requise pour se connecter. Veuillez vérifier votre connexion et réessayer.'
      };
    }

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
          firstLogin: authUser.first_login ?? false,
          hasCompletedOnboarding: authUser.has_completed_onboarding ?? false
        };
        setCurrentSession(session);
        // Set user context for error tracking (Sentry)
        setUserContext(authUser.id, email);

        // Audit log removed for optimization (LOGIN_SUCCESS generates too much noise)
        // auditLogger.log({
        //   event: 'LOGIN_SUCCESS',
        //   severity: 'info',
        //   userId: authUser.id,
        //   userName: authUser.name,
        //   userRole: authUser.role,
        //   barId: session.barId !== 'admin_global' ? session.barId : undefined,
        //   barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
        //   description: `Connexion réussie en tant que ${authUser.role}`,
        //   metadata: { email },
        // });
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
          firstLogin: authUser.first_login ?? false,
          hasCompletedOnboarding: authUser.has_completed_onboarding ?? false
        };
        setCurrentSession(session);
        // Set user context for error tracking (Sentry)
        setUserContext(authUser.id);

        // Audit log removed for optimization (LOGIN_SUCCESS generates too much noise)
        // auditLogger.log({
        //   event: 'LOGIN_SUCCESS',
        //   severity: 'info',
        //   userId: authUser.id,
        //   userName: authUser.name,
        //   userRole: authUser.role,
        //   barId: session.barId !== 'admin_global' ? session.barId : undefined,
        //   barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
        //   description: `Connexion MFA réussie en tant que ${authUser.role}`,
        //   metadata: { userId: authUser.id },
        // });
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
      // Audit log removed for optimization (LOGOUT generates too much noise)
      // auditLogger.log({
      //   event: 'LOGOUT',
      //   severity: 'info',
      //   userId: currentSession.userId,
      //   userName: currentSession.userName,
      //   userRole: currentSession.role,
      //   barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
      //   barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
      //   description: 'Déconnexion',
      // });
    }

    try {
      try {
        await AuthService.logout();
      } catch (err) {
        console.warn('[AuthContext] Erreur lors de la déconnexion Supabase:', err);
      }

      // 🧹 Nettoyer tous les caches avant de fermer la session
      console.log('[AuthContext] Purge des caches avant logout');
      await CacheManagerService.fullCleanup();
    } catch (err) {
      console.error('[AuthContext] Critical error during logout cleanup:', err);
    } finally {
      // 💾 Nettoyer le stockage offline (bars, sélection) SYSTÉMATIQUEMENT
      OfflineStorage.clear();
      // Clear user context from error tracking (Sentry)
      clearUserContext();
      setCurrentSession(null);
    }
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

  const changePassword = useCallback(async (newPassword: string, currentPassword?: string): Promise<void> => {
    if (!currentSession) {
      throw new Error('Session non trouvée');
    }

    try {
      // Changer le mot de passe via AuthService (Supabase Auth)
      await AuthService.changePassword(newPassword, currentPassword);

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

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    try {
      await AuthService.resetPassword(email);
      auditLogger.log({
        event: 'PASSWORD_RESET_REQUESTED',
        severity: 'info',
        userId: email,
        userName: email,
        userRole: 'serveur' as UserRole,
        description: `Demande de réinitialisation de mot de passe pour ${email}.`,
        metadata: { email },
      });
    } catch (error: any) {
      console.error('[AuthContext] Error requesting password reset:', error);
      auditLogger.log({
        event: 'PASSWORD_RESET_REQUEST_FAILED',
        severity: 'warning',
        userId: email,
        userName: email,
        userRole: 'serveur' as UserRole,
        description: `Échec de la demande de réinitialisation pour ${email}.`,
        metadata: { email, error: error.message },
      });
      // Ne pas relancer l'erreur pour des raisons de sécurité
    }
  }, []);

  // Mettre à jour le bar actuel dans la session
  const updateCurrentBar = useCallback((barId: string, barName: string, role?: UserRole) => {
    if (!currentSession) {
      console.warn('[AuthContext] Cannot update bar - no session');
      return;
    }

    console.log('[AuthContext] Updating current bar to:', barId, barName, role ? `with role ${role}` : '(keep role)');

    // Recalculer les permissions si le rôle change
    const newPermissions = role ? getPermissionsByRole(role) : currentSession.permissions;
    const newRole = role || currentSession.role;

    setCurrentSession({
      ...currentSession,
      barId,
      barName,
      role: newRole,
      permissions: newPermissions
    });

    // Sauvegarder dans localStorage pour persistance
    localStorage.setItem('selectedBarId', barId);

    // ✨ FIX CRITIQUE: Mettre à jour l'objet 'auth_user' en cache aussi
    // Sinon au F5, AuthService.initializeSession() reprendra le VIEUX barId stocké dans 'auth_user'
    const cachedUser = AuthService.getCurrentUser();
    if (cachedUser) {
      const updatedUser = {
        ...cachedUser,
        barId,
        barName,
        role: newRole
      };
      localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    }

    auditLogger.log({
      event: 'BAR_SWITCHED',
      severity: 'info',
      userId: currentSession.userId,
      userName: currentSession.userName,
      userRole: newRole,
      barId: barId,
      barName: barName,
      description: `Changement de bar actif vers ${barName} (Rôle: ${newRole})`,
      metadata: {
        previousBarId: currentSession.barId,
        previousBarName: currentSession.barName,
        previousRole: currentSession.role,
        newBarId: barId,
        newBarName: barName,
        newRole: newRole
      },
      relatedEntityId: barId,
      relatedEntityType: 'bar',
    });
  }, [currentSession, setCurrentSession]);

  // const getUserById = useCallback((_userId: string) => {
  //   // TODO: Implémenter avec Supabase
  //   console.warn('[AuthContext] getUserById not yet implemented with Supabase');
  //   return undefined;
  // }, []);


  const value: AuthContextType = {
    currentSession,
    isAuthenticated: !!currentSession,
    // users: [], // Plus de mock users
    login,
    verifyMfa, // Add verifyMfa to context value
    logout,
    hasPermission,
    updateCurrentBar, // NEW: Add updateCurrentBar to context value
    // createUser, // Removed from context value
    // updateUser, // Removed from context value
    changePassword,
    resetPassword,
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
          firstLogin: user.first_login ?? false,
          hasCompletedOnboarding: user.has_completed_onboarding ?? false
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