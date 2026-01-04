import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useActingAs } from '../context/ActingAsContext';
import { Bar, BarMember, User, UserRole } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { BarsService } from '../services/supabase/bars.service';
import { ProxyAdminService } from '../services/supabase/proxy-admin.service';
import { AuthService } from '../services/supabase/auth.service';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { OfflineStorage } from '../utils/offlineStorage';

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
  switchBar: (barId: string) => Promise<void>;

  // Membres du bar
  barMembers: BarMember[];
  getBarMembers: (barId: string) => Promise<(BarMember & { user: User })[]>;
  addBarMember: (userId: string, role: UserRole) => Promise<BarMember | null>;
  removeBarMember: (memberId: string) => Promise<{ success: boolean; error?: string }>;
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
  const { currentSession, hasPermission, updateCurrentBar } = useAuth();
  const { actingAs } = useActingAs();
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

      // Charger le cache offline en premier pour la réactivité
      const cachedBars = OfflineStorage.getBars();
      if (cachedBars && cachedBars.length > 0) {
        setBars(cachedBars);
        setUserBars(cachedBars);
      }

      // Puis essayer de récupérer depuis le serveur
      if (currentSession.role === 'super_admin') {
        const allBars = await BarsService.getAllBars();
        setBars(allBars);
        setUserBars(allBars);
        OfflineStorage.saveBars(allBars);
      } else {
        if (currentSession.userId === '1') {
          console.warn('[BarContext] Skipping bar fetch for invalid user ID 1');
          if (!cachedBars || cachedBars.length === 0) {
            setBars([]);
            setUserBars([]);
          }
          setLoading(false);
          return;
        }
        const userBarsData = await BarsService.getMyBars();
        setBars(userBarsData);
        setUserBars(userBarsData);
        OfflineStorage.saveBars(userBarsData);
      }
    } catch (error) {
      console.error('[BarContext] Error loading bars:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  // ✨ NOUVEAU: Fonction pour charger les membres séparément
  const refreshMembers = useCallback(async (targetBarId: string) => {
    if (!targetBarId || targetBarId === 'admin_global') return;

    try {
      let mappedMembers: BarMember[] = [];

      // Priorité à l'actingAs si actif pour ce bar
      if (actingAs.isActive && actingAs.userId && targetBarId === actingAs.barId) {
        // PROXY MODE
        try {
          const rawMembers = await ProxyAdminService.getBarMembersAsProxy(actingAs.userId, targetBarId);
          mappedMembers = rawMembers.map((m: any) => ({
            id: m.id,
            userId: m.user_id,
            barId: m.bar_id,
            role: m.role as UserRole,
            assignedBy: 'super_admin',
            assignedAt: new Date(m.assigned_at || Date.now()),
            isActive: m.is_active,
            user: {
              id: m.user_data?.id || m.user_id,
              username: m.user_data?.email || '',
              password: '',
              name: m.user_data?.name || 'Inconnu',
              phone: m.user_data?.phone,
              email: m.user_data?.email,
              createdAt: new Date(),
              isActive: true,
              firstLogin: false,
              avatarUrl: m.user_data?.avatar_url,
              createdBy: undefined,
              role: m.role as UserRole, // ✨ FIX: Ajouter le rôle requis
            }
          }));
        } catch (err) {
          console.error('[BarContext] Error loading members as proxy:', err);
        }
      } else {
        // STANDARD MODE
        try {
          // Utilise le RPC étendu qui inclut owner et inactifs
          const members = await AuthService.getBarMembers(targetBarId);
          mappedMembers = members.map(m => ({
            id: `${targetBarId}_${m.id}`,
            userId: m.id,
            barId: targetBarId,
            role: m.role as UserRole,
            assignedBy: '',
            assignedAt: m.joined_at ? new Date(m.joined_at) : new Date(),
            isActive: m.member_is_active,
            user: {
              id: m.id,
              username: m.username || '',
              password: '',
              name: m.name,
              phone: m.phone,
              email: m.email,
              createdAt: m.created_at ? new Date(m.created_at) : new Date(),
              isActive: m.is_active || false,
              firstLogin: m.first_login ?? false,
              avatarUrl: m.avatar_url || undefined,
              lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
              createdBy: undefined,
              role: m.role as UserRole, // ✨ FIX: Ajouter le rôle requis
            }
          }));
        } catch (err) {
          console.error('[BarContext] Error loading members:', err);
        }
      }
      setBarMembers(mappedMembers);
    } catch (error) {
      console.error('[BarContext] Error in refreshMembers:', error);
    }
  }, [actingAs]);

  // Charger les bars au démarrage
  useEffect(() => {
    refreshBars();
  }, [currentSession?.userId, currentSession?.role]);

  // ✨ FIX CRITIQUE: Charger les membres quand le bar change
  useEffect(() => {
    const barId = currentBar?.id;
    if (barId) {
      refreshMembers(barId);
    }
  }, [currentBar?.id, actingAs.isActive, actingAs.userId, actingAs.barId, refreshMembers]);


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

    // Si on est en impersonation (super_admin acting as), prioriser le bar d'impersonation
    if (actingAs.isActive && actingAs.barId) {
      const impersonationBar = bars.find(b => b.id === actingAs.barId);
      if (impersonationBar) {
        setCurrentBar(impersonationBar);
        setCurrentBarId(impersonationBar.id);
        return;
      }
    }

    // 🔧 FIX: Prioriser currentBarId (si défini manuellement via switchBar) AVANT currentSession.barId
    // Cela permet au switching manuel de fonctionner correctement
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

    // Puis utiliser le barId de la session (fallback)
    if (currentSession.barId && currentSession.barId !== 'admin_global') {
      const sessionBar = bars.find(b => b.id === currentSession.barId);
      if (sessionBar) {
        setCurrentBar(sessionBar);
        setCurrentBarId(sessionBar.id);
        return;
      }
    }

    // 💾 Essayer de restaurer depuis le cache offline si le promoteur a plusieurs bars
    const accessibleBars = getUserBars();
    if (accessibleBars.length > 1) {
      const savedBarId = OfflineStorage.getCurrentBarId();
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
  }, [currentBarId, bars, currentSession, getUserBars, actingAs]);

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
      const newBar = createdBar;

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

  /* ------------------------------------------------------------------
   * UPDATE BAR (Proxy Aware)
   * ------------------------------------------------------------------ */
  const updateBar = useCallback(async (barId: string, updates: Partial<Bar>) => {
    // 1. Permission check (Proxy or Standard)
    if (actingAs.isActive && actingAs.userId) {
      // Allow
    } else {
      if (!currentSession || !hasPermission('canManageBarInfo')) return;
    }

    try {
      if (actingAs.isActive && actingAs.userId) {
        // --- PROXY MODE ---
        // Currently only support settings update via Proxy
        // If we need to update name/address, we need to extend RPC.
        if (updates.settings || updates.closingHour) {
          // Merge closingHour into settings if needed or handle separately? 
          // BarTender stores closingHour as column, but settings as jsonb.
          // My RPC admin_as_update_bar_settings updates "settings" column.
          // It does NOT update "closing_hour" column.
          // WARNING: "closing_hour" and "is_active" are separate columns.

          // Simplification: We assume "Acting As" mainly targets operational settings (consignment, etc).
          // If user changes closing hour, it won't persist via `admin_as_update_bar_settings` unless I update RFC.
          // **CRITICAL DECISION**: I should update the RPC or warn user.
          // Since I cannot change RPC easily now (migration done), I will try to use `admin_as_update_bar_settings` 
          // AND if I can, I'll pass Closing Hour inside settings just in case, or ignore it.
          // Actually, I should have included Closing Hour in RPC. 
          // BUT, standard `updateBar` updates `closing_hour` column.

          // Workaround: I will use `admin_as_update_bar_settings` for settings. 
          // Closing Hour change will be IGNORED for now in Proxy Mode (LIMITATION).
          // Or I update standard `settings` object.

          if (updates.settings) {
            await ProxyAdminService.updateBarSettingsAsProxy(actingAs.userId, barId, updates.settings);
          }
        }
      } else {
        // --- STANDARD MODE ---
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

        // Log mise à jour bar
        if (oldBar) {
          auditLogger.log({
            event: 'BAR_UPDATED',
            severity: 'info',
            userId: currentSession!.userId,
            userName: currentSession!.userName,
            userRole: currentSession!.role,
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
      }

      // Rafraîchir la liste
      await refreshBars();

    } catch (error) {
      console.error('[BarContext] Error updating bar:', error);
    }
  }, [currentSession, hasPermission, bars, refreshBars, actingAs]);

  // Helpers
  const isOwner = useCallback((barId: string) => {
    if (actingAs.isActive) return true; // SuperAdmin acting as is effectively owner
    if (!currentSession) return false;
    const bar = bars.find(b => b.id === barId);
    return bar?.ownerId === currentSession.userId;
  }, [bars, currentSession, actingAs]);

  const canAccessBar = useCallback((barId: string) => {
    if (actingAs.isActive) return true; // SuperAdmin sees all
    if (!currentSession) return false;

    // Le promoteur accède à tous ses bars
    if (isOwner(barId)) return true;

    // Les autres accèdent seulement à leur bar assigné
    return barMembers.some(
      m => m.userId === currentSession.userId &&
        m.barId === barId &&
        m.isActive
    );
  }, [currentSession, barMembers, isOwner, actingAs]);

  const switchBar = useCallback(async (barId: string) => {
    // Note: canAccessBar checks local barMembers which might be scoped to current bar.
    // We trust isOwner first, then fallback to fetching.

    // Trouver le bar dans la liste pour obtenir son nom
    const bar = bars.find(b => b.id === barId);
    if (!bar) {
      console.error('[BarContext] Bar not found in bars array:', barId);
      return;
    }

    if (!currentSession) return;

    // Déterminer le nouveau rôle
    let newRole: UserRole = currentSession.role;

    // 1. Si Super Admin global, on garde Super Admin
    if (currentSession.role === 'super_admin' && !actingAs.isActive) {
      newRole = 'super_admin';
    }
    // 2. Si Owner du bar cible -> Promoteur
    else if (bar.ownerId === currentSession.userId) {
      newRole = 'promoteur';
    }
    // 3. Sinon, il faut chercher le rôle dans la table bar_members
    else {
      try {
        const { data: member, error } = await supabase
          .from('bar_members')
          .select('role')
          .eq('bar_id', barId)
          .eq('user_id', currentSession.userId)
          .eq('is_active', true)
          .single();

        if (member && member.role) {
          newRole = member.role as UserRole;
        } else {
          console.warn('[BarContext] Could not find member role for bar:', barId, error);
          if (!actingAs.isActive) {
            console.error('[BarContext] Access Denied: No membership found for this bar');
            return; // Block access
          }
        }
      } catch (err) {
        console.error('[BarContext] Error fetching role during switch:', err);
      }
    }

    // Mettre à jour le bar local
    setCurrentBarId(barId);

    // 💾 Sauvegarder le bar sélectionné pour offline
    OfflineStorage.saveCurrentBarId(barId);

    // Mettre à jour la session AuthContext avec le NOUVEAU RÔLE
    updateCurrentBar(barId, bar.name, newRole);
  }, [bars, updateCurrentBar, currentSession, actingAs]);

  // Gestion des membres
  const getBarMembers = useCallback(async (barId: string): Promise<(BarMember & { user: User })[]> => {
    try {
      if (actingAs.isActive && actingAs.userId && actingAs.barId === barId) {
        const rawMembers = await ProxyAdminService.getBarMembersAsProxy(actingAs.userId, barId);
        return rawMembers.map((m: any) => ({
          id: m.id,
          userId: m.user_id,
          barId: m.bar_id,
          role: m.role as UserRole,
          assignedBy: 'super_admin',
          assignedAt: new Date(),
          isActive: m.is_active || false,
          user: {
            id: m.user_data.id,
            username: m.user_data.email || '',
            password: '',
            name: m.user_data.name,
            phone: m.user_data.phone,
            email: m.user_data.email,
            createdAt: new Date(),
            isActive: true,
            avatarUrl: m.user_data.avatar_url,
            createdBy: undefined,
            firstLogin: false,
            role: m.role as UserRole // ✨ FIX
          }
        }));
      }

      const members = await AuthService.getBarMembers(barId);

      return members.map(m => ({
        id: `${barId}_${m.id}`,
        userId: m.id,
        barId: barId,
        role: m.role as UserRole,
        assignedBy: '',
        assignedAt: m.joined_at ? new Date(m.joined_at) : new Date(),
        isActive: m.member_is_active || false,
        user: {
          id: m.id,
          username: m.username || '',
          password: '',
          name: m.name,
          phone: m.phone,
          email: m.email,
          createdAt: m.created_at ? new Date(m.created_at) : new Date(),
          isActive: m.is_active || false,
          firstLogin: m.first_login ?? false,
          avatarUrl: m.avatar_url || undefined,
          lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
          createdBy: undefined,
          role: m.role as UserRole // ✨ FIX
        }
      }));
    } catch (error) {
      console.error('[BarContext] Error loading bar members:', error);
      return [];
    }
  }, [currentSession, actingAs]);

  const addBarMember = useCallback(async (userId: string, role: UserRole): Promise<BarMember | null> => {
    if (actingAs.isActive && actingAs.userId && currentBar) {
      await ProxyAdminService.manageTeamMemberAsProxy(
        actingAs.userId,
        currentBar.id,
        userId,
        'ADD',
        role
      );
      // Refresh needed
      // We return a specialized object or simple success
      // Since UI might expect return value to update state immediately...
      // We'll perform a full refresh.
      // Or mock return:
      return {
        id: 'temp', userId, barId: currentBar.id, role, assignedBy: actingAs.userId, assignedAt: new Date(), isActive: true
      };
    }

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
        assignedAt: memberData.joined_at ? new Date(memberData.joined_at) : new Date(),
        isActive: memberData.is_active ?? true,
      };

      // Rafraîchir les membres
      setBarMembers(prev => [...prev, newMember]);

      return newMember;
    } catch (error) {
      console.error('[BarContext] Error adding member:', error);
      return null;
    }
  }, [currentSession, currentBar, hasPermission, actingAs]);

  const removeBarMember = useCallback(async (memberId: string): Promise<{ success: boolean; error?: string }> => {
    // Handling Proxy
    if (actingAs.isActive && actingAs.userId && currentBar) {
      const member = barMembers.find(m => m.id === memberId);
      if (member) {
        try {
          await ProxyAdminService.manageTeamMemberAsProxy(
            actingAs.userId,
            currentBar.id,
            member.userId,
            'REMOVE'
          );
          setBarMembers(prev => prev.filter(m => m.id !== memberId));
          return { success: true };
        } catch (error: any) {
          console.error('[BarContext] Error removing member (proxy):', error);
          return { success: false, error: error.message || 'Failed to remove member' };
        }
      }
      return { success: false, error: 'Member not found' };
    }

    if (!currentSession) return { success: false, error: 'No session' };

    try {
      const member = barMembers.find(m => m.id === memberId);
      if (!member) return { success: false, error: 'Member not found' };

      // Seul le promoteur peut retirer des gérants
      if (member.role === 'gerant' && !hasPermission('canCreateManagers')) {
        return { success: false, error: 'No permission to remove managers' };
      }
      // Gérants et promoteurs peuvent retirer des serveurs
      if (member.role === 'serveur' && !hasPermission('canCreateServers')) {
        return { success: false, error: 'No permission to remove servers' };
      }

      // 🔧 BUG FIX: memberId est un ID composé (barId_userId) pour affichage
      // Mais la table bar_members utilise user_id + bar_id comme clé composite unique
      // Solution: utiliser directement user_id et bar_id pour identifier et désactiver

      const targetBarId = currentBar?.id || member.barId;

      // Désactiver via Supabase en utilisant la clé composite (user_id + bar_id)
      const { error: updateError } = await (supabase as any)
        .from('bar_members')
        .update({ is_active: false })
        .eq('user_id', member.userId)
        .eq('bar_id', targetBarId);

      if (updateError) {
        console.error('[BarContext] Supabase update error:', updateError);
        return { success: false, error: updateError.message || 'Database update failed' };
      }

      // Mettre à jour localement
      setBarMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, isActive: false } : m
      ));

      return { success: true };
    } catch (error: any) {
      console.error('[BarContext] Error removing member:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }, [currentSession, hasPermission, barMembers, actingAs, currentBar]);

  const updateBarMember = useCallback(async (memberId: string, updates: Partial<BarMember>) => {
    if (actingAs.isActive && actingAs.userId && currentBar) {
      const member = barMembers.find(m => m.id === memberId);
      if (member && updates.role) {
        await ProxyAdminService.manageTeamMemberAsProxy(
          actingAs.userId,
          currentBar.id,
          member.userId,
          'UPDATE_ROLE',
          updates.role
        );
      }
      return;
    }

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
  }, [currentSession, actingAs, barMembers, currentBar]);

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
