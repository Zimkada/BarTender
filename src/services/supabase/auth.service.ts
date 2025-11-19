import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type User = Database['public']['Tables']['users']['Row'];
type UserUpdate = Database['public']['Tables']['users']['Update'];

export interface AuthUser extends Omit<User, 'password_hash'> {
  role: 'super_admin' | 'promoteur' | 'gerant' | 'serveur';
  barId: string;
  barName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SignupData {
  username: string;
  password: string;
  name: string;
  phone: string;
}

/**
 * Service d'authentification custom (sans Supabase Auth)
 * Utilise username + password_hash (bcrypt) stocké dans PostgreSQL
 * Sessions gérées via localStorage + RLS avec current_setting('app.user_id')
 */
export class AuthService {
  /**
   * Définir la session utilisateur dans Supabase (pour RLS)
   * À appeler après chaque connexion ou au démarrage de l'app
   */
  private static async setUserSession(userId: string): Promise<void> {
    try {
      await supabase.rpc('set_user_session', { user_id: userId });
    } catch (error) {
      console.error('Failed to set user session:', error);
    }
  }

  /**
   * Connexion utilisateur avec username + password
   */
  static async login(credentials: LoginCredentials): Promise<AuthUser> {
    try {
      // 1. Valider le mot de passe via la fonction SQL
      const { data, error } = await supabase.rpc('validate_password', {
        p_username: credentials.username,
        p_password: credentials.password,
      }) as {
        data: Array<{
          user_id: string;
          username: string;
          name: string;
          phone: string;
          avatar_url: string | null;
          is_active: boolean;
          first_login: boolean;
        }> | null;
        error: any;
      };

      if (error || !data || data.length === 0) {
        throw new Error('Nom d\'utilisateur ou mot de passe incorrect');
      }

      const userProfile = data[0];

      // 2. Définir la session pour RLS AVANT les requêtes
      await this.setUserSession(userProfile.user_id);

      // 3. Récupérer le rôle et le bar de l'utilisateur
      const { data: membership, error: memberError } = await supabase
        .from('bar_members')
        .select(`
          role,
          bar_id,
          bars (
            name
          )
        `)
        .eq('user_id', userProfile.user_id)
        .eq('is_active', true)
        .single();

      if (memberError || !membership) {
        throw new Error('Utilisateur non assigné à un bar');
      }

      // 4. Construire l'objet AuthUser (sans password_hash)
      const authUser: AuthUser = {
        id: userProfile.user_id,
        username: userProfile.username,
        name: userProfile.name,
        phone: userProfile.phone,
        avatar_url: userProfile.avatar_url,
        is_active: userProfile.is_active,
        first_login: userProfile.first_login,
        created_at: '', // Pas retourné par validate_password
        updated_at: '',
        last_login_at: null,
        role: membership.role as AuthUser['role'],
        barId: membership.bar_id,
        barName: (membership.bars as any).name,
      };

      // 5. Stocker dans localStorage
      localStorage.setItem('auth_user', JSON.stringify(authUser));

      return authUser;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
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
  ): Promise<Omit<User, 'password_hash'>> {
    try {
      // 1. Créer l'utilisateur via la fonction SQL
      const { data: userId, error: createError } = await supabase.rpc('create_user', {
        p_username: data.username,
        p_password: data.password,
        p_name: data.name,
        p_phone: data.phone,
      });

      if (createError || !userId) {
        throw new Error('Erreur lors de la création de l\'utilisateur');
      }

      // 2. Créer l'association bar_member
      const currentUser = AuthService.getCurrentUser();
      const { error: memberError } = await supabase
        .from('bar_members')
        .insert({
          user_id: userId,
          bar_id: barId,
          role,
          assigned_by: currentUser?.id || userId,
        });

      if (memberError) {
        throw new Error('Erreur lors de l\'assignation au bar');
      }

      // 3. Récupérer le profil créé
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .select('id, username, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
        .eq('id', userId)
        .single();

      if (userError || !newUser) {
        throw new Error('Erreur lors de la récupération du profil');
      }

      return newUser;
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Déconnexion
   */
  static logout(): void {
    localStorage.removeItem('auth_user');
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
   * À appeler au démarrage pour restaurer la session RLS
   */
  static async initializeSession(): Promise<void> {
    const user = this.getCurrentUser();
    if (user) {
      await this.setUserSession(user.id);
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
    updates: Omit<UserUpdate, 'password_hash'>
  ): Promise<Omit<User, 'password_hash'>> {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select('id, username, name, phone, avatar_url, is_active, first_login, created_at, updated_at, last_login_at')
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
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Changer le mot de passe
   */
  static async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('change_password', {
        p_user_id: userId,
        p_old_password: oldPassword,
        p_new_password: newPassword,
      });

      if (error) {
        throw new Error(error.message || 'Erreur lors du changement de mot de passe');
      }

      if (!data) {
        throw new Error('Ancien mot de passe incorrect');
      }

      // Mettre à jour first_login dans le localStorage
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === userId) {
        currentUser.first_login = false;
        localStorage.setItem('auth_user', JSON.stringify(currentUser));
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les membres d'un bar
   */
  static async getBarMembers(
    barId: string
  ): Promise<Array<Omit<User, 'password_hash'> & { role: string; joined_at: string }>> {
    try {
      const { data, error } = await supabase
        .from('bar_members')
        .select(`
          role,
          joined_at,
          users!inner (
            id,
            username,
            name,
            phone,
            avatar_url,
            is_active,
            first_login,
            created_at,
            updated_at,
            last_login_at
          )
        `)
        .eq('bar_id', barId)
        .eq('is_active', true);

      if (error) {
        throw new Error('Erreur lors de la récupération des membres');
      }

      return (data || []).map((member: any) => ({
        ...member.users,
        role: member.role,
        joined_at: member.joined_at,
      }));
    } catch (error: any) {
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
      throw new Error(handleSupabaseError(error));
    }
  }
}
