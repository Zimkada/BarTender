import type { Factor, User as SupabaseUser } from '@supabase/supabase-js';

import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { User as AppUser, UserRole, BarMember } from '../../types';

type DbUser = Database['public']['Tables']['users']['Row'];
type DbUserUpdate = Database['public']['Tables']['users']['Update'];

export interface AuthUser extends Omit<DbUser, 'password_hash'> {
  email: string;
  role: 'super_admin' | 'promoteur' | 'gerant' | 'serveur';
  barId: string;
  barName: string;
  allBarIds?: string[]; // IDs de tous les bars actifs (pour multi-bar support)
  factors?: Factor[]; // Add factors for MFA
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  phone: string;
  username?: string;
}

export interface LoginResult {
  user?: AuthUser;
  mfaRequired?: boolean;
  mfaFactorId?: string; // ID du facteur MFA à utiliser pour le challenge
  error?: string;
  authUserId?: string; // Temporarily store user ID for MFA flow
}

/**
 * Service d'authentification Supabase Auth native
 * Utilise email + password avec JWT automatique
 * Sessions gérées par auth.uid() pour RLS
 */
export class AuthService {
  /**
   * Récupère le profil utilisateur et le membership après une authentification réussie.
   * @param userId L'ID de l'utilisateur authentifié.
   * @returns L'objet AuthUser complet.
   */
  private static async fetchUserProfileAndMembership(userId: string): Promise<AuthUser> {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, username, email, name, phone, avatar_url, is_active, first_login, has_completed_onboarding, created_at, updated_at, last_login_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profil utilisateur introuvable');
    }

