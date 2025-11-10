import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect } from 'react';
import { useDataStore } from '../hooks/useDataStore';
import { useAuth } from '../context/AuthContext';
import { Bar, BarMember, User, UserRole } from '../types';

interface BarContextType {
  // Bars
  bars: Bar[];
  currentBar: Bar | null;
  userBars: Bar[]; // Bars de l'utilisateur connecté
  
  // Gestion des bars
  createBar: (bar: Omit<Bar, 'id' | 'createdAt' | 'ownerId'>) => Bar | null;
  updateBar: (barId: string, updates: Partial<Bar>) => void;
  switchBar: (barId: string) => void;
  
  // Membres du bar
  barMembers: BarMember[];
  getBarMembers: (barId: string) => (BarMember & { user: User })[];
  addBarMember: (userId: string, role: UserRole) => BarMember | null;
  removeBarMember: (memberId: string) => void;
  updateBarMember: (memberId: string, updates: Partial<BarMember>) => void;
  
  // Helpers
  isOwner: (barId: string) => boolean;
  canAccessBar: (barId: string) => boolean;
}

const BarContext = createContext<BarContextType | undefined>(undefined);

export const useBarContext = () => {
  const context = useContext(BarContext);
  if (!context) {
    throw new Error('useBarContext must be used within a BarProvider');
  }
  return context;
};

// Mock data pour démarrer
const mockBars: Bar[] = [
  {
    id: 'bar1',
    name: 'Bar Demo',
    address: 'Cotonou, Bénin',
    phone: '0197000000',
    ownerId: '1', // Promoteur principal
    createdAt: new Date(),
    isActive: true,
    settings: {
      currency: 'FCFA',
      currencySymbol: ' FCFA',
      timezone: 'Africa/Porto-Novo',
      language: 'fr',
    },
  },
];

const mockBarMembers: BarMember[] = [
  { id: '1', userId: '1', barId: 'bar1', role: 'promoteur', assignedBy: '1', assignedAt: new Date(), isActive: true },
  { id: '2', userId: '2', barId: 'bar1', role: 'gerant', assignedBy: '1', assignedAt: new Date(), isActive: true },
  { id: '3', userId: '3', barId: 'bar1', role: 'serveur', assignedBy: '1', assignedAt: new Date(), isActive: true },
  { id: '4', userId: '4', barId: 'bar1', role: 'serveur', assignedBy: '1', assignedAt: new Date(), isActive: true },
];

