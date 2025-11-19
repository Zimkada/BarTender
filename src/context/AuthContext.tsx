import React, { createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, User, RolePermissions } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { AuthService } from '../services/supabase/auth.service';

interface AuthContextType {
  currentSession: UserSession | null;
  isAuthenticated: boolean;
  users: User[];
  login: (username: string, password: string, barId?: string, role?: UserRole) => Promise<UserSession | null>;
  logout: () => void;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  createUser: (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole) => Promise<User | null>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  changePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<void>;
  getUserById: (userId: string) => User | undefined;
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

  // 🔐 Initialiser la session Supabase RLS au démarrage
  useEffect(() => {
    AuthService.initializeSession().catch(err => {
      console.error('[AuthContext] Failed to initialize Supabase session:', err);
    });
  }, []);

  // 🔐 Login avec Supabase (custom auth)
  const login = useCallback(async (username: string, password: string, _barId?: string, _role?: UserRole) => {
    try {
      // Utiliser l'AuthService pour se connecter
      const authUser = await AuthService.login({ username, password });

      // Créer la session locale
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

      // Log connexion réussie
      auditLogger.log({
        event: 'LOGIN_SUCCESS',
        severity: 'info',
        userId: authUser.id,
        userName: authUser.name,
        userRole: authUser.role,
        barId: session.barId !== 'admin_global' ? session.barId : undefined,
        barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
        description: `Connexion réussie en tant que ${authUser.role}`,
        metadata: { username },
      });

      return session;
    } catch (error: any) {
      console.error('[AuthContext] Login failed:', error);

      // Log tentative de connexion échouée
      auditLogger.log({
        event: 'LOGIN_FAILED',
        severity: 'warning',
        userId: username,
        userName: username,
        userRole: 'serveur' as UserRole, // Default role for logging
        description: `Tentative de connexion échouée: ${error.message}`,
        metadata: { username, error: error.message },
      });

      return null;
    }
  }, [setCurrentSession]);

  const logout = useCallback(() => {
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

    setCurrentSession(null);
  }, [currentSession, setCurrentSession]);

  const hasPermission = useCallback((permission: keyof RolePermissions) => {
    return currentSession?.permissions?.[permission] ?? false;
  }, [currentSession]);

  const createUser = useCallback(async (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole): Promise<User | null> => {
    if (!currentSession) return null;

    if (role === 'gerant' && !hasPermission('canCreateManagers')) return null;
    if (role === 'serveur' && !hasPermission('canCreateServers')) return null;

    try {
      // Créer via Supabase AuthService
      const newUser = await AuthService.signup(
        {
          username: userData.username,
          password: userData.password || 'TempPassword123!', // Mot de passe temporaire
          name: userData.name,
          phone: userData.phone,
        },
        currentSession.barId,
        role as 'gerant' | 'serveur'
      );

      const user: User = {
        id: newUser.id,
        username: newUser.username,
        password: '', // Pas exposé
        name: newUser.name,
        phone: newUser.phone,
        email: undefined,
        createdAt: new Date(newUser.created_at),
        isActive: newUser.is_active,
        firstLogin: newUser.first_login,
        lastLoginAt: newUser.last_login_at ? new Date(newUser.last_login_at) : undefined,
        createdBy: currentSession.userId,
      };

      // Log création utilisateur
      auditLogger.log({
        event: 'USER_CREATED',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
        barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
        description: `Création utilisateur: ${user.name} (${role})`,
        metadata: {
          newUserId: user.id,
          newUserName: user.name,
          newUserRole: role,
          newUserUsername: user.username,
        },
        relatedEntityId: user.id,
        relatedEntityType: 'user',
      });

      return user;
    } catch (error) {
      console.error('[AuthContext] Error creating user:', error);
      return null;
    }
  }, [currentSession, hasPermission]);

  const updateUser = useCallback(async (userId: string, updates: Partial<User>): Promise<void> => {
    if (!currentSession) return;

    try {
      // Convertir les updates au format Supabase
      const supabaseUpdates: any = {};
      if (updates.name) supabaseUpdates.name = updates.name;
      if (updates.phone) supabaseUpdates.phone = updates.phone;
      if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;

      const updatedUser = await AuthService.updateProfile(userId, supabaseUpdates);

      // Log mise à jour utilisateur
      auditLogger.log({
        event: 'USER_UPDATED',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
        barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
        description: `Mise à jour utilisateur: ${updatedUser.name}`,
        metadata: {
          targetUserId: userId,
          targetUserName: updatedUser.name,
          updates: updates,
        },
        relatedEntityId: userId,
        relatedEntityType: 'user',
      });
    } catch (error) {
      console.error('[AuthContext] Error updating user:', error);
    }
  }, [currentSession]);

  const changePassword = useCallback(async (userId: string, oldPassword: string, newPassword: string): Promise<void> => {
    if (!currentSession) {
      throw new Error('Session non trouvée');
    }

    try {
      // Changer le mot de passe via AuthService
      await AuthService.changePassword(userId, oldPassword, newPassword);

      // Mettre à jour firstLogin dans la session si c'est l'utilisateur courant
      if (userId === currentSession.userId) {
        setCurrentSession({
          ...currentSession,
          firstLogin: false
        });
      }

      const isSelfChange = userId === currentSession.userId;

      // Log changement mot de passe
      auditLogger.log({
        event: 'PASSWORD_RESET',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
        barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
        description: isSelfChange
          ? `${currentSession.userName} a modifié son propre mot de passe`
          : `${currentSession.userName} a réinitialisé le mot de passe`,
        metadata: {
          targetUserId: userId,
          isSelfChange,
          changedBy: currentSession.userName,
        },
        relatedEntityId: userId,
        relatedEntityType: 'user',
      });
    } catch (error: any) {
      console.error('[AuthContext] Error changing password:', error);
      throw new Error(error.message || 'Erreur lors du changement de mot de passe');
    }
  }, [currentSession, setCurrentSession]);

  const getUserById = useCallback((_userId: string) => {
    // TODO: Implémenter avec Supabase
    console.warn('[AuthContext] getUserById not yet implemented with Supabase');
    return undefined;
  }, []);

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
    users: [], // Plus de mock users
    login,
    logout,
    hasPermission,
    createUser,
    updateUser,
    changePassword,
    getUserById,
    isImpersonating,
    originalSession,
    impersonate,
    stopImpersonation,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};