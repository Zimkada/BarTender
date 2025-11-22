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
      .select('id, username, email, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profil utilisateur introuvable');
    }

    const { data: membership, error: membershipError } = await supabase
      .from('bar_members')
      .select(`
role,
  bar_id,
  bars(
    name
  )
    `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (membershipError || !membership) {
      throw new Error('Aucun rôle actif trouvé pour cet utilisateur');
    }

    const profileData = profile as any;
    const membershipData = membership as any;

    return {
      id: userId,
      email: profileData.email!,
      username: profileData.username || '',
      name: profileData.name || '',
      phone: profileData.phone || '',
      avatar_url: profileData.avatar_url,
      is_active: profileData.is_active ?? true,
      first_login: profileData.first_login ?? false,
      created_at: profileData.created_at,
      updated_at: profileData.updated_at,
      last_login_at: profileData.last_login_at,
      role: membershipData.role as AuthUser['role'],
      barId: membershipData.bar_id || '',
      barName: membershipData.bars?.name || '',
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
      // 1. Créer l'utilisateur dans auth.users
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone,
            username: data.username || data.email.split('@')[0],
          },
        },
      });

      if (authError || !authData.user) {
        throw new Error('Erreur lors de la création du compte');
      }

      // 2. Le trigger handle_new_user() crée automatiquement le profil

      // 3. Créer le membership
      const currentUser = AuthService.getCurrentUser();
      const { error: memberError } = await supabase.from('bar_members').insert({
        user_id: authData.user.id,
        bar_id: barId,
        role: role,
        assigned_by: currentUser?.id || authData.user.id,
        is_active: true,
      } as any);

      if (memberError) {
        throw new Error('Erreur lors de l\'assignation au bar');
      }

      // 4. Récupérer le profil complet
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, username, email, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Erreur lors de la récupération du profil');
      }

      return profile;
    } catch (error: any) {
      console.error('AuthService signup error:', error);
      throw new Error(handleSupabaseError(error));
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
      // 1. Créer l'utilisateur dans auth.users
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone,
            username: data.username || data.email.split('@')[0],
          },
        },
      });

      if (authError || !authData.user) {
        throw new Error('Erreur lors de la création du compte promoteur');
      }

      // 2. Récupérer le profil complet (créé par trigger)
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, username, email, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Erreur lors de la récupération du profil promoteur');
      }

      return profile as Omit<DbUser, 'password_hash'>;
    } catch (error: any) {
      console.error('AuthService createPromoter error:', error);
      throw new Error(handleSupabaseError(error));
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
      const { data: membersData, error } = await supabase
        .from('bar_members')
        .select(`
  *,
  user: users!fk_bar_members_user(
    id,
    username,
    name,
    phone,
    email,
    avatar_url,
    is_active,
    first_login,
    created_at,
    last_login_at
  )
      `);

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
          id: m.user.id,
          username: m.user.username,
          password: '', // Pas exposé
          name: m.user.name,
          phone: m.user.phone,
          email: m.user.email,
          createdAt: new Date(m.user.created_at),
          isActive: m.user.is_active,
          firstLogin: m.user.first_login,
          avatarUrl: m.user.avatar_url || undefined,
          lastLoginAt: m.user.last_login_at ? new Date(m.user.last_login_at) : undefined,
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
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, username, email, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
        .single();

      if (error || !data) {
        throw new Error('Erreur lors de la mise à jour du profil');
      }

      // Mettre à jour le localStorage si c'est l'utilisateur courant
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
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

      // Mettre à jour first_login dans le localStorage
      const currentUser = this.getCurrentUser();
      if (currentUser) {
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
   */
  static async getBarMembers(
    barId: string
  ): Promise<Array<Omit<DbUser, 'password_hash'> & { role: string; joined_at: string; member_is_active: boolean }>> {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('bar_members')
        .select('role, user_id, joined_at, is_active')
        .eq('bar_id', barId)
        .eq('is_active', true);

      if (membersError) {
        throw new Error('Erreur lors de la récupération des memberships');
      }

      const members = membersData as any[];

      if (!members || members.length === 0) {
        return [];
      }

      const userIds = members.map((m) => m.user_id);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds);

      if (usersError) {
        throw new Error('Erreur lors de la récupération des profils utilisateurs');
      }

      const userMap = new Map(users.map((u) => [u.id, u]));
      const combinedData = members.map((member) => {
        const userProfile = userMap.get(member.user_id);
        return {
          ...(userProfile || {}),
          role: member.role,
          joined_at: member.joined_at,
          member_is_active: member.is_active,
        };
      });

      return combinedData as Array<Omit<DbUser, 'password_hash'> & { role: string; joined_at: string; member_is_active: boolean }>;

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
   * Réinitialiser le mot de passe (envoyer email)
   */
  static async resetPassword(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
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
