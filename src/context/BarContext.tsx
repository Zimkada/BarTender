import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bar, BarMember, User, UserRole } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { BarsService } from '../services/supabase/bars.service';
import { AuthService } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type BarMemberRow = Database['public']['Tables']['bar_members']['Row'];
type BarMemberInsert = Database['public']['Tables']['bar_members']['Insert'];
type BarMemberUpdate = Database['public']['Tables']['bar_members']['Update'];

interface BarContextType {
  // Bars
  bars: Bar[];
  currentBar: Bar | null;
  userBars: Bar[]; // Bars de l'utilisateur connecté
  loading: boolean;

  // Gestion des bars
  createBar: (bar: Omit<Bar, 'id' | 'createdAt' | 'ownerId'> & { ownerId?: string }) => Promise<Bar | null>;
  updateBar: (barId: string, updates: Partial<Bar>) => Promise<void>;
  switchBar: (barId: string) => void;

  // Membres du bar
  barMembers: BarMember[];
  getBarMembers: (barId: string) => Promise<(BarMember & { user: User })[]>;
  addBarMember: (userId: string, role: UserRole) => Promise<BarMember | null>;
  removeBarMember: (memberId: string) => Promise<void>;
  updateBarMember: (memberId: string, updates: Partial<BarMember>) => Promise<void>;

  // Helpers
  isOwner: (barId: string) => boolean;
  canAccessBar: (barId: string) => boolean;
  refreshBars: () => Promise<void>;
}

const BarContext = createContext<BarContextType | undefined>(undefined);

export const useBarContext = () => {
  const context = useContext(BarContext);
  if (!context) {
    throw new Error('useBarContext must be used within a BarProvider');
  }
  return context;
};

