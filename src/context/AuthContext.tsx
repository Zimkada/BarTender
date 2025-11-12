import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, User, RolePermissions } from '../types';
import { auditLogger } from '../services/AuditLogger';

// Mock users étendu pour multi-tenant
const mockUsers: User[] = [
  {
    id: 'super_admin_001',
    username: 'admin',
    password: 'Admin@2025',
    name: 'Super Administrateur',
    phone: '0197000000',
    email: 'admin@bartender.bj',
    createdAt: new Date(),
    isActive: true,
    firstLogin: false,
    createdBy: undefined
  },
  {
    id: '1',
    username: 'promoteur',
    password: '1234',
    name: 'Promoteur Principal',
    phone: '0197000001',
    email: 'promoteur@bar.com',
    createdAt: new Date(),
    isActive: true,
    firstLogin: false,
    createdBy: undefined
  },
  { 
    id: '2', 
    username: 'gerant1',
    password: '1234',
    name: 'Gérant Bar Demo', 
    phone: '0197000002', 
    email: 'gerant@bar.com', 
    createdAt: new Date(), 
    isActive: true,
    firstLogin: false,
    createdBy: '1'
  },
  { 
    id: '3', 
    username: 'serveur1',
    password: '1234',
    name: 'Serveur 1', 
    phone: '0197000003', 
    createdAt: new Date(), 
    isActive: true,
    firstLogin: false,
    createdBy: '2'
  },
  { 
    id: '4', 
    username: 'serveur2',
    password: '1234',
    name: 'Serveur 2', 
    phone: '0197000004', 
    createdAt: new Date(), 
    isActive: true,
    firstLogin: false,
    createdBy: '2'
  },
];

interface AuthContextType {
  currentSession: UserSession | null;
  isAuthenticated: boolean;
  users: User[];
  login: (username: string, password: string, barId: string, role: UserRole) => UserSession | null;
  logout: () => void;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  createUser: (userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole) => User | null;
  updateUser: (userId: string, updates: Partial<User>) => void;
  changePassword: (userId: string, newPassword: string) => void;
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
  const [users, setUsers] = useDataStore<User[]>('bar-users', mockUsers);
  const [originalSession, setOriginalSession] = useDataStore<UserSession | null>('bar-original-session', null);
  const [isImpersonating, setIsImpersonating] = useDataStore<boolean>('bar-is-impersonating', false);

  // 🔒 GARANTIR que le super admin existe toujours (fix déploiement Vercel)
  React.useEffect(() => {
    const superAdmin = users.find(u => u.id === 'super_admin_001');
    if (!superAdmin) {
      console.log('[AuthContext] Super admin missing, re-adding...');
      const superAdminUser: User = {
        id: 'super_admin_001',
        username: 'admin',
        password: 'Admin@2025',
        name: 'Super Administrateur',
        phone: '0197000000',
        email: 'admin@bartender.bj',
        createdAt: new Date(),
        isActive: true,
        firstLogin: false,
        createdBy: undefined
      };
      setUsers([superAdminUser, ...users]);
    }
  }, []); // Exécuté une seule fois au mount

  const login = useCallback((username: string, password: string, barId: string, role: UserRole) => {
    const user = users.find(u =>
      u.username === username &&
      u.password === password &&
      u.isActive
    );

    if (user) {
      // Super admin n'a pas besoin de bar spécifique
      const session: UserSession = {
        userId: user.id,
        userName: user.name,
        role: role,
        barId: role === 'super_admin' ? 'admin_global' : barId,
        barName: role === 'super_admin' ? 'Admin Dashboard' : 'Bar Demo',
        loginTime: new Date(),
        permissions: getPermissionsByRole(role)
      };

      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, lastLoginAt: new Date() } : u
      ));

      setCurrentSession(session);

      // Log connexion réussie
      auditLogger.log({
        event: 'LOGIN_SUCCESS',
        severity: 'info',
        userId: user.id,
        userName: user.name,
        userRole: role,
        barId: session.barId !== 'admin_global' ? session.barId : undefined,
        barName: session.barName !== 'Admin Dashboard' ? session.barName : undefined,
        description: `Connexion réussie en tant que ${role}`,
        metadata: { username },
      });