    // Récupère TOUS les bars actifs de l'utilisateur (support multi-bar)
    const { data: memberships, error: membershipError } = await supabase
      .from('bar_members')
      .select(`
        role,
        bar_id,
        bars(
          name,
          address,
          phone
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('joined_at', { ascending: false }); // Plus récent en premier

    if (membershipError || !memberships || memberships.length === 0) {
      throw new Error('Aucun rôle actif trouvé pour cet utilisateur');
    }

    // Sélection du bar par défaut lors de l'initialisation
    // Priorité: 1) localStorage, 2) Premier bar actif (plus récent)
    const savedBarId = localStorage.getItem('selectedBarId');
    let defaultMembership = memberships[0]; // Fallback: premier bar (plus récent)

    // Si un bar est sauvegardé dans localStorage, l'utiliser s'il existe dans les memberships
    if (savedBarId) {
      const savedMembership = memberships.find((m: any) => m.bar_id === savedBarId);
      if (savedMembership) {
        defaultMembership = savedMembership;
      }
    }

    // Récupérer les IDs de TOUS les bars pour BarSelector
    const allBarIds = memberships.map((m: any) => m.bar_id);

    const profileData = profile as any;
    const membershipData = defaultMembership as any;

    return {
      id: userId,
      email: profileData.email!,
      username: profileData.username || '',
      name: profileData.name || '',
      phone: profileData.phone || '',
      avatar_url: profileData.avatar_url,
      is_active: profileData.is_active ?? true,
      first_login: profileData.first_login ?? false,
      has_completed_onboarding: profileData.has_completed_onboarding ?? false, // New field
      created_at: profileData.created_at,
      updated_at: profileData.updated_at,
      last_login_at: profileData.last_login_at,
      role: membershipData.role as AuthUser['role'],
      barId: membershipData.bar_id || '',
      barName: membershipData.bars?.name || '',
      allBarIds, // Tous les bars actifs (multi-bar support)
    };
  }

  /**
   * Connexion utilisateur avec email + password
   */
  static async login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      // 1. Login via Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        // Si MFA est requis, supabase.auth.signInWithPassword ne retourne PAS une erreur
        // Il retourne data.session = null et data.user avec les facteurs
        if (error.message.includes('A multi-factor authentication challenge is required') && data.user) {
          const user = data.user as SupabaseUser;
          const totpFactor = user.factors?.find((f: Factor) => f.factor_type === 'totp');
          if (totpFactor) {
            return { mfaRequired: true, mfaFactorId: totpFactor.id, authUserId: data.user.id };
          }
        }
        // Pour toute autre erreur, la relancer
        throw new Error(error.message || 'Email ou mot de passe incorrect');
      }

      if (!data.session) {
        // En cas de MFA requis, data.session est null.
        // On devrait normalement avoir géré l'erreur MFA ci-dessus,
        // donc si on arrive ici sans session valide, c'est un problème inattendu
        throw new Error('Connexion échouée: session non établie.');
      }

      const authUser = await this.fetchUserProfileAndMembership(data.user.id);

      // Log login to Audit (Fire and forget)
      supabase.rpc('log_user_login').then(({ error }) => {
        if (error) console.error('Failed to log login:', error);
      });

      localStorage.setItem('auth_user', JSON.stringify(authUser));
      return { user: authUser };
    } catch (error: any) {
      console.error('AuthService login error:', error);
      return { error: handleSupabaseError(error) };
    }
  }

  /**
   * Vérifie le code MFA et finalise la connexion.
   * @param factorId L'ID du facteur MFA à vérifier.
   * @param code Le code TOTP à 6 chiffres.
   * @returns L'objet AuthUser complet.
   */
  static async verifyMfa(factorId: string, code: string): Promise<LoginResult> {
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factorId,
        code: code,
      });
      console.log('MFA response data:', data); // Debugging

      if (error) {
        throw new Error(error.message || 'Code MFA incorrect');
      }

      // Cast data to any to access session/user safely if types are outdated
      const mfaData = data as any;

      if (!mfaData.session || !mfaData.user) {
        throw new Error('Vérification MFA échouée: session non établie.');
      }

      const authUser = await this.fetchUserProfileAndMembership(mfaData.user.id);

      localStorage.setItem('auth_user', JSON.stringify(authUser));
      return { user: authUser };
    } catch (error: any) {
      console.error('AuthService verifyMfa error:', error); // Debugging
      return { error: handleSupabaseError(error) };
    }
  }

  /**
   * Inscription d'un nouvel utilisateur
   * Réservé aux promoteurs et super_admins
   */
  static async signup(
    data: SignupData,
    barId: string,
    role: 'gerant' | 'serveur'
  ): Promise<Omit<DbUser, 'password_hash'>> {
    try {
      const { data: { session }, error: getSessionError } = await supabase.auth.getSession();
      if (getSessionError || !session) {
        throw new Error('User not authenticated. Please log in again.');
      }
      const token = session.access_token;

      const response = await supabase.functions.invoke('create-bar-member', {
        body: { newUser: data, barId, role },
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('Edge Function Raw Response:', JSON.stringify(response, null, 2)); // <-- ADDED LOG

      if (response.error) {
        // Try to parse more details from the response.error object
        const edgeFunctionError = response.error.context?.body?.error || response.error.message;
        throw new Error(edgeFunctionError);
      }
      if (response.data && response.data.error) { // This handles custom errors from the Edge Function body
        throw new Error(response.data.error);
      }

      // Assuming `response.data` is now correctly { success: true, user: ... }
      if (!response.data || !response.data.success || !response.data.user) {
        throw new Error(response.data?.error || 'Edge Function returned unexpected successful response.');
      }

      return response.data.user as Omit<DbUser, 'password_hash'>;

    } catch (error: any) {
      console.error('AuthService signup caught error:', JSON.stringify(error, null, 2));

      let errorMessage = 'Erreur lors de la création de l\'utilisateur';

      // Check if it's a Supabase Functions error
      if (error && error.name === 'FunctionsHttpError' && error.context) {
        try {
          // The body might be a string, or already parsed if Content-Type is application/json
          const errorBody = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
          errorMessage = errorBody.error || error.context.body || error.message;
        } catch (parseError) {
          errorMessage = error.message; // Fallback if body parsing fails
        }
      } else if (error && error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }



  /**
   * Création d'un promoteur (sans bar initial)
   * Réservé aux super_admins
   */
  static async createPromoter(
    data: SignupData
  ): Promise<Omit<DbUser, 'password_hash'>> {
    try {
      const { data: { session }, error: getSessionError } = await supabase.auth.getSession();
      if (getSessionError || !session) {
        throw new Error('User not authenticated. Please log in again.');
      }
      const token = session.access_token;

      // Note: barId and role are NOT passed for promoter creation
      const response = await supabase.functions.invoke('create-bar-member', {
        body: { newUser: data },
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('Edge Function Raw Response (Promoter):', JSON.stringify(response, null, 2)); // <-- ADDED LOG

      if (response.error) {
        throw new Error(response.error.message);
      }
      if (response.data && response.data.error) {
        throw new Error(response.data.error);
      }

      // The Edge Function returns the created user, which matches the expected return type.
      return response.data.user as Omit<DbUser, 'password_hash'>;

    } catch (error: any) {
      console.error('AuthService createPromoter caught error:', JSON.stringify(error, null, 2)); // <-- ADDED LOG

      let errorMessage = 'Erreur lors de la création de l\'utilisateur';

      // Check if it's a Supabase Functions error
      if (error && error.name === 'FunctionsHttpError' && error.context) {
        try {
          const errorBody = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
          errorMessage = errorBody.error || error.context.body || error.message;
        } catch (parseError) {
          errorMessage = error.message;
        }
      } else if (error && error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Setup a new bar for an existing promoter (super_admin only)
   * @param ownerId UUID of the promoter who will own the bar
   * @param barName Name of the bar
   * @param barAddress Optional address of the bar
   * @param barPhone Optional phone number of the bar
   * @param barSettings Optional additional settings as JSONB
   * @returns Promise with success status and bar details
   */
  static async setupPromoterBar(
    ownerId: string,
    barName: string,
    barAddress?: string | null,
    barPhone?: string | null,
    barSettings?: any
  ): Promise<{ success: boolean; barId?: string; barName?: string; barAddress?: string; barPhone?: string; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('setup_promoter_bar', {
        p_owner_id: ownerId,
        p_bar_name: barName,
        p_address: barAddress || null,
        p_phone: barPhone || null,
        p_settings: barSettings || null,
      });

      if (error) {
        // Messages d'erreur utilisateur conviviaux
        if (error.message.includes('duplicate key')) {
          throw new Error('Un bar avec ce nom existe déjà.');
        }
        if (error.message.includes('foreign key')) {
          throw new Error('Utilisateur invalide. Veuillez réessayer.');
        }
        throw new Error(error.message);
      }

      return {
        success: data.success,
        barId: data.bar_id,
        barName: data.bar_name,
        barAddress: data.bar_address,
        barPhone: data.bar_phone,
      };
    } catch (error: any) {
      console.error('AuthService setupPromoterBar error:', error);
      return {
        success: false,
        error: error.message || 'Une erreur est survenue lors de la création du bar.',
      };
    }
  }

  /**
   * Récupérer tous les promoteurs
   */
  static async getAllPromoters(): Promise<Array<DbUser & { bars: { id: string; name: string }[] }>> {
    try {
      // 1. Récupérer tous les membres avec rôle promoteur
      const { data: membersData, error: membersError } = await supabase
        .from('bar_members')
        .select('user_id, bar_id, bars(name)')
        .eq('role', 'promoteur')
        .eq('is_active', true);

      if (membersError) {
        throw new Error('Erreur lors de la récupération des promoteurs');
      }

      const members = membersData as any[];

      if (!members || members.length === 0) {
        return [];
      }

      // 2. Récupérer les détails des utilisateurs
      const userIds = [...new Set(members.map(m => m.user_id))];
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds);

      if (usersError) {
        throw new Error('Erreur lors de la récupération des profils promoteurs');
      }

      const users = usersData as any[];

      // 3. Combiner les données
      const userBarsMap = new Map<string, { id: string; name: string }[]>();
      members.forEach(m => {
        const bars = userBarsMap.get(m.user_id) || [];
        if (m.bars) {
          bars.push({ id: m.bar_id, name: m.bars.name });
        }
        userBarsMap.set(m.user_id, bars);
      });

      const promoters = users.map(user => ({
        ...user,
        bars: userBarsMap.get(user.id) || []
      }));

      return promoters as Array<DbUser & { bars: { id: string; name: string }[] }>;

    } catch (error: any) {
      console.error('AuthService getAllPromoters error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les utilisateurs avec leurs rôles (pour Super Admin)
   */
  static async getAllUsersWithRoles(): Promise<Array<DbUser & { roles: string[] }>> {
    try {
      // 1. Récupérer tous les utilisateurs
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*');

      if (usersError) {
        throw new Error('Erreur lors de la récupération des utilisateurs');
      }

      const users = usersData as any[];

      if (!users || users.length === 0) {
        return [];
      }

      // 2. Récupérer tous les memberships
      const { data: membersData, error: membersError } = await supabase
        .from('bar_members')
        .select('user_id, role')
        .eq('is_active', true);

      if (membersError) {
        throw new Error('Erreur lors de la récupération des rôles');
      }

      const members = membersData as any[];

      // 3. Mapper les rôles par utilisateur
      const userRolesMap = new Map<string, string[]>();
      members.forEach(m => {
        const roles = userRolesMap.get(m.user_id) || [];
        if (m.role && !roles.includes(m.role)) {
          roles.push(m.role);
        }
        userRolesMap.set(m.user_id, roles);
      });

      // 4. Combiner
      return users.map(user => ({
        ...user,
        roles: userRolesMap.get(user.id) || []
      })) as Array<DbUser & { roles: string[] }>;

    } catch (error: any) {
      console.error('AuthService getAllUsersWithRoles error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les membres de tous les bars (pour Super Admin)
   */
  static async getAllBarMembers(): Promise<Array<BarMember & { user: AppUser }>> {
    try {
      // Use RPC to bypass RLS - superadmin needs to see all members across all bars
      const { data: membersData, error } = await supabase
        .rpc('get_all_bar_members');

      if (error) {
        throw new Error(error.message);
      }

      const members = membersData as any[];

      return members.map(m => ({
        id: m.id,
        userId: m.user_id,
        barId: m.bar_id,
        role: m.role as UserRole,
        assignedBy: m.assigned_by || '',
        assignedAt: new Date(m.joined_at),
        isActive: m.is_active,
        user: {
          id: m.user_id_inner,
          username: m.username,
          password: '', // Pas exposé
          name: m.name,
          phone: m.phone,
          email: m.email,
          createdAt: new Date(m.created_at),
          isActive: m.user_is_active,
          firstLogin: m.first_login,
          avatarUrl: m.avatar_url || undefined,
          lastLoginAt: m.last_login_at ? new Date(m.last_login_at) : undefined,
          createdBy: undefined,
        }
      }));
    } catch (error: any) {
      console.error('AuthService getAllBarMembers error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Déconnexion
   */
  static async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('auth_user');
    } catch (error) {
      console.error('Logout error:', error);
      // Toujours nettoyer localStorage même en cas d'erreur
      localStorage.removeItem('auth_user');
    }
  }

  /**
   * Récupérer l'utilisateur courant depuis localStorage
   */
  static getCurrentUser(): AuthUser | null {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return null;

    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  }

  /**
   * Vérifier si l'utilisateur est connecté
   */
  static isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }

  /**
   * Initialiser la session au démarrage de l'application
   * Vérifie la session Supabase Auth et restaure l'utilisateur
   */
  static async initializeSession(): Promise<AuthUser | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.warn('Error getting session:', error.message);
        if (error.message.includes('Invalid Refresh Token') || error.message.includes('Refresh Token Not Found')) {
          console.log('Invalid refresh token detected, signing out...');
          await supabase.auth.signOut();
          localStorage.removeItem('auth_user');
        }
        return null;
      }

      if (!session) {
        localStorage.removeItem('auth_user');
        return null;
      }
      // Vérifier si les données en localStorage sont à jour
      const storedUser = this.getCurrentUser();
      if (storedUser && storedUser.id === session.user.id) {
        return storedUser;
      }

      // Sinon, reconstruire l'AuthUser depuis la DB
      const authUser = await this.fetchUserProfileAndMembership(session.user.id);

      localStorage.setItem('auth_user', JSON.stringify(authUser));
      return authUser;
    } catch (error: any) {
      console.error('Session initialization error:', error);
      if (error?.message?.includes('Invalid Refresh Token')) {
        await supabase.auth.signOut();
        localStorage.removeItem('auth_user');
      }
      return null;
    }
  }

  /**
   * Vérifier si l'utilisateur est super_admin
   */
  static isSuperAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'super_admin';
  }

  /**
   * Vérifier si l'utilisateur est promoteur ou super_admin
   */
  static isPromoteurOrAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'super_admin' || user?.role === 'promoteur';
  }

  /**
   * Vérifier si l'utilisateur est gérant, promoteur ou super_admin
   */
  static isGerantOrAbove(): boolean {
    const user = this.getCurrentUser();
    return (
      user?.role === 'super_admin' ||
      user?.role === 'promoteur' ||
      user?.role === 'gerant'
    );
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  static async updateProfile(
    userId: string,
    updates: Omit<DbUserUpdate, 'password_hash'>
  ): Promise<Omit<DbUser, 'password_hash'>> {
    try {
      // 1. Mettre à jour public.users
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, username, email, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
        .single();

      if (error || !data) {
        console.error('Supabase update error:', error);
        throw new Error(error?.message || 'Erreur lors de la mise à jour du profil');
      }

      // 2. Mettre à jour les métadonnées auth.users (pour éviter l'écrasement par le trigger)
      // Seulement si c'est l'utilisateur courant (sécurité)
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        const { error: authError } = await supabase.auth.updateUser({
          data: {
            name: updates.name,
            phone: updates.phone,
            // username n'est pas dans updates typiquement, mais s'il y est :
            ...(updates.username ? { username: updates.username } : {})
          }
        });

        if (authError) {
          console.warn('Failed to update auth metadata:', authError);
          // On ne bloque pas, car la DB est à jour
        }

        // 3. Mettre à jour le localStorage
        const updatedAuthUser: AuthUser = {
          ...currentUser,
          ...data,
        };
        localStorage.setItem('auth_user', JSON.stringify(updatedAuthUser));
      }

      return data;
    } catch (error: any) {
      console.error('AuthService updateProfile error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Changer le mot de passe
   */
  static async changePassword(
    newPassword: string
  ): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message || 'Erreur lors du changement de mot de passe');
      }

      // Mettre à jour first_login dans la DB via RPC
      const currentUser = this.getCurrentUser();
      if (currentUser) {
        const { error: rpcError } = await supabase.rpc('complete_first_login', {
          p_user_id: currentUser.id,
        });

        if (rpcError) {
          console.warn('Failed to update first_login in DB:', rpcError);
        }

        // Mettre à jour le localStorage
        currentUser.first_login = false;
        localStorage.setItem('auth_user', JSON.stringify(currentUser));
      }
    } catch (error: any) {
      console.error('AuthService changePassword error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les membres d'un bar
   * Utilise un RPC pour contourner les RLS lors de l'impersonation
   */
  static async getBarMembers(
    barId: string,
    impersonatingUserId?: string
  ): Promise<Array<Omit<DbUser, 'password_hash'> & { role: string; joined_at: string; member_is_active: boolean }>> {
    try {
      // Use RPC with optional impersonating_user_id parameter
      const { data: membersData, error: rpcError } = await supabase
        .rpc('get_bar_members', {
          p_bar_id: barId,
          p_impersonating_user_id: impersonatingUserId || null
        });

      if (rpcError) {
        console.error('[AuthService] RPC error:', rpcError);
        throw new Error('Erreur lors de la récupération des membres');
      }

      const members = membersData as any[];

      if (!members || members.length === 0) {
        return [];
      }

      // Map RPC results to expected format
      return members.map((member: any) => ({
        id: member.user_id,
        username: member.username || null,
        email: member.user_email || '',
        name: member.user_name || '',
        phone: member.user_phone || '',
        avatar_url: null,
        is_active: true,
        first_login: member.first_login ?? false,
        created_at: member.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login_at: member.last_login_at ?? null,
        role: member.role,
        joined_at: member.joined_at || member.assigned_at,
        member_is_active: member.member_is_active ?? member.is_active,
      })) as Array<Omit<DbUser, 'password_hash'> & { role: string; joined_at: string; member_is_active: boolean }>;

    } catch (error: any) {
      console.error('AuthService getBarMembers error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Désactiver un membre d'un bar
   */
  static async deactivateMember(userId: string, barId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_members')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('bar_id', barId);

      if (error) {
        throw new Error('Erreur lors de la désactivation du membre');
      }
    } catch (error: any) {
      console.error('AuthService deactivateMember error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Activer un membre d'un bar
   */
  static async activateMember(userId: string, barId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bar_members')
        .update({ is_active: true })
        .eq('user_id', userId)
        .eq('bar_id', barId);

      if (error) {
        throw new Error('Erreur lors de l\'activation du membre');
      }
    } catch (error: any) {
      console.error('AuthService activateMember error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Mettre à jour un utilisateur (pour Super Admin)
   * Utilise une RPC avec SECURITY DEFINER pour contourner RLS
   */
  static async updateUser(
    userId: string,
    updates: {
      name?: string;
      phone?: string;
      email?: string;
      isActive?: boolean;
    }
  ): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_name: updates.name || null,
        p_phone: updates.phone || null,
        p_email: updates.email || null,
        p_is_active: updates.isActive !== undefined ? updates.isActive : null,
      });

      if (error) {
        console.error('admin_update_user RPC error:', error);
        throw new Error(error.message);
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Utilisateur non trouvé');
      }

      console.log('User updated successfully:', data);
    } catch (error: any) {
      console.error('AuthService updateUser error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Réinitialiser le mot de passe (envoyer email)
   */
  static async resetPassword(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        throw new Error(error.message || 'Erreur lors de l\'envoi de l\'email');
      }
    } catch (error: any) {
      console.error('AuthService resetPassword error:', error);
      throw new Error(handleSupabaseError(error));
    }
  }
}
