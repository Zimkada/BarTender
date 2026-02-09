import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bar, BarMember, User, UserRole, BarSettings } from '../types';
import { auditLogger } from '../services/AuditLogger';
import { BarsService } from '../services/supabase/bars.service';
import { AuthService } from '../services/supabase/auth.service';
import { ServerMappingsService } from '../services/supabase/server-mappings.service';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import type { Database, Json } from '../lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OfflineStorage } from '../utils/offlineStorage';
import { offlineQueue } from '../services/offlineQueue';
import { networkManager } from '../services/NetworkManager';

type BarRow = Database['public']['Tables']['bars']['Row'];
type BarUpdate = Database['public']['Tables']['bars']['Update'];
type BarMemberRow = Database['public']['Tables']['bar_members']['Row'];
type BarMemberInsert = Database['public']['Tables']['bar_members']['Insert'];
type BarMemberUpdate = Database['public']['Tables']['bar_members']['Update'];

/**
 * ✅ Type-safe interface for offline bar update operations
 * Prevents unsafe `as any` casts when queueing updates
 */
interface OfflineBarUpdate {
  barId: string;
  updates: Partial<BarUpdate>;
}

/**
 * ✅ Type-safe Supabase query builder for bar_members table
 * Eliminates 'as any' casts by providing explicit Database schema typing
 *
 * TypeScript cannot automatically infer table types from .from('bar_members')
 * without explicit generics, so we create a typed helper function.
 */
const barMembersTable = () => (supabase as SupabaseClient<Database>).from('bar_members');

interface BarContextType {
  // Bars
  bars: Bar[];
  currentBar: Bar | null;
  userBars: Bar[]; // Bars de l'utilisateur connecté
  loading: boolean;