      return session;
    }

    // Log tentative de connexion échouée
    auditLogger.log({
      event: 'LOGIN_FAILED',
      severity: 'warning',
      userId: username, // On n'a pas l'ID, on met le username
      userName: username,
      userRole: role,
      barId: barId !== 'admin_global' ? barId : undefined,
      description: `Tentative de connexion échouée (identifiants invalides)`,
      metadata: { username, attemptedRole: role },
    });

    return null;
  }, [users, setCurrentSession, setUsers]);

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

  const createUser = useCallback((userData: Omit<User, 'id' | 'createdAt' | 'createdBy'>, role: UserRole) => {
    if (!currentSession) return null;

    if (role === 'gerant' && !hasPermission('canCreateManagers')) return null;
    if (role === 'serveur' && !hasPermission('canCreateServers')) return null;

    const newUser: User = {
      ...userData,
      id: `user_${Date.now()}`,
      createdAt: new Date(),
      createdBy: currentSession.userId,
      isActive: true,
      firstLogin: true,
    };

    setUsers(prev => [...prev, newUser]);

    // Log création utilisateur
    auditLogger.log({
      event: 'USER_CREATED',
      severity: 'info',
      userId: currentSession.userId,
      userName: currentSession.userName,
      userRole: currentSession.role,
      barId: currentSession.barId !== 'admin_global' ? currentSession.barId : undefined,
      barName: currentSession.barName !== 'Admin Dashboard' ? currentSession.barName : undefined,
      description: `Création utilisateur: ${newUser.name} (${role})`,
      metadata: {
        newUserId: newUser.id,
        newUserName: newUser.name,
        newUserRole: role,
        newUserUsername: newUser.username,
      },
      relatedEntityId: newUser.id,
      relatedEntityType: 'user',
    });

    return newUser;
  }, [currentSession, hasPermission, setUsers]);

  const updateUser = useCallback((userId: string, updates: Partial<User>) => {
    if (!currentSession) return;
    
    setUsers(prev => prev.map(user => 
      user.id === userId ? { ...user, ...updates } : user
    ));
  }, [currentSession, setUsers]);

  const changePassword = useCallback((userId: string, newPassword: string) => {
    setUsers(prev => prev.map(user => 
      user.id === userId 
        ? { ...user, password: newPassword, firstLogin: false } 
        : user
    ));
  }, [setUsers]);

  const getUserById = useCallback((userId: string) => {
    return users.find(u => u.id === userId);
  }, [users]);

  // Impersonation: Se connecter en tant qu'un autre user (pour super admin)
  const impersonate = useCallback((userId: string, barId: string, role: UserRole) => {
    if (!currentSession) return;

    // Seulement le super admin peut impersonate
    if (currentSession.role !== 'super_admin') {
      console.error('Only super admin can impersonate');
      return;
    }

    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) {
      console.error('Target user not found');
      return;
    }

    // Sauvegarder la session originale (super admin)
    setOriginalSession(currentSession);
    setIsImpersonating(true);

    // Créer nouvelle session pour l'user ciblé
    const impersonatedSession: UserSession = {
      userId: targetUser.id,
      userName: targetUser.name,
      role: role,
      barId: barId,
      barName: 'Bar Impersonated', // Will be updated by BarContext
      loginTime: new Date(),
      permissions: getPermissionsByRole(role),
    };

    setCurrentSession(impersonatedSession);

    // Log impersonation start
    auditLogger.log({
      event: 'IMPERSONATE_START',
      severity: 'warning',
      userId: currentSession.userId,
      userName: currentSession.userName,
      userRole: currentSession.role,
      barId: barId,
      description: `Impersonation démarrée: Admin se connecte en tant que ${targetUser.name} (${role})`,
      metadata: {
        targetUserId: targetUser.id,
        targetUserName: targetUser.name,
        targetRole: role,
        targetBarId: barId,
      },
      relatedEntityId: targetUser.id,
      relatedEntityType: 'user',
    });

    console.log(`[Impersonation] Admin impersonating ${targetUser.name} (${role})`);
  }, [currentSession, users, setCurrentSession, setOriginalSession, setIsImpersonating]);

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
    users,
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