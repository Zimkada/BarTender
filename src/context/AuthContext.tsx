import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { UserSession, UserRole, getPermissionsByRole, User, RolePermissions } from '../types';

// Mock users étendu pour multi-tenant
const mockUsers: User[] = [
  {
    id: 'super_admin_001',
    username: 'admin',
    password: 'Admin@2025',
    name: 'Super Administrateur',
    phone: '97000000',
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
    phone: '97000001',
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
    phone: '97000002', 
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
    phone: '97000003', 
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
    phone: '97000004', 
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
      return session;
    }
    return null;
  }, [users, setCurrentSession, setUsers]);

  const logout = useCallback(() => {
    setCurrentSession(null);
  }, [setCurrentSession]);

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
    console.log(`[Impersonation] Admin impersonating ${targetUser.name} (${role})`);
  }, [currentSession, users, setCurrentSession, setOriginalSession, setIsImpersonating]);

  // Stop impersonation: Revenir à la session super admin
  const stopImpersonation = useCallback(() => {
    if (!isImpersonating || !originalSession) {
      console.error('Not currently impersonating');
      return;
    }

    // Restore session originale
    setCurrentSession(originalSession);
    setOriginalSession(null);
    setIsImpersonating(false);

    console.log('[Impersonation] Returned to admin session');
  }, [isImpersonating, originalSession, setCurrentSession, setOriginalSession, setIsImpersonating]);

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