  // Gestion des bars
  createBar: (bar: Omit<Bar, 'id' | 'createdAt' | 'ownerId'> & { ownerId?: string }) => Promise<Bar | null>;
  updateBar: (barId: string, updates: Partial<Bar>) => Promise<void>;
  assignedRole: UserRole | null;
  operatingMode: 'full' | 'simplified';
  isSimplifiedMode: boolean;
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

// Alias for compatibility
export const useBar = useBarContext;

export const BarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentSession, hasPermission, updateCurrentBar } = useAuth();
  const [bars, setBars] = useState<Bar[]>([]);
  const [barMembers, setBarMembers] = useState<BarMember[]>([]);
  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // État dérivé
  const [currentBar, setCurrentBar] = useState<Bar | null>(null);
  const [userBars, setUserBars] = useState<Bar[]>([]);
  // assignedRole is derived from currentSession normally, keeping state if needed for overrides but currently unused setter
  const [assignedRole] = useState<UserRole | null>(null);

  // ✨ Centralized Operating Mode Logic
  const operatingMode = useMemo(() => {
    return currentBar?.settings?.operatingMode || 'simplified';
  }, [currentBar]);

  const isSimplifiedMode = useMemo(() => {
    return operatingMode === 'simplified';
  }, [operatingMode]);

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

      // 1. Charger le cache offline en premier pour la réactivité
      const cachedBars = OfflineStorage.getBars();
      if (cachedBars && cachedBars.length > 0) {
        setBars(cachedBars);
        setUserBars(cachedBars);
      }

      // 2. Récupérer les données du serveur
      let serverBars: Bar[] = [];
      if (currentSession.role === 'super_admin') {
        serverBars = await BarsService.getAllBars();
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
        serverBars = await BarsService.getMyBars();
      }

      // 3. Fusionner avec les opérations en attente (Résilence Bug #1)
      const pendingOps = await offlineQueue.getOperations({ status: 'pending' });
      const barUpdates = pendingOps.filter(op => op.type === 'UPDATE_BAR');

      const mergedBars = serverBars.map(bar => {
        const barPendingUpdate = barUpdates.find(op => op.barId === bar.id);
        if (barPendingUpdate) {
          console.log(`[BarContext] Merging pending update for bar ${bar.id}`, barPendingUpdate.payload.updates);
          return {
            ...bar,
            ...barPendingUpdate.payload.updates,
            // 🛡️ Fix Type Mismatch: Supabase returns null, Bar expects undefined
            address: barPendingUpdate.payload.updates.address ?? bar.address ?? undefined,
            phone: barPendingUpdate.payload.updates.phone ?? bar.phone ?? undefined,
            settings: {
              ...bar.settings,
              ...(barPendingUpdate.payload.updates.settings as Partial<BarSettings> || {})
            } as BarSettings
          };
        }
        return bar;
      });

      setBars(mergedBars);
      setUserBars(mergedBars);
      OfflineStorage.saveBars(mergedBars);

      // Si le bar actuel est parmi eux, le mettre à jour aussi
      if (currentBarId) {
        const updatedCurrent = mergedBars.find(b => b.id === currentBarId);
        if (updatedCurrent) {
          setCurrentBar(updatedCurrent);
        }
      }

    } catch (error) {
      console.error('[BarContext] Error loading bars:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  /**
   * Helper: Fetch avec retry et timeout
   * Mémorisé pour stabilité des références (React Hooks compliance)
   *
   * @param fn Fonction à exécuter
   * @param retries Nombre de tentatives max (default: 3)
   * @param timeoutMs Timeout par tentative (default: 5000ms)
   */
  const fetchWithRetry = useCallback(async <T,>(
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 5000
  ): Promise<T> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const fetchPromise = fn();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FETCH_TIMEOUT')), timeoutMs)
        );

        return await Promise.race([fetchPromise, timeoutPromise]);
      } catch (err) {
        const error = err as Error;
        const isLastAttempt = attempt === retries - 1;

        if (error.message === 'FETCH_TIMEOUT') {
          console.warn(`[BarContext] Fetch timeout (${timeoutMs}ms), attempt ${attempt + 1}/${retries}`);
        } else {
          console.warn(`[BarContext] Fetch error, attempt ${attempt + 1}/${retries}:`, error.message);
        }

        if (isLastAttempt) throw error;

        // Backoff exponentiel : 500ms, 1000ms, 2000ms...
        const backoffMs = 500 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('fetchWithRetry: Max retries exceeded'); // Ne devrait jamais arriver
  }, []);  // ✅ Pas de deps - fonction pure (pas de closure sur state/props)

  // 🔒 LOCK SYSTEM for auto-mapping (v12.1)
  const processingMapping = useRef<Set<string>>(new Set());

  /**
   * ✨ Auto-création mapping serveur (v11.8 / Hardening v12.1)
   * Crée automatiquement un mapping lors de l'ajout d'un serveur
   *
   * Features:
   * - 🔒 Lock applicatif (Race condition protection)
   * - 🛡️ Validation préventive (Collision detection)
   * - Retry logic (3 tentatives × 5s)
   * - Gestion offline (queue + cache)
   *
   * @param barId ID du bar
   * @param userId ID de l'utilisateur serveur
   * @returns Promise<boolean> true si succès, false si échec ou collision
   */
  const autoCreateServerMapping = useCallback(async (
    barId: string,
    userId: string
  ): Promise<boolean> => {
    // 1. Acquisition du Lock (évite les écritures concurrentes sur le même bar)
    const lockKey = `${barId}_${userId}`;
    if (processingMapping.current.has(lockKey)) {
      console.warn('[BarContext] 🔒 Race condition detected: mapping already in progress for', userId);
      return false;
    }

    processingMapping.current.add(lockKey);

    try {
      console.log('[BarContext] 🔄 Auto-mapping: starting for', userId);

      // 1. Fetch user name avec retry (résiste aux connexions instables)
      const userData = await fetchWithRetry(
        async () => {
          const { data, error } = await supabase
            .from('users')
            .select('name')
            .eq('id', userId)
            .single();

          if (error) throw error;
          return data;
        },
        3,    // 3 tentatives max
        5000  // 5s timeout par tentative
      );

      // 2. Validation stricte du nom
      const userName = userData?.name?.trim();

      if (!userName || userName.length === 0) {
        console.warn('[BarContext] ⚠️ Auto-mapping skipped: user has no name');
        return false;
      }

      // 🛡️ 12.1 VALIDATION PRÉVENTIVE (Collision Detection)
      // On vérifie en ligne ET en cache si ce nom est déjà utilisé par un AUTRE UUID
      const existingMappings = OfflineStorage.getMappings(barId) || [];
      const collision = existingMappings.find(m => m.serverName === userName && m.userId !== userId);

      if (collision) {
        console.error(`[BarContext] 🛑 COLLISION DETECTED: Name "${userName}" already assigned to another user (${collision.userId})`);
        return false; // Bloque le mapping pour éviter d'écraser l'existant
      }

      // 3. Vérifier mode connexion
      const { shouldBlock } = networkManager.getDecision();

      if (shouldBlock) {
        // 3a. Mode Offline: Queue + Cache local
        console.log(`[BarContext] 📦 Offline: Queueing auto-mapping for "${userName}"`);

        await offlineQueue.addOperation(
          'CREATE_SERVER_MAPPING',
          { barId, serverName: userName, userId },
          barId,
          userId
        );

        // Mise à jour cache local immédiate
        const isDuplicate = existingMappings.some(m =>
          m.serverName === userName || m.userId === userId
        );

        if (!isDuplicate) {
          const newMapping = { serverName: userName, userId };
          OfflineStorage.saveMappings(barId, [...existingMappings, newMapping]);
          console.log(`[BarContext] ✓ Mapping cached locally: "${userName}" → ${userId}`);
        }

        return true;
      }

      // 4. Mode Online: Créer en BDD avec retry
      console.log(`[BarContext] 🌐 Online: Creating mapping for "${userName}"`);

      await fetchWithRetry(
        () => ServerMappingsService.upsertServerMapping(barId, userName, userId),
        3,
        5000
      );

      // 5. Synchroniser le cache local (mise à jour préventive)
      const isDuplicate = existingMappings.some(m =>
        m.serverName === userName || m.userId === userId
      );

      if (!isDuplicate) {
        const newMapping = { serverName: userName, userId };
        OfflineStorage.saveMappings(barId, [...existingMappings, newMapping]);
      }

      console.log(`[BarContext] ✓ Auto-mapping created: "${userName}" → ${userId}`);
      return true;

    } catch (error) {
      const err = error as Error;

      if (err.message === 'FETCH_TIMEOUT') {
        console.error('[BarContext] ⏱️ Auto-mapping timeout after all retries');
      } else {
        console.error('[BarContext] ❌ Auto-mapping failed:', err.message);
      }

      return false;
    } finally {
      processingMapping.current.delete(lockKey); // 🔓 Release lock
    }
  }, [fetchWithRetry]);  // ✅ Deps ajoutée - React Hooks compliance


  /* ------------------------------------------------------------------
   * REFRESH MEMBERS (OPTIMIZED)
   * ------------------------------------------------------------------ */
  const refreshMembers = useCallback(async (targetBarId: string) => {
    if (!targetBarId || targetBarId === 'admin_global') return;

    try {
      // Stratégie "Smart":
      // 1. Cache Local immédiat
      const cachedMappings = OfflineStorage.getMappings(targetBarId) || [];
      // (Pas de cache members générique dans OfflineStorage actuel, on fera avec)

      // 2. Network Check
      const { shouldBlock } = networkManager.getDecision();

      // 3. Fetch Data (Fail-fast, pas de retry agressif 3x5s)
      const [membersResult, mappingsResult] = await Promise.allSettled([
        shouldBlock ? Promise.reject('Offline') : AuthService.getBarMembers(targetBarId),
        shouldBlock ? Promise.resolve(cachedMappings) : ServerMappingsService.getAllMappingsForBar(targetBarId)
      ]);

      // Traitement Membres
      if (membersResult.status === 'fulfilled') {
        const membersFn = membersResult.value.map(m => ({
          id: `${targetBarId}_${m.id}`,
          userId: m.id,
          barId: targetBarId,
          role: m.role as UserRole,
          assignedBy: '',
          assignedAt: m.joined_at ? new Date(m.joined_at) : new Date(),
          isActive: m.member_is_active || false,
          user: {
            id: m.id,
            username: m.username || '',
            name: m.name,
            email: m.email,
            phone: m.phone,
            role: m.role as UserRole,
            // ... autres champs optionnels ...
            createdAt: new Date(),
            isActive: true
          }
        } as BarMember));
        setBarMembers(membersFn);
      }

      // Traitement Mappings
      if (mappingsResult.status === 'fulfilled') {
        const mappings = Array.isArray(mappingsResult.value) ? mappingsResult.value : [];
        if (mappings.length > 0 && !shouldBlock) {
          OfflineStorage.saveMappings(targetBarId, mappings);
        }
      }

    } catch (error) {
      console.error('[BarContext] refreshMembers failed:', error);
    }
  }, []);

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
  }, [currentBar?.id, refreshMembers]);

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

    if (currentSession.barId && currentSession.barId !== 'admin_global') {
      const sessionBar = bars.find(b => b.id === currentSession.barId);
      if (sessionBar) {
        setCurrentBar(sessionBar);
        setCurrentBarId(sessionBar.id);
        return;
      }
    }

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
        settings: barData.settings as unknown as Json,
        closing_hour: barData.closingHour,
      };

      const createdBar = await BarsService.createBar(newBarData);
      const newBar = createdBar;

      await refreshBars();

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
      if (!oldBar) return;

      const optimisticBar: Bar = {
        ...oldBar,
        ...updates,
        settings: { ...oldBar.settings, ...updates.settings }
      };

      setBars(prev => prev.map(b => b.id === barId ? optimisticBar : b));
      setUserBars(prev => prev.map(b => b.id === barId ? optimisticBar : b));
      if (currentBar?.id === barId) {
        setCurrentBar(optimisticBar);
      }

      const currentCachedBars = OfflineStorage.getBars() || [];
      const updatedCachedBars = currentCachedBars.map(b => b.id === barId ? optimisticBar : b);
      OfflineStorage.saveBars(updatedCachedBars);

      const { shouldBlock } = networkManager.getDecision();

      if (shouldBlock) {
        console.log('[BarContext] Offline update - queuing changes');
        await offlineQueue.addOperation(
          'UPDATE_BAR',
          { barId, updates } satisfies OfflineBarUpdate,
          barId,
          currentSession.userId
        );
      } else {
        console.log('[BarContext] Online update - sending to server');

        type BarUpdatePayload = Partial<BarUpdate & { theme_config?: unknown }>;
        const supabaseUpdates: BarUpdatePayload = {};
        if (updates.name) supabaseUpdates.name = updates.name;
        if (updates.address) supabaseUpdates.address = updates.address;
        if (updates.phone) supabaseUpdates.phone = updates.phone;
        if (updates.settings) supabaseUpdates.settings = updates.settings as unknown as Json;
        if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;
        if (updates.closingHour !== undefined) supabaseUpdates.closing_hour = updates.closingHour;
        if (updates.theme_config !== undefined) supabaseUpdates.theme_config = updates.theme_config;

        try {
          await BarsService.updateBar(barId, supabaseUpdates);
        } catch (serverError) {
          console.error('[BarContext] Server update failed, rolling back:', serverError);
          const backupBars = bars;
          setBars(backupBars);
          setUserBars(backupBars);
          if (currentBar?.id === barId) {
            setCurrentBar(oldBar);
          }
          OfflineStorage.saveBars(backupBars);
          throw serverError;
        }
      }

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
          offline: shouldBlock
        },
        relatedEntityId: barId,
        relatedEntityType: 'bar',
      });

    } catch (error) {
      console.error('[BarContext] Error in updateBar flow:', error);
      throw error;
    }
  }, [currentSession, hasPermission, bars, currentBar]);

  // Helpers
  const isOwner = useCallback((barId: string) => {
    if (!currentSession) return false;
    const bar = bars.find(b => b.id === barId);
    return bar?.ownerId === currentSession.userId;
  }, [bars, currentSession]);

  const canAccessBar = useCallback((barId: string) => {
    if (!currentSession) return false;
    if (isOwner(barId)) return true;
    return barMembers.some(
      m => m.userId === currentSession.userId &&
        m.barId === barId &&
        m.isActive
    );
  }, [currentSession, barMembers, isOwner]);

  const switchBar = useCallback(async (barId: string) => {
    const bar = bars.find(b => b.id === barId);
    if (!bar) {
      console.error('[BarContext] Bar not found in bars array:', barId);
      return;
    }

    if (!currentSession) return;

    let newRole: UserRole = currentSession.role;

    if (currentSession.role === 'super_admin') {
      newRole = 'super_admin';
    }
    else if (bar.ownerId === currentSession.userId) {
      newRole = 'promoteur';
    }
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
          console.error('[BarContext] Access Denied: No membership found for this bar');
          return;
        }
      } catch (err) {
        console.error('[BarContext] Error fetching role during switch:', err);
      }
    }

    setCurrentBarId(barId);
    OfflineStorage.saveCurrentBarId(barId);
    updateCurrentBar(barId, bar.name, newRole);

    try {
      await refreshBars();
    } catch (error) {
      console.warn('[BarContext] Error refreshing bars after switch:', error);
    }
  }, [bars, updateCurrentBar, currentSession, refreshBars]);

  const getBarMembers = useCallback(async (barId: string): Promise<(BarMember & { user: User })[]> => {
    try {
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
          role: m.role as UserRole
        }
      }));
    } catch (error) {
      console.error('[BarContext] Error loading bar members:', error);
      return [];
    }
  }, [currentSession]);

  /* ------------------------------------------------------------------
   * MEMBER MANAGEMENT (CENTRALIZED VIA SERVICE)
   * ------------------------------------------------------------------ */

  const addBarMember = useCallback(async (userId: string, role: UserRole): Promise<BarMember | null> => {
    if (!currentBar || !currentSession) return null;

    try {
      // ✅ Utilisation du Service Centralisé
      const result = await BarsService.addMember(currentBar.id, userId, role, currentSession.userId);

      if (!result.success) {
        toast.error(result.error || "Erreur lors de l'ajout");
        return null;
      }

      toast.success("Membre ajouté avec succès");

      // Refresh local state optimiste ou complet
      // On reconstruit un objet membre temporaire pour l'UI immédiate
      const newMember: BarMember = {
        id: `${currentBar.id}_${userId}`, // ID composite pour l'UI
        userId,
        barId: currentBar.id,
        role,
        assignedBy: currentSession.userId,
        assignedAt: new Date(),
        isActive: true
      };

      setBarMembers(prev => [...prev, newMember]);

      // Late refresh pour les détails (nom, etc)
      refreshMembers(currentBar.id);

      return newMember;
    } catch (error) {
      console.error('[BarContext] Error adding member:', error);
      toast.error("Erreur inattendue");
      return null;
    }
  }, [currentBar, currentSession, refreshMembers]);

  const removeBarMember = useCallback(async (memberId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentSession || !currentBar) return { success: false, error: 'No session' };

    try {
      // Trouver le membre pour avoir son vrai userId (memberId est composite parfois)
      const member = barMembers.find(m => m.id === memberId);
      if (!member) return { success: false, error: 'Member not found' };

      // ✅ Utilisation du Service Centralisé
      const result = await BarsService.removeMember(currentBar.id, member.userId, currentSession.userId);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Update UI immediat
      setBarMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, isActive: false } : m
      ));

      return { success: true };
    } catch (error: any) {
      console.error('[BarContext] Error removing member:', error);
      return { success: false, error: error.message };
    }
  }, [currentSession, currentBar, barMembers]);

  const updateBarMember = useCallback(async (memberId: string, updates: Partial<BarMember>) => {
    if (!currentSession || !currentBar) return;

    // Pour l'instant on ne gère que le rôle via le service dédié
    if (updates.role) {
      const member = barMembers.find(m => m.id === memberId);
      if (!member) return;

      const result = await BarsService.updateMemberRole(currentBar.id, member.userId, updates.role, currentSession.userId);

      if (result.success) {
        setBarMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: updates.role } : m));
        toast.success("Rôle mis à jour");
      } else {
        toast.error(result.error || "Erreur maj rôle");
      }
    }
  }, [currentSession, currentBar, barMembers]);

  const value: BarContextType = {
    bars,
    currentBar,
    userBars,
    loading,
    createBar,
    updateBar,
    assignedRole,
    operatingMode,
    isSimplifiedMode,
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