export const BarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentSession, hasPermission } = useAuth();
  const [bars, setBars] = useDataStore<Bar[]>('bars', mockBars);
  const [barMembers, setBarMembers] = useDataStore<BarMember[]>('bar-members', mockBarMembers);
  const [currentBarId, setCurrentBarId] = useDataStore<string | null>('current-bar-id', null);
  const [users] = useDataStore<User[]>('bar-users', []);

  // État dérivé
  const [currentBar, setCurrentBar] = useState<Bar | null>(null);
  const [userBars, setUserBars] = useState<Bar[]>([]);

  // Mise à jour du bar actuel
  useEffect(() => {
    if (currentBarId) {
      const bar = bars.find(b => b.id === currentBarId);
      setCurrentBar(bar || null);
    } else if (currentSession) {
      // 🔧 FIX: Prioriser le barId de la session (important pour impersonation)
      if (currentSession.barId && currentSession.barId !== 'admin_global') {
        const sessionBar = bars.find(b => b.id === currentSession.barId);
        if (sessionBar) {
          setCurrentBar(sessionBar);
          setCurrentBarId(sessionBar.id);
          return;
        }
      }

      // Sinon, prendre le premier bar accessible
      const accessibleBars = getUserBars();
      if (accessibleBars.length > 0) {
        setCurrentBar(accessibleBars[0]);
        setCurrentBarId(accessibleBars[0].id);
      }
    }
  }, [currentBarId, bars, currentSession]);

  // Mise à jour des bars de l'utilisateur
  useEffect(() => {
    if (currentSession) {
      setUserBars(getUserBars());
    }
  }, [currentSession, bars, barMembers]);

  // Helpers privés
  const getUserBars = useCallback(() => {
    if (!currentSession) return [];
    
    if (currentSession.role === 'promoteur') {
      // Le promoteur voit tous ses bars
      return bars.filter(bar => bar.ownerId === currentSession.userId);
    } else {
      // Les autres voient seulement leur bar assigné
      const userMemberships = barMembers.filter(
        m => m.userId === currentSession.userId && m.isActive
      );
      return bars.filter(bar => 
        userMemberships.some(m => m.barId === bar.id)
      );
    }
  }, [bars, barMembers, currentSession]);

  // Gestion des bars
  const createBar = useCallback((barData: Omit<Bar, 'id' | 'createdAt' | 'ownerId'> & { ownerId?: string }) => {
    if (!currentSession || !hasPermission('canCreateBars')) return null;

    // Permettre au super admin de spécifier l'ownerId
    const ownerId = barData.ownerId || currentSession.userId;

    const newBar: Bar = {
      ...barData,
      id: `bar_${Date.now()}`,
      ownerId,
      createdAt: new Date(),
    };

    setBars(prev => [...prev, newBar]);

    // Ajouter le propriétaire comme membre promoteur
    const ownerMember: BarMember = {
      id: `member_${Date.now()}`,
      userId: ownerId,
      barId: newBar.id,
      role: 'promoteur',
      assignedBy: currentSession.userId,
      assignedAt: new Date(),
      isActive: true,
    };

    setBarMembers(prev => [...prev, ownerMember]);

    return newBar;
  }, [currentSession, hasPermission, setBars, setBarMembers]);

  const updateBar = useCallback((barId: string, updates: Partial<Bar>) => {
    if (!currentSession || !hasPermission('canManageBarInfo')) return;

    setBars(prev => prev.map(bar =>
      bar.id === barId ? { ...bar, ...updates } : bar
    ));
  }, [currentSession, hasPermission, setBars]);

  const switchBar = useCallback((barId: string) => {
    if (!canAccessBar(barId)) return;
    setCurrentBarId(barId);
  }, []);

  // Gestion des membres
  const getBarMembers = useCallback((barId: string) => {
    const members = barMembers.filter(m => m.barId === barId && m.isActive);
    
    return members.map(member => {
      const user = users.find(u => u.id === member.userId);
      return { ...member, user };
    }).filter(m => m.user) as (BarMember & { user: User })[];
  }, [barMembers, users]);

  const addBarMember = useCallback((userId: string, role: UserRole) => {
    if (!currentSession || !currentBar) return null;
    
    // Vérifier les permissions
    if (role === 'gerant' && !hasPermission('canCreateManagers')) return null;
    if (role === 'serveur' && !hasPermission('canCreateServers')) return null;

    // Vérifier si l'utilisateur n'est pas déjà membre
    const existingMember = barMembers.find(
      m => m.userId === userId && m.barId === currentBar.id && m.isActive
    );
    if (existingMember) return null;

    const newMember: BarMember = {
      id: `member_${Date.now()}`,
      userId,
      barId: currentBar.id,
      role,
      assignedBy: currentSession.userId,
      assignedAt: new Date(),
      isActive: true,
    };

    setBarMembers(prev => [...prev, newMember]);
    return newMember;
  }, [currentSession, currentBar, hasPermission, barMembers, setBarMembers]);

  const removeBarMember = useCallback((memberId: string) => {
    if (!currentSession) return;

    const member = barMembers.find(m => m.id === memberId);
    if (!member) return;

    // Seul le promoteur peut retirer des gérants
    if (member.role === 'gerant' && !hasPermission('canCreateManagers')) return;
    // Gérants et promoteurs peuvent retirer des serveurs
    if (member.role === 'serveur' && !hasPermission('canCreateServers')) return;

    // Désactiver plutôt que supprimer (pour l'historique)
    setBarMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, isActive: false } : m
    ));
  }, [currentSession, hasPermission, barMembers, setBarMembers]);

  const updateBarMember = useCallback((memberId: string, updates: Partial<BarMember>) => {
    if (!currentSession) return;

    setBarMembers(prev => prev.map(member =>
      member.id === memberId ? { ...member, ...updates } : member
    ));
  }, [currentSession, setBarMembers]);

  // Helpers
  const isOwner = useCallback((barId: string) => {
    if (!currentSession) return false;
    const bar = bars.find(b => b.id === barId);
    return bar?.ownerId === currentSession.userId;
  }, [bars, currentSession]);

  const canAccessBar = useCallback((barId: string) => {
    if (!currentSession) return false;
    
    // Le promoteur accède à tous ses bars
    if (isOwner(barId)) return true;
    
    // Les autres accèdent seulement à leur bar assigné
    return barMembers.some(
      m => m.userId === currentSession.userId && 
           m.barId === barId && 
           m.isActive
    );
  }, [currentSession, barMembers, isOwner]);

  const value: BarContextType = {
    bars,
    currentBar,
    userBars,
    createBar,
    updateBar,
    switchBar,
    barMembers,
    getBarMembers,
    addBarMember,
    removeBarMember,
    updateBarMember,
    isOwner,
    canAccessBar,
  };

  return (
    <BarContext.Provider value={value}>
      {children}
    </BarContext.Provider>
  );
};