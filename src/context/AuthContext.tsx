import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { UserSession, UserRole, getPermissionsByRole, User, RolePermissions } from '../types';

// Mock users étendu pour multi-tenant
const mockUsers: User[] = [
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
  const [currentSession, setCurrentSession] = useLocalStorage<UserSession | null>('bar-current-session', null);
  const [users, setUsers] = useLocalStorage<User[]>('bar-users', mockUsers);

  const login = useCallback((username: string, password: string, barId: string, role: UserRole) => {
    const user = users.find(u => 
      u.username === username && 
      u.password === password && 
      u.isActive
    );
    
    if (user) {
      const session: UserSession = {
        userId: user.id,
        userName: user.name,
        role: role,
        barId: barId,
        barName: 'Bar Demo',
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};