import { supabase, handleSupabaseError } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type User = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];

export interface AuthUser extends User {
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
 * Service d'authentification utilisant Supabase
 * Remplace progressivement localStorage auth
 */
export class AuthService {
  /**
   * Connexion utilisateur
   * Vérifie username + password et retourne les infos complètes
   */
  static async login(credentials: LoginCredentials): Promise<AuthUser> {
    try {
      // 1. Récupérer l'utilisateur par username
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', credentials.username)
        .eq('is_active', true)
        .single();

      if (userError || !user) {
        throw new Error('Nom d\'utilisateur ou mot de passe incorrect');
      }

      // 2. Vérifier le mot de passe
      // TODO: Remplacer par bcrypt.compare() une fois les mots de passe hashés
      const isPasswordValid = user.password_hash === credentials.password;
      // const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Nom d\'utilisateur ou mot de passe incorrect');
      }

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
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (memberError || !membership) {
        throw new Error('Utilisateur non assigné à un bar');
      }

      // 4. Construire l'objet AuthUser
      const authUser: AuthUser = {
        ...user,
        role: membership.role,
        barId: membership.bar_id,
        barName: (membership.bars as any).name,
      };

      // 5. Stocker la session dans localStorage (temporaire)
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
  static async signup(data: SignupData, barId: string, role: 'gerant' | 'serveur'): Promise<User> {
    try {
      // 1. Vérifier que le username n'existe pas déjà
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', data.username)
        .single();

      if (existing) {
        throw new Error('Ce nom d\'utilisateur existe déjà');
      }

      // 2. Hasher le mot de passe
      // TODO: Activer bcrypt une fois la dépendance installée
      const passwordHash = data.password;
      // const passwordHash = await bcrypt.hash(data.password, 10);

      // 3. Créer l'utilisateur
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          username: data.username,
          password_hash: passwordHash,
          name: data.name,
          phone: data.phone,
          is_active: true,
          first_login: true,
        })
        .select()
        .single();

      if (userError || !newUser) {
        throw new Error('Erreur lors de la création de l\'utilisateur');
      }

      // 4. Créer l'association bar_member
      const currentUser = AuthService.getCurrentUser();
      const { error: memberError } = await supabase
        .from('bar_members')
        .insert({
          user_id: newUser.id,
          bar_id: barId,
          role,
          assigned_by: currentUser?.id || newUser.id,
        });

      if (memberError) {
        // Rollback: supprimer l'utilisateur créé
        await supabase.from('users').delete().eq('id', newUser.id);
        throw new Error('Erreur lors de l\'assignation au bar');
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
  static async updateProfile(userId: string, updates: Partial<UserInsert>): Promise<User> {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
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
  static async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      // 1. Vérifier l'ancien mot de passe
      const { data: user } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .single();

      if (!user) {
        throw new Error('Utilisateur introuvable');
      }

      // TODO: Utiliser bcrypt.compare()
      const isOldPasswordValid = user.password_hash === oldPassword;
      // const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);

      if (!isOldPasswordValid) {
        throw new Error('Ancien mot de passe incorrect');
      }

      // 2. Hasher le nouveau mot de passe
      // TODO: Utiliser bcrypt.hash()
      const newPasswordHash = newPassword;
      // const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // 3. Mettre à jour
      const { error } = await supabase
        .from('users')
        .update({
          password_hash: newPasswordHash,
          first_login: false,
        })
        .eq('id', userId);

      if (error) {
        throw new Error('Erreur lors du changement de mot de passe');
      }
    } catch (error: any) {
      throw new Error(handleSupabaseError(error));
    }
  }

  /**
   * Récupérer tous les membres d'un bar
   */
  static async getBarMembers(barId: string): Promise<Array<User & { role: string; joined_at: string }>> {
    try {
      const { data, error } = await supabase
        .from('bar_members')
        .select(`
          role,
          joined_at,
          users (*)
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