export const BarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentSession, hasPermission, isImpersonating } = useAuth();
  const [bars, setBars] = useState<Bar[]>([]);
  const [barMembers, setBarMembers] = useState<BarMember[]>([]);
  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // État dérivé
  const [currentBar, setCurrentBar] = useState<Bar | null>(null);
  const [userBars, setUserBars] = useState<Bar[]>([]);

  // Fonction pour charger les bars depuis Supabase
  const refreshBars = useCallback(async () => {
    if (!currentSession) {
      setBars([]);
      setUserBars([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      if (currentSession.role === 'super_admin') {
        // Super admin voit tous les bars
        const allBars = await BarsService.getAllBars();
        const mappedBars: Bar[] = allBars.map(b => ({
          id: b.id,
          name: b.name,
          ownerId: b.owner_id,
          address: b.address || undefined,
          phone: b.phone || undefined,
          logoUrl: b.logo_url || undefined,
          settings: (b.settings as any) || {
            currency: 'FCFA',
            currencySymbol: ' FCFA',
            timezone: 'Africa/Porto-Novo',
            language: 'fr',
          },
          isActive: b.is_active,
          closingHour: (b as any).closing_hour ?? 6,
          createdAt: new Date(b.created_at),
        }));
        setBars(mappedBars);
        setUserBars(mappedBars);
      } else {
        // Les autres utilisateurs voient seulement leurs bars
        if (currentSession.userId === '1') {
          console.warn('[BarContext] Skipping bar fetch for invalid user ID 1');
          setBars([]);
          setUserBars([]);
          setLoading(false);
          return;
        }
        const userBarsData = await BarsService.getMyBars();
        const mappedBars: Bar[] = userBarsData.map(b => ({
          id: b.id,
          name: b.name,
          ownerId: b.owner_id,
          address: b.address || undefined,
          phone: b.phone || undefined,
          logoUrl: b.logo_url || undefined,
          settings: (b.settings as any) || {
            currency: 'FCFA',
            currencySymbol: ' FCFA',
            timezone: 'Africa/Porto-Novo',
            language: 'fr',
          },
          isActive: b.is_active,
          closingHour: (b as any).closing_hour ?? 6,
          createdAt: new Date(b.created_at),
        }));
        setBars(mappedBars);
        setUserBars(mappedBars);
      }

      // Charger les membres du bar courant si on en a un
      if (currentSession.barId && currentSession.barId !== 'admin_global') {
        const members = await AuthService.getBarMembers(currentSession.barId, isImpersonating ? currentSession.userId : undefined);
        const mappedMembers: BarMember[] = members.map(m => ({
          id: `${currentSession.barId}_${m.id}`, // Générer un ID unique pour le membership
          userId: m.id, // L'ID utilisateur
          barId: currentSession.barId,
          role: m.role as UserRole,
          assignedBy: '', // Pas retourné par l'API
          assignedAt: new Date(m.joined_at),
          isActive: m.member_is_active,
          user: {
            id: m.id,
            username: m.username,
            password: '', // Pas exposé
            name: m.name,
            phone: m.phone,
            email: m.email,
            createdAt: new Date(m.created_at),
            isActive: m.is_active,
            firstLogin: m.first_login,
            avatarUrl: m.avatar_url || undefined,
            lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
            createdBy: undefined,
          }
        }));
        setBarMembers(mappedMembers);
      }
    } catch (error) {
      console.error('[BarContext] Error loading bars:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  // Charger les bars au démarrage et quand la session change
  useEffect(() => {
    refreshBars();
  }, [refreshBars]);

  // Helper pour obtenir les bars accessibles
  const getUserBars = useCallback(() => {
    return userBars;
  }, [userBars]);

  // Mise à jour du bar actuel
  useEffect(() => {
    if (!currentSession) {
      setCurrentBar(null);
      setCurrentBarId(null);
      return;
    }

    // Prioriser le barId de la session
    if (currentSession.barId && currentSession.barId !== 'admin_global') {
      const sessionBar = bars.find(b => b.id === currentSession.barId);
      if (sessionBar) {
        setCurrentBar(sessionBar);
        setCurrentBarId(sessionBar.id);
        return;
      }
    }

    // Si currentBarId est défini manuellement (via switchBar), l'utiliser
    if (currentBarId) {
      const bar = bars.find(b => b.id === currentBarId);
      if (bar) {
        const accessibleBars = getUserBars();
        if (accessibleBars.some(b => b.id === currentBarId)) {
          setCurrentBar(bar);
          return;
        }
      }
    }

    // Essayer de restaurer depuis localStorage si le promoteur a plusieurs bars
    const accessibleBars = getUserBars();
    if (accessibleBars.length > 1) {
      const savedBarId = localStorage.getItem('selectedBarId');
      if (savedBarId && accessibleBars.some(b => b.id === savedBarId)) {
        const savedBar = bars.find(b => b.id === savedBarId);
        if (savedBar) {
          setCurrentBar(savedBar);
          setCurrentBarId(savedBar.id);
          return;
        }
      }
    }

    // Sinon, prendre le premier bar accessible
    if (accessibleBars.length > 0) {
      setCurrentBar(accessibleBars[0]);
      setCurrentBarId(accessibleBars[0].id);
    } else {
      setCurrentBar(null);
      setCurrentBarId(null);
    }
  }, [currentBarId, bars, currentSession, getUserBars]);

  // Gestion des bars
  const createBar = useCallback(async (barData: Omit<Bar, 'id' | 'createdAt' | 'ownerId'> & { ownerId?: string }) => {
    if (!currentSession || !hasPermission('canCreateBars')) return null;

    try {
      const ownerId = barData.ownerId || currentSession.userId;

      const newBarData = {
        name: barData.name,
        owner_id: ownerId,
        address: barData.address,
        phone: barData.phone,
        settings: barData.settings,
        closing_hour: barData.closingHour,
      };

      const createdBar = await BarsService.createBar(newBarData);

      const newBar: Bar = {
        id: createdBar.id,
        name: createdBar.name,
        ownerId: createdBar.owner_id,
        address: createdBar.address || undefined,
        phone: createdBar.phone || undefined,
        settings: (createdBar.settings as any) || barData.settings,
        isActive: createdBar.is_active,
        closingHour: (createdBar as any).closing_hour ?? 6,
        createdAt: new Date(createdBar.created_at),
      };

      // Rafraîchir la liste des bars
      await refreshBars();

      // Log création bar
      auditLogger.log({
        event: 'BAR_CREATED',
        severity: 'info',
        userId: currentSession.userId,
        userName: currentSession.userName,
        userRole: currentSession.role,
        barId: newBar.id,
        barName: newBar.name,
        description: `Création bar: ${newBar.name}`,
        metadata: {
          barAddress: newBar.address,
          barPhone: newBar.phone,
          ownerId: ownerId,
          createdByRole: currentSession.role,
        },
        relatedEntityId: newBar.id,
        relatedEntityType: 'bar',
      });

      return newBar;
    } catch (error) {
      console.error('[BarContext] Error creating bar:', error);
      return null;
    }
  }, [currentSession, hasPermission, refreshBars]);

  const updateBar = useCallback(async (barId: string, updates: Partial<Bar>) => {
    if (!currentSession || !hasPermission('canManageBarInfo')) return;

    try {
      const oldBar = bars.find(b => b.id === barId);

      // Mapper les updates au format Supabase
      const supabaseUpdates: any = {};
      if (updates.name) supabaseUpdates.name = updates.name;
      if (updates.address) supabaseUpdates.address = updates.address;
      if (updates.phone) supabaseUpdates.phone = updates.phone;
      if (updates.settings) supabaseUpdates.settings = updates.settings;
      if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;
      if (updates.closingHour !== undefined) supabaseUpdates.closing_hour = updates.closingHour;

      await BarsService.updateBar(barId, supabaseUpdates);

      // Rafraîchir la liste
      await refreshBars();

      // Log mise à jour bar
      if (oldBar) {
        auditLogger.log({
          event: 'BAR_UPDATED',
          severity: 'info',
          userId: currentSession.userId,
          userName: currentSession.userName,
          userRole: currentSession.role,
          barId: barId,
          barName: oldBar.name,
          description: `Mise à jour bar: ${oldBar.name}`,
          metadata: {
            updates: updates,
            oldValues: { name: oldBar.name, address: oldBar.address, phone: oldBar.phone },
          },
          relatedEntityId: barId,
          relatedEntityType: 'bar',
        });
      }
    } catch (error) {
      console.error('[BarContext] Error updating bar:', error);
    }
  }, [currentSession, hasPermission, bars, refreshBars]);

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

  const switchBar = useCallback((barId: string) => {
    if (!canAccessBar(barId)) return;
    setCurrentBarId(barId);
  }, [canAccessBar]);

  // Gestion des membres
  const getBarMembers = useCallback(async (barId: string): Promise<(BarMember & { user: User })[]> => {
    try {
      const members = await AuthService.getBarMembers(barId, isImpersonating ? currentSession?.userId : undefined);

      return members.map(m => ({
        id: `${barId}_${m.id}`, // Générer un ID unique pour le membership
        userId: m.id, // L'ID utilisateur
        barId: barId,
        role: m.role as UserRole,
        assignedBy: '',
        assignedAt: new Date(m.joined_at),
        isActive: m.member_is_active,
        user: {
          id: m.id,
          username: m.username,
          password: '', // Pas exposé
          name: m.name,
          phone: m.phone,
          email: m.email,
          createdAt: new Date(m.created_at),
          isActive: m.is_active,
          firstLogin: m.first_login,
          avatarUrl: m.avatar_url || undefined,
          lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
          createdBy: undefined,
        }
      }));
    } catch (error) {
      console.error('[BarContext] Error loading bar members:', error);
      return [];
    }
  }, []);

  const addBarMember = useCallback(async (userId: string, role: UserRole): Promise<BarMember | null> => {
    if (!currentSession || !currentBar) return null;

    // Vérifier les permissions
    if (role === 'gerant' && !hasPermission('canCreateManagers')) return null;
    if (role === 'serveur' && !hasPermission('canCreateServers')) return null;

    try {
      // Ajouter via Supabase
      const insertData: BarMemberInsert = {
        user_id: userId,
        bar_id: currentBar.id,
        role: role,
        assigned_by: currentSession.userId,
        is_active: true,
      };

      const { data, error } = await (supabase as any)
        .from('bar_members')
        .insert(insertData)
        .select()
        .single();

      if (error || !data) {
        console.error('[BarContext] Error adding member:', error);
        return null;
      }

      const memberData = data as BarMemberRow;
      const newMember: BarMember = {
        id: memberData.id,
        userId: memberData.user_id,
        barId: memberData.bar_id,
        role: memberData.role as UserRole,
        assignedBy: memberData.assigned_by || currentSession.userId,
        assignedAt: new Date(memberData.joined_at),
        isActive: memberData.is_active,
      };

      // Rafraîchir les membres
      setBarMembers(prev => [...prev, newMember]);

      return newMember;
    } catch (error) {
      console.error('[BarContext] Error adding member:', error);
      return null;
    }
  }, [currentSession, currentBar, hasPermission]);

  const removeBarMember = useCallback(async (memberId: string) => {
    if (!currentSession) return;

    try {
      const member = barMembers.find(m => m.id === memberId);
      if (!member) return;

      // Seul le promoteur peut retirer des gérants
      if (member.role === 'gerant' && !hasPermission('canCreateManagers')) return;
      // Gérants et promoteurs peuvent retirer des serveurs
      if (member.role === 'serveur' && !hasPermission('canCreateServers')) return;

      // Désactiver via Supabase
      const updateData: BarMemberUpdate = { is_active: false };
      await (supabase as any)
        .from('bar_members')
        .update(updateData)
        .eq('id', memberId);

      // Mettre à jour localement
      setBarMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, isActive: false } : m
      ));
    } catch (error) {
      console.error('[BarContext] Error removing member:', error);
    }
  }, [currentSession, hasPermission, barMembers]);

  const updateBarMember = useCallback(async (memberId: string, updates: Partial<BarMember>) => {
    if (!currentSession) return;

    try {
      // Mapper les updates au format Supabase
      const supabaseUpdates: BarMemberUpdate = {};
      if (updates.role) supabaseUpdates.role = updates.role;
      if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;

      await (supabase as any)
        .from('bar_members')
        .update(supabaseUpdates)
        .eq('id', memberId);

      // Mettre à jour localement
      setBarMembers(prev => prev.map(member =>
        member.id === memberId ? { ...member, ...updates } : member
      ));
    } catch (error) {
      console.error('[BarContext] Error updating member:', error);
    }
  }, [currentSession]);

  const value: BarContextType = {
    bars,
    currentBar,
    userBars,
    loading,
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
    refreshBars,
  };

  return (
    <BarContext.Provider value={value}>
      {children}
    </BarContext.Provider>
  );
};